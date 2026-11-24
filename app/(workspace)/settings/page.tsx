import { redirect } from "next/navigation";
import { SettingsForms } from "@/components/account/settings-forms";
import { accountData } from "@/lib/account/profile";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { isLearningMode } from "@/lib/tutor/modes";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const account = await accountData();
  if (!account) redirect("/login?next=/settings");
  const { profile, settings, consent, loadError } = account;
  const mode = settings?.preferred_learning_mode;

  return (
    <div className="dashboard">
      <div className="dashboard-intro"><p className="eyebrow purple-text">LEARNING WORKSPACE</p><h1>Settings</h1><p>Manage your profile, tutor preferences, and participation.</p></div>
      {loadError || !profile
        ? <p className="auth-feedback" role="alert">Could not load your profile. Check the Supabase migrations and reload.</p>
        : <SettingsForms profile={profile} preferredMode={isLearningMode(mode) ? mode : "guided"}
            participant={typeof consent?.participant_id === "string" ? consent.participant_id : undefined}
            guidedConsent={consent?.policy_version === "2026-11-v2"} privileged={Boolean(createAdminSupabase())} />}
    </div>
  );
}
