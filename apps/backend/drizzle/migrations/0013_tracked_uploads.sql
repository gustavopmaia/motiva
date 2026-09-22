CREATE TABLE object_uploads (
  namespace text NOT NULL CHECK (namespace IN ('vehicle-captures', 'work-order-photos')),
  key text NOT NULL,
  sha256 text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'attached', 'deleting', 'deleted')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attached_at timestamptz,
  deleted_at timestamptz,
  PRIMARY KEY (namespace, key)
);
--> statement-breakpoint
CREATE INDEX object_uploads_cleanup_idx ON object_uploads (created_at) WHERE state IN ('pending', 'deleting');
