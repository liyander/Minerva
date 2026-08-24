import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import {
  defaultCareerPaths,
  defaultPlatformConfig,
  defaultRooms,
  defaultUsers,
} from '../seed/defaultData.js'

async function ensureDatabase() {
  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  })

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\``)
  await connection.query(`USE \`${env.db.database}\``)

  const addColumnIfMissing = async (tableName, columnName, definitionSql) => {
    const [rows] = await connection.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
      [env.db.database, tableName, columnName],
    )

    if (!rows.length) {
      await connection.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`)
    }
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      registration_number VARCHAR(64) UNIQUE,
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role ENUM('operator', 'admin') NOT NULL,
      hackthebox_profile TEXT,
      tryhackme_profile TEXT,
      picoctf_profile TEXT,
      github_profile TEXT,
      linkedin_profile TEXT,
      resume_url TEXT,
      about_me TEXT,
      projects LONGTEXT,
      achievements LONGTEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      id INT PRIMARY KEY,
      routes_json JSON NOT NULL,
      features_json JSON NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id VARCHAR(191) PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      category VARCHAR(120),
      level VARCHAR(50),
      level_tone VARCHAR(60),
      dot_tone VARCHAR(60),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      xp VARCHAR(50),
      difficulty VARCHAR(50),
      estimate_time VARCHAR(80),
      environment VARCHAR(255),
      category_tag VARCHAR(120),
      content_markdown LONGTEXT,
      content_html LONGTEXT,
      mission_overview LONGTEXT,
      remediation_protocols LONGTEXT,
      vulnerability_definition LONGTEXT,
      vulnerability_impact LONGTEXT,
      technical_deep_dive LONGTEXT,
      youtube_video_url TEXT,
      questions_enabled BOOLEAN DEFAULT false,
      questions_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_tags (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(191) NOT NULL,
      tag VARCHAR(120) NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_required_keywords (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id VARCHAR(191) NOT NULL,
      keyword VARCHAR(120) NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_room_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      room_id VARCHAR(191) NOT NULL,
      started_at DATETIME NULL,
      completed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_room_progress (user_id, room_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_room_question_progress (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      room_id VARCHAR(191) NOT NULL,
      question_id VARCHAR(191) NOT NULL,
      answered_correctly BOOLEAN DEFAULT false,
      answered_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_room_question (user_id, room_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS career_paths (
      id VARCHAR(191) PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      icon VARCHAR(80),
      learning_path_level VARCHAR(50),
      difficulty VARCHAR(50),
      estimated_hours INT DEFAULT 0,
      enrolled_count INT DEFAULT 0,
      mastery INT DEFAULT 0,
      color VARCHAR(50),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS career_path_modules (
      id VARCHAR(191) PRIMARY KEY,
      career_path_id VARCHAR(191) NOT NULL,
      phase VARCHAR(100),
      title VARCHAR(255) NOT NULL,
      description TEXT,
      module_image_data LONGTEXT,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (career_path_id) REFERENCES career_paths(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS career_path_module_rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      module_id VARCHAR(191) NOT NULL,
      room_id VARCHAR(191) NOT NULL,
      sort_order INT DEFAULT 0,
      FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS career_path_resources (
      id VARCHAR(191) PRIMARY KEY,
      career_path_id VARCHAR(191) NOT NULL,
      title VARCHAR(255) NOT NULL,
      url TEXT,
      type VARCHAR(80),
      sort_order INT DEFAULT 0,
      FOREIGN KEY (career_path_id) REFERENCES career_paths(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) DEFAULT 'info',
      is_active BOOLEAN DEFAULT true,
      target_user_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ctf_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      registration_deadline DATETIME NOT NULL,
      live_time DATETIME NOT NULL,
      registration_link TEXT NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ctf_event_registrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ctf_event_id INT NOT NULL,
      user_id INT NOT NULL,
      registered BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ctf_user (ctf_event_id, user_id),
      FOREIGN KEY (ctf_event_id) REFERENCES ctf_events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ctf_notification_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ctf_event_id INT NOT NULL,
      user_id INT NOT NULL,
      notification_kind VARCHAR(50) NOT NULL,
      notification_date DATE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_ctf_notification_day (ctf_event_id, user_id, notification_kind, notification_date),
      FOREIGN KEY (ctf_event_id) REFERENCES ctf_events(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  await addColumnIfMissing('users', 'registration_number', 'VARCHAR(64) NULL UNIQUE')
  await addColumnIfMissing('users', 'email', 'VARCHAR(255) NULL UNIQUE')
  await addColumnIfMissing('users', 'hackthebox_profile', 'TEXT NULL')
  await addColumnIfMissing('users', 'tryhackme_profile', 'TEXT NULL')
  await addColumnIfMissing('users', 'picoctf_profile', 'TEXT NULL')
  await addColumnIfMissing('users', 'github_profile', 'TEXT NULL')
  await addColumnIfMissing('users', 'linkedin_profile', 'TEXT NULL')
  await addColumnIfMissing('users', 'resume_url', 'TEXT NULL')
  await addColumnIfMissing('users', 'about_me', 'TEXT NULL')
  await addColumnIfMissing('users', 'projects', 'LONGTEXT NULL')
  await addColumnIfMissing('users', 'achievements', 'LONGTEXT NULL')
  await addColumnIfMissing('users', 'is_active', 'BOOLEAN DEFAULT true')
  await addColumnIfMissing(
    'users',
    'updated_at',
    'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
  )
  await addColumnIfMissing('career_path_modules', 'module_image_data', 'LONGTEXT NULL')
  await addColumnIfMissing('notifications', 'target_user_id', 'INT NULL')
  await addColumnIfMissing('rooms', 'youtube_video_url', 'TEXT NULL')
  await addColumnIfMissing('rooms', 'questions_enabled', 'BOOLEAN DEFAULT false')
  await addColumnIfMissing('rooms', 'questions_json', 'LONGTEXT NULL')

  const [usersCountRows] = await connection.query('SELECT COUNT(*) AS count FROM users')
  if (!usersCountRows[0].count) {
    for (const user of defaultUsers) {
      const hash = await bcrypt.hash(user.password, 10)
      await connection.query(
        'INSERT INTO users (username, registration_number, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [user.username, user.registrationNumber || null, user.email || null, hash, user.role],
      )
    }
  }

  const [configCountRows] = await connection.query('SELECT COUNT(*) AS count FROM platform_config')
  if (!configCountRows[0].count) {
    await connection.query(
      'INSERT INTO platform_config (id, routes_json, features_json) VALUES (1, ?, ?)',
      [JSON.stringify(defaultPlatformConfig.routes), JSON.stringify(defaultPlatformConfig.features)],
    )
  }

  const [roomsCountRows] = await connection.query('SELECT COUNT(*) AS count FROM rooms')
  if (!roomsCountRows[0].count) {
    for (const room of defaultRooms) {
      await connection.query(
        `INSERT INTO rooms (
          id, slug, category, level, level_tone, dot_tone, title, description, xp,
          difficulty, estimate_time, environment, category_tag, content_markdown,
          content_html, mission_overview, remediation_protocols,
          vulnerability_definition, vulnerability_impact, technical_deep_dive
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          room.id,
          room.slug,
          room.category,
          room.level,
          room.levelTone,
          room.dotTone,
          room.title,
          room.description,
          room.xp,
          room.difficulty,
          room.estimateTime,
          room.environment,
          room.categoryTag || null,
          room.content?.markdown || '',
          room.content?.html || '',
          room.content?.missionOverview || '',
          room.content?.remediationProtocols || '',
          room.content?.vulnerabilityBriefing?.definition || '',
          room.content?.vulnerabilityBriefing?.impact || '',
          room.content?.technicalDeepDive || '',
        ],
      )

      for (const tag of room.tags || []) {
        await connection.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [room.id, tag])
      }

      for (const keyword of room.requiredKeywords || []) {
        await connection.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
          room.id,
          keyword,
        ])
      }
    }
  }

  const [pathCountRows] = await connection.query('SELECT COUNT(*) AS count FROM career_paths')
  if (!pathCountRows[0].count) {
    for (const path of defaultCareerPaths) {
      await connection.query(
        `INSERT INTO career_paths (
          id, slug, title, description, icon, learning_path_level,
          difficulty, estimated_hours, enrolled_count, mastery, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          path.id,
          path.slug,
          path.title,
          path.description,
          path.icon || null,
          path.learningPathLevel || null,
          path.difficulty || null,
          path.estimatedHours || 0,
          path.enrolledCount || 0,
          path.mastery || 0,
          path.color || null,
        ],
      )

      for (let i = 0; i < (path.modules || []).length; i += 1) {
        const module = path.modules[i]
        await connection.query(
          'INSERT INTO career_path_modules (id, career_path_id, phase, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [module.id, path.id, module.phase || null, module.title, module.description || null, i],
        )

        for (let j = 0; j < (module.rooms || []).length; j += 1) {
          await connection.query(
            'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
            [module.id, module.rooms[j], j],
          )
        }
      }

      for (let i = 0; i < (path.resources || []).length; i += 1) {
        const resource = path.resources[i]
        await connection.query(
          'INSERT INTO career_path_resources (id, career_path_id, title, url, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [resource.id, path.id, resource.title, resource.url || null, resource.type || null, i],
        )
      }
    }
  }

  await connection.end()
}

ensureDatabase()
  .then(() => {
    console.log('Database initialized and seeded successfully.')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Database initialization failed:', error.message)
    process.exit(1)
  })
