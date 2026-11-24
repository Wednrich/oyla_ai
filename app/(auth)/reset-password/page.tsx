import { AuthPage, type AuthSearch } from "@/components/auth/auth-page";

export const metadata = { title: "Choose a new password" };

export default function Page({ searchParams }: { searchParams: AuthSearch }) {
  return <AuthPage flow="reset-password" searchParams={searchParams} />;
}
