CREATE TABLE IF NOT EXISTS social_accounts (
  id TEXT PRIMARY KEY,
  owner_session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  encrypted_token TEXT,
  encrypted_refresh_token TEXT,
  token_expires_at TEXT,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS social_publications (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_publication_id TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  author_provider_id TEXT,
  author_name TEXT,
  title TEXT,
  thumbnail_url TEXT,
  published_at TEXT,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_publication_id)
);

CREATE TABLE IF NOT EXISTS contest_imports (
  id TEXT PRIMARY KEY,
  owner_session_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  publication_id TEXT NOT NULL REFERENCES social_publications(id),
  status TEXT NOT NULL,
  progress_current INTEGER NOT NULL DEFAULT 0,
  progress_total INTEGER,
  participant_count INTEGER NOT NULL DEFAULT 0,
  raw_import_key TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contest_participants (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES contest_imports(id),
  provider_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  entries_count INTEGER NOT NULL DEFAULT 1,
  eligible INTEGER NOT NULL DEFAULT 1,
  reason_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(import_id, provider_user_id)
);

CREATE TABLE IF NOT EXISTS contest_rules (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL REFERENCES contest_imports(id),
  rules_json TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contest_draws (
  id TEXT PRIMARY KEY,
  public_id TEXT UNIQUE NOT NULL,
  import_id TEXT NOT NULL REFERENCES contest_imports(id),
  rules_snapshot_json TEXT NOT NULL,
  participant_snapshot_hash TEXT NOT NULL,
  random_commitment_hash TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  public_visibility INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contest_winners (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES contest_draws(id),
  participant_id TEXT NOT NULL REFERENCES contest_participants(id),
  rank INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('winner', 'alternate')),
  created_at TEXT NOT NULL,
  UNIQUE(draw_id, rank, kind)
);

CREATE TABLE IF NOT EXISTS provider_usage (
  provider TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  requests_count INTEGER NOT NULL DEFAULT 0,
  quota_remaining INTEGER,
  reset_at TEXT,
  PRIMARY KEY(provider, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_contest_imports_expiry ON contest_imports(expires_at);
CREATE INDEX IF NOT EXISTS idx_contest_participants_import ON contest_participants(import_id, eligible);
CREATE INDEX IF NOT EXISTS idx_social_accounts_owner ON social_accounts(owner_session_id, provider);
