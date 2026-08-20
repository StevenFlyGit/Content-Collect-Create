CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name varchar(80) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO workspaces(id,owner_id,name) VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Nebula 开发工作区') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS inspiration_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  slug varchar(40) NOT NULL,
  label varchar(40) NOT NULL,
  color_token varchar(40) NOT NULL,
  icon varchar(40),
  sort_order int NOT NULL DEFAULT 0,
  archived_at timestamptz,
  CONSTRAINT uq_type_workspace_slug UNIQUE(workspace_id, slug)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_type_system_slug ON inspiration_types(slug) WHERE workspace_id IS NULL;

CREATE TABLE IF NOT EXISTS inspirations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  title varchar(200),
  text_raw text NOT NULL DEFAULT '',
  text_normalized text,
  type_id uuid REFERENCES inspiration_types(id) ON DELETE SET NULL,
  user_tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_tags_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  board_position_json jsonb,
  processing_status varchar(20) NOT NULL DEFAULT 'draft' CHECK(processing_status IN ('draft','synced','failed')),
  sync_status varchar(20) NOT NULL DEFAULT 'local' CHECK(sync_status IN ('local','synced')),
  is_quote boolean NOT NULL DEFAULT false,
  used_in_projects int NOT NULL DEFAULT 0,
  idempotency_key varchar(120),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE inspirations ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DROP INDEX IF EXISTS uq_insp_ws_idempotency;
CREATE UNIQUE INDEX uq_insp_ws_idempotency ON inspirations(workspace_id, idempotency_key) WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insp_ws_recorded ON inspirations(workspace_id, recorded_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insp_ws_type ON inspirations(workspace_id, type_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insp_search ON inspirations USING gin ((coalesce(title,'') || ' ' || text_raw) gin_trgm_ops) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  inspiration_id uuid REFERENCES inspirations(id) ON DELETE CASCADE,
  kind varchar(12) NOT NULL CHECK(kind IN ('image','audio','file')),
  storage_key varchar(255) NOT NULL UNIQUE,
  sha256 char(64),
  etag varchar(128),
  crc64 varchar(64),
  mime_type varchar(100) NOT NULL,
  bytes bigint NOT NULL,
  duration_ms int,
  width int,
  height int,
  privacy_scope varchar(20) NOT NULL DEFAULT 'private',
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready','failed','deleting','deleted')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE assets ADD COLUMN IF NOT EXISTS etag varchar(128);
ALTER TABLE assets ADD COLUMN IF NOT EXISTS crc64 varchar(64);
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_status_check;
ALTER TABLE assets ADD CONSTRAINT assets_status_check CHECK(status IN ('pending','ready','failed','deleting','deleted'));
CREATE INDEX IF NOT EXISTS idx_assets_insp ON assets(inspiration_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assets_ws_status ON assets(workspace_id, status);

CREATE TABLE IF NOT EXISTS asset_deletion_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  storage_key varchar(255) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','failed','succeeded')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(asset_id)
);
CREATE INDEX IF NOT EXISTS idx_asset_deletion_due ON asset_deletion_tasks(status, next_attempt_at);

CREATE TABLE IF NOT EXISTS asset_derivatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  kind varchar(20) NOT NULL CHECK(kind IN ('thumbnail','ocr','transcript','caption','waveform')),
  content_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_ref varchar(120),
  status varchar(16) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  board_date date NOT NULL,
  layout_version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, board_date)
);
CREATE INDEX IF NOT EXISTS idx_boards_ws_date ON daily_boards(workspace_id, board_date);

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_inspirations_updated_at ON inspirations;
CREATE TRIGGER trg_inspirations_updated_at BEFORE UPDATE ON inspirations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_assets_updated_at ON assets;
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON assets FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_asset_deletion_tasks_updated_at ON asset_deletion_tasks;
CREATE TRIGGER trg_asset_deletion_tasks_updated_at BEFORE UPDATE ON asset_deletion_tasks FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

INSERT INTO inspiration_types(slug,label,color_token,sort_order) VALUES
('uncategorized','先不分类','--ink-muted',0),('idea','想法','--nebula-violet',1),('quote','引用','--nebula-blue',2),('moment','随感','--nebula-rose',3),('task','待办','--nebula-mint',4),('case','案例','--nebula-amber',5),('question','问题','--danger',6)
ON CONFLICT (slug) WHERE workspace_id IS NULL DO NOTHING;

