/**
 * [INPUT]: 依赖 chrome.runtime 消息通道与浏览器窗口/location API
 * [OUTPUT]: 对外提供 runtime 消息、URL/host、坐标与错误工具
 * [POS]: src/content 的基础运行时模块，被入口和后续控制器模块消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function sendRuntimeMessage(message, timeoutMs = 0) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    if (timeoutMs > 0) {
      window.setTimeout(() => {
        finish({ ok: false, error: "请求超时。", timeout: true });
      }, timeoutMs);
    }

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        finish({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      finish(response);
    });
  });
}

export function centeredRect() {
  return {
    left: Math.max(16, window.innerWidth / 2 - 180),
    bottom: Math.max(16, window.innerHeight / 2 - 80)
  };
}

export function normalizeHostname(value) {
  return String(value || "").toLowerCase().replace(/^www\./, "");
}

export function getPageUrlKey() {
  return `${location.origin}${location.pathname}${location.search}`;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function toReadableError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : "发生了未知错误。";
}
