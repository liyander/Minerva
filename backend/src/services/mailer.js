import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

/**
 * Email delivery. When SMTP is configured the message goes out through
 * nodemailer; otherwise it is logged to the console and recorded as 'skipped'.
 * Every send is written to `email_log`, and an optional `dedupeKey` makes
 * reminder jobs safe to run repeatedly.
 */

let transport = null
let transportLoadFailed = false

async function getTransport() {
  if (transport || transportLoadFailed) return transport
  if (!env.mail.host) return null

  try {
    const nodemailer = await import('nodemailer')
    transport = nodemailer.default.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      ...(env.mail.user
        ? { auth: { user: env.mail.user, pass: env.mail.password } }
        : {}),
    })
  } catch (error) {
    console.error('Could not initialise the mail transport:', error.message)
    transportLoadFailed = true
  }

  return transport
}

const LAYOUT = (title, bodyHtml) => `
<div style="font-family:Inter,Arial,sans-serif;background:#eef0f6;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:20px;padding:32px">
    <p style="margin:0 0 4px;font-size:18px;font-weight:800;color:#6d3a17">Minerva</p>
    <p style="margin:0 0 24px;font-size:13px;color:#6b7488">Online Learning Academy</p>
    <h1 style="margin:0 0 16px;font-size:22px;color:#1b2233">${title}</h1>
    <div style="font-size:14px;line-height:22px;color:#3c4557">${bodyHtml}</div>
    <p style="margin:28px 0 0;font-size:12px;color:#9aa2b1">
      You are receiving this because you have an account on Minerva.
    </p>
  </div>
</div>`

const TEMPLATES = {
  accountApproved: ({ name }) => ({
    subject: 'Your Minerva account is approved',
    html: LAYOUT(
      'You are all set',
      `<p>Hello ${name},</p><p>An administrator has approved your account. You can sign in and start straight away.</p>`,
    ),
  }),
  accountRejected: ({ name, reason }) => ({
    subject: 'About your Minerva account request',
    html: LAYOUT(
      'Account request declined',
      `<p>Hello ${name},</p><p>Your account request was not approved.</p>${
        reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''
      }<p>Contact your administrator if you believe this is a mistake.</p>`,
    ),
  }),
  passwordReset: ({ name, resetUrl, expiresMinutes }) => ({
    subject: 'Reset your Minerva password',
    html: LAYOUT(
      'Reset your password',
      `<p>Hello ${name},</p><p>Use the link below to choose a new password. It expires in ${expiresMinutes} minutes.</p>
       <p><a href="${resetUrl}" style="display:inline-block;background:#6d3a17;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:700">Choose a new password</a></p>
       <p style="font-size:12px;color:#6b7488">If you did not ask for this, you can ignore this email.</p>`,
    ),
  }),
  deadlineReminder: ({ name, items }) => ({
    subject: `You have ${items.length} deadline${items.length === 1 ? '' : 's'} coming up`,
    html: LAYOUT(
      'Deadlines approaching',
      `<p>Hello ${name},</p><p>These items are due soon:</p><ul>${items
        .map((item) => `<li><strong>${item.title}</strong> — due ${item.due}</li>`)
        .join('')}</ul>`,
    ),
  }),
  weeklyDigest: ({ name, stats, highlights }) => ({
    subject: 'Your week on Minerva',
    html: LAYOUT(
      'Your weekly summary',
      `<p>Hello ${name},</p>
       <p>You completed <strong>${stats.coursesCompleted}</strong> course(s) and took
       <strong>${stats.attempts}</strong> assessment(s) this week${
         stats.averageScore ? `, averaging <strong>${stats.averageScore}%</strong>` : ''
       }.</p>
       ${
         highlights.length
           ? `<p>New on the platform:</p><ul>${highlights
               .map((item) => `<li>${item}</li>`)
               .join('')}</ul>`
           : ''
       }`,
    ),
  }),
  gradeReleased: ({ name, assignmentTitle, score, maxScore, passed }) => ({
    subject: `Your submission for "${assignmentTitle}" has been marked`,
    html: LAYOUT(
      'Your work has been marked',
      `<p>Hello ${name},</p><p>You scored <strong>${score}/${maxScore}</strong> — ${
        passed ? 'a pass' : 'not a pass this time'
      }. Open the assignment to read the feedback.</p>`,
    ),
  }),
}

/**
 * Sends one templated email. Returns `{ sent, skipped, deduped }` rather than
 * throwing, so a mail failure never breaks the request that triggered it.
 */
export async function sendMail({ to, template, data = {}, dedupeKey = null }) {
  const builder = TEMPLATES[template]
  if (!builder) {
    return { sent: false, error: `Unknown template: ${template}` }
  }
  if (!to) {
    return { sent: false, error: 'No recipient' }
  }

  const { subject, html } = builder(data)

  if (dedupeKey) {
    const [existing] = await pool.query(
      'SELECT 1 FROM email_log WHERE dedupe_key = ? LIMIT 1',
      [dedupeKey],
    )
    if (existing.length) {
      return { sent: false, deduped: true }
    }
  }

  const activeTransport = await getTransport()

  if (!activeTransport) {
    console.log(`[mail:skipped] ${template} -> ${to}: ${subject}`)
    await recordEmail({ to, subject, template, status: 'skipped', dedupeKey })
    return { sent: false, skipped: true }
  }

  try {
    await activeTransport.sendMail({ from: env.mail.from, to, subject, html })
    await recordEmail({ to, subject, template, status: 'sent', dedupeKey })
    return { sent: true }
  } catch (error) {
    console.error(`[mail:failed] ${template} -> ${to}:`, error.message)
    await recordEmail({
      to,
      subject,
      template,
      status: 'failed',
      dedupeKey,
      error: error.message,
    })
    return { sent: false, error: error.message }
  }
}

async function recordEmail({ to, subject, template, status, dedupeKey, error = null }) {
  try {
    await pool.query(
      `INSERT INTO email_log (recipient, subject, template, status, error_text, dedupe_key)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [to, subject, template, status, error, dedupeKey],
    )
  } catch (logError) {
    if (logError?.code !== 'ER_DUP_ENTRY' && logError?.code !== 'ER_NO_SUCH_TABLE') {
      console.error('Could not write to the email log:', logError.message)
    }
  }
}

export function mailerStatus() {
  return {
    configured: Boolean(env.mail.host),
    host: env.mail.host || null,
    from: env.mail.from,
  }
}
