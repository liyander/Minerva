import mysql from 'mysql2/promise'
import { env } from '../config/env.js'
import {
  applyColumnMigrations,
  createCoreTables,
  createDatabaseIfMissing,
  getTableStatus,
} from './schema.js'
import { seedStarterData } from './seeder.js'

// CLI entry point (`npm run db:init`). The schema and seed content live in
// schema.js / seeder.js, which the admin Database screen uses as well.
async function main() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  })

  try {
    await createDatabaseIfMissing(conn)
    await createCoreTables(conn)

    const columns = await applyColumnMigrations(conn)
    if (columns.length) {
      console.log(`  Added ${columns.length} missing column(s).`)
    }

    const report = await seedStarterData(conn)
    for (const step of report) {
      if (step.skipped) {
        console.log(`  ${step.table}: skipped (${step.skipped})`)
      } else {
        console.log(`  ${step.table}: inserted ${step.inserted} row(s)`)
      }
    }

    const status = await getTableStatus(conn)
    const missing = status.filter((table) => !table.exists).map((table) => table.name)
    if (missing.length) {
      console.log(
        `  Note: ${missing.length} feature table(s) are created on first use: ${missing.join(', ')}`,
      )
    }
  } finally {
    await conn.end()
  }
}

main()
  .then(() => {
    console.log('Database initialized and seeded successfully.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message)
    process.exit(1)
  })
