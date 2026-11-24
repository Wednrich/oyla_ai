import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { accountData } from "@/lib/account/profile";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const account = await accountData();
  if (!account) redirect("/login");
  return <AppShell identity={account.identity}>{children}</AppShell>;
}
