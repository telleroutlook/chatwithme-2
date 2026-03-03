import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] === "prod" ? "prod" : "local";
const database = process.argv[3] || "token_db";

const MIGRATION_DIR_CANDIDATES = [
  "drizzle/meta",
  "drizzle/migrations",
  "drizzle",
  "migrations",
];

function resolveMigrationFiles() {
  for (const dir of MIGRATION_DIR_CANDIDATES) {
    const absDir = path.resolve(process.cwd(), dir);
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
      continue;
    }

    const files = fs
      .readdirSync(absDir)
      .filter((file) => file.endsWith(".sql"))
      .sort((a, b) => a.localeCompare(b, "en"));

    if (files.length > 0) {
      return {
        dir,
        files: files.map((file) => path.join(dir, file)),
      };
    }
  }

  return null;
}

function runWranglerMigration(file) {
  const args = [
    "d1",
    "execute",
    database,
    mode === "prod" ? "--remote" : "--local",
    `--file=${file}`,
  ];

  const result = spawnSync("wrangler", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main() {
  const resolved = resolveMigrationFiles();
  if (!resolved) {
    console.error("Error: no SQL migration files found.");
    console.error(
      `Checked directories: ${MIGRATION_DIR_CANDIDATES.map((dir) => `"${dir}"`).join(", ")}`
    );
    console.error(
      "Hint: local startup does not require manual migration because auth schema is auto-initialized in src/server/auth-db.ts."
    );
    process.exit(1);
  }

  console.log(
    `Applying ${resolved.files.length} migration file(s) from "${resolved.dir}" to ${database} (${mode}).`
  );

  for (const [index, file] of resolved.files.entries()) {
    console.log(`[${index + 1}/${resolved.files.length}] ${file}`);
    runWranglerMigration(file);
  }

  console.log("All migrations applied.");
}

main();
