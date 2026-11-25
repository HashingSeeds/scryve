type SqliteValue = string | number | bigint | Uint8Array | null

interface NodeSqliteStatement {
  run(...params: SqliteValue[]): { changes: number | bigint; lastInsertRowid: number | bigint }
  get(...params: SqliteValue[]): unknown
  all(...params: SqliteValue[]): unknown[]
}

interface NodeSqliteDatabase {
  exec(sql: string): void
  prepare(sql: string): NodeSqliteStatement
  close(): void
}

const { DatabaseSync } = require("node:sqlite") as {
  DatabaseSync: new (location: string) => NodeSqliteDatabase
}

const databases = new Map<string, NodeSqliteDatabase>()

function normalizeParams(args: unknown[]): SqliteValue[] {
  const raw = args.length === 1 && Array.isArray(args[0]) ? args[0] : args
  return raw.map((value) => (value === undefined ? null : (value as SqliteValue)))
}

function plainRow<T>(row: unknown): T | null {
  if (row === undefined || row === null) return null
  return { ...(row as Record<string, unknown>) } as T
}

function wrapDatabase(db: NodeSqliteDatabase) {
  let inTransaction = false
  return {
    execSync(source: string) {
      db.exec(source)
    },
    runSync(source: string, ...args: unknown[]) {
      const result = db.prepare(source).run(...normalizeParams(args))
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      }
    },
    getFirstSync<T>(source: string, ...args: unknown[]) {
      const row = db.prepare(source).get(...normalizeParams(args))
      return plainRow<T>(row)
    },
    getAllSync<T>(source: string, ...args: unknown[]) {
      const rows = db.prepare(source).all(...normalizeParams(args))
      return rows.map((row: unknown) => plainRow<T>(row) as T)
    },
    isInTransactionSync() {
      return inTransaction
    },
    withTransactionSync(task: () => void) {
      if (inTransaction) {
        task()
        return
      }
      inTransaction = true
      db.exec("BEGIN")
      try {
        task()
        db.exec("COMMIT")
      } catch (error) {
        try {
          db.exec("ROLLBACK")
        } catch {}
        throw error
      } finally {
        inTransaction = false
      }
    },
    closeSync() {
      // why: in-memory node:sqlite loses all rows on close, unlike on-disk expo-sqlite, so keep it open until __resetMockDatabases().
    },
  }
}

export function openDatabaseSync(databaseName: string, _options?: unknown, directory?: string) {
  const key = `${directory ?? ""}:${databaseName}`
  let db = databases.get(key)
  if (!db) {
    db = new DatabaseSync(":memory:")
    databases.set(key, db)
  }
  return wrapDatabase(db)
}

export function __resetMockDatabases() {
  for (const db of databases.values()) {
    try {
      db.close()
    } catch {}
  }
  databases.clear()
}
