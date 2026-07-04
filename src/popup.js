/**
 * [INPUT]: 依赖 popup.html 的表单节点、chrome.tabs/chrome.runtime 消息通道、content.js 的页面状态接口
 * [OUTPUT]: 对外提供工具栏弹窗交互：语言切换、整页翻译、隐藏/显示译文、还原页面、站点偏好
 * [POS]: src/popup 的控制器，连接用户点击与 background/content 的翻译状态机
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
const statusText = document.getElementById("statusText");
const message = document.getElementById("message");
const sourceLanguage = document.getElementById("sourceLanguage");
const targetLanguage = document.getElementById("targetLanguage");
const autoSelectionButton = document.getElementById("autoSelectionButton");
const openOptionsButton = document.getElementById("openOptions");
const translateSelectionButton = document.getElementById("translateSelection");
const translatePageButton = document.getElementById("translatePage");
const toggleVisibilityButton = document.getElementById("toggleVisibility");
const clearPageButton = document.getElementById("clearPage");
const sitePreference = document.getElementById("sitePreference");
const serviceName = document.getElementById("serviceName");
const modelName = document.getElementById("modelName");

let currentSettings = null;
let activeTab = null;
let activeHostname = "";

load();

openOptionsButton.addEventListener("click", () => chrome.runtime.openOptionsPage());
translateSelectionButton.addEventListener("click", translateSelection);
translatePageButton.addEventListener("click", translatePage);
toggleVisibilityButton.addEventListener("click", toggleVisibility);
clearPageButton.addEventListener("click", clearPage);
autoSelectionButton.addEventListener("change", saveQuickSettings);
sourceLanguage.addEventListener("change", saveQuickSettings);
targetLanguage.addEventListener("change", saveQuickSettings);
sitePreference.addEventListener("change", saveSitePreference);

async function load() {
  activeTab = await getActiveTab();
  activeHostname = getHostname(activeTab?.url);

  const response = await sendRuntimeMessage({ type: "AI_TRANSLATOR_GET_SETTINGS" });
  if (!response?.ok) {
    setMessage(response?.error || "读取设置失败。");
    return;
  }

  currentSettings = response.settings;
  render(currentSettings);
  prepareActivePage();
}

function render(settings) {
  sourceLanguage.value = settings.sourceLanguage;
  targetLanguage.value = settings.targetLanguage;
  autoSelectionButton.checked = settings.autoSelectionButton !== false;
  sitePreference.value = settings.sitePreferences?.[activeHostname] || "manual";
  serviceName.textContent = getProviderLabel(settings.provider);
  modelName.textContent = settings.model || "-";
  statusText.textContent = settings.apiKey ? "API Key 已配置" : "还没有填写 API Key";
}

async function saveQuickSettings() {
  if (!currentSettings) {
    return;
  }

  const response = await sendRuntimeMessage({
    type: "AI_TRANSLATOR_SAVE_SETTINGS",
    settings: {
      ...currentSettings,
      sourceLanguage: sourceLanguage.value,
      targetLanguage: targetLanguage.value,
      autoSelectionButton: autoSelectionButton.checked
    }
  });

  if (!response?.ok) {
    setMessage(response?.error || "保存失败。");
    return;
  }

  currentSettings = response.settings;
  setMessage("已保存");
}

async function saveSitePreference() {
  if (!activeHostname) {
    setMessage("当前页面不支持站点设置。");
    return;
  }

  const response = await sendRuntimeMessage({
    type: "AI_TRANSLATOR_SAVE_SITE_PREFERENCE",
    hostname: activeHostname,
    preference: sitePreference.value
  });

  if (!response?.ok) {
    setMessage(response?.error || "保存失败。");
    return;
  }

  currentSettings = response.settings;
  setMessage("站点偏好已保存");
}

async function translateSelection() {
  await saveQuickSettings();
  const response = await sendTabMessage({ type: "AI_TRANSLATOR_CONTEXT_TRANSLATE" });
  setMessage(response?.ok ? "已发送到页面" : response?.error || "无法连接当前页面。");
}

async function translatePage() {
  await saveQuickSettings();
  translatePageButton.disabled = true;
  translatePageButton.textContent = "正在启动...";

  const response = await sendTabMessage({ type: "AI_TRANSLATOR_TRANSLATE_PAGE" });
  translatePageButton.disabled = false;
  translatePageButton.textContent = "翻译当前页面";

  if (!response?.ok) {
    setMessage(response?.error || "页面翻译失败。");
    return;
  }

  const status = response.status;
  setMessage(getPageStatusMessage(status));
}

async function toggleVisibility() {
  const response = await sendTabMessage({ type: "AI_TRANSLATOR_TOGGLE_PAGE_VISIBILITY" });
  if (!response?.ok) {
    setMessage(response?.error || "无法连接当前页面。");
    return;
  }

  renderVisibility(response.hidden);
  setMessage(response.hidden ? "译文已隐藏，随时可找回" : "译文已恢复显示");
}

function renderVisibility(hidden) {
  toggleVisibilityButton.textContent = hidden ? "显示译文" : "隐藏译文";
}

async function clearPage() {
  const response = await sendTabMessage({ type: "AI_TRANSLATOR_CLEAR_PAGE_TRANSLATION" });
  if (response?.ok) {
    renderVisibility(false);
  }

  setMessage(response?.ok ? "已还原页面（译文已入缓存，重开秒出）" : response?.error || "无法连接当前页面。");
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab || null));
  });
}

async function prepareActivePage() {
  if (!canInjectIntoActiveTab()) {
    return;
  }

  const response = await sendTabMessage({ type: "AI_TRANSLATOR_GET_PAGE_STATUS" });
  if (!response?.ok) {
    return;
  }

  renderVisibility(Boolean(response.status?.hidden));
  if (response.status?.enabled || response.status?.paused) {
    setMessage(getPageStatusMessage(response.status));
  }
}

function getPageStatusMessage(status) {
  if (!status) {
    return "页面翻译已启动";
  }

  if (status.paused) {
    return `页面翻译已暂停，已完成 ${status.translated}/${status.total}，可点页面控制器继续`;
  }

  return status.enabled
    ? `页面翻译已开启，后台会排队；已完成 ${status.translated}/${status.total}`
    : "页面翻译已启动";
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

function sendTabMessage(payload) {
  return new Promise((resolve) => {
    if (!activeTab?.id) {
      resolve({ ok: false, error: "没有可用的当前页面。" });
      return;
    }

    chrome.tabs.sendMessage(activeTab.id, payload, async (response) => {
      if (chrome.runtime.lastError) {
        const error = chrome.runtime.lastError.message || "";
        if (canInjectIntoActiveTab() && /Receiving end does not exist|Could not establish connection/i.test(error)) {
          const injected = await injectContentScript();
          if (injected.ok) {
            chrome.tabs.sendMessage(activeTab.id, payload, (retryResponse) => {
              if (chrome.runtime.lastError) {
                resolve({ ok: false, error: chrome.runtime.lastError.message });
                return;
              }

              resolve(retryResponse);
            });
            return;
          }

          resolve(injected);
          return;
        }

        resolve({ ok: false, error });
        return;
      }

      resolve(response);
    });
  });
}

function injectContentScript() {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      {
        target: { tabId: activeTab.id },
        files: ["src/content.js"]
      },
      () => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
          return;
        }

        window.setTimeout(() => resolve({ ok: true }), 80);
      }
    );
  });
}

function canInjectIntoActiveTab() {
  return Boolean(activeTab?.id && /^https?:\/\//i.test(activeTab.url || ""));
}

function getHostname(value) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getProviderLabel(provider) {
  if (provider === "tokendance") {
    return "词元跳动";
  }

  if (provider === "openai") {
    return "OpenAI";
  }

  return "自定义接口";
}

function setMessage(value) {
  message.textContent = value;
  window.clearTimeout(setMessage.timer);
  setMessage.timer = window.setTimeout(() => {
    message.textContent = "";
  }, 2600);
}
