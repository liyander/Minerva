// Schema for the training-platform domain: roles and approval, trainee
// professional profiles, enrolments, subject-wise assessments, the trainer
// library, course feedback, trainer competency mapping and homepage posts.
//
// Courses live in the existing `rooms` table and subjects are the names in
// `room_categories`, so this layer references those rather than duplicating them.

export const TRAINING_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS user_qualifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    qualification VARCHAR(255) NOT NULL,
    institution VARCHAR(255),
    field_of_study VARCHAR(255),
    grade VARCHAR(80),
    start_year INT NULL,
    end_year INT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_qualifications_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_work_experience (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    job_title VARCHAR(255) NOT NULL,
    organisation VARCHAR(255),
    location VARCHAR(255),
    description TEXT,
    started_on DATE NULL,
    ended_on DATE NULL,
    is_current BOOLEAN DEFAULT false,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_experience_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_skills (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    skill VARCHAR(120) NOT NULL,
    proficiency VARCHAR(40) DEFAULT 'Intermediate',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_skill (user_id, skill),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_interests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    interest VARCHAR(120) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_interest (user_id, interest),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_certificates (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    issuer VARCHAR(255),
    credential_id VARCHAR(191),
    credential_url TEXT,
    issued_on DATE NULL,
    expires_on DATE NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(120),
    file_data LONGTEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_certificates_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS course_enrollments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id VARCHAR(191) NULL,
    career_path_id VARCHAR(191) NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    UNIQUE KEY uniq_enrollment_course (user_id, room_id),
    UNIQUE KEY uniq_enrollment_path (user_id, career_path_id),
    INDEX idx_enrollment_user (user_id, status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (career_path_id) REFERENCES career_paths(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assessments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(120) NOT NULL,
    room_id VARCHAR(191) NULL,
    created_by INT NULL,
    kind VARCHAR(30) NOT NULL DEFAULT 'mcq',
    pass_percentage INT DEFAULT 60,
    duration_minutes INT DEFAULT 0,
    max_attempts INT DEFAULT 0,
    opens_at DATETIME NULL,
    deadline DATETIME NULL,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assessment_subject (subject, is_published),
    INDEX idx_assessment_creator (created_by),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS assessment_questions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    prompt TEXT NOT NULL,
    options_json LONGTEXT NOT NULL,
    correct_index INT NOT NULL DEFAULT 0,
    explanation TEXT,
    marks INT DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_question_assessment (assessment_id, sort_order),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS assessment_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    score INT DEFAULT 0,
    max_score INT DEFAULT 0,
    percentage INT DEFAULT 0,
    passed BOOLEAN DEFAULT false,
    answers_json LONGTEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    INDEX idx_attempt_assessment (assessment_id, user_id),
    INDEX idx_attempt_user (user_id, submitted_at),
    FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trainer_library_items (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trainer_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(120),
    room_id VARCHAR(191) NULL,
    item_type VARCHAR(40) NOT NULL DEFAULT 'material',
    external_url TEXT,
    file_name VARCHAR(255),
    file_type VARCHAR(120),
    file_size INT DEFAULT 0,
    file_data LONGTEXT,
    is_published BOOLEAN DEFAULT true,
    download_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_library_trainer (trainer_id),
    INDEX idx_library_subject (subject, is_published),
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS course_feedback (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    room_id VARCHAR(191) NULL,
    career_path_id VARCHAR(191) NULL,
    trainer_id INT NULL,
    rating INT NOT NULL,
    content_rating INT NULL,
    trainer_rating INT NULL,
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_feedback_course (user_id, room_id),
    INDEX idx_feedback_room (room_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    FOREIGN KEY (career_path_id) REFERENCES career_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS trainer_competencies (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    trainer_id INT NOT NULL,
    subject VARCHAR(120) NOT NULL,
    proficiency VARCHAR(40) NOT NULL DEFAULT 'Intermediate',
    proficiency_score INT NOT NULL DEFAULT 3,
    years_experience DECIMAL(4,1) DEFAULT 0,
    is_verified BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_trainer_subject (trainer_id, subject),
    INDEX idx_competency_subject (subject, proficiency_score),
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS homepage_posts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    category VARCHAR(40) NOT NULL DEFAULT 'announcement',
    title VARCHAR(255) NOT NULL,
    body TEXT,
    link_url TEXT,
    image_data LONGTEXT,
    is_published BOOLEAN DEFAULT true,
    pinned BOOLEAN DEFAULT false,
    published_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_homepage_published (is_published, published_at),
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );
`

export const TRAINING_TABLES = [
  'user_qualifications',
  'user_work_experience',
  'user_skills',
  'user_interests',
  'user_certificates',
  'course_enrollments',
  'assessments',
  'assessment_questions',
  'assessment_attempts',
  'trainer_library_items',
  'course_feedback',
  'trainer_competencies',
  'homepage_posts',
]

// Columns added to pre-existing tables for approval workflow and trainer links.
export const TRAINING_COLUMN_MIGRATIONS = [
  ['users', 'approval_status', "VARCHAR(20) NOT NULL DEFAULT 'approved'"],
  ['users', 'approved_by', 'INT NULL'],
  ['users', 'approved_at', 'DATETIME NULL'],
  ['users', 'rejection_reason', 'TEXT NULL'],
  ['users', 'headline', 'VARCHAR(255) NULL'],
  ['users', 'phone', 'VARCHAR(40) NULL'],
  ['users', 'department', 'VARCHAR(120) NULL'],
  ['rooms', 'trainer_id', 'INT NULL'],
]
