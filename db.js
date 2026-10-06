require('dotenv').config()

// Pick the storage backend from env: Turso first, then Postgres, else null (local files)
let db = null
if (process.env.TURSO_DATABASE_URL) {
  db = require('./tursoutil')
} else if (process.env.DATABASE_URL) {
  db = require('./pgutil')
}

module.exports = db
