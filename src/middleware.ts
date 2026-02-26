import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';

// NextAuth v5 uses AUTH_SECRET, but also supports NEXTAUTH_SECRET for backwards compat.
// Pass explicitly to guarantee middleware can decode the JWT.
const SECRET = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { maxRequests: number; windowMs: number }> = {
  '/api/generate-ads': { maxRequests: 5, windowMs: 60_000 },
  '/api/generate-video': { maxRequests: 3, windowMs: 60_000 },
  '/api/render': { maxRequests: 10, windowMs: 60_000 },
  '/api/upload': { maxRequests: 20, windowMs: 60_000 },
  '/api/upload-music': { maxRequests: 20, windowMs: 60_000 },
  '/api/log': { maxRequests: 60, windowMs: 60_000 },
  '/api/logs': { maxRequests: 30, windowMs: 60_000 },
};

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1';
}

function checkRateLimit(key: string, routeKey: string): { allowed: boolean; retryAfterMs: number } {
  const limit = RATE_LIMITS[routeKey];
  if (!limit) return { allowed: true, retryAfterMs: 0 };

  const fullKey = `${key}:${routeKey}`;
  const now = Date.now();
  const entry = rateLimitStore.get(fullKey);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(fullKey, { count: 1, resetAt: now + limit.windowMs });
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
    "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ─── CORS ───────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';

// ─── Public Routes (no auth required) ───────────────────────────────────────

const PUBLIC_ROUTES = ['/login', '/register', '/welcome', '/reset-password', '/api/auth', '/api/health'];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname.startsWith(route));
}

// ─── Middleware ─────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  // ── Auth: redirect unauthenticated users to /welcome ──
  if (!isPublicRoute(pathname)) {
    // secureCookie: true ensures getToken reads the __Secure- prefixed cookie
    // (required when behind a reverse proxy like Railway that terminates TLS)
    const token = await getToken({ req: request, secret: SECRET, secureCookie: true });
    if (!token) {
      const welcomeUrl = new URL('/welcome', request.url);
      return NextResponse.redirect(welcomeUrl);
    }
  }

  // ── Rate limiting for API routes ──
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/auth')) {
    // Use userId from token if available, fall back to IP
    const token = await getToken({ req: request, secret: SECRET, secureCookie: true });
    const rateLimitKey = token?.sub || getClientIp(request);

    const routeKey = Object.keys(RATE_LIMITS).find((key) => pathname.startsWith(key));
    if (routeKey) {
      const { allowed, retryAfterMs } = checkRateLimit(rateLimitKey, routeKey);
      if (!allowed) {
        return NextResponse.json(
          { error: 'Too many requests. Please wait before trying again.' },
          {
            status: 429,
            headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
          }
        );
      }
    }

    // CORS preflight
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

  if (pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  }

  return response;
}

export const config = {
  matcher: [
    // Exclude static assets and runtime file directories from middleware
    '/((?!_next/static|_next/image|favicon.ico|uploads|outputs|music).*)',
  ],
};
