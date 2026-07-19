// middleware.js
import { NextResponse } from 'next/server';

const ADMIN_PREFIX = '/admin-x0k8p9x1'; 
const GATE_SECRET = process.env.ADMIN_GATE_SECRET;
const GATE_COOKIE = 'fritok_admin_gate';

export function middleware(request) {
  const { pathname, searchParams } = request.nextUrl;

  if (!pathname.startsWith(ADMIN_PREFIX)) {
    return NextResponse.next();
  }

  if (pathname === `${ADMIN_PREFIX}/enter`) {
    if (searchParams.get('key') !== GATE_SECRET) {
      return new NextResponse('Not found', { status: 404 });
    }
    const res = NextResponse.redirect(new URL(`${ADMIN_PREFIX}/login`, request.url));
    res.cookies.set(GATE_COOKIE, GATE_SECRET, {
      httpOnly: true, secure: true, sameSite: 'strict', maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }

  const cookie = request.cookies.get(GATE_COOKIE)?.value;
  if (cookie !== GATE_SECRET) {
    return new NextResponse('Not found', { status: 404 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin-x0k8p9x1/:path*'],
};