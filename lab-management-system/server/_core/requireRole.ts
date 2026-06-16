import { TRPCError } from "@trpc/server";

/** Legacy DB rows may still have sample_manager; treat as lab_manager (Supervisor). */
export function effectiveUserRole(userRole: string): string {
  return userRole === "sample_manager" ? "lab_manager" : userRole;
}

export function requireRole(userRole: string, allowed: string[], message = "Access denied") {
  if (!allowed.includes(effectiveUserRole(userRole))) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}
