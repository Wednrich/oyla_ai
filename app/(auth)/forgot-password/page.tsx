import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";

export const metadata = { title: "Reset password" };

export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage flow="forgot-password" searchParams={searchParams} />;
}
