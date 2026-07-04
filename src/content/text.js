/**
 * [INPUT]: 依赖 constants.js 的选中文本长度限制与页面 DOM 节点
 * [OUTPUT]: 对外提供文本清洗、可翻译检测、源文本读取与译文重复判断
 * [POS]: src/content 的文本语义模块，被入口、扫描器和渲染器消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { MAX_SELECTION_CHARS } from "./constants.js";

export function cleanText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  return text.length > MAX_SELECTION_CHARS
    ? text.slice(0, MAX_SELECTION_CHARS)
    : text;
}

export function cleanPageText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function hasTranslatableContent(text) {
  return /[A-Za-zÀ-ɏ぀-ヿ가-힯Ѐ-ӿ]/.test(text);
}

export function getElementSourceText(element) {
  const stored = element.getAttribute("data-ai-translator-v2-source-text");
  if (stored) {
    return cleanPageText(stored);
  }

  const text = cleanPageText(Array.from(element.childNodes)
    .filter((node) => {
      return !(node.nodeType === Node.ELEMENT_NODE &&
        node instanceof HTMLElement &&
        node.hasAttribute("data-ai-translator-v2-compact-result"));
    })
    .map((node) => node.textContent || "")
    .join(" "));

  if (text) {
    element.setAttribute("data-ai-translator-v2-source-text", text);
  }

  return text;
}

export function isSameMeaningText(originalText, translatedText) {
  const normalize = (value) => cleanPageText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");

  return normalize(originalText) === normalize(translatedText);
}
