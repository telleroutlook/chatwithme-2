type D1Database = Env["DB"];

let schemaReady = false;
let schemaInitPromise: Promise<void> | null = null;

async function initAuthSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`
    ),
    db.prepare(
      `CREATE TABLE IF NOT EXISTS user_session_bindings (
        user_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, session_id)
      )`
    ),
    db.prepare(
      "CREATE INDEX IF NOT EXISTS idx_user_session_bindings_user_id ON user_session_bindings(user_id)"
    ),
  ]);
}

export async function ensureAuthSchema(db: D1Database): Promise<void> {
  if (schemaReady) {
    return;
  }
  if (!schemaInitPromise) {
    schemaInitPromise = initAuthSchema(db)
      .then(() => {
        schemaReady = true;
      })
      .catch((err) => {
        // Allow retry on next call by clearing the promise
        schemaInitPromise = null;
        throw err;
      });
  }
  await schemaInitPromise;
}
