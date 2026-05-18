# Database Migrations

## How Migrations Work on Railway

### Build Phase

- Compiles the frontend with Vite.
- Bundles the backend with esbuild.
- Does not run migrations because Railway database credentials are not available during build.

### Start Phase

Migrations run when the app starts, when `DATABASE_URL` is available:

```bash
pnpm run db:full-migration && node dist/index.js
```

`db:full-migration` uses the existing custom startup migration script:

```bash
tsx server/scripts/run-full-migration.ts
```

The Railway database already has older schema changes that were applied by this custom script. Do not run `drizzle-kit migrate` automatically during deployment unless the production Drizzle migration journal is known to be aligned with the existing database.

## Local Development

```bash
# Generate a new migration from schema changes
pnpm run db:generate

# Apply committed migrations locally
pnpm run db:migrate

# Push schema directly as an alternative for one-off fixes
pnpm run db:push

# Run the same startup migration used by Railway
railway run pnpm run db:full-migration
```

## Manual Migration (Emergency)

If auto-migration fails:

1. Open Railway Dashboard -> Database -> Connect.
2. Copy SQL from the relevant `drizzle/XXXX_*.sql` file.
3. Execute it in the Railway SQL console.

## Current Migration

- `0034_add_awaiting_review_status.sql`: adds sample status values for `testing_in_progress`, `awaiting_review`, `under_review`, `clearance_requested`, and `deleted`.

## Verification

```bash
# On Railway
railway run pnpm run verify-migration

# Locally, if DATABASE_URL points at the target database
pnpm run verify-migration
```
