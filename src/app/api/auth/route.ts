import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const APP_PASSWORD = process.env.APP_PASSWORD;

  if (!APP_PASSWORD) {
    return NextResponse.json({ error: 'No password configured' }, { status: 500 });
  }

  try {
    const { password } = await request.json();

    if (!password || password !== APP_PASSWORD) {
      return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
    }

    // Set auth cookie (base64 of password, httpOnly, secure in production)
    const token = Buffer.from(APP_PASSWORD).toString('base64');
    const response = NextResponse.json({ success: true });

    response.cookies.set('app_auth', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
