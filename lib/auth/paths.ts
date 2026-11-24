const protectedPages = new Set([
  "dashboard", "tutor", "practice", "assessment", "materials", "research-lab", "analytics", "history", "settings",
]);

export function safeDestination(value: unknown) {
  if (typeof value !== "string" || !/^\/[a-z-]+(?:\?[^#]*)?$/.test(value)) return "/dashboard";
  return protectedPages.has(value.slice(1).split("?")[0]) ? value : "/dashboard";
}

export const recoveryCookie = "oyla-recovery";
