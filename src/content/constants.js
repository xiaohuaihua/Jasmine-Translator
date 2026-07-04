/**
 * [INPUT]: 无运行时依赖
 * [OUTPUT]: 对外提供 content script 的常量、选择器与超时配置
 * [POS]: src/content 的底层常量模块，被入口、扫描器和运行时逻辑消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export const HOST_ID = "ai-translator-v2-root";
export const MAX_SELECTION_CHARS = 12000;
export const MAX_PAGE_BLOCKS = 220;
export const PAGE_BATCH_SIZE = 14;
export const PAGE_BATCH_CHAR_LIMIT = 9000;
export const PAGE_BATCH_CONCURRENCY = 2;
export const PAGE_SCAN_TIMEOUT_MS = 8000;

// 批量翻译请求的硬超时：service worker 被杀等极端情况下，
// Promise 不再永远 pending，段落自动重新排队。
export const BATCH_TIMEOUT_MS = 120000;

export const PAGE_BLOCK_SELECTOR = [
  "article p",
  "main p",
  "[role='main'] p",
  "section p",
  ".content p",
  ".post p",
  ".article p",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "dd",
  "dt",
  "article div",
  "main div",
  "[role='main'] div",
  "p",
  "li"
].join(",");
