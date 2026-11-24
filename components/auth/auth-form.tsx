"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword, resetPassword, signIn, signUp } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

const actions = { login: signIn, signup: signUp, "forgot-password": forgotPassword, "reset-password": resetPassword };
export type AuthFlow = keyof typeof actions;

export function AuthForm({ flow, next, configured, recovery }: {
  flow: AuthFlow; next: string; configured: boolean; recovery: boolean;
}) {
  const [state, action, pending] = useActionState(actions[flow], {});
  const creating = flow === "signup";
  const resetting = flow === "reset-password";
  const loggingIn = flow === "login";

  if (resetting && !recovery) {
    return <p className="auth-feedback">Open the link in your reset email, or <Link href="/forgot-password">request a new link</Link>.</p>;
  }

  return (
    <form action={action} className="account-form">
      <input type="hidden" name="next" value={next} />
      {creating && <label>Full name<input name="name" autoComplete="name" maxLength={100} required /></label>}
      {!resetting && <label>Email address<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
      {flow !== "forgot-password" && <label>{resetting ? "New password" : "Password"}<input name="password" type="password" autoComplete={loggingIn ? "current-password" : "new-password"} minLength={loggingIn ? undefined : 12} maxLength={128} required /></label>}
      {resetting && <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength={12} maxLength={128} required /></label>}
      {creating && <p className="account-hint">Use at least 12 characters.</p>}
      {loggingIn && <Link className="auth-forgot" href="/forgot-password">Forgot password?</Link>}
      {state.error && <p className="auth-feedback" role="alert">{state.error}</p>}
      {state.success && <p className="auth-feedback" role="status">{state.success}</p>}
      <Button type="submit" disabled={pending || !configured}>
        {pending ? "Please wait…" : loggingIn ? "Sign in" : creating ? "Create account" : resetting ? "Update password" : "Send reset link"}
      </Button>
    </form>
  );
}
