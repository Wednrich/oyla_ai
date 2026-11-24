import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm, type AuthFlow } from "@/components/auth/auth-form";
import { Brand } from "@/components/sidebar";
import { recoveryCookie, safeDestination } from "@/lib/auth/paths";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";

const copy = {
  login: ["Sign in to OYLA", "Continue learning where you left off."],
  signup: ["Create your account", "Start learning with OYLA."],
  "forgot-password": ["Reset your password", "We’ll send a password reset link to your email."],
  "reset-password": ["Choose a new password", "Use at least 12 characters for your new password."],
} satisfies Record<AuthFlow, [string, string]>;

export type AuthSearch = Promise<{ next?: string; status?: string }>;

export async function AuthPage({ flow, searchParams }: { flow: AuthFlow; searchParams: AuthSearch }) {
  const { next, status } = await searchParams;
  const destination = safeDestination(next);
  const [title, description] = copy[flow];
  const configured = Boolean(publicSupabaseConfig());
  const db = await createServerSupabase();
  const auth = await db?.auth.getClaims();
  const marker = (await cookies()).get(recoveryCookie)?.value;
  const recovery = Boolean(marker && auth?.data?.claims.session_id === marker);

  if (flow !== "reset-password" && auth?.data?.claims.sub && status !== "link-error") {
    redirect(recovery ? "/reset-password" : destination);
  }

  return (
    <main className="auth-page">
      <section className="surface auth-card" aria-labelledby="auth-title">
        <Link href="/login" className="brand-link"><Brand /></Link>
        <h1 id="auth-title">{title}</h1>
        <p>{description}</p>
        {!configured && <p role="status" className="auth-feedback">Configuration required. Connect your Supabase project to enable sign-in.</p>}
        {status === "link-error" && <p role="alert" className="auth-feedback">This link is invalid or has expired. Request a new link and try again.</p>}
        {status === "password-updated" && <p role="status" className="auth-feedback">Password updated. Sign in with your new password.</p>}
        {status === "account-deleted" && <p role="status" className="auth-feedback">Your OYLA account was deleted.</p>}
        <AuthForm flow={flow} next={destination} configured={configured} recovery={recovery} />
        {flow === "login" ? <p className="auth-footer">New to OYLA? <Link href="/signup">Create an account</Link></p>
          : <p className="auth-footer"><Link href="/login">Back to sign in</Link></p>}
      </section>
    </main>
  );
}
