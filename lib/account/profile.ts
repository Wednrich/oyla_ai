import "server-only";

import { cache } from "react";
import { verifiedUser } from "@/lib/supabase/server";

export const accountData = cache(async () => {
  const auth = await verifiedUser();
  if (!auth) return null;
  const { db, user } = auth;
  const [profile, settings, consent] = await Promise.all([
    db.from("profiles").select("full_name,avatar_url,university,major,academic_year,preferred_language").eq("id", user.id).maybeSingle(),
    db.from("user_settings").select("preferred_learning_mode").eq("user_id", user.id).maybeSingle(),
    db.from("research_consents").select("participant_id,policy_version").eq("user_id", user.id).maybeSingle(),
  ]);

  const avatar = profile.data?.avatar_url;
  const ownAvatar = typeof avatar === "string" && avatar.startsWith(`${user.id}/avatar.`);
  const signer = ownAvatar ? await db.storage.from("avatars").createSignedUrl(avatar, 300) : null;
  const name = (profile.data?.full_name as string | undefined)?.trim() || "Student";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => [...part][0]?.toUpperCase()).join("") || "S";
  return {
    auth,
    profile: profile.data,
    settings: settings.data,
    consent: consent.data,
    loadError: Boolean(profile.error || settings.error || consent.error || !profile.data || !settings.data),
    identity: { name, initials, avatar: signer?.data?.signedUrl ?? null },
  };
});
