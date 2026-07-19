import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_CHECK_TIMEOUT_MS = 5000;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const path = request.nextUrl.pathname;
  const isAuthPage = path === "/login" || path === "/signup";
  const isProtected =
    path.startsWith("/clips") ||
    path.startsWith("/settings") ||
    path === "/";

  // Next.js fires background RSC prefetch requests (the `?_rsc=...` calls)
  // for every visible/hovered link - these don't render anything the user
  // can see, so there's no need to hit Supabase for them. Skipping this
  // alone removes most of the request volume that was reaching Supabase's
  // auth endpoint; the real navigation request still enforces auth below.
  if (request.headers.get("next-router-prefetch")) {
    return supabaseResponse;
  }

  // Nothing on this path needs an auth check.
  if (!isProtected && !isAuthPage) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let user: { id: string } | null = null;
  try {
    // Supabase's client has no built-in fetch timeout, so a slow/unreachable
    // project would otherwise hang this middleware until Vercel's function
    // timeout kills it (that's what produces a 504 Gateway Timeout instead
    // of a normal redirect). Racing it against a timeout turns that into a
    // fast, predictable fallback.
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Supabase auth check timed out")),
          AUTH_CHECK_TIMEOUT_MS,
        ),
      ),
    ]);
    user = result.data.user;
  } catch {
    // Fail closed on protected pages (send to login) instead of hanging;
    // fail open on auth pages (just show the login/signup form).
    if (isProtected && !isAuthPage) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  if (!user && isProtected && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/clips";
    return NextResponse.redirect(url);
  }

  if (user && path === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/clips";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
