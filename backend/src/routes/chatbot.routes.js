import { Router } from 'express'
import OpenAI from 'openai'
import { env } from '../config/env.js'
import { pool } from '../db/pool.js'
import { authenticate } from '../middleware/auth.js'
import { getAiRuntimeConfig } from '../services/aiSettings.js'

const router = Router()

const SECURITY_KEYWORDS = [
  'cybersecurity',
  'cyber security',
  'infosec',
  'information security',
  'security',
  'application security',
  'appsec',
  'offensive security',
  'defensive security',
  'adversary emulation',
  'attack surface',
  'attack vector',
  'threat actor',
  'kill chain',
  'mitre att&ck',
  'mitre attack',
  'ttp',
  'ttps',
  'ioc',
  'iocs',
  'yara',
  'sigma rule',
  'sigma rules',
  'detection engineering',
  'purple team',
  'vulnerability management',
  'vulnerability assessment',
  'vulnerability',
  'vulnerabilities',
  'cve',
  'cvss',
  'cwe',
  'capec',
  'vuln',
  'exploit',
  'exploit development',
  'proof of concept',
  'poc',
  'remote code execution',
  'rce',
  'command injection',
  'os command injection',
  'lfi',
  'rfi',
  'local file inclusion',
  'remote file inclusion',
  'path traversal',
  'directory traversal',
  'deserialization',
  'insecure deserialization',
  'xml external entity',
  'xxe',
  'ssrf',
  'server side request forgery',
  'server-side request forgery',
  'idor',
  'broken access control',
  'privilege escalation',
  'session fixation',
  'session hijacking',
  'clickjacking',
  'open redirect',
  'prototype pollution',
  'cache poisoning',
  'supply chain attack',
  'dependency confusion',
  'typosquatting',
  'sast',
  'dast',
  'iast',
  'sca',
  'secret scanning',
  'code scanning',
  'secure coding',
  'security testing',
  'threat model',
  'penetration testing',
  'pentest',
  'bug bounty',
  'responsible disclosure',
  'coordinated vulnerability disclosure',
  'red team',
  'blue team',
  'threat',
  'threat intelligence',
  'threat intel',
  'threat modeling',
  'risk assessment',
  'risk management',
  'business continuity',
  'disaster recovery',
  'bcp',
  'drp',
  'malware',
  'virus',
  'worm',
  'trojan',
  'rootkit',
  'spyware',
  'adware',
  'botnet',
  'keylogger',
  'packer',
  'obfuscation',
  'sandbox evasion',
  'malware analysis',
  'reverse engineering',
  'dynamic analysis',
  'static analysis',
  'memory forensics',
  'ransomware',
  'double extortion',
  'phishing',
  'spear phishing',
  'vishing',
  'smishing',
  'social engineering',
  'business email compromise',
  'bec',
  'siem',
  'soar',
  'xdr',
  'edr',
  'ndr',
  'ids',
  'ips',
  'intrusion detection',
  'intrusion prevention',
  'log analysis',
  'alert triage',
  'soc',
  'soc analyst',
  'security operations',
  'incident response',
  'incident handling',
  'containment',
  'eradication',
  'recovery',
  'post incident review',
  'digital forensics',
  'forensics',
  'chain of custody',
  'volatile data',
  'disk imaging',
  'timeline analysis',
  'artifact analysis',
  'dfir',
  'owasp',
  'owasp top 10',
  'asvs',
  'masvs',
  'xss',
  'cross site scripting',
  'cross-site scripting',
  'stored xss',
  'reflected xss',
  'dom xss',
  'dom-based xss',
  'ssti',
  'server side template injection',
  'server-side template injection',
  'csp',
  'content security policy',
  'security header',
  'security headers',
  'hsts',
  'x-frame-options',
  'x-content-type-options',
  'strict-transport-security',
  'referrer-policy',
  'permissions-policy',
  'sql injection',
  'sqli',
  'blind sqli',
  'time based sqli',
  'union based sqli',
  'csrf',
  'cross site request forgery',
  'cross-site request forgery',
  'anti csrf',
  'same site cookie',
  'samesite cookie',
  'authentication',
  'mfa',
  '2fa',
  'password policy',
  'passkey',
  'fido2',
  'webauthn',
  'single sign on',
  'sso',
  'federation',
  'saml',
  'oauth',
  'oauth2',
  'openid connect',
  'oidc',
  'jwt',
  'token security',
  'api key',
  'authorization',
  'rbac',
  'abac',
  'least privilege',
  'iam',
  'identity and access management',
  'access control',
  'firewall',
  'waf',
  'web application firewall',
  'ngfw',
  'zero trust',
  'microsegmentation',
  'segmentation',
  'network security',
  'dns security',
  'email security',
  'dmarc',
  'dkim',
  'spf',
  'vpn',
  'ipsec',
  'network hardening',
  'port scanning',
  'service enumeration',
  'reconnaissance',
  'enumeration',
  'nmap',
  'masscan',
  'nikto',
  'amass',
  'subdomain takeover',
  'burp',
  'burp suite',
  'zap',
  'owasp zap',
  'metasploit',
  'cobalt strike',
  'sliver',
  'empire',
  'wireshark',
  'tcpdump',
  'pcap',
  'ctf',
  'capture the flag',
  'hack the box',
  'tryhackme',
  'vulnhub',
  'encryption',
  'cryptography',
  'cipher',
  'aes',
  'rsa',
  'ecc',
  'diffie hellman',
  'key exchange',
  'public key',
  'private key',
  'certificate',
  'pki',
  'certificate pinning',
  'hashing',
  'password hashing',
  'argon2',
  'bcrypt',
  'scrypt',
  'pbkdf2',
  'sha256',
  'sha-256',
  'md5',
  'salting',
  'tls',
  'ssl',
  'mTLS',
  'https',
  'certificate validation',
  'network defense',
  'endpoint security',
  'device hardening',
  'patch management',
  'configuration management',
  'threat hunting',
  'hunt hypothesis',
  'attack simulation',
  'linux hardening',
  'windows hardening',
  'active directory',
  'ad security',
  'kerberos',
  'ntlm',
  'pass the hash',
  'golden ticket',
  'silver ticket',
  'lateral movement',
  'credential dumping',
  'mimikatz',
  'lsass',
  'cloud security',
  'aws security',
  'azure security',
  'gcp security',
  'container security',
  'kubernetes security',
  'k8s security',
  'docker security',
  'iac security',
  'terraform security',
  'secrets management',
  'vault',
  'devsecops',
  'ci/cd security',
  'pipeline security',
  'sbom',
  'attestation',
  'signed commits',
  'code signing',
  'runtime protection',
  'compliance',
  'iso 27001',
  'nist',
  'nist csf',
  'nist 800-53',
  'cis benchmark',
  'pci dss',
  'hipaa security',
  'gdpr security',
  'privacy engineering',
  'data protection',
  'data loss prevention',
  'dlp',
  'insider threat',
  'attack tree',
  'diamond model',
  'cyber kill chain',
  'threat landscape',
  'adversary-in-the-middle',
  'evilginx',
  'phishing-resistant mfa',
  'security champion',
  'purple teaming',
  'baselining',
  'anomaly detection',
  'ueba',
  'deception technology',
  'honeytoken',
  'honeypot',
  'canary token',
  'memory corruption',
  'buffer overflow',
  'heap overflow',
  'use after free',
  'uaf',
  'integer overflow',
  'race condition',
  'toctou',
  'format string vulnerability',
  'auth bypass',
  'authorization bypass',
  'token replay',
  'nonce reuse',
  'web cache deception',
  'http request smuggling',
  'request smuggling',
  'http',
  'https',
  'http protocol',
  'web protocol',
  'request header',
  'response header',
  'status code',
  'cookie',
  'host header injection',
  'crlf injection',
  'command and control',
  'c2 framework',
  'beaconing',
  'living off the land',
  'lolbin',
  'lolbas',
  'powershell logging',
  'sysmon',
  'windows event logs',
  'event correlation',
  'netflow',
  'zeek',
  'suricata',
  'snort',
  'pcap analysis',
  'packet analysis',
  'dns tunneling',
  'domain fronting',
  'fast flux',
  'typosquat domain',
  'mail spoofing',
  'brand impersonation',
  'm365 security',
  'entra id security',
  'okta security',
  'identity federation',
  'kerberoasting',
  'as-rep roasting',
  'dcsync',
  'dcshadow',
  'bloodhound',
  'adcs abuse',
  'esc1',
  'esc8',
  'wireless pentest',
  'wpa handshake',
  'pmkid',
  'krack',
  'bluetooth security',
  'ble security',
  'zigbee security',
  'iot security',
  'embedded security',
  'secure boot',
  'measured boot',
  'tpm security',
  'hsm security',
  'firmware analysis',
  'uefi security',
  'bootkit',
  'root of trust',
  'mobile pentest',
  'jailbreak detection',
  'root detection bypass',
  'certificate pinning bypass',
  'frida bypass',
  'api gateway security',
  'rate limiting',
  'bot mitigation',
  'graphql introspection',
  'broken object level authorization',
  'bola',
  'broken function level authorization',
  'bfla',
  'mass assignment',
  'api fuzzing',
  'security chaos engineering',
  'chaos security',
  'runtime application self protection',
  'rasp',
  'application allowlisting',
  'network access control',
  'nac',
  'secure remote access',
  'ztna access',
  'workload identity',
  'cloud trail security',
  'guardduty',
  'security hub',
  'defender for cloud',
  'azure sentinel',
  'cloud armor',
  'kube-bench',
  'kube-hunter',
  'falco',
  'trivy',
  'cosign',
  'sigstore',
  'admission webhook',
  'service account token',
  'etcd encryption',
  'cluster hardening',
  'runtime threat detection',
  'data residency',
  'cross-border data transfer',
  'privacy by design',
  'zero trust architecture',
  'nist 800-207',
  'iso 27701',
  'soc 2',
  'cia triad',
  'availability',
  'integrity',
  'confidentiality',
  'non-repudiation',
  'key management',
  'secret rotation',
  'credential hygiene',
  'attack emulation',
  'tabletop exercise',
  'incident tabletop',
]

const OUT_OF_SCOPE_REPLY =
  'I can only help with cybersecurity-related questions. Try asking about vulnerabilities, CVEs, secure coding, incident response, CTFs, or defensive security practices.'

const ACTIVE_ASSESSMENT_REPLY =
  'I cannot answer active AI-generated assessment questions while this room attempt is open. Use the room content to write your own response, then submit it for evaluation.'

const SECURITY_PATTERNS = [
  /\b(red team|red-team|offensive security|adversary emulation|assumed breach)\b/,
  /\b(blue team|blue-team|defensive security|security operations|soc|siem|soar|detection)\b/,
  /\b(network security|network defense|segmentation|microsegmentation|ids|ips|firewall|waf)\b/,
  /\b(lateral movement|pivoting|privilege escalation|credential access|persistence|c2|command and control)\b/,
  /\b(threat hunting|threat intel|ioc|yara|sigma|attack path|attack simulation)\b/,
  /\b(incident response|forensics|dfir|containment|eradication|recovery)\b/,
  /\b(pentest|penetration testing|exploit|payload|poc|proof of concept|rce|sqli|xss|csrf|ssrf|xxe|ssti|idor)\b/,
  /\b(active directory|kerberos|ntlm|pass the hash|golden ticket|silver ticket|mimikatz|lsass)\b/,
  /\b(vpn|ipsec|tls|ssl|https|certificate|pki|dns security|email security|dmarc|dkim|spf)\b/,
  /\b(aws security|azure security|gcp security|cloud security|container security|kubernetes security|devsecops)\b/,
  /\b(purple team|purple teaming|threat emulation|attack emulation|tabletop exercise|incident tabletop)\b/,
  /\b(kerberoasting|as-rep roasting|dcsync|dcshadow|bloodhound|adcs abuse|esc\d+)\b/,
  /\b(api security|graphql security|bola|bfla|mass assignment|rate limiting|api fuzzing)\b/,
  /\b(wireless security|wifi security|wireless pentest|wpa2|wpa3|pmkid|evil twin|deauthentication)\b/,
  /\b(ot security|ics security|scada security|critical infrastructure|modbus|dnp3|iiot)\b/,
  /\b(mobile security|android security|ios security|frida|certificate pinning bypass|jailbreak)\b/,
  /\b(kubernetes hardening|container escape|falco|trivy|cosign|sigstore|admission webhook)\b/,
  /\b(privacy by design|data protection|gdpr|hipaa|soc 2|iso 27001|iso 27701|nist 800-207)\b/,
]

function normalizeText(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim()
}

function tokenizeForSimilarity(value) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'are',
    'as',
    'at',
    'be',
    'by',
    'for',
    'from',
    'how',
    'in',
    'is',
    'it',
    'of',
    'on',
    'or',
    'that',
    'the',
    'this',
    'to',
    'using',
    'what',
    'when',
    'where',
    'which',
    'why',
    'with',
    'you',
    'your',
  ])

  return normalizeText(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
}

function hasQuestionOverlap(message, questions) {
  const messageTokens = new Set(tokenizeForSimilarity(message))
  if (!messageTokens.size) {
    return false
  }

  return questions.some((question) => {
    const promptTokens = tokenizeForSimilarity(question?.prompt)
    if (!promptTokens.length) {
      return false
    }

    const overlap = promptTokens.filter((token) => messageTokens.has(token)).length
    return overlap >= 5 || overlap / Math.max(1, Math.min(promptTokens.length, messageTokens.size)) >= 0.38
  })
}

function isAssessmentAnswerRequest(message, questions) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  const answerIntent =
    /\b(answer|solve|write|draft|respond|complete|give me|tell me what|what should i write|help me answer|assessment|question\s*\d+|q\s*\d+)\b/i

  return hasQuestionOverlap(message, questions) || (answerIntent.test(normalized) && /\b(answer|question|assessment|q\s*\d+)\b/i.test(normalized))
}

function getRoomLookupFromContext(context) {
  const route = String(context?.route || '')
  if (!route.startsWith('/learn/lab/')) {
    return ''
  }

  return decodeURIComponent(route.split('/learn/lab/')[1]?.split('/')[0] || '').trim()
}

async function getActiveAssessmentQuestions(userId, context) {
  const roomLookup = getRoomLookupFromContext(context)
  if (!userId || !roomLookup || context?.pageType !== 'room') {
    return []
  }

  const [roomRows] = await pool.query(
    'SELECT id FROM rooms WHERE id = ? OR slug = ? LIMIT 1',
    [roomLookup, roomLookup],
  )

  const roomId = roomRows[0]?.id
  if (!roomId) {
    return []
  }

  const [attemptRows] = await pool.query(
    `SELECT questions_json, passed
     FROM user_room_theoretical_attempts
     WHERE user_id = ? AND room_id = ?
     LIMIT 1`,
    [userId, roomId],
  )

  const attempt = attemptRows[0]
  if (!attempt || Boolean(attempt.passed)) {
    return []
  }

  try {
    const questions = JSON.parse(attempt.questions_json || '[]')
    return Array.isArray(questions) ? questions.filter((question) => question?.prompt) : []
  } catch {
    return []
  }
}

function isCybersecurityQuestion(message) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  if (SECURITY_KEYWORDS.some((keyword) => normalized.includes(keyword))) {
    return true
  }

  return SECURITY_PATTERNS.some((pattern) => pattern.test(normalized))
}

function isSiteContextQuestion(message, context) {
  const normalized = normalizeText(message)
  if (!normalized) {
    return false
  }

  const hasContext = Boolean(context?.pageSummary || context?.siteSummary)

  const siteIntentPattern =
    /\b(summarize|summary|summarise|explain|describe|overview|creator|created by|owner|developer|founder|who built|who made|who created|about this site|about this page|tell about this site|tell about this page|tell me about this page|tell me about this site|what is this page|what is this site|what does this page do|what does this site do)\b/i

  if (!siteIntentPattern.test(normalized)) {
    return false
  }

  // Prefer having context, but still allow explicit site/page intent so the gate is not a bottleneck.
  return hasContext || /\b(this site|this page|site|page)\b/i.test(normalized)
}

function trimHistory(history) {
  if (!Array.isArray(history)) {
    return []
  }

  return history
    .slice(-12)
    .filter((entry) => entry && typeof entry.message === 'string')
    .map((entry) => ({
      role: entry.role === 'assistant' ? 'assistant' : 'user',
      message: entry.message.slice(0, 1200),
    }))
}

function clampText(value, limit = 1200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) {
    return ''
  }

  if (text.length <= limit) {
    return text
  }

  return `${text.slice(0, limit - 1).trimEnd()}…`
}

function trimContext(rawContext) {
  if (!rawContext || typeof rawContext !== 'object') {
    return null
  }

  const mode = rawContext.mode === 'detailed' ? 'detailed' : 'brief'

  return {
    mode,
    pageType: clampText(rawContext.pageType, 80),
    route: clampText(rawContext.route, 120),
    siteSummary: clampText(rawContext.siteSummary, 1200),
    pageSummary: clampText(rawContext.pageSummary, 1200),
  }
}

function buildSystemPrompt(mode, context) {
  const styleInstruction =
    mode === 'detailed'
      ? 'Use detailed mode: answer with deeper explanations, structured sections, practical examples, and useful caveats.'
      : 'Use brief mode: answer in exactly one short paragraph. Do not use bullets, numbered lists, headings, or extra sections.'

  const contextInstruction = context
    ? [
        context.siteSummary ? `Site context: ${context.siteSummary}` : '',
        context.pageSummary ? `Current page context: ${context.pageSummary}` : '',
        context.route ? `Current route: ${context.route}` : '',
      ]
        .filter(Boolean)
        .join(' ')
    : ''

  return [
    'You are the Incognitrix Academy cybersecurity assistant.',
    'Only answer cybersecurity, secure development, CTF, defensive operations, web protocol, and site-usage questions related to this platform.',
    'If asked who created this site (creator, owner, developer, founder), reply that it is created by Cybersecurity Team of MeowSec lead by Developer and Red teamer CyberGhost07 (Liyander Rishwanth).',
    'If the user asks to summarize this page, explain this site, or describe the current room/CVE page, use the provided page context and answer directly.',
    'You may explain vulnerabilities, CVEs, HTTP/HTTPS and other web security fundamentals, room summaries, site features, safe validation payloads, and defensive test inputs for authorized learning environments.',
    'If the user asks for payloads, you may provide safe, lab-oriented validation payload examples or test strings and explain what they check. Do not provide destructive malware, credential theft, stealth, persistence, or real-world weaponization guidance.',
    styleInstruction,
    contextInstruction,
  ]
    .filter(Boolean)
    .join(' ')
}

function formatAssistantReply(content, mode) {
  const text = String(content || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  if (!text) {
    return ''
  }

  if (mode !== 'brief') {
    return text
  }

  const normalized = text
    .split(/\n\s*\n/)
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .find(Boolean)
    || text.replace(/\s+/g, ' ').trim()

  const strippedLists = normalized
    .replace(/^[-*•]\s+/gm, '')
    .replace(/^\d+[.)]\s+/gm, '')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  const sentences = strippedLists.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [strippedLists]
  const briefParts = []

  const appendPart = (part) => {
    const candidate = part.replace(/\s{2,}/g, ' ').trim()
    if (!candidate) {
      return false
    }

    const nextText = [...briefParts, candidate].join(' ').replace(/\s{2,}/g, ' ').trim()
    if (nextText.length <= 360) {
      briefParts.push(candidate)
      return true
    }

    return false
  }

  for (const sentence of sentences) {
    if (appendPart(sentence)) {
      continue
    }

    if (!briefParts.length) {
      const clauses = sentence
        .split(/(?<=[,;:—-])\s+/)
        .map((segment) => segment.replace(/\s+/g, ' ').trim())
        .filter(Boolean)

      for (const clause of clauses) {
        if (appendPart(clause)) {
          continue
        }

        break
      }
    }

    if (briefParts.length) {
      break
    }
  }

  const briefText = briefParts.join(' ').replace(/\s{2,}/g, ' ').trim()
  if (briefText) {
    return briefText.endsWith('.') || briefText.endsWith('!') || briefText.endsWith('?')
      ? briefText
      : `${briefText}.`
  }

  return clampText(strippedLists, 360)
}

router.post('/message', authenticate, async (req, res, next) => {
  try {
    const message = String(req.body?.message || '').trim()
    const history = trimHistory(req.body?.history)
    const context = trimContext(req.body?.context)

    if (!message) {
      return res.status(400).json({ message: 'Message is required.' })
    }

    if (!isCybersecurityQuestion(message) && !isSiteContextQuestion(message, context)) {
      return res.json({
        role: 'assistant',
        content: OUT_OF_SCOPE_REPLY,
        restricted: true,
      })
    }

    const activeAssessmentQuestions = await getActiveAssessmentQuestions(req.user?.id, context)
    if (activeAssessmentQuestions.length && isAssessmentAnswerRequest(message, activeAssessmentQuestions)) {
      return res.json({
        role: 'assistant',
        content: ACTIVE_ASSESSMENT_REPLY,
        restricted: true,
      })
    }

    let content = ''
    try {
      const aiConfig = await getAiRuntimeConfig()
      const client = new OpenAI({
        baseURL: aiConfig.baseUrl,
        apiKey: aiConfig.apiKey,
      })

      const prompt = buildSystemPrompt(context?.mode || 'brief', context)
      const payload = await client.chat.completions.create({
        model: aiConfig.model,
        temperature: context?.mode === 'detailed' ? Math.max(aiConfig.temperature, 0.7) : Math.min(aiConfig.temperature, 0.5),
        top_p: aiConfig.topP,
        max_tokens: context?.mode === 'detailed' ? aiConfig.maxTokens : Math.min(aiConfig.maxTokens, 900),
        stream: false,
        messages: [
          {
            role: 'system',
            content: prompt,
          },
          ...history.map((entry) => ({ role: entry.role, content: entry.message })),
          { role: 'user', content: message },
        ],
      })

      const reply = payload?.choices?.[0]?.message?.content
      content = formatAssistantReply(reply, context?.mode || 'brief')
    } catch (error) {
      console.error('Chatbot API request failed:', error)
      return res.status(503).json({
        message: 'Chatbot service is unavailable. Please verify NVIDIA API configuration.',
      })
    }

    if (!content) {
      return res.status(503).json({
        message: 'Chatbot did not return content. Please retry.',
      })
    }

    return res.json({
      role: 'assistant',
      content,
      restricted: false,
    })
  } catch (error) {
    return next(error)
  }
})

export default router
