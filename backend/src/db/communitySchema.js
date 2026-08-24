// Schema for the community/classroom domain: Slack-style channels and
// threaded messages, admin/trainer-created classrooms, GitHub-style
// discussion issues, and Classroom-style assignments.

export const COMMUNITY_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS classrooms (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    created_by INT NULL,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS classroom_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    classroom_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    classroom_role VARCHAR(20) NOT NULL DEFAULT 'student',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_classroom_member (classroom_id, user_id),
    INDEX idx_classroom_member_user (user_id),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS community_channels (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    classroom_id BIGINT NULL,
    name VARCHAR(80) NOT NULL,
    topic VARCHAR(255),
    kind VARCHAR(20) NOT NULL DEFAULT 'general',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_channel_classroom (classroom_id),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS community_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    channel_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    parent_message_id BIGINT NULL,
    body MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at DATETIME NULL,
    deleted_at DATETIME NULL,
    INDEX idx_message_channel (channel_id, created_at),
    INDEX idx_message_parent (parent_message_id),
    FOREIGN KEY (channel_id) REFERENCES community_channels(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_message_id) REFERENCES community_messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS community_message_reactions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    message_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_reaction (message_id, user_id, emoji),
    FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS discussion_labels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(60) NOT NULL UNIQUE,
    color VARCHAR(20) NOT NULL DEFAULT '#6366f1'
  );

  CREATE TABLE IF NOT EXISTS discussion_issues (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    classroom_id BIGINT NULL,
    title VARCHAR(255) NOT NULL,
    body MEDIUMTEXT,
    author_id INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    accepted_comment_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_issue_classroom (classroom_id, status),
    INDEX idx_issue_status (status),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS discussion_issue_labels (
    issue_id BIGINT NOT NULL,
    label_id INT NOT NULL,
    PRIMARY KEY (issue_id, label_id),
    FOREIGN KEY (issue_id) REFERENCES discussion_issues(id) ON DELETE CASCADE,
    FOREIGN KEY (label_id) REFERENCES discussion_labels(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS discussion_comments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    issue_id BIGINT NOT NULL,
    author_id INT NOT NULL,
    parent_comment_id BIGINT NULL,
    body MEDIUMTEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_comment_issue (issue_id, created_at),
    FOREIGN KEY (issue_id) REFERENCES discussion_issues(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_comment_id) REFERENCES discussion_comments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS classroom_assignments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    classroom_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description MEDIUMTEXT,
    instructions MEDIUMTEXT,
    due_at DATETIME NULL,
    max_marks INT DEFAULT 100,
    submission_type VARCHAR(30) NOT NULL DEFAULT 'text',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assignment_classroom (classroom_id, due_at),
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS classroom_assignment_attachments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    file_name VARCHAR(255),
    file_type VARCHAR(120),
    file_size INT DEFAULT 0,
    file_data LONGTEXT,
    external_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_attachment_assignment (assignment_id),
    FOREIGN KEY (assignment_id) REFERENCES classroom_assignments(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS classroom_assignment_submissions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assignment_id BIGINT NOT NULL,
    student_id INT NOT NULL,
    body MEDIUMTEXT,
    link_url TEXT,
    file_name VARCHAR(255),
    file_type VARCHAR(120),
    file_size INT DEFAULT 0,
    file_data LONGTEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'submitted',
    grade INT NULL,
    feedback TEXT,
    submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    graded_by INT NULL,
    graded_at DATETIME NULL,
    UNIQUE KEY uniq_submission (assignment_id, student_id),
    FOREIGN KEY (assignment_id) REFERENCES classroom_assignments(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (graded_by) REFERENCES users(id) ON DELETE SET NULL
  );
`

export const COMMUNITY_TABLES = [
  'classrooms',
  'classroom_members',
  'community_channels',
  'community_messages',
  'community_message_reactions',
  'discussion_labels',
  'discussion_issues',
  'discussion_issue_labels',
  'discussion_comments',
  'classroom_assignments',
  'classroom_assignment_attachments',
  'classroom_assignment_submissions',
]
