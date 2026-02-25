import { NextRequest, NextResponse } from 'next/server';

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Different limits for different route categories
const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/generate-ads': { maxRequests: 5, windowMs: 60_000 },      // 5/min (costs money)
  '/api/generate-video': { maxRequests: 3, windowMs: 60_000 },    // 3/min (costs money)
  '/api/render': { maxRequests: 10, windowMs: 60_000 },           // 10/min (CPU-intensive)
  '/api/upload': { maxRequests: 20, windowMs: 60_000 },           // 20/min
  '/api/upload-music': { maxRequests: 20, windowMs: 60_000 },     // 20/min
  '/api/log': { maxRequests: 60, windowMs: 60_000 },              // 60/min (client logging)
  '/api/logs': { maxRequests: 30, windowMs: 60_000 },             // 30/min (log viewing)
};

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
}

function checkRateLimit(ip: string, routeKey: string): { allowed: boolean; retryAfterMs: number } {
  const limit = RATE_LIMITS[routeKey];
  if (!limit) return { allowed: true, retryAfterMs: 0 };

  const key = `${ip}:${routeKey}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + limit.windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (entry.count >= limit.maxRequests) {
    return { allowed: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, retryAfterMs: 0 };
}

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  });
}, 5 * 60_000);

// ─── Security Headers ───────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-XSS-Protection': '1; mode=block',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",   // Next.js requires unsafe-eval in dev
    "style-src 'self' 'unsafe-inline'",                   // Tailwind uses inline styles
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ─── CORS ───────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// ─── Middleware ─────────────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only process API routes and page requests
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // ── Rate limiting for API routes ──
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(request);

    // Find matching rate limit key
    const routeKey = Object.keys(RATE_LIMITS).find((key) => pathname.startsWith(key));
    if (routeKey) {
      const { allowed, retryAfterMs } = checkRateLimit(ip, routeKey);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait before trying again.' },
          {
            status: 429,
            headers: {
              'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
            },
          }
        );
      }
    }

    // ── CORS for API routes ──
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
  }

  // ── Apply security headers to all responses ──
  const response = NextResponse.next();

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }

  // CORS header on API responses
  if (pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }

  return response;
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
