/**
 * Migration runner for ParkPeer.
 *
 * Applies the baseline (`db/schema.sql`, verbatim from docs/SCHEMA.md) plus every
 * ordered `.sql` file in `db/migrations/`. Applied files are recorded in
 * `schema_migrations`, so re-running is a no-op — which is what makes it safe to
 * put in a deploy pipeline.
 *
 * Three things it does that a bare `psql -f` loop would not:
 *
 *  1. **Serialises concurrent deploys** with a session advisory lock. Two
 *     containers booting at once must not race on `CREATE POLICY`.
 *  2. **Strips transaction control out of the migration files.** Several
 *     migrations wrap themselves in BEGIN/COMMIT (they were written to be run by
 *     hand); nested inside the runner's transaction the inner COMMIT would end
 *     ours early, leaving the `schema_migrations` insert untracked.
 *  3. **Installs a Supabase compatibility shim when it is missing.** Migrations
 *     015+ are the Supabase Auth bridge: they reference the `auth` schema, the
 *     `auth.users` table and the `anon`/`authenticated`/`service_role` roles.
 *     On a plain Postgres (the docker-compose stack) those do not exist and the
 *     whole run would abort at 015. The shim below creates the minimum needed —
 *     only when `authenticated` is absent, so a real Supabase project is never
 *     touched.
 *
 * Usage: npm run db:migrate
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Pool, type PoolClient } from "pg";

const SCHEMA_BASELINE = "000_baseline.sql";

/** Same value in every environment; only serialises, never selects data. */
const MIGRATION_LOCK_KEY = 727_600_1;

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://parkpeer:parkpeer@localhost:5432/parkpeer",
});

/**
 * Splits a migration file into top-level statements.
 *
 * A regex cannot do this: `END;` closes a CASE *inside* a function body just as
 * often as it ends a transaction, and `$$`-quoted bodies contain both semicolons
 * and comments. So this walks the text and tracks the quoting state it is in
 * (line comment, block comment, single-quoted string, quoted identifier, dollar
 * quote) before it treats a `;` as a statement boundary.
 */
export function topLevelStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;
  let dollarTag: string | null = null;

  const skipTo = (index: number): void => {
    i = index;
  };

  while (i < sql.length) {
    const ch = sql[i];

    if (dollarTag === null && ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      skipTo(nl === -1 ? sql.length : nl + 1);
      continue;
    }
    if (dollarTag === null && ch === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      skipTo(end === -1 ? sql.length : end + 2);
      continue;
    }
    if (dollarTag === null && (ch === "'" || ch === '"')) {
      const quote = ch;
      i += 1;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            i += 2; // escaped by doubling
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "$") {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (match) {
        const tag = match[0];
        if (dollarTag === null) dollarTag = tag;
        else if (dollarTag === tag) dollarTag = null;
        i += tag.length;
        continue;
      }
    }
    if (dollarTag === null && ch === ";") {
      statements.push(sql.slice(start, i + 1));
      start = i + 1;
    }
    i += 1;
  }

  if (start < sql.length) statements.push(sql.slice(start));
  return statements;
}

/**
 * Drops top-level BEGIN/COMMIT so the runner owns the transaction. Several
 * migrations were written to be run by hand and wrap themselves in one; nested
 * inside the runner's transaction their COMMIT would end ours early and leave
 * the `schema_migrations` insert untracked.
 */
export function stripTransactionControl(sql: string): string {
  const transactionStatement = /^(BEGIN|COMMIT|END|START\s+TRANSACTION|ROLLBACK)\s*;?$/i;
  const commentOnlyLines = /^\s*(--[^\n]*|\/\*[\s\S]*?\*\/)\s*$/gm;

  return topLevelStatements(sql)
    .filter((statement) => !transactionStatement.test(statement.replace(commentOnlyLines, "").trim()))
    .join("");
}

async function ensureMetaTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function isApplied(filename: string): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM schema_migrations WHERE filename = $1",
    [filename]
  );
  return rows.length > 0;
}

async function recordApplied(
  filename: string,
  client: { query: (q: string, p?: unknown[]) => Promise<unknown> }
): Promise<void> {
  await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
    [filename]
  );
}

function loadMigrations(): Array<{ filename: string; sql: string }> {
  const dir = join(__dirname, "..", "db", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => ({ filename: f, sql: readFileSync(join(dir, f), "utf8") }));
}

/** True on a real Supabase project — the shim is skipped there. */
async function hasSupabaseRoles(): Promise<boolean> {
  const { rows } = await pool.query(
    "SELECT 1 FROM pg_roles WHERE rolname IN ('authenticated', 'anon', 'service_role')"
  );
  return rows.length === 3;
}

/**
 * The smallest thing that lets 015+ apply to a vanilla Postgres. The RLS
 * policies become inert (no PostgREST in front of this database), but the SQL
 * itself is valid and the local stack stays usable for the e2e scripts.
 */
async function ensureSupabaseCompatShim(): Promise<void> {
  if (await hasSupabaseRoles()) return;

  console.log("• Supabase roles absent — installing the local compatibility shim");
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS auth;

    CREATE TABLE IF NOT EXISTS auth.users (
      id UUID PRIMARY KEY,
      email TEXT,
      phone TEXT,
      raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
      email_confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS uuid
    LANGUAGE sql
    STABLE
    AS $$
      SELECT CASE
        WHEN nullif(current_setting('request.jwt.claim.sub', true), '') IS NOT NULL
          THEN current_setting('request.jwt.claim.sub', true)::uuid
        WHEN nullif(current_setting('request.jwt.claims', true), '') IS NOT NULL
          THEN (current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid
        ELSE NULL
      END;
    $$;

    CREATE OR REPLACE FUNCTION auth.role()
    RETURNS text
    LANGUAGE sql
    STABLE
    AS $$
      SELECT coalesce(
        nullif(current_setting('request.jwt.claim.role', true), ''),
        'anon'
      );
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        CREATE ROLE service_role NOLOGIN BYPASSRLS;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    END
    $$;

    GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
    GRANT SELECT ON auth.users TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION auth.role() TO anon, authenticated, service_role;
  `);
}

async function applyFile(
  filename: string,
  sql: string,
  client?: PoolClient
): Promise<void> {
  const runner = client ?? pool;
  await runner.query(sql);
  await recordApplied(filename, runner);
}

async function run(): Promise<void> {
  // Advisory lock: held for the whole run, released on disconnect.
  await pool.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
  console.log("• migration lock acquired");

  await ensureMetaTable();
  await ensureSupabaseCompatShim();

  // 1. Baseline schema (verbatim from docs/SCHEMA.md)
  if (await isApplied(SCHEMA_BASELINE)) {
    console.log(`• ${SCHEMA_BASELINE} already applied, skipping`);
  } else {
    // The Docker init script may already have run schema.sql verbatim.
    // Detect that and record the baseline instead of double-applying.
    const { rows: existing } = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bookings'"
    );
    if (existing.length > 0) {
      await recordApplied(SCHEMA_BASELINE, pool);
      console.log(`• ${SCHEMA_BASELINE} detected as pre-applied (container init), recording`);
    } else {
      const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await applyFile(SCHEMA_BASELINE, sql, client);
        await client.query("COMMIT");
        console.log(`✔ applied ${SCHEMA_BASELINE}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }
  }

  // 2. Ordered follow-up migrations
  for (const { filename, sql } of loadMigrations()) {
    if (await isApplied(filename)) {
      console.log(`• ${filename} already applied, skipping`);
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await applyFile(filename, stripTransactionControl(sql), client);
      await client.query("COMMIT");
      console.log(`✔ applied ${filename}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`✘ failed ${filename}: ${(err as Error).message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  await pool.end();
  console.log("Migration run complete.");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
