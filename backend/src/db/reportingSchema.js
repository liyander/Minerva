export const REPORTING_TABLE_DDL = `
  CREATE TABLE IF NOT EXISTS report_jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    report_type VARCHAR(50) NOT NULL,
    format VARCHAR(10) NOT NULL DEFAULT 'csv',
    filters_json JSON,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    file_url TEXT,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME NULL,
    INDEX idx_report_jobs_user (user_id, created_at),
    INDEX idx_report_jobs_status (status),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`

export const REPORTING_TABLES = ['report_jobs']

