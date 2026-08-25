import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

const curatedAiModels = [
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B',
    provider: 'NVIDIA',
    description: 'Default model for content generation, evaluation and the platform assistants.',
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'GPT OSS 20B',
    provider: 'NVIDIA',
    description: 'Smaller and faster sibling of GPT OSS 120B; good for responsive chat.',
  },
  {
    id: 'moonshotai/kimi-k3',
    label: 'Kimi K3',
    provider: 'NVIDIA',
    description: 'Reasoning-oriented model. Successor to Kimi K2 Thinking; slower to respond.',
  },
  {
    id: 'mistralai/mistral-nemotron',
    label: 'Mistral Nemotron',
    provider: 'NVIDIA',
    description: 'Fastest of the curated options; general chat and instruction following.',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    label: 'Nemotron 3 Super 120B A12B',
    provider: 'NVIDIA',
    description: 'High-capacity NVIDIA model for complex reasoning tasks.',
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    label: 'Llama 3.3 Nemotron Super 49B v1.5',
    provider: 'NVIDIA',
    description: 'NVIDIA Nemotron model for general reasoning and assistant workflows.',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B Instruct',
    provider: 'NVIDIA',
    description: 'General instruction model for stable Q&A and content operations.',
  },
]

// Retired upstream and removed from the picker on 2026-08-25 after the provider
// began returning 410 Gone. Kept here so an existing saved configuration can be
// recognised and migrated rather than failing silently.
export const retiredAiModels = {
  'moonshotai/kimi-k2-thinking': 'moonshotai/kimi-k3',
  'deepseek-ai/deepseek-v4-flash': 'openai/gpt-oss-20b',
  'deepseek-ai/deepseek-v4-pro': 'openai/gpt-oss-120b',
  'qwen/qwen3-coder-480b-a35b-instruct': 'openai/gpt-oss-120b',
  'qwen/qwen3-next-80b-a3b-thinking': 'moonshotai/kimi-k3',
  'qwen/qwq-32b': 'openai/gpt-oss-20b',
  'z-ai/glm5.1': 'mistralai/mistral-nemotron',
}

const selectableAiModels = [
  ...curatedAiModels,
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    provider: 'OpenAI',
    description: 'OpenAI multimodal flagship model option.',
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    provider: 'OpenAI',
    description: 'Smaller OpenAI model option for fast assistant tasks.',
  },
  {
    id: 'openai/gpt-4.1',
    label: 'GPT-4.1',
    provider: 'OpenAI',
    description: 'OpenAI model option for deep instruction following and coding.',
  },
  {
    id: 'openai/gpt-4.1-mini',
    label: 'GPT-4.1 Mini',
    provider: 'OpenAI',
    description: 'Compact OpenAI model option for lower-latency workflows.',
  },
  {
    id: 'openai/gpt-5',
    label: 'GPT-5',
    provider: 'OpenAI',
    description: 'OpenAI advanced reasoning model option where supported by the configured gateway.',
  },
  {
    id: 'openai/gpt-5-mini',
    label: 'GPT-5 Mini',
    provider: 'OpenAI',
    description: 'OpenAI compact GPT-5 option where supported by the configured gateway.',
  },
  {
    id: 'meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    provider: 'Meta',
    description: 'Small Meta Llama instruction model option.',
  },
  {
    id: 'meta/llama-3.1-70b-instruct',
    label: 'Llama 3.1 70B Instruct',
    provider: 'Meta',
    description: 'Meta Llama model for general instruction following.',
  },
  {
    id: 'meta/llama-3.1-405b-instruct',
    label: 'Llama 3.1 405B Instruct',
    provider: 'Meta',
    description: 'Large Meta Llama model option for complex tasks.',
  },
  {
    id: 'meta/llama-3.2-11b-vision-instruct',
    label: 'Llama 3.2 11B Vision Instruct',
    provider: 'Meta',
    description: 'Meta Llama vision-capable model option.',
  },
  {
    id: 'meta/llama-3.2-90b-vision-instruct',
    label: 'Llama 3.2 90B Vision Instruct',
    provider: 'Meta',
    description: 'Larger Meta Llama vision-capable model option.',
  },
  {
    id: 'meta/llama-4-scout-17b-16e-instruct',
    label: 'Llama 4 Scout 17B 16E Instruct',
    provider: 'Meta',
    description: 'Meta Llama 4 Scout option where supported by the configured gateway.',
  },
  {
    id: 'meta/llama-4-maverick-17b-128e-instruct',
    label: 'Llama 4 Maverick 17B 128E Instruct',
    provider: 'Meta',
    description: 'Meta Llama 4 Maverick option where supported by the configured gateway.',
  },
  {
    id: 'google/gemma-2-9b-it',
    label: 'Gemma 2 9B IT',
    provider: 'Google',
    description: 'Google Gemma instruction model option.',
  },
  {
    id: 'google/gemma-2-27b-it',
    label: 'Gemma 2 27B IT',
    provider: 'Google',
    description: 'Larger Google Gemma instruction model option.',
  },
  {
    id: 'google/gemma-3-27b-it',
    label: 'Gemma 3 27B IT',
    provider: 'Google',
    description: 'Google Gemma 3 instruction model option where supported.',
  },
  {
    id: 'google/gemma-3n-e4b-it',
    label: 'Gemma 3n E4B IT',
    provider: 'Google',
    description: 'Efficient Google Gemma 3n model option where supported.',
  },
  {
    id: 'moonshotai/kimi-k2-instruct',
    label: 'Kimi K2 Instruct',
    provider: 'Kimi',
    description: 'Kimi instruction model option.',
  },
  {
    id: 'qwen/qwen2.5-7b-instruct',
    label: 'Qwen2.5 7B Instruct',
    provider: 'Qwen',
    description: 'Small Qwen instruction model option.',
  },
  {
    id: 'qwen/qwen2.5-72b-instruct',
    label: 'Qwen2.5 72B Instruct',
    provider: 'Qwen',
    description: 'Large Qwen instruction model option.',
  },
  {
    id: 'qwen/qwen2.5-coder-32b-instruct',
    label: 'Qwen2.5 Coder 32B Instruct',
    provider: 'Qwen',
    description: 'Qwen coding model option.',
  },
  {
    id: 'qwen/qwen3-32b',
    label: 'Qwen3 32B',
    provider: 'Qwen',
    description: 'Qwen3 model option for general reasoning.',
  },
  {
    id: 'qwen/qwen3-235b-a22b',
    label: 'Qwen3 235B A22B',
    provider: 'Qwen',
    description: 'High-capacity Qwen3 mixture model option where supported.',
  },
]

export const availableAiModels = curatedAiModels.some((model) => model.id === env.aiModel)
  ? curatedAiModels
  : [
      {
        id: env.aiModel,
        label: `${env.aiModel} (Environment Default)`,
        provider: 'Configured',
        description: 'Model currently configured in backend .env.',
      },
      ...curatedAiModels,
    ]

export const selectableAiModelOptions = selectableAiModels.some((model) => model.id === env.aiModel)
  ? selectableAiModels
  : [
      {
        id: env.aiModel,
        label: `${env.aiModel} (Environment Default)`,
        provider: 'Configured',
        description: 'Model currently configured in backend .env.',
      },
      ...selectableAiModels,
    ]

function parseJsonField(value, fallback = {}) {
  if (!value) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return typeof value === 'object' ? value : fallback
}

function normalizeModelId(value) {
  const model = String(value || '').trim()

  // A configuration saved before a model was retired upstream would otherwise
  // keep sending requests that the provider answers with 410 Gone.
  if (retiredAiModels[model]) {
    return retiredAiModels[model]
  }

  const allowedModels = new Set([
    env.aiModel,
    ...availableAiModels.map((item) => item.id),
    ...selectableAiModelOptions.map((item) => item.id),
  ])
  return allowedModels.has(model) ? model : env.aiModel
}

export async function getAiRuntimeConfig() {
  let selectedModel = env.aiModel
  let apiConfig = {}

  try {
    const [rows] = await pool.query('SELECT ai_json, api_json FROM platform_config WHERE id = 1 LIMIT 1')
    const aiConfig = parseJsonField(rows[0]?.ai_json, {})
    apiConfig = parseJsonField(rows[0]?.api_json, {})
    selectedModel = normalizeModelId(aiConfig.model)
  } catch {
    selectedModel = env.aiModel
    apiConfig = {}
  }

  const apiAiConfig = apiConfig?.ai || {}

  return {
    baseUrl: String(apiAiConfig.baseUrl || env.aiBaseUrl),
    apiKey: String(apiAiConfig.apiKey || env.nvidiaApiKey),
    model: selectedModel,
    temperature: apiAiConfig.temperature === '' || apiAiConfig.temperature === undefined
      ? env.aiTemperature
      : Number(apiAiConfig.temperature),
    topP: apiAiConfig.topP === '' || apiAiConfig.topP === undefined
      ? env.aiTopP
      : Number(apiAiConfig.topP),
    maxTokens: apiAiConfig.maxTokens === '' || apiAiConfig.maxTokens === undefined
      ? env.aiMaxTokens
      : Number(apiAiConfig.maxTokens),
    availableModels: availableAiModels,
    selectableModels: selectableAiModelOptions,
  }
}

export function buildAiPlatformConfig(input = {}) {
  return {
    model: normalizeModelId(input.model),
    availableModels: availableAiModels,
    selectableModels: selectableAiModelOptions,
  }
}
