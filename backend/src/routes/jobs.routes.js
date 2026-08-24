import express from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin } from '../middleware/auth.js'
import { buildJobMarkdown, defaultJobListings } from '../seed/jobListings.js'

const router = express.Router()
let schemaReady = false
let lastScrapedJobSync = {
  attemptedAt: null,
  imported: 0,
  scanned: 0,
  skipped: 0,
  status: 'not_started',
  message: 'Scraped job sync has not run yet.',
}

const SCRAPED_JOB_DB = process.env.JOB_DB_NAME || 'job_db'
const SCRAPED_JOB_TABLE = process.env.JOB_DB_TABLE || 'scraped_jobs'
const SCRAPED_JOB_SYNC_INTERVAL_MS = 60 * 1000

const PROFILE_FIELDS = [
  'internships',
  'softSkills',
  'hardSkills',
  'tools',
  'techStack',
  'projects',
  'achievements',
  'certifications',
]

function parseJson(value, fallback = []) {
  if (!value) return fallback
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function normalizeJob(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    company: row.company,
    location: row.location,
    salary: row.salary,
    jobType: row.job_type,
    category: row.category,
    workMode: row.work_mode,
    applyUrl: row.apply_url,
    aboutRole: row.about_role,
    responsibilities: parseJson(row.responsibilities_json),
    requirements: parseJson(row.requirements_json),
    skills: parseJson(row.skills_json),
    detailsMarkdown: row.details_markdown,
    source: row.source,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeRecommendation(row) {
  return {
    id: row.recommendation_id || row.id,
    userId: row.user_id,
    username: row.username,
    registrationNumber: row.registration_number,
    email: row.email,
    jobId: row.job_id,
    matchScore: Number(row.match_score || 0),
    probabilityLabel: row.probability_label,
    matchedSkills: parseJson(row.matched_skills_json),
    missingSkills: parseJson(row.missing_skills_json),
    reasons: parseJson(row.reasons_json),
    aiAnalysis: row.ai_analysis,
    sourceSnapshot: parseJson(row.source_snapshot_json, {}),
    application: row.application_id
      ? {
          id: row.application_id,
          status: row.application_status,
          appliedAt: row.applied_at,
          updatedAt: row.application_updated_at,
          notes: row.application_notes,
        }
      : null,
    updatedAt: row.updated_at,
    job: normalizeJob({
      id: row.job_id,
      slug: row.slug,
      title: row.title,
      company: row.company,
      location: row.location,
      salary: row.salary,
      job_type: row.job_type,
      category: row.category,
      work_mode: row.work_mode,
      apply_url: row.apply_url,
      about_role: row.about_role,
      responsibilities_json: row.responsibilities_json,
      requirements_json: row.requirements_json,
      skills_json: row.skills_json,
      details_markdown: row.details_markdown,
      source: row.source,
      is_active: row.is_active,
      created_at: row.job_created_at,
      updated_at: row.job_updated_at,
    }),
  }
}

function normalizeApplication(row) {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    registrationNumber: row.registration_number,
    email: row.email,
    jobId: row.job_id,
    status: row.status,
    applyUrl: row.apply_url,
    matchScore: Number(row.match_score || 0),
    probabilityLabel: row.probability_label,
    appliedAt: row.applied_at,
    updatedAt: row.updated_at,
    notes: row.notes,
    job: normalizeJob({
      id: row.job_id,
      slug: row.slug,
      title: row.title,
      company: row.company,
      location: row.location,
      salary: row.salary,
      job_type: row.job_type,
      category: row.category,
      work_mode: row.work_mode,
      apply_url: row.job_apply_url,
      about_role: row.about_role,
      responsibilities_json: row.responsibilities_json,
      requirements_json: row.requirements_json,
      skills_json: row.skills_json,
      details_markdown: row.details_markdown,
      source: row.source,
      is_active: row.is_active,
      created_at: row.job_created_at,
      updated_at: row.job_updated_at,
    }),
  }
}

function splitSkillText(value) {
  return String(value || '')
    .split(/[\n,;|]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function slugify(value) {
  return String(value || 'job-listing')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180) || 'job-listing'
}

function markdownField(markdown, label) {
  const match = String(markdown || '').match(new RegExp(`\\*\\*${label}:\\*\\*\\s*(.+)`, 'i'))
  return match?.[1]?.trim() || ''
}

function markdownSection(markdown, title) {
  const pattern = new RegExp(`####?\\s+${title}\\s*\\n([\\s\\S]*?)(?=\\n####?\\s+|\\n---|$)`, 'i')
  const match = String(markdown || '').match(pattern)
  return match?.[1]?.trim() || ''
}

function markdownList(section) {
  return String(section || '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*]\s*/, '').trim())
    .filter(Boolean)
}

function parseMarkdownJob(markdown) {
  const text = String(markdown || '').trim()
  const titleMatch = text.match(/^#{1,4}\s*(?:\d+\.\s*)?(.+)$/m)
  const title = titleMatch?.[1]?.trim() || 'Untitled Job'
  const typeText = markdownField(text, 'Type')
  const typeParts = typeText.split('|').map((part) => part.trim()).filter(Boolean)
  const skillsSection = markdownSection(text, 'Key Skills')
  const skills = Array.from(skillsSection.matchAll(/`([^`]+)`/g)).map((match) => match[1].trim())
  const company = markdownField(text, 'Company') || 'Unknown Company'

  return {
    slug: slugify(`${company}-${title}`),
    title,
    company,
    location: markdownField(text, 'Location'),
    salary: markdownField(text, 'Salary'),
    jobType: typeParts[0] || 'Entry Level',
    category: typeParts[1] || 'Cybersecurity',
    workMode: typeParts[2] || 'Remote',
    applyUrl: markdownField(text, 'Apply'),
    aboutRole: markdownSection(text, 'About the Role'),
    responsibilities: markdownList(markdownSection(text, 'Responsibilities')),
    requirements: markdownList(markdownSection(text, 'Requirements')),
    skills: skills.length ? skills : splitSkillText(skillsSection),
    detailsMarkdown: text,
  }
}

function buildScrapedJobMarkdown(job) {
  return [
    `### ${job.title}`,
    `**Company:** ${job.company}`,
    `**Location:** ${job.location || 'Not specified'}`,
    `**Salary:** ${job.salary || 'Not disclosed'}`,
    `**Type:** ${job.jobType || 'Entry Level'} | ${job.category || 'Cybersecurity'} | ${job.workMode || 'Not specified'}`,
    `**Apply:** ${job.applyUrl || ''}`,
    '',
    '#### About the Role',
    job.aboutRole || 'See job description.',
    '',
    '#### Requirements',
    ...(job.requirements || ['See description.']).map((item) => `- ${item}`),
    '',
    '#### Key Skills',
    (job.skills || []).length ? job.skills.map((item) => `- \`${item}\``).join('\n') : '- Not specified',
    '',
    '#### Full Job Description',
    job.detailsMarkdown || job.aboutRole || '',
  ].join('\n')
}

function inferSkillsFromDescription(description) {
  const commonSkills = [
    'Linux',
    'Networking',
    'Python',
    'JavaScript',
    'Docker',
    'Kubernetes',
    'Cloud',
    'AWS',
    'Azure',
    'SOC',
    'Incident Response',
    'Vulnerability Management',
    'Penetration Testing',
    'Web Security',
    'SIEM',
    'EDR',
    'IDS',
    'IPS',
    'IAM',
    'DevSecOps',
    'Malware Analysis',
    'Digital Forensics',
    'Threat Hunting',
    'Secure Coding',
  ]
  const text = String(description || '').toLowerCase()
  return commonSkills.filter((skill) => text.includes(skill.toLowerCase()))
}

const CYBER_RELEVANCE_PATTERNS = [
  /\bcyber\s*security\b/i,
  /\bcybersecurity\b/i,
  /\binformation security\b/i,
  /\binfosec\b/i,
  /\bapplication security\b/i,
  /\bappsec\b/i,
  /\bweb security\b/i,
  /\bnetwork security\b/i,
  /\bcloud security\b/i,
  /\bsecurity analyst\b/i,
  /\bsecurity engineer\b/i,
  /\bsecurity operations\b/i,
  /\bsoc\b/i,
  /\bsiem\b/i,
  /\bsplunk\b/i,
  /\bedr\b/i,
  /\bxdr\b/i,
  /\bids\b/i,
  /\bips\b/i,
  /\bincident response\b/i,
  /\bthreat (?:hunting|intel|intelligence|analysis|detection)\b/i,
  /\bmalware\b/i,
  /\bforensics?\b/i,
  /\bvulnerabilit(?:y|ies)\b/i,
  /\bpenetration test(?:ing|er)?\b/i,
  /\bpentest(?:ing|er)?\b/i,
  /\bred team\b/i,
  /\bblue team\b/i,
  /\bdevsecops\b/i,
  /\bsecure coding\b/i,
  /\bexploit\b/i,
  /\bctf\b/i,
  /\biam\b/i,
  /\bidentity and access\b/i,
  /\biso\s*27001\b/i,
  /\bgdpr\b/i,
  /\brisk and compliance\b/i,
  /\bsecurity compliance\b/i,
]

const NON_CYBER_EXCLUSION_PATTERNS = [
  /\bhuman resources?\b/i,
  /\bhr\b/i,
  /\brecruit(?:er|ment|ing)\b/i,
  /\btalent acquisition\b/i,
  /\bmarketing\b/i,
  /\bsales\b/i,
  /\baccounting\b/i,
  /\bfinance\b/i,
  /\bcommerce\b/i,
  /\bbusiness administration\b/i,
  /\bcustomer service\b/i,
  /\bvoice support\b/i,
  /\bpayroll\b/i,
  /\bleave management\b/i,
  /\bonboarding\b/i,
  /\bcontent writer\b/i,
  /\bgraphic design\b/i,
  /\bsoftware engineer\b/i,
  /\bsoftware developer\b/i,
  /\bproduct management\b/i,
  /\bdata analyst\b/i,
  /\bmachine learning\b/i,
]

function cyberRelevanceScore(row, skills = [], requirements = []) {
  const title = String(row.title || '')
  const domain = String(row.domain || '')
  const skillText = Array.isArray(skills) ? skills.join(' ') : String(row.skills_text || '')
  const requirementText = Array.isArray(requirements) ? requirements.join(' ') : String(row.requirements_text || '')
  const description = String(row.job_description || '')
  const strongText = `${title} ${skillText} ${requirementText}`
  const fullText = `${strongText} ${description} ${domain}`
  let score = 0

  for (const pattern of CYBER_RELEVANCE_PATTERNS) {
    if (pattern.test(strongText)) {
      score += 3
    } else if (pattern.test(description)) {
      score += 1
    }
  }

  if (/\bcyber(?:security)?\b/i.test(domain) || /\bsecurity\b/i.test(domain)) {
    score += 1
  }

  const exclusionText = `${title} ${description}`
  const hasGenericNonCyberSignal = NON_CYBER_EXCLUSION_PATTERNS.some((pattern) => pattern.test(exclusionText))
  if (hasGenericNonCyberSignal && score < 5) {
    return 0
  }

  return CYBER_RELEVANCE_PATTERNS.some((pattern) => pattern.test(fullText)) ? score : 0
}

function isCyberSecurityJob(row, skills = [], requirements = []) {
  return cyberRelevanceScore(row, skills, requirements) >= 3
}

export function isCyberSecurityListing(job) {
  const skills = parseJson(job.skills_json)
  const requirements = parseJson(job.requirements_json)
  return isCyberSecurityJob(
    {
      title: job.title,
      domain: job.category,
      skills_text: skills.join(' '),
      requirements_text: requirements.join(' '),
      job_description: [job.about_role, job.details_markdown].filter(Boolean).join('\n'),
    },
    skills,
    requirements,
  )
}

function textTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9+#.]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  )
}

function skillKeywords(skill) {
  const raw = String(skill || '').toLowerCase()
  const cleaned = raw.replace(/[^a-z0-9+#./ ]+/g, ' ')
  const chunks = cleaned
    .split(/[ /]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2)
  return Array.from(new Set([cleaned.trim(), ...chunks].filter(Boolean)))
}

function fieldValue(body, field) {
  const value = body?.[field]
  if (Array.isArray(value)) return value.join('\n')
  return String(value || '')
}

function quoteIdentifier(value) {
  const identifier = String(value || '').trim()
  if (!/^[a-zA-Z0-9_]+$/.test(identifier)) {
    throw new Error(`Invalid database identifier: ${identifier}`)
  }
  return `\`${identifier}\``
}

async function syncScrapedJobsFromExternalDb() {
  const dbName = quoteIdentifier(SCRAPED_JOB_DB)
  const tableName = quoteIdentifier(SCRAPED_JOB_TABLE)
  lastScrapedJobSync = {
    ...lastScrapedJobSync,
    attemptedAt: new Date().toISOString(),
    status: 'running',
    message: `Checking ${SCRAPED_JOB_DB}.${SCRAPED_JOB_TABLE}`,
  }

  const [[tableRow]] = await pool.query(
    `SELECT 1 AS exists_flag
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?
     LIMIT 1`,
    [SCRAPED_JOB_DB, SCRAPED_JOB_TABLE],
  )

  if (!tableRow?.exists_flag) {
    lastScrapedJobSync = {
      attemptedAt: new Date().toISOString(),
      imported: 0,
      scanned: 0,
      skipped: 0,
      status: 'missing',
      message: `${SCRAPED_JOB_DB}.${SCRAPED_JOB_TABLE} was not found or is not visible to the configured DB user.`,
    }
    return 0
  }

  const [rows] = await pool.query(
    `SELECT
       id,
       \`Domain\` AS domain,
       \`Company Name\` AS company,
       \`Job Title\` AS title,
       \`Location\` AS location,
       \`Job Link\` AS job_link,
       \`Package\` AS package_text,
       \`Date and Year\` AS date_text,
       \`Job Type\` AS job_type,
       \`Requirements\` AS requirements_text,
       \`Skills\` AS skills_text,
       \`Job Description\` AS job_description,
       \`Active\` AS active,
       \`Date Fetched\` AS date_fetched
     FROM ${dbName}.${tableName}
     WHERE LOWER(TRIM(COALESCE(\`Active\`, 'Yes'))) IN ('yes', '1', 'true', 'active')
     ORDER BY id DESC
     LIMIT 500`,
  )

  await pool.query(
    "UPDATE job_listings SET is_active = false WHERE source = 'scraped_jobs'",
  )

  let importedCount = 0
  let skippedCount = 0

  for (const row of rows) {
    const description = String(row.job_description || '').trim()
    const explicitSkills = String(row.skills_text || '').trim().toLowerCase() === 'not specified'
      ? []
      : splitSkillText(row.skills_text)
    const skills = explicitSkills.length ? explicitSkills : inferSkillsFromDescription(description)
    const requirements = String(row.requirements_text || '').trim().toLowerCase() === 'see description'
      ? []
      : splitSkillText(row.requirements_text)

    if (!isCyberSecurityJob(row, skills, requirements)) {
      skippedCount += 1
      continue
    }

    const job = {
      slug: slugify(`scraped-${row.company}-${row.title}-${row.location}`),
      title: String(row.title || 'Untitled Job').trim(),
      company: String(row.company || 'Unknown Company').trim(),
      location: String(row.location || '').trim(),
      salary: String(row.package_text || 'Not Disclosed').trim(),
      jobType: String(row.job_type || 'Internship / Entry Level').trim(),
      category: String(row.domain || 'Cybersecurity').trim(),
      workMode: String(row.location || '').toLowerCase().includes('remote') ? 'Remote' : 'On-site / Hybrid',
      applyUrl: String(row.job_link || '').trim(),
      aboutRole: description.slice(0, 2000),
      responsibilities: [],
      requirements: requirements.length ? requirements : ['See full job description.'],
      skills,
      detailsMarkdown: description,
    }

    await pool.query(
      `INSERT INTO job_listings (
        slug, title, company, location, salary, job_type, category, work_mode, apply_url,
        about_role, responsibilities_json, requirements_json, skills_json, details_markdown, source, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scraped_jobs', true)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        company = VALUES(company),
        location = VALUES(location),
        salary = VALUES(salary),
        job_type = VALUES(job_type),
        category = VALUES(category),
        work_mode = VALUES(work_mode),
        apply_url = VALUES(apply_url),
        about_role = VALUES(about_role),
        responsibilities_json = VALUES(responsibilities_json),
        requirements_json = VALUES(requirements_json),
        skills_json = VALUES(skills_json),
        details_markdown = VALUES(details_markdown),
        source = 'scraped_jobs',
        is_active = true`,
      [
        job.slug,
        job.title,
        job.company,
        job.location,
        job.salary,
        job.jobType,
        job.category,
        job.workMode,
        job.applyUrl,
        job.aboutRole,
        JSON.stringify(job.responsibilities || []),
        JSON.stringify(job.requirements || []),
        JSON.stringify(job.skills || []),
        buildScrapedJobMarkdown(job),
      ],
    )
    importedCount += 1
  }

  lastScrapedJobSync = {
    attemptedAt: new Date().toISOString(),
    imported: importedCount,
    scanned: rows.length,
    skipped: skippedCount,
    status: 'ok',
    message: `Synced ${importedCount} cybersecurity job${importedCount === 1 ? '' : 's'} from ${SCRAPED_JOB_DB}.${SCRAPED_JOB_TABLE}; skipped ${skippedCount} non-cyber row${skippedCount === 1 ? '' : 's'}.`,
  }

  return importedCount
}

async function syncScrapedJobsIfDue({ force = false } = {}) {
  const lastAttempt = lastScrapedJobSync.attemptedAt
    ? new Date(lastScrapedJobSync.attemptedAt).getTime()
    : 0
  const shouldSync = force || !lastAttempt || Date.now() - lastAttempt > SCRAPED_JOB_SYNC_INTERVAL_MS

  if (!shouldSync) {
    return lastScrapedJobSync
  }

  try {
    await syncScrapedJobsFromExternalDb()
  } catch (error) {
    lastScrapedJobSync = {
      attemptedAt: new Date().toISOString(),
      imported: 0,
      scanned: 0,
      skipped: 0,
      status: 'error',
      message: error?.message || 'Unable to sync scraped jobs.',
    }
    console.warn('Skipped external scraped_jobs sync:', error?.message || error)
  }

  return lastScrapedJobSync
}

function buildEvidenceText(profile, user, rooms, attempts, certificates) {
  return [
    user?.projects,
    user?.achievements,
    user?.about_me,
    profile?.internships,
    profile?.soft_skills,
    profile?.hard_skills,
    profile?.tools,
    profile?.tech_stack,
    profile?.projects,
    profile?.achievements,
    profile?.certifications,
    rooms
      .map((room) =>
        [
          room.title,
          room.category,
          room.category_tag,
          room.difficulty,
          room.description,
          room.tags,
          room.keywords,
        ].join(' '),
      )
      .join(' '),
    attempts.map((attempt) => [attempt.feedback, attempt.technical_score, attempt.grammar_score].join(' ')).join(' '),
    certificates.map((certificate) => certificate.path_title).join(' '),
  ]
    .filter(Boolean)
    .join('\n')
}

function profileCompleteness(profile, user) {
  const values = [
    user?.projects,
    user?.achievements,
    profile?.internships,
    profile?.soft_skills,
    profile?.hard_skills,
    profile?.tools,
    profile?.tech_stack,
    profile?.projects,
    profile?.achievements,
    profile?.certifications,
  ]
  return values.filter((value) => String(value || '').trim().length >= 3).length
}

function scoreJob(job, evidence) {
  const corpus = buildEvidenceText(
    evidence.profile,
    evidence.user,
    evidence.rooms,
    evidence.attempts,
    evidence.certificates,
  )
  const corpusLower = corpus.toLowerCase()
  const corpusTokens = textTokens(corpusLower)
  const jobSkills = parseJson(job.skills_json)
  const matchedSkills = []
  const missingSkills = []

  for (const skill of jobSkills) {
    const keywords = skillKeywords(skill)
    const matched = keywords.some((keyword) => {
      if (keyword.length > 3 && corpusLower.includes(keyword)) return true
      return corpusTokens.has(keyword)
    })
    if (matched) matchedSkills.push(skill)
    else missingSkills.push(skill)
  }

  const skillScore = jobSkills.length ? (matchedSkills.length / jobSkills.length) * 58 : 0
  const completedRooms = evidence.rooms.length
  const completedRoomScore = Math.min(18, completedRooms * 4)
  const categoryLower = String(job.category || '').toLowerCase()
  const roomCategoryScore = evidence.rooms.some((room) => {
    const text = `${room.category || ''} ${room.category_tag || ''} ${room.title || ''}`.toLowerCase()
    if (categoryLower.includes('devops')) {
      return /linux|cloud|docker|devops|kubernetes|ci\/cd|bash|python/.test(text)
    }
    return /security|web|forensic|incident|threat|crypto|reverse|exploit|soc|vulnerability|cve/.test(text)
  })
    ? 8
    : 0
  const profileScore = Math.min(10, profileCompleteness(evidence.profile, evidence.user))
  const certScore = Math.min(6, evidence.certificates.length * 3)
  const internshipScore = String(evidence.profile?.internships || '').trim() ? 5 : 0
  const matchScore = Math.min(
    100,
    Math.round(skillScore + completedRoomScore + roomCategoryScore + profileScore + certScore + internshipScore),
  )
  const probabilityLabel = matchScore >= 75 ? 'High' : matchScore >= 55 ? 'Medium' : 'Low'

  const topReasons = []
  if (matchedSkills.length) {
    topReasons.push(`Matched ${matchedSkills.length} required skill${matchedSkills.length === 1 ? '' : 's'}.`)
  }
  if (completedRooms) {
    topReasons.push(`Completed ${completedRooms} room${completedRooms === 1 ? '' : 's'} that strengthen the profile signal.`)
  }
  if (evidence.certificates.length) {
    topReasons.push(`Detected ${evidence.certificates.length} certificate${evidence.certificates.length === 1 ? '' : 's'}.`)
  }
  if (String(evidence.profile?.internships || '').trim()) {
    topReasons.push('Internship experience improves readiness for entry-level screening.')
  }
  if (!topReasons.length) {
    topReasons.push('Add declared skills, projects, internships, and completed learning skills to improve match quality.')
  }

  const aiAnalysis = [
    `${job.company} - ${job.title} is a ${probabilityLabel.toLowerCase()} probability match at ${matchScore}%.`,
    matchedSkills.length
      ? `Strong overlap: ${matchedSkills.slice(0, 6).join(', ')}.`
      : 'No direct skill overlap was detected yet.',
    missingSkills.length
      ? `Improve next: add evidence for ${missingSkills.slice(0, 5).join(', ')}.`
      : 'The listed skills are well covered by the current profile.',
    'The recommendation considers completed learning skills, certificates, internships, projects, achievements, and the saved student skill profile.',
  ].join(' ')

  return {
    matchScore,
    probabilityLabel,
    matchedSkills,
    missingSkills,
    reasons: topReasons,
    aiAnalysis,
    sourceSnapshot: {
      completedRooms,
      certificateCount: evidence.certificates.length,
      profileCompleteness: profileScore,
      analyzedAt: new Date().toISOString(),
    },
  }
}

export async function ensureJobSchema() {
  if (schemaReady) return

  await pool.query(`
    CREATE TABLE IF NOT EXISTS job_listings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(191) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      company VARCHAR(255) NOT NULL,
      location VARCHAR(255),
      salary VARCHAR(255),
      job_type VARCHAR(120),
      category VARCHAR(120),
      work_mode VARCHAR(80),
      apply_url TEXT,
      about_role LONGTEXT,
      responsibilities_json LONGTEXT,
      requirements_json LONGTEXT,
      skills_json LONGTEXT,
      details_markdown LONGTEXT,
      source VARCHAR(120) DEFAULT 'markdown_seed',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_career_profiles (
      user_id INT PRIMARY KEY,
      internships LONGTEXT,
      soft_skills LONGTEXT,
      hard_skills LONGTEXT,
      tools LONGTEXT,
      tech_stack LONGTEXT,
      projects LONGTEXT,
      achievements LONGTEXT,
      certifications LONGTEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_job_recommendations (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id BIGINT NOT NULL,
      match_score INT NOT NULL DEFAULT 0,
      probability_label VARCHAR(40) NOT NULL DEFAULT 'Low',
      matched_skills_json LONGTEXT,
      missing_skills_json LONGTEXT,
      reasons_json LONGTEXT,
      ai_analysis LONGTEXT,
      source_snapshot_json LONGTEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_job_recommendation (user_id, job_id),
      INDEX idx_student_job_match (user_id, match_score),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_listings(id) ON DELETE CASCADE
    );
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS student_job_applications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      job_id BIGINT NOT NULL,
      recommendation_id BIGINT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'applied',
      apply_url TEXT,
      match_score INT DEFAULT 0,
      probability_label VARCHAR(40),
      notes LONGTEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_student_job_application (user_id, job_id),
      INDEX idx_job_application_status (status, applied_at),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES job_listings(id) ON DELETE CASCADE,
      FOREIGN KEY (recommendation_id) REFERENCES student_job_recommendations(id) ON DELETE SET NULL
    );
  `)

  for (const job of defaultJobListings) {
    await pool.query(
      `INSERT INTO job_listings (
        slug, title, company, location, salary, job_type, category, work_mode, apply_url,
        about_role, responsibilities_json, requirements_json, skills_json, details_markdown, source, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'markdown_seed', true)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        company = VALUES(company),
        location = VALUES(location),
        salary = VALUES(salary),
        job_type = VALUES(job_type),
        category = VALUES(category),
        work_mode = VALUES(work_mode),
        apply_url = VALUES(apply_url),
        about_role = VALUES(about_role),
        responsibilities_json = VALUES(responsibilities_json),
        requirements_json = VALUES(requirements_json),
        skills_json = VALUES(skills_json),
        details_markdown = VALUES(details_markdown),
        is_active = true`,
      [
        job.slug,
        job.title,
        job.company,
        job.location,
        job.salary,
        job.jobType,
        job.category,
        job.workMode,
        job.applyUrl,
        job.aboutRole,
        JSON.stringify(job.responsibilities),
        JSON.stringify(job.requirements),
        JSON.stringify(job.skills),
        buildJobMarkdown(job),
      ],
    )
  }

  await syncScrapedJobsIfDue({ force: true })

  schemaReady = true
}

async function loadEvidenceForUser(userId) {
  const [[user]] = await pool.query(
    `SELECT id, username, registration_number, email, about_me, projects, achievements
     FROM users WHERE id = ? LIMIT 1`,
    [userId],
  )
  const [[profile]] = await pool.query('SELECT * FROM student_career_profiles WHERE user_id = ? LIMIT 1', [userId])
  const [rooms] = await pool.query(
    `SELECT r.id, r.title, r.category, r.category_tag, r.difficulty, r.description,
       GROUP_CONCAT(DISTINCT rt.tag SEPARATOR ' ') AS tags,
       GROUP_CONCAT(DISTINCT rrk.keyword SEPARATOR ' ') AS keywords
     FROM user_room_progress urp
     JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN room_tags rt ON rt.room_id = r.id
     LEFT JOIN room_required_keywords rrk ON rrk.room_id = r.id
     WHERE urp.user_id = ? AND urp.completed_at IS NOT NULL
     GROUP BY r.id
     ORDER BY urp.completed_at DESC`,
    [userId],
  )
  const [attempts] = await pool.query(
    `SELECT room_id, technical_score, grammar_score, feedback
     FROM user_room_theoretical_attempts
     WHERE user_id = ? AND evaluated_at IS NOT NULL
     ORDER BY evaluated_at DESC
     LIMIT 20`,
    [userId],
  )
  const [certificates] = await pool.query(
    `SELECT path_title FROM certificates WHERE user_id = ? ORDER BY issued_at DESC`,
    [userId],
  )

  return {
    user: user || {},
    profile: profile || {},
    rooms,
    attempts,
    certificates,
  }
}

async function refreshRecommendationsForUser(userId) {
  await ensureJobSchema()
  const [allJobs] = await pool.query('SELECT * FROM job_listings WHERE is_active = true ORDER BY company, title')
  const jobs = allJobs.filter(isCyberSecurityListing)
  const evidence = await loadEvidenceForUser(userId)
  const results = []

  for (const job of jobs) {
    const result = scoreJob(job, evidence)
    await pool.query(
      `INSERT INTO student_job_recommendations (
        user_id, job_id, match_score, probability_label, matched_skills_json,
        missing_skills_json, reasons_json, ai_analysis, source_snapshot_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        match_score = VALUES(match_score),
        probability_label = VALUES(probability_label),
        matched_skills_json = VALUES(matched_skills_json),
        missing_skills_json = VALUES(missing_skills_json),
        reasons_json = VALUES(reasons_json),
        ai_analysis = VALUES(ai_analysis),
        source_snapshot_json = VALUES(source_snapshot_json),
        updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        job.id,
        result.matchScore,
        result.probabilityLabel,
        JSON.stringify(result.matchedSkills),
        JSON.stringify(result.missingSkills),
        JSON.stringify(result.reasons),
        result.aiAnalysis,
        JSON.stringify(result.sourceSnapshot),
      ],
    )
    results.push({ job, ...result })
  }

  return results.sort((a, b) => b.matchScore - a.matchScore)
}

async function refreshRecommendationsForAllOperators() {
  await ensureJobSchema()
  const [users] = await pool.query("SELECT id FROM users WHERE is_active = true AND role = 'operator'")
  for (const user of users) {
    await refreshRecommendationsForUser(user.id)
  }
}

async function listRecommendations(whereSql, params) {
  await ensureJobSchema()
  const [rows] = await pool.query(
    `SELECT
       sjr.id AS recommendation_id,
       sjr.user_id,
       u.username,
       u.registration_number,
       u.email,
       sjr.job_id,
       sjr.match_score,
       sjr.probability_label,
       sjr.matched_skills_json,
       sjr.missing_skills_json,
       sjr.reasons_json,
       sjr.ai_analysis,
       sjr.source_snapshot_json,
       sjr.updated_at,
       sja.id AS application_id,
       sja.status AS application_status,
       sja.applied_at,
       sja.updated_at AS application_updated_at,
       sja.notes AS application_notes,
       jl.slug,
       jl.title,
       jl.company,
       jl.location,
       jl.salary,
       jl.job_type,
       jl.category,
       jl.work_mode,
       jl.apply_url,
       jl.about_role,
       jl.responsibilities_json,
       jl.requirements_json,
       jl.skills_json,
       jl.details_markdown,
       jl.source,
       jl.is_active,
       jl.created_at AS job_created_at,
       jl.updated_at AS job_updated_at
     FROM student_job_recommendations sjr
     JOIN users u ON u.id = sjr.user_id
     JOIN job_listings jl ON jl.id = sjr.job_id
     LEFT JOIN student_job_applications sja ON sja.user_id = sjr.user_id AND sja.job_id = sjr.job_id
     ${whereSql}
     ORDER BY sjr.match_score DESC, sjr.updated_at DESC`,
    params,
  )
  return rows
    .filter((row) => isCyberSecurityListing(row))
    .map(normalizeRecommendation)
}

router.use(authenticate)

router.get('/listings', async (_req, res, next) => {
  try {
    await ensureJobSchema()
    await syncScrapedJobsIfDue()
    const [rows] = await pool.query('SELECT * FROM job_listings WHERE is_active = true ORDER BY category, company, title')
    res.json(rows.filter(isCyberSecurityListing).map(normalizeJob))
  } catch (error) {
    next(error)
  }
})

router.get('/profile', async (req, res, next) => {
  try {
    await ensureJobSchema()
    const [[row]] = await pool.query('SELECT * FROM student_career_profiles WHERE user_id = ? LIMIT 1', [req.user.id])
    res.json({
      internships: row?.internships || '',
      softSkills: row?.soft_skills || '',
      hardSkills: row?.hard_skills || '',
      tools: row?.tools || '',
      techStack: row?.tech_stack || '',
      projects: row?.projects || '',
      achievements: row?.achievements || '',
      certifications: row?.certifications || '',
      updatedAt: row?.updated_at || null,
    })
  } catch (error) {
    next(error)
  }
})

router.put('/profile', async (req, res, next) => {
  try {
    await ensureJobSchema()
    const values = PROFILE_FIELDS.map((field) => fieldValue(req.body, field))
    await pool.query(
      `INSERT INTO student_career_profiles (
        user_id, internships, soft_skills, hard_skills, tools, tech_stack, projects, achievements, certifications
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        internships = VALUES(internships),
        soft_skills = VALUES(soft_skills),
        hard_skills = VALUES(hard_skills),
        tools = VALUES(tools),
        tech_stack = VALUES(tech_stack),
        projects = VALUES(projects),
        achievements = VALUES(achievements),
        certifications = VALUES(certifications),
        updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, ...values],
    )
    await refreshRecommendationsForUser(req.user.id)
    res.json({ message: 'Career profile saved and recommendations refreshed.' })
  } catch (error) {
    next(error)
  }
})

router.get('/recommendations/me', async (req, res, next) => {
  try {
    await ensureJobSchema()
    const syncStatus = await syncScrapedJobsIfDue()
    if (syncStatus.status === 'ok' && syncStatus.imported > 0) {
      await refreshRecommendationsForUser(req.user.id)
    }
    const recommendations = await listRecommendations(
      'WHERE sjr.user_id = ? AND sjr.match_score >= 55 AND jl.is_active = true',
      [req.user.id],
    )
    if (!recommendations.length) {
      await refreshRecommendationsForUser(req.user.id)
      const refreshed = await listRecommendations(
        'WHERE sjr.user_id = ? AND sjr.match_score >= 55 AND jl.is_active = true',
        [req.user.id],
      )
      res.json(refreshed)
      return
    }
    res.json(recommendations)
  } catch (error) {
    next(error)
  }
})

router.post('/recommendations/refresh', async (req, res, next) => {
  try {
    await ensureJobSchema()
    await syncScrapedJobsIfDue({ force: true })
    await refreshRecommendationsForUser(req.user.id)
    const recommendations = await listRecommendations(
      'WHERE sjr.user_id = ? AND sjr.match_score >= 55 AND jl.is_active = true',
      [req.user.id],
    )
    res.json(recommendations)
  } catch (error) {
    next(error)
  }
})

router.post('/applications', async (req, res, next) => {
  try {
    await ensureJobSchema()
    const recommendationId = Number(req.body?.recommendationId)
    const jobId = Number(req.body?.jobId)

    if (!Number.isInteger(recommendationId) && !Number.isInteger(jobId)) {
      res.status(400).json({ message: 'Recommendation or job id is required.' })
      return
    }

    const [rows] = await pool.query(
      `SELECT
         sjr.id AS recommendation_id,
         sjr.job_id,
         sjr.match_score,
         sjr.probability_label,
         jl.apply_url
       FROM student_job_recommendations sjr
       JOIN job_listings jl ON jl.id = sjr.job_id
       WHERE sjr.user_id = ?
         AND (${Number.isInteger(recommendationId) ? 'sjr.id = ?' : 'sjr.job_id = ?'})
       LIMIT 1`,
      [req.user.id, Number.isInteger(recommendationId) ? recommendationId : jobId],
    )

    if (!rows.length) {
      res.status(404).json({ message: 'Recommended job not found for this player.' })
      return
    }

    const recommendation = rows[0]
    await pool.query(
      `INSERT INTO student_job_applications (
        user_id, job_id, recommendation_id, status, apply_url, match_score, probability_label
      ) VALUES (?, ?, ?, 'applied', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        recommendation_id = VALUES(recommendation_id),
        apply_url = VALUES(apply_url),
        match_score = VALUES(match_score),
        probability_label = VALUES(probability_label),
        updated_at = CURRENT_TIMESTAMP`,
      [
        req.user.id,
        recommendation.job_id,
        recommendation.recommendation_id,
        recommendation.apply_url,
        recommendation.match_score,
        recommendation.probability_label,
      ],
    )

    res.status(201).json({
      status: 'applied',
      applyUrl: recommendation.apply_url,
      jobId: recommendation.job_id,
      recommendationId: recommendation.recommendation_id,
    })
  } catch (error) {
    next(error)
  }
})

router.get('/admin/recommendations', requireAdmin, async (_req, res, next) => {
  try {
    await ensureJobSchema()
    const syncStatus = await syncScrapedJobsIfDue()
    if (syncStatus.status === 'ok' && syncStatus.imported > 0) {
      await refreshRecommendationsForAllOperators()
    }
    const recommendations = await listRecommendations(
      'WHERE sjr.match_score >= 55 AND jl.is_active = true',
      [],
    )
    res.json(recommendations)
  } catch (error) {
    next(error)
  }
})

router.post('/admin/recommendations/refresh', requireAdmin, async (_req, res, next) => {
  try {
    await ensureJobSchema()
    await syncScrapedJobsIfDue({ force: true })
    await refreshRecommendationsForAllOperators()
    const recommendations = await listRecommendations(
      'WHERE sjr.match_score >= 55 AND jl.is_active = true',
      [],
    )
    res.json(recommendations)
  } catch (error) {
    next(error)
  }
})

router.get('/admin/scraped-jobs/status', requireAdmin, async (_req, res, next) => {
  try {
    await ensureJobSchema()
    const [sourceRows] = await pool.query(
      'SELECT COUNT(*) AS count FROM job_listings WHERE source = ? AND is_active = true',
      ['scraped_jobs'],
    )
    res.json({
      ...lastScrapedJobSync,
      database: SCRAPED_JOB_DB,
      table: SCRAPED_JOB_TABLE,
      importedListings: Number(sourceRows[0]?.count || 0),
    })
  } catch (error) {
    next(error)
  }
})

router.post('/admin/scraped-jobs/sync', requireAdmin, async (_req, res, next) => {
  try {
    await ensureJobSchema()
    const syncStatus = await syncScrapedJobsIfDue({ force: true })
    res.json(syncStatus)
  } catch (error) {
    next(error)
  }
})

router.get('/admin/applications', requireAdmin, async (_req, res, next) => {
  try {
    await ensureJobSchema()
    const [rows] = await pool.query(
      `SELECT
         sja.id,
         sja.user_id,
         u.username,
         u.registration_number,
         u.email,
         sja.job_id,
         sja.status,
         sja.apply_url,
         sja.match_score,
         sja.probability_label,
         sja.applied_at,
         sja.updated_at,
         sja.notes,
         jl.slug,
         jl.title,
         jl.company,
         jl.location,
         jl.salary,
         jl.job_type,
         jl.category,
         jl.work_mode,
         jl.apply_url AS job_apply_url,
         jl.about_role,
         jl.responsibilities_json,
         jl.requirements_json,
         jl.skills_json,
         jl.details_markdown,
         jl.source,
         jl.is_active,
         jl.created_at AS job_created_at,
         jl.updated_at AS job_updated_at
       FROM student_job_applications sja
       JOIN users u ON u.id = sja.user_id
       JOIN job_listings jl ON jl.id = sja.job_id
       ORDER BY sja.updated_at DESC, sja.applied_at DESC`,
    )
    res.json(rows.map(normalizeApplication))
  } catch (error) {
    next(error)
  }
})

router.patch('/admin/applications/:id', requireAdmin, async (req, res, next) => {
  try {
    await ensureJobSchema()
    const applicationId = Number(req.params.id)
    const status = String(req.body?.status || '').trim()
    const notes = String(req.body?.notes || '').trim()
    const allowedStatuses = new Set(['applied', 'shortlisted', 'interview', 'selected', 'rejected'])

    if (!Number.isInteger(applicationId) || applicationId <= 0) {
      res.status(400).json({ message: 'Invalid application id.' })
      return
    }

    if (!allowedStatuses.has(status)) {
      res.status(400).json({ message: 'Invalid application status.' })
      return
    }

    await pool.query(
      `UPDATE student_job_applications
       SET status = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, notes || null, applicationId],
    )

    res.json({ id: applicationId, status, notes: notes || null })
  } catch (error) {
    next(error)
  }
})

router.post('/admin/listings', requireAdmin, async (req, res, next) => {
  try {
    await ensureJobSchema()
    const job = req.body?.markdown
      ? parseMarkdownJob(req.body.markdown)
      : {
          slug: slugify(`${req.body?.company || 'company'}-${req.body?.title || 'job'}`),
          title: String(req.body?.title || 'Untitled Job'),
          company: String(req.body?.company || 'Unknown Company'),
          location: String(req.body?.location || ''),
          salary: String(req.body?.salary || ''),
          jobType: String(req.body?.jobType || 'Entry Level'),
          category: String(req.body?.category || 'Cybersecurity'),
          workMode: String(req.body?.workMode || 'Remote'),
          applyUrl: String(req.body?.applyUrl || ''),
          aboutRole: String(req.body?.aboutRole || ''),
          responsibilities: Array.isArray(req.body?.responsibilities)
            ? req.body.responsibilities
            : splitSkillText(req.body?.responsibilities),
          requirements: Array.isArray(req.body?.requirements)
            ? req.body.requirements
            : splitSkillText(req.body?.requirements),
          skills: Array.isArray(req.body?.skills) ? req.body.skills : splitSkillText(req.body?.skills),
          detailsMarkdown: String(req.body?.detailsMarkdown || ''),
        }

    if (!job.title || !job.company) {
      res.status(400).json({ message: 'Job title and company are required.' })
      return
    }

    const detailsMarkdown = job.detailsMarkdown || buildJobMarkdown(job)
    await pool.query(
      `INSERT INTO job_listings (
        slug, title, company, location, salary, job_type, category, work_mode, apply_url,
        about_role, responsibilities_json, requirements_json, skills_json, details_markdown, source, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'admin_markdown', true)
      ON DUPLICATE KEY UPDATE
        title = VALUES(title),
        company = VALUES(company),
        location = VALUES(location),
        salary = VALUES(salary),
        job_type = VALUES(job_type),
        category = VALUES(category),
        work_mode = VALUES(work_mode),
        apply_url = VALUES(apply_url),
        about_role = VALUES(about_role),
        responsibilities_json = VALUES(responsibilities_json),
        requirements_json = VALUES(requirements_json),
        skills_json = VALUES(skills_json),
        details_markdown = VALUES(details_markdown),
        source = 'admin_markdown',
        is_active = true`,
      [
        job.slug,
        job.title,
        job.company,
        job.location,
        job.salary,
        job.jobType,
        job.category,
        job.workMode,
        job.applyUrl,
        job.aboutRole,
        JSON.stringify(job.responsibilities || []),
        JSON.stringify(job.requirements || []),
        JSON.stringify(job.skills || []),
        detailsMarkdown,
      ],
    )

    await refreshRecommendationsForAllOperators()
    const recommendations = await listRecommendations(
      'WHERE sjr.match_score >= 55 AND jl.is_active = true',
      [],
    )
    res.status(201).json({ message: 'Job listing saved and recommendations refreshed.', recommendations })
  } catch (error) {
    next(error)
  }
})

export default router
