import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { recoveryCookie } from "@/lib/auth/paths";
import { validServiceOrigin } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  const db = await createServerSupabase();
  // The configured public origin keeps the browser on the host that set its Auth cookies.
  const origin = validServiceOrigin(process.env.OYLA_SITE_URL ?? "") ?? url.origin;
  const go = (path: string) => NextResponse.redirect(new URL(path, origin), {
    status: 303,
    headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" },
  });
  if (!db) return go("/login?status=link-error");

  let recovery = false;
  if (hash && (type === "email" || type === "signup" || type === "recovery")) {
    const result = await db.auth.verifyOtp({ token_hash: hash, type });
    if (result.error || !result.data.session) return go("/login?status=link-error");
    recovery = type === "recovery";
  } else if (code) {
    const result = await db.auth.exchangeCodeForSession(code);
    if (result.error || !result.data.session) return go("/login?status=link-error");
    // GoTrue may return its PKCE flow marker even though AuthTokenResponse omits it.
    recovery = "redirectType" in result.data && result.data.redirectType === "recovery";
  } else {
    return go("/login?status=link-error");
  }

  const store = await cookies();
  if (recovery) {
    const { data } = await db.auth.getClaims();
    const sessionId = data?.claims.session_id;
    if (typeof sessionId !== "string") return go("/login?status=link-error");
    store.set(recoveryCookie, sessionId, { path: "/", httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), maxAge: 900 });
    return go("/reset-password");
  }

  store.delete(recoveryCookie);
  return go("/dashboard");
}
