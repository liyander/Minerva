// Schema for the second wave of platform features: assignment grading with
// rubrics, question banks, cohorts and mandatory training, stored file objects,
// lecture progress, password resets and the admin audit log.

export const PLATFORM_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS file_objects (
    id VARCHAR(64) PRIMARY KEY,
    owner_id INT NULL,
    driver VARCHAR(20) NOT NULL DEFAULT 'local',
    storage_key VARCHAR(512) NOT NULL,
    bucket VARCHAR(191) NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(191),
    byte_size BIGINT DEFAULT 0,
    checksum VARCHAR(128),
    purpose VARCHAR(40) DEFAULT 'general',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_file_owner (owner_id),
    INDEX idx_file_purpose (purpose),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS question_banks (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(120) NOT NULL,
    owner_id INT NULL,
    is_shared BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_bank_subject (subject),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS question_bank_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    bank_id BIGINT NOT NULL,
    prompt TEXT NOT NULL,
    options_json LONGTEXT NOT NULL,
    correct_index INT NOT NULL DEFAULT 0,
    explanation TEXT,
    marks INT DEFAULT 1,
    difficulty VARCHAR(20) DEFAULT 'medium',
    tags VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_bank_item (bank_id, difficulty),
    FOREIGN KEY (bank_id) REFERENCES question_banks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    brief LONGTEXT,
    subject VARCHAR(120) NOT NULL,
    room_id VARCHAR(191) NULL,
    created_by INT NULL,
    submission_kind VARCHAR(30) NOT NULL DEFAULT 'file',
    max_score INT DEFAULT 100,
    pass_score INT DEFAULT 50,
    allow_resubmission BOOLEAN DEFAULT true,
    opens_at DATETIME NULL,
    deadline DATETIME NULL,
    late_submission BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    attachment_file_id VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assignment_subject (subject, is_published),
    INDEX idx_assignment_creator (created_by),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    FOREIGN KEY (attachment_file_id) REFERENCES file_objects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS assignment_rubric_criteria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    max_points INT NOT NULL DEFAULT 10,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rubric_templates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    owner_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(120) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_rubric_template_owner (owner_id, subject),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS rubric_template_criteria (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    template_id BIGINT NOT NULL,
    label VARCHAR(255) NOT NULL,
    description TEXT,
    max_points INT NOT NULL DEFAULT 10,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (template_id) REFERENCES rubric_templates(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignment_submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    body_text LONGTEXT,
    link_url TEXT,
    file_id VARCHAR(64) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    is_late BOOLEAN DEFAULT false,
    attempt_number INT DEFAULT 1,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    score INT NULL,
    passed BOOLEAN NULL,
    feedback LONGTEXT,
    graded_by INT NULL,
    graded_at DATETIME NULL,
    UNIQUE KEY uniq_submission (assignment_id, user_id),
    INDEX idx_submission_status (assignment_id, status),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES file_objects(id) ON DELETE SET NULL,
    FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS assignment_rubric_scores (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    submission_id BIGINT NOT NULL,
    criterion_id BIGINT NOT NULL,
    points INT NOT NULL DEFAULT 0,
    comment TEXT,
    UNIQUE KEY uniq_rubric_score (submission_id, criterion_id),
    FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE,
    FOREIGN KEY (criterion_id) REFERENCES assignment_rubric_criteria(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assignment_submission_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    original_submission_id BIGINT NULL,
    assignment_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    body_text LONGTEXT,
    link_url TEXT,
    file_id VARCHAR(64) NULL,
    status VARCHAR(20) NOT NULL,
    is_late BOOLEAN DEFAULT false,
    attempt_number INT NOT NULL,
    submitted_at DATETIME NULL,
    score INT NULL,
    passed BOOLEAN NULL,
    feedback LONGTEXT,
    graded_by INT NULL,
    graded_at DATETIME NULL,
    rubric_scores_json LONGTEXT NULL,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_submission_history_user (assignment_id, user_id, attempt_number),
    FOREIGN KEY (original_submission_id) REFERENCES assignment_submissions(id) ON DELETE SET NULL,
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES file_objects(id) ON DELETE SET NULL,
    FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS cohorts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    code VARCHAR(60) UNIQUE,
    description TEXT,
    department VARCHAR(120),
    starts_on DATE NULL,
    ends_on DATE NULL,
    owner_id INT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cohort_active (is_active),
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS cohort_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    cohort_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    member_role VARCHAR(20) NOT NULL DEFAULT 'trainee',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_cohort_member (cohort_id, user_id),
    INDEX idx_member_user (user_id),
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS training_requirements (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    room_id VARCHAR(191) NULL,
    career_path_id VARCHAR(191) NULL,
    assessment_id BIGINT NULL,
    cohort_id BIGINT NULL,
    department VARCHAR(120) NULL,
    applies_to_all BOOLEAN DEFAULT false,
    due_on DATE NULL,
    is_mandatory BOOLEAN DEFAULT true,
    is_active BOOLEAN DEFAULT true,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_requirement_active (is_active, due_on),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (career_path_id) REFERENCES career_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    FOREIGN KEY (cohort_id) REFERENCES cohorts(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS module_prerequisites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    module_id VARCHAR(191) NOT NULL,
    requires_module_id VARCHAR(191) NOT NULL,
    UNIQUE KEY uniq_module_prerequisite (module_id, requires_module_id),
    FOREIGN KEY (module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE,
    FOREIGN KEY (requires_module_id) REFERENCES career_path_modules(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS lecture_progress (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    library_item_id BIGINT NOT NULL,
    position_seconds INT DEFAULT 0,
    duration_seconds INT DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    last_viewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_lecture_progress (user_id, library_item_id),
    INDEX idx_lecture_recent (user_id, last_viewed_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (library_item_id) REFERENCES trainer_library_items(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_reset_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id INT NULL,
    actor_username VARCHAR(64),
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(60),
    entity_id VARCHAR(191),
    summary VARCHAR(500),
    metadata_json LONGTEXT,
    ip_address VARCHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_actor (actor_id, created_at),
    INDEX idx_audit_action (action, created_at),
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS email_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    template VARCHAR(60),
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    error_text TEXT,
    dedupe_key VARCHAR(191) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_email_dedupe (dedupe_key),
    INDEX idx_email_created (created_at)
  );
`

export const PLATFORM_TABLES = [
  'file_objects',
  'question_banks',
  'question_bank_items',
  'assignments',
  'assignment_rubric_criteria',
  'rubric_templates',
  'rubric_template_criteria',
  'assignment_submissions',
  'assignment_rubric_scores',
  'assignment_submission_history',
  'cohorts',
  'cohort_members',
  'training_requirements',
  'module_prerequisites',
  'lecture_progress',
  'password_reset_tokens',
  'audit_log',
  'email_log',
]

export const PLATFORM_COLUMN_MIGRATIONS = [
  // Question-bank driven assessments draw a random subset per attempt.
  ['assessments', 'bank_id', 'BIGINT NULL'],
  ['assessments', 'draw_count', 'INT DEFAULT 0'],
  ['assessments', 'shuffle_questions', 'BOOLEAN DEFAULT false'],
  ['assessments', 'shuffle_options', 'BOOLEAN DEFAULT false'],
  // Attempts store the drawn question order so review matches what was shown.
  ['assessment_attempts', 'question_order_json', 'LONGTEXT NULL'],
  // Library items move to the object store; the legacy inline columns stay.
  ['trainer_library_items', 'file_object_id', 'VARCHAR(64) NULL'],
  ['trainer_library_items', 'duration_seconds', 'INT DEFAULT 0'],
  // Notes can be attached to a course.
  ['user_notes', 'room_id', 'VARCHAR(191) NULL'],
  ['user_notes', 'library_item_id', 'BIGINT NULL'],
  // Certificates issued for an assessment rather than a whole path.
  ['certificates', 'assessment_id', 'BIGINT NULL'],
  ['certificates', 'source', "VARCHAR(30) DEFAULT 'path'"],
  // Cohort shortcut on the user row for cheap filtering.
  ['users', 'primary_cohort_id', 'BIGINT NULL'],
]
