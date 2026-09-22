export type RuntimeRole = "all" | "api" | "domain" | "images" | "mqtt";
export function runs(role: Exclude<RuntimeRole, "all">): boolean {
  const configured = process.env.BACKEND_ROLE ?? "all";
  return configured === "all" || configured === role;
}
