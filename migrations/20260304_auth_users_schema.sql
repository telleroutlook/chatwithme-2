-- Normalize auth users table to v2 schema used by server routes.
-- This migration intentionally resets legacy user records.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS users;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

PRAGMA foreign_keys = ON;
