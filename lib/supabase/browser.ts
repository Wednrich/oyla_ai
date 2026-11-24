"use client";

import { createBrowserClient } from "@supabase/ssr";
import { publicSupabaseConfig } from "./config";

export function createBrowserSupabase() {
  const config = publicSupabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  return createBrowserClient(config.url, config.key);
}
