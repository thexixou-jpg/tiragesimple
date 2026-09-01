CREATE TABLE IF NOT EXISTS kick_collections (
  id TEXT PRIMARY KEY,
  owner_session_id TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  channel_slug TEXT NOT NULL,
  channel_title TEXT,
  channel_thumbnail TEXT,
  subscription_id TEXT,
  status TEXT NOT NULL CHECK(status IN ('collecting', 'ready', 'expired')),
  started_at TEXT NOT NULL,
  stopped_at TEXT,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kick_collection_messages (
  message_id TEXT PRIMARY KEY,
  collection_id TEXT NOT NULL REFERENCES kick_collections(id),
  provider_user_id TEXT NOT NULL,
  username TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kick_collections_account_status ON kick_collections(provider_account_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_kick_collections_owner_status ON kick_collections(owner_session_id, status, started_at);
CREATE INDEX IF NOT EXISTS idx_kick_messages_collection ON kick_collection_messages(collection_id, created_at);
