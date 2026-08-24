const CONFIG_KEY = 'incognitrix_platform_config'

export const DEFAULT_PLATFORM_CONFIG = {
  routes: {
    dashboard: true,
    learningPaths: true,
    practiceLabs: true,
    upcomingCtf: true,
    profile: true,
  },
  features: {
    labRooms: true,
    featuredPath: true,
    newMissionButton: true,
    navbarSearch: true,
    navbarNotifications: true,
    navbarSettings: true,
    publicRegistration: true,
    registrationDynamicMin: 23,
    registrationDynamicMax: 30,
    controlledOutage: {
      active: false,
    },
  },
  ai: {
    model: 'moonshotai/kimi-k2-thinking',
    availableModels: [
      {
        id: 'moonshotai/kimi-k2-thinking',
        label: 'Kimi K2 Thinking',
        provider: 'NVIDIA',
      },
      {
        id: 'openai/gpt-oss-20b',
        label: 'GPT OSS 20B',
        provider: 'NVIDIA',
      },
      {
        id: 'openai/gpt-oss-120b',
        label: 'GPT OSS 120B',
        provider: 'NVIDIA',
      },
      {
        id: 'deepseek-ai/deepseek-v4-flash',
        label: 'DeepSeek V4 Flash',
        provider: 'NVIDIA',
      },
      {
        id: 'deepseek-ai/deepseek-v4-pro',
        label: 'DeepSeek V4 Pro',
        provider: 'NVIDIA',
      },
      {
        id: 'qwen/qwen3-coder-480b-a35b-instruct',
        label: 'Qwen3 Coder 480B A35B Instruct',
        provider: 'NVIDIA',
      },
      {
        id: 'qwen/qwen3-next-80b-a3b-thinking',
        label: 'Qwen3 Next 80B A3B Thinking',
        provider: 'NVIDIA',
      },
      {
        id: 'qwen/qwq-32b',
        label: 'QwQ 32B',
        provider: 'NVIDIA',
      },
      {
        id: 'meta/llama-3.3-70b-instruct',
        label: 'Llama 3.3 70B Instruct',
        provider: 'NVIDIA',
      },
      {
        id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        label: 'Llama 3.3 Nemotron Super 49B v1.5',
        provider: 'NVIDIA',
      },
      {
        id: 'nvidia/nemotron-3-super-120b-a12b',
        label: 'Nemotron 3 Super 120B A12B',
        provider: 'NVIDIA',
      },
      {
        id: 'mistralai/mistral-nemotron',
        label: 'Mistral Nemotron',
        provider: 'NVIDIA',
      },
      {
        id: 'z-ai/glm5.1',
        label: 'GLM 5.1',
        provider: 'NVIDIA',
      },
    ],
  },
  api: {
    ai: {
      baseUrl: '',
      apiKeyConfigured: false,
      temperature: '',
      topP: '',
      maxTokens: '',
    },
    ctftime: {
      enabled: true,
      baseUrl: 'https://ctftime.org/api/v1',
      userAgent: 'Minerva-Academy/1.0 upcoming event sync',
      limit: 100,
      horizonDays: 365,
    },
    publicApi: {
      keysConfigured: false,
      keyCount: 0,
    },
  },
}

function mergeConfig(input) {
  return {
    routes: {
      ...DEFAULT_PLATFORM_CONFIG.routes,
      ...(input?.routes ?? {}),
    },
    features: {
      ...DEFAULT_PLATFORM_CONFIG.features,
      ...(input?.features ?? {}),
    },
    ai: {
      ...DEFAULT_PLATFORM_CONFIG.ai,
      ...(input?.ai ?? {}),
      availableModels: Array.isArray(input?.ai?.availableModels)
        ? input.ai.availableModels
        : DEFAULT_PLATFORM_CONFIG.ai.availableModels,
    },
    api: {
      ...DEFAULT_PLATFORM_CONFIG.api,
      ...(input?.api ?? {}),
      ai: {
        ...DEFAULT_PLATFORM_CONFIG.api.ai,
        ...(input?.api?.ai ?? {}),
      },
      ctftime: {
        ...DEFAULT_PLATFORM_CONFIG.api.ctftime,
        ...(input?.api?.ctftime ?? {}),
      },
      publicApi: {
        ...DEFAULT_PLATFORM_CONFIG.api.publicApi,
        ...(input?.api?.publicApi ?? {}),
      },
    },
  }
}

export function loadPlatformConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (!raw) {
      return DEFAULT_PLATFORM_CONFIG
    }

    const parsed = JSON.parse(raw)
    return mergeConfig(parsed)
  } catch {
    return DEFAULT_PLATFORM_CONFIG
  }
}

export function savePlatformConfig(nextConfig) {
  const merged = mergeConfig(nextConfig)
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged))
  return merged
}

export function resetPlatformConfig() {
  localStorage.removeItem(CONFIG_KEY)
  return DEFAULT_PLATFORM_CONFIG
}
