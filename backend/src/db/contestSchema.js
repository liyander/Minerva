// Schema for Contests and Live Kahoot-style Quizzes

export const CONTEST_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS contests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(120) DEFAULT 'General',
    course_id VARCHAR(191) NULL,
    trainer_id INT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    join_code VARCHAR(20) NULL,
    current_question_index INT NOT NULL DEFAULT -1,
    current_question_started_at DATETIME NULL,
    leaderboard_duration_seconds INT NOT NULL DEFAULT 6,
    default_time_limit INT NOT NULL DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_contest_trainer (trainer_id),
    INDEX idx_contest_status (status),
    INDEX idx_contest_course (course_id),
    FOREIGN KEY (trainer_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contest_questions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    contest_id BIGINT NOT NULL,
    prompt TEXT NOT NULL,
    options_json LONGTEXT NOT NULL,
    correct_index INT NOT NULL DEFAULT 0,
    time_limit_seconds INT NOT NULL DEFAULT 20,
    points INT NOT NULL DEFAULT 1000,
    explanation TEXT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_contest_q_order (contest_id, sort_order),
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contest_participants (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    contest_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    score INT NOT NULL DEFAULT 0,
    streak INT NOT NULL DEFAULT 0,
    last_answered_index INT NOT NULL DEFAULT -1,
    enrolled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    approved_at DATETIME NULL,
    UNIQUE KEY uq_contest_participant (contest_id, user_id),
    INDEX idx_participant_contest (contest_id, status),
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS contest_answers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    contest_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    participant_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    selected_index INT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    response_time_ms INT NOT NULL DEFAULT 0,
    points_awarded INT NOT NULL DEFAULT 0,
    answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_part_quest_ans (participant_id, question_id),
    INDEX idx_ans_contest_quest (contest_id, question_id),
    FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES contest_questions(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES contest_participants(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`

export const CONTEST_TABLES = [
  'contests',
  'contest_questions',
  'contest_participants',
  'contest_answers',
]

export const CONTEST_COLUMN_MIGRATIONS = []
