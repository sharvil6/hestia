// Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same runtime, same matcher
// shape — see frontend/node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const SESSION_COOKIE = 'hestia_session'

// Anything matched here that lacks the session cookie redirects to /login.
// We list public paths explicitly and treat everything else as protected.
// This is an optimistic check (per Next 16 guidance): real auth still happens
// on the backend for each API call, so a fake cookie can't bypass anything.
const PUBLIC_PATHS = [
  '/login',
  '/enroll',  // /enroll/[code]
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  if (isPublic(pathname)) return NextResponse.next()
  if (request.cookies.get(SESSION_COOKIE)) return NextResponse.next()

  const loginUrl = new URL('/login', request.url)
  if (pathname && pathname !== '/') {
    loginUrl.searchParams.set('next', pathname + search)
  }
  return NextResponse.redirect(loginUrl)
}

export const config = {
  // Skip Next internals + common static assets. The negative lookahead keeps
  // this list short.
  matcher: ['/((?!_next/|favicon.ico|images/|.*\\..*).*)'],
}
