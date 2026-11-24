import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeDestination } from "@/lib/auth/paths";
import { publicSupabaseConfig, validServiceOrigin } from "@/lib/supabase/config";

export async function proxy(request: NextRequest) {
  const config = publicSupabaseConfig();
  let response = NextResponse.next({ request });
  let signedIn = false;
  if (config) {
    const db = createServerClient(config.url, config.key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(entries, headers) {
          for (const { name, value } of entries) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of entries) response.cookies.set(name, value, options);
          for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
        },
      },
    });
    const { data } = await db.auth.getClaims();
    signedIn = Boolean(data?.claims.sub);
  }

  const path = request.nextUrl.pathname;
  const isPublic = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(path);
  if (!isPublic && !signedIn) {
    const origin = validServiceOrigin(process.env.OYLA_SITE_URL ?? "") ?? request.nextUrl.origin;
    const url = new URL("/login", origin);
    url.searchParams.set("next", safeDestination(path + request.nextUrl.search));
    const redirect = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/dashboard", "/tutor", "/practice", "/assessment", "/materials", "/research-lab", "/analytics", "/history", "/settings", "/login", "/signup", "/forgot-password", "/reset-password"],
};
