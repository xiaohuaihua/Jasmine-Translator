import {
  BATCH_TIMEOUT_MS,
  HOST_ID,
  PAGE_BATCH_CHAR_LIMIT,
  PAGE_BATCH_CONCURRENCY,
  PAGE_BATCH_SIZE
} from "./constants.js";
import {
  centeredRect,
  clamp,
  getPageUrlKey,
  normalizeHostname,
  sendRuntimeMessage,
  toReadableError
} from "./runtime.js";
import {
  cleanPageText,
  cleanText,
  getElementSourceText
} from "./text.js";
import { getUiTemplate } from "./ui-template.js";
import { collectTextBlocks, getTranslationMode, waitForTextBlocks } from "./page-scanner.js";
import { clearTransientPageErrors, ensureInlineStyles, removePageTranslationMarkup, removeTranslationResult, resetPendingPageJobs, setTranslationResult } from "./page-renderer.js";

/**
 * [INPUT]: 依赖 chrome.runtime 消息通道、页面 DOM/Selection/MutationObserver、background.js 的翻译与缓存能力
 * [OUTPUT]: 对外提供选中翻译、整页翻译、进度胶囊、暂停/继续、隐藏/显示与还原能力
 * [POS]: src 的内容脚本入口，负责把翻译能力注入任意网页，被 manifest.json content_scripts 加载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
(() => {
  if (window.__AI_TRANSLATOR_V2_CONTENT_SCRIPT_LOADED__) {
    return;
  }
  window.__AI_TRANSLATOR_V2_CONTENT_SCRIPT_LOADED__ = true;

  let host = null;
  let shadow = null;
  let button = null;
  let panel = null;
  let resultNode = null;
  let statusNode = null;
  let pageToast = null;
  let pageToastText = null;
  let activeText = "";
  let autoSelectionButton = true;
  let targetLanguage = "Chinese (Simplified)";
  let sitePreferences = {};
  let lastSelectionRect = null;
  let hideTimer = 0;
  let pageObserver = null;
  let pageTranslateTimer = 0;
  let pageScanPromise = null;
  let pageUrlKey = getPageUrlKey();
  let pageToastDismissed = false;
  let pageToastCollapsed = false;
  let pageToastPosition = null;
  let pageToastDrag = null;
  let jobCounter = 0;
  let pageSessionId = 0;
  let pageTranslationsHidden = false;
  let countedElements = new WeakSet();
  let translatedElements = new WeakSet();
  let translatingElements = new WeakSet();
  let pageState = {
    enabled: false,
    busy: false,
    cancelled: false,
    paused: false,
    translated: 0,
    total: 0,
    discovered: 0
  };

  init();

  function init() {
    loadSettings().then((settings) => {
      const preference = settings.sitePreferences?.[normalizeHostname(location.hostname)];
      if (preference === "always") {
        window.setTimeout(() => translatePage(), 900);
      }
    });

    document.addEventListener("mouseup", handleSelectionEvent, true);
    document.addEventListener("keyup", handleSelectionEvent, true);
    document.addEventListener("scroll", handlePageScroll, true);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    installUrlWatcher();

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message?.type === "AI_TRANSLATOR_CONTEXT_TRANSLATE") {
        const text = cleanText(message.text || getSelectedText());
        startTranslation(text);
        sendResponse({ ok: true });
        return false;
      }

      if (message?.type === "AI_TRANSLATOR_TRANSLATE_PAGE") {
        translatePage()
          .then((status) => sendResponse({ ok: true, status }))
          .catch((error) => sendResponse({ ok: false, error: toReadableError(error) }));
        return true;
      }

      if (message?.type === "AI_TRANSLATOR_CLEAR_PAGE_TRANSLATION") {
        clearPageTranslations();
        sendResponse({ ok: true });
        return false;
      }

      if (message?.type === "AI_TRANSLATOR_GET_PAGE_STATUS") {
        sendResponse({ ok: true, status: getPageStatus() });
        return false;
      }

      if (message?.type === "AI_TRANSLATOR_TOGGLE_PAGE_VISIBILITY") {
        sendResponse({ ok: true, hidden: togglePageTranslationsHidden() });
        return false;
      }

      return false;
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") {
        return;
      }

      if (changes.autoSelectionButton) {
        autoSelectionButton = changes.autoSelectionButton.newValue !== false;
      }

      if (changes.targetLanguage) {
        targetLanguage = changes.targetLanguage.newValue || "Chinese (Simplified)";
      }

      if (changes.sitePreferences) {
        sitePreferences = changes.sitePreferences.newValue || {};
      }
    });
  }

  async function loadSettings() {
    const response = await sendRuntimeMessage({ type: "AI_TRANSLATOR_GET_SETTINGS" });
    if (!response?.ok) {
      return {};
    }

    autoSelectionButton = response.settings.autoSelectionButton !== false;
    targetLanguage = response.settings.targetLanguage || "Chinese (Simplified)";
    sitePreferences = response.settings.sitePreferences || {};
    return response.settings;
  }

  function handleSelectionEvent(event) {
    if (!autoSelectionButton || isInsideTranslator(event.target)) {
      return;
    }

    window.clearTimeout(hideTimer);
    window.setTimeout(() => {
      const text = cleanText(getSelectedText());
      const rect = getSelectionRect();

      if (!text || !rect) {
        hideButton();
        return;
      }

      activeText = text;
      lastSelectionRect = rect;
      showButton(rect);
    }, 20);
  }

  function handlePageScroll() {
    hideButtonSoon();
    scheduleContinuousPageTranslation(260);
  }

  function handleVisibilityChange() {
    if (!pageState.enabled) {
      return;
    }

    if (document.hidden) {
      window.clearTimeout(pageTranslateTimer);
      pageTranslateTimer = 0;
      return;
    }

    scheduleContinuousPageTranslation(420);
  }

  function installUrlWatcher() {
    const notifyUrlChange = () => {
      window.setTimeout(handleUrlChange, 60);
    };

    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function pushState(...args) {
      const result = originalPushState.apply(this, args);
      notifyUrlChange();
      return result;
    };

    history.replaceState = function replaceState(...args) {
      const result = originalReplaceState.apply(this, args);
      notifyUrlChange();
      return result;
    };

    window.addEventListener("popstate", notifyUrlChange);
    window.addEventListener("hashchange", notifyUrlChange);
    window.setInterval(handleUrlChange, 1200);
  }

  function handleUrlChange() {
    const nextKey = getPageUrlKey();
    if (nextKey === pageUrlKey) {
      return;
    }

    pageUrlKey = nextKey;
    resetPageTranslationForNavigation();
  }

  function resetPageTranslationForNavigation() {
    const shouldContinue = pageState.enabled && !pageState.cancelled;
    const wasDismissed = pageToastDismissed;

    pageSessionId += 1;
    stopContinuousPageTranslation();
    removePageTranslationMarkup();
    countedElements = new WeakSet();
    translatedElements = new WeakSet();
    translatingElements = new WeakSet();
    pageState = {
      enabled: shouldContinue,
      busy: false,
      cancelled: false,
      paused: false,
      translated: 0,
      total: 0,
      discovered: 0
    };

    if (shouldContinue) {
      startContinuousPageTranslation();
      pageToastDismissed = wasDismissed;
      showPageToast("已切换到新页面，翻译进度已重置。", false);
      scheduleContinuousPageTranslation(900);
      return;
    }

    hidePageToast();
  }

  function getSelectedText() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return "";
    }

    return selection.toString();
  }

  function getSelectionRect() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null;
    }

    const range = selection.getRangeAt(0);
    const rects = Array.from(range.getClientRects()).filter((rect) => {
      return rect.width > 0 && rect.height > 0;
    });

    return rects[rects.length - 1] || range.getBoundingClientRect();
  }

  function ensureDom() {
    if (host && shadow) {
      return;
    }

    host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement("div");
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
    }

    shadow = getTranslatorShadowRoot();
    shadow.innerHTML = getUiTemplate();

    button = shadow.querySelector(".translate-button");
    panel = shadow.querySelector(".panel");
    resultNode = shadow.querySelector(".result");
    statusNode = shadow.querySelector(".status");
    pageToast = shadow.querySelector(".page-toast");
    pageToastText = pageToast.querySelector(".toast-text");

    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => startTranslation(activeText));
    shadow.querySelector(".close").addEventListener("click", hidePanel);
    shadow.querySelector(".copy").addEventListener("click", copyResult);
    shadow.querySelector(".pause-page").addEventListener("click", pausePageTranslation);
    shadow.querySelector(".resume-page").addEventListener("click", resumePageTranslation);
    shadow.querySelector(".clear-page").addEventListener("click", clearPageTranslations);
    shadow.querySelector(".collapse-page-toast").addEventListener("click", togglePageToastCollapsed);
    shadow.querySelector(".toast-ring").addEventListener("click", togglePageToastCollapsed);
    shadow.querySelector(".dismiss-page-toast").addEventListener("click", dismissPageToast);
    shadow.querySelector(".toast-drag").addEventListener("pointerdown", startPageToastDrag);
  }

  function getTranslatorShadowRoot() {
    if (host.shadowRoot) {
      return host.shadowRoot;
    }

    try {
      return host.attachShadow({ mode: "open" });
    } catch (error) {
      host.remove();
      host = document.createElement("div");
      host.id = HOST_ID;
      document.documentElement.appendChild(host);
      return host.attachShadow({ mode: "open" });
    }
  }

  function showButton(rect) {
    ensureDom();
    const x = clamp(rect.right + 8, 8, window.innerWidth - 52);
    const y = clamp(rect.bottom + 8, 8, window.innerHeight - 42);

    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.display = "inline-flex";
  }

  function hideButtonSoon() {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideButton, 120);
  }

  function hideButton() {
    if (button) {
      button.style.display = "none";
    }
  }

  function showPanel(rect) {
    ensureDom();
    const width = Math.min(420, window.innerWidth - 32);
    const x = clamp(rect.left, 16, window.innerWidth - width - 16);
    const y = clamp(rect.bottom + 12, 16, window.innerHeight - 170);

    panel.style.width = `${width}px`;
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.display = "block";
  }

  function hidePanel() {
    if (panel) {
      panel.style.display = "none";
    }
  }

  async function startTranslation(text) {
    const content = cleanText(text);
    if (!content) {
      return;
    }

    ensureDom();
    hideButton();
    showPanel(lastSelectionRect || centeredRect());
    resultNode.textContent = "正在翻译...";
    statusNode.textContent = "";

    const response = await sendRuntimeMessage({
      type: "AI_TRANSLATOR_TRANSLATE_TEXT",
      text: content
    });

    if (!response?.ok) {
      resultNode.textContent = "翻译失败。";
      statusNode.textContent = response?.error || "发生了未知错误。";
      return;
    }

    resultNode.textContent = response.translation;
    statusNode.textContent = "已完成";
  }

  async function translatePage() {
    ensureDom();
    ensureInlineStyles();
    clearTransientPageErrors(isTransientTranslationError);
    pageTranslationsHidden = false;
    document.documentElement.removeAttribute("data-ai-translator-v2-hidden");
    pageToastDismissed = false;
    pageToastCollapsed = true;
    applyPageToastState();

    if (pageState.paused || pageState.cancelled) {
      return resumePageTranslation();
    }

    const wasEnabled = pageState.enabled;
    pageState.enabled = true;
    pageState.cancelled = false;
    pageState.paused = false;
    if (!wasEnabled) {
      pageSessionId += 1;
    }

    startContinuousPageTranslation();

    if (pageState.busy || pageScanPromise) {
      showPageToast(`页面翻译已开启，已完成 ${pageState.translated}/${pageState.total}，滚动后会继续。`, true);
      return getPageStatus();
    }

    runPageScan({ wait: true });
    showPageToast("已开启页面翻译，译文会分批出现；继续滚动会自动翻译新内容。", true);
    return getPageStatus();
  }

  async function scanAndTranslateMore({ wait = false } = {}) {
    if (pageState.busy || pageState.cancelled || pageState.paused || !pageState.enabled) {
      return getPageStatus();
    }

    if (document.hidden) {
      return getPageStatus();
    }

    pageState.busy = true;
    if (wait) {
      showPageToast("正在扫描页面正文...", true);
    }

    try {
      const tracking = { translatedElements, translatingElements };
      const blocks = wait ? await waitForTextBlocks(tracking) : collectTextBlocks(tracking);
      const jobs = buildTranslationJobs(blocks);

      if (jobs.length === 0) {
        if (wait && pageState.translated === 0) {
          showPageToast("页面翻译已开启，正在等待正文或滚动加载的新内容。", false);
        }
        return getPageStatus();
      }

      const newJobCount = countNewPageJobs(jobs);
      pageState = {
        ...pageState,
        cancelled: false,
        discovered: pageState.discovered + newJobCount,
        total: pageState.total + newJobCount
      };

      showPageToast(
        newJobCount > 0
          ? `发现 ${newJobCount} 个新文本块，正在翻译...`
          : `正在补译 ${jobs.length} 个文本块...`,
        true
      );
      jobs.forEach((job) => {
        translatingElements.add(job.block);
        setTranslationResult(job, "等待翻译...", true);
      });

      await translatePageBatches(jobs);

      if (pageState.paused) {
        showPageToast(`已暂停，完成 ${pageState.translated}/${pageState.total}。点继续可接着翻。`, false, { force: true });
      } else if (pageState.cancelled) {
        showPageToast(`已停止，完成 ${pageState.translated}/${pageState.total}。`, false);
      } else {
        showPageToast(`已翻译 ${pageState.translated}/${pageState.total}，滚动后会继续。`, false);
        scheduleContinuousPageTranslation(900);
      }

      return getPageStatus();
    } finally {
      pageState.busy = false;
    }
  }

  function buildTranslationJobs(blocks) {
    return blocks
      .filter((block) => !translatedElements.has(block) && !translatingElements.has(block))
      .map((block) => ({
        id: makeJobId(),
        sessionId: pageSessionId,
        block,
        mode: getTranslationMode(block),
        text: getElementSourceText(block)
      }))
      .filter((job) => job.text && !isProbablyAlreadyTranslated(job.text));
  }

  function countNewPageJobs(jobs) {
    let count = 0;
    for (const job of jobs) {
      if (countedElements.has(job.block)) {
        continue;
      }

      countedElements.add(job.block);
      count += 1;
    }

    return count;
  }

  function makeJobId() {
    jobCounter += 1;
    return `p${Date.now().toString(36)}-${jobCounter}`;
  }

  function isProbablyAlreadyTranslated(text) {
    const cleaned = cleanPageText(text);
    if (!cleaned) {
      return true;
    }

    if (!isChineseTargetLanguage()) {
      return false;
    }

    const cjkCount = (cleaned.match(/[\u3400-\u9fff]/g) || []).length;
    const latinCount = (cleaned.match(/[A-Za-z]/g) || []).length;
    return cjkCount >= 2 && cjkCount > latinCount;
  }

  function isChineseTargetLanguage() {
    return /Chinese|中文|汉语|漢語/i.test(targetLanguage || "");
  }

  function chunkTranslationJobs(jobs, maxItems, maxChars) {
    const chunks = [];
    let chunk = [];
    let charCount = 0;

    for (const job of jobs) {
      const textLength = job.text.length;
      if (chunk.length > 0 && (chunk.length >= maxItems || charCount + textLength > maxChars)) {
        chunks.push(chunk);
        chunk = [];
        charCount = 0;
      }

      chunk.push(job);
      charCount += textLength;
    }

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    return chunks;
  }


  async function translatePageBatches(jobs) {
    const batches = chunkTranslationJobs(jobs, PAGE_BATCH_SIZE, PAGE_BATCH_CHAR_LIMIT);
    let nextBatchIndex = 0;

    const runWorker = async () => {
      while (!pageState.cancelled && !pageState.paused && nextBatchIndex < batches.length) {
        const batch = batches[nextBatchIndex];
        nextBatchIndex += 1;
        await translatePageBatch(batch);
      }
    };

    const workers = Array.from(
      { length: Math.min(PAGE_BATCH_CONCURRENCY, batches.length) },
      () => runWorker()
    );

    await Promise.all(workers);
  }

  async function translatePageBatch(batch) {
    const activeBatch = batch.filter((job) => job.sessionId === pageSessionId);
    if (activeBatch.length === 0 || pageState.cancelled || pageState.paused) {
      return;
    }

    activeBatch.forEach((job) => setTranslationResult(job, "正在翻译...", true));
    showPageToast(`正在翻译 ${pageState.translated}/${pageState.total}`, true);

    const response = await sendRuntimeMessage({
      type: "AI_TRANSLATOR_TRANSLATE_BATCH",
      items: activeBatch.map((job) => ({ id: job.id, text: job.text }))
    }, BATCH_TIMEOUT_MS);

    if (!response?.ok) {
      const errorMessage = response?.error || "翻译失败。";
      if (response?.timeout || isTransientTranslationError(errorMessage)) {
        activeBatch.forEach((job) => {
          removeTranslationResult(job);
          translatingElements.delete(job.block);
        });
        showPageToast(
          response?.timeout
            ? "这批请求超时，已重新排队；不用刷新页面。"
            : "接口达到并发或限流上限，已放慢并稍后重试；不用刷新页面。",
          false
        );
        scheduleContinuousPageTranslation(response?.timeout ? 2200 : 6500);
        return;
      }

      activeBatch.forEach((job) => {
        if (job.sessionId !== pageSessionId) {
          return;
        }

        setTranslationResult(job, errorMessage, false, true);
        translatingElements.delete(job.block);
      });
      if (pageState.translated === 0 && isBlockingTranslationError(errorMessage)) {
        showPageToast(errorMessage, false, { error: true, force: true });
        throw new Error(errorMessage);
      }
      return;
    }

    const translatedById = new Map(
      (response.items || []).map((item) => [String(item.id), item.translation])
    );

    for (const job of activeBatch) {
      if (pageState.cancelled || pageState.paused || job.sessionId !== pageSessionId) {
        return;
      }

      const translation = translatedById.get(job.id);
      if (!translation) {
        setTranslationResult(job, "这一段没有返回译文。", false, true);
        translatingElements.delete(job.block);
        continue;
      }

      setTranslationResult(job, translation, false);
      translatingElements.delete(job.block);
      translatedElements.add(job.block);
      pageState.translated += 1;
    }

    showPageToast(`正在翻译 ${pageState.translated}/${pageState.total}`, true);
  }
  function isBlockingTranslationError(message) {
    return /API Key|API 地址|401|403|unauthorized|forbidden|余额|额度|模型|model/i.test(message);
  }

  function isTransientTranslationError(message) {
    return /429|503|并发|频率|限流|rate.?limit|too many requests|繁忙|稍后/i.test(message || "");
  }

  function clearPageTranslations() {
    pageTranslationsHidden = false;
    document.documentElement.removeAttribute("data-ai-translator-v2-hidden");
    pageState.cancelled = true;
    pageState.enabled = false;
    pageSessionId += 1;
    stopContinuousPageTranslation();
    removePageTranslationMarkup();
    countedElements = new WeakSet();
    translatedElements = new WeakSet();
    translatingElements = new WeakSet();
    pageState = {
      enabled: false,
      busy: false,
      cancelled: false,
      paused: false,
      translated: 0,
      total: 0,
      discovered: 0
    };
    showPageToast("已还原当前页面。", false, { force: true });
  }

  function pausePageTranslation() {
    pageState.paused = true;
    pageState.cancelled = false;
    pageState.enabled = true;
    pageSessionId += 1;
    stopContinuousPageTranslation();
    translatingElements = new WeakSet();
    resetPendingPageJobs();
    showPageToast(`已暂停，完成 ${pageState.translated}/${pageState.total}。点继续接着翻。`, false, { force: true });
  }

  async function resumePageTranslation() {
    ensureDom();
    ensureInlineStyles();
    clearTransientPageErrors(isTransientTranslationError);
    translatingElements = new WeakSet();
    resetPendingPageJobs();
    pageTranslationsHidden = false;
    document.documentElement.removeAttribute("data-ai-translator-v2-hidden");
    pageToastDismissed = false;
    pageState.enabled = true;
    pageState.cancelled = false;
    pageState.paused = false;
    pageSessionId += 1;
    startContinuousPageTranslation();
    showPageToast(`继续翻译，已完成 ${pageState.translated}/${pageState.total}。`, true, { force: true });
    runPageScan({ wait: false });
    return getPageStatus();
  }

  function getPageStatus() {
    return {
      enabled: pageState.enabled,
      busy: pageState.busy,
      paused: pageState.paused,
      translated: pageState.translated,
      total: pageState.total,
      discovered: pageState.discovered,
      hidden: pageTranslationsHidden
    };
  }

  // ==========================================================
  // 隐藏/显示译文：只切换可见性，不销毁任何翻译成果。
  // 「还原等于白翻」的问题在这里消失——想暂时不看就隐藏，秒回。
  // ==========================================================
  function togglePageTranslationsHidden() {
    setPageTranslationsHidden(!pageTranslationsHidden);
    return pageTranslationsHidden;
  }

  function setPageTranslationsHidden(hidden) {
    pageTranslationsHidden = hidden;
    document.documentElement.toggleAttribute("data-ai-translator-v2-hidden", hidden);

    if (hidden) {
      window.clearTimeout(pageTranslateTimer);
      pageTranslateTimer = 0;
      showPageToast("译文已隐藏，点弹窗里的「显示译文」随时找回。", false);
      return;
    }

    if (pageState.enabled) {
      showPageToast("译文已恢复显示。", false);
      scheduleContinuousPageTranslation(400);
    }
  }

  function startContinuousPageTranslation() {
    if (pageObserver || !document.body) {
      return;
    }

    pageObserver = new MutationObserver(() => {
      scheduleContinuousPageTranslation(500);
    });
    pageObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function stopContinuousPageTranslation() {
    if (pageObserver) {
      pageObserver.disconnect();
      pageObserver = null;
    }

    window.clearTimeout(pageTranslateTimer);
    pageTranslateTimer = 0;
  }

  function runPageScan(options = {}) {
    if (pageScanPromise || !pageState.enabled || pageState.cancelled) {
      return pageScanPromise;
    }

    pageScanPromise = scanAndTranslateMore(options)
      .catch((error) => {
        pageState.busy = false;
        showPageToast(toReadableError(error), false);
      })
      .finally(() => {
        pageScanPromise = null;
      });

    return pageScanPromise;
  }

  function scheduleContinuousPageTranslation(delay = 450) {
    if (!pageState.enabled || pageState.cancelled || pageState.paused || document.hidden || pageTranslationsHidden) {
      return;
    }

    window.clearTimeout(pageTranslateTimer);
    pageTranslateTimer = window.setTimeout(() => {
      runPageScan();
    }, delay);
  }

  function togglePageToastCollapsed() {
    pageToastCollapsed = !pageToastCollapsed;
    applyPageToastState();
  }

  function dismissPageToast() {
    pageToastDismissed = true;
    hidePageToast();
  }

  function hidePageToast() {
    if (pageToast) {
      pageToast.style.display = "none";
    }
  }

  function applyPageToastState() {
    if (!pageToast) {
      return;
    }

    pageToast.classList.toggle("is-collapsed", pageToastCollapsed);
    pageToast.classList.toggle("is-positioned", Boolean(pageToastPosition));
    pageToast.classList.toggle("is-paused", pageState.paused);
    pageToast.style.setProperty("--progress", `${getPageProgressPercent()}%`);

    const ringText = pageToast.querySelector(".toast-ring span");
    if (ringText) {
      ringText.textContent = `${getPageProgressPercent()}%`;
    }

    const collapseButton = pageToast.querySelector(".collapse-page-toast");
    if (collapseButton) {
      collapseButton.textContent = pageToastCollapsed ? "展开" : "收起";
      collapseButton.title = pageToastCollapsed ? "展开" : "收起";
    }

    if (pageToastPosition) {
      pageToast.style.left = `${pageToastPosition.left}px`;
      pageToast.style.top = `${pageToastPosition.top}px`;
      pageToast.style.bottom = "auto";
      pageToast.style.transform = "none";
    } else {
      pageToast.style.left = "50%";
      pageToast.style.top = "";
      pageToast.style.bottom = "18px";
      pageToast.style.transform = "translateX(-50%)";
    }
  }

  function getPageProgressPercent() {
    if (!pageState.total) {
      return 0;
    }

    return Math.max(0, Math.min(100, Math.round((pageState.translated / pageState.total) * 100)));
  }

  function startPageToastDrag(event) {
    if (!pageToast) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget?.setPointerCapture?.(event.pointerId);
    const rect = pageToast.getBoundingClientRect();
    pageToastDrag = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    pageToast.classList.add("is-positioned");
    document.addEventListener("pointermove", movePageToast, true);
    document.addEventListener("pointerup", endPageToastDrag, true);
  }

  function movePageToast(event) {
    if (!pageToastDrag || !pageToast) {
      return;
    }

    const rect = pageToast.getBoundingClientRect();
    const left = clamp(event.clientX - pageToastDrag.offsetX, 8, window.innerWidth - rect.width - 8);
    const top = clamp(event.clientY - pageToastDrag.offsetY, 8, window.innerHeight - rect.height - 8);
    pageToastPosition = { left, top };
    applyPageToastState();
  }

  function endPageToastDrag() {
    pageToastDrag = null;
    document.removeEventListener("pointermove", movePageToast, true);
    document.removeEventListener("pointerup", endPageToastDrag, true);
  }

  function showPageToast(text, busy, options = {}) {
    ensureDom();
    if (options.force) {
      pageToastDismissed = false;
    }

    if (pageToastDismissed) {
      return;
    }

    window.clearTimeout(showPageToast.timer);
    applyPageToastState();
    pageToast.classList.toggle("is-error", Boolean(options.error));
    pageToastText.textContent = text;
    pageToast.style.display = "flex";
    const pauseButton = pageToast.querySelector(".pause-page");
    const resumeButton = pageToast.querySelector(".resume-page");
    if (pauseButton) {
      pauseButton.style.display = (busy || (pageState.enabled && !pageState.paused)) ? "inline-flex" : "none";
    }
    if (resumeButton) {
      resumeButton.style.display = pageState.paused ? "inline-flex" : "none";
    }

    if (!busy && !pageState.enabled && !pageState.paused) {
      showPageToast.timer = window.setTimeout(() => {
        if (!pageState.busy && pageToast) {
          pageToast.style.display = "none";
        }
      }, 3200);
    }
  }

  async function copyResult() {
    const text = resultNode?.textContent || "";
    if (!text) {
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      statusNode.textContent = "已复制";
    } catch {
      statusNode.textContent = "复制失败";
    }
  }

  function isInsideTranslator(target) {
    return Boolean(host && (target === host || host.contains(target)));
  }
})();
