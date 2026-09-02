CREATE TABLE IF NOT EXISTS pixelfed_oauth_clients (
  host TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  encrypted_client_secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);
