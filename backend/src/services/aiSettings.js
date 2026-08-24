import { env } from '../config/env.js'
import { pool } from '../db/pool.js'

const curatedAiModels = [
  {
    id: 'moonshotai/kimi-k2-thinking',
    label: 'Kimi K2 Thinking',
    provider: 'NVIDIA',
    description: 'Default reasoning model for room generation, evaluation, and platform assistants.',
  },
  {
    id: 'openai/gpt-oss-20b',
    label: 'GPT OSS 20B',
    provider: 'NVIDIA',
    description: 'OpenAI open-weight model available through NVIDIA NIM chat completions.',
  },
  {
    id: 'openai/gpt-oss-120b',
    label: 'GPT OSS 120B',
    provider: 'NVIDIA',
    description: 'Larger OpenAI open-weight model for deeper reasoning workloads.',
  },
  {
    id: 'deepseek-ai/deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    provider: 'NVIDIA',
    description: 'Fast DeepSeek chat model for responsive assistant tasks.',
  },
  {
    id: 'deepseek-ai/deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    provider: 'NVIDIA',
    description: 'Reasoning-focused option for detailed analysis and evaluation.',
  },
  {
    id: 'qwen/qwen3-coder-480b-a35b-instruct',
    label: 'Qwen3 Coder 480B A35B Instruct',
    provider: 'NVIDIA',
    description: 'Large coding and instruction model for technical tasks.',
  },
  {
    id: 'qwen/qwen3-next-80b-a3b-thinking',
    label: 'Qwen3 Next 80B A3B Thinking',
    provider: 'NVIDIA',
    description: 'Thinking-oriented Qwen model for analysis and multi-step reasoning.',
  },
  {
    id: 'qwen/qwq-32b',
    label: 'QwQ 32B',
    provider: 'NVIDIA',
    description: 'Compact reasoning model for structured assessment and feedback.',
  },
  {
    id: 'meta/llama-3.3-70b-instruct',
    label: 'Llama 3.3 70B Instruct',
    provider: 'NVIDIA',
    description: 'General instruction model for stable Q&A and content operations.',
  },
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    label: 'Llama 3.3 Nemotron Super 49B v1.5',
    provider: 'NVIDIA',
    description: 'NVIDIA Nemotron model for general reasoning and assistant workflows.',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    label: 'Nemotron 3 Super 120B A12B',
    provider: 'NVIDIA',
    description: 'High-capacity NVIDIA model for complex reasoning tasks.',
  },
  {
    id: 'mistralai/mistral-nemotron',
    label: 'Mistral Nemotron',
    provider: 'NVIDIA',
    description: 'Mistral/NVIDIA model option for general chat and instruction following.',
  },
  {
    id: 'z-ai/glm5.1',
    label: 'GLM 5.1',
    provider: 'NVIDIA',
    description: 'General chat model available through NVIDIA NIM.',
  },
]

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
