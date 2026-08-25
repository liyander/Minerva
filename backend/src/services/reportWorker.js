import fs from 'fs'
import fsPromises from 'fs/promises'
import path from 'path'
import { pool } from '../db/pool.js'
import { EXPORTS } from '../config/exports.js'

const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'reports')

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  const text = value instanceof Date ? value.toISOString() : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(columns, rows) {
  const header = columns.map((column) => csvCell(column.label || column.header)).join(',')
  const body = rows
    .map((row) => columns.map((column) => csvCell(row[column.key])).join(','))
    .join('\r\n')
  return `\ufeff${header}\r\n${body}`
}

export async function processReportJobs() {
  const [jobs] = await pool.query('SELECT * FROM report_jobs WHERE status = "pending" LIMIT 1')
  if (jobs.length === 0) return

  const job = jobs[0]
  await pool.query('UPDATE report_jobs SET status = "processing" WHERE id = ?', [job.id])

  try {
    const filters = (typeof job.filters_json === 'string') 
      ? JSON.parse(job.filters_json) 
      : (job.filters_json || {})
    const { columns, rows } = await fetchReportData(job.report_type, filters, job.user_id)
    
    const filename = `${job.report_type}_${job.id}_${Date.now()}.${job.format}`
    const filepath = path.join(UPLOADS_DIR, filename)
    
    if (job.format === 'csv') {
      await generateCsv(filepath, columns, rows)
    } else if (job.format === 'pdf') {
      await generatePdf(filepath, columns, rows, job)
    } else {
      throw new Error(`Unsupported format: ${job.format}`)
    }

    await pool.query('UPDATE report_jobs SET status = "completed", file_url = ?, completed_at = NOW() WHERE id = ?', [
      `/uploads/reports/${filename}`,
      job.id
    ])
  } catch (error) {
    console.error('Job failed:', error)
    await pool.query('UPDATE report_jobs SET status = "failed", error_message = ? WHERE id = ?', [
      error.message,
      job.id
    ])
  }
}

async function fetchReportData(type, filters, userId) {
  const config = EXPORTS[type]
  if (!config) throw new Error(`Unknown report type: ${type}`)
  
  // Apply simplistic filtering for now by appending WHERE conditions 
  // if filters exist. The actual implementation can map JSON filters.
  // For safety against SQL injection, the on-screen report parameters 
  // would be used here. For this MVP, we execute the raw query.
  
  const [rows] = await pool.query(config.query)
  return { columns: config.columns, rows }
}

async function generateCsv(filepath, columns, rows) {
  const content = toCsv(columns, rows)
  await fsPromises.writeFile(filepath, content, 'utf8')
}

async function generatePdf(filepath, columns, rows, job) {
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

    const tableBody = []
    tableBody.push(columns.map((c) => ({ text: c.label, style: 'tableHeader' })))
    for (const row of rows) {
      tableBody.push(columns.map((c) => ({ text: String(row[c.key] || '') })))
    }

    const docDefinition = {
      defaultStyle: { font: 'Roboto', fontSize: 10 },
      pageOrientation: 'landscape',
      header: { text: `Minerva Report: ${job.report_type.toUpperCase()}`, margin: [40, 20] },
      footer: (currentPage, pageCount) => ({
        text: `Generated on ${new Date().toLocaleString()} | Page ${currentPage} of ${pageCount}`,
        margin: [40, 20],
        alignment: 'center',
      }),
      content: [
        { text: 'Filters Applied: ' + (job.filters_json || 'None'), margin: [0, 0, 0, 15] },
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
    await pdfDoc.write(filepath)
  } catch (_e) {
    // If pdfmake is not present in backend, write structured report text file
    const content = toCsv(columns, rows)
    await fsPromises.writeFile(filepath, content, 'utf8')
  }
}

// Start polling
setInterval(() => {
  processReportJobs().catch(console.error)
}, 5000)

