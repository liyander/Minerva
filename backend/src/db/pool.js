import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'
import { env } from '../config/env.js'
import {
  defaultUsers,
  defaultPlatformConfig,
  defaultRooms,
  defaultCareerPaths,
} from '../seed/defaultData.js'
import {
  applyColumnMigrations,
  createCoreTables,
  createDatabaseIfMissing,
  getTableStatus,
} from './schema.js'
import { seedStarterData } from './seeder.js'

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  waitForConnections: true,
  connectionLimit: 50,
  queueLimit: 0,
  namedPlaceholders: true,
})

export async function testConnection() {
  const connection = await pool.getConnection()
  try {
    await connection.query('SELECT 1')
  } finally {
    connection.release()
  }
}

export async function initializeDatabaseIfNeeded() {
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
    const addedColumns = await applyColumnMigrations(conn)
    await seedStarterData(conn)

    const status = await getTableStatus(conn)
    const missing = status.filter((table) => !table.exists).map((table) => table.name)
    if (missing.length) {
      throw new Error(`Database migration incomplete; missing tables: ${missing.join(', ')}`)
    }

    console.log(
      `✓ Database schema ready (${status.length} tables, ${addedColumns.length} columns added)`,
    )
  } finally {
    await conn.end()
  }
}

// Retained temporarily for compatibility while deployments move to the
// centralized, incremental schema initializer above.
export async function initializeDatabaseLegacyIfNeeded() {
  const conn = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    multipleStatements: true,
  })

  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${env.db.database}\``)
    await conn.query(`USE \`${env.db.database}\``)

    const addColumnIfMissing = async (tableName, columnName, definitionSql) => {
      const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ? AND column_name = ? LIMIT 1`,
        [env.db.database, tableName, columnName],
      )

      if (!rows.length) {
        await conn.query(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definitionSql}`)
      }
    }

    const [tableCheck] = await conn.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema = ? AND table_name = 'users' LIMIT 1",
      [env.db.database],
    )

    if (tableCheck.length > 0) {
      // Run additive schema migrations for existing databases.
      await conn.query(`
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

        CREATE TABLE IF NOT EXISTS cves (
          id INT AUTO_INCREMENT PRIMARY KEY,
          cve_id VARCHAR(100) NOT NULL UNIQUE,
          short_description TEXT NOT NULL,
          found_year INT,
          credit VARCHAR(255),
          vulnerability_report LONGTEXT,
          method_followed LONGTEXT,
          references_text LONGTEXT,
          publication_title VARCHAR(255) NULL,
          publication_source_url TEXT NULL,
          publication_date DATE NULL,
          publication_image_data LONGTEXT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
      `)

      await conn.query("ALTER TABLE users MODIFY COLUMN role VARCHAR(30) NOT NULL DEFAULT 'operator'")
      await addColumnIfMissing('users', 'registration_number', 'VARCHAR(64) NULL UNIQUE')
      await addColumnIfMissing('users', 'first_name', 'VARCHAR(120) NULL')
      await addColumnIfMissing('users', 'last_name', 'VARCHAR(120) NULL')
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
      await addColumnIfMissing('users', 'last_login_at', 'DATETIME NULL')
      await addColumnIfMissing('users', 'last_seen_at', 'DATETIME NULL')
      await addColumnIfMissing(
        'users',
        'updated_at',
        'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP',
      )
      await addColumnIfMissing('platform_config', 'ai_json', 'JSON NULL')
      await addColumnIfMissing('platform_config', 'api_json', 'JSON NULL')
      await addColumnIfMissing('cves', 'publication_title', 'VARCHAR(255) NULL')
      await addColumnIfMissing('cves', 'publication_source_url', 'TEXT NULL')
      await addColumnIfMissing('cves', 'publication_date', 'DATE NULL')
      await addColumnIfMissing('cves', 'publication_image_data', 'LONGTEXT NULL')
      await addColumnIfMissing('career_path_modules', 'module_image_data', 'LONGTEXT NULL')
      await addColumnIfMissing('career_path_modules', 'linked_path_id', 'VARCHAR(191) NULL')
      await addColumnIfMissing('notifications', 'target_user_id', 'INT NULL')
      await addColumnIfMissing('ctf_events', 'weight', 'DECIMAL(8,2) DEFAULT 0')
      await addColumnIfMissing('ctf_events', 'source', "VARCHAR(50) DEFAULT 'manual'")
      await addColumnIfMissing('ctf_events', 'ctftime_event_id', 'INT NULL')
      await addColumnIfMissing('ctf_events', 'ctftime_url', 'TEXT NULL')
      await addColumnIfMissing('ctf_events', 'event_format', 'VARCHAR(120) NULL')
      await addColumnIfMissing('career_paths', 'certificate_image_data', 'LONGTEXT NULL')
      await addColumnIfMissing('career_paths', 'roadmap_sort_order', 'INT DEFAULT 0')
      await addColumnIfMissing('rooms', 'youtube_video_url', 'TEXT NULL')
      await addColumnIfMissing('rooms', 'practical_ai_questions_enabled', 'BOOLEAN DEFAULT false')
      await addColumnIfMissing('rooms', 'attachment_name', 'VARCHAR(255) NULL')
      await addColumnIfMissing('rooms', 'attachment_type', 'VARCHAR(255) NULL')
      await addColumnIfMissing('rooms', 'attachment_size', 'INT DEFAULT 0')
      await addColumnIfMissing('rooms', 'attachment_data', 'LONGTEXT NULL')
      await addColumnIfMissing('rooms', 'docker_enabled', 'BOOLEAN DEFAULT false')
      await addColumnIfMissing('rooms', 'docker_image', 'VARCHAR(512) NULL')
      await addColumnIfMissing('rooms', 'docker_container_port', 'INT DEFAULT 0')
      await addColumnIfMissing('rooms', 'docker_protocol', "VARCHAR(20) DEFAULT 'http'")
      await addColumnIfMissing('rooms', 'docker_timeout_minutes', 'INT DEFAULT 120')
      await addColumnIfMissing('rooms', 'docker_instructions', 'LONGTEXT NULL')
      await addColumnIfMissing('rooms', 'docker_terminal_tools', 'LONGTEXT NULL')
      await addColumnIfMissing('rooms', 'docker_expose_attachment_to_terminal', 'BOOLEAN DEFAULT false')
      await addColumnIfMissing('rooms', 'docker_terminal_mode', "VARCHAR(20) DEFAULT 'service'")
      await addColumnIfMissing('rooms', 'docker_terminal_image', 'VARCHAR(512) NULL')
      await conn.query(`
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
        )
      `)
      await conn.query('ALTER TABLE user_room_docker_instances MODIFY COLUMN host_port INT NULL')
      await conn.query(`
        CREATE TABLE IF NOT EXISTS docker_config (
          id INT PRIMARY KEY,
          hostname VARCHAR(255),
          display_host VARCHAR(255),
          tls_enabled BOOLEAN DEFAULT false,
          ca_cert LONGTEXT,
          client_cert LONGTEXT,
          client_key LONGTEXT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `)
      await addColumnIfMissing('rooms', 'questions_enabled', 'BOOLEAN DEFAULT false')
      await addColumnIfMissing('rooms', 'questions_json', 'LONGTEXT NULL')
      await addColumnIfMissing('rooms', 'room_type', "VARCHAR(30) NOT NULL DEFAULT 'theoretical'")
      await addColumnIfMissing('user_room_question_progress', 'answer_text', 'LONGTEXT NULL')
      await addColumnIfMissing('admin_ai_chat_history', 'session_id', 'BIGINT NULL')
      await addColumnIfMissing('certificates', 'first_name', 'VARCHAR(120) NULL')
      await addColumnIfMissing('certificates', 'last_name', 'VARCHAR(120) NULL')
      await addColumnIfMissing('certificates', 'artwork_data', 'LONGTEXT NULL')

      console.log('✓ Database tables already initialized')
      return
    }

    console.log('📦 Creating database tables and seeding default data...')

    await conn.query(`
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

      CREATE TABLE IF NOT EXISTS platform_config (
        id INT PRIMARY KEY,
        routes_json JSON NOT NULL,
        features_json JSON NOT NULL,
        ai_json JSON NULL,
        api_json JSON NULL,
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
        publication_title VARCHAR(255) NULL,
        publication_source_url TEXT NULL,
        publication_date DATE NULL,
        publication_image_data LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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
    `)

    for (const user of defaultUsers) {
      const hash = await bcrypt.hash(user.password, 10)
      await conn.query(
        'INSERT INTO users (username, registration_number, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        [
          user.username,
          user.registrationNumber || null,
          user.email || null,
          hash,
          user.role,
        ],
      )
    }

    await conn.query('INSERT INTO platform_config (id, routes_json, features_json, ai_json, api_json) VALUES (1, ?, ?, ?, ?)', [
      JSON.stringify(defaultPlatformConfig.routes),
      JSON.stringify(defaultPlatformConfig.features),
      JSON.stringify(defaultPlatformConfig.ai || {}),
      JSON.stringify(defaultPlatformConfig.api || {}),
    ])

    for (const room of defaultRooms) {
      await conn.query(
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
        await conn.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [room.id, tag])
      }

      for (const keyword of room.requiredKeywords || []) {
        await conn.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
          room.id,
          keyword,
        ])
      }
    }

    for (const path of defaultCareerPaths) {
      await conn.query(
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
        await conn.query(
          'INSERT INTO career_path_modules (id, career_path_id, phase, title, description, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [module.id, path.id, module.phase || null, module.title, module.description || null, i],
        )

        for (let j = 0; j < (module.rooms || []).length; j += 1) {
          await conn.query(
            'INSERT INTO career_path_module_rooms (module_id, room_id, sort_order) VALUES (?, ?, ?)',
            [module.id, module.rooms[j], j],
          )
        }
      }

      for (let i = 0; i < (path.resources || []).length; i += 1) {
        const resource = path.resources[i]
        await conn.query(
          'INSERT INTO career_path_resources (id, career_path_id, title, url, type, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
          [resource.id, path.id, resource.title, resource.url || null, resource.type || null, i],
        )
      }
    }

    console.log('✓ Database initialization completed!')
  } finally {
    await conn.end()
  }
}

