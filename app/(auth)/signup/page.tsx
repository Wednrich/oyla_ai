import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";

export const metadata = { title: "Create account" };

export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage flow="signup" searchParams={searchParams} />;
}
