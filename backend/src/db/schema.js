import { env } from '../config/env.js'
import {
  TRAINING_COLUMN_MIGRATIONS,
  TRAINING_TABLE_DDL,
  TRAINING_TABLES,
} from './trainingSchema.js'
import { COMMUNITY_TABLE_DDL, COMMUNITY_TABLES } from './communitySchema.js'
import {
  PLATFORM_COLUMN_MIGRATIONS,
  PLATFORM_TABLE_DDL,
  PLATFORM_TABLES,
} from './platformSchema.js'

// Single source of truth for the database shape. Both the CLI initialiser and
// the admin "Database" screen build the schema from here, so they can never
// drift apart.
export const CORE_TABLE_DDL = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(64) NOT NULL UNIQUE,
      registration_number VARCHAR(64) UNIQUE,
      first_name VARCHAR(120),
      last_name VARCHAR(120),
      email VARCHAR(255) UNIQUE,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'operator',
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
      last_login_at DATETIME NULL,
      last_seen_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cves (
      id INT AUTO_INCREMENT PRIMARY KEY,
      cve_id VARCHAR(100) NOT NULL UNIQUE,
      short_description TEXT NOT NULL,
      found_year INT,
      credit VARCHAR(255),
      vulnerability_report LONGTEXT,
      method_followed LONGTEXT,
      references_text LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS platform_config (
      id INT PRIMARY KEY,
      routes_json JSON NOT NULL,
      features_json JSON NOT NULL,
      ai_json JSON NULL,
      api_json JSON NULL,
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
      room_type VARCHAR(30) NOT NULL DEFAULT 'theoretical',
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
      practical_ai_questions_enabled BOOLEAN DEFAULT false,
      attachment_name VARCHAR(255),
      attachment_type VARCHAR(255),
      attachment_size INT DEFAULT 0,
      attachment_data LONGTEXT,
      docker_enabled BOOLEAN DEFAULT false,
      docker_image VARCHAR(512),
      docker_container_port INT DEFAULT 0,
      docker_protocol VARCHAR(20) DEFAULT 'http',
      docker_timeout_minutes INT DEFAULT 120,
      docker_instructions LONGTEXT,
      docker_terminal_tools LONGTEXT,
      docker_expose_attachment_to_terminal BOOLEAN DEFAULT false,
      docker_terminal_mode VARCHAR(20) DEFAULT 'service',
      docker_terminal_image VARCHAR(512),
      questions_enabled BOOLEAN DEFAULT false,
      questions_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS room_categories (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
      answer_text LONGTEXT,
      answered_correctly BOOLEAN DEFAULT false,
      answered_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_room_question (user_id, room_id, question_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_room_theoretical_attempts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      room_id VARCHAR(191) NOT NULL,
      questions_json LONGTEXT NOT NULL,
      answers_json LONGTEXT,
      technical_score INT DEFAULT 0,
      grammar_score INT DEFAULT 0,
      feedback LONGTEXT,
      passed BOOLEAN DEFAULT false,
      evaluated_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_theoretical_user_room (user_id, room_id),
      INDEX idx_theoretical_room_score (room_id, technical_score, grammar_score),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_room_docker_instances (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      room_id VARCHAR(191) NOT NULL,
      container_id VARCHAR(191) NOT NULL,
      container_name VARCHAR(191) NOT NULL,
      host_port INT NULL,
      status VARCHAR(40) DEFAULT 'running',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_user_room_docker (user_id, room_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS docker_config (
      id INT PRIMARY KEY,
      hostname VARCHAR(255),
      display_host VARCHAR(255),
      tls_enabled BOOLEAN DEFAULT false,
      ca_cert LONGTEXT,
      client_cert LONGTEXT,
      client_key LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_notes (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL,
      content LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_user_notes_user_updated (user_id, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
      roadmap_sort_order INT DEFAULT 0,
      certificate_image_data LONGTEXT,
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
      linked_path_id VARCHAR(191) NULL,
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

    CREATE TABLE IF NOT EXISTS certificates (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      certificate_id VARCHAR(80) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      career_path_id VARCHAR(191) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      first_name VARCHAR(120),
      last_name VARCHAR(120),
      path_title VARCHAR(255) NOT NULL,
      artwork_data LONGTEXT,
      issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_certificate_user_path (user_id, career_path_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
      weight DECIMAL(8,2) DEFAULT 0,
      source VARCHAR(50) DEFAULT 'manual',
      ctftime_event_id INT NULL,
      ctftime_url TEXT NULL,
      event_format VARCHAR(120) NULL,
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

    CREATE TABLE IF NOT EXISTS admin_ai_chat_sessions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      title VARCHAR(255) NOT NULL DEFAULT 'New Session',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_ai_session_user_updated (user_id, updated_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS admin_ai_chat_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      session_id BIGINT NULL,
      role ENUM('user', 'assistant') NOT NULL,
      message LONGTEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_admin_ai_chat_user_created (user_id, created_at),
      INDEX idx_admin_ai_chat_session_created (session_id, created_at),
      FOREIGN KEY (session_id) REFERENCES admin_ai_chat_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS developer_api_keys (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(120) NOT NULL,
      key_hash VARCHAR(128) NOT NULL UNIQUE,
      key_prefix VARCHAR(24) NOT NULL,
      scopes_json JSON NULL,
      last_used_at DATETIME NULL,
      revoked_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_developer_keys_user (user_id, revoked_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS developer_documents (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      markdown MEDIUMTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `

// Tables created lazily by feature routes the first time they are used. The
// admin migrate action creates them up front instead.
export const FEATURE_TABLES = [
  'job_listings',
  'student_career_profiles',
  'student_job_recommendations',
  'student_job_applications',
  'interview_practice_sessions',
  'interview_practice_questions',
  'lab_research_projects',
  'lab_research_progress',
  'lab_research_quiz_questions',
  'lab_research_quiz_attempts',
  'lab_research_code_challenges',
  'lab_research_code_submissions',
  'top_player_resumes',
]

export { TRAINING_TABLES, PLATFORM_TABLES }

export const CORE_TABLES = [
  'users',
  'cves',
  'platform_config',
  'rooms',
  'room_categories',
  'room_tags',
  'room_required_keywords',
  'user_room_progress',
  'user_room_question_progress',
  'user_room_theoretical_attempts',
  'user_room_docker_instances',
  'docker_config',
  'user_notes',
  'career_paths',
  'career_path_modules',
  'career_path_module_rooms',
  'career_path_resources',
  'certificates',
  'notifications',
  'ctf_events',
  'ctf_event_registrations',
  'ctf_notification_logs',
  'admin_ai_chat_sessions',
  'admin_ai_chat_history',
  'developer_api_keys',
  'developer_documents',
]

export const EXPECTED_TABLES = [...CORE_TABLES, ...TRAINING_TABLES, ...COMMUNITY_TABLES, ...FEATURE_TABLES]
export const EXPECTED_TABLES = [
  ...CORE_TABLES,
  ...TRAINING_TABLES,
  ...PLATFORM_TABLES,
  ...FEATURE_TABLES,
]

// Additive migrations for databases created by older versions.
const COLUMN_MIGRATIONS = [
  ['users', 'registration_number', 'VARCHAR(64) NULL UNIQUE'],
  ['users', 'first_name', 'VARCHAR(120) NULL'],
  ['users', 'last_name', 'VARCHAR(120) NULL'],
  ['users', 'email', 'VARCHAR(255) NULL UNIQUE'],
  ['users', 'hackthebox_profile', 'TEXT NULL'],
  ['users', 'tryhackme_profile', 'TEXT NULL'],
  ['users', 'picoctf_profile', 'TEXT NULL'],
  ['users', 'github_profile', 'TEXT NULL'],
  ['users', 'linkedin_profile', 'TEXT NULL'],
  ['users', 'resume_url', 'TEXT NULL'],
  ['users', 'about_me', 'TEXT NULL'],
  ['users', 'projects', 'LONGTEXT NULL'],
  ['users', 'achievements', 'LONGTEXT NULL'],
  ['users', 'is_active', 'BOOLEAN DEFAULT true'],
  ['users', 'last_login_at', 'DATETIME NULL'],
  ['users', 'last_seen_at', 'DATETIME NULL'],
  ['users', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'],
  ['platform_config', 'ai_json', 'JSON NULL'],
  ['platform_config', 'api_json', 'JSON NULL'],
  ['career_path_modules', 'module_image_data', 'LONGTEXT NULL'],
  ['career_path_modules', 'linked_path_id', 'VARCHAR(191) NULL'],
  ['notifications', 'target_user_id', 'INT NULL'],
  ['ctf_events', 'weight', 'DECIMAL(8,2) DEFAULT 0'],
  ['ctf_events', 'source', "VARCHAR(50) DEFAULT 'manual'"],
  ['ctf_events', 'ctftime_event_id', 'INT NULL'],
  ['ctf_events', 'ctftime_url', 'TEXT NULL'],
  ['ctf_events', 'event_format', 'VARCHAR(120) NULL'],
  ['career_paths', 'certificate_image_data', 'LONGTEXT NULL'],
  ['career_paths', 'roadmap_sort_order', 'INT DEFAULT 0'],
  ['rooms', 'youtube_video_url', 'TEXT NULL'],
  ['rooms', 'practical_ai_questions_enabled', 'BOOLEAN DEFAULT false'],
  ['rooms', 'attachment_name', 'VARCHAR(255) NULL'],
  ['rooms', 'attachment_type', 'VARCHAR(255) NULL'],
  ['rooms', 'attachment_size', 'INT DEFAULT 0'],
  ['rooms', 'attachment_data', 'LONGTEXT NULL'],
  ['rooms', 'docker_enabled', 'BOOLEAN DEFAULT false'],
  ['rooms', 'docker_image', 'VARCHAR(512) NULL'],
  ['rooms', 'docker_container_port', 'INT DEFAULT 0'],
  ['rooms', 'docker_protocol', "VARCHAR(20) DEFAULT 'http'"],
  ['rooms', 'docker_timeout_minutes', 'INT DEFAULT 120'],
  ['rooms', 'docker_instructions', 'LONGTEXT NULL'],
  ['rooms', 'docker_terminal_tools', 'LONGTEXT NULL'],
  ['rooms', 'docker_expose_attachment_to_terminal', 'BOOLEAN DEFAULT false'],
  ['rooms', 'docker_terminal_mode', "VARCHAR(20) DEFAULT 'service'"],
  ['rooms', 'docker_terminal_image', 'VARCHAR(512) NULL'],
  ['rooms', 'questions_enabled', 'BOOLEAN DEFAULT false'],
  ['rooms', 'questions_json', 'LONGTEXT NULL'],
  ['rooms', 'room_type', "VARCHAR(30) NOT NULL DEFAULT 'theoretical'"],
  ['user_room_question_progress', 'answer_text', 'LONGTEXT NULL'],
  ['admin_ai_chat_history', 'session_id', 'BIGINT NULL'],
]

async function addColumnIfMissing(conn, tableName, columnName, definitionSql) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
    [env.db.database, tableName, columnName],
  )

  if (rows.length) {
    return false
  }

  await conn.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`,
  )
  return true
}

export async function createDatabaseIfMissing(conn) {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\``)
  await conn.query(`USE \`${env.db.database}\``)
}

export async function createCoreTables(conn) {
  await conn.query(CORE_TABLE_DDL)
  // Training-domain tables depend on users/rooms/career_paths, so they run second.
  await conn.query(TRAINING_TABLE_DDL)
  // Community tables depend on users/classrooms, so they run last.
  await conn.query(COMMUNITY_TABLE_DDL)
  return CORE_TABLES.length + TRAINING_TABLES.length + COMMUNITY_TABLES.length
  // Platform tables depend on assessments and trainer_library_items in turn.
  await conn.query(PLATFORM_TABLE_DDL)
  return CORE_TABLES.length + TRAINING_TABLES.length + PLATFORM_TABLES.length
}

export async function applyColumnMigrations(conn) {
  const applied = []

  for (const [table, column, definition] of [
    ...COLUMN_MIGRATIONS,
    ...TRAINING_COLUMN_MIGRATIONS,
    ...PLATFORM_COLUMN_MIGRATIONS,
  ]) {
    try {
      if (await addColumnIfMissing(conn, table, column, definition)) {
        applied.push(`${table}.${column}`)
      }
    } catch (error) {
      // A missing table here means the feature was never installed; skip it.
      if (error?.code !== 'ER_NO_SUCH_TABLE') {
        throw error
      }
    }
  }

  await conn
    .query("ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'operator'")
    .catch(() => {})
  await conn
    .query('ALTER TABLE user_room_docker_instances MODIFY COLUMN host_port INT NULL')
    .catch(() => {})

  return applied
}

// Reports which expected tables exist and how many rows each holds.
export async function getTableStatus(conn) {
  const [rows] = await conn.query(
    `SELECT table_name AS name FROM information_schema.tables WHERE table_schema = ?`,
    [env.db.database],
  )

  const present = new Set(rows.map((row) => String(row.name)))
  const status = []

  for (const name of EXPECTED_TABLES) {
    if (!present.has(name)) {
      status.push({ name, exists: false, rows: 0 })
      continue
    }

    try {
      const [countRows] = await conn.query(`SELECT COUNT(*) AS count FROM \`${name}\``)
      status.push({ name, exists: true, rows: Number(countRows[0]?.count || 0) })
    } catch {
      status.push({ name, exists: true, rows: 0 })
    }
  }

  return status
}
