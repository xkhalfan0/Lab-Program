import { TRPCError } from "@trpc/server";

export function requireRole(userRole: string, allowed: string[], message = "Access denied") {
  if (!allowed.includes(userRole)) {
    throw new TRPCError({ code: "FORBIDDEN", message });
  }
}
