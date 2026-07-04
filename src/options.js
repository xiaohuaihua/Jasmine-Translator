import {
  getProviderOptions,
  getProviderPreset,
  inferProviderFromEndpoint,
  isModelsCacheFresh,
  normalizeProviderId
} from "./providers.js";

const form = document.getElementById("settingsForm");
const provider = document.getElementById("provider");
const providerHelp = document.getElementById("providerHelp");
const providerState = document.getElementById("providerState");
const endpoint = document.getElementById("endpoint");
const apiKey = document.getElementById("apiKey");
const maxConcurrentRequests = document.getElementById("maxConcurrentRequests");
const model = document.getElementById("model");
const sourceLanguage = document.getElementById("sourceLanguage");
const targetLanguage = document.getElementById("targetLanguage");
const customInstruction = document.getElementById("customInstruction");
const autoSelectionButton = document.getElementById("autoSelectionButton");
const statusNode = document.getElementById("status");
const testButton = document.getElementById("test");
const fetchModelsButton = document.getElementById("fetchModels");
const refreshModelsButton = document.getElementById("refreshModels");
const openProviderHomeButton = document.getElementById("openProviderHome");
const openApiKeyButton = document.getElementById("openApiKey");
const useRecommendedModelButton = document.getElementById("useRecommendedModel");
const modelFilter = document.getElementById("modelFilter");
const clearFilter = document.getElementById("clearFilter");
const modelSummary = document.getElementById("modelSummary");
const modelList = document.getElementById("modelList");
const testResult = document.getElementById("testResult");
const resultSection = document.querySelector(".result-section");

let settings = null;
let models = [];

initProviderOptions();
load();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  save();
});

provider.addEventListener("change", applyProviderPreset);
endpoint.addEventListener("input", syncProviderFromEndpoint);
fetchModelsButton.addEventListener("click", () => fetchModels({ force: false }));
refreshModelsButton.addEventListener("click", () => fetchModels({ force: true }));
testButton.addEventListener("click", testConnection);
openProviderHomeButton.addEventListener("click", () => openCurrentProviderUrl("homepageUrl"));
openApiKeyButton.addEventListener("click", () => openCurrentProviderUrl("apiKeyUrl"));
useRecommendedModelButton.addEventListener("click", useRecommendedModel);
modelFilter.addEventListener("input", renderModelList);
clearFilter.addEventListener("click", () => {
  modelFilter.value = "";
  renderModelList();
});
model.addEventListener("input", renderModelList);

function initProviderOptions() {
  provider.textContent = "";
  for (const preset of getProviderOptions()) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    provider.appendChild(option);
  }
}

async function load() {
  const response = await sendRuntimeMessage({ type: "AI_TRANSLATOR_GET_SETTINGS" });
  if (!response?.ok) {
    setStatus(response?.error || "读取设置失败。");
    return;
  }

  settings = response.settings;
  render(settings);
}

function render(nextSettings) {
  const providerId = normalizeProviderId(nextSettings.provider || inferProviderFromEndpoint(nextSettings.endpoint));
  provider.value = providerId;
  endpoint.value = nextSettings.endpoint;
  apiKey.value = nextSettings.apiKey;
  maxConcurrentRequests.value = nextSettings.maxConcurrentRequests || getProviderPreset(providerId).maxConcurrentRequests;
  model.value = nextSettings.model;
  sourceLanguage.value = nextSettings.sourceLanguage;
  targetLanguage.value = nextSettings.targetLanguage;
  customInstruction.value = nextSettings.customInstruction;
  autoSelectionButton.checked = nextSettings.autoSelectionButton !== false;
  models = Array.isArray(nextSettings.models) ? nextSettings.models : [];
  updateProviderUi(nextSettings);
  renderModelList();
}

function updateProviderUi(nextSettings = collectSafe()) {
  const preset = getProviderPreset(provider.value);
  providerHelp.textContent = preset.helpText;
  openProviderHomeButton.hidden = !preset.homepageUrl;
  openApiKeyButton.hidden = !preset.apiKeyUrl;
  useRecommendedModelButton.hidden = !preset.model;

  if (nextSettings?.modelsCache && isModelsCacheFresh(nextSettings.modelsCache, nextSettings)) {
    providerState.textContent = "模型已缓存";
  } else if (nextSettings?.apiKey) {
    providerState.textContent = "已配置";
  } else {
    providerState.textContent = "未配置";
  }
}

function collectSafe() {
  return {
    ...(settings || {}),
    provider: provider.value || "custom",
    endpoint: endpoint.value || "",
    apiKey: apiKey.value || "",
    maxConcurrentRequests: maxConcurrentRequests.value || "",
    model: model.value || "",
    sourceLanguage: sourceLanguage.value || "auto",
    targetLanguage: targetLanguage.value || "Chinese (Simplified)",
    customInstruction: customInstruction.value || "",
    autoSelectionButton: autoSelectionButton.checked,
    models
  };
}

function collect() {
  return {
    ...collectSafe(),
    modelsCache: settings?.modelsCache || null
  };
}

async function save(options = {}) {
  const response = await sendRuntimeMessage({
    type: "AI_TRANSLATOR_SAVE_SETTINGS",
    settings: collect()
  });

  if (!response?.ok) {
    setStatus(response?.error || "保存失败。");
    return false;
  }

  settings = response.settings;
  render(settings);
  if (!options.quiet) {
    setStatus("已保存");
  }
  return true;
}

async function fetchModels({ force = false } = {}) {
  setFetchButtonsDisabled(true);
  setStatus(force ? "正在重新拉取模型列表..." : "正在保存设置并读取模型列表...");

  const saved = await save({ quiet: true });
  if (!saved) {
    setFetchButtonsDisabled(false);
    return;
  }

  const response = await sendRuntimeMessage({
    type: "AI_TRANSLATOR_FETCH_MODELS",
    settings: collect(),
    force
  });

  setFetchButtonsDisabled(false);

  if (!response?.ok) {
    setStatus(`${response?.error || "拉取模型失败。"} 你也可以直接使用推荐模型。`);
    providerState.textContent = "拉取失败";
    return;
  }

  settings = response.settings;
  models = response.models || [];
  render(settings);
  providerState.textContent = response.cached ? "已使用缓存" : "模型已拉取";
  setStatus(response.cached
    ? `已使用缓存的 ${models.length} 个模型。需要更新请点“重新拉取模型”。`
    : `已获取 ${models.length} 个模型，点击模型即可选用。`);
}

function setFetchButtonsDisabled(disabled) {
  fetchModelsButton.disabled = disabled;
  refreshModelsButton.disabled = disabled;
  fetchModelsButton.textContent = disabled ? "正在拉取..." : "保存并拉取模型";
}

async function testConnection() {
  testButton.disabled = true;
  testButton.textContent = "正在测试...";
  setStatus("正在测试连接...");
  resultSection.classList.add("is-visible");
  testResult.textContent = "等待接口响应...";

  const saved = await save({ quiet: true });
  if (!saved) {
    testButton.disabled = false;
    testButton.textContent = "测试连接";
    return;
  }

  const response = await sendRuntimeMessage({
    type: "AI_TRANSLATOR_TEST_CONNECTION",
    settings: collect()
  });

  testButton.disabled = false;
  testButton.textContent = "测试连接";

  if (!response?.ok) {
    setStatus("测试失败");
    providerState.textContent = "测试失败";
    testResult.textContent = response?.error || "发生了未知错误。";
    return;
  }

  providerState.textContent = "连接正常";
  setStatus("测试完成");
  testResult.textContent = response.translation;
}

function renderModelList() {
  modelList.textContent = "";

  if (models.length === 0) {
    modelSummary.textContent = "尚未拉取";
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "可以先使用推荐模型；需要完整列表时再点击“保存并拉取模型”。";
    modelList.appendChild(empty);
    return;
  }

  const keyword = modelFilter.value.trim().toLowerCase();
  const visibleModels = models.filter((item) => {
    const haystack = `${item.id} ${item.name}`.toLowerCase();
    return !keyword || haystack.includes(keyword);
  });

  modelSummary.textContent = `已获取 ${models.length} 个，当前显示 ${visibleModels.length} 个`;

  const fragment = document.createDocumentFragment();
  visibleModels.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = item.id === model.value ? "model-option is-selected" : "model-option";
    button.addEventListener("click", () => {
      model.value = item.id;
      renderModelList();
      setStatus(`已选择模型：${item.id}`);
    });

    const name = document.createElement("span");
    name.className = "model-name";
    name.textContent = item.name || item.id;

    const id = document.createElement("span");
    id.className = "model-id";
    id.textContent = item.id;

    button.append(name, id);
    fragment.appendChild(button);
  });

  modelList.appendChild(fragment);
}

function applyProviderPreset() {
  const preset = getProviderPreset(provider.value);
  if (preset.id === "custom") {
    setStatus("已切换为自定义接口。请填写 API 地址和模型 ID。");
    updateProviderUi();
    return;
  }

  endpoint.value = preset.endpoint;
  model.value = preset.model;
  maxConcurrentRequests.value = preset.maxConcurrentRequests;
  setStatus("已套用服务商预设。可直接保存，或拉取模型列表。未注册用户可点击“获取 API Key”。");
  updateProviderUi();
  renderModelList();
}

function syncProviderFromEndpoint() {
  const inferred = inferProviderFromEndpoint(endpoint.value);
  if (provider.value !== inferred && inferred !== "custom") {
    provider.value = inferred;
    updateProviderUi();
  }
}

function useRecommendedModel() {
  const preset = getProviderPreset(provider.value);
  if (!preset.model) {
    setStatus("自定义接口没有内置推荐模型，请手动填写模型 ID。");
    return;
  }

  model.value = preset.model;
  if (!endpoint.value && preset.endpoint) {
    endpoint.value = preset.endpoint;
  }
  if (!maxConcurrentRequests.value) {
    maxConcurrentRequests.value = preset.maxConcurrentRequests;
  }
  renderModelList();
  setStatus(`已使用推荐模型：${preset.model}`);
}

function openCurrentProviderUrl(field) {
  const url = getProviderPreset(provider.value)[field];
  if (!url) {
    setStatus("当前服务商没有配置对应链接。");
    return;
  }

  if (chrome.tabs?.create) {
    chrome.tabs.create({ url });
    return;
  }

  window.open(url, "_blank", "noopener");
}

function sendRuntimeMessage(payload) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(payload, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response);
    });
  });
}

function setStatus(value) {
  statusNode.textContent = value;
}
