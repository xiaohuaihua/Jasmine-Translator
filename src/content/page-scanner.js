/**
 * [INPUT]: 依赖页面 DOM、constants.js 选择器、text.js 文本判定、调用方传入的 WeakSet 跟踪状态
 * [OUTPUT]: 对外提供 collectTextBlocks、waitForTextBlocks、getTranslationMode
 * [POS]: src/content 的只读扫描器，只发现候选文本块，不写 DOM、不发请求
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
import { HOST_ID, MAX_PAGE_BLOCKS, PAGE_BLOCK_SELECTOR, PAGE_SCAN_TIMEOUT_MS } from "./constants.js";
import { cleanPageText, hasTranslatableContent } from "./text.js";

export function collectTextBlocks(tracking) {
  const candidates = [
    ...Array.from(document.querySelectorAll(PAGE_BLOCK_SELECTOR)),
    ...collectVisibleTextContainers()
  ];
  const rankedCandidates = [];
  const seenElements = new Set();
  let order = 0;

  for (const element of candidates) {
    if (seenElements.has(element)) {
      continue;
    }
    seenElements.add(element);

    if (isElementAlreadyQueued(element, tracking)) {
      continue;
    }

    if (!isTranslatableBlock(element)) {
      continue;
    }

    const text = cleanPageText(element.textContent);
    if (!text) {
      continue;
    }

    rankedCandidates.push({
      element,
      text,
      order,
      score: getViewportScore(element.getBoundingClientRect()),
      priority: getCandidatePriority(element)
    });
    order += 1;
  }

  rankedCandidates.sort((left, right) => {
    return left.score - right.score ||
      right.priority - left.priority ||
      left.order - right.order;
  });

  const blocks = [];
  for (const candidate of rankedCandidates) {
    if (blocks.length >= MAX_PAGE_BLOCKS) {
      break;
    }

    if (blocks.some((block) => block.contains(candidate.element) || candidate.element.contains(block))) {
      continue;
    }

    blocks.push(candidate.element);
  }

  return blocks;
}

function isElementAlreadyQueued(element, tracking) {
  if (tracking.translatedElements.has(element) || tracking.translatingElements.has(element)) {
    return true;
  }

  if (element.parentElement?.closest("[data-ai-translator-v2-source-text]")) {
    return true;
  }

  return Boolean(element.closest("[data-ai-translator-v2-result], [data-ai-translator-v2-compact-result]"));
}

function getViewportScore(rect) {
  const viewportCenter = window.innerHeight * 0.45;
  const elementCenter = rect.top + rect.height / 2;
  const nearViewport = rect.bottom >= -window.innerHeight * 0.35 &&
    rect.top <= window.innerHeight * 1.8;
  const distance = Math.abs(elementCenter - viewportCenter);

  return nearViewport ? distance : distance + window.innerHeight * 3;
}

function getCandidatePriority(element) {
  if (isCompactTextElement(element)) {
    return 3;
  }

  if (isHeadingElement(element)) {
    return 2;
  }

  return 1;
}

export function waitForTextBlocks(tracking) {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const read = () => {
      const blocks = collectTextBlocks(tracking);
      if (blocks.length > 0 || Date.now() - startedAt > PAGE_SCAN_TIMEOUT_MS) {
        observer.disconnect();
        window.clearInterval(interval);
        resolve(blocks);
      }
    };

    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    const interval = window.setInterval(read, 350);
    read();
  });
}

function collectVisibleTextContainers() {
  if (!document.body) {
    return [];
  }

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const text = cleanPageText(node.textContent);
        if (text.length < 2 || !hasTranslatableContent(text)) {
          return NodeFilter.FILTER_REJECT;
        }

        const parent = node.parentElement;
        if (!parent || shouldIgnoreElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );

  const containers = [];
  const seen = new Set();
  let node = walker.nextNode();
  while (node) {
    const container = findTextContainer(node.parentElement);
    if (container && !seen.has(container)) {
      seen.add(container);
      containers.push(container);
    }

    node = walker.nextNode();
  }

  return containers;
}

function findTextContainer(element) {
  let current = element;
  let best = element;

  while (current && current !== document.body && current !== document.documentElement) {
    if (shouldIgnoreElement(current)) {
      return null;
    }

    if (isCompactTextElement(current)) {
      return current;
    }

    const text = cleanPageText(current.textContent);
    if (text.length > 2400) {
      break;
    }

    best = current;

    if (isBlockLikeElement(current)) {
      break;
    }

    current = current.parentElement;
  }

  return best;
}

function isBlockLikeElement(element) {
  const tagName = element.tagName.toLowerCase();
  if (/^(p|li|dd|dt|blockquote|h[1-6])$/.test(tagName)) {
    return true;
  }

  const display = window.getComputedStyle(element).display;
  return display === "block" || display === "list-item";
}

function isTranslatableBlock(element) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (shouldIgnoreElement(element)) {
    return false;
  }

  if (element.nextElementSibling?.hasAttribute("data-ai-translator-v2-result")) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  const compact = isCompactTextElement(element);
  const minWidth = compact ? 16 : 80;
  const minHeight = compact ? 8 : 10;
  if (rect.width < minWidth || rect.height < minHeight) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
    return false;
  }

  const text = cleanPageText(element.textContent);
  if (!hasTranslatableContent(text)) {
    return false;
  }

  if (text.length > (compact ? 160 : 3600)) {
    return false;
  }

  if (!compact && hasMeaningfulChildBlock(element, text)) {
    return false;
  }

  if (compact) {
    return text.length >= 2;
  }

  return isHeadingElement(element)
    ? text.length >= 4
    : text.length >= 6;
}

function shouldIgnoreElement(element) {
  return Boolean(
    element.closest(`#${HOST_ID}`) ||
    element.closest("[data-ai-translator-v2-result]") ||
    element.closest("nav, header, footer, script, style, noscript, textarea, input, select, option, pre, code, [contenteditable='true']") ||
    element.matches("summary, svg, canvas, img, video, audio, [role='navigation'], [aria-hidden='true']")
  );
}

function hasMeaningfulChildBlock(element, ownText) {
  const tagName = element.tagName.toLowerCase();
  if (/^(p|li|dd|dt|blockquote|h[1-6])$/.test(tagName)) {
    return false;
  }

  const childBlocks = Array.from(element.children).filter((child) => {
    if (!(child instanceof HTMLElement) || shouldIgnoreElement(child)) {
      return false;
    }

    if (!isBlockLikeElement(child) && !isCompactTextElement(child)) {
      return false;
    }

    const childText = cleanPageText(child.textContent);
    if (isCompactTextElement(child)) {
      return childText.length >= 2 && childText.length < ownText.length * 0.92;
    }

    return childText.length >= 12 && childText.length < ownText.length * 0.92;
  });

  return childBlocks.length > 1;
}

function isHeadingElement(element) {
  return /^h[1-6]$/i.test(element.tagName);
}

export function getTranslationMode(element) {
  return isCompactTextElement(element) ? "compact" : "block";
}

function isCompactTextElement(element) {
  if (!(element instanceof HTMLElement) || isHeadingElement(element)) {
    return false;
  }

  const tagName = element.tagName.toLowerCase();
  if (/^(html|body|main|article|section|ul|ol|table|tbody|thead|tr)$/.test(tagName)) {
    return false;
  }

  if (element.children.length > 4) {
    return false;
  }

  const text = cleanPageText(element.textContent);
  if (text.length < 2 || text.length > 80 || !hasTranslatableContent(text)) {
    return false;
  }

  const rect = element.getBoundingClientRect();
  if (rect.width > 420 || rect.height > 120) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (!["inline", "inline-block", "inline-flex", "flex", "block"].includes(style.display)) {
    return false;
  }

  const className = String(element.className || "");
  const classHint = /\b(tag|chip|pill|badge|skill|keyword|label|category|stack|technology|tech)\b/i.test(className);
  const roleHint = /^(button|link|listitem|tab)$/i.test(element.getAttribute("role") || "");
  const boxHint = hasBoxStyling(element, style);
  const parentLayoutHint = hasCompactParentLayout(element);
  const controlHint = tagName === "button";

  return classHint || roleHint || boxHint || parentLayoutHint || controlHint;
}

function hasBoxStyling(element, style) {
  const horizontalPadding = parseFloat(style.paddingLeft || "0") + parseFloat(style.paddingRight || "0");
  const hasBorder = parseFloat(style.borderLeftWidth || "0") + parseFloat(style.borderRightWidth || "0") > 0;
  const hasRadius = parseFloat(style.borderTopLeftRadius || "0") > 0;
  const hasBackground = style.backgroundColor && !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(style.backgroundColor);

  return horizontalPadding >= 8 || hasBorder || hasRadius || hasBackground || element.matches("button");
}

function hasCompactParentLayout(element) {
  const parent = element.parentElement;
  if (!parent) {
    return false;
  }

  const parentStyle = window.getComputedStyle(parent);
  if (!["flex", "inline-flex", "grid", "inline-grid"].includes(parentStyle.display) &&
    parentStyle.flexWrap !== "wrap") {
    return false;
  }

  const siblings = Array.from(parent.children).filter((child) => {
    if (!(child instanceof HTMLElement) || child === element || shouldIgnoreElement(child)) {
      return false;
    }

    const text = cleanPageText(child.textContent);
    return text.length >= 2 && text.length <= 80 && hasTranslatableContent(text);
  });

  return siblings.length > 0;
}
