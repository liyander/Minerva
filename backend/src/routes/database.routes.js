import { Router } from 'express'
import mysql from 'mysql2/promise'
import { env } from '../config/env.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import {
  applyColumnMigrations,
  createCoreTables,
  createDatabaseIfMissing,
  CORE_TABLES,
  EXPECTED_TABLES,
  FEATURE_TABLES,
  getTableStatus,
} from '../db/schema.js'
import { seedStarterData } from '../db/seeder.js'
import { ensureJobSchema } from './jobs.routes.js'
import { ensureInterviewSchema } from './interviews.routes.js'
import { ensureLabResearchSchema } from './labResearch.routes.js'
import { ensureResumeTable } from './resumes.routes.js'

const router = Router()

// A direct connection is used rather than the shared pool: the pool is bound to
// a database that may not have any tables yet, and multi-statement DDL needs to
// be enabled explicitly.
async function withAdminConnection(run) {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  })

  try {
    await createDatabaseIfMissing(conn)
    return await run(conn)
  } finally {
    await conn.end()
  }
}

async function adminAccountExists() {
  try {
    return await withAdminConnection(async (conn) => {
      const [rows] = await conn.query(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'",
      )
      return Number(rows[0]?.count || 0) > 0
    })
  } catch (error) {
    if (error?.code === 'ER_NO_SUCH_TABLE') {
      return false
    }
    throw error
  }
}

/**
 * Before the schema exists nobody can sign in, so these endpoints would be
 * unreachable behind a plain admin check. While no admin account exists the
 * database is treated as unclaimed and setup is open; the moment one exists,
 * admin authentication is required.
 */
async function requireAdminOrSetupMode(req, res, next) {
  try {
    if (!(await adminAccountExists())) {
      req.setupMode = true
      return next()
    }
  } catch (error) {
    return res.status(500).json({ message: error?.sqlMessage || error?.message || 'Database unreachable' })
  }

  return authenticate(req, res, () => requireAdmin(req, res, next))
}

router.get('/status', requireAdminOrSetupMode, async (req, res) => {
  try {
    const payload = await withAdminConnection(async (conn) => {
      const tables = await getTableStatus(conn)
      const missing = tables.filter((table) => !table.exists).map((table) => table.name)
      const empty = tables.filter((table) => table.exists && table.rows === 0).map((t) => t.name)

      return {
        database: env.db.database,
        host: `${env.db.host}:${env.db.port}`,
        setupMode: Boolean(req.setupMode),
        expectedTables: EXPECTED_TABLES.length,
        coreTables: CORE_TABLES.length,
        featureTables: FEATURE_TABLES.length,
        existingTables: tables.filter((table) => table.exists).length,
        missingTables: missing,
        emptyTables: empty,
        tables,
      }
    })

    res.json(payload)
  } catch (error) {
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Failed to read status' })
  }
})

router.post('/migrate', requireAdminOrSetupMode, async (_req, res) => {
  try {
    const result = await withAdminConnection(async (conn) => {
      const before = await getTableStatus(conn)
      const missingBefore = before.filter((table) => !table.exists).map((table) => table.name)

      await createCoreTables(conn)
      const migrations = await applyColumnMigrations(conn)

      return { missingBefore, migrations }
    })

    // Feature tables are owned by their route modules and use the shared pool.
    const featureErrors = []
    for (const [name, ensure] of [
      ['jobs', ensureJobSchema],
      ['interviews', ensureInterviewSchema],
      ['lab research', ensureLabResearchSchema],
      ['resumes', ensureResumeTable],
    ]) {
      try {
        await ensure()
      } catch (error) {
        featureErrors.push(`${name}: ${error?.sqlMessage || error?.message}`)
      }
    }

    const after = await withAdminConnection((conn) => getTableStatus(conn))
    const created = result.missingBefore.filter((name) =>
      after.some((table) => table.name === name && table.exists),
    )

    res.json({
      message: created.length
        ? `Created ${created.length} table${created.length === 1 ? '' : 's'}.`
        : 'Schema already up to date.',
      created,
      columnsAdded: result.migrations,
      featureErrors,
      stillMissing: after.filter((table) => !table.exists).map((table) => table.name),
      tables: after,
    })
  } catch (error) {
    res.status(500).json({ message: error?.sqlMessage || error?.message || 'Migration failed' })
  }
})

router.post('/seed', requireAdminOrSetupMode, async (req, res) => {
  const force = Boolean(req.body?.force)

  try {
    const payload = await withAdminConnection(async (conn) => {
      const missing = (await getTableStatus(conn))
        .filter((table) => !table.exists && CORE_TABLES.includes(table.name))
        .map((table) => table.name)

      if (missing.length) {
        return { error: `Create the tables first — missing: ${missing.join(', ')}` }
      }

      const report = await seedStarterData(conn, { force })
      const tables = await getTableStatus(conn)
      return { report, tables }
    })

    if (payload.error) {
      return res.status(400).json({ message: payload.error })
    }

    const inserted = payload.report.reduce((sum, step) => sum + (step.inserted || 0), 0)
    return res.json({
      message: inserted
        ? `Inserted ${inserted} row${inserted === 1 ? '' : 's'} of starter content.`
        : 'Nothing to insert — every table already has data.',
      report: payload.report,
      tables: payload.tables,
    })
  } catch (error) {
    return res
      .status(500)
      .json({ message: error?.sqlMessage || error?.message || 'Seeding failed' })
  }
})

export default router
