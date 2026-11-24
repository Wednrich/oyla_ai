export function jwtRole(key: string) {
  try {
    const claims = key.split(".")[1];
    if (!claims) return null;
    const base64 = claims.replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(base64)) as { role?: unknown }).role;
  } catch {
    return null;
  }
}

export function validServiceOrigin(value: string) {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) return null;
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function publicSupabaseConfig() {
  const url = validServiceOrigin(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";
  const validKey = /^sb_publishable_[\w-]+$/.test(key) || jwtRole(key) === "anon";
  return url && validKey ? { url, key } : null;
}
