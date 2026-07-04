import {
  buildModelFetchPlan,
  createDefaultSettings,
  getModelsCacheKey,
  inferProviderFromEndpoint,
  isModelsCacheFresh,
  normalizeProviderId
} from "./providers.js";

const MENU_ID = "ai-translator-v2-translate-selection";

const DEFAULT_SETTINGS = Object.freeze(createDefaultSettings());

const MIN_CONCURRENT_REQUESTS = 1;
const MAX_CONCURRENT_REQUESTS = 10;
const RATE_LIMIT_RETRY_DELAYS = [900, 1800, 3500, 6500];

let activeApiRequests = 0;
let apiQueueLimit = DEFAULT_SETTINGS.maxConcurrentRequests;
let detectedApiQueueLimit = 0;
let apiQueueLimitKey = "";

// ============================================================
// 公平队列：每个标签页一条通道，轮转出队
// 后开的页面不再被先开的页面饿死
// ============================================================
const apiLanes = new Map();
let laneCursor = 0;

// ============================================================
// 译文缓存：hash(文本+配置) → 译文，LRU 落盘 storage.local
// 还原 / 刷新 / 重开页面时直接命中，零 API 成本
// ============================================================
const CACHE_STORAGE_KEY = "translationCacheV1";
const CACHE_MAX_ENTRIES = 2000;
const CACHE_PRUNE_TO = 1600;
let translationCache = null;
let cacheSaveTimer = 0;

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultSettings();
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: MENU_ID,
    title: "用花茶翻译器翻译选中文本",
    contexts: ["selection"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab?.id) {
    return;
  }

  sendMessageToTab(tab, {
    type: "AI_TRANSLATOR_CONTEXT_TRANSLATE",
    text: info.selectionText || ""
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  runMessageHandler(message, sender)
    .then((payload) => sendResponse(payload))
    .catch((error) => sendResponse({ ok: false, error: toReadableError(error) }));

  return true;
});

async function runMessageHandler(message, sender) {
  const laneKey = sender?.tab?.id ? `tab-${sender.tab.id}` : "ui";

  switch (message?.type) {
    case "AI_TRANSLATOR_GET_SETTINGS": {
      return { ok: true, settings: await getSettings() };
    }

    case "AI_TRANSLATOR_SAVE_SETTINGS": {
      const settings = sanitizeSettings(message.settings || {});
      await chrome.storage.local.set(settings);
      return { ok: true, settings: await getSettings() };
    }

    case "AI_TRANSLATOR_FETCH_MODELS": {
      const settings = sanitizeSettings(message.settings || await getSettings());
      const result = await fetchModels(settings, { force: Boolean(message.force) });
      await chrome.storage.local.set({ ...settings, models: result.models, modelsCache: result.modelsCache });
      return { ok: true, models: result.models, settings: await getSettings(), cached: result.cached };
    }

    case "AI_TRANSLATOR_TEST_CONNECTION": {
      const settings = sanitizeSettings(message.settings || await getSettings());
      const result = await translateText({
        text: "Hello, this is a quick translation test.",
        sourceLanguage: "English",
        targetLanguage: settings.targetLanguage,
        settings
      });

      return { ok: true, translation: result.translation, usage: result.usage || null };
    }

    case "AI_TRANSLATOR_TRANSLATE_TEXT": {
      const settings = await getSettings();
      const result = await translateText({
        text: message.text,
        sourceLanguage: message.sourceLanguage || settings.sourceLanguage,
        targetLanguage: message.targetLanguage || settings.targetLanguage,
        settings,
        laneKey
      });

      return { ok: true, translation: result.translation, usage: result.usage || null };
    }

    case "AI_TRANSLATOR_TRANSLATE_BATCH": {
      const settings = await getSettings();
      const result = await translateBatch({
        items: message.items,
        sourceLanguage: message.sourceLanguage || settings.sourceLanguage,
        targetLanguage: message.targetLanguage || settings.targetLanguage,
        settings,
        laneKey
      });

      return { ok: true, items: result.items, usage: result.usage || null };
    }

    case "AI_TRANSLATOR_SAVE_SITE_PREFERENCE": {
      const settings = await getSettings();
      const hostname = cleanHostname(message.hostname);
      const preference = cleanSitePreference(message.preference);
      if (!hostname) {
        throw new Error("无法识别当前网站。");
      }

      const sitePreferences = { ...settings.sitePreferences, [hostname]: preference };
      await chrome.storage.local.set({ sitePreferences });
      return { ok: true, preference, settings: await getSettings() };
    }

    default:
      return { ok: false, error: "未知消息类型。" };
  }
}

async function ensureDefaultSettings() {
  const stored = await chrome.storage.local.get(null);
  const provider = stored.provider || inferProviderFromEndpoint(stored.endpoint || DEFAULT_SETTINGS.endpoint);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...stored, provider });
}

async function sendMessageToTab(tab, message) {
  const first = await trySendMessageToTab(tab.id, message);
  if (first.ok || !canInjectIntoTab(tab) || !isMissingContentScriptError(first.error)) {
    return first;
  }

  const injected = await injectContentScript(tab.id);
  if (!injected.ok) {
    return injected;
  }

  return trySendMessageToTab(tab.id, message);
}

function trySendMessageToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "" });
        return;
      }

      resolve(response || { ok: true });
    });
  });
}

function injectContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId },
        files: ["src/content.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message || "" });
          return;
        }

        resolve({ ok: true });
      }
    );
  });
}

function canInjectIntoTab(tab) {
  return Boolean(tab?.id && /^https?:\/\//i.test(tab.url || ""));
}

function isMissingContentScriptError(error) {
  return /Receiving end does not exist|Could not establish connection/i.test(error || "");
}

async function getSettings() {
  const stored = await chrome.storage.local.get(null);
  const provider = stored.provider || inferProviderFromEndpoint(stored.endpoint || DEFAULT_SETTINGS.endpoint);
  return sanitizeSettings({ ...DEFAULT_SETTINGS, ...stored, provider });
}

function sanitizeSettings(settings) {
  return {
    provider: normalizeProviderId(settings.provider),
    endpoint: cleanString(settings.endpoint) || DEFAULT_SETTINGS.endpoint,
    model: cleanString(settings.model) || DEFAULT_SETTINGS.model,
    apiKey: cleanString(settings.apiKey),
    maxConcurrentRequests: cleanConcurrentRequests(settings.maxConcurrentRequests),
    sourceLanguage: cleanString(settings.sourceLanguage) || DEFAULT_SETTINGS.sourceLanguage,
    targetLanguage: cleanString(settings.targetLanguage) || DEFAULT_SETTINGS.targetLanguage,
    customInstruction: cleanString(settings.customInstruction),
    autoSelectionButton: settings.autoSelectionButton !== false,
    models: sanitizeModels(settings.models),
    modelsCache: sanitizeModelsCache(settings.modelsCache),
    sitePreferences: sanitizeSitePreferences(settings.sitePreferences)
  };
}

function sanitizeModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }

  return models
    .map((model) => ({
      id: cleanString(model?.id),
      name: cleanString(model?.name) || cleanString(model?.id),
      contextLength: Number(model?.contextLength || model?.context_length || 0) || 0,
      supportedProtocols: Array.isArray(model?.supportedProtocols)
        ? model.supportedProtocols.map(cleanString).filter(Boolean)
        : Array.isArray(model?.supported_protocols)
          ? model.supported_protocols.map(cleanString).filter(Boolean)
          : []
    }))
    .filter((model) => model.id)
    .slice(0, 500);
}

function sanitizeModelsCache(cache) {
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) {
    return null;
  }

  const models = sanitizeModels(cache.models);
  if (models.length === 0) {
    return null;
  }

  return {
    key: cleanString(cache.key),
    provider: normalizeProviderId(cache.provider),
    endpoint: cleanString(cache.endpoint),
    fetchedAt: Number(cache.fetchedAt) || 0,
    models
  };
}

function sanitizeSitePreferences(preferences) {
  if (!preferences || typeof preferences !== "object" || Array.isArray(preferences)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(preferences)
      .map(([hostname, preference]) => [cleanHostname(hostname), cleanSitePreference(preference)])
      .filter(([hostname]) => hostname)
  );
}

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanConcurrentRequests(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SETTINGS.maxConcurrentRequests;
  }

  return Math.min(Math.max(parsed, MIN_CONCURRENT_REQUESTS), MAX_CONCURRENT_REQUESTS);
}

function cleanHostname(value) {
  return cleanString(value).toLowerCase().replace(/^www\./, "");
}

function cleanSitePreference(value) {
  return ["manual", "always", "never"].includes(value) ? value : "manual";
}

async function fetchModels(settings, { force = false } = {}) {
  if (!settings.endpoint) {
    throw new Error("请先填写 API 地址。");
  }

  if (!force && isModelsCacheFresh(settings.modelsCache, settings)) {
    return {
      models: settings.modelsCache.models,
      modelsCache: settings.modelsCache,
      cached: true
    };
  }

  const plan = buildModelFetchPlan(settings);
  if (plan.urls.length === 0) {
    throw new Error("当前服务商没有可用的模型列表入口，请手动填写模型名称。");
  }

  if (plan.requiresApiKey && !settings.apiKey) {
    throw new Error("请先填写 API Key，或直接使用推荐模型。");
  }

  const attempts = buildModelFetchAttempts(settings, plan);
  const errors = [];

  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeout(attempt.url, {
        method: "GET",
        headers: attempt.headers
      }, plan.timeoutMs);

      const payload = await safeJson(response);
      if (!response.ok) {
        throw new Error(extractApiError(payload) || `状态码 ${response.status}`);
      }

      const rawModels = Array.isArray(payload?.data)
        ? payload.data
        : Array.isArray(payload?.models)
          ? payload.models
          : [];

      const models = rawModels
        .map(normalizeModel)
        .filter((model) => model.id && supportsChatCompletions(model));

      if (models.length > 0) {
        return {
          models,
          modelsCache: {
            key: getModelsCacheKey(settings),
            provider: settings.provider,
            endpoint: settings.endpoint,
            fetchedAt: Date.now(),
            models
          },
          cached: false
        };
      }

      throw new Error("响应里没有可用的聊天模型");
    } catch (error) {
      errors.push(`${attempt.url}：${toReadableError(error)}`);
    }
  }

  throw new Error(`拉取模型失败。已尝试 ${attempts.length} 个入口：${errors.join("；")}`);
}

function buildModelFetchAttempts(settings, plan) {
  const headers = buildHeaders(settings);
  const attempts = plan.urls.map((url) => ({ url, headers }));

  if (!settings.apiKey && plan.allowAnonymous) {
    return attempts;
  }

  return attempts;
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`请求超过 ${Math.round(timeoutMs / 1000)} 秒未响应`);
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function buildHeaders(settings) {
  const headers = {
    "Content-Type": "application/json"
  };

  if (settings.apiKey) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }

  return headers;
}

function normalizeModel(model) {
  const supportedProtocols = Array.isArray(model?.supported_protocols)
    ? model.supported_protocols
    : Array.isArray(model?.supportedProtocols)
      ? model.supportedProtocols
      : [];

  return {
    id: cleanString(model?.id || model?.model),
    name: cleanString(model?.name || model?.id || model?.model),
    contextLength: Number(model?.context_length || model?.contextLength || 0) || 0,
    supportedProtocols: supportedProtocols.map(cleanString).filter(Boolean)
  };
}

function supportsChatCompletions(model) {
  return model.supportedProtocols.length === 0 ||
    model.supportedProtocols.includes("openai:chat-completions");
}

function runWithApiQueue(task, settings, laneKey = "ui") {
  const nextKey = getApiQueueLimitKey(settings);
  if (nextKey !== apiQueueLimitKey) {
    apiQueueLimitKey = nextKey;
    detectedApiQueueLimit = 0;
  }

  const configuredLimit = cleanConcurrentRequests(settings.maxConcurrentRequests);
  apiQueueLimit = detectedApiQueueLimit
    ? Math.min(configuredLimit, detectedApiQueueLimit)
    : configuredLimit;

  return new Promise((resolve, reject) => {
    const lane = apiLanes.get(laneKey) || [];
    lane.push({ task, resolve, reject });
    apiLanes.set(laneKey, lane);
    drainApiQueue();
  });
}

function drainApiQueue() {
  while (activeApiRequests < apiQueueLimit) {
    const job = takeNextApiJob();
    if (!job) {
      return;
    }

    activeApiRequests += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        activeApiRequests -= 1;
        drainApiQueue();
      });
  }
}

// 轮转出队：每次从下一条通道取任务，标签页之间天然公平。
// 不变量：apiLanes 里的通道永远非空（取空即删）。
function takeNextApiJob() {
  const keys = [...apiLanes.keys()];
  if (keys.length === 0) {
    return null;
  }

  const key = keys[laneCursor % keys.length];
  laneCursor = (laneCursor + 1) % keys.length;

  const lane = apiLanes.get(key);
  const job = lane.shift();
  if (lane.length === 0) {
    apiLanes.delete(key);
  }

  return job;
}

function getApiQueueLimitKey(settings) {
  try {
    const url = new URL(settings.endpoint);
    return `${url.origin}${url.pathname}`;
  } catch {
    return settings.endpoint || "";
  }
}

async function requestChatCompletion(settings, body, laneKey) {
  return runWithApiQueue(
    () => requestChatCompletionWithRetry(settings, body),
    settings,
    laneKey
  );
}

async function requestChatCompletionWithRetry(settings, body) {
  let lastError = "";

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRY_DELAYS.length; attempt += 1) {
    const response = await fetch(settings.endpoint, {
      method: "POST",
      headers: buildHeaders(settings),
      body: JSON.stringify(body)
    });

    const payload = await safeJson(response);
    if (response.ok) {
      const content = extractTranslation(payload);
      if (isConcurrencyLimitError(content)) {
        lastError = content;
      } else {
        return payload;
      }
    } else {
      lastError = extractApiError(payload) || `请求失败，状态码 ${response.status}。`;
    }

    applyDetectedConcurrentLimit(lastError);
    if (!isRetryableApiError(lastError, response.status) || attempt >= RATE_LIMIT_RETRY_DELAYS.length) {
      break;
    }

    await sleep(getRetryDelay(response, attempt));
  }

  throw new Error(lastError || "接口暂时不可用。");
}

function applyDetectedConcurrentLimit(message) {
  const match = String(message || "").match(/并发(?:上限|限制)?\(?(\d{1,2})\)?/);
  if (!match) {
    return;
  }

  const detected = cleanConcurrentRequests(match[1]);
  detectedApiQueueLimit = detectedApiQueueLimit
    ? Math.min(detectedApiQueueLimit, detected)
    : detected;
  if (detected < apiQueueLimit) {
    apiQueueLimit = detected;
  }
}

function isRetryableApiError(message, status) {
  return status === 429 ||
    status === 503 ||
    /rate.?limit|too many requests|并发|频率|限流|稍后|繁忙/i.test(message || "");
}

function isConcurrencyLimitError(message) {
  const value = cleanString(message);
  return /(?:达到|已达到|超过|超出).{0,8}并发(?:上限|限制)?\(?\d{0,2}\)?/.test(value) ||
    /并发(?:上限|限制)\(?\d{0,2}\)?/.test(value) ||
    /rate.?limit|too many requests|限流|请求过于频繁|服务繁忙|稍后再试/i.test(value);
}

function getRetryDelay(response, attempt) {
  const retryAfter = Number.parseFloat(response.headers.get("retry-after") || "");
  if (Number.isFinite(retryAfter) && retryAfter > 0) {
    return Math.min(retryAfter * 1000, 12000);
  }

  return RATE_LIMIT_RETRY_DELAYS[attempt] || 6500;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function translateText({ text, sourceLanguage, targetLanguage, settings, laneKey }) {
  const content = cleanString(text);
  if (!content) {
    throw new Error("没有需要翻译的文本。");
  }

  const cacheKey = translationCacheKey(content, settings, sourceLanguage, targetLanguage);
  const cached = await readCachedTranslation(cacheKey);
  if (cached) {
    return { translation: cached, usage: null, cached: true };
  }

  if (!settings.apiKey) {
    throw new Error("请先在扩展设置里填写 API Key。");
  }

  if (!settings.endpoint) {
    throw new Error("请先在扩展设置里填写 API 地址。");
  }

  const payload = await requestChatCompletion(settings, {
    model: settings.model,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: [
          "You are a precise translation engine.",
          "Return only the translated text.",
          "Preserve URLs, code, markdown, numbers, names, and paragraph breaks."
        ].join(" ")
      },
      {
        role: "user",
        content: buildPrompt({
          text: content,
          sourceLanguage,
          targetLanguage,
          customInstruction: settings.customInstruction
        })
      }
    ]
  }, laneKey);

  const translation = extractTranslation(payload);
  if (!translation) {
    throw new Error("接口响应里没有找到翻译文本。");
  }

  if (isConcurrencyLimitError(translation)) {
    throw new Error(translation);
  }

  await writeCachedTranslation(cacheKey, translation);

  return {
    translation,
    usage: payload.usage
  };
}

async function translateBatch({ items, sourceLanguage, targetLanguage, settings, laneKey }) {
  const cleanItems = Array.isArray(items)
    ? items
      .map((item, index) => ({
        id: cleanString(item?.id || String(index)),
        text: cleanString(item?.text)
      }))
      .filter((item) => item.text)
      .slice(0, 24)
    : [];

  if (cleanItems.length === 0) {
    throw new Error("没有需要翻译的文本。");
  }

  // 先查缓存，只把未命中的交给 API——重复文本与还原重开在这里归零成本
  const cachedResults = [];
  const pendingItems = [];
  for (const item of cleanItems) {
    const cacheKey = translationCacheKey(item.text, settings, sourceLanguage, targetLanguage);
    const cached = await readCachedTranslation(cacheKey);
    if (cached) {
      cachedResults.push({ id: item.id, translation: cached });
    } else {
      pendingItems.push({ ...item, cacheKey });
    }
  }

  if (pendingItems.length === 0) {
    return { items: cachedResults, usage: null };
  }

  if (pendingItems.length === 1) {
    const result = await translateText({
      text: pendingItems[0].text,
      sourceLanguage,
      targetLanguage,
      settings,
      laneKey
    });

    return {
      items: [...cachedResults, { id: pendingItems[0].id, translation: result.translation }],
      usage: result.usage
    };
  }

  if (!settings.apiKey) {
    throw new Error("请先在扩展设置里填写 API Key。");
  }

  if (!settings.endpoint) {
    throw new Error("请先在扩展设置里填写 API 地址。");
  }

  const payload = await requestChatCompletion(settings, {
    model: settings.model,
    temperature: 0.1,
    messages: [
      {
        role: "system",
        content: [
          "You are a precise batch translation engine.",
          "Return only valid JSON.",
          "Preserve URLs, code, markdown, numbers, names, and paragraph breaks.",
          "Do not add explanations."
        ].join(" ")
      },
      {
        role: "user",
        content: buildBatchPrompt({
          items: pendingItems.map(({ id, text }) => ({ id, text })),
          sourceLanguage,
          targetLanguage,
          customInstruction: settings.customInstruction
        })
      }
    ]
  }, laneKey);

  const content = extractTranslation(payload);
  if (isConcurrencyLimitError(content)) {
    throw new Error(content);
  }

  const translatedItems = parseBatchTranslations(content, pendingItems);
  if (translatedItems.length > 0) {
    await cacheBatchTranslations(translatedItems, pendingItems);
    return {
      items: [...cachedResults, ...translatedItems],
      usage: payload.usage
    };
  }

  const fallbackItems = [];
  for (const item of pendingItems) {
    const result = await translateText({
      text: item.text,
      sourceLanguage,
      targetLanguage,
      settings,
      laneKey
    });

    fallbackItems.push({
      id: item.id,
      translation: result.translation
    });
  }

  return { items: [...cachedResults, ...fallbackItems], usage: payload.usage };
}

async function cacheBatchTranslations(translatedItems, pendingItems) {
  const keyById = new Map(pendingItems.map((item) => [item.id, item.cacheKey]));
  for (const item of translatedItems) {
    const cacheKey = keyById.get(item.id);
    if (cacheKey) {
      await writeCachedTranslation(cacheKey, item.translation);
    }
  }
}

// ============================================================
// 译文缓存实现
// 条目格式 [译文, 最近使用时间]；懒加载，防抖落盘，LRU 淘汰
// ============================================================

async function getTranslationCache() {
  if (!translationCache) {
    const stored = await chrome.storage.local.get(CACHE_STORAGE_KEY);
    translationCache = new Map(Object.entries(stored[CACHE_STORAGE_KEY] || {}));
  }

  return translationCache;
}

function translationCacheKey(text, settings, sourceLanguage, targetLanguage) {
  const config = [settings.model, sourceLanguage, targetLanguage, settings.customInstruction].join("");
  return `${hashText(text)}:${hashText(config)}`;
}

// FNV-1a 32 位 + 长度后缀，键短且碰撞概率可忽略
function hashText(value) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return `${(hash >>> 0).toString(36)}-${value.length}`;
}

async function readCachedTranslation(cacheKey) {
  const cache = await getTranslationCache();
  const entry = cache.get(cacheKey);
  if (!entry) {
    return "";
  }

  entry[1] = Date.now();
  return entry[0];
}

async function writeCachedTranslation(cacheKey, translation) {
  const cache = await getTranslationCache();
  cache.set(cacheKey, [translation, Date.now()]);
  if (cache.size > CACHE_MAX_ENTRIES) {
    pruneTranslationCache(cache);
  }

  scheduleCacheSave();
}

function pruneTranslationCache(cache) {
  const entries = [...cache.entries()].sort((left, right) => left[1][1] - right[1][1]);
  const removeCount = entries.length - CACHE_PRUNE_TO;
  for (let i = 0; i < removeCount; i += 1) {
    cache.delete(entries[i][0]);
  }
}

function scheduleCacheSave() {
  clearTimeout(cacheSaveTimer);
  cacheSaveTimer = setTimeout(() => {
    chrome.storage.local.set({ [CACHE_STORAGE_KEY]: Object.fromEntries(translationCache) });
  }, 1200);
}

function buildPrompt({ text, sourceLanguage, targetLanguage, customInstruction }) {
  const sourceLine = sourceLanguage && sourceLanguage !== "auto"
    ? `Source language: ${sourceLanguage}.`
    : "Detect the source language.";

  return [
    `Translate into: ${targetLanguage}.`,
    sourceLine,
    customInstruction ? `Style instruction: ${customInstruction}.` : "",
    "Text:",
    text
  ].filter(Boolean).join("\n");
}

function buildBatchPrompt({ items, sourceLanguage, targetLanguage, customInstruction }) {
  const sourceLine = sourceLanguage && sourceLanguage !== "auto"
    ? `Source language: ${sourceLanguage}.`
    : "Detect each source language.";

  return [
    `Translate all items into: ${targetLanguage}.`,
    sourceLine,
    customInstruction ? `Style instruction: ${customInstruction}.` : "",
    "Return exactly this JSON shape: {\"items\":[{\"id\":\"same id\",\"translation\":\"translated text\"}]}",
    "Input JSON:",
    JSON.stringify({ items }, null, 2)
  ].filter(Boolean).join("\n");
}

function parseBatchTranslations(content, sourceItems) {
  const jsonText = extractJsonObjectText(content);
  if (!jsonText) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonText);
    const items = Array.isArray(parsed?.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];
    const sourceIds = new Set(sourceItems.map((item) => item.id));

    return items
      .map((item) => ({
        id: cleanString(item?.id),
        translation: cleanString(item?.translation || item?.text || item?.content)
      }))
      .filter((item) => item.id && sourceIds.has(item.id) && item.translation);
  } catch {
    return [];
  }
}

function extractJsonObjectText(content) {
  const text = cleanString(content);
  if (!text) {
    return "";
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  const firstObject = candidate.indexOf("{");
  const lastObject = candidate.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    return candidate.slice(firstObject, lastObject + 1);
  }

  const firstArray = candidate.indexOf("[");
  const lastArray = candidate.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    return candidate.slice(firstArray, lastArray + 1);
  }

  return "";
}

async function safeJson(response) {
  const body = await response.text();
  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    return { raw: body };
  }
}

function extractTranslation(payload) {
  return cleanString(
    payload?.choices?.[0]?.message?.content ||
    payload?.choices?.[0]?.text ||
    payload?.output_text ||
    payload?.translation ||
    ""
  );
}

function extractApiError(payload) {
  return cleanString(
    payload?.error?.message ||
    payload?.message ||
    payload?.raw ||
    ""
  );
}

function toReadableError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "发生了未知错误。";
}
