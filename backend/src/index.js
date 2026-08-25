import app from './app.js'
import { env } from './config/env.js'
import { testConnection, initializeDatabaseIfNeeded } from './db/pool.js'
import { setupRoomTerminalWebSocket } from './routes/rooms.routes.js'
import { setupCommunityWebSocket } from './routes/community.routes.js'
import { startReminderSchedule } from './services/reminders.js'
import './services/reportWorker.js'

async function start() {
  try {
    await initializeDatabaseIfNeeded()
    await testConnection()
    const server = app.listen(env.port, env.host, () => {
      console.log(`✓ Minerva backend listening on http://${env.host}:${env.port}`)
      console.log(`  Default credentials:`)
      console.log(`    operator01 / RedTeam@123`)
      console.log(`    admin01 / AdminControl@123`)
    })

    setupRoomTerminalWebSocket(server)
    setupCommunityWebSocket(server)
    startReminderSchedule()

    server.on('error', (error) => {
      if (error?.code === 'EADDRINUSE') {
        console.error(
          `Port ${env.port} is already in use. Stop the existing process or set a different PORT in backend/.env.`,
        )
      } else {
        console.error('Server listen error:', error)
      }
      process.exit(1)
    })
  } catch (error) {
    console.error('Failed to start backend')
    console.error({
      message: error?.message,
      code: error?.code,
      errno: error?.errno,
      sqlState: error?.sqlState,
      sqlMessage: error?.sqlMessage,
      stack: error?.stack,
    })
    process.exit(1)
  }
}

start()

