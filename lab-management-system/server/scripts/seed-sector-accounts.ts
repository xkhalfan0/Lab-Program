/**
 * Ensures sector portal tables exist and seeds sector_1..sector_5 logins.
 * Default password for all: 123123 (username: sector1 .. sector5)
 *
 * Run: pnpm db:seed:sectors
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { sectorAccounts } from "../../drizzle/schema";
import { getDb } from "../db";

const PASSWORD = "123123";

const ACCOUNTS = [
  { sectorKey: "sector_1", nameAr: "قطاع الطرق والجسور", nameEn: "Roads & Bridges Sector", username: "sector1" },
  { sectorKey: "sector_2", nameAr: "قطاع المباني الحكومية", nameEn: "Government Buildings Sector", username: "sector2" },
  { sectorKey: "sector_3", nameAr: "قطاع البنية التحتية", nameEn: "Infrastructure Sector", username: "sector3" },
  { sectorKey: "sector_4", nameAr: "قطاع المشاريع الصناعية", nameEn: "Industrial Projects Sector", username: "sector4" },
  { sectorKey: "sector_5", nameAr: "قطاع الإسكان والتطوير", nameEn: "Housing & Development Sector", username: "sector5" },
] as const;

async function ensureTables(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS sector_accounts (
      id int AUTO_INCREMENT NOT NULL,
      sectorKey enum('sector_1','sector_2','sector_3','sector_4','sector_5') NOT NULL,
      nameAr varchar(128) NOT NULL,
      nameEn varchar(128) NOT NULL,
      username varchar(64) NOT NULL,
      passwordHash varchar(256) NOT NULL,
      isActive boolean NOT NULL DEFAULT true,
      lastLoginAt timestamp NULL,
      createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT sector_accounts_id PRIMARY KEY(id),
      CONSTRAINT sector_accounts_sectorKey_unique UNIQUE(sectorKey),
      CONSTRAINT sector_accounts_username_unique UNIQUE(username)
    )
  `));

  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS sector_report_reads (
      id int AUTO_INCREMENT NOT NULL,
      sectorKey enum('sector_1','sector_2','sector_3','sector_4','sector_5') NOT NULL,
      reportType enum('test_result','clearance') NOT NULL,
      reportId int NOT NULL,
      readAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT sector_report_reads_id PRIMARY KEY(id)
    )
  `));
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set or database connection failed.");
    process.exit(1);
  }

  await ensureTables(db);
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  for (const acc of ACCOUNTS) {
    const existing = await db
      .select({ id: sectorAccounts.id })
      .from(sectorAccounts)
      .where(eq(sectorAccounts.sectorKey, acc.sectorKey))
      .limit(1);

    if (existing[0]) {
      await db
        .update(sectorAccounts)
        .set({
          username: acc.username,
          nameAr: acc.nameAr,
          nameEn: acc.nameEn,
          passwordHash,
          isActive: true,
        })
        .where(eq(sectorAccounts.sectorKey, acc.sectorKey));
      console.log(`Updated ${acc.username} (${acc.sectorKey})`);
    } else {
      await db.insert(sectorAccounts).values({
        sectorKey: acc.sectorKey,
        nameAr: acc.nameAr,
        nameEn: acc.nameEn,
        username: acc.username,
        passwordHash,
        isActive: true,
      });
      console.log(`Created ${acc.username} (${acc.sectorKey})`);
    }
  }

  console.log(`\nSector portal ready. Log in at /sector/login`);
  console.log(`Usernames: sector1 … sector5 | Password: ${PASSWORD}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
