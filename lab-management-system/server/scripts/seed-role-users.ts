/**
 * Creates one local-login user per app role (short username, password: 123123).
 * Omits role "user" — that value is reserved for UI dropdown placeholders before picking a real user.
 * Skips any username that already exists.
 *
 * Run: pnpm db:seed:users
 * Requires DATABASE_URL in .env
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { users } from "../../drizzle/schema";
import { createInternalUser, getDb, getUserByUsername } from "../db";

type Role = (typeof users.$inferSelect)["role"];

const PASSWORD = "123123";

const SEED_USERS: Array<{ username: string; role: Role; name: string; specialty?: string }> = [
  { username: "adm", role: "admin", name: "Admin" },
  { username: "rec", role: "reception", name: "Reception" },
  { username: "lbm", role: "lab_manager", name: "Lab Manager" },
  { username: "tec", role: "technician", name: "Technician", specialty: "general" },
  { username: "smg", role: "sample_manager", name: "Sample Manager" },
  { username: "qci", role: "qc_inspector", name: "QC Inspector" },
  { username: "acc", role: "accountant", name: "Accountant" },
];

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set or database connection failed.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const u of SEED_USERS) {
    const existing = await getUserByUsername(u.username);
    if (existing) {
      console.log(`Skip ${u.username} (${u.role}) — already exists`);
      continue;
    }
    await createInternalUser({
      name: u.name,
      username: u.username,
      passwordHash,
      role: u.role,
      specialty: u.specialty,
    });
    console.log(`Created ${u.username} / ${PASSWORD} — ${u.role}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
