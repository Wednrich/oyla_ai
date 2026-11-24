"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import { recoveryCookie, safeDestination } from "./paths";

export interface AuthState {
  error?: string;
  success?: string;
}

const unavailable = { error: "Configuration required. Set the Supabase project URL and publishable key." };

function read(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

function validEmail(email: string) {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function emailCallback() {
  const canonical = process.env.OYLA_SITE_URL || (await headers()).get("origin");
  if (!canonical) return undefined;
  try {
    const url = new URL("/auth/callback", canonical);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = read(form, "email").trim();
  const password = read(form, "password");
  if (!validEmail(email) || !password || password.length > 128) return { error: "Enter a valid email and password." };
  const db = await createServerSupabase();
  if (!db) return unavailable;
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) return { error: error.code === "email_not_confirmed" ? "Verify your email before signing in." : "Could not sign in. Check your email and password and try again." };
  (await cookies()).delete(recoveryCookie);
  redirect(safeDestination(form.get("next")));
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const fullName = read(form, "name").trim();
  const email = read(form, "email").trim();
  const password = read(form, "password");
  if (!validEmail(email) || !fullName || fullName.length > 100) return { error: "Enter a valid name and email address." };
  if (password.length < 12 || password.length > 128) return { error: "Use a password with 12–128 characters." };
  const db = await createServerSupabase();
  if (!db) return unavailable;
  const { error } = await db.auth.signUp({
    email, password, options: { data: { full_name: fullName }, emailRedirectTo: await emailCallback() },
  });
  if (error && error.code !== "user_already_exists") return { error: "Could not create the account. Check the details and try again." };
  return { success: "Check your email for a verification link, then sign in." };
}

export async function forgotPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const email = read(form, "email").trim();
  if (!validEmail(email)) return { error: "Enter a valid email address." };
  const db = await createServerSupabase();
  if (!db) return unavailable;
  await db.auth.resetPasswordForEmail(email, { redirectTo: await emailCallback() });
  return { success: "If an account exists, you’ll receive an email with a password reset link." };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = read(form, "password");
  if (password.length < 12 || password.length > 128) return { error: "Use a password with 12–128 characters." };
  if (password !== read(form, "confirm")) return { error: "The passwords must match." };

  const db = await createServerSupabase();
  if (!db) return unavailable;
  const store = await cookies();
  const { data } = await db.auth.getClaims();
  const recoverySession = store.get(recoveryCookie)?.value;
  if (!recoverySession || data?.claims.session_id !== recoverySession) return { error: "Request a fresh password reset link and open it in this browser." };

  const { error } = await db.auth.updateUser({ password });
  if (error) return { error: "Could not update your password. Request a new reset link or try a different password." };
  store.delete(recoveryCookie);
  const signedOut = await db.auth.signOut({ scope: "global" });
  if (signedOut.error) return { success: "Password updated. Use Log out from your account to end this browser session." };
  redirect("/login?status=password-updated");
}

export async function signOut(): Promise<AuthState> {
  const db = await createServerSupabase();
  const { error } = db ? await db.auth.signOut({ scope: "local" }) : { error: null };
  if (error) return { error: "Could not sign out. Please try again." };
  (await cookies()).delete(recoveryCookie);
  redirect("/login");
}
