-- D1 初始化
--   本地: npx wrangler d1 execute bookmark-nav-db --local  --file=./migrations/0001_init.sql
--   线上: npx wrangler d1 execute bookmark-nav-db --remote --file=./migrations/0001_init.sql
--
-- 这一步其实可以跳过：后端第一次写入时若发现表不存在会自动建表。
-- 手动跑一次的好处是能立刻验证 D1 绑定配对了没有。

CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  name      TEXT    NOT NULL DEFAULT '',
  icon      TEXT    NOT NULL DEFAULT '',
  color     TEXT    NOT NULL DEFAULT '',
  sort      REAL    NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL DEFAULT 0,
  deletedAt INTEGER NOT NULL DEFAULT 0   -- 0 = 存在；非 0 = 删除时间戳（墓碑）
);

CREATE INDEX IF NOT EXISTS idx_categories_updated ON categories (updatedAt);

-- 注意：desc 是 SQL 保留字，所以描述字段的列名用 descr
CREATE TABLE IF NOT EXISTS bookmarks (
  id          TEXT PRIMARY KEY,
  categoryId  TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  url         TEXT    NOT NULL DEFAULT '',
  descr       TEXT    NOT NULL DEFAULT '',
  tags        TEXT    NOT NULL DEFAULT '[]',
  icon        TEXT    NOT NULL DEFAULT '',
  iconMode    TEXT    NOT NULL DEFAULT 'auto',
  pinned      INTEGER NOT NULL DEFAULT 0,
  visits      INTEGER NOT NULL DEFAULT 0,
  lastVisitAt INTEGER NOT NULL DEFAULT 0,
  sort        REAL    NOT NULL DEFAULT 0,
  createdAt   INTEGER NOT NULL DEFAULT 0,
  updatedAt   INTEGER NOT NULL DEFAULT 0,
  deletedAt   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_updated  ON bookmarks (updatedAt);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks (categoryId);
