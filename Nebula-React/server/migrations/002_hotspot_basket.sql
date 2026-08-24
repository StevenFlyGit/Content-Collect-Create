-- ============================================================
-- 002_hotspot_basket.sql
-- 热点快照表 + 创作篮条目表（MVP 热点页 / 创作篮页）
-- 依赖 001_init.sql 的 workspaces / inspirations 表与 pgcrypto 扩展
-- 全部使用 IF NOT EXISTS / ON CONFLICT，可安全重复执行
-- ============================================================

-- ---------------------------------------------------------------
-- 表 4.1.1 hotspot_snapshots —— 热点快照表（点击「加入创作」时入库）
-- 为什么是"快照"而非"引用"：热点源 AIHOT 内容易变，
-- 点「加入创作」必须把那一刻的关键信息固化下来，与上游解耦。
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS hotspot_snapshots (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  source               TEXT         NOT NULL DEFAULT 'aihot',      -- 数据源标识，本期固定 'aihot'
  external_id          TEXT         NOT NULL,                      -- 上游条目 id（AIHOT item.id）
  entry_key            TEXT         NOT NULL,                      -- `aihot:<external_id>`，预留多源扩展时的稳定身份

  -- 快照内容（点击「加入创作」那一刻的固定字段，避免上游变动影响创作篮）
  title                TEXT         NOT NULL,                      -- 标题
  summary              TEXT,                                        -- 摘要（reason || summary 归一化链后的非空结果，可能为空）
  source_name          TEXT         NOT NULL,                      -- 第三方原始来源名
  source_url           TEXT,                                        -- 第三方原文链接（links.original），无原文则存 links.aihot
  ai_hot_url           TEXT         NOT NULL,                      -- AIHOT 阅读页链接（links.aihot），用于展示署名

  -- 时间口径
  published_at         TIMESTAMPTZ,                                 -- 源发布时间（publishedAt），可能为空
  captured_at          TIMESTAMPTZ  NOT NULL,                      -- 上游收录时间（discoveredAt），必填
  snapshot_taken_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),        -- 本系统入库时间

  -- 元信息（不展示数值热度，仅保留分类与 rank 供前端排序）
  category             TEXT         NOT NULL DEFAULT 'ai',         -- 本期固定 'ai'；多源时按全局品类 code
  category_source_raw  TEXT,                                        -- AIHOT 原生 category，如 'ai-models'/'tip'，多源扩展时透传
  rank                 INTEGER,                                     -- 上游 rank（hot-topics 时有，items 时为 NULL）

  -- 溯源
  raw_payload          JSONB        NOT NULL,                      -- AIHOT 返回的原始 item JSON 全文，便于将来回溯/重渲染
  workspace_id         UUID         NOT NULL,                      -- 沿用现有工作区隔离模型

  CONSTRAINT uniq_snapshot_entry UNIQUE (workspace_id, entry_key)  -- 工作区级去重
);

CREATE INDEX IF NOT EXISTS idx_snapshot_ws_taken
  ON hotspot_snapshots (workspace_id, snapshot_taken_at DESC);
CREATE INDEX IF NOT EXISTS idx_snapshot_ws_ext
  ON hotspot_snapshots (workspace_id, external_id);

-- ---------------------------------------------------------------
-- 表 4.1.2 creation_basket_items —— 创作篮条目表
-- 每工作区只有一个"未生成成稿"的隐式篮，直接用 workspace_id 划分。
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS creation_basket_items (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         UUID         NOT NULL,                      -- 沿用现有工作区隔离模型
  origin               TEXT         NOT NULL,                     -- 'inspiration' | 'hotspot'
  inspiration_id       UUID,                                        -- 灵感 id（origin='inspiration' 时必填，引用现有 inspirations 表，无需快照）
  hotspot_snapshot_id  UUID         REFERENCES hotspot_snapshots(id) ON DELETE CASCADE,  -- 热点快照 id（origin='hotspot' 时必填）
  added_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT chk_origin_payload CHECK (
    (origin = 'inspiration' AND inspiration_id IS NOT NULL AND hotspot_snapshot_id IS NULL) OR
    (origin = 'hotspot'      AND hotspot_snapshot_id IS NOT NULL AND inspiration_id IS NULL)
  ),
  CONSTRAINT uniq_basket_inspiration UNIQUE (workspace_id, origin, inspiration_id),    -- 同源同灵感不重复入篮
  CONSTRAINT uniq_basket_hotspot     UNIQUE (workspace_id, origin, hotspot_snapshot_id)
);

CREATE INDEX IF NOT EXISTS idx_basket_ws_origin
  ON creation_basket_items (workspace_id, origin, added_at DESC);
