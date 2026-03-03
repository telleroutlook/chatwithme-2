import fs from 'node:fs';
import path from 'node:path';

const MIGRATION_PATH = './drizzle/meta';

function checkMigrations() {
  if (!fs.existsSync(MIGRATION_PATH)) {
    console.error(`Error: Migration directory not found at ${MIGRATION_PATH}`);
    console.error('If you are starting locally, the application will auto-initialize schemas via ensureAuthSchema.');
    console.error('Manual migrations are intended for controlled production changes.');
    process.exit(1);
  }

  const files = fs.readdirSync(MIGRATION_PATH).filter(f => f.endsWith('.sql'));
  if (files.length === 0) {
    console.error(`Error: No .sql migration files found in ${MIGRATION_PATH}`);
    process.exit(1);
  }

  console.log(`Found ${files.length} migration files in ${MIGRATION_PATH}.`);
}

checkMigrations();
