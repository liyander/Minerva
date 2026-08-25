export const EXPORTS = {
  users: {
    role: 'admin',
    filename: 'users',
    columns: [
      { key: 'id', label: 'ID' },
      { key: 'username', label: 'Username' },
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'role', label: 'Role' },
      { key: 'approval_status', label: 'Approval' },
      { key: 'department', label: 'Department' },
      { key: 'is_active', label: 'Active' },
      { key: 'created_at', label: 'Joined' },
      { key: 'last_login_at', label: 'Last login' },
    ],
    query: `SELECT id, username,
                   TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) AS name,
                   email, role, approval_status, department, is_active, created_at, last_login_at
            FROM users ORDER BY created_at DESC`,
  },
  enrolments: {
    role: 'trainer',
    filename: 'enrolments',
    columns: [
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'target', label: 'Course or path' },
      { key: 'status', label: 'Status' },
      { key: 'enrolled_at', label: 'Enrolled' },
      { key: 'completed_at', label: 'Completed' },
    ],
    query: `SELECT TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, COALESCE(r.title, p.title) AS target, e.status, e.enrolled_at, e.completed_at
            FROM course_enrollments e
            JOIN users u ON u.id = e.user_id
            LEFT JOIN rooms r ON r.id = e.room_id
            LEFT JOIN career_paths p ON p.id = e.career_path_id
            ORDER BY e.enrolled_at DESC`,
  },
  assessmentResults: {
    role: 'trainer',
    filename: 'assessment-results',
    columns: [
      { key: 'assessment', label: 'Assessment' },
      { key: 'subject', label: 'Subject' },
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'score', label: 'Score' },
      { key: 'max_score', label: 'Out of' },
      { key: 'percentage', label: 'Percent' },
      { key: 'passed', label: 'Passed' },
      { key: 'submitted_at', label: 'Submitted' },
    ],
    query: `SELECT a.title AS assessment, a.subject,
                   TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, t.score, t.max_score, t.percentage, t.passed, t.submitted_at
            FROM assessment_attempts t
            JOIN assessments a ON a.id = t.assessment_id
            JOIN users u ON u.id = t.user_id
            WHERE t.submitted_at IS NOT NULL
            ORDER BY t.submitted_at DESC`,
  },
  submissions: {
    role: 'trainer',
    filename: 'assignment-submissions',
    columns: [
      { key: 'assignment', label: 'Assignment' },
      { key: 'subject', label: 'Subject' },
      { key: 'user_name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'score', label: 'Score' },
      { key: 'max_score', label: 'Out of' },
      { key: 'passed', label: 'Passed' },
      { key: 'is_late', label: 'Late' },
      { key: 'submitted_at', label: 'Submitted' },
      { key: 'graded_at', label: 'Graded' },
    ],
    query: `SELECT a.title AS assignment, a.subject,
                   TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS user_name,
                   u.email, s.status, s.score, a.max_score, s.passed, s.is_late,
                   s.submitted_at, s.graded_at
            FROM assignment_submissions s
            JOIN assignments a ON a.id = s.assignment_id
            JOIN users u ON u.id = s.user_id
            ORDER BY s.submitted_at DESC`,
  },
  certificates: {
    role: 'admin',
    filename: 'certificates',
    columns: [
      { key: 'certificate_id', label: 'Certificate ID' },
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'path_title', label: 'Awarded for' },
      { key: 'source', label: 'Source' },
      { key: 'issued_at', label: 'Issued' },
    ],
    query: `SELECT c.certificate_id, c.full_name, u.email, c.path_title, c.source, c.issued_at
            FROM certificates c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.issued_at DESC`,
  },
  participation: {
    role: 'trainer',
    filename: 'participation',
    columns: [
      { key: 'name', label: 'Trainee' },
      { key: 'email', label: 'Email' },
      { key: 'department', label: 'Department' },
      { key: 'enrolments', label: 'Enrolments' },
      { key: 'attempts', label: 'Assessment attempts' },
      { key: 'avg_score', label: 'Average score' },
      { key: 'submissions', label: 'Assignments submitted' },
      { key: 'certificates', label: 'Certificates' },
      { key: 'last_login_at', label: 'Last login' },
    ],
    query: `SELECT TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS name,
                   u.email, u.department,
                   (SELECT COUNT(*) FROM course_enrollments e WHERE e.user_id = u.id) AS enrolments,
                   (SELECT COUNT(*) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS attempts,
                   (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t WHERE t.user_id = u.id AND t.submitted_at IS NOT NULL) AS avg_score,
                   (SELECT COUNT(*) FROM assignment_submissions s WHERE s.user_id = u.id) AS submissions,
                   (SELECT COUNT(*) FROM certificates c WHERE c.user_id = u.id) AS certificates,
                   u.last_login_at
            FROM users u
            WHERE u.role IN ('trainee', 'operator')
            ORDER BY attempts DESC`,
  },
}
