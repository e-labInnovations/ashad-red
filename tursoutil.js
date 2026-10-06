const { createClient } = require('@libsql/client')
require('dotenv').config()

// Same interface as pgutil.js, backed by Turso (libSQL / SQLite)

let client

// Network errors worth retrying, e.g. a pooled HTTPS connection that Turso
// already closed ("fetch failed" / "other side closed")
const TRANSIENT_CODES = ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']

const isTransient = (err) =>
  !!err &&
  (err.message === 'fetch failed' ||
    TRANSIENT_CODES.includes(err.code) ||
    TRANSIENT_CODES.includes(err.cause && err.cause.code))

// Retries twice (after 200 ms and 600 ms), well inside dbstorage's 5 s timeout
const withRetry = async (fn) => {
  const delays = [200, 600]
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt >= delays.length || !isTransient(err)) throw err
      console.warn('Turso request failed (' + ((err.cause && err.cause.code) || err.code || err.message) + '), retrying')
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

const init = () => {
  if (client) return client
  client = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
  })
  return client
}

const createTable = async () => {
  if (!client) throw new Error('No Turso client')
  console.log('create turso tables')
  await withRetry(() => client.batch(
    [
      `CREATE TABLE IF NOT EXISTS "eConfigs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appname TEXT NOT NULL,
        flows TEXT,
        credentials TEXT,
        packages TEXT,
        settings TEXT,
        "secureLink" TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS "eLibs" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appname TEXT NOT NULL,
        type TEXT,
        path TEXT,
        meta TEXT,
        body TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS "ePrivateNodes" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        appname TEXT NOT NULL,
        "packageName" TEXT,
        data TEXT
      )`
    ],
    'write'
  ))
  // Added after the first release; add it to tables created before then
  const cols = await withRetry(() => client.execute('PRAGMA table_info("eConfigs")'))
  if (!cols.rows.some((r) => r.name === 'sessions')) {
    await withRetry(() => client.execute('ALTER TABLE "eConfigs" ADD COLUMN sessions TEXT'))
  }
}

const doSQL = async (sql, args) => {
  if (!client) throw new Error('No Turso client')
  const result = await withRetry(() => client.execute({ sql, args: args || [] }))
  // Convert libSQL rows to plain objects keyed by column name
  const rows = result.rows.map((row) => {
    const obj = {}
    result.columns.forEach((col, i) => {
      obj[col] = row[i]
    })
    return obj
  })
  return { rows, rowCount: rows.length }
}

const parseRow = (row) => {
  let retData = {}
  for (let key in row) {
    if (row[key]) {
      retData[key] = JSON.parse(row[key])
    }
  }
  return retData
}

const loadConfig = async (appname) => {
  const query = 'SELECT * FROM "eConfigs" WHERE appname = ?'
  const data = await doSQL(query, [JSON.stringify(appname)])
  if (data.rowCount > 0) {
    return parseRow(data.rows[0])
  }
  return null
}

const CONFIG_COLUMNS = ['flows', 'credentials', 'packages', 'settings', 'secureLink', 'sessions']

const saveConfig = async (appname, params) => {
  // Write only the columns being saved, so concurrent saves of different
  // columns (e.g. flows and sessions) can't overwrite each other
  const cols = CONFIG_COLUMNS.filter((c) => c in params)
  const encode = (v) => (v ? JSON.stringify(v) : '')
  const key = JSON.stringify(appname)
  const existing = await doSQL('SELECT id FROM "eConfigs" WHERE appname = ?', [key])
  if (existing.rowCount > 0) {
    if (!cols.length) return
    const sets = cols.map((c) => `"${c}" = ?`).join(', ')
    await doSQL(`UPDATE "eConfigs" SET ${sets} WHERE appname = ?`, [...cols.map((c) => encode(params[c])), key])
  } else {
    const allCols = ['appname', ...cols]
    const query = `INSERT INTO "eConfigs"(${allCols.map((c) => `"${c}"`).join(', ')}) VALUES(${allCols.map(() => '?').join(', ')})`
    await doSQL(query, [key, ...cols.map((c) => encode(params[c]))])
  }
}

const removeConfig = async (appname) => {
  const query = 'DELETE FROM "eConfigs" WHERE appname = ?'
  await doSQL(query, [JSON.stringify(appname)])
}

const loadLib = async (appname, type, path) => {
  const query =
    'SELECT * FROM "eLibs" WHERE appname = ? and type = ? and path = ?'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(type),
    JSON.stringify(path)
  ])
  if (data.rowCount > 0) {
    return parseRow(data.rows[0])
  }
  return null
}

const loadLibList = async (appname, type, dir) => {
  // Prefix match on the JSON-encoded path (SQLite LIKE is case-insensitive, so avoid it)
  const prefix = `"${dir}`
  const query =
    'SELECT * FROM "eLibs" WHERE appname = ? and type = ? and substr(path, 1, ?) = ? ORDER BY path'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(type),
    prefix.length,
    prefix
  ])
  return data.rows.map(parseRow)
}

const saveLib = async (appname, params) => {
  const columns = ['appname', 'type', 'path', 'meta', 'body', 'id']
  let data = await loadLib(appname, params.type, params.path)
  let query
  let values
  if (data) {
    data = Object.assign(data, params)
    query =
      'UPDATE "eLibs" SET appname = ?, type = ?, path = ?, meta = ?, body = ? WHERE id = ?'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO "eLibs"(appname, type, path, meta, body) VALUES(?, ?, ?, ?, ?)'
    values = columns
      .slice(0, 5)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  await doSQL(query, values)
}

const loadPrivateNodes = async (appname, packageName) => {
  const query =
    'SELECT * FROM "ePrivateNodes" WHERE appname = ? and "packageName" = ?'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(packageName)
  ])
  if (data.rowCount > 0) {
    return parseRow(data.rows[0])
  }
  return null
}

const savePrivateNodes = async (appname, params) => {
  const columns = ['appname', 'packageName', 'data', 'id']
  let data = await loadPrivateNodes(appname, params.packageName)
  let query
  let values
  if (data) {
    data = Object.assign(data, params)
    query =
      'UPDATE "ePrivateNodes" SET appname = ?, "packageName" = ?, data = ? WHERE id = ?'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO "ePrivateNodes"(appname, "packageName", data) VALUES(?, ?, ?)'
    values = columns
      .slice(0, 3)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  await doSQL(query, values)
}

const removePrivateNodes = async (appname) => {
  const query = 'DELETE FROM "ePrivateNodes" WHERE appname = ?'
  await doSQL(query, [JSON.stringify(appname)])
}

exports.kind = 'turso'
exports.isTransient = isTransient
exports.init = init
exports.createTable = createTable
exports.loadConfig = loadConfig
exports.saveConfig = saveConfig
exports.removeConfig = removeConfig
exports.loadLib = loadLib
exports.loadLibList = loadLibList
exports.saveLib = saveLib
exports.loadPrivateNodes = loadPrivateNodes
exports.savePrivateNodes = savePrivateNodes
exports.removePrivateNodes = removePrivateNodes
