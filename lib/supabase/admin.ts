import "server-only";

import { createClient } from "@supabase/supabase-js";
import { jwtRole, publicSupabaseConfig } from "./config";

export function createAdminSupabase() {
  const config = publicSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY?.trim() ?? "";
  const validSecret = /^sb_secret_[\w-]+$/.test(secret) || jwtRole(secret) === "service_role";
  if (!config || !validSecret) return null;
  return createClient(config.url, secret, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
