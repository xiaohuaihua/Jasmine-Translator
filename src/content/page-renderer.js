/**
 * [INPUT]: 依赖页面 DOM 与 text.js 的源文本/译文比较能力
 * [OUTPUT]: 对外提供译文插入、移除、pending 清理与隐藏样式注入
 * [POS]: src/content 的页面渲染器，只写译文相关节点和样式，不扫描、不发请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { getElementSourceText, isSameMeaningText } from "./text.js";

export function setTranslationResult(job, text, loading, isError = false) {
  if (job.mode === "compact") {
    setCompactResult(job.block, text, loading, isError);
    return;
  }

  setBlockResult(job.block, text, loading, isError);
}

export function removeTranslationResult(job) {
  job.block.removeAttribute("data-ai-translator-v2-pending");
  if (job.mode === "compact") {
    const compactNode = job.block.querySelector(":scope > [data-ai-translator-v2-compact-result]");
    if (compactNode) {
      compactNode.remove();
    }
    return;
  }

  const node = job.block.nextElementSibling;
  if (node?.hasAttribute("data-ai-translator-v2-result")) {
    node.remove();
  }
}

function setBlockResult(anchor, text, loading, isError = false) {
  let node = anchor.nextElementSibling;
  if (!loading && !isError && isSameMeaningText(getElementSourceText(anchor), text)) {
    if (node?.hasAttribute("data-ai-translator-v2-result")) {
      node.remove();
    }
    return;
  }

  if (!node || !node.hasAttribute("data-ai-translator-v2-result")) {
    node = document.createElement("div");
    node.setAttribute("data-ai-translator-v2-result", "true");
    anchor.insertAdjacentElement("afterend", node);
  }

  node.className = [
    "ai-translator-v2-inline-result",
    loading ? "is-loading" : "",
    isError ? "is-error" : ""
  ].filter(Boolean).join(" ");
  node.textContent = text;
}

function setCompactResult(anchor, text, loading, isError = false) {
  if (loading) {
    anchor.setAttribute("data-ai-translator-v2-pending", "true");
    return;
  }

  anchor.removeAttribute("data-ai-translator-v2-pending");
  const originalText = getElementSourceText(anchor);

  let node = anchor.querySelector(":scope > [data-ai-translator-v2-compact-result]");
  if (!node) {
    node = document.createElement("span");
    node.setAttribute("data-ai-translator-v2-compact-result", "true");
    anchor.appendChild(node);
  }

  node.className = [
    "ai-translator-v2-compact-result",
    isError ? "is-error" : ""
  ].filter(Boolean).join(" ");

  if (!isError && isSameMeaningText(originalText, text)) {
    node.remove();
    return;
  }

  node.textContent = text;
}

export function removePageTranslationMarkup() {
  document.querySelectorAll("[data-ai-translator-v2-result]").forEach((node) => node.remove());
  document.querySelectorAll("[data-ai-translator-v2-compact-result]").forEach((node) => node.remove());
  document.querySelectorAll("[data-ai-translator-v2-pending]").forEach((node) => {
    node.removeAttribute("data-ai-translator-v2-pending");
  });
  document.querySelectorAll("[data-ai-translator-v2-source-text]").forEach((node) => {
    node.removeAttribute("data-ai-translator-v2-source-text");
  });
}

export function clearTransientPageErrors(isTransientTranslationError) {
  document.querySelectorAll("[data-ai-translator-v2-result], [data-ai-translator-v2-compact-result]").forEach((node) => {
    if (isTransientTranslationError(node.textContent || "")) {
      node.remove();
    }
  });

  document.querySelectorAll("[data-ai-translator-v2-pending]").forEach((node) => {
    node.removeAttribute("data-ai-translator-v2-pending");
  });
}


export function resetPendingPageJobs() {
  document.querySelectorAll("[data-ai-translator-v2-pending]").forEach((node) => {
    node.removeAttribute("data-ai-translator-v2-pending");
  });
  document.querySelectorAll("[data-ai-translator-v2-result].is-loading").forEach((node) => node.remove());
}


export function ensureInlineStyles() {
  if (document.getElementById("ai-translator-v2-inline-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "ai-translator-v2-inline-style";
  style.textContent = `
    .ai-translator-v2-inline-result {
      background: rgba(23, 107, 88, 0.08);
      border-left: 3px solid #176b58;
      border-radius: 6px;
      color: #24403a;
      font-size: 0.96em;
      line-height: 1.65;
      margin: 0.45em 0 0.85em;
      padding: 0.65em 0.85em;
      white-space: pre-wrap;
    }

    .ai-translator-v2-inline-result.is-loading {
      color: #66736f;
    }

    .ai-translator-v2-inline-result.is-error {
      background: rgba(180, 54, 54, 0.08);
      border-left-color: #b43636;
      color: #8f2828;
    }

    [data-ai-translator-v2-pending="true"] {
      outline: 1px dashed rgba(23, 107, 88, 0.35);
      outline-offset: 2px;
    }

    .ai-translator-v2-compact-result {
      color: #176b58;
      display: inline;
      font-size: 0.92em;
      font-weight: 600;
      margin-left: 0.42em;
      white-space: normal;
    }

    .ai-translator-v2-compact-result::before {
      content: "/";
      color: #8a9792;
      font-weight: 400;
      margin-right: 0.42em;
    }

    .ai-translator-v2-compact-result.is-error {
      color: #8f2828;
    }

    html[data-ai-translator-v2-hidden] .ai-translator-v2-inline-result,
    html[data-ai-translator-v2-hidden] .ai-translator-v2-compact-result {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}
