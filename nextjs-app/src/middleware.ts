import { createServerClient } from '@supabase/ssr'
import type { CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Refreshes the Supabase session cookie on every request and gates the signed-in area.
// Authorisation is repeated server-side in (app)/layout.tsx and in every route handler;
// this is a first line of defence and keeps tokens fresh.

const PROTECTED_PREFIXES = ['/children', '/account']
const AUTH_PAGES = ['/login', '/signup']

function matchesPrefix(pathname: string, prefixes: string[]) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone()
  const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('next', next)
  return NextResponse.redirect(url)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = matchesPrefix(pathname, PROTECTED_PREFIXES)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Without Supabase configured nobody can be signed in. Public pages (landing) still work.
  if (!supabaseUrl || !supabaseAnonKey) {
    return isProtected ? redirectToLogin(request) : NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user && isProtected) return redirectToLogin(request)

  if (user && matchesPrefix(pathname, AUTH_PAGES)) {
    const redirect = NextResponse.redirect(new URL('/children', request.url))
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/stripe/webhook|\\.netlify|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
