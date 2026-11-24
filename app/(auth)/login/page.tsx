import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";

export const metadata = { title: "Sign in" };

export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage flow="login" searchParams={searchParams} />;
}
