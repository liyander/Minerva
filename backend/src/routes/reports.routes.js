import { Router } from 'express'
import { pool } from '../db/pool.js'
import { authenticate, requireAdmin, requireTrainer } from '../middleware/auth.js'
import { isRole, ROLES } from '../config/roles.js'
import { listAudit } from '../services/audit.js'
import { runDeadlineReminders, runWeeklyDigest } from '../services/reminders.js'
import { mailerStatus } from '../services/mailer.js'

const router = Router()

router.use(authenticate)

/** RFC 4180 quoting: wrap in quotes and double any embedded quote. */
function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label)).join(',')
  const body = rows
    .map((row) => columns.map((column) => csvCell(row[column.key])).join(','))
    .join('\r\n')
  // A BOM makes Excel read UTF-8 correctly.
  return `﻿${header}\r\n${body}`
}

function sendCsv(res, filename, columns, rows) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  return res.send(toCsv(columns, rows))
}

async function sendPdf(res, filename, columns, rows, reportType) {
  try {
    const pdfmake = (await import('pdfmake')).default
    const fonts = {
      Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique',
      },
    }
    pdfmake.setFonts(fonts)

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)

    const tableBody = []
    tableBody.push(columns.map((c) => ({ text: c.label, style: 'tableHeader' })))
    for (const row of rows) {
      tableBody.push(columns.map((c) => ({ text: String(row[c.key] || '') })))
    }

    const docDefinition = {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      pageOrientation: 'landscape',
      header: { text: `Minerva Report: ${reportType.toUpperCase()}`, margin: [40, 20] },
      footer: (currentPage, pageCount) => ({
        text: `Generated on ${new Date().toLocaleString()} | Page ${currentPage} of ${pageCount}`,
        margin: [40, 20],
        alignment: 'center',
      }),
      content: [
        { text: 'Filters Applied: None', margin: [0, 0, 0, 15] },
        {
          table: {
            headerRows: 1,
            body: tableBody,
          },
        },
      ],
      styles: {
        tableHeader: { bold: true, fillColor: '#eeeeee' },
      },
    }

    const pdfDoc = pdfmake.createPdf(docDefinition)
    const stream = await pdfDoc.getStream()
    stream.pipe(res)
    stream.end()
  } catch (_err) {
    // If PDF engine is not installed in node environment, fallback to structured CSV
    const csvFilename = filename.replace(/\.pdf$/i, '.csv')
    return sendCsv(res, csvFilename, columns, rows)
  }
}


import { EXPORTS } from '../config/exports.js'
import fs from 'fs'
import path from 'path'

/** Which exports the caller may run. */
router.get('/exports', requireTrainer, (req, res) => {
  const admin = isRole(req.user.role, ROLES.ADMIN)
  res.json(
    Object.entries(EXPORTS)
      .filter(([, config]) => admin || config.role !== 'admin')
      .map(([key, config]) => ({ key, filename: config.filename, adminOnly: config.role === 'admin' })),
  )
})

router.get('/exports/:key', requireTrainer, async (req, res) => {
  const config = EXPORTS[req.params.key]
  if (!config) return res.status(404).json({ message: 'Unknown export' })

  if (config.role === 'admin' && !isRole(req.user.role, ROLES.ADMIN)) {
    return res.status(403).json({ message: 'That export is admin-only' })
  }

  const [rows] = await pool.query(config.query)

  // JSON mode lets the client render a print-to-PDF view of the same data.
  if (req.query.format === 'json') {
    return res.json({ key: req.params.key, columns: config.columns, rows })
  }

  if (req.query.format === 'pdf') {
    const filename = `${config.filename.split('.')[0]}.pdf`
    return await sendPdf(res, filename, config.columns, rows, req.params.key)
  }

  return sendCsv(res, `${config.filename.split('.')[0]}.csv`, config.columns, rows)
})

/* ------------------------------------------------- trainer own dashboard --- */

/** A trainer's own numbers, scoped to the material they authored. */
router.get('/trainer/me', requireTrainer, async (req, res) => {
  const trainerId = req.user.id

  const single = async (sql, params = []) => {
    const [rows] = await pool.query(sql, params)
    return rows[0] || {}
  }

  const [assessments, assignments, library, feedback, competencies] = await Promise.all([
    single(
      `SELECT COUNT(*) AS total,
              SUM(is_published = true) AS published,
              (SELECT COUNT(*) FROM assessment_attempts t
                JOIN assessments a2 ON a2.id = t.assessment_id
                WHERE a2.created_by = ? AND t.submitted_at IS NOT NULL) AS attempts,
              (SELECT ROUND(AVG(t.percentage)) FROM assessment_attempts t
                JOIN assessments a3 ON a3.id = t.assessment_id
                WHERE a3.created_by = ? AND t.submitted_at IS NOT NULL) AS avg_score,
              (SELECT COUNT(*) FROM assessment_attempts t
                JOIN assessments a4 ON a4.id = t.assessment_id
                WHERE a4.created_by = ? AND t.passed = true) AS passed
       FROM assessments WHERE created_by = ?`,
      [trainerId, trainerId, trainerId, trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total,
              (SELECT COUNT(*) FROM assignment_submissions s
                JOIN assignments a2 ON a2.id = s.assignment_id
                WHERE a2.created_by = ?) AS submissions,
              (SELECT COUNT(*) FROM assignment_submissions s
                JOIN assignments a3 ON a3.id = s.assignment_id
                WHERE a3.created_by = ? AND s.status = 'submitted') AS awaiting
       FROM assignments WHERE created_by = ?`,
      [trainerId, trainerId, trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total, COALESCE(SUM(download_count), 0) AS opens
       FROM trainer_library_items WHERE trainer_id = ?`,
      [trainerId],
    ),
    single(
      `SELECT COUNT(*) AS total, ROUND(AVG(trainer_rating), 1) AS average
       FROM course_feedback WHERE trainer_id = ? AND trainer_rating IS NOT NULL`,
      [trainerId],
    ),
    single('SELECT COUNT(*) AS total FROM trainer_competencies WHERE trainer_id = ?', [trainerId]),
  ])

  const [subjectRows] = await pool.query(
    `SELECT a.subject,
            COUNT(DISTINCT a.id) AS assessments,
            COUNT(t.id) AS attempts,
            ROUND(AVG(t.percentage)) AS avg_score
     FROM assessments a
     LEFT JOIN assessment_attempts t ON t.assessment_id = a.id AND t.submitted_at IS NOT NULL
     WHERE a.created_by = ?
     GROUP BY a.subject
     ORDER BY attempts DESC`,
    [trainerId],
  )

  const [recentRows] = await pool.query(
    `SELECT 'assessment' AS kind, a.title, t.percentage AS score, t.submitted_at AS at,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS who
     FROM assessment_attempts t
     JOIN assessments a ON a.id = t.assessment_id
     JOIN users u ON u.id = t.user_id
     WHERE a.created_by = ? AND t.submitted_at IS NOT NULL
     UNION ALL
     SELECT 'assignment' AS kind, a.title, s.score, s.submitted_at AS at,
            TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))) AS who
     FROM assignment_submissions s
     JOIN assignments a ON a.id = s.assignment_id
     JOIN users u ON u.id = s.user_id
     WHERE a.created_by = ?
     ORDER BY at DESC LIMIT 15`,
    [trainerId, trainerId],
  )

  const number = (value) => Number(value || 0)

  return res.json({
    assessments: {
      total: number(assessments.total),
      published: number(assessments.published),
      attempts: number(assessments.attempts),
      passed: number(assessments.passed),
      averageScore: number(assessments.avg_score),
    },
    assignments: {
      total: number(assignments.total),
      submissions: number(assignments.submissions),
      awaiting: number(assignments.awaiting),
    },
    library: { items: number(library.total), opens: number(library.opens) },
    feedback: {
      count: number(feedback.total),
      average: feedback.average ? Number(feedback.average) : null,
    },
    competencies: number(competencies.total),
    subjects: subjectRows.map((row) => ({
      subject: row.subject,
      assessments: number(row.assessments),
      attempts: number(row.attempts),
      averageScore: number(row.avg_score),
    })),
    recent: recentRows.map((row) => ({
      kind: row.kind,
      title: row.title,
      who: row.who,
      score: row.score === null ? null : Number(row.score),
      at: row.at,
    })),
  })
})

/* ----------------------------------------------------------- audit log ---- */

router.get('/audit', requireAdmin, async (req, res) => {
  res.json(
    await listAudit({
      action: req.query.action,
      actorId: req.query.actorId,
      entityType: req.query.entityType,
      limit: req.query.limit,
      before: req.query.before,
    }),
  )
})

router.get('/audit/actions', requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    'SELECT action, COUNT(*) AS count FROM audit_log GROUP BY action ORDER BY count DESC',
  )
  res.json(rows.map((row) => ({ action: row.action, count: Number(row.count) })))
})

/* ------------------------------------------------------------ mail jobs --- */

router.get('/mail/status', requireAdmin, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT status, COUNT(*) AS count FROM email_log
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY status`,
  )
  res.json({
    ...mailerStatus(),
    last30Days: rows.map((row) => ({ status: row.status, count: Number(row.count) })),
  })
})

router.post('/mail/reminders', requireAdmin, async (_req, res) => {
  res.json(await runDeadlineReminders())
})

router.post('/mail/digest', requireAdmin, async (_req, res) => {
  res.json(await runWeeklyDigest())
})

export default router
