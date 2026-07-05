/**
 * [INPUT]: 无运行时依赖
 * [OUTPUT]: 对外提供供应商预设、默认设置、模型拉取计划与 provider 推断工具
 * [POS]: src 的共享配置模块，被 background.js 与 options.js 共同使用
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export const PROVIDER_PRESETS = Object.freeze({
  tokendance: Object.freeze({
    id: "tokendance",
    label: "词元跳动 TokenDance",
    shortLabel: "TokenDance",
    homepageUrl: "https://tokendance.space",
    apiKeyUrl: "https://tokendance.space",
    docsUrl: "https://tokendance.space",
    endpoint: "https://tokendance.space/gateway/v1/chat/completions",
    model: "deepseek-v4-flash",
    maxConcurrentRequests: 6,
    protocol: "openai-chat-completions",
    modelFetch: Object.freeze({
      urls: Object.freeze(["https://tokendance.space/gateway/v1/models"]),
      requiresApiKey: true,
      allowAnonymous: false,
      timeoutMs: 8000,
      cacheTtlMs: MODEL_CACHE_TTL_MS
    }),
    helpText: "还没有 TokenDance API Key？点击获取 Key，注册并创建后回到这里粘贴。API Key 只保存在你的浏览器本地。"
  }),
  custom: Object.freeze({
    id: "custom",
    label: "自定义兼容接口",
    shortLabel: "自定义",
    homepageUrl: "",
    apiKeyUrl: "",
    docsUrl: "",
    endpoint: "",
    model: "",
    maxConcurrentRequests: 3,
    protocol: "openai-chat-completions",
    modelFetch: Object.freeze({
      urls: Object.freeze([]),
      requiresApiKey: false,
      allowAnonymous: true,
      timeoutMs: 8000,
      cacheTtlMs: MODEL_CACHE_TTL_MS
    }),
    helpText: "填写 Chat Completions API 兼容接口地址，例如 https://example.com/v1/chat/completions。"
  })
});

export function getProviderOptions() {
  return [PROVIDER_PRESETS.tokendance, PROVIDER_PRESETS.openai, PROVIDER_PRESETS.custom];
}

export function getProviderPreset(providerId) {
  return PROVIDER_PRESETS[normalizeProviderId(providerId)] || PROVIDER_PRESETS.custom;
}

export function normalizeProviderId(value) {
  return Object.prototype.hasOwnProperty.call(PROVIDER_PRESETS, value) ? value : "custom";
}

export function inferProviderFromEndpoint(endpoint) {
  const value = String(endpoint || "").trim();
  if (value.includes("tokendance.space/gateway")) {
    return "tokendance";
  }

  if (value.includes("api.openai.com")) {
    return "openai";
  }

  return "custom";
}

export function createDefaultSettings() {
  const preset = PROVIDER_PRESETS.tokendance;
  return {
    provider: preset.id,
    endpoint: preset.endpoint,
    model: preset.model,
    apiKey: "",
    maxConcurrentRequests: preset.maxConcurrentRequests,
    sourceLanguage: "auto",
    targetLanguage: "Chinese (Simplified)",
    customInstruction: "",
    autoSelectionButton: true,
    models: [],
    modelsCache: null,
    sitePreferences: {}
  };
}

export function buildModelsUrl(endpoint) {
  const url = new URL(endpoint);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith("/chat/completions")) {
    url.pathname = `${path.slice(0, -"/chat/completions".length)}/models`;
  } else if (path.endsWith("/responses")) {
    url.pathname = `${path.slice(0, -"/responses".length)}/models`;
  } else if (path.endsWith("/models")) {
    url.pathname = path;
  } else {
    url.pathname = `${path}/models`;
  }

  url.search = "";
  url.hash = "";
  return url.toString();
}

export function buildModelFetchPlan(settings) {
  const provider = getProviderPreset(settings.provider || inferProviderFromEndpoint(settings.endpoint));
  const modelFetch = provider.modelFetch || PROVIDER_PRESETS.custom.modelFetch;
  const urls = [];

  if (modelFetch.urls?.length) {
    urls.push(...modelFetch.urls);
  } else if (settings.endpoint) {
    urls.push(buildModelsUrl(settings.endpoint));
  }

  if (provider.id === "custom" && settings.endpoint) {
    const derivedUrl = buildModelsUrl(settings.endpoint);
    if (!urls.includes(derivedUrl)) {
      urls.unshift(derivedUrl);
    }
  }

  return {
    providerId: provider.id,
    urls: [...new Set(urls)],
    requiresApiKey: Boolean(modelFetch.requiresApiKey),
    allowAnonymous: modelFetch.allowAnonymous !== false,
    timeoutMs: modelFetch.timeoutMs || 8000,
    cacheTtlMs: modelFetch.cacheTtlMs || MODEL_CACHE_TTL_MS
  };
}

export function getModelsCacheKey(settings) {
  const provider = settings.provider || inferProviderFromEndpoint(settings.endpoint);
  return `${normalizeProviderId(provider)}::${String(settings.endpoint || "").trim()}`;
}

export function isModelsCacheFresh(cache, settings, now = Date.now()) {
  if (!cache || !Array.isArray(cache.models) || cache.models.length === 0) {
    return false;
  }

  const plan = buildModelFetchPlan(settings);
  return cache.key === getModelsCacheKey(settings) &&
    now - Number(cache.fetchedAt || 0) < plan.cacheTtlMs;
}
