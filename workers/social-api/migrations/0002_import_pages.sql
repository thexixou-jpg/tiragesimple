-- One atomic checkpoint per API page, preventing duplicate queue deliveries
-- from adding entries twice. No raw comment text is retained.
CREATE TABLE IF NOT EXISTS contest_import_pages (
  import_id TEXT NOT NULL REFERENCES contest_imports(id),
  page_key TEXT NOT NULL,
  batch_token TEXT NOT NULL,
  next_job_json TEXT,
  PRIMARY KEY (import_id, page_key)
);
