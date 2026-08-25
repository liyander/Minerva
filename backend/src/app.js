import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { env } from './config/env.js'
import { databaseErrorMessage, wrapRouterAsync } from './middleware/asyncRouter.js'
import authRoutes from './routes/auth.routes.js'
import careerPathRoutes from './routes/careerPaths.routes.js'
import platformRoutes from './routes/platform.routes.js'
import roomRoutes from './routes/rooms.routes.js'
import categoryRoutes from './routes/categories.routes.js'
import notificationsRoutes from './routes/notifications.routes.js'
import ctfEventsRoutes from './routes/ctfEvents.routes.js'
import usersRoutes from './routes/users.routes.js'
import cvesRoutes from './routes/cves.routes.js'
import chatbotRoutes from './routes/chatbot.routes.js'
import adminAiRoutes from './routes/adminAi.routes.js'
import certificatesRoutes from './routes/certificates.routes.js'
import notesRoutes from './routes/notes.routes.js'
import developerRoutes from './routes/developer.routes.js'
import jobsRoutes from './routes/jobs.routes.js'
import resumesRoutes from './routes/resumes.routes.js'
import interviewsRoutes from './routes/interviews.routes.js'
import labResearchRoutes from './routes/labResearch.routes.js'
import databaseRoutes from './routes/database.routes.js'
import profilesRoutes from './routes/profiles.routes.js'
import assessmentsRoutes from './routes/assessments.routes.js'
import trainingRoutes from './routes/training.routes.js'
import adminUsersRoutes from './routes/adminUsers.routes.js'
import communityRoutes from './routes/community.routes.js'
import filesRoutes from './routes/files.routes.js'
import assignmentsRoutes from './routes/assignments.routes.js'
import questionBanksRoutes from './routes/questionBanks.routes.js'
import cohortsRoutes from './routes/cohorts.routes.js'
import complianceRoutes from './routes/compliance.routes.js'
import learningRoutes from './routes/learning.routes.js'
import reportsRoutes from './routes/reports.routes.js'
import youtubeRoutes from './routes/youtube.routes.js'
import experienceRoutes from './routes/experience.routes.js'
import publicApiRoutes from './api/publicApi.routes.js'

const app = express()

const corsOptions = {
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) {
      callback(null, true)
      return
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`))
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}

// Only trust X-Forwarded-For when actually deployed behind a proxy. Trusting it
// unconditionally lets any client spoof its own address and defeat rate limits.
if (env.security.trustProxy) {
  app.set('trust proxy', env.security.trustProxy)
}

// contentSecurityPolicy is left off: this API serves JSON and presigned
// redirects, and the SPA is served separately with its own policy.
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }))

const windowMs = env.security.rateWindowMinutes * 60 * 1000

// Credential endpoints get a tight budget to blunt brute-force attempts.
const authLimiter = rateLimit({
  windowMs,
  limit: env.security.loginAttemptsPerWindow,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: 'Too many attempts. Try again later.' },
})

/**
 * Identifies the caller for rate-limiting. Signed-in requests are bucketed per
 * user, so one busy tab cannot exhaust the quota for everyone sharing an office
 * IP or NAT gateway. Anonymous requests fall back to the address.
 */
function rateLimitKey(req) {
  const [, token] = (req.headers.authorization || '').split(' ')

  if (token) {
    try {
      // Only the subject is needed, and an expired token still identifies a
      // caller well enough to meter them; verification happens in authenticate.
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
      if (payload?.id) return `user:${payload.id}`
    } catch {
      // Malformed token: fall through to the address.
    }
  }

  return `ip:${ipKeyGenerator(req)}`
}

const apiLimiter = rateLimit({
  windowMs,
  limit: env.security.apiRequestsPerWindow,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: rateLimitKey,
  // Health checks and CORS preflight are not traffic worth metering.
  skip: (req) => req.method === 'OPTIONS' || req.path === '/health',
  message: { message: 'Too many requests. Slow down and try again.' },
})

app.use(cors(corsOptions))
app.options('*', cors(corsOptions))
app.use('/api/rooms/:id/docker/proxy', express.raw({ type: '*/*', limit: '50mb' }))
app.use(express.json({ limit: '50mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/api/auth/login', authLimiter)
app.use('/api/auth/signup', authLimiter)
app.use('/api/auth/register', authLimiter)
app.use('/api/auth/forgot-password', authLimiter)
app.use('/api/auth/reset-password', authLimiter)
app.use('/api', apiLimiter)

app.use('/api/auth', authRoutes)
app.use('/api/rooms', roomRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/career-paths', careerPathRoutes)
app.use('/api/platform-config', platformRoutes)
app.use('/api/notifications', notificationsRoutes)
app.use('/api/ctf-events', ctfEventsRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/cves', cvesRoutes)
app.use('/api/chatbot', chatbotRoutes)
app.use('/api/admin-ai', adminAiRoutes)
app.use('/api/certificates', certificatesRoutes)
app.use('/api/notes', notesRoutes)
app.use('/api/developer', developerRoutes)
app.use('/api/jobs', jobsRoutes)
app.use('/api/resumes', resumesRoutes)
app.use('/api/interviews', interviewsRoutes)
app.use('/api/lab-research', labResearchRoutes)
app.use('/api/database', databaseRoutes)
app.use('/api/profiles', profilesRoutes)
app.use('/api/assessments', assessmentsRoutes)
app.use('/api/training', trainingRoutes)
app.use('/api/admin', adminUsersRoutes)
app.use('/api/community', communityRoutes)
app.use('/api/files', filesRoutes)
app.use('/api/assignments', assignmentsRoutes)
app.use('/api/question-banks', questionBanksRoutes)
app.use('/api/cohorts', cohortsRoutes)
app.use('/api/compliance', complianceRoutes)
app.use('/api/learning', learningRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/youtube', youtubeRoutes)
app.use('/api/experience', experienceRoutes)
app.use('/api/public', publicApiRoutes)

// Async handlers reject rather than throw synchronously; wrapping every mounted
// router routes those rejections here instead of crashing the process.
wrapRouterAsync(app._router)

app.use((err, _req, res, _next) => {
  console.error(err)

  const mapped = databaseErrorMessage(err)
  if (mapped) {
    return res.status(mapped.status).json({ message: mapped.message })
  }

  return res.status(500).json({ message: 'Internal server error' })
})

export default app
