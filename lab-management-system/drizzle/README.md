# Database Migrations

## Automatic Migrations

Migrations run automatically on Railway deployment through the `build` script:

```bash
pnpm run migrate && vite build && esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
```

The `migrate` script uses `drizzle-kit migrate` and requires `DATABASE_URL`.

## Local Development

```bash
# Generate a new migration from schema changes
pnpm run db:generate

# Apply committed migrations locally
pnpm run migrate

# Apply migrations against the Railway database
railway run pnpm run migrate
```

## Manual Migration (Emergency)

If auto-migration fails:

1. Open Railway Dashboard -> Database -> Connect.
2. Copy SQL from the relevant `drizzle/XXXX_*.sql` file.
3. Execute it in the Railway SQL console.

## Current Migration

- `0034_add_awaiting_review_status.sql`: adds sample status values for `testing_in_progress`, `awaiting_review`, `under_review`, `clearance_requested`, and `deleted`.
