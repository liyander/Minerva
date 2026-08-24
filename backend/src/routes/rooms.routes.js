import { Router } from 'express'
import OpenAI from 'openai'
import { execFile, spawn } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'
import { WebSocketServer } from 'ws'
import { pool } from '../db/pool.js'
import { env } from '../config/env.js'
import { authenticate, optionalAuthenticate, requireAdmin } from '../middleware/auth.js'
import { mapRoomRow } from '../services/roomMapper.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'

const router = Router()
const execFileAsync = promisify(execFile)

function isTheoreticalRoom(room) {
  return String(room?.roomType || 'theoretical').toLowerCase() !== 'practical'
}

function hasPracticalAiQuestions(room) {
  return !isTheoreticalRoom(room) && Boolean(room?.content?.aiQuestionsEnabled)
}

function getDockerConfig(room) {
  const docker = room?.content?.docker || {}
  const isPractical = !isTheoreticalRoom(room)
  const serviceImage = String(docker.image || '').trim()
  const fallbackImage = String(serviceImage || docker.terminalImage || env.defaultDockerImage || 'ubuntu:24.04').trim()
  const terminalTools = String(docker.terminalTools || '')
    .split(/[\s,]+/)
    .map((tool) => tool.trim())
    .filter((tool) => /^[a-zA-Z0-9+._-]{1,80}$/.test(tool))
    .slice(0, 30)
  return {
    enabled: isPractical,
    image: fallbackImage,
    hasWebService: Boolean(serviceImage),
    containerPort: Number(docker.containerPort || 0),
    protocol: ['http', 'https', 'tcp'].includes(String(docker.protocol || '').toLowerCase())
      ? String(docker.protocol).toLowerCase()
      : 'http',
    timeoutMinutes: Math.max(5, Math.min(720, Number(docker.timeoutMinutes || 120))),
    instructions: String(docker.instructions || ''),
    terminalTools,
    exposeAttachmentToTerminal: Boolean(docker.exposeAttachmentToTerminal),
    terminalMode: String(docker.terminalMode || '').toLowerCase() === 'isolated' ? 'isolated' : 'service',
    terminalImage: String(docker.terminalImage || '').trim(),
  }
}

function validateDockerConfig(config) {
  if (!config.enabled) return 'Docker is not enabled for this room.'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,511}$/.test(config.image)) {
    return 'Docker image is missing or contains unsupported characters.'
  }
  if (config.containerPort && (!Number.isInteger(config.containerPort) || config.containerPort < 1 || config.containerPort > 65535)) {
    return 'Internal service port must be blank or between 1 and 65535.'
  }
  if (config.terminalMode === 'isolated' && !/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]{0,511}$/.test(config.terminalImage)) {
    return 'Isolated terminal image is missing or contains unsupported characters.'
  }
  return ''
}

function buildDockerContainerName(userId, roomId) {
  return `incognitrix_${userId}_${String(roomId || '').replace(/[^a-zA-Z0-9_.-]/g, '_')}`.slice(0, 120)
}

function buildDockerTerminalContainerName(userId, roomId) {
  return `${buildDockerContainerName(userId, roomId)}_terminal`.slice(0, 120)
}

async function inspectDockerContainer(containerName) {
  try {
    const details = await dockerApiRequest(`/containers/${encodeURIComponent(containerName)}/json`)
    const containerId = details?.Id || ''
    return {
      exists: Boolean(containerId),
      containerId,
      running: Boolean(details?.State?.Running),
      ports: details?.NetworkSettings?.Ports || {},
    }
  } catch {
    return { exists: false, containerId: '', running: false, ports: {} }
  }
}

async function stopDockerContainer(containerName) {
  try {
    await dockerApiRequest(`/containers/${encodeURIComponent(containerName)}?force=true`, { method: 'DELETE' })
  } catch {
    // Already stopped or Docker is unavailable.
  }
}

async function stopStaleDockerInstance(instance, config) {
  if (!instance?.created_at) return false
  const createdAt = new Date(instance.created_at).getTime()
  const maxAgeMs = Number(config.timeoutMinutes || 120) * 60 * 1000
  if (Date.now() - createdAt < maxAgeMs) return false

  await stopDockerContainer(instance.container_name)
  await stopDockerContainer(`${instance.container_name}_terminal`)
  await pool.query(
    `UPDATE user_room_docker_instances
     SET status = 'expired'
     WHERE id = ?`,
    [instance.id],
  )
  return true
}

function getDockerExpiry(instance, config) {
  if (!instance?.created_at) return null
  const createdAt = new Date(instance.created_at).getTime()
  if (!Number.isFinite(createdAt)) return null
  const timeoutMs = Number(config.timeoutMinutes || 120) * 60 * 1000
  return new Date(createdAt + timeoutMs).toISOString()
}

function getRequestOrigin(req) {
  const forwardedProtocol = String(req.get('x-forwarded-proto') || '').split(',')[0].trim()
  const forwardedHost = String(req.get('x-forwarded-host') || '').split(',')[0].trim()
  const protocol = forwardedProtocol || req.protocol || 'http'
  const host = forwardedHost || req.get('host') || ''
  return host ? `${protocol}://${host}` : ''
}

function getBearerTokenFromRequest(req) {
  const authHeader = String(req.get('authorization') || '')
  const [, token] = authHeader.split(' ')
  return token || ''
}

function getDockerServiceHost(dockerConnection = {}) {
  const normalized = normalizeDockerHostname(dockerConnection.hostname, dockerConnection.tlsEnabled)
  if (normalized.url?.hostname) return normalized.url.hostname
  return '127.0.0.1'
}

function buildDockerAccess(config, hostPort, requestHost = '', dockerConnection = {}, options = {}) {
  if (!hostPort || !config.hasWebService) return null
  const host = dockerConnection.displayHost || requestHost || env.publicHost || '127.0.0.1'
  if (config.protocol === 'tcp') {
    return {
      host,
      port: hostPort,
      url: `${host}:${hostPort}`,
    }
  }

  const directUrl = `${config.protocol}://${host}:${hostPort}`
  if (options.req && options.roomId) {
    const token = getBearerTokenFromRequest(options.req)
    const origin = getRequestOrigin(options.req)
    const proxyPath = `/api/rooms/${encodeURIComponent(options.roomId)}/docker/proxy/`
    const tokenSuffix = token ? `?token=${encodeURIComponent(token)}` : ''
    const proxyUrl = `${origin}${proxyPath}${tokenSuffix}`
    return {
      host: getDockerServiceHost(dockerConnection),
      port: hostPort,
      url: proxyUrl,
      proxyUrl,
      proxyPath,
      directUrl,
    }
  }

  return {
    host,
    port: hostPort,
    url: directUrl,
    directUrl,
  }
}

async function getStoredDockerConfig() {
  const [rows] = await pool.query('SELECT * FROM docker_config WHERE id = 1 LIMIT 1')
  const row = rows[0] || {}
  return {
    hostname: row.hostname || '',
    displayHost: row.display_host || '',
    tlsEnabled: Boolean(row.tls_enabled),
    caCert: row.ca_cert || '',
    clientCert: row.client_cert || '',
    clientKey: row.client_key || '',
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

async function buildDockerCliPrefix() {
  const config = await getStoredDockerConfig()
  const args = []
  const cleanupPaths = []

  if (config.hostname) {
    args.push('-H', config.hostname)
  }

  if (config.tlsEnabled) {
    args.push('--tlsverify')
    const certDir = await fs.mkdtemp(path.join(os.tmpdir(), 'incognitrix-docker-'))
    cleanupPaths.push(certDir)

    if (config.caCert) {
      const certPath = path.join(certDir, 'ca.pem')
      await fs.writeFile(certPath, config.caCert)
      args.push('--tlscacert', certPath)
    }
    if (config.clientCert) {
      const certPath = path.join(certDir, 'cert.pem')
      await fs.writeFile(certPath, config.clientCert)
      args.push('--tlscert', certPath)
    }
    if (config.clientKey) {
      const keyPath = path.join(certDir, 'key.pem')
      await fs.writeFile(keyPath, config.clientKey)
      args.push('--tlskey', keyPath)
    }
  }

  return {
    args,
    config,
    cleanup: async () => {
      await Promise.all(cleanupPaths.map((item) => fs.rm(item, { recursive: true, force: true })))
    },
  }
}

async function dockerExec(args, options = {}) {
  const prefix = await buildDockerCliPrefix()
  try {
    return await execFileAsync('docker', [...prefix.args, ...args], options)
  } finally {
    await prefix.cleanup()
  }
}

function shellQuote(value) {
  const text = String(value ?? '')
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(text)) {
    return text
  }
  return `'${text.replace(/'/g, "'\\''")}'`
}

function sanitizeContainerFileName(name) {
  return String(name || 'challenge-file')
    .replace(/[/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 120) || 'challenge-file'
}

function decodeDataUrl(dataUrl) {
  const raw = String(dataUrl || '')
  const match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/)
  if (!match) {
    return Buffer.from(raw, 'utf8')
  }
  const payload = decodeURIComponent(match[3] || '')
  return match[2] ? Buffer.from(payload, 'base64') : Buffer.from(payload, 'utf8')
}

async function installDockerTerminalTools(containerId, tools = []) {
  if (!tools.length) return
  const toolList = tools.join(' ')
  const script = `
set -e
TOOLS="${toolList}"
if command -v apk >/dev/null 2>&1; then
  apk add --no-cache $TOOLS
elif command -v apt-get >/dev/null 2>&1; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends $TOOLS
  rm -rf /var/lib/apt/lists/*
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y $TOOLS
elif command -v yum >/dev/null 2>&1; then
  yum install -y $TOOLS
else
  echo "No supported package manager found for requested terminal tools. Use an isolated terminal image with apk, apt-get, dnf, or yum." >&2
  exit 127
fi
`

  await dockerExec(['exec', '--user', '0:0', containerId, 'sh', '-lc', script], {
    timeout: 180000,
    maxBuffer: 1024 * 1024,
  })
}

async function ensureDockerTerminalTools(containerId, tools = []) {
  if (!tools.length) return
  const marker = `/tmp/.incognitrix_tools_${tools.join('_').replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 120)}`
  try {
    await dockerExec(['exec', containerId, 'sh', '-lc', `test -f ${marker}`], {
      timeout: 5000,
      maxBuffer: 64 * 1024,
    })
    return
  } catch {
    // Missing marker: install the configured tools below.
  }

  await installDockerTerminalTools(containerId, tools)
  await dockerExec(['exec', '--user', '0:0', containerId, 'sh', '-lc', `touch ${marker}`], {
    timeout: 5000,
    maxBuffer: 64 * 1024,
  })
}

async function copyRoomAttachmentToDocker(containerId, room, config) {
  if (!config.exposeAttachmentToTerminal || !room?.content?.attachment?.dataUrl) return

  const fileName = sanitizeContainerFileName(room.content.attachment.name)
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'incognitrix-room-file-'))
  const tempPath = path.join(tempDir, fileName)
  try {
    await fs.writeFile(tempPath, decodeDataUrl(room.content.attachment.dataUrl))
    await dockerExec(['exec', '--user', '0:0', containerId, 'sh', '-lc', 'mkdir -p /challenge && chmod 777 /challenge'], {
      timeout: 10000,
      maxBuffer: 128 * 1024,
    })
    await dockerExec(['cp', tempPath, `${containerId}:/challenge/${fileName}`], {
      timeout: 30000,
      maxBuffer: 512 * 1024,
    })
    await dockerExec(['exec', '--user', '0:0', containerId, 'chmod', '644', `/challenge/${fileName}`], {
      timeout: 10000,
      maxBuffer: 128 * 1024,
    })
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

function splitTerminalCwdFromOutput(stdout) {
  const marker = '__INCOGNITRIX_CWD__'
  const text = String(stdout || '')
  const index = text.lastIndexOf(marker)
  if (index === -1) {
    return { stdout: text, cwd: '' }
  }

  const before = text.slice(0, index).replace(/\n$/, '')
  const after = text.slice(index + marker.length).trim().split(/\r?\n/)[0] || ''
  return { stdout: before, cwd: after || '' }
}

function isBlockedPlayerTerminalCommand(command) {
  const normalized = String(command || '').toLowerCase()
  return /(^|[;&|()]\s*|\s)(sudo\s+)?(apt|apt-get|apk|yum|dnf|pacman|zypper)\s+/.test(normalized) ||
    /(^|[;&|()]\s*|\s)(pip|pip3|npm|pnpm|yarn|gem|cargo|go)\s+(install|add|get)\b/.test(normalized)
}

function getBlockedInteractiveTerminalCommand(command) {
  const normalized = String(command || '').trim().toLowerCase()
  const interactivePattern =
    /(^|[;&|()]\s*)(vim|vi|nano|emacs|less|more|top|htop|watch|tmux|screen|ssh|telnet|ftp|mysql|psql|sqlite3)(\s|$)/
  const shellPattern = /^(bash|sh|zsh|fish|dash|ash)(\s*)$/

  if (interactivePattern.test(normalized) || shellPattern.test(normalized)) {
    return 'Interactive full-screen terminal programs are not supported in this browser command runner. Use non-interactive commands such as cat, printf, sed, python scripts, or admin-prepared tooling.'
  }

  return ''
}

function normalizeDockerHostname(hostname, tlsEnabled) {
  const raw = String(hostname || '').trim()
  if (!raw) {
    return { socketPath: '/var/run/docker.sock', basePath: '' }
  }

  if (raw.startsWith('unix://')) {
    return { socketPath: raw.replace(/^unix:\/\//, ''), basePath: '' }
  }

  const withProtocol = /^[a-z]+:\/\//i.test(raw)
    ? raw
    : `${tlsEnabled ? 'https' : 'http'}://${raw}`
  return { url: new URL(withProtocol) }
}

async function dockerApiRequest(apiPath, { method = 'GET', body = null } = {}) {
  const docker = await getStoredDockerConfig()
  const target = normalizeDockerHostname(docker.hostname, docker.tlsEnabled)
  const payload = body ? JSON.stringify(body) : null

  return new Promise((resolve, reject) => {
    const isHttps = target.url?.protocol === 'https:'
    const transport = isHttps ? https : http
    const requestOptions = target.socketPath
      ? {
        socketPath: target.socketPath,
        path: apiPath,
        method,
      }
      : {
        hostname: target.url.hostname,
        port: target.url.port || (isHttps ? 443 : 80),
        path: `${target.url.pathname === '/' ? '' : target.url.pathname}${apiPath}`,
        method,
        protocol: target.url.protocol,
      }

    requestOptions.headers = {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
    }

    if (isHttps && docker.tlsEnabled) {
      if (docker.caCert) requestOptions.ca = docker.caCert
      if (docker.clientCert) requestOptions.cert = docker.clientCert
      if (docker.clientKey) requestOptions.key = docker.clientKey
      requestOptions.rejectUnauthorized = true
    }

    const request = transport.request(requestOptions, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        data += chunk
      })
      response.on('end', () => {
        const ok = response.statusCode >= 200 && response.statusCode < 300
        const parsed = data ? safeJsonParse(data, data) : null
        if (!ok) {
          reject(new Error(typeof parsed === 'object' ? parsed.message || data : data || `Docker API ${response.statusCode}`))
          return
        }
        resolve(parsed)
      })
    })

    request.on('error', reject)
    request.setTimeout(20000, () => {
      request.destroy(new Error('Docker API request timed out.'))
    })
    if (payload) request.write(payload)
    request.end()
  })
}

async function dockerApiImages() {
  const images = await dockerApiRequest('/images/json?all=1')
  return Array.isArray(images) ? images : []
}

async function dockerApiContainers(all = true) {
  const containers = await dockerApiRequest(`/containers/json?all=${all ? 1 : 0}`)
  return Array.isArray(containers) ? containers : []
}

async function getUnavailableDockerPorts() {
  const containers = await dockerApiContainers(true)
  const dockerPorts = containers.flatMap((container) =>
    Array.isArray(container.Ports)
      ? container.Ports.map((port) => Number(port.PublicPort)).filter(Boolean)
      : [],
  )
  const [instanceRows] = await pool.query(
    `SELECT host_port
     FROM user_room_docker_instances
     WHERE status = 'running' AND host_port IS NOT NULL`,
  )
  const instancePorts = instanceRows.map((row) => Number(row.host_port)).filter(Boolean)
  return [...new Set([...dockerPorts, ...instancePorts])]
}

function chooseRandomDockerPort(blockedPorts) {
  const blocked = new Set(blockedPorts.map(Number))
  const minPort = 20000
  const maxPort = 65000
  for (let attempt = 0; attempt < 8000; attempt += 1) {
    const candidate = minPort + Math.floor(Math.random() * (maxPort - minPort + 1))
    if (!blocked.has(candidate)) return candidate
  }
  throw new Error('Unable to allocate a random available Docker host port.')
}

async function getDockerImageExposedPorts(image, fallbackPort) {
  try {
    const details = await dockerApiRequest(`/images/${encodeURIComponent(image)}/json`)
    const exposed = Object.keys(details?.Config?.ExposedPorts || {})
    if (exposed.length) return exposed
  } catch {
    // Fall back to room configured port below.
  }
  if (Number.isInteger(fallbackPort) && fallbackPort >= 1 && fallbackPort <= 65535) {
    return [`${fallbackPort}/tcp`]
  }
  return []
}

function getPublishedDockerHostPort(inspected, containerPort) {
  const ports = inspected?.ports || {}
  if (containerPort) {
    const preferredPort = ports[`${containerPort}/tcp`]
    const preferredHostPort = Array.isArray(preferredPort) ? Number(preferredPort[0]?.HostPort || 0) : 0
    if (preferredHostPort) return preferredHostPort
  }

  for (const binding of Object.values(ports)) {
    const hostPort = Array.isArray(binding) ? Number(binding[0]?.HostPort || 0) : 0
    if (hostPort) return hostPort
  }

  return 0
}

async function createStartedDockerContainerWithRandomPorts(containerName, image, exposedPorts) {
  const blockedPorts = await getUnavailableDockerPorts()
  const portsToPublish = Array.isArray(exposedPorts) ? exposedPorts : []

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const selectedPorts = []
    const portBindings = Object.fromEntries(
      portsToPublish.map((portName) => {
        const hostPort = chooseRandomDockerPort([...blockedPorts, ...selectedPorts])
        selectedPorts.push(hostPort)
        return [portName, [{ HostPort: String(hostPort) }]]
      }),
    )
    let containerId = ''

    try {
      const created = await dockerApiRequest(`/containers/create?name=${encodeURIComponent(containerName)}`, {
        method: 'POST',
        body: {
          Image: image,
          ...(portsToPublish.length ? { ExposedPorts: Object.fromEntries(portsToPublish.map((portName) => [portName, {}])) } : {}),
          HostConfig: {
            ...(portsToPublish.length ? { PortBindings: portBindings } : {}),
          },
        },
      })

      containerId = created?.Id || ''
      if (!containerId) {
        throw new Error(created?.message || 'Docker did not return a container id.')
      }

      await dockerApiRequest(`/containers/${encodeURIComponent(containerId)}/start`, { method: 'POST' })
      return { containerId, assignedPorts: selectedPorts }
    } catch (error) {
      if (containerId) {
        await stopDockerContainer(containerId)
      } else {
        await stopDockerContainer(containerName)
      }

      selectedPorts.forEach((port) => blockedPorts.push(port))
      const retryable = /port is already allocated|address already in use|bind/i.test(error?.message || '')
      if (!retryable || attempt === 11) {
        throw error
      }
    }
  }

  throw new Error('Unable to create Docker container with a random host port.')
}

async function createStartedDockerTerminalContainer(containerName, image) {
  const created = await dockerApiRequest(`/containers/create?name=${encodeURIComponent(containerName)}`, {
    method: 'POST',
    body: {
      Image: image,
      Cmd: ['sh', '-lc', 'while true; do sleep 3600; done'],
      HostConfig: {},
    },
  })

  const containerId = created?.Id || ''
  if (!containerId) {
    throw new Error(created?.message || 'Docker did not return a terminal container id.')
  }

  await dockerApiRequest(`/containers/${encodeURIComponent(containerId)}/start`, { method: 'POST' })
  return { containerId }
}

function extractMessageText(modelMessage) {
  const content = modelMessage?.content
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part
        if (typeof part?.text === 'string') return part.text
        if (typeof part?.output_text === 'string') return part.output_text
        return ''
      })
      .join('\n')
      .trim()
  }

  return ''
}

function safeJsonParse(raw, fallback) {
  try {
    const parsed = JSON.parse(raw || '')
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function extractJsonObject(raw) {
  const text = String(raw || '').trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidates = [
    text,
    fenced?.[1],
    text.includes('{') ? text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) : '',
  ].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch {
      // try next
    }
  }

  return null
}

function extractPartialEvaluationObject(raw) {
  const text = String(raw || '')
  const readNumber = (key) => {
    const match = text.match(new RegExp(`"${key}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`))
    return match ? Number(match[1]) : undefined
  }
  const technicalScore = readNumber('technicalScore')
  const grammarScore = readNumber('grammarScore')
  if (technicalScore === undefined || grammarScore === undefined) return null

  const bonusScore = readNumber('bonusScore') ?? 0
  const feedbackMatch = text.match(/"feedback"\s*:\s*"([\s\S]*)$/)
  const feedback = feedbackMatch
    ? feedbackMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/"?\s*}?\s*$/, '').trim()
    : 'Evaluation completed. Improve next: 1) Tie each answer directly to the room content. 2) Add exact examples where requested.'

  return {
    technicalScore,
    grammarScore,
    bonusScore,
    feedback,
  }
}

function hashText(value) {
  return String(value || '')
    .split('')
    .reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 997, 0)
}

function buildFallbackTheoreticalQuestions(room, userId, attemptSalt = '') {
  const seed = (Number(userId || 1) + hashText(attemptSalt)) % 5
  const topic = room.title || room.category || 'this security concept'
  const variants = [
    [
      `Using only this room's content, explain the main idea behind "${topic}".`,
      `From the room content, list two risks or impacts connected to "${topic}".`,
      `Name one mitigation or careful practice mentioned or implied by this room for "${topic}".`,
      `Describe one simple example or scenario for "${topic}" that stays within this room's content.`,
      `What should a beginner remember most from this room about "${topic}"?`,
    ],
    [
      `Define "${topic}" at the same depth as this room explains it.`,
      `What evidence or clues from the room content help you understand this issue?`,
      `Summarize the room's remediation idea for "${topic}" in simple steps.`,
      `Explain why "${topic}" matters for security based only on this room.`,
      `List two room-specific terms or ideas that are important for understanding "${topic}".`,
    ],
    [
      `What assumption or mistake does this room warn about in "${topic}"?`,
      `Explain one prevention idea and one detection or verification idea that match this room.`,
      `Write a short note explaining the likely impact described by this room.`,
      `How would you explain the safe or correct approach for "${topic}" to a new learner?`,
      `What part of the room content would you use as evidence for your answer about "${topic}"?`,
    ],
    [
      `Explain "${topic}" to a beginner using only concepts covered in this room.`,
      `Describe a basic triage process for "${topic}" based on this room's examples or explanation.`,
      `What beginner mistake could happen with "${topic}", and how does the room suggest avoiding it?`,
      `What is one consequence of ignoring the room's guidance about "${topic}"?`,
      `Give one short checklist item that follows from this room's explanation of "${topic}".`,
    ],
    [
      `Describe a simple threat scenario for "${topic}" without adding concepts outside this room.`,
      `How would you verify that the issue in "${topic}" is understood or fixed, based on this room?`,
      `Give one practical recommendation that follows directly from this room content.`,
      `What is the difference between the unsafe and safer approach described or implied by this room?`,
      `Summarize the room's key lesson about "${topic}" in two or three sentences.`,
    ],
  ]

  const questions = variants[seed].map((prompt, index) => ({
    id: `u${userId || 0}-q-${index + 1}`,
    prompt,
    rubric: 'Assess conceptual accuracy, specificity, remediation quality, and clarity.',
    sourceType: 'generated',
    company: '',
    interview: index === 0 && seed >= 3 ? `${topic} role-screening practice` : '',
    sourceInfo: '',
    learnerVariant: `${room.id || topic}-${userId || 0}-${seed}`,
    contentAnchorVersion: 'content-anchored-v2',
  }))

  questions.push({
    id: `u${userId || 0}-bonus-interview`,
    prompt: `Optional bonus: answer this as a beginner-friendly security interview question about "${topic}" using only this room's content.`,
    rubric: 'Optional bonus. Award margin for clear, content-aligned explanation without requiring advanced details.',
    sourceType: 'interview',
    company: 'General cybersecurity interview practice',
    interview: `${topic} fundamentals screening`,
    sourceInfo: 'Fallback bonus interview-style question based on this room content.',
    learnerVariant: `${room.id || topic}-${userId || 0}-${seed}-bonus`,
    contentAnchorVersion: 'content-anchored-v2',
    optional: true,
    bonus: true,
  })

  return questions
}

function buildQuestionContentContext(room) {
  return [
    room.content?.markdown,
    room.content?.missionOverview,
    room.description,
    room.content?.vulnerabilityBriefing?.definition,
    room.content?.vulnerabilityBriefing?.impact,
    room.content?.technicalDeepDive,
    room.content?.remediationProtocols,
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 9000)
}

function ensureImprovementFeedback(feedback) {
  const text = String(feedback || 'Evaluation completed.').trim()
  if (/improve next:/i.test(text)) {
    return text
  }

  return `${text}\n\nImprove next: 1) Tie each answer directly to the room content. 2) Include the main security impact. 3) Add one concrete mitigation or validation step.`
}

function tokenizeForAssessment(value) {
  const stopWords = new Set([
    'about',
    'after',
    'also',
    'and',
    'answer',
    'are',
    'because',
    'before',
    'being',
    'can',
    'does',
    'for',
    'from',
    'have',
    'how',
    'include',
    'into',
    'its',
    'main',
    'one',
    'only',
    'room',
    'should',
    'that',
    'the',
    'their',
    'this',
    'using',
    'what',
    'when',
    'where',
    'which',
    'why',
    'with',
    'would',
    'your',
  ])

  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
}

function scoreAnswerLocally(question, answer, roomContent) {
  const answerText = String(answer || '').trim()
  const wordCount = answerText.split(/\s+/).filter(Boolean).length
  if (wordCount < 8) {
    return 0
  }

  const answerTokens = new Set(tokenizeForAssessment(answerText))
  const questionTokens = tokenizeForAssessment(`${question?.prompt || ''} ${question?.rubric || ''}`)
  const contentTokens = tokenizeForAssessment(roomContent).slice(0, 700)
  const questionOverlap = questionTokens.filter((token) => answerTokens.has(token)).length
  const contentOverlap = contentTokens.filter((token) => answerTokens.has(token)).length
  const contentRatio = contentOverlap / Math.max(1, Math.min(contentTokens.length, answerTokens.size))
  const hasImpact = /\b(impact|risk|danger|security|compromise|attack|vulnerab|exposure|damage|protect|prevent|mitigat|detect|verify|validate|fix|secure)\b/i.test(answerText)
  const hasConcreteDetail = /\b(example|because|therefore|such as|for example|step|process|check|log|file|network|system|user|permission|access|service|process|job)\b/i.test(answerText)

  let score = 35
  if (wordCount >= 25) score += 15
  if (wordCount >= 45) score += 12
  if (wordCount >= 70) score += 8
  if (questionOverlap >= 2) score += 10
  if (questionOverlap >= 4) score += 8
  if (contentOverlap >= 4 || contentRatio >= 0.12) score += 12
  if (contentOverlap >= 8 || contentRatio >= 0.2) score += 8
  if (hasImpact) score += 6
  if (hasConcreteDetail) score += 6

  return Math.max(0, Math.min(100, score))
}

function evaluateTheoreticalAnswersLocally(room, questions, answers, reason = '') {
  const requiredQuestions = questions.filter((question) => !question.bonus && !question.optional)
  const bonusQuestions = questions.filter((question) => question.bonus || question.optional)
  const roomContent = buildQuestionContentContext(room)
  const requiredScores = requiredQuestions.map((question) =>
    scoreAnswerLocally(question, answers?.[question.id], roomContent),
  )
  const answeredCount = requiredScores.filter((score) => score > 0).length
  const allRequiredAttempted = requiredQuestions.length > 0 && answeredCount === requiredQuestions.length
  const averageScore = requiredScores.length
    ? Math.round(requiredScores.reduce((sum, score) => sum + score, 0) / requiredScores.length)
    : 0
  const baseTechnicalScore = allRequiredAttempted
    ? Math.min(96, Math.max(45, averageScore))
    : Math.round((answeredCount / Math.max(1, requiredQuestions.length)) * 70)
  const bonusAnswered = bonusQuestions.some((question) => String(answers?.[question.id] || '').trim().split(/\s+/).filter(Boolean).length >= 15)
  const bonusScore = bonusAnswered ? 5 : 0
  const allAnswerWords = Object.values(answers || {}).join(' ').split(/\s+/).filter(Boolean).length
  const grammarScore = allAnswerWords
    ? Math.min(92, Math.max(45, Math.round(allAnswerWords * 1.4)))
    : 0
  const feedbackPrefix = reason
    ? `AI evaluation was not parseable, so a local content-alignment fallback was used. ${reason}`
    : 'Local content-alignment fallback evaluation completed.'

  return {
    technicalScore: Math.min(100, baseTechnicalScore + bonusScore),
    grammarScore,
    baseTechnicalScore,
    bonusScore,
    feedback: ensureImprovementFeedback(
      `${feedbackPrefix} ${allRequiredAttempted
        ? 'Your answers were scored from answer completeness, room keyword alignment, and concrete security reasoning.'
        : 'Some required answers were missing or too short to evaluate fairly.'}`,
    ),
  }
}

async function generateTheoreticalQuestions(room, userId, attemptSalt = '') {
  if (!env.nvidiaApiKey) {
    return buildFallbackTheoreticalQuestions(room, userId, attemptSalt)
  }

  try {
    const aiConfig = await getAiRuntimeConfig()
    const client = new OpenAI({
      baseURL: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
    })

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: Math.max(0.75, Number(aiConfig.temperature || 0.9)),
      top_p: aiConfig.topP,
      max_tokens: Math.max(1800, Math.min(aiConfig.maxTokens, 2600)),
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Generate assessment questions for a cybersecurity learning room. Return strict JSON only: {"questions":[{"id":"string","prompt":"string","rubric":"string","sourceType":"generated|interview","company":"string","interview":"string","sourceInfo":"string","learnerVariant":"string","contentAnchorVersion":"content-anchored-v2","optional":false,"bonus":false}]}. Create exactly 5 required open-ended theoretical questions plus exactly 1 optional bonus interview question. HARD RULE: every question must be answerable using only the supplied room content. Do not ask about tools, algorithms, exploitation details, historical examples, companies, interview trivia, or advanced concepts unless they are explicitly present in the room content. Match the selected room difficulty exactly; for Easy/basic rooms, ask concept, purpose, impact, and simple mitigation questions only. Avoid expert-level wording. The 5 required questions must use sourceType "generated", optional false, bonus false. The 1 optional bonus question must use sourceType "interview", optional true, bonus true, and must still be content-aligned. For the bonus question, include company and interview context if this resembles a known public company interview pattern; otherwise use company "General cybersecurity interview practice" and explain that it is interview-style practice in sourceInfo. Do not include answers.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            learnerSeed: userId,
            learnerVariant: `${room.id || room.slug}-${userId}-${attemptSalt || Date.now().toString(36)}`,
            uniquenessInstruction:
              'Use the learnerSeed and learnerVariant to vary wording only. Do not vary the technical scope beyond the supplied room content.',
            title: room.title,
            category: room.category,
            difficulty: room.difficulty || room.level,
            strictScope:
              'Use only this room content as the syllabus. If a detail is not in the content, do not ask about it. Prefer direct comprehension and application over advanced extension.',
            content: buildQuestionContentContext(room),
          }),
        },
      ],
    })

    const raw = extractMessageText(response?.choices?.[0]?.message)
    const parsed = extractJsonObject(raw)
    const questions = Array.isArray(parsed?.questions) ? parsed.questions : []
    const normalized = questions
      .map((question, index) => ({
        id: String(question?.id || `u${userId}-q-${index + 1}`).trim(),
        prompt: String(question?.prompt || '').trim(),
        rubric: String(question?.rubric || '').trim(),
        sourceType: String(question?.sourceType || 'generated').toLowerCase() === 'interview'
          ? 'interview'
          : 'generated',
        company: String(question?.company || '').trim(),
        interview: String(question?.interview || '').trim(),
        sourceInfo: String(question?.sourceInfo || '').trim(),
        learnerVariant: String(question?.learnerVariant || `${room.id || room.slug}-${userId}-${index + 1}`).trim(),
        contentAnchorVersion: 'content-anchored-v2',
        optional: Boolean(question?.optional || question?.bonus),
        bonus: Boolean(question?.bonus || question?.optional),
      }))
      .filter((question) => question.id && question.prompt)

    const requiredQuestions = normalized.filter((question) => !question.bonus && !question.optional).slice(0, 5)
    const customInterviewQuestions = parseCustomInterviewQuestions(room).slice(0, 3)
    const bonusQuestion = customInterviewQuestions[0] || normalized.find((question) => question.bonus || question.sourceType === 'interview')
    const finalQuestions = bonusQuestion
      ? [
        ...requiredQuestions,
        ...customInterviewQuestions,
        ...(customInterviewQuestions.length ? [] : [{ ...bonusQuestion, optional: true, bonus: true, sourceType: 'interview' }]),
      ]
      : requiredQuestions

    return requiredQuestions.length >= 5
      ? finalQuestions
      : buildFallbackTheoreticalQuestions(room, userId, attemptSalt)
  } catch (error) {
    console.error('Failed to generate theoretical questions:', error)
    return buildFallbackTheoreticalQuestions(room, userId, attemptSalt)
  }
}

function shouldRefreshTheoreticalQuestions(questions, attempt) {
  if (!Array.isArray(questions) || questions.length === 0) {
    return true
  }

  const requiredQuestions = questions.filter((question) => !question.bonus && !question.optional)
  if (requiredQuestions.length < 5) {
    return true
  }

  if (attempt?.evaluated_at || attempt?.answers_json) {
    return !questions.some((question) => question.bonus || question.optional || question.sourceType === 'interview')
  }

  return questions.some(
    (question) =>
      !question.learnerVariant ||
      !question.sourceType ||
      question.contentAnchorVersion !== 'content-anchored-v2',
  )
}

async function evaluateTheoreticalAnswers(room, questions, answers) {
  const requiredQuestions = questions.filter((question) => !question.bonus && !question.optional)
  const bonusQuestions = questions.filter((question) => question.bonus || question.optional)
  const bonusAnswered = bonusQuestions.some((question) => String(answers?.[question.id] || '').trim().length >= 20)
  const requiredAnsweredCount = requiredQuestions.filter((question) => String(answers?.[question.id] || '').trim().length >= 25).length
  const allRequiredAttempted = requiredQuestions.length > 0 && requiredAnsweredCount === requiredQuestions.length

  if (!env.nvidiaApiKey) {
    const answeredCount = requiredQuestions.filter((question) => String(answers?.[question.id] || '').trim().length >= 40).length
    const baseScore = answeredCount === requiredQuestions.length ? 100 : Math.round((answeredCount / Math.max(1, requiredQuestions.length)) * 80)
    const bonusScore = bonusAnswered ? 5 : 0
    const technicalScore = Math.min(100, baseScore + bonusScore)
    const grammarScore = Math.min(100, Math.max(40, Math.round(
      Object.values(answers || {}).join(' ').split(/\s+/).filter(Boolean).length * 2,
    )))
    return {
      technicalScore,
      grammarScore,
      baseTechnicalScore: baseScore,
      bonusScore,
      feedback:
        technicalScore === 100
          ? 'Fallback evaluator accepted all responses as sufficiently detailed. Improve next: keep tying each answer to the room terms and examples.'
          : 'Add more complete, technically specific answers for every question. Improve next: mention the room concept, impact, and at least one mitigation in each answer.',
    }
  }

  try {
    const aiConfig = await getAiRuntimeConfig()
    const client = new OpenAI({
      baseURL: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
    })

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.1,
      top_p: aiConfig.topP,
      max_tokens: 900,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Evaluate cybersecurity assessment answers. Return strict JSON only: {"technicalScore":0-100,"grammarScore":0-100,"bonusScore":0-10,"feedback":"string"}. Grade required questions only against the supplied room content and question rubrics. Optional bonus interview questions must not reduce the score if blank or wrong; they may add 0-10 bonus margin only when answered and content-aligned. Be generous for beginners: if an answer captures the main room idea, impact, and a reasonable mitigation or example, treat it as correct even if wording is simple or not textbook-perfect. Do not penalize learners for omitting advanced material that is not in the room content. Award 90+ when all required answers are mostly correct and content-aligned; reserve low scores for missing, unrelated, or clearly wrong answers. Technical score should be the required-question score before bonus. Grammar score evaluates clarity and professional writing but should not punish minor grammar mistakes. Feedback must mention bonus credit if an optional interview question was answered, and must end with a concise "Improve next:" section listing exactly 2-4 specific improvements.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            room: {
              title: room.title,
              category: room.category,
              difficulty: room.difficulty || room.level,
              content: buildQuestionContentContext(room),
            },
            questions,
            requiredQuestions,
            bonusQuestions,
            answers,
          }),
        },
      ],
    })

    const rawEvaluation = extractMessageText(response?.choices?.[0]?.message)
    const parsed = extractJsonObject(rawEvaluation) || extractPartialEvaluationObject(rawEvaluation)
    if (!parsed || parsed.technicalScore === undefined || parsed.grammarScore === undefined) {
      console.warn('Theoretical evaluator returned non-JSON or incomplete scores:', rawEvaluation)
      return evaluateTheoreticalAnswersLocally(room, questions, answers, 'The remote evaluator returned incomplete scoring data.')
    }

    const rawBaseTechnicalScore = Math.max(0, Math.min(100, Number(parsed?.technicalScore || 0)))
    const baseTechnicalScore = allRequiredAttempted && rawBaseTechnicalScore >= 92
      ? 100
      : allRequiredAttempted && rawBaseTechnicalScore >= 85
        ? rawBaseTechnicalScore + 5
        : rawBaseTechnicalScore
    const bonusScore = bonusAnswered ? Math.max(0, Math.min(10, Number(parsed?.bonusScore || 0))) : 0
    return {
      technicalScore: Math.min(100, baseTechnicalScore + bonusScore),
      grammarScore: Math.max(0, Math.min(100, Number(parsed?.grammarScore || 0))),
      baseTechnicalScore,
      bonusScore,
      feedback: ensureImprovementFeedback(parsed?.feedback),
    }
  } catch (error) {
    console.error('Failed to evaluate theoretical answers:', error)
    return evaluateTheoreticalAnswersLocally(room, questions, answers, 'The remote evaluator failed before returning a score.')
  }
}

function buildFallbackProfileAnalysis(completedRooms) {
  const categoryCounts = new Map()
  const strengths = []
  const improvements = []

  for (const room of completedRooms) {
    const category = room.category || 'General Security'
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1)

    if (Number(room.technicalScore || 0) >= 90) {
      strengths.push(`${room.title}: strong technical accuracy`)
    } else if (room.roomType === 'theoretical') {
      improvements.push(`${room.title}: raise technical precision in written answers`)
    }
  }

  const topCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'Cybersecurity Fundamentals'
  const roleMap = {
    Cryptography: 'Cryptography Analyst',
    'Web Hacking': 'Web Application Security Tester',
    Reversing: 'Reverse Engineering Analyst',
    'Digital Forensics': 'Digital Forensics Analyst',
  }

  return {
    suitableRole: roleMap[topCategory] || `${topCategory} Security Analyst`,
    confidence: completedRooms.length >= 5 ? 'High' : completedRooms.length >= 2 ? 'Medium' : 'Early signal',
    summary: completedRooms.length
      ? `Your completed rooms show the strongest signal in ${topCategory}. Continue completing varied rooms to improve the recommendation quality.`
      : 'Complete rooms and theoretical evaluations to unlock a more accurate role recommendation.',
    strengths: strengths.slice(0, 3).length ? strengths.slice(0, 3) : [`Consistent progress in ${topCategory}`],
    improvementAreas: improvements.slice(0, 3).length
      ? improvements.slice(0, 3)
      : ['Complete more theoretical rooms with detailed, specific answers.'],
  }
}

async function generateProfileAnalysis(completedRooms) {
  if (!env.nvidiaApiKey || !completedRooms.length) {
    return buildFallbackProfileAnalysis(completedRooms)
  }

  try {
    const aiConfig = await getAiRuntimeConfig()
    const client = new OpenAI({
      baseURL: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
    })

    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.25,
      top_p: aiConfig.topP,
      max_tokens: 900,
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Analyze a cybersecurity learner profile. Return strict JSON only: {"suitableRole":"string","confidence":"High|Medium|Early signal","summary":"string","strengths":["string"],"improvementAreas":["string"]}. Base the recommendation only on completed rooms, theoretical answers, scores, and feedback.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            completedRooms: completedRooms.map((room) => ({
              title: room.title,
              category: room.category,
              roomType: room.roomType,
              technicalScore: room.technicalScore,
              grammarScore: room.grammarScore,
              feedback: room.feedback,
              questions: room.questions,
              answerPreview: room.answerPreview,
              completedAt: room.completedAt,
            })),
          }),
        },
      ],
    })

    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    const fallback = buildFallbackProfileAnalysis(completedRooms)

    return {
      suitableRole: String(parsed?.suitableRole || fallback.suitableRole),
      confidence: String(parsed?.confidence || fallback.confidence),
      summary: String(parsed?.summary || fallback.summary),
      strengths: Array.isArray(parsed?.strengths) && parsed.strengths.length
        ? parsed.strengths.map((item) => String(item)).slice(0, 4)
        : fallback.strengths,
      improvementAreas: Array.isArray(parsed?.improvementAreas) && parsed.improvementAreas.length
        ? parsed.improvementAreas.map((item) => String(item)).slice(0, 4)
        : fallback.improvementAreas,
    }
  } catch (error) {
    console.error('Failed to generate profile analysis:', error)
    return buildFallbackProfileAnalysis(completedRooms)
  }
}

async function getOrCreateTheoreticalAttempt(room, userId) {
  const [rows] = await pool.query(
    `SELECT *
     FROM user_room_theoretical_attempts
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [userId, room.id],
  )

  if (rows.length) {
    const questions = safeJsonParse(rows[0].questions_json, [])
    const existingAnswers = safeJsonParse(rows[0].answers_json, {})
    const hasRetainedFailedAnswers =
      !rows[0].passed &&
      rows[0].evaluated_at &&
      existingAnswers &&
      typeof existingAnswers === 'object' &&
      Object.keys(existingAnswers).length > 0

    if (hasRetainedFailedAnswers) {
      const regeneratedQuestions = await generateTheoreticalQuestions(
        room,
        userId,
        `cleanup-${rows[0].evaluated_at}-${rows[0].technical_score || 0}`,
      )
      await pool.query(
        `UPDATE user_room_theoretical_attempts
         SET questions_json = ?,
             answers_json = NULL,
             feedback = ?
         WHERE user_id = ? AND room_id = ?`,
        [
          JSON.stringify(regeneratedQuestions),
          `${rows[0].feedback || ''}\n\nPrevious answers were cleared. New questions have been prepared for your next attempt.`.trim(),
          userId,
          room.id,
        ],
      )

      return {
        ...rows[0],
        questions_json: JSON.stringify(regeneratedQuestions),
        answers_json: null,
        feedback: `${rows[0].feedback || ''}\n\nPrevious answers were cleared. New questions have been prepared for your next attempt.`.trim(),
      }
    }

    if (!shouldRefreshTheoreticalQuestions(questions, rows[0])) {
      return rows[0]
    }

    const regeneratedQuestions = await generateTheoreticalQuestions(room, userId)
    await pool.query(
      `UPDATE user_room_theoretical_attempts
       SET questions_json = ?,
           answers_json = NULL,
           technical_score = 0,
           grammar_score = 0,
           feedback = NULL,
           passed = false,
           evaluated_at = NULL
       WHERE user_id = ? AND room_id = ?`,
      [JSON.stringify(regeneratedQuestions), userId, room.id],
    )

    const [regeneratedRows] = await pool.query(
      `SELECT *
       FROM user_room_theoretical_attempts
       WHERE user_id = ? AND room_id = ?
       LIMIT 1`,
      [userId, room.id],
    )

    return regeneratedRows[0]
  }

  const questions = await generateTheoreticalQuestions(room, userId)
  try {
    await pool.query(
      `INSERT INTO user_room_theoretical_attempts (user_id, room_id, questions_json)
       VALUES (?, ?, ?)`,
      [userId, room.id, JSON.stringify(questions)],
    )
  } catch (error) {
    if (error?.code !== 'ER_DUP_ENTRY') {
      throw error
    }
  }

  const [createdRows] = await pool.query(
    `SELECT *
     FROM user_room_theoretical_attempts
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [userId, room.id],
  )

  return createdRows[0]
}

function parseRoomQuestions(room) {
  const questions = Array.isArray(room?.content?.questions) ? room.content.questions : []
  return questions
    .map((question, index) => {
      const id = String(question?.id || `q-${index + 1}`).trim()
      const prompt = String(question?.prompt || '').trim()
      const answer = String(question?.answer || '').trim()
      const hint = String(question?.hint || '').trim()

      if (!id || !prompt || !answer) {
        return null
      }

      return {
        id,
        prompt,
        answer,
        hint,
      }
    })
    .filter(Boolean)
}

function formatAiQuestionForClient(question, passed = false, answers = {}, evaluatedAt = null) {
  return {
    id: question.id,
    prompt: question.prompt,
    hint: question.rubric || '',
    questionType: 'ai',
    sourceType: question.sourceType || 'generated',
    company: question.company || '',
    interview: question.interview || '',
    sourceInfo: question.sourceInfo || '',
    optional: Boolean(question.optional || question.bonus),
    bonus: Boolean(question.bonus || question.optional),
    answeredCorrectly: Boolean(passed),
    answeredAt: answers?.[question.id] && evaluatedAt
      ? new Date(evaluatedAt).toISOString()
      : null,
  }
}

function parseCustomInterviewQuestions(room) {
  const questions = Array.isArray(room?.content?.questions) ? room.content.questions : []
  return questions
    .filter((question) => question?.sourceType === 'interview' || question?.bonus || question?.optional)
    .map((question, index) => ({
      id: String(question?.id || `custom-interview-${index + 1}`).trim(),
      prompt: String(question?.prompt || '').trim(),
      rubric: String(question?.rubric || question?.hint || 'Optional interview bonus. Award margin for clear, room-aligned reasoning.').trim(),
      sourceType: 'interview',
      company: String(question?.company || 'General cybersecurity interview practice').trim(),
      interview: String(question?.interview || 'Custom admin interview question').trim(),
      sourceInfo: String(question?.sourceInfo || 'Custom interview question added by admin.').trim(),
      learnerVariant: String(question?.learnerVariant || `${room.id || room.slug}-custom-interview-${index + 1}`).trim(),
      contentAnchorVersion: 'content-anchored-v2',
      optional: true,
      bonus: true,
    }))
    .filter((question) => question.id && question.prompt)
}

async function fetchRoomById(id) {
  const [roomRows] = await pool.query('SELECT * FROM rooms WHERE id = ? OR slug = ? LIMIT 1', [id, id])
  if (!roomRows.length) {
    return null
  }

  const room = roomRows[0]
  const [tagRows] = await pool.query('SELECT tag FROM room_tags WHERE room_id = ?', [room.id])
  const [keywordRows] = await pool.query('SELECT keyword FROM room_required_keywords WHERE room_id = ?', [room.id])

  return mapRoomRow(
    room,
    tagRows.map((row) => row.tag),
    keywordRows.map((row) => row.keyword),
  )
}

function redactRoomForPlayer(room) {
  if (!room?.content?.docker) return room
  return {
    ...room,
    content: {
      ...room.content,
      docker: {
        ...room.content.docker,
        image: '',
      },
    },
  }
}

function roomResponseForRequest(room, req) {
  return req.user?.role === 'admin' ? room : redactRoomForPlayer(room)
}

function buildRoomId(input) {
  const base = (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
  return base || `room-${Date.now()}`
}

router.get('/', optionalAuthenticate, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM rooms ORDER BY created_at DESC')
  const rooms = []

  for (const room of rows) {
    const [tagRows] = await pool.query('SELECT tag FROM room_tags WHERE room_id = ?', [room.id])
    const [keywordRows] = await pool.query('SELECT keyword FROM room_required_keywords WHERE room_id = ?', [
      room.id,
    ])
    rooms.push(
      roomResponseForRequest(mapRoomRow(
        room,
        tagRows.map((row) => row.tag),
        keywordRows.map((row) => row.keyword),
      ), req),
    )
  }

  return res.json(rooms)
})

function normalizeInterviewQuestionInput(value) {
  return String(value || '')
    .split(/\n{2,}|\r?\n(?=\s*(?:[-*]|\d+[.)])\s+)/)
    .map((item) => item.replace(/^\s*(?:[-*]|\d+[.)])\s+/, '').trim())
    .filter(Boolean)
}

function scoreRoomMatch(question, room) {
  const questionTokens = new Set(tokenizeForAssessment(question))
  const roomTokens = tokenizeForAssessment([
    room.title,
    room.category,
    room.difficulty,
    room.description,
    room.content?.markdown,
    room.content?.missionOverview,
    room.content?.technicalDeepDive,
    room.content?.vulnerabilityBriefing?.definition,
    room.content?.vulnerabilityBriefing?.impact,
  ].filter(Boolean).join(' '))
  const overlap = roomTokens.filter((token) => questionTokens.has(token)).length
  const titleOverlap = tokenizeForAssessment(room.title).filter((token) => questionTokens.has(token)).length * 3
  const categoryOverlap = tokenizeForAssessment(room.category).filter((token) => questionTokens.has(token)).length * 2
  return overlap + titleOverlap + categoryOverlap
}

async function fetchRoomsForInterviewMatching() {
  const [rows] = await pool.query('SELECT id FROM rooms ORDER BY title ASC')
  const rooms = []
  for (const row of rows) {
    const room = await fetchRoomById(row.id)
    if (room) rooms.push(room)
  }
  return rooms
}

async function matchInterviewQuestionsToRooms(questions, rooms) {
  if (!questions.length || !rooms.length) return []

  try {
    const aiConfig = await getAiRuntimeConfig()
    if (!aiConfig.apiKey) throw new Error('AI API key is not configured.')
    const client = new OpenAI({
      baseURL: aiConfig.baseUrl,
      apiKey: aiConfig.apiKey,
    })
    const response = await client.chat.completions.create({
      model: aiConfig.model,
      temperature: 0.1,
      top_p: aiConfig.topP,
      max_tokens: Math.min(aiConfig.maxTokens, 1800),
      stream: false,
      messages: [
        {
          role: 'system',
          content:
            'Match custom cybersecurity interview questions to the single best room. Return strict JSON only: {"matches":[{"questionIndex":0,"roomId":"string","reason":"short reason","company":"string","interview":"string","sourceInfo":"string","rubric":"string"}]}. Pick only from provided room ids. Prefer exact content/topic alignment. If company/interview is not provided, use "General cybersecurity interview practice".',
        },
        {
          role: 'user',
          content: JSON.stringify({
            questions,
            rooms: rooms.map((room) => ({
              id: room.id,
              title: room.title,
              category: room.category,
              difficulty: room.difficulty || room.level,
              description: room.description,
              contentPreview: buildQuestionContentContext(room).slice(0, 1200),
            })),
          }),
        },
      ],
    })

    const parsed = extractJsonObject(extractMessageText(response?.choices?.[0]?.message))
    const matches = Array.isArray(parsed?.matches) ? parsed.matches : []
    const roomIds = new Set(rooms.map((room) => room.id))
    const aiMatches = questions.map((question, index) => {
      const match = matches.find((item) => Number(item?.questionIndex) === index && roomIds.has(String(item?.roomId)))
      return match
        ? {
          question,
          roomId: String(match.roomId),
          reason: String(match.reason || 'AI matched this question to the closest room content.'),
          company: String(match.company || 'General cybersecurity interview practice'),
          interview: String(match.interview || 'Custom admin interview question'),
          sourceInfo: String(match.sourceInfo || match.reason || 'Custom interview question matched by Admin AI.'),
          rubric: String(match.rubric || 'Optional interview bonus. Award margin for clear, room-aligned reasoning.'),
          matchedBy: 'ai',
        }
        : null
    })

    if (aiMatches.every(Boolean)) return aiMatches
  } catch (error) {
    console.error('Failed to AI-match interview questions:', error)
  }

  return questions.map((question) => {
    const bestRoom = rooms
      .map((room) => ({ room, score: scoreRoomMatch(question, room) }))
      .sort((a, b) => b.score - a.score || a.room.title.localeCompare(b.room.title))[0]?.room
    return {
      question,
      roomId: bestRoom?.id || rooms[0].id,
      reason: 'Matched locally by overlapping room title, category, and content keywords.',
      company: 'General cybersecurity interview practice',
      interview: 'Custom admin interview question',
      sourceInfo: 'Custom interview question matched locally because AI matching was unavailable.',
      rubric: 'Optional interview bonus. Award margin for clear, room-aligned reasoning.',
      matchedBy: 'local',
    }
  })
}

router.post('/admin/interview-questions', authenticate, requireAdmin, async (req, res) => {
  const rawQuestions = Array.isArray(req.body?.questions)
    ? req.body.questions.map((item) => String(item || '').trim()).filter(Boolean)
    : normalizeInterviewQuestionInput(req.body?.questionsText)
  const questions = rawQuestions.slice(0, 50)

  if (!questions.length) {
    return res.status(400).json({ message: 'At least one interview question is required.' })
  }

  const roomsForMatching = await fetchRoomsForInterviewMatching()
  if (!roomsForMatching.length) {
    return res.status(400).json({ message: 'No rooms are available for matching.' })
  }

  const matches = await matchInterviewQuestionsToRooms(questions, roomsForMatching)
  const roomsById = new Map(roomsForMatching.map((room) => [room.id, room]))
  const inserted = []

  for (const [index, match] of matches.entries()) {
    const room = roomsById.get(match.roomId)
    if (!room) continue
    const existingQuestions = Array.isArray(room.content?.questions) ? room.content.questions : []
    const exists = existingQuestions.some(
      (question) => String(question?.prompt || '').trim().toLowerCase() === match.question.toLowerCase(),
    )
    const nextQuestion = {
      id: `custom-interview-${Date.now().toString(36)}-${index + 1}`,
      prompt: match.question,
      answer: '',
      hint: match.rubric,
      rubric: match.rubric,
      sourceType: 'interview',
      company: match.company,
      interview: match.interview,
      sourceInfo: match.sourceInfo,
      learnerVariant: `${room.id}-admin-custom-${Date.now().toString(36)}-${index + 1}`,
      contentAnchorVersion: 'content-anchored-v2',
      optional: true,
      bonus: true,
    }
    const nextQuestions = exists ? existingQuestions : [...existingQuestions, nextQuestion]
    if (!exists) {
      await pool.query(
        `UPDATE rooms
         SET questions_enabled = true,
             questions_json = ?
         WHERE id = ?`,
        [JSON.stringify(nextQuestions), room.id],
      )
      await pool.query(
        `DELETE FROM user_room_theoretical_attempts
         WHERE room_id = ?
           AND evaluated_at IS NULL
           AND passed = false`,
        [room.id],
      )
    }
    inserted.push({
      question: match.question,
      inserted: !exists,
      duplicate: exists,
      roomId: room.id,
      roomTitle: room.title,
      category: room.category,
      matchedBy: match.matchedBy,
      reason: match.reason,
      company: match.company,
      interview: match.interview,
    })
  }

  return res.status(201).json({ inserted })
})

router.get('/progress', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT room_id, started_at, completed_at
     FROM user_room_progress
     WHERE user_id = ?`,
    [req.user.id],
  )

  const progress = {}
  for (const row of rows) {
    progress[row.room_id] = {
      startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    }
  }

  return res.json(progress)
})

router.get('/scoreboard/summary', authenticate, async (_req, res) => {
  const [rows] = await pool.query(
    `SELECT
       u.id,
       u.username,
       COUNT(DISTINCT CASE WHEN urp.completed_at IS NOT NULL THEN urp.room_id END) AS completed_rooms,
       COALESCE(SUM(CASE WHEN urp.completed_at IS NOT NULL THEN CAST(REPLACE(REPLACE(r.xp, ',', ''), ' XP', '') AS UNSIGNED) ELSE 0 END), 0) AS xp,
       COALESCE(ROUND(AVG(NULLIF(uta.technical_score, 0))), 0) AS avg_technical_score,
       COALESCE(ROUND(AVG(NULLIF(uta.grammar_score, 0))), 0) AS avg_grammar_score,
       MAX(urp.completed_at) AS last_completed_at
     FROM users u
     LEFT JOIN user_room_progress urp ON urp.user_id = u.id
     LEFT JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta ON uta.user_id = u.id
     WHERE u.role = 'operator'
     GROUP BY u.id, u.username
     ORDER BY xp DESC, completed_rooms DESC, avg_technical_score DESC, u.username ASC
     LIMIT 100`,
  )

  return res.json(rows.map((row, index) => ({
    rank: index + 1,
    userId: row.id,
    username: row.username,
    completedRooms: Number(row.completed_rooms || 0),
    xp: Number(row.xp || 0),
    averageTechnicalScore: Number(row.avg_technical_score || 0),
    averageGrammarScore: Number(row.avg_grammar_score || 0),
    lastCompletedAt: row.last_completed_at ? new Date(row.last_completed_at).toISOString() : null,
  })))
})

router.get('/streaks/me', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DATE(completed_at) AS completed_date
     FROM user_room_progress
     WHERE user_id = ? AND completed_at IS NOT NULL
     GROUP BY DATE(completed_at)
     ORDER BY completed_date DESC`,
    [req.user.id],
  )

  const dates = new Set(rows.map((row) => new Date(row.completed_date).toISOString().slice(0, 10)))
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let cursor = new Date(today)
  if (!dates.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let currentStreak = 0
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    currentStreak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  const ordered = [...dates].sort()
  let longestStreak = 0
  let activeRun = 0
  let previous = null

  for (const dateKey of ordered) {
    const date = new Date(`${dateKey}T00:00:00Z`)
    if (previous) {
      const diffDays = Math.round((date - previous) / 86400000)
      activeRun = diffDays === 1 ? activeRun + 1 : 1
    } else {
      activeRun = 1
    }
    longestStreak = Math.max(longestStreak, activeRun)
    previous = date
  }

  return res.json({
    currentStreak,
    longestStreak,
    activeDays: dates.size,
    lastCompletedDate: rows[0]?.completed_date ? new Date(rows[0].completed_date).toISOString().slice(0, 10) : null,
  })
})

router.get('/profile/analysis', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       r.id,
       r.title,
       r.category,
       r.room_type,
       urp.completed_at,
       uta.questions_json,
       uta.answers_json,
       uta.technical_score,
       uta.grammar_score,
       uta.feedback
     FROM user_room_progress urp
     INNER JOIN rooms r ON r.id = urp.room_id
     LEFT JOIN user_room_theoretical_attempts uta
       ON uta.user_id = urp.user_id AND uta.room_id = urp.room_id
     WHERE urp.user_id = ? AND urp.completed_at IS NOT NULL
     ORDER BY urp.completed_at DESC
     LIMIT 40`,
    [req.user.id],
  )

  const completedRooms = rows.map((row) => {
    const questions = safeJsonParse(row.questions_json, [])
    const answers = safeJsonParse(row.answers_json, {})
    const answerPreview = Object.values(answers || {})
      .map((answer) => String(answer || '').trim())
      .filter(Boolean)
      .join(' ')
      .slice(0, 800)

    return {
      id: row.id,
      title: row.title,
      category: row.category,
      roomType: row.room_type || 'theoretical',
      completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
      technicalScore: Number(row.technical_score || 0),
      grammarScore: Number(row.grammar_score || 0),
      feedback: row.feedback || '',
      questions: Array.isArray(questions)
        ? questions.map((question) => ({
          prompt: question.prompt,
          sourceType: question.sourceType || 'generated',
          company: question.company || '',
          interview: question.interview || '',
        }))
        : [],
      answerPreview,
    }
  })

  const analysis = await generateProfileAnalysis(completedRooms)
  return res.json({
    completedRooms: completedRooms.length,
    ...analysis,
  })
})

router.put('/:id/progress', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const status = req.body?.status
  if (!['not-started', 'in-progress', 'completed'].includes(status)) {
    return res.status(400).json({ message: 'status must be one of: not-started, in-progress, completed' })
  }

  if (status === 'not-started') {
    await pool.query('DELETE FROM user_room_progress WHERE user_id = ? AND room_id = ?', [
      req.user.id,
      room.id,
    ])

    return res.json({
      roomId: room.id,
      startedAt: null,
      completedAt: null,
      status,
    })
  }

  if (status === 'in-progress') {
    await pool.query(
      `INSERT INTO user_room_progress (user_id, room_id, started_at, completed_at)
         VALUES (?, ?, NOW(), NULL)
       ON DUPLICATE KEY UPDATE
           started_at = COALESCE(started_at, NOW()),
         completed_at = NULL`,
      [req.user.id, room.id],
    )
  }

  if (status === 'completed') {
    if (isTheoreticalRoom(room)) {
      const [attemptRows] = await pool.query(
        `SELECT passed
         FROM user_room_theoretical_attempts
         WHERE user_id = ? AND room_id = ?
         LIMIT 1`,
        [req.user.id, room.id],
      )

      if (!attemptRows[0]?.passed) {
        return res.status(400).json({
          message: 'Score 100 in the theoretical technical evaluation before marking this room complete.',
        })
      }
    } else {
      const requiredQuestions = parseRoomQuestions(room)
      if (room?.content?.questionsEnabled && requiredQuestions.length > 0) {
        const [progressRows] = await pool.query(
          `SELECT question_id
           FROM user_room_question_progress
           WHERE user_id = ? AND room_id = ? AND answered_correctly = true`,
          [req.user.id, room.id],
        )

        const completedSet = new Set(progressRows.map((row) => String(row.question_id)))
        const allCompleted = requiredQuestions.every((question) => completedSet.has(question.id))

        if (!allCompleted) {
          return res.status(400).json({
            message: 'Complete all configured questions correctly before marking this room complete.',
          })
        }
      }

      if (hasPracticalAiQuestions(room)) {
        const [attemptRows] = await pool.query(
          `SELECT passed
           FROM user_room_theoretical_attempts
           WHERE user_id = ? AND room_id = ?
           LIMIT 1`,
          [req.user.id, room.id],
        )

        if (!attemptRows[0]?.passed) {
          return res.status(400).json({
            message: 'Score 100 in the practical AI evaluation before marking this room complete.',
          })
        }
      }
    }

    await pool.query(
      `INSERT INTO user_room_progress (user_id, room_id, started_at, completed_at)
         VALUES (?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
           started_at = COALESCE(started_at, NOW()),
         completed_at = VALUES(completed_at)`,
      [req.user.id, room.id],
    )

    if (getDockerConfig(room).enabled) {
      const containerName = buildDockerContainerName(req.user.id, room.id)
      await stopDockerContainer(containerName)
      await pool.query(
        `UPDATE user_room_docker_instances
         SET status = 'solved'
         WHERE user_id = ? AND room_id = ?`,
        [req.user.id, room.id],
      )
    }
  }

  const [rows] = await pool.query(
    'SELECT started_at, completed_at FROM user_room_progress WHERE user_id = ? AND room_id = ? LIMIT 1',
    [req.user.id, room.id],
  )

  const row = rows[0] || {}
  return res.json({
    roomId: room.id,
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    status,
  })
})

router.get('/:id/questions/status', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  if (isTheoreticalRoom(room)) {
    const attempt = await getOrCreateTheoreticalAttempt(room, req.user.id)
    const questions = safeJsonParse(attempt.questions_json, [])
    const answers = safeJsonParse(attempt.answers_json, {})
    const requiredQuestions = questions.filter((question) => !question.bonus && !question.optional)

    return res.json({
      enabled: true,
      mode: 'theoretical',
      total: requiredQuestions.length,
      correct: Number(attempt.technical_score || 0) === 100 ? requiredQuestions.length : 0,
      allCorrect: Boolean(attempt.passed),
      technicalScore: Number(attempt.technical_score || 0),
      grammarScore: Number(attempt.grammar_score || 0),
      feedback: attempt.feedback || '',
      evaluatedAt: attempt.evaluated_at ? new Date(attempt.evaluated_at).toISOString() : null,
      answers,
      questions: questions.map((question) =>
        formatAiQuestionForClient(question, Boolean(attempt.passed), answers, attempt.evaluated_at),
      ),
    })
  }

  const manualQuestions = room?.content?.questionsEnabled ? parseRoomQuestions(room) : []
  const aiEnabled = hasPracticalAiQuestions(room)
  if (manualQuestions.length === 0 && !aiEnabled) {
    return res.json({
      enabled: false,
      mode: 'practical',
      total: 0,
      correct: 0,
      allCorrect: true,
      questions: [],
    })
  }

  const [rows] = await pool.query(
    `SELECT question_id, answer_text, answered_correctly, answered_at
     FROM user_room_question_progress
     WHERE user_id = ? AND room_id = ?`,
    [req.user.id, room.id],
  )

  const progressMap = new Map(rows.map((row) => [String(row.question_id), row]))
  const manualAnswers = Object.fromEntries(
    rows
      .filter((row) => String(row.answer_text || '').trim())
      .map((row) => [String(row.question_id), String(row.answer_text || '')]),
  )
  const manualQuestionStatus = manualQuestions.map((question) => {
    const progress = progressMap.get(question.id)
    return {
      id: question.id,
      prompt: question.prompt,
      hint: question.hint,
      questionType: 'manual',
      answeredCorrectly: Boolean(progress?.answered_correctly),
      answeredAt: progress?.answered_at ? new Date(progress.answered_at).toISOString() : null,
      locked: Boolean(progress?.answered_correctly),
    }
  })

  const manualCorrect = manualQuestionStatus.filter((question) => question.answeredCorrectly).length
  let aiQuestions = []
  let aiAnswers = {}
  let aiAttempt = null

  if (aiEnabled) {
    aiAttempt = await getOrCreateTheoreticalAttempt(room, req.user.id)
    aiQuestions = safeJsonParse(aiAttempt.questions_json, [])
    aiAnswers = safeJsonParse(aiAttempt.answers_json, {})
  }

  const requiredAiQuestions = aiQuestions.filter((question) => !question.bonus && !question.optional)
  const aiPassed = !aiEnabled || Boolean(aiAttempt?.passed)
  const manualPassed = manualQuestions.length === 0 || manualCorrect === manualQuestions.length
  const aiCorrect = aiPassed && aiEnabled ? requiredAiQuestions.length : 0

  return res.json({
    enabled: true,
    mode: aiEnabled ? 'hybrid' : 'practical',
    total: manualQuestions.length + requiredAiQuestions.length,
    correct: manualCorrect + aiCorrect,
    manualTotal: manualQuestions.length,
    manualCorrect,
    aiTotal: requiredAiQuestions.length,
    allCorrect: manualPassed && aiPassed,
    technicalScore: Number(aiAttempt?.technical_score || 0),
    grammarScore: Number(aiAttempt?.grammar_score || 0),
    feedback: aiAttempt?.feedback || '',
    answers: {
      ...manualAnswers,
      ...aiAnswers,
    },
    questions: [
      ...manualQuestionStatus,
      ...aiQuestions.map((question) =>
        formatAiQuestionForClient(question, Boolean(aiAttempt?.passed), aiAnswers, aiAttempt?.evaluated_at),
      ),
    ],
  })
})

router.post('/:id/questions/submit', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  if (isTheoreticalRoom(room)) {
    const attempt = await getOrCreateTheoreticalAttempt(room, req.user.id)
    const questions = safeJsonParse(attempt.questions_json, [])
    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}
    const evaluation = await evaluateTheoreticalAnswers(room, questions, answers)
    const passed = Number(evaluation.technicalScore) === 100
    const requiredQuestionCount = questions.filter((question) => !question.bonus && !question.optional).length
    const retainedTechnicalScore = passed
      ? 100
      : Math.max(Number(attempt.technical_score || 0), Number(evaluation.technicalScore || 0))
    const retainedGrammarScore = passed
      ? Number(evaluation.grammarScore || 0)
      : Math.max(Number(attempt.grammar_score || 0), Number(evaluation.grammarScore || 0))
    const retainedNote = !passed && retainedTechnicalScore > Number(evaluation.technicalScore || 0)
      ? '\n\nPrevious best score retained. New questions have been prepared for your next attempt.'
      : !passed
        ? '\n\nNew questions have been prepared for your next attempt.'
        : ''
    const feedbackToStore = `${evaluation.feedback || ''}${retainedNote}`.trim()
    const nextQuestions = passed
      ? questions
      : await generateTheoreticalQuestions(room, req.user.id, `retry-${Date.now()}-${retainedTechnicalScore}`)

    await pool.query(
      `UPDATE user_room_theoretical_attempts
       SET answers_json = ?,
           questions_json = ?,
           technical_score = ?,
           grammar_score = ?,
           feedback = ?,
           passed = ?,
           evaluated_at = NOW()
       WHERE user_id = ? AND room_id = ?`,
      [
        passed ? JSON.stringify(answers) : null,
        JSON.stringify(nextQuestions),
        retainedTechnicalScore,
        retainedGrammarScore,
        feedbackToStore,
        passed,
        req.user.id,
        room.id,
      ],
    )

    if (passed) {
      await pool.query(
        `INSERT INTO user_room_progress (user_id, room_id, started_at, completed_at)
           VALUES (?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE
             started_at = COALESCE(started_at, NOW()),
             completed_at = NOW()`,
        [req.user.id, room.id],
      )
    }

    return res.json({
      mode: 'theoretical',
      total: requiredQuestionCount,
      correct: passed ? requiredQuestionCount : 0,
      allCorrect: passed,
      technicalScore: retainedTechnicalScore,
      grammarScore: retainedGrammarScore,
      baseTechnicalScore: Number(evaluation.baseTechnicalScore || evaluation.technicalScore || 0),
      bonusScore: Number(evaluation.bonusScore || 0),
      feedback: feedbackToStore,
      answers: passed ? answers : {},
      questions: nextQuestions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        hint: question.rubric || '',
        sourceType: question.sourceType || 'generated',
        company: question.company || '',
        interview: question.interview || '',
        sourceInfo: question.sourceInfo || '',
        answeredCorrectly: passed,
        answeredAt: passed ? new Date().toISOString() : null,
      })),
    })
  }

  const manualQuestions = room?.content?.questionsEnabled ? parseRoomQuestions(room) : []
  const aiEnabled = hasPracticalAiQuestions(room)
  if (manualQuestions.length === 0 && !aiEnabled) {
    return res.status(400).json({ message: 'Question mode is disabled for this room.' })
  }

  const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : {}
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    const [existingRows] = await conn.query(
      `SELECT question_id, answered_correctly
       FROM user_room_question_progress
       WHERE user_id = ? AND room_id = ?`,
      [req.user.id, room.id],
    )
    const alreadyCorrectSet = new Set(
      existingRows
        .filter((row) => Boolean(row.answered_correctly))
        .map((row) => String(row.question_id)),
    )

    for (const question of manualQuestions) {
      if (alreadyCorrectSet.has(String(question.id))) {
        continue
      }

      const providedAnswer = String(answers[question.id] || '').trim()
      const isCorrect =
        providedAnswer.length > 0 &&
        providedAnswer.localeCompare(question.answer.trim(), undefined, { sensitivity: 'accent' }) === 0

      if (isCorrect) {
        await conn.query(
          `INSERT INTO user_room_question_progress (user_id, room_id, question_id, answer_text, answered_correctly, answered_at)
           VALUES (?, ?, ?, ?, true, NOW())
           ON DUPLICATE KEY UPDATE
             answer_text = VALUES(answer_text),
             answered_correctly = true,
             answered_at = NOW()`,
          [req.user.id, room.id, question.id, providedAnswer],
        )
      } else {
        await conn.query(
          `INSERT INTO user_room_question_progress (user_id, room_id, question_id, answer_text, answered_correctly, answered_at)
           VALUES (?, ?, ?, ?, false, NULL)
           ON DUPLICATE KEY UPDATE
             answer_text = VALUES(answer_text),
             answered_correctly = false,
             answered_at = NULL`,
          [req.user.id, room.id, question.id, providedAnswer],
        )
      }
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }

  const [rows] = await pool.query(
    `SELECT question_id, answer_text, answered_correctly
     FROM user_room_question_progress
     WHERE user_id = ? AND room_id = ?`,
    [req.user.id, room.id],
  )

  const completedSet = new Set(
    rows.filter((row) => Boolean(row.answered_correctly)).map((row) => String(row.question_id)),
  )

  const manualCorrect = manualQuestions.filter((question) => completedSet.has(question.id)).length
  const manualPassed = manualQuestions.length === 0 || manualCorrect === manualQuestions.length
  const manualAnswers = Object.fromEntries(
    rows
      .filter((row) => String(row.answer_text || '').trim())
      .map((row) => [String(row.question_id), String(row.answer_text || '')]),
  )

  let aiResult = {
    passed: true,
    technicalScore: 0,
    grammarScore: 0,
    baseTechnicalScore: 0,
    bonusScore: 0,
    feedback: '',
    questions: [],
    answers: {},
    requiredCount: 0,
  }

  if (aiEnabled) {
    const attempt = await getOrCreateTheoreticalAttempt(room, req.user.id)
    const aiQuestions = safeJsonParse(attempt.questions_json, [])
    const aiAnswers = Object.fromEntries(aiQuestions.map((question) => [question.id, answers[question.id] || '']))
    const evaluation = await evaluateTheoreticalAnswers(room, aiQuestions, aiAnswers)
    const passed = Number(evaluation.technicalScore) === 100
    const retainedTechnicalScore = passed
      ? 100
      : Math.max(Number(attempt.technical_score || 0), Number(evaluation.technicalScore || 0))
    const retainedGrammarScore = passed
      ? Number(evaluation.grammarScore || 0)
      : Math.max(Number(attempt.grammar_score || 0), Number(evaluation.grammarScore || 0))
    const retainedNote = !passed && retainedTechnicalScore > Number(evaluation.technicalScore || 0)
      ? '\n\nPrevious best AI score retained. New AI questions have been prepared for your next attempt.'
      : !passed
        ? '\n\nNew AI questions have been prepared for your next attempt.'
        : ''
    const feedbackToStore = `${evaluation.feedback || ''}${retainedNote}`.trim()
    const nextQuestions = passed
      ? aiQuestions
      : await generateTheoreticalQuestions(room, req.user.id, `practical-retry-${Date.now()}-${retainedTechnicalScore}`)

    await pool.query(
      `UPDATE user_room_theoretical_attempts
       SET answers_json = ?,
           questions_json = ?,
           technical_score = ?,
           grammar_score = ?,
           feedback = ?,
           passed = ?,
           evaluated_at = NOW()
       WHERE user_id = ? AND room_id = ?`,
      [
        passed ? JSON.stringify(aiAnswers) : null,
        JSON.stringify(nextQuestions),
        retainedTechnicalScore,
        retainedGrammarScore,
        feedbackToStore,
        passed,
        req.user.id,
        room.id,
      ],
    )

    aiResult = {
      passed,
      technicalScore: retainedTechnicalScore,
      grammarScore: retainedGrammarScore,
      baseTechnicalScore: Number(evaluation.baseTechnicalScore || evaluation.technicalScore || 0),
      bonusScore: Number(evaluation.bonusScore || 0),
      feedback: feedbackToStore,
      questions: nextQuestions,
      answers: passed ? aiAnswers : {},
      requiredCount: nextQuestions.filter((question) => !question.bonus && !question.optional).length,
    }
  }

  return res.json({
    mode: aiEnabled ? 'hybrid' : 'practical',
    total: manualQuestions.length + aiResult.requiredCount,
    correct: manualCorrect + (aiEnabled && aiResult.passed ? aiResult.requiredCount : 0),
    manualTotal: manualQuestions.length,
    manualCorrect,
    allCorrect: manualPassed && aiResult.passed,
    technicalScore: aiResult.technicalScore,
    grammarScore: aiResult.grammarScore,
    baseTechnicalScore: aiResult.baseTechnicalScore,
    bonusScore: aiResult.bonusScore,
    feedback: aiResult.feedback,
    answers: {
      ...manualAnswers,
      ...aiResult.answers,
    },
    questions: [
      ...manualQuestions.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        hint: question.hint,
        questionType: 'manual',
        answeredCorrectly: completedSet.has(question.id),
        answeredAt: completedSet.has(question.id) ? new Date().toISOString() : null,
        locked: completedSet.has(question.id),
      })),
      ...aiResult.questions.map((question) =>
        formatAiQuestionForClient(question, aiResult.passed, aiResult.answers, aiResult.passed ? new Date() : null),
      ),
    ],
  })
})

async function getDockerAdminStatus() {
  try {
    const [info, rawImages] = await Promise.all([
      dockerApiRequest('/info'),
      dockerApiImages(),
    ])

    const images = rawImages
      .flatMap((image) =>
        Array.isArray(image.RepoTags)
          ? image.RepoTags.map((tag) => ({
            id: image.Id || image.ID || '',
            repository: tag.split(':').slice(0, -1).join(':') || tag,
            tag: tag.includes(':') ? tag.split(':').at(-1) : '',
            name: tag,
            size: image.Size ? `${Math.round(Number(image.Size) / 1024 / 1024)} MB` : '',
            createdSince: image.Created ? new Date(Number(image.Created) * 1000).toLocaleDateString() : '',
          }))
          : [],
      )
      .filter((image) => image.name && !image.name.includes('<none>'))

    return {
      connected: true,
      serverVersion: info.ServerVersion || '',
      operatingSystem: info.OperatingSystem || '',
      architecture: info.Architecture || '',
      containers: Number(info.Containers || 0),
      images,
    }
  } catch (error) {
    return {
      connected: false,
      message:
        error?.code === 'ENOENT'
          ? 'Docker CLI was not found on the backend host.'
          : error?.message || 'Unable to connect to Docker.',
      images: [],
    }
  }
}

router.get('/docker-config/status', authenticate, requireAdmin, async (_req, res) => {
  const status = await getDockerAdminStatus()
  const config = await getStoredDockerConfig()
  return res.json({
    ...status,
    config: {
      hostname: config.hostname,
      displayHost: config.displayHost,
      tlsEnabled: config.tlsEnabled,
      hasCaCert: Boolean(config.caCert),
      hasClientCert: Boolean(config.clientCert),
      hasClientKey: Boolean(config.clientKey),
      updatedAt: config.updatedAt,
    },
  })
})

router.put('/docker-config', authenticate, requireAdmin, async (req, res) => {
  const hostname = String(req.body?.hostname || '').trim()
  const displayHost = String(req.body?.displayHost || '').trim()
  const tlsEnabled = Boolean(req.body?.tlsEnabled)
  const caCert = String(req.body?.caCert || '').trim()
  const clientCert = String(req.body?.clientCert || '').trim()
  const clientKey = String(req.body?.clientKey || '').trim()

  await pool.query(
    `INSERT INTO docker_config (
       id, hostname, display_host, tls_enabled, ca_cert, client_cert, client_key
     ) VALUES (1, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       hostname = VALUES(hostname),
       display_host = VALUES(display_host),
       tls_enabled = VALUES(tls_enabled),
       ca_cert = VALUES(ca_cert),
       client_cert = VALUES(client_cert),
       client_key = VALUES(client_key)`,
    [hostname || null, displayHost || null, tlsEnabled, caCert || null, clientCert || null, clientKey || null],
  )

  const config = await getStoredDockerConfig()
  return res.json({
    hostname: config.hostname,
    displayHost: config.displayHost,
    tlsEnabled: config.tlsEnabled,
    hasCaCert: Boolean(config.caCert),
    hasClientCert: Boolean(config.clientCert),
    hasClientKey: Boolean(config.clientKey),
    updatedAt: config.updatedAt,
  })
})

router.get('/docker-config/containers', authenticate, requireAdmin, async (_req, res) => {
  try {
    const rawContainers = await dockerApiContainers(true)
    const containers = rawContainers
      .filter((container) =>
        Array.isArray(container.Names) &&
        container.Names.some((name) => String(name || '').replace(/^\//, '').startsWith('incognitrix_')),
      )
      .map((container) => ({
        id: container.Id || '',
        image: container.Image || '',
        command: container.Command || '',
        status: container.Status || '',
        names: Array.isArray(container.Names)
          ? container.Names.map((name) => String(name).replace(/^\//, '')).join(', ')
          : '',
        ports: Array.isArray(container.Ports)
          ? container.Ports.map((port) => `${port.PublicPort || ''}->${port.PrivatePort || ''}/${port.Type || 'tcp'}`).join(', ')
          : '',
        createdAt: container.Created ? new Date(Number(container.Created) * 1000).toISOString() : '',
      }))

    return res.json({ containers })
  } catch (error) {
    return res.status(503).json({ message: error?.message || 'Unable to list Docker containers.' })
  }
})

router.delete('/docker-config/containers/:name', authenticate, requireAdmin, async (req, res) => {
  const name = String(req.params.name || '').split(',')[0].trim()
  if (!/^incognitrix_[a-zA-Z0-9_.-]+$/.test(name)) {
    return res.status(400).json({ message: 'Invalid Incognitrix container name.' })
  }

  const containerName = name
  await stopDockerContainer(containerName)
  await pool.query(
    `UPDATE user_room_docker_instances
     SET status = 'stopped'
     WHERE container_name = ?`,
    [containerName],
  )
  return res.json({ stopped: true, name: containerName })
})

function authenticateDockerProxyRequest(req) {
  const cookieToken = String(req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('incognitrix_docker_proxy_token='))
    ?.slice('incognitrix_docker_proxy_token='.length) || ''
  const authToken = getBearerTokenFromRequest(req) || String(req.query?.token || '') || decodeURIComponent(cookieToken)
  if (!authToken) return null
  try {
    return { user: jwt.verify(authToken, env.jwtSecret), token: authToken }
  } catch {
    return null
  }
}

function getProxyRequestHeaders(req, targetHost, targetPort) {
  const hopByHopHeaders = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'authorization',
    'accept-encoding',
  ])
  const headers = {}
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (!hopByHopHeaders.has(key.toLowerCase())) headers[key] = value
  })
  if (headers.cookie) {
    const cookie = String(headers.cookie)
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('incognitrix_docker_proxy_token='))
      .join('; ')
    if (cookie) {
      headers.cookie = cookie
    } else {
      delete headers.cookie
    }
  }
  headers.host = `${targetHost}:${targetPort}`
  return headers
}

function getDockerProxyBasePath(roomId) {
  return `/api/rooms/${encodeURIComponent(roomId)}/docker/proxy`
}

function rewriteProxyPath(value, proxyBasePath, targetOrigin = '') {
  const raw = String(value || '')
  if (!raw || raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:') || raw.startsWith('javascript:')) {
    return raw
  }
  if (raw.startsWith(proxyBasePath)) return raw
  if (raw.startsWith('//')) return raw
  if (raw.startsWith('/')) return `${proxyBasePath}${raw}`

  try {
    if (targetOrigin && raw.startsWith(targetOrigin)) {
      const parsed = new URL(raw)
      return `${proxyBasePath}${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    // Leave malformed URLs untouched.
  }

  return raw
}

function rewriteProxiedHtml(html, proxyBasePath, targetOrigin) {
  let nextHtml = String(html || '')
  const baseTag = `<base href="${proxyBasePath}/">`
  if (/<head[^>]*>/i.test(nextHtml) && !/<base\s/i.test(nextHtml)) {
    nextHtml = nextHtml.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`)
  }

  nextHtml = nextHtml.replace(
    /\b(href|src|action|formaction)=("|')([^"']*)\2/gi,
    (match, attribute, quote, value) => {
      const rewritten = rewriteProxyPath(value, proxyBasePath, targetOrigin)
      return `${attribute}=${quote}${rewritten}${quote}`
    },
  )
  nextHtml = nextHtml.replace(
    /\b(url|open|location\.href|window\.location|fetch)\(("|')([^"']*)\2\)/gi,
    (match, caller, quote, value) => {
      const rewritten = rewriteProxyPath(value, proxyBasePath, targetOrigin)
      return `${caller}(${quote}${rewritten}${quote})`
    },
  )
  nextHtml = nextHtml.replace(
    /\b(url|open|location\.href|window\.location|fetch)\((\/[^)'"]*)\)/gi,
    (match, caller, value) => `${caller}(${rewriteProxyPath(value, proxyBasePath, targetOrigin)})`,
  )

  return nextHtml
}

function getProxyResponseHeaders(headers, proxyBasePath = '', targetOrigin = '', rewriteBody = false) {
  const hopByHopHeaders = new Set([
    'connection',
    'content-length',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
  ])
  const safeHeaders = {}
  Object.entries(headers || {}).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase()
    if (hopByHopHeaders.has(lowerKey)) return
    if (rewriteBody && lowerKey === 'content-security-policy') return
    if (lowerKey === 'location') {
      safeHeaders[key] = rewriteProxyPath(Array.isArray(value) ? value[0] : value, proxyBasePath, targetOrigin)
      return
    }
    safeHeaders[key] = value
  })
  return safeHeaders
}

router.use('/:id/docker/proxy', async (req, res) => {
  const auth = authenticateDockerProxyRequest(req)
  const user = auth?.user
  if (!user?.id) {
    return res.status(401).send('Invalid or expired Docker challenge session.')
  }

  if (req.query?.token && auth?.token) {
    res.cookie('incognitrix_docker_proxy_token', auth.token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000,
      path: getDockerProxyBasePath(req.params.id),
    })
  }

  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).send('Room not found.')
  }

  const config = getDockerConfig(room)
  if (config.protocol === 'tcp') {
    return res.status(400).send('TCP Docker services cannot be proxied as web challenges.')
  }

  const validationError = validateDockerConfig(config)
  if (validationError) {
    return res.status(400).send(validationError)
  }

  const [rows] = await pool.query(
    `SELECT id, container_name, host_port, status, created_at
     FROM user_room_docker_instances
     WHERE user_id = ? AND room_id = ? AND status = 'running'
     LIMIT 1`,
    [user.id, room.id],
  )
  const instance = rows[0]
  if (!instance) {
    return res.status(404).send('No active Docker challenge is running for this room.')
  }

  const expired = await stopStaleDockerInstance(instance, config)
  if (expired) {
    return res.status(410).send('This Docker challenge session has expired. Spawn it again from the lab page.')
  }

  const targetPort = Number(instance.host_port || 0)
  if (!targetPort) {
    return res.status(502).send('This challenge has no published service port.')
  }

  const inspected = await inspectDockerContainer(instance.container_name)
  if (!inspected.running) {
    await pool.query(
      `UPDATE user_room_docker_instances
       SET status = ?
       WHERE id = ?`,
      [inspected.exists ? 'stopped' : 'missing', instance.id],
    )
    return res.status(410).send('This Docker challenge is no longer running.')
  }

  const dockerConnection = await getStoredDockerConfig()
  const targetHost = getDockerServiceHost(dockerConnection)
  const incomingUrl = new URL(req.url || '/', 'http://incognitrix.local')
  incomingUrl.searchParams.delete('token')
  const targetPath = `${incomingUrl.pathname || '/'}${incomingUrl.search || ''}`
  const isHttps = config.protocol === 'https'
  const transport = isHttps ? https : http
  const body = Buffer.isBuffer(req.body) ? req.body : null
  const proxyBasePath = getDockerProxyBasePath(req.params.id)
  const targetOrigin = `${config.protocol}://${targetHost}:${targetPort}`

  const proxyRequest = transport.request(
    {
      hostname: targetHost,
      port: targetPort,
      path: targetPath,
      method: req.method,
      headers: {
        ...getProxyRequestHeaders(req, targetHost, targetPort),
        ...(body ? { 'content-length': body.length } : {}),
      },
      rejectUnauthorized: false,
    },
    (proxyResponse) => {
      const contentType = String(proxyResponse.headers['content-type'] || '')
      const shouldRewriteBody = /\btext\/html\b/i.test(contentType)
      const responseHeaders = getProxyResponseHeaders(proxyResponse.headers, proxyBasePath, targetOrigin, shouldRewriteBody)

      if (!shouldRewriteBody) {
        res.writeHead(proxyResponse.statusCode || 502, responseHeaders)
        proxyResponse.pipe(res)
        return
      }

      const chunks = []
      proxyResponse.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      proxyResponse.on('end', () => {
        const html = Buffer.concat(chunks).toString('utf8')
        const rewrittenHtml = rewriteProxiedHtml(html, proxyBasePath, targetOrigin)
        const payload = Buffer.from(rewrittenHtml, 'utf8')
        res.writeHead(proxyResponse.statusCode || 502, {
          ...responseHeaders,
          'content-length': payload.length,
        })
        res.end(payload)
      })
    },
  )

  proxyRequest.on('error', (error) => {
    if (!res.headersSent) {
      res.status(502).send(error?.message || 'Docker challenge proxy failed.')
      return
    }
    res.end()
  })
  proxyRequest.setTimeout(60000, () => {
    proxyRequest.destroy(new Error('Docker challenge proxy timed out.'))
  })

  if (body) {
    proxyRequest.end(body)
    return
  }
  req.pipe(proxyRequest)
})

router.get('/docker-machines/me', authenticate, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT
       i.id,
       i.container_id,
       i.container_name,
       i.host_port,
       i.status,
       i.created_at,
       i.updated_at,
       r.id AS room_id,
       r.slug,
       r.title,
       r.category,
       r.room_type,
       r.docker_enabled,
       r.docker_image,
       r.docker_container_port,
       r.docker_protocol,
       r.docker_timeout_minutes,
       r.docker_instructions
     FROM user_room_docker_instances i
     INNER JOIN rooms r ON r.id = i.room_id
     WHERE i.user_id = ? AND i.status = 'running'
     ORDER BY i.updated_at DESC`,
    [req.user.id],
  )

  const dockerConnection = await getStoredDockerConfig()
  const machines = []

  for (const row of rows) {
    const room = {
      id: row.room_id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      roomType: row.room_type,
      content: {
        docker: {
          enabled: Boolean(row.docker_enabled),
          image: row.docker_image,
          containerPort: Number(row.docker_container_port || 0),
          protocol: row.docker_protocol,
          timeoutMinutes: Number(row.docker_timeout_minutes || 120),
          instructions: row.docker_instructions || '',
        },
      },
    }
    const config = getDockerConfig(room)
    if (validateDockerConfig(config)) continue

    const expired = await stopStaleDockerInstance(row, config)
    if (expired) continue

    const inspected = await inspectDockerContainer(row.container_name)
    if (!inspected.running) {
      await pool.query(
        `UPDATE user_room_docker_instances
         SET status = ?
         WHERE id = ?`,
        [inspected.exists ? 'stopped' : 'missing', row.id],
      )
      continue
    }

    machines.push({
      roomId: row.room_id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      containerId: row.container_id,
      containerName: row.container_name,
      containerPort: config.containerPort,
      hostPort: Number(row.host_port || 0),
      protocol: config.protocol,
      access: buildDockerAccess(config, Number(row.host_port || 0), req.hostname, dockerConnection, {
        req,
        roomId: row.room_id,
      }),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
      expiresAt: getDockerExpiry(row, config),
      updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    })
  }

  return res.json({ machines })
})

router.get('/:id/docker/status', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const config = getDockerConfig(room)
  const dockerConnection = await getStoredDockerConfig()
  const validationError = validateDockerConfig(config)
  if (validationError) {
    return res.json({
      enabled: false,
      running: false,
      message: validationError,
    })
  }

  const [rows] = await pool.query(
    `SELECT id, container_id, container_name, host_port, status, created_at, updated_at
     FROM user_room_docker_instances
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [req.user.id, room.id],
  )
  const instance = rows[0]
  if (!instance) {
    return res.json({
      enabled: true,
      running: false,
      containerPort: config.containerPort,
      protocol: config.protocol,
      instructions: config.instructions,
    })
  }

  const expired = await stopStaleDockerInstance(instance, config)
  if (expired) {
    return res.json({
      enabled: true,
      running: false,
      expired: true,
      containerPort: config.containerPort,
      protocol: config.protocol,
      timeoutMinutes: config.timeoutMinutes,
      instructions: config.instructions,
    })
  }

  const inspected = await inspectDockerContainer(instance.container_name)
  if (!inspected.running) {
    await pool.query(
      `UPDATE user_room_docker_instances
       SET status = ?
       WHERE user_id = ? AND room_id = ?`,
      [inspected.exists ? 'stopped' : 'missing', req.user.id, room.id],
    )
  }

  return res.json({
    enabled: true,
    running: inspected.running,
    containerId: instance.container_id,
    containerName: instance.container_name,
    containerPort: config.containerPort,
    hostPort: Number(instance.host_port || 0),
    protocol: config.protocol,
    timeoutMinutes: config.timeoutMinutes,
    access: buildDockerAccess(config, Number(instance.host_port || 0), req.hostname, dockerConnection, {
      req,
      roomId: room.id,
    }),
    instructions: config.instructions,
    createdAt: instance.created_at ? new Date(instance.created_at).toISOString() : null,
    expiresAt: getDockerExpiry(instance, config),
    updatedAt: instance.updated_at ? new Date(instance.updated_at).toISOString() : null,
  })
})

router.post('/:id/docker/spawn', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const config = getDockerConfig(room)
  const dockerConnection = await getStoredDockerConfig()
  const validationError = validateDockerConfig(config)
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }

  const [otherInstanceRows] = await pool.query(
    `SELECT
       i.id,
       i.room_id,
       i.container_name,
       i.host_port,
       i.created_at,
       r.title AS room_title
     FROM user_room_docker_instances i
     LEFT JOIN rooms r ON r.id = i.room_id
     WHERE i.user_id = ?
       AND i.room_id <> ?
       AND i.status = 'running'
     ORDER BY i.created_at DESC`,
    [req.user.id, room.id],
  )

  for (const activeInstance of otherInstanceRows) {
    const inspectedActive = await inspectDockerContainer(activeInstance.container_name)
    if (inspectedActive.running) {
      return res.status(409).json({
        message: `You already have an active Docker machine for "${activeInstance.room_title || activeInstance.room_id}". Stop or revert it before spawning another lab.`,
        activeRoomId: activeInstance.room_id,
        activeRoomTitle: activeInstance.room_title || activeInstance.room_id,
        hostPort: Number(activeInstance.host_port || 0) || null,
      })
    }

    await pool.query(
      `UPDATE user_room_docker_instances
       SET status = ?
       WHERE id = ?`,
      [inspectedActive.exists ? 'stopped' : 'missing', activeInstance.id],
    )
  }

  const containerName = buildDockerContainerName(req.user.id, room.id)
  const forceRevert = Boolean(req.body?.revert)
  const existing = await inspectDockerContainer(containerName)
  const [instanceRows] = await pool.query(
    `SELECT id, container_name, host_port, created_at
     FROM user_room_docker_instances
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [req.user.id, room.id],
  )

  let expiredExistingInstance = false
  if (instanceRows[0]) {
    expiredExistingInstance = await stopStaleDockerInstance(instanceRows[0], config)
  }

  if (existing.running && instanceRows[0] && !forceRevert && !expiredExistingInstance) {
    const hostPort = Number(instanceRows[0].host_port || 0)
    return res.json({
      enabled: true,
      running: true,
      containerId: existing.containerId,
      containerName,
      containerPort: config.containerPort,
      hostPort,
      protocol: config.protocol,
      timeoutMinutes: config.timeoutMinutes,
      access: buildDockerAccess(config, hostPort, req.hostname, dockerConnection, {
        req,
        roomId: room.id,
      }),
      instructions: config.instructions,
      createdAt: instanceRows[0].created_at ? new Date(instanceRows[0].created_at).toISOString() : null,
      expiresAt: getDockerExpiry(instanceRows[0], config),
    })
  }

  if (existing.exists) {
    await stopDockerContainer(containerName)
  }
  await stopDockerContainer(buildDockerTerminalContainerName(req.user.id, room.id))

  let exposedPorts = []
  let containerId = ''
  try {
    exposedPorts = await getDockerImageExposedPorts(config.image, config.containerPort)
    const createdContainer = await createStartedDockerContainerWithRandomPorts(
      containerName,
      config.image,
      exposedPorts,
    )
    containerId = createdContainer.containerId
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Unable to start Docker container for this practical room.',
    })
  }
  const inspected = await inspectDockerContainer(containerId)
  const hostPort = getPublishedDockerHostPort(inspected, config.containerPort)
  if (!hostPort && exposedPorts.length) {
    await stopDockerContainer(containerId)
    return res.status(500).json({ message: 'Docker did not publish a host port for this lab container.' })
  }

  let terminalContainerId = containerId
  try {
    if (config.terminalMode === 'isolated') {
      const terminal = await createStartedDockerTerminalContainer(
        buildDockerTerminalContainerName(req.user.id, room.id),
        config.terminalImage,
      )
      terminalContainerId = terminal.containerId
    }

    await installDockerTerminalTools(terminalContainerId, config.terminalTools)
    await copyRoomAttachmentToDocker(terminalContainerId, room, config)
  } catch (error) {
    await stopDockerContainer(containerId)
    await stopDockerContainer(buildDockerTerminalContainerName(req.user.id, room.id))
    return res.status(500).json({
      message: `Docker sandbox setup failed: ${error?.stderr || error?.message || 'Unable to prepare terminal.'}`,
    })
  }

  await pool.query(
    `INSERT INTO user_room_docker_instances (
       user_id, room_id, container_id, container_name, host_port, status
     ) VALUES (?, ?, ?, ?, ?, 'running')
     ON DUPLICATE KEY UPDATE
       container_id = VALUES(container_id),
       container_name = VALUES(container_name),
       host_port = VALUES(host_port),
       status = 'running',
       created_at = CURRENT_TIMESTAMP`,
    [req.user.id, room.id, containerId, containerName, hostPort || null],
  )

  const [createdRows] = await pool.query(
    `SELECT created_at
     FROM user_room_docker_instances
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [req.user.id, room.id],
  )
  const createdInstance = createdRows[0] || { created_at: new Date() }

  return res.status(201).json({
    enabled: true,
    running: true,
    containerId,
    containerName,
    containerPort: config.containerPort,
    hostPort,
    protocol: config.protocol,
    timeoutMinutes: config.timeoutMinutes,
    access: buildDockerAccess(config, hostPort, req.hostname, dockerConnection, {
      req,
      roomId: room.id,
    }),
    instructions: config.instructions,
    createdAt: createdInstance.created_at ? new Date(createdInstance.created_at).toISOString() : null,
    expiresAt: getDockerExpiry(createdInstance, config),
  })
})

router.post('/:id/docker/stop', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const containerName = buildDockerContainerName(req.user.id, room.id)
  await stopDockerContainer(containerName)
  await stopDockerContainer(buildDockerTerminalContainerName(req.user.id, room.id))

  await pool.query(
    `UPDATE user_room_docker_instances
     SET status = 'stopped'
     WHERE user_id = ? AND room_id = ?`,
    [req.user.id, room.id],
  )

  return res.json({ running: false })
})

router.post('/:id/docker/terminal', authenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const config = getDockerConfig(room)
  const validationError = validateDockerConfig(config)
  if (validationError) {
    return res.status(400).json({ message: validationError })
  }

  const command = String(req.body?.command || '').trim()
  if (!command) {
    return res.status(400).json({ message: 'Terminal command is required.' })
  }
  if (command.length > 1000 || command.includes('\u0000')) {
    return res.status(400).json({ message: 'Terminal command is too large or invalid.' })
  }
  const interactiveBlockMessage = getBlockedInteractiveTerminalCommand(command)
  if (interactiveBlockMessage) {
    return res.status(400).json({ message: interactiveBlockMessage })
  }
  if (isBlockedPlayerTerminalCommand(command)) {
    return res.status(403).json({
      message: 'Package installation is restricted. Use the tools prepared by the admin for this lab.',
    })
  }
  const requestedCwd = String(req.body?.cwd || '/').trim() || '/'
  if (requestedCwd.length > 300 || requestedCwd.includes('\u0000')) {
    return res.status(400).json({ message: 'Terminal working directory is invalid.' })
  }

  const [rows] = await pool.query(
    `SELECT id, container_name, created_at
     FROM user_room_docker_instances
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [req.user.id, room.id],
  )
  const instance = rows[0]
  if (!instance) {
    return res.status(404).json({ message: 'Spawn the Docker service before opening the terminal.' })
  }

  const expired = await stopStaleDockerInstance(instance, config)
  if (expired) {
    return res.status(410).json({ message: 'This Docker service expired. Revert or spawn it again.' })
  }

  const terminalContainerName = config.terminalMode === 'isolated'
    ? buildDockerTerminalContainerName(req.user.id, room.id)
    : instance.container_name
  const inspected = await inspectDockerContainer(terminalContainerName)
  if (!inspected.running) {
    await pool.query(
      `UPDATE user_room_docker_instances
       SET status = ?
       WHERE user_id = ? AND room_id = ?`,
      [inspected.exists ? 'stopped' : 'missing', req.user.id, room.id],
    )
    return res.status(409).json({ message: 'Docker terminal is not running. Revert or spawn the service again.' })
  }

  try {
    await ensureDockerTerminalTools(terminalContainerName, config.terminalTools)
    const workdir = config.exposeAttachmentToTerminal && room?.content?.attachment?.dataUrl ? '/challenge' : '/'
    const wrapper = [
      'cd "$INCOGNITRIX_CWD" 2>/dev/null || cd "$INCOGNITRIX_DEFAULT_CWD" 2>/dev/null || cd /',
      'eval "$INCOGNITRIX_COMMAND"',
      'status=$?',
      'printf "\\n__INCOGNITRIX_CWD__%s\\n" "$PWD"',
      'exit "$status"',
    ].join('; ')
    const result = await dockerExec(
      [
        'exec',
        '--env',
        `INCOGNITRIX_CWD=${requestedCwd}`,
        '--env',
        `INCOGNITRIX_DEFAULT_CWD=${workdir}`,
        '--env',
        `INCOGNITRIX_COMMAND=${command}`,
        '--workdir',
        '/',
        terminalContainerName,
        'sh',
        '-lc',
        wrapper,
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 },
    )
    const parsed = splitTerminalCwdFromOutput(result.stdout)

    return res.json({
      command,
      stdout: parsed.stdout || '',
      stderr: result.stderr || '',
      cwd: parsed.cwd || requestedCwd,
      exitCode: 0,
      executedAt: new Date().toISOString(),
    })
  } catch (error) {
    const parsed = splitTerminalCwdFromOutput(error?.stdout || '')
    return res.json({
      command,
      stdout: parsed.stdout || '',
      stderr: error?.stderr || error?.message || 'Command failed.',
      cwd: parsed.cwd || requestedCwd,
      exitCode: Number(error?.code || 1),
      executedAt: new Date().toISOString(),
    })
  }
})

router.get('/:id', optionalAuthenticate, async (req, res) => {
  const room = await fetchRoomById(req.params.id)
  if (!room) {
    return res.status(404).json({ message: 'Room not found' })
  }
  return res.json(roomResponseForRequest(room, req))
})

router.post('/', authenticate, requireAdmin, async (req, res) => {
  const payload = req.body || {}
  if (!payload.title) {
    return res.status(400).json({ message: 'title is required' })
  }

  const id = buildRoomId(payload.slug || payload.title)
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    await conn.query(
      `INSERT INTO rooms (
        id, slug, category, level, level_tone, dot_tone, title, description, xp,
        room_type, difficulty, estimate_time, environment, category_tag, content_markdown,
        content_html, mission_overview, remediation_protocols,
        vulnerability_definition, vulnerability_impact, technical_deep_dive,
        youtube_video_url, practical_ai_questions_enabled,
        attachment_name, attachment_type, attachment_size, attachment_data,
        docker_enabled, docker_image, docker_container_port, docker_protocol, docker_timeout_minutes, docker_instructions,
        docker_terminal_tools, docker_expose_attachment_to_terminal, docker_terminal_mode, docker_terminal_image,
        questions_enabled, questions_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        id,
        payload.category || null,
        payload.level || null,
        payload.levelTone || null,
        payload.dotTone || null,
        payload.title,
        payload.description || null,
        payload.xp || null,
        payload.roomType === 'practical' ? 'practical' : 'theoretical',
        payload.difficulty || null,
        payload.estimateTime || null,
        payload.environment || null,
        payload.categoryTag || null,
        payload.content?.markdown || '',
        payload.content?.html || '',
        payload.content?.missionOverview || '',
        payload.content?.remediationProtocols || '',
        payload.content?.vulnerabilityBriefing?.definition || '',
        payload.content?.vulnerabilityBriefing?.impact || '',
        payload.content?.technicalDeepDive || '',
        payload.content?.youtubeVideoUrl || null,
        Boolean(payload.content?.aiQuestionsEnabled),
        payload.content?.attachment?.name || null,
        payload.content?.attachment?.type || null,
        Number(payload.content?.attachment?.size || 0),
        payload.content?.attachment?.dataUrl || null,
        Boolean(payload.content?.docker?.enabled),
        payload.content?.docker?.image || null,
        Number(payload.content?.docker?.containerPort || 0),
        payload.content?.docker?.protocol || 'http',
        Number(payload.content?.docker?.timeoutMinutes || 120),
        payload.content?.docker?.instructions || '',
        payload.content?.docker?.terminalTools || '',
        Boolean(payload.content?.docker?.exposeAttachmentToTerminal),
        payload.content?.docker?.terminalMode === 'isolated' ? 'isolated' : 'service',
        payload.content?.docker?.terminalImage || null,
        Boolean(payload.content?.questionsEnabled),
        JSON.stringify(parseRoomQuestions(payload)),
      ],
    )

    for (const tag of payload.tags || []) {
      await conn.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [id, tag])
    }

    for (const keyword of payload.requiredKeywords || []) {
      await conn.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
        id,
        keyword,
      ])
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }

  const created = await fetchRoomById(id)
  return res.status(201).json(created)
})

router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  const existing = await fetchRoomById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Room not found' })
  }

  const payload = req.body || {}
  const roomId = existing.id
  const conn = await pool.getConnection()

  try {
    await conn.beginTransaction()

    await conn.query(
      `UPDATE rooms SET
        category = ?, level = ?, level_tone = ?, dot_tone = ?, title = ?, description = ?, xp = ?,
        room_type = ?, difficulty = ?, estimate_time = ?, environment = ?, category_tag = ?,
        content_markdown = ?, content_html = ?, mission_overview = ?, remediation_protocols = ?,
        vulnerability_definition = ?, vulnerability_impact = ?, technical_deep_dive = ?,
        youtube_video_url = ?, practical_ai_questions_enabled = ?,
        attachment_name = ?, attachment_type = ?, attachment_size = ?, attachment_data = ?,
        docker_enabled = ?, docker_image = ?, docker_container_port = ?, docker_protocol = ?, docker_timeout_minutes = ?, docker_instructions = ?,
        docker_terminal_tools = ?, docker_expose_attachment_to_terminal = ?, docker_terminal_mode = ?, docker_terminal_image = ?,
        questions_enabled = ?, questions_json = ?
      WHERE id = ?`,
      [
        payload.category ?? existing.category,
        payload.level ?? existing.level,
        payload.levelTone ?? existing.levelTone,
        payload.dotTone ?? existing.dotTone,
        payload.title ?? existing.title,
        payload.description ?? existing.description,
        payload.xp ?? existing.xp,
        payload.roomType === 'practical' ? 'practical' : 'theoretical',
        payload.difficulty ?? existing.difficulty,
        payload.estimateTime ?? existing.estimateTime,
        payload.environment ?? existing.environment,
        payload.categoryTag ?? existing.categoryTag,
        payload.content?.markdown ?? existing.content.markdown,
        payload.content?.html ?? existing.content.html,
        payload.content?.missionOverview ?? existing.content.missionOverview,
        payload.content?.remediationProtocols ?? existing.content.remediationProtocols,
        payload.content?.vulnerabilityBriefing?.definition ??
        existing.content.vulnerabilityBriefing.definition,
        payload.content?.vulnerabilityBriefing?.impact ?? existing.content.vulnerabilityBriefing.impact,
        payload.content?.technicalDeepDive ?? existing.content.technicalDeepDive,
        payload.content?.youtubeVideoUrl ?? existing.content.youtubeVideoUrl ?? null,
        Boolean(payload.content?.aiQuestionsEnabled ?? existing.content.aiQuestionsEnabled),
        payload.content?.attachment?.name ?? existing.content.attachment?.name ?? null,
        payload.content?.attachment?.type ?? existing.content.attachment?.type ?? null,
        Number(payload.content?.attachment?.size ?? existing.content.attachment?.size ?? 0),
        payload.content?.attachment?.dataUrl ?? existing.content.attachment?.dataUrl ?? null,
        Boolean(payload.content?.docker?.enabled ?? existing.content.docker?.enabled),
        payload.content?.docker?.image ?? existing.content.docker?.image ?? null,
        Number(payload.content?.docker?.containerPort ?? existing.content.docker?.containerPort ?? 0),
        payload.content?.docker?.protocol ?? existing.content.docker?.protocol ?? 'http',
        Number(payload.content?.docker?.timeoutMinutes ?? existing.content.docker?.timeoutMinutes ?? 120),
        payload.content?.docker?.instructions ?? existing.content.docker?.instructions ?? '',
        payload.content?.docker?.terminalTools ?? existing.content.docker?.terminalTools ?? '',
        Boolean(payload.content?.docker?.exposeAttachmentToTerminal ?? existing.content.docker?.exposeAttachmentToTerminal),
        (payload.content?.docker?.terminalMode ?? existing.content.docker?.terminalMode) === 'isolated' ? 'isolated' : 'service',
        payload.content?.docker?.terminalImage ?? existing.content.docker?.terminalImage ?? null,
        Boolean(payload.content?.questionsEnabled ?? existing.content.questionsEnabled),
        JSON.stringify(
          parseRoomQuestions({
            content: {
              questions:
                payload.content?.questions ??
                existing.content.questions ??
                [],
            },
          }),
        ),
        roomId,
      ],
    )

    await conn.query('DELETE FROM room_tags WHERE room_id = ?', [roomId])
    await conn.query('DELETE FROM room_required_keywords WHERE room_id = ?', [roomId])

    for (const tag of payload.tags ?? existing.tags) {
      await conn.query('INSERT INTO room_tags (room_id, tag) VALUES (?, ?)', [roomId, tag])
    }

    for (const keyword of payload.requiredKeywords ?? existing.requiredKeywords) {
      await conn.query('INSERT INTO room_required_keywords (room_id, keyword) VALUES (?, ?)', [
        roomId,
        keyword,
      ])
    }

    await conn.commit()
  } catch (error) {
    await conn.rollback()
    return res.status(500).json({ message: error.message })
  } finally {
    conn.release()
  }

  const updated = await fetchRoomById(roomId)
  return res.json(updated)
})

router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  const existing = await fetchRoomById(req.params.id)
  if (!existing) {
    return res.status(404).json({ message: 'Room not found' })
  }

  await pool.query('DELETE FROM rooms WHERE id = ?', [existing.id])
  return res.status(204).send()
})

export function setupRoomTerminalWebSocket(server) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (request, socket, head) => {
    let parsedUrl
    try {
      parsedUrl = new URL(request.url || '', 'http://localhost')
    } catch {
      socket.destroy()
      return
    }

    const match = parsedUrl.pathname.match(/^\/api\/rooms\/([^/]+)\/docker\/terminal\/ws$/)
    if (!match) {
      return
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, decodeURIComponent(match[1]), parsedUrl)
    })
  })

  wss.on('connection', async (ws, _request, roomId, parsedUrl) => {
    let prefix = null
    let child = null

    const sendJson = (payload) => {
      if (ws.readyState === 1) {
        ws.send(JSON.stringify(payload))
      }
    }

    try {
      const token = parsedUrl.searchParams.get('token') || ''
      const user = jwt.verify(token, env.jwtSecret)
      const room = await fetchRoomById(roomId)
      if (!room) {
        sendJson({ type: 'error', message: 'Room not found.' })
        ws.close()
        return
      }

      const config = getDockerConfig(room)
      const validationError = validateDockerConfig(config)
      if (validationError) {
        sendJson({ type: 'error', message: validationError })
        ws.close()
        return
      }

      const [rows] = await pool.query(
        `SELECT id, container_name, created_at
         FROM user_room_docker_instances
         WHERE user_id = ? AND room_id = ?
         LIMIT 1`,
        [user.id, room.id],
      )
      const instance = rows[0]
      if (!instance) {
        sendJson({ type: 'error', message: 'Spawn the Docker service before opening the terminal.' })
        ws.close()
        return
      }

      const expired = await stopStaleDockerInstance(instance, config)
      if (expired) {
        sendJson({ type: 'error', message: 'This Docker service expired. Revert or spawn it again.' })
        ws.close()
        return
      }

      const terminalContainerName = config.terminalMode === 'isolated'
        ? buildDockerTerminalContainerName(user.id, room.id)
        : instance.container_name
      const inspected = await inspectDockerContainer(terminalContainerName)
      if (!inspected.running) {
        sendJson({ type: 'error', message: 'Docker terminal is not running. Revert or spawn the service again.' })
        ws.close()
        return
      }

      await ensureDockerTerminalTools(terminalContainerName, config.terminalTools)

      const workdir = config.exposeAttachmentToTerminal && room?.content?.attachment?.dataUrl ? '/challenge' : '/tmp'
      prefix = await buildDockerCliPrefix()
      const dockerTerminalCommand = [
        'docker',
        ...prefix.args,
        'exec',
        '-i',
        '-t',
        '-e',
        'TERM=xterm-256color',
        '-e',
        'HOME=/tmp',
        '--user',
        '65534:65534',
        '--workdir',
        workdir,
        terminalContainerName,
        'sh',
        '-lc',
        'if command -v bash >/dev/null 2>&1; then exec bash -li; else exec sh -i; fi',
      ].map(shellQuote).join(' ')

      child = spawn('script', [
        '-q',
        '-f',
        '-e',
        '-c',
        dockerTerminalCommand,
        '/dev/null',
      ], {
        env: {
          ...process.env,
          TERM: 'xterm-256color',
        },
      })

      sendJson({ type: 'ready', cwd: workdir })
      child.stdout.on('data', (chunk) => sendJson({ type: 'output', data: chunk.toString('base64') }))
      child.stderr.on('data', (chunk) => sendJson({ type: 'output', data: chunk.toString('base64') }))
      child.on('close', (code) => {
        sendJson({ type: 'exit', code })
        ws.close()
      })
      child.on('error', (error) => {
        sendJson({ type: 'error', message: error?.message || 'Terminal process failed.' })
        ws.close()
      })

      ws.on('message', (message) => {
        try {
          const payload = JSON.parse(String(message))
          if (payload.type === 'input' && child?.stdin?.writable) {
            child.stdin.write(Buffer.from(String(payload.data || ''), 'base64'))
          } else if (payload.type === 'resize' && child?.stdin?.writable) {
            const cols = Math.max(20, Math.min(300, Number(payload.cols) || 80))
            const rows = Math.max(10, Math.min(120, Number(payload.rows) || 24))
            child.stdin.write(`stty rows ${rows} cols ${cols}\r`)
          }
        } catch {
          // Ignore malformed terminal frames.
        }
      })
    } catch (error) {
      sendJson({ type: 'error', message: error?.message || 'Unable to open terminal.' })
      ws.close()
    }

    ws.on('close', async () => {
      if (child && !child.killed) {
        child.kill('SIGTERM')
      }
      if (prefix) {
        await prefix.cleanup()
      }
    })
  })
}

export default router
