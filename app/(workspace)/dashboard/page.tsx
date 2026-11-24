import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Dashboard } from "@/components/dashboard/dashboard";
import { accountData } from "@/lib/account/profile";
import type { DashboardSummary } from "@/lib/dashboard";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  const account = await accountData();
  if (!account) redirect("/login?next=/dashboard");
  const { data, error } = await account.auth.db.rpc("oyla_dashboard");
  return <Dashboard name={account.identity.name} summary={error ? null : data as DashboardSummary | null} />;
}
