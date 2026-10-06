// One-off copy of all rows from Postgres (DATABASE_URL) to Turso (TURSO_DATABASE_URL).
// Values are copied verbatim (they are already JSON-encoded text).
// Usage: npm run migrate:turso

require('dotenv').config()
const pg = require('pg')
const turso = require('../tursoutil')

const TABLES = {
  eConfigs: ['appname', 'flows', 'credentials', 'packages', 'settings', 'secureLink'],
  eLibs: ['appname', 'type', 'path', 'meta', 'body'],
  ePrivateNodes: ['appname', 'packageName', 'data']
}

const main = async () => {
  if (!process.env.DATABASE_URL || !process.env.TURSO_DATABASE_URL) {
    throw new Error('Both DATABASE_URL and TURSO_DATABASE_URL must be set')
  }

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  })
  const client = turso.init()
  await turso.createTable()

  try {
    // Refuse to copy into a non-empty target so rows are never duplicated
    for (const table of Object.keys(TABLES)) {
      const res = await client.execute(`SELECT COUNT(*) AS n FROM "${table}"`)
      if (Number(res.rows[0].n) > 0) {
        throw new Error(`Turso table "${table}" is not empty, aborting`)
      }
    }

    for (const [table, columns] of Object.entries(TABLES)) {
      const { rows } = await pool.query(`SELECT * FROM "${table}" ORDER BY id`)
      const colList = columns.map((c) => `"${c}"`).join(', ')
      const placeholders = columns.map(() => '?').join(', ')
      const stmts = rows.map((row) => ({
        sql: `INSERT INTO "${table}"(${colList}) VALUES(${placeholders})`,
        args: columns.map((c) => (row[c] == null ? null : row[c]))
      }))
      if (stmts.length) {
        await client.batch(stmts, 'write')
      }
      console.log(`${table}: copied ${stmts.length} rows`)
    }
  } finally {
    await pool.end()
    client.close()
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message)
  process.exit(1)
})
