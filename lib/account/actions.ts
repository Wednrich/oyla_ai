"use server";

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { recoveryCookie } from "@/lib/auth/paths";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { publicSupabaseConfig } from "@/lib/supabase/config";
import { verifiedUser } from "@/lib/supabase/server";
import { isLearningMode } from "@/lib/tutor/modes";

interface State { error?: string; success?: string }

function read(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function updateProfile(_: State, form: FormData): Promise<State> {
  const auth = await verifiedUser();
  if (!auth) return { error: "Sign in again to update your profile." };
  const fullName = read(form, "full_name");
  const university = read(form, "university");
  const major = read(form, "major");
  const year = read(form, "academic_year");
  const language = read(form, "preferred_language");
  if (!fullName || fullName.length > 100 || university.length > 160 || major.length > 160 ||
      (year && !/^(?:[1-9]|1[0-2])$/.test(year)) || !/^[a-z]{2,3}(-[A-Z]{2})?$/.test(language)) {
    return { error: "Check the profile fields and try again." };
  }
  const { data, error } = await auth.db.from("profiles").update({
    full_name: fullName, university: university || null, major: major || null,
    academic_year: year ? Number(year) : null, preferred_language: language,
  }).eq("id", auth.user.id).select("id").maybeSingle();
  if (error || !data) return { error: "Could not save your profile. Check the Supabase migrations." };
  revalidatePath("/", "layout");
  return { success: "Profile saved." };
}

export async function updatePreferences(_: State, form: FormData): Promise<State> {
  const auth = await verifiedUser();
  if (!auth) return { error: "Sign in again to update your preferences." };
  const mode = read(form, "learning_mode");
  if (!isLearningMode(mode)) return { error: "Choose a valid learning mode." };
  const { data, error } = await auth.db.from("user_settings").update({ preferred_learning_mode: mode })
    .eq("user_id", auth.user.id).select("id").maybeSingle();
  if (error || !data) return { error: "Could not save your preferences." };
  revalidatePath("/settings");
  revalidatePath("/tutor");
  return { success: "Preferences saved." };
}

function avatarExtension(bytes: Uint8Array, type: string) {
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 16 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (png && type === "image/png") return "png";
  if (jpeg && type === "image/jpeg") return "jpg";
  if (webp && type === "image/webp") return "webp";
  return null;
}

export async function uploadAvatar(_: State, form: FormData): Promise<State> {
  const auth = await verifiedUser();
  if (!auth) return { error: "Sign in again to upload an avatar." };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Configuration required. Set the Supabase server key to upload avatars." };
  const file = form.get("avatar");
  if (!(file instanceof File) || !file.size || file.size > 2_097_152) return { error: "Choose a JPEG, PNG, or WebP image up to 2 MB." };
  const extension = avatarExtension(new Uint8Array(await file.slice(0, 16).arrayBuffer()), file.type);
  if (!extension) return { error: "Choose a valid JPEG, PNG, or WebP image." };

  const uid = auth.user.id;
  const profile = await auth.db.from("profiles").select("avatar_url").eq("id", uid).maybeSingle();
  if (profile.error || !profile.data) return { error: "Could not load your profile." };
  const oldPath = profile.data?.avatar_url;
  const path = `${uid}/avatar.${crypto.randomUUID()}.${extension}`;
  const bucket = admin.storage.from("avatars");
  const upload = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (upload.error) return { error: "Could not upload your avatar. Try again." };

  let update = admin.from("profiles").update({ avatar_url: path }).eq("id", uid);
  update = oldPath ? update.eq("avatar_url", oldPath) : update.is("avatar_url", null);
  const saved = await update.select("id").maybeSingle();
  if (saved.error || !saved.data) {
    await bucket.remove([path]);
    return { error: "Could not save the avatar. Reload your profile and try again." };
  }
  if (typeof oldPath === "string" && oldPath.startsWith(`${uid}/avatar.`)) await bucket.remove([oldPath]);
  revalidatePath("/", "layout");
  return { success: "Avatar updated." };
}

export async function updateConsent(_: State, form: FormData): Promise<State> {
  const auth = await verifiedUser();
  if (!auth) return { error: "Sign in again to update research participation." };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Configuration required. Set the Supabase server key to manage research participation." };
  const choice = read(form, "consent");
  if (choice !== "yes" && choice !== "no") return { error: "Choose a research participation option." };
  const { error } = await admin.rpc("oyla_set_research_consent", { p_user: auth.user.id, p_enabled: choice === "yes" });
  if (error) return { error: "Could not update research participation. Try again." };
  revalidatePath("/settings");
  return { success: choice === "yes" ? "Research participation enabled." : "Consent withdrawn and linked research events removed." };
}

export async function deleteAccount(_: State, form: FormData): Promise<State> {
  const auth = await verifiedUser();
  if (!auth) return { error: "Sign in again to delete your account." };
  const admin = createAdminSupabase();
  if (!admin) return { error: "Configuration required. Set the Supabase server key to delete accounts." };
  const password = form.get("password");
  if (read(form, "confirmation") !== "DELETE" || typeof password !== "string" || !password || password.length > 128 || !auth.user.email) {
    return { error: "Enter your current password and type DELETE to confirm." };
  }

  const config = publicSupabaseConfig();
  if (!config) return { error: "Configuration required. Connect Supabase first." };
  const verifier = createClient(config.url, config.key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const verification = await verifier.auth.signInWithPassword({ email: auth.user.email, password });
  if (verification.error || verification.data.user?.id !== auth.user.id) {
    return { error: "Could not verify your current password. Try again." };
  }
  // The password check creates its own short-lived database session.
  await verifier.auth.signOut({ scope: "local" });

  const uid = auth.user.id;
  const [materials, avatars] = await Promise.all([
    auth.db.from("study_materials").select("file_path").eq("user_id", uid).limit(1000),
    admin.storage.from("avatars").list(uid, { limit: 1000 }),
  ]);
  if (materials.error || avatars.error) return { error: "Could not enumerate your files. Try again." };
  if ((materials.data?.length ?? 0) >= 1000 || (avatars.data?.length ?? 0) >= 1000) {
    return { error: "This account needs a manual file cleanup before deletion. Contact your OYLA administrator." };
  }
  const deleted = await Promise.all([
    (materials.data?.length ?? 0) > 0 ? admin.storage.from("study-materials").remove(
      (materials.data ?? []).map(({ file_path }) => file_path as string).filter((path) => path.startsWith(`${uid}/`)),
    ) : null,
    (avatars.data?.length ?? 0) > 0 ? admin.storage.from("avatars").remove(
      (avatars.data ?? []).filter(({ id, name }) => id && name.startsWith("avatar.")).map(({ name }) => `${uid}/${name}`),
    ) : null,
  ]);
  if (deleted.some((entry) => entry?.error)) return { error: "Could not remove all account files. Try again." };

  // Capture this user's token once to revoke their sessions before deleting the identity.
  const session = await auth.db.auth.getSession();
  const token = session.data.session?.access_token;
  if (!token) return { error: "Could not verify the current session. Sign in again." };
  const { error: revokeError } = await admin.auth.admin.signOut(token, "global");
  if (revokeError) return { error: "Could not revoke the account sessions. Try again." };
  const result = await admin.auth.admin.deleteUser(uid);
  if (result.error) return { error: "Could not finish deleting your account. Sign in again to retry." };
  await auth.db.auth.signOut({ scope: "local" });
  (await cookies()).delete(recoveryCookie);
  redirect("/login?status=account-deleted");
}
