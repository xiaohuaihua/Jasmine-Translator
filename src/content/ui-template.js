/**
 * [INPUT]: 无运行时依赖
 * [OUTPUT]: 对外提供 content script 的 Shadow DOM 模板与样式
 * [POS]: src/content 的 UI 模板模块，被入口 ensureDom 挂载
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */
export function getUiTemplate() {
  return `
      <style>
        :host {
          all: initial;
          color-scheme: light;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }

        button {
          font: inherit;
        }

        .translate-button {
          align-items: center;
          background: #176b58;
          border: 1px solid rgba(255, 255, 255, 0.28);
          border-radius: 999px;
          box-shadow: 0 10px 24px rgba(20, 34, 31, 0.24);
          color: #ffffff;
          cursor: pointer;
          display: none;
          font-size: 14px;
          font-weight: 800;
          height: 34px;
          justify-content: center;
          line-height: 1;
          min-width: 34px;
          padding: 0 11px;
          position: fixed;
          z-index: 2147483647;
        }

        .translate-button:hover {
          background: #125546;
        }

        .panel {
          background: #ffffff;
          border: 1px solid #d8dedb;
          border-radius: 8px;
          box-shadow: 0 18px 44px rgba(24, 31, 29, 0.22);
          color: #1d2724;
          display: none;
          max-height: min(420px, calc(100vh - 32px));
          max-width: min(420px, calc(100vw - 32px));
          min-width: 280px;
          overflow: hidden;
          position: fixed;
          width: max-content;
          z-index: 2147483647;
        }

        .panel-header {
          align-items: center;
          background: #f5f7f4;
          border-bottom: 1px solid #e2e7e4;
          display: flex;
          gap: 8px;
          justify-content: space-between;
          padding: 9px 10px;
        }

        .title {
          color: #24302d;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0;
        }

        .actions {
          display: flex;
          gap: 6px;
        }

        .icon-button {
          align-items: center;
          background: #ffffff;
          border: 1px solid #ced8d3;
          border-radius: 6px;
          color: #23312d;
          cursor: pointer;
          display: inline-flex;
          font-size: 12px;
          height: 28px;
          justify-content: center;
          line-height: 1;
          min-width: 28px;
          padding: 0 8px;
        }

        .icon-button:hover {
          border-color: #8aa49a;
        }

        .result {
          font-size: 14px;
          line-height: 1.55;
          max-height: 320px;
          overflow: auto;
          padding: 12px 13px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .status {
          color: #5d6b66;
          font-size: 12px;
          padding: 0 13px 12px;
        }

        .page-toast {
          align-items: center;
          backdrop-filter: blur(14px);
          background: rgba(22, 32, 29, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          bottom: 18px;
          box-shadow: 0 18px 44px rgba(11, 22, 18, 0.28);
          color: #ffffff;
          display: none;
          gap: 9px;
          left: 50%;
          max-width: min(560px, calc(100vw - 32px));
          padding: 7px 8px;
          position: fixed;
          transform: translateX(-50%);
          user-select: none;
          z-index: 2147483647;
        }

        .page-toast.is-positioned {
          bottom: auto;
          transform: none;
        }

        .page-toast.is-collapsed {
          max-width: min(240px, calc(100vw - 32px));
        }

        .page-toast.is-collapsed .toast-actions,
        .page-toast.is-collapsed .toast-text {
          display: none;
        }

        .page-toast.is-collapsed .toast-drag {
          display: inline-flex;
        }

        .toast-ring {
          align-items: center;
          background: conic-gradient(#7ee0c1 var(--progress, 0%), rgba(255, 255, 255, 0.18) 0);
          border: 0;
          border-radius: 999px;
          color: #ffffff;
          cursor: pointer;
          display: inline-flex;
          flex: 0 0 auto;
          font-size: 11px;
          font-weight: 800;
          height: 34px;
          justify-content: center;
          min-width: 34px;
          padding: 0;
          position: relative;
          width: 34px;
        }

        .toast-ring::before {
          background: #16201d;
          border-radius: inherit;
          content: "";
          inset: 4px;
          position: absolute;
        }

        .toast-ring span {
          position: relative;
        }

        .page-toast.is-paused .toast-ring {
          background: conic-gradient(#f6c76b var(--progress, 0%), rgba(255, 255, 255, 0.18) 0);
        }

        .page-toast.is-error .toast-ring {
          background: conic-gradient(#ef8b8b var(--progress, 0%), rgba(255, 255, 255, 0.18) 0);
        }

        .page-toast span {
          font-size: 13px;
          line-height: 1.4;
        }

        .toast-text {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .toast-actions {
          align-items: center;
          display: flex;
          gap: 7px;
        }

        .page-toast button {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 999px;
          color: #ffffff;
          cursor: pointer;
          font-size: 12px;
          height: 28px;
          padding: 0 10px;
        }

        .page-toast .toast-drag {
          cursor: grab;
          font-size: 15px;
          min-width: 28px;
          padding: 0;
        }

        .page-toast .toast-drag:active {
          cursor: grabbing;
        }
      </style>
      <button class="translate-button" type="button" title="翻译">译</button>
      <section class="panel" role="dialog" aria-label="翻译结果">
        <div class="panel-header">
          <div class="title">花茶翻译器</div>
          <div class="actions">
            <button class="icon-button copy" type="button" title="复制">复制</button>
            <button class="icon-button close" type="button" title="关闭">关闭</button>
          </div>
        </div>
        <div class="result"></div>
        <div class="status"></div>
      </section>
      <div class="page-toast is-collapsed" role="status">
        <button class="toast-ring" type="button" title="展开控制器"><span>0%</span></button>
        <button class="toast-drag" type="button" title="拖动">⋮⋮</button>
        <span class="toast-text"></span>
        <button class="collapse-page-toast" type="button" title="收起">收起</button>
        <div class="toast-actions">
          <button class="dismiss-page-toast" type="button" title="隐藏控制器">隐藏</button>
          <button class="pause-page" type="button">暂停</button>
          <button class="resume-page" type="button">继续</button>
          <button class="clear-page" type="button">还原</button>
        </div>
      </div>
    `;
}
