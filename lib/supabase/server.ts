import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicSupabaseConfig } from "./config";

export async function createServerSupabase() {
  const config = publicSupabaseConfig();
  if (!config) return null;
  const store = await cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll(entries) {
        try {
          for (const { name, value, options } of entries) store.set(name, value, options);
        } catch {
          // Server Components read cookies. Proxy performs refresh and writes the cookies there.
        }
      },
    },
  });
}

export async function verifiedUser() {
  const db = await createServerSupabase();
  if (!db) return null;
  const { data, error } = await db.auth.getUser();
  return data.user && !error ? { db, user: data.user } : null;
}
