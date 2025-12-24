import dotenv from 'dotenv';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI, OpenAIProviderSettings } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGroq } from '@ai-sdk/groq';
import configJson from '../config.json';
import { logInfo, logError, logDebug, logWarning } from './logging';
// Load environment variables
dotenv.config();

// Types
export type LLMProvider = 'openai' | 'gemini' | 'vertex' | 'anthropic' | 'groq';
export type ToolName = keyof typeof configJson.models.gemini.tools;

// Type definitions for our config structure
type EnvConfig = typeof configJson.env;

interface ProviderConfig {
  createClient: string;
  clientConfig?: Record<string, any>;
}

// Environment setup
const env: EnvConfig = { ...configJson.env };
(Object.keys(env) as (keyof EnvConfig)[]).forEach(key => {
  if (process.env[key]) {
    env[key] = process.env[key] || env[key];
  }
});

// Setup proxy if present
if (env.https_proxy) {
  try {
    const proxyUrl = new URL(env.https_proxy).toString();
    const dispatcher = new ProxyAgent({ uri: proxyUrl });
    setGlobalDispatcher(dispatcher);
  } catch (error) {
    logError('Failed to set proxy:', { error });
  }
}

// Export environment variables
export const OPENAI_BASE_URL = env.OPENAI_BASE_URL;
export const GEMINI_API_KEY = env.GEMINI_API_KEY;
export const OPENAI_API_KEY = env.OPENAI_API_KEY;
export const ANTHROPIC_API_KEY = (env as any).ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
export const GROQ_API_KEY = (env as any).GROQ_API_KEY || process.env.GROQ_API_KEY;
export const JINA_API_KEY = env.JINA_API_KEY;
export const BRAVE_API_KEY = env.BRAVE_API_KEY;
export const SERPER_API_KEY = env.SERPER_API_KEY;
export const GOOGLE_RAPIDAPI_KEY = env.GOOGLE_RAPIDAPI_KEY;
export const SEARCH_PROVIDER = process.env.SEARCH_PROVIDER || configJson.defaults.search_provider;
export const STEP_SLEEP = configJson.defaults.step_sleep;

// Determine LLM provider
export const LLM_PROVIDER: LLMProvider = (() => {
  const provider = process.env.LLM_PROVIDER || configJson.defaults.llm_provider;
  if (!isValidProvider(provider)) {
    throw new Error(`Invalid LLM provider: ${provider}`);
  }
  return provider;
})();

function isValidProvider(provider: string): provider is LLMProvider {
  return provider === 'openai' || provider === 'gemini' || provider === 'vertex' || provider === 'anthropic' || provider === 'groq';
}

interface ToolConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

interface ToolOverrides {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Map provider to config key (vertex uses gemini config)
function getProviderConfigKey(provider: LLMProvider): 'gemini' | 'openai' | 'anthropic' | 'groq' {
  if (provider === 'vertex') return 'gemini';
  return provider;
}

// Get tool configuration
export function getToolConfig(toolName: ToolName): ToolConfig {
  const configKey = getProviderConfigKey(LLM_PROVIDER);
  const providerConfig = configJson.models[configKey];
  const defaultConfig = providerConfig.default;
  const toolOverrides = providerConfig.tools[toolName] as ToolOverrides;

  return {
    model: toolOverrides.model ?? defaultConfig.model,
    temperature: toolOverrides.temperature ?? defaultConfig.temperature,
    maxTokens: toolOverrides.maxTokens ?? defaultConfig.maxTokens
  };
}

export function getMaxTokens(toolName: ToolName): number {
  return getToolConfig(toolName).maxTokens;
}

// Custom error class for provider configuration errors
export class ProviderConfigError extends Error {
  public provider: string;
  public model?: string;
  public code: string;

  constructor(message: string, provider: string, code: string, model?: string) {
    super(message);
    this.name = 'ProviderConfigError';
    this.provider = provider;
    this.model = model;
    this.code = code;
  }

  toJSON() {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      provider: this.provider,
      model: this.model,
      availableProviders: ['gemini', 'openai', 'anthropic', 'groq', 'vertex'],
    };
  }
}

// Get model instance
// modelOverride: optional model name to use instead of the default (e.g., "gemini-2.5-flash", "gemini-2.5-pro")
// providerOverride: optional provider to use instead of the default (e.g., "anthropic", "groq")
export function getModel(toolName: ToolName, modelOverride?: string, providerOverride?: LLMProvider) {
  const provider = providerOverride || LLM_PROVIDER;
  const configKey = getProviderConfigKey(provider);
  const providerConfig = (configJson.providers as Record<string, ProviderConfig | undefined>)[provider];

  // Get default model for the provider
  const defaultModel = configJson.models[configKey].default.model;
  const modelName = modelOverride || defaultModel;

  if (providerOverride || modelOverride) {
    logInfo(`Using override - provider: ${provider}, model: ${modelName}`);
  }

  if (provider === 'openai') {
    if (!OPENAI_API_KEY) {
      throw new ProviderConfigError(
        `OPENAI_API_KEY environment variable is not set. Please set it to use the OpenAI provider with model "${modelName}".`,
        'openai',
        'MISSING_API_KEY',
        modelName
      );
    }

    const opt: OpenAIProviderSettings = {
      apiKey: OPENAI_API_KEY,
      compatibility: providerConfig?.clientConfig?.compatibility
    };

    if (OPENAI_BASE_URL) {
      opt.baseURL = OPENAI_BASE_URL;
    }

    return createOpenAI(opt)(modelName);
  }

  if (provider === 'vertex') {
    const createVertex = require('@ai-sdk/google-vertex').createVertex;
    return createVertex({ project: process.env.GCLOUD_PROJECT, ...providerConfig?.clientConfig })(modelName);
  }

  if (provider === 'anthropic') {
    if (!ANTHROPIC_API_KEY) {
      throw new ProviderConfigError(
        `ANTHROPIC_API_KEY environment variable is not set. Please set it to use the Anthropic provider with model "${modelName}".`,
        'anthropic',
        'MISSING_API_KEY',
        modelName
      );
    }
    return createAnthropic({ apiKey: ANTHROPIC_API_KEY })(modelName);
  }

  if (provider === 'groq') {
    if (!GROQ_API_KEY) {
      throw new ProviderConfigError(
        `GROQ_API_KEY environment variable is not set. Please set it to use the Groq provider with model "${modelName}".`,
        'groq',
        'MISSING_API_KEY',
        modelName
      );
    }
    return createGroq({ apiKey: GROQ_API_KEY })(modelName);
  }

  // Default: gemini
  if (!GEMINI_API_KEY) {
    throw new ProviderConfigError(
      `GEMINI_API_KEY environment variable is not set. Please set it to use the Gemini provider with model "${modelName}".`,
      'gemini',
      'MISSING_API_KEY',
      modelName
    );
  }

  return createGoogleGenerativeAI({ apiKey: GEMINI_API_KEY })(modelName);
}

// Validate required environment variables
if (LLM_PROVIDER === 'gemini' && !GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not found");
if (LLM_PROVIDER === 'openai' && !OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not found");
if (LLM_PROVIDER === 'anthropic' && !ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not found");
if (LLM_PROVIDER === 'groq' && !GROQ_API_KEY) throw new Error("GROQ_API_KEY not found");
if (!JINA_API_KEY) throw new Error("JINA_API_KEY not found");

// Log all configurations
const configKey = getProviderConfigKey(LLM_PROVIDER);
const configSummary = {
  provider: {
    name: LLM_PROVIDER,
    model: configJson.models[configKey].default.model,
    ...(LLM_PROVIDER === 'openai' && { baseUrl: OPENAI_BASE_URL })
  },
  search: {
    provider: SEARCH_PROVIDER
  },
  tools: Object.fromEntries(
    Object.keys(configJson.models[configKey].tools).map(name => [
      name,
      getToolConfig(name as ToolName)
    ])
  ),
  defaults: {
    stepSleep: STEP_SLEEP
  }
};

logInfo('Configuration Summary:', { summary: configSummary });
