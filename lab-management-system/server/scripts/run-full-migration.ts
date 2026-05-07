import { execSync } from "child_process";

console.log("[migration] Starting full migration...");

try {
  console.log("[migration] Step 1: Clean orphans");
  execSync("tsx server/scripts/clean-orphan-data.ts", { stdio: "inherit" });

  console.log("[migration] Step 2: Check integrity");
  execSync("tsx server/scripts/check-integrity.ts", { stdio: "inherit" });

  console.log("[migration] Step 3: Add foreign keys");
  execSync("tsx server/scripts/add-foreign-keys.ts", { stdio: "inherit" });

  console.log("[migration] Step 4: Add soft delete");
  execSync("tsx server/scripts/add-soft-delete-columns.ts", { stdio: "inherit" });

  console.log("[migration] Step 5: Seed users");
  execSync("tsx server/scripts/seed-role-users.ts", { stdio: "inherit" });

  console.log("[migration] ✅ All steps complete!");
  process.exit(0);
} catch (error) {
  console.error("[migration] ❌ Failed:", error);
  process.exit(1);
}
