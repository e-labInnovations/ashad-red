const pg = require('pg')
const when = require('when')
const util = require('util')
require('dotenv').config()

let pool

const initPG = () => {
  if (pool) return pool
  const pgUrl = process.env.DATABASE_URL
  pool = new pg.Pool({ 
    connectionString: pgUrl,
    ssl: { rejectUnauthorized: false }
  })
  // Hosts like Neon close idle connections when they scale to zero; without
  // this listener pg would throw that as an uncaught error and crash Node-RED
  pool.on('error', (err) => {
    console.warn('Postgres idle connection closed: ' + err.message)
  })
  return pool
}

const createTable = async () => {
  if (!pool) throw new Error('No PG instance')
  console.log('create pg tables')
  const query = `
    CREATE TABLE IF NOT EXISTS "eConfigs" (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      flows text,
      credentials text,
      packages text,
      settings text,
      "secureLink" text
    );
    CREATE TABLE IF NOT EXISTS "eLibs" (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      type text,
      path text,
      meta text,
      body text
    );
    CREATE TABLE IF NOT EXISTS "ePrivateNodes" (
      id SERIAL PRIMARY KEY,
      appname character varying(255) NOT NULL,
      "packageName" text,
      data text
    );
    ALTER TABLE "eConfigs" ADD COLUMN IF NOT EXISTS sessions text;
  `
  await doSQL(query, null)
}

const doSQL = async (query, values) => {
  let client
  try {
    if (!pool) throw new Error('No PG instance')
    client = await pool.connect()
    return await client.query(query, values)
  } finally {
    if (client) {
      client.release()
    }
  }
}

const loadConfig = async (appname) => {
  const query = 'SELECT * FROM "eConfigs" WHERE appname = $1'
  const data = await doSQL(query, [JSON.stringify(appname)])
  if (data && data.rowCount > 0) {
    let retData = data.rows[0]
    for (let key in retData) {
      if (retData[key]) {
        retData[key] = JSON.parse(retData[key])
      }
    }
    return retData
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
  const existing = await doSQL('SELECT id FROM "eConfigs" WHERE appname = $1', [key])
  if (existing.rowCount > 0) {
    if (!cols.length) return
    const sets = cols.map((c, i) => `"${c}" = $${i + 1}`).join(', ')
    await doSQL(`UPDATE "eConfigs" SET ${sets} WHERE appname = $${cols.length + 1}`, [...cols.map((c) => encode(params[c])), key])
  } else {
    const allCols = ['appname', ...cols]
    const query = `INSERT INTO "eConfigs"(${allCols.map((c) => `"${c}"`).join(', ')}) VALUES(${allCols.map((c, i) => `$${i + 1}`).join(', ')})`
    await doSQL(query, [key, ...cols.map((c) => encode(params[c]))])
  }
}

const removeConfig = async (appname) => {
  const query = 'DELETE FROM "eConfigs" WHERE appname = $1'
  await doSQL(query, [JSON.stringify(appname)])
}

const loadLib = async (appname, type, path) => {
  const query =
    'SELECT * FROM "eLibs" WHERE appname = $1 and type = $2 and path = $3'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(type),
    JSON.stringify(path)
  ])
  if (data && data.rowCount > 0) {
    let retData = data.rows[0]
    for (let key in retData) {
      if (retData[key]) {
        retData[key] = JSON.parse(retData[key])
      }
    }
    return retData
  }
  return null
}

const loadLibList = async (appname, type, dir) => {
  const query =
    'SELECT * FROM "eLibs" WHERE appname = $1 and type = $2 and path LIKE $3 ORDER BY path'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(type),
    `"${dir}%`
  ])
  let retDataList = data.rows.map((d) => {
    let retData = {}
    for (let key in d) {
      if (d[key]) {
        retData[key] = JSON.parse(d[key])
      }
    }
    return retData
  })
  return retDataList
}

const saveLib = async (appname, params) => {
  const columns = ['appname', 'type', 'path', 'meta', 'body', 'id']
  let data = await loadLib(appname, params.type, params.path)
  let query
  let values
  if (data) {
    data = Object.assign(data, params)
    query =
      'UPDATE "eLibs" SET appname = $1, type = $2, path = $3, meta = $4, body = $5 WHERE id = $6 RETURNING *'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO "eLibs"(appname, type, path, meta, body) VALUES($1, $2, $3, $4, $5) RETURNING *'
    values = columns
      .slice(0, 5)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  await doSQL(query, values)
}

const loadPrivateNodes = async (appname, packageName) => {
  const query =
    'SELECT * FROM "ePrivateNodes" WHERE appname = $1 and "packageName" = $2'
  const data = await doSQL(query, [
    JSON.stringify(appname),
    JSON.stringify(packageName)
  ])
  if (data && data.rowCount > 0) {
    let retData = data.rows[0]
    for (let key in retData) {
      if (retData[key]) {
        retData[key] = JSON.parse(retData[key])
      }
    }
    return retData
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
      'UPDATE "ePrivateNodes" SET appname = $1, "packageName" = $2, data = $3 WHERE id = $4 RETURNING *'
    values = columns.map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  } else {
    data = params
    query =
      'INSERT INTO "ePrivateNodes"(appname, "packageName", data) VALUES($1, $2, $3) RETURNING *'
    values = columns
      .slice(0, 3)
      .map((c) => (data[c] ? JSON.stringify(data[c]) : ''))
  }
  await doSQL(query, values)
}

const removePrivateNodes = async (appname) => {
  const query = 'DELETE FROM "ePrivateNodes" WHERE appname = $1'
  await doSQL(query, [JSON.stringify(appname)])
}

exports.kind = 'postgres'
exports.init = initPG
exports.initPG = initPG
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