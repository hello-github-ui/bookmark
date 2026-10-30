/** Cloudflare D1 (SQLite) 存储层。只被 Cloudflare Functions 引用，不会打进前端包。 */

import type { D1Database } from '@cloudflare/workers-types'
import {
  type Bookmark,
  type Category,
  type SyncPayload,
  sanitizeBookmark,
  sanitizeCategory,
} from './model'

/** `desc` 在 SQL 里是保留字，所以列名用 descr，读写时做一次映射 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS categories (
  id        TEXT PRIMARY KEY,
  name      TEXT    NOT NULL DEFAULT '',
  icon      TEXT    NOT NULL DEFAULT '',
  color     TEXT    NOT NULL DEFAULT '',
  sort      REAL    NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL DEFAULT 0,
  deletedAt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_categories_updated ON categories(updatedAt);

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
CREATE INDEX IF NOT EXISTS idx_bookmarks_updated  ON bookmarks(updatedAt);
CREATE INDEX IF NOT EXISTS idx_bookmarks_category ON bookmarks(categoryId);
`

const CATEGORY_UPSERT = `
INSERT INTO categories (id,name,icon,color,sort,createdAt,updatedAt,deletedAt)
VALUES (?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  name=excluded.name, icon=excluded.icon, color=excluded.color, sort=excluded.sort,
  createdAt=excluded.createdAt, updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
WHERE excluded.updatedAt > categories.updatedAt`

const BOOKMARK_UPSERT = `
INSERT INTO bookmarks
  (id,categoryId,title,url,descr,tags,icon,iconMode,pinned,visits,lastVisitAt,sort,createdAt,updatedAt,deletedAt)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(id) DO UPDATE SET
  categoryId=excluded.categoryId, title=excluded.title, url=excluded.url, descr=excluded.descr,
  tags=excluded.tags, icon=excluded.icon, iconMode=excluded.iconMode, pinned=excluded.pinned,
  visits=MAX(excluded.visits, bookmarks.visits),
  lastVisitAt=MAX(excluded.lastVisitAt, bookmarks.lastVisitAt),
  sort=excluded.sort, createdAt=excluded.createdAt,
  updatedAt=excluded.updatedAt, deletedAt=excluded.deletedAt
WHERE excluded.updatedAt > bookmarks.updatedAt`

function isMissingTable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return /no such table/i.test(msg)
}

/** 首次使用时自动建表，省掉「先跑 migration」这一步 */
export async function ensureSchema(db: D1Database): Promise<void> {
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter(Boolean)
  for (const sql of statements) await db.prepare(sql).run()
}

/** 包一层：第一次遇到「表不存在」就建表再重试一次 */
async function withSchema<T>(db: D1Database, run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isMissingTable(err)) throw err
    await ensureSchema(db)
    return run()
  }
}

function rowToBookmark(row: Record<string, unknown>): Bookmark | null {
  return sanitizeBookmark({ ...row, desc: row.descr })
}

export async function pullSince(db: D1Database, since: number): Promise<SyncPayload> {
  return withSchema(db, async () => {
    const [cats, marks] = await Promise.all([
      db.prepare('SELECT * FROM categories WHERE updatedAt > ?').bind(since).all(),
      db.prepare('SELECT * FROM bookmarks  WHERE updatedAt > ?').bind(since).all(),
    ])
    return {
      categories: (cats.results as Record<string, unknown>[])
        .map(sanitizeCategory)
        .filter((c): c is Category => !!c),
      bookmarks: (marks.results as Record<string, unknown>[])
        .map(rowToBookmark)
        .filter((b): b is Bookmark => !!b),
    }
  })
}

/** D1 一次 batch 的语句数，控制在保守区间以免超出 Workers 的 CPU 限额 */
const BATCH_SIZE = 40

export async function pushRecords(db: D1Database, payload: SyncPayload): Promise<number> {
  const statements = [
    ...payload.categories.map((c) =>
      db
        .prepare(CATEGORY_UPSERT)
        .bind(c.id, c.name, c.icon, c.color, c.sort, c.createdAt, c.updatedAt, c.deletedAt),
    ),
    ...payload.bookmarks.map((b) =>
      db
        .prepare(BOOKMARK_UPSERT)
        .bind(
          b.id,
          b.categoryId,
          b.title,
          b.url,
          b.desc,
          JSON.stringify(b.tags),
          b.icon,
          b.iconMode,
          b.pinned,
          b.visits,
          b.lastVisitAt,
          b.sort,
          b.createdAt,
          b.updatedAt,
          b.deletedAt,
        ),
    ),
  ]
  if (!statements.length) return 0

  await withSchema(db, async () => {
    for (let i = 0; i < statements.length; i += BATCH_SIZE) {
      await db.batch(statements.slice(i, i + BATCH_SIZE))
    }
  })
  return statements.length
}

export async function countAll(db: D1Database): Promise<{ categories: number; bookmarks: number }> {
  return withSchema(db, async () => {
    const [c, b] = await Promise.all([
      db.prepare('SELECT COUNT(*) AS n FROM categories WHERE deletedAt = 0').first<{ n: number }>(),
      db.prepare('SELECT COUNT(*) AS n FROM bookmarks  WHERE deletedAt = 0').first<{ n: number }>(),
    ])
    return { categories: c?.n ?? 0, bookmarks: b?.n ?? 0 }
  })
}

/** 彻底清掉超过保留期的墓碑记录，避免 D1 被删除记录撑大 */
export async function purgeTombstones(db: D1Database, olderThan: number): Promise<void> {
  await withSchema(db, async () => {
    await db.batch([
      db.prepare('DELETE FROM categories WHERE deletedAt > 0 AND deletedAt < ?').bind(olderThan),
      db.prepare('DELETE FROM bookmarks  WHERE deletedAt > 0 AND deletedAt < ?').bind(olderThan),
    ])
  })
}
