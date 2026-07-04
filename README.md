# Jasmine Translator / 花茶翻译器

A lightweight AI web page translator for Chrome and Edge.

花茶翻译器是一款轻量、安静、可自带 API Key 的网页翻译扩展。它支持划词翻译、整页翻译、暂停继续、隐藏译文、还原页面和本地缓存。

Like a cup of jasmine tea, it quietly makes web pages easier to read.

## Features / 功能亮点

- Translate selected text on web pages.
- Translate full pages in batches.
- Pause and resume page translation.
- Hide translated text without losing progress.
- Restore the page when you want to remove translations.
- Cache repeated translations locally for faster repeated use.
- Use your own API key.
- Built-in TokenDance preset, plus custom OpenAI-compatible endpoints.

## Install / 安装

### Option 1: Chrome Web Store / Edge Add-ons

Coming soon.

### Option 2: Manual install from release ZIP

1. Download the latest release ZIP from GitHub Releases.
2. Unzip it to a local folder.
3. Open `chrome://extensions` or `edge://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the unzipped folder.

> Do not select the ZIP file directly. Select the extracted folder that contains `manifest.json`.

## Quick start / 快速开始

1. Open the extension options page.
2. Choose **TokenDance** as the provider preset.
3. If you do not have an API key, click **获取 API Key** to create one.
4. Paste your API key into the options page.
5. Click **使用推荐模型**, or click **保存并拉取模型** if you want to choose from the model list.
6. Open a web page and click the extension icon.
7. Click **翻译当前页面**.

## How to use / 如何使用

### Selected text translation / 划词翻译

Select text on a web page. A small translate button will appear near the selection. Click it to translate the selected text.

### Full page translation / 整页翻译

Click the extension icon and choose **翻译当前页面**. Translations will appear in batches. Long pages can continue translating as you scroll.

### Progress capsule / 进度胶囊

During page translation, a small progress capsule appears at the bottom of the page.

- Click the circle to expand or collapse the controls.
- Drag the handle to move the capsule.
- Click **暂停** to pause.
- Click **继续** to resume from unfinished text blocks.
- Click **隐藏译文** in the popup to hide translations without deleting them.
- Click **还原** to remove the translations from the current page.

## Provider setup / 服务商配置

The default preset is TokenDance. Advanced users can also configure an OpenAI-compatible endpoint.

Your API key is stored in your browser extension's local storage. Jasmine Translator does not provide an API key and does not operate a translation server.

## Privacy / 隐私

Jasmine Translator sends selected text or page text to the AI provider you configure, only when you ask it to translate. API keys are stored locally in your browser extension storage.

See [PRIVACY.md](PRIVACY.md) for details.

## FAQ / 常见问题

### Why does the extension not work on some pages?

Browser extensions cannot inject content scripts into some pages, such as `chrome://` pages, browser extension stores, and other restricted browser pages.

### Why is fetching the model list slow?

It may be caused by the provider API, network conditions, or API key permissions. You can use the recommended model directly without waiting for the full model list.

### What should I do if page translation gets stuck?

Click **继续** in the progress capsule. The extension will continue from unfinished text blocks.

## License / 许可证

The source code is licensed under the [Apache License 2.0](LICENSE).

The names “花茶翻译器” and “Jasmine Translator”, project icons, store screenshots, and other brand assets are reserved brand assets. See [TRADEMARK.md](TRADEMARK.md).

## Support / 支持

This is a personal open-source project. Best-effort support is provided through GitHub Issues. See [SUPPORT.md](SUPPORT.md).
