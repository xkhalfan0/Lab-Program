# Diagnosis: Reception “New order” / `samples` insert 500

This document explains what the error **actually** is, what the screenshot **does not** prove, and how to verify each layer (client → API → server build → Drizzle → MySQL → data).

---

## 1. Where the message comes from

The text `Failed query: …` / `params: …` is **not** raw MySQL text from the wire. It is thrown by **Drizzle ORM** as `DrizzleQueryError` (`node_modules/drizzle-orm/errors.js`):

```text
Failed query: ${query}
params: ${params}
```

So you are seeing Drizzle’s **serialized** representation of the query it tried to run (plus bound parameters), followed by the **underlying** MySQL error in `error.cause` (often only visible in server logs).

---

## 2. Single quotes around `'samples'`, `'id'`, … — are they the bug?

**Usually no.** For this project:

- The server uses **`drizzle-orm/mysql2`** and the MySQL dialect’s `escapeName` wraps identifiers in **backticks** (`` `samples` ``, `` `sampleCode` ``), not single quotes.
- **Single quotes in SQL are for string literals** (e.g. `'CON-SEED-…'`). Drizzle’s `escapeString` uses single quotes for **values** when inlining or when serializing params for the error string.

So the UI/console line that looks like:

`insert into 'samples' ('id', 'sampleCode', …)`

can be **misleading**: it mixes identifier serialization style with how MySQL would reject bad SQL. **Do not “fix” this by rewriting that string in application code** — there is no hand-written `INSERT` in the reception path.

**Action:** On Railway (or locally with prod `DATABASE_URL`), check **server stdout / logs** for the same request and read **`error.cause.message`** (MySQL errno + SQLSTATE). That is the real failure reason.

---

## 3. What the *shape* of the failing INSERT tells you

If the logged query lists **every** column on `samples`, including:

`deletedAt`, `deletedBy`, `deletionReason`, `deletionCategory`, `createdAt`, `updatedAt`

with many `default` / placeholders, that usually means **one of**:

| Situation | Meaning |
|-----------|--------|
| **A. Old server bundle** | Code path still did a wide `insert(samples).values(...)` aligned to the full table shape (easy to get **column count vs `?` count** wrong after migrations). |
| **B. Schema vs DB mismatch** | DB is missing a column the ORM expects (or extra NOT NULL without default). |
| **C. Bad row data** | e.g. `sampleCode` too long, invalid enum, FK violation — MySQL fails after the statement is prepared. |

In **current** `lab-management-system` (after the fix), `createSample` in `server/db.ts` inserts an **explicit subset** of columns only (no soft-delete fields), which avoids the classic Drizzle “full row + default” mismatch.

**Action:** Confirm the **deployed** Railway image/commit matches the repo that contains that `createSample` implementation. If production still shows the “full column list” insert in the error, the server is almost certainly **not** running that build.

---

## 4. Reception → server path (no `server/routers/orders.ts` mystery)

- **Client:** `client/src/pages/Reception.tsx` uses `trpc.orders.create` (batched HTTP may show `orders.createBatch` in the URL — both hit the same reception handler in `server/routers/orders.ts` + `orders.create` / `createBatch` in `server/routers.ts`).
- **Sample insert:** Only **`createSample`** in `server/db.ts` performs `db.insert(samples)` (plus scripts like `seedDemo.ts` — not used in Reception).

There is **no** raw string-built `INSERT INTO samples` in the reception flow.

---

## 5. Weird `sampleCode` (e.g. `LAB-2025-11111111.4`)

That pattern usually means **bad historical rows** broke “max suffix + 1” logic in the past, or manual/seed data. The repo’s `generateSampleCode()` now restricts `MAX` to codes matching `^LAB-{year}-[0-9]{1,8}$` so one malformed row cannot blow the next code.

**Action (DB hygiene):**

```sql
-- Rows that do NOT look like LAB-YYYY-NNNN… (adjust year)
SELECT id, sampleCode
FROM samples
WHERE sampleCode NOT REGEXP '^LAB-20[0-9]{2}-[0-9]{1,8}$'
LIMIT 50;
```

Fix or archive bad rows so new codes stay within `VARCHAR(32)` and the generator stays stable.

---

## 6. End-to-end checklist (do in order)

1. **Railway → Deployment**  
   - Note the **commit SHA** / build time of the running service.  
   - Compare to Git `main` (or your release branch) and confirm it includes the current `createSample` + `generateSampleCode` + `orders` reception module.

2. **Server logs**  
   - Reproduce once, then copy the **full** stack and **`cause`** from the Drizzle / mysql2 error (errno, e.g. `1062`, `1364`, `1265`).

3. **MySQL schema**  
   - `DESCRIBE samples;`  
   - Confirm nullable/default for new columns matches `drizzle/schema.ts` (especially after soft-delete migrations).

4. **Data**  
   - Run the `REGEXP` query above; fix outliers.  
   - Check for duplicate `sampleCode` if you see errno **1062**.

5. **Local reproduction**  
   - Point a **local** server at a **copy** of prod DB (read-only clone is enough for SELECT checks).  
   - Run the same mutation with the same payload.

6. **Client**  
   - Hard refresh / clear SW cache so you are not staring at an old **static** `index-*.js` while the server is already fixed (less common for API errors, but worth one try).

---

## 7. Quick reference: files involved

| Layer | File |
|------|------|
| Route / UI | `client/src/pages/Reception.tsx` |
| tRPC | `server/routers.ts` (`orders.create`, `orders.createBatch`) |
| Reception handler | `server/routers/orders.ts` → `runLabOrderReceptionCreate` |
| INSERT | `server/db.ts` → `createSample` |
| Schema | `drizzle/schema.ts` → `samples` |
| Error type | `node_modules/drizzle-orm/errors.js` → `DrizzleQueryError` |

---

## 8. Summary

| Question | Answer |
|----------|--------|
| Is the bug “single quotes instead of backticks” in hand-written SQL? | **No** — reception uses Drizzle; MySQL identifiers are escaped with **backticks** in the dialect. |
| Why does the error *look* like that? | Drizzle’s **`Failed query:`** string is a **debug serialization**, not necessarily byte-identical to what mysql2 sends; focus on **MySQL `cause`** and **errno**. |
| Why full column list + `default`? | Typical of an **older insert shape** or full-table `values` — verify **deployed server code**. |
| Why weird `LAB-2025-…` codes? | **Data + old MAX logic**; clean bad rows; deploy fixed `generateSampleCode`. |

When you have **one** failing response’s **MySQL errno + message** from server logs, you can map it to a single concrete fix (duplicate key, truncation, bad enum, missing column, etc.).
