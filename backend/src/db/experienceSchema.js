export const EXPERIENCE_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS module_gating_overrides (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_id VARCHAR(191) NOT NULL,
    user_id INT NOT NULL,
    granted_by INT NULL,
    reason VARCHAR(500),
    expires_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_module_override (module_id, user_id),
    FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    event_type VARCHAR(40) NOT NULL DEFAULT 'class',
    starts_at DATETIME NOT NULL,
    ends_at DATETIME NOT NULL,
    trainer_id INT NULL,
    cohort_id BIGINT NULL,
    room_id VARCHAR(191) NULL,
    module_id VARCHAR(191) NULL,
    assessment_id BIGINT NULL,
    meeting_url TEXT,
    capacity INT DEFAULT 0,
    checkin_code VARCHAR(32),
    shortage_threshold DECIMAL(5,2) DEFAULT 75,
    is_published BOOLEAN DEFAULT true,
    created_by INT NULL,
    integration_data_json LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_event_dates (starts_at, ends_at),
    INDEX idx_event_cohort (cohort_id, starts_at),
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE SET NULL,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'absent',
    checkin_at DATETIME NULL,
    joined_at DATETIME NULL,
    left_at DATETIME NULL,
    absence_reason TEXT,
    notes TEXT,
    recorded_by INT NULL,
    corrected_by INT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_event_attendee (event_id, user_id),
    INDEX idx_attendance_user (user_id, status),
    FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (corrected_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    reason TEXT NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_leave_event_user (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS live_session_content (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    event_id BIGINT NOT NULL UNIQUE,
    recording_file_id VARCHAR(64) NULL,
    transcript LONGTEXT,
    materials_json LONGTEXT,
    follow_up_json LONGTEXT,
    published_at DATETIME NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES calendar_events(id) ON DELETE CASCADE,
    FOREIGN KEY (recording_file_id) REFERENCES file_objects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS gradebook_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'manual',
    room_id VARCHAR(191) NULL,
    cohort_id BIGINT NULL,
    max_score DECIMAL(10,2) DEFAULT 100,
    weight DECIMAL(8,2) DEFAULT 1,
    pass_score DECIMAL(10,2) DEFAULT 50,
    grading_scale_json LONGTEXT,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS gradebook_entries (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    item_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    score DECIMAL(10,2) NOT NULL,
    letter_grade VARCHAR(20),
    grade_points DECIMAL(5,2),
    outcome VARCHAR(80),
    feedback TEXT,
    moderation_status VARCHAR(20) DEFAULT 'released',
    graded_by INT NULL,
    moderated_by INT NULL,
    graded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_grade_item_user (item_id, user_id),
    FOREIGN KEY (item_id) REFERENCES gradebook_items(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS gradebook_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    entry_id BIGINT NOT NULL,
    old_score DECIMAL(10,2),
    new_score DECIMAL(10,2),
    changed_by INT NULL,
    reason VARCHAR(500),
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (entry_id) REFERENCES gradebook_entries(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS learning_projects (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description LONGTEXT,
    project_type VARCHAR(30) DEFAULT 'individual',
    privacy VARCHAR(30) DEFAULT 'private',
    cohort_id BIGINT NULL,
    mentor_id INT NULL,
    review_on DATE NULL,
    rubric_json LONGTEXT,
    status VARCHAR(30) DEFAULT 'active',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE SET NULL,
    FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS learning_project_members (
    project_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    member_role VARCHAR(40) DEFAULT 'member',
    PRIMARY KEY (project_id, user_id),
    FOREIGN KEY (project_id) REFERENCES learning_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS project_milestones (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    project_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_on DATE NULL,
    status VARCHAR(30) DEFAULT 'pending',
    evidence_url TEXT,
    score DECIMAL(10,2) NULL,
    feedback TEXT,
    reviewed_by INT NULL,
    reviewed_at DATETIME NULL,
    FOREIGN KEY (project_id) REFERENCES learning_projects(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS portfolio_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    project_id BIGINT NULL,
    title VARCHAR(255) NOT NULL,
    description LONGTEXT,
    evidence_url TEXT,
    skills_json LONGTEXT,
    reflection LONGTEXT,
    privacy VARCHAR(30) DEFAULT 'private',
    is_approved BOOLEAN DEFAULT false,
    approved_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES learning_projects(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS skill_evidence (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    skill VARCHAR(191) NOT NULL,
    proficiency VARCHAR(40) DEFAULT 'beginner',
    evidence_type VARCHAR(40) DEFAULT 'declared',
    evidence_label VARCHAR(255),
    evidence_url TEXT,
    verified_by INT NULL,
    demonstrated_at DATE NULL,
    expires_at DATE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_skill_passport_user (user_id, skill),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (verified_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS public_profile_shares (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    share_type VARCHAR(30) NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    include_json LONGTEXT,
    expires_at DATETIME NULL,
    revoked_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dynamic_progression_rules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_id VARCHAR(191) NOT NULL,
    rule_type VARCHAR(50) NOT NULL DEFAULT 'min_assessment_score',
    target_id VARCHAR(191) NULL,
    required_value DECIMAL(10,2) NOT NULL DEFAULT 80.00,
    config_json LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_progression_module (module_id),
    FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_milestone_achievements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    milestone_key VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50) DEFAULT 'general',
    badge_icon VARCHAR(80) DEFAULT 'military_tech',
    xp_awarded INT DEFAULT 0,
    achieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_milestone (user_id, milestone_key),
    INDEX idx_user_milestones (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_progression_recommendations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    item_type VARCHAR(50) NOT NULL,
    item_id VARCHAR(191) NOT NULL,
    title VARCHAR(255) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    action_url VARCHAR(255) NOT NULL,
    status VARCHAR(30) DEFAULT 'suggested',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_recommendations (user_id, status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`

export const EXPERIENCE_TABLES = [
  'module_gating_overrides', 'calendar_events', 'attendance_records', 'leave_requests',
  'live_session_content', 'gradebook_items', 'gradebook_entries', 'gradebook_history',
  'learning_projects', 'learning_project_members', 'project_milestones', 'portfolio_items',
  'skill_evidence', 'public_profile_shares',
  'dynamic_progression_rules', 'user_milestone_achievements', 'user_progression_recommendations',
]

export const EXPERIENCE_COLUMN_MIGRATIONS = [
  ['user_notes', 'module_id', 'VARCHAR(191) NULL'],
  ['user_notes', 'timestamp_seconds', 'INT NULL'],
]
