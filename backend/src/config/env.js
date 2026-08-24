import dotenv from 'dotenv'

dotenv.config()

const defaultCorsOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

function parseCorsOrigins(value) {
  if (!value) {
    return defaultCorsOrigins
  }

  if (value.trim() === '*') {
    return ['*']
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

function parseApiKeys(value) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean)
}

export const env = {
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  jwtSecret: process.env.JWT_SECRET || 'incognitrix_dev_secret',
  nvidiaApiKey: process.env.NVIDIA_API_KEY || '',
  publicApiKeys: parseApiKeys(process.env.PUBLIC_API_KEYS || process.env.PUBLIC_API_KEY || ''),
  aiBaseUrl: process.env.AI_BASE_URL || 'https://integrate.api.nvidia.com/v1',
  aiModel: process.env.AI_MODEL || 'moonshotai/kimi-k2-thinking',
  aiTemperature: Number(process.env.AI_TEMPERATURE || 1),
  aiTopP: Number(process.env.AI_TOP_P || 0.9),
  aiMaxTokens: Number(process.env.AI_MAX_TOKENS || 16384),
  corsOrigins: parseCorsOrigins(process.env.CORS_ORIGINS),
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  storage: {
    // 'local' keeps blobs on disk; 's3' targets any S3-compatible bucket.
    driver: (process.env.STORAGE_DRIVER || 'local').toLowerCase(),
    localRoot: process.env.STORAGE_LOCAL_ROOT || 'storage',
    bucket: process.env.STORAGE_BUCKET || '',
    region: process.env.STORAGE_REGION || 'us-east-1',
    endpoint: process.env.STORAGE_ENDPOINT || '',
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || '',
    signedUrlSeconds: Number(process.env.STORAGE_SIGNED_URL_SECONDS || 900),
    maxBytes: Number(process.env.STORAGE_MAX_BYTES || 512 * 1024 * 1024),
  },
  mail: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    from: process.env.MAIL_FROM || 'Minerva <no-reply@minerva.local>',
  },
  security: {
    passwordResetMinutes: Number(process.env.PASSWORD_RESET_MINUTES || 60),
    loginAttemptsPerWindow: Number(process.env.LOGIN_ATTEMPTS_PER_WINDOW || 10),
    rateWindowMinutes: Number(process.env.RATE_WINDOW_MINUTES || 15),
    apiRequestsPerWindow: Number(process.env.API_REQUESTS_PER_WINDOW || 1200),
  },
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'CTF',
    password: process.env.DB_PASSWORD || 'root',
    database: process.env.DB_NAME || 'incognitrix_academy',
  },
}
