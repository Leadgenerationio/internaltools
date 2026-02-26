import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { exchangeCode } from '@/lib/google-drive';

/**
 * GET /api/integrations/google-drive/callback
 * OAuth callback — exchanges code for tokens, stores refresh token on user.
 * Renders a simple HTML page that shows "Connected!" and auto-redirects.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code');
  const stateParam = request.nextUrl.searchParams.get('state');
  const errorParam = request.nextUrl.searchParams.get('error');

  // Handle OAuth denial
  if (errorParam) {
    return renderCallbackPage(false, 'Google Drive connection was cancelled.');
  }

  if (!code || !stateParam) {
    return renderCallbackPage(false, 'Missing authorization code or state.');
  }

  let userId: string;
  try {
    const state = JSON.parse(stateParam);
    userId = state.userId;
    if (!userId) throw new Error('No userId in state');
  } catch {
    return renderCallbackPage(false, 'Invalid callback state.');
  }

  try {
    const redirectUri = process.env.GOOGLE_REDIRECT_URI
      || `${process.env.NEXTAUTH_URL}/api/integrations/google-drive/callback`;

    const { refreshToken, email } = await exchangeCode(code, redirectUri);

    // Store refresh token on the user record
    await prisma.user.update({
      where: { id: userId },
      data: {
        googleDriveRefreshToken: refreshToken,
        googleDriveConnected: true,
        googleDriveEmail: email || null,
      },
    });

    return renderCallbackPage(true, 'Google Drive connected successfully!');
  } catch (err: any) {
    console.error('Google Drive callback error:', err);
    return renderCallbackPage(false, err.message || 'Failed to connect Google Drive.');
  }
}

/**
 * Render a simple HTML callback page that shows status and auto-redirects.
 */
function renderCallbackPage(success: boolean, message: string): NextResponse {
  const bgColor = success ? '#065f46' : '#7f1d1d';
  const borderColor = success ? '#059669' : '#dc2626';
  const textColor = success ? '#6ee7b7' : '#fca5a5';
  const icon = success ? '&#10003;' : '&#10007;';
  const redirectPath = success ? '/settings' : '/settings';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google Drive ${success ? 'Connected' : 'Error'}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #030712;
      color: #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #1f2937;
      border: 1px solid ${borderColor};
      border-radius: 16px;
      padding: 48px;
      text-align: center;
      max-width: 400px;
      width: 90%;
    }
    .icon {
      width: 64px;
      height: 64px;
      border-radius: 50%;
      background: ${bgColor};
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 28px;
      color: ${textColor};
    }
    h1 { font-size: 20px; margin-bottom: 8px; color: #f9fafb; }
    p { font-size: 14px; color: #9ca3af; }
    .redirect-text { margin-top: 16px; font-size: 12px; color: #6b7280; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${icon}</div>
    <h1>${success ? 'Connected!' : 'Connection Failed'}</h1>
    <p>${message}</p>
    <p class="redirect-text">Redirecting in 2 seconds...</p>
  </div>
  <script>
    setTimeout(function() {
      if (window.opener) {
        window.opener.postMessage({ type: 'google-drive-callback', success: ${success} }, '*');
        window.close();
      } else {
        window.location.href = '${redirectPath}';
      }
    }, 2000);
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
