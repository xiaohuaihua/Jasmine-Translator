# Jasmine Translator / 花茶翻译器

花茶翻译器是一款轻量、安静、可自带 API Key 的 AI 网页翻译扩展，支持 Chrome 和 Edge。

> Like a cup of jasmine tea, it quietly makes web pages easier to read.

## 📥 下载 / Download

**[点击下载 v0.6.1 发行包 / Download v0.6.1 Release Package](https://github.com/xiaohuaihua/Jasmine-Translator/releases/download/v0.6.1/jasmine-translator-v0.6.1.zip)**

下载后解压，然后在浏览器扩展页面"加载已解压的扩展程序"，选择解压出来的文件夹即可。

After downloading, unzip it and load the extracted folder as an unpacked extension in Chrome or Edge.

---

## Language

- [中文说明](#中文说明)
- [English](#english)

---

# 中文说明

## 功能亮点

- 划词翻译：选中文字后点击浮动按钮即可翻译。
- 整页翻译：分批翻译当前网页，长页面滚动时可继续补译。
- 暂停 / 继续：翻译中可以暂停，也可以从未完成段落继续。
- 隐藏译文 / 还原页面：可以临时隐藏译文，也可以清除当前页面译文。
- 本地缓存：重复内容会优先使用本地缓存，减少重复请求。
- 自带 API Key：你使用自己的服务商账号和 API Key。
- 服务商预设：默认支持 TokenDance，也支持自定义 OpenAI 兼容接口。

## 安装方式

### 方式一：直接下载发行包（推荐）

**[点击下载 jasmine-translator-v0.6.0.zip](https://github.com/xiaohuaihua/Jasmine-Translator/releases/download/v0.6.0/jasmine-translator-v0.6.0.zip)**

下载后：

1. 解压 ZIP 到本地文件夹。
2. 打开 `chrome://extensions` 或 `edge://extensions`。
3. 开启右上角的”开发者模式”。
4. 点击”加载已解压的扩展程序”。
5. 选择刚才解压出来、包含 `manifest.json` 的文件夹。

### 方式二：Chrome Web Store / Edge Add-ons

即将提供。

## 快速开始

1. 打开扩展设置页。
2. 服务商预设选择 **TokenDance**。
3. 如果还没有 API Key，点击 **获取 API Key** 创建。
4. 把 API Key 粘贴到设置页。
5. 点击 **使用推荐模型**，或者点击 **保存并拉取模型** 后从模型列表中选择。
6. 打开任意网页，点击浏览器右上角的扩展图标。
7. 点击 **翻译当前页面**。

## 如何使用

### 划词翻译

在网页上选中文字，旁边会出现一个小翻译按钮。点击按钮即可翻译选中的文本。

### 整页翻译

点击扩展图标，然后点击 **翻译当前页面**。扩展会分批处理网页文本，避免一次性请求过多。长页面继续滚动时，也可以继续补译新出现的内容。

### 进度胶囊

整页翻译时，页面底部会出现一个进度胶囊。

- 点击圆环可以展开或收起控制器。
- 拖动把手可以移动胶囊位置。
- 点击 **暂停** 可以暂停翻译。
- 点击 **继续** 可以从未完成段落继续翻译。
- 在弹窗里点击 **隐藏译文** 可以临时隐藏译文，不会清空进度。
- 在弹窗里点击 **还原** 可以移除当前页面译文。

## 服务商配置

默认推荐使用 TokenDance 预设。也可以填写自定义 OpenAI 兼容接口。

API Key 保存在浏览器扩展本地存储中。花茶翻译器不提供共享 API Key，也不运营翻译服务器。

## 隐私说明

只有在你主动请求翻译时，扩展才会把选中文本或网页文本发送到你配置的 AI 服务商。API Key 保存在浏览器扩展本地存储中。

详见 [PRIVACY.md](PRIVACY.md)。

## 常见问题

### 为什么有些页面不能翻译？

浏览器限制扩展在部分页面注入脚本，例如 `chrome://` 页面、浏览器扩展商店页面和部分浏览器内置页面。

### 为什么拉取模型列表很慢？

可能是服务商接口、网络环境或 API Key 权限导致。你可以直接点击 **使用推荐模型**，不必等待完整模型列表。

### 整页翻译卡住怎么办？

点击进度胶囊中的 **继续**。扩展会从未完成的文本块继续翻译。

## 许可证和品牌

源代码使用 [Apache License 2.0](LICENSE)。

“花茶翻译器”、“Jasmine Translator”、项目图标、商店截图和其他品牌资产为保留品牌资产。详见 [TRADEMARK.md](TRADEMARK.md)。

## 支持

这是个人维护的开源项目，通过 GitHub Issues 提供尽力而为的支持。详见 [SUPPORT.md](SUPPORT.md)。

---

# English

Jasmine Translator is a lightweight AI web page translator for Chrome and Edge. It supports selected text translation, full page translation, pause and resume, local cache, and bring-your-own API key setup.

## Features

- Translate selected text on web pages.
- Translate full pages in batches.
- Pause and resume page translation.
- Hide translated text without losing progress.
- Restore the page when you want to remove translations.
- Cache repeated translations locally for faster repeated use.
- Use your own API key.
- Built-in TokenDance preset and custom OpenAI-compatible endpoint support.

## Install

### Option 1: Download release package (recommended)

**[Download jasmine-translator-v0.6.0.zip](https://github.com/xiaohuaihua/Jasmine-Translator/releases/download/v0.6.0/jasmine-translator-v0.6.0.zip)**

After downloading:

1. Unzip it to a local folder.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted folder that contains `manifest.json`.

### Option 2: Chrome Web Store / Edge Add-ons

Coming soon.

## Quick start

1. Open the extension options page.
2. Choose **TokenDance** as the provider preset.
3. If you do not have an API key, click **获取 API Key** to create one.
4. Paste your API key into the options page.
5. Click **使用推荐模型**, or click **保存并拉取模型** if you want to choose from the model list.
6. Open a web page and click the extension icon.
7. Click **翻译当前页面**.

## How to use

### Selected text translation

Select text on a web page. A small translate button will appear near the selection. Click it to translate the selected text.

### Full page translation

Click the extension icon and choose **翻译当前页面**. Translations will appear in batches. Long pages can continue translating as you scroll.

### Progress capsule

During page translation, a small progress capsule appears at the bottom of the page.

- Click the circle to expand or collapse the controls.
- Drag the handle to move the capsule.
- Click **暂停** to pause.
- Click **继续** to resume from unfinished text blocks.
- Click **隐藏译文** in the popup to hide translations without deleting them.
- Click **还原** to remove translations from the current page.

## Provider setup

The default preset is TokenDance.  Users can also configure a custom OpenAI-compatible endpoint.

Your API key is stored in your browser extension's local storage. Jasmine Translator does not provide an API key and does not operate a translation server.

## Privacy

Jasmine Translator sends selected text or page text to the AI provider you configure only when you ask it to translate. API keys are stored locally in browser extension storage.

See [PRIVACY.md](PRIVACY.md) for details.

## FAQ

### Why does the extension not work on some pages?

Browser extensions cannot inject content scripts into some pages, such as `chrome://` pages, browser extension stores, and other restricted browser pages.

### Why is fetching the model list slow?

It may be caused by the provider API, network conditions, or API key permissions. You can use the recommended model directly without waiting for the full model list.

### What should I do if page translation gets stuck?

Click **继续** in the progress capsule. The extension will continue from unfinished text blocks.

## License and brand

The source code is licensed under the [Apache License 2.0](LICENSE).

The names “花茶翻译器” and “Jasmine Translator”, project icons, store screenshots, and other brand assets are reserved brand assets. See [TRADEMARK.md](TRADEMARK.md).

## Support

This is a personal open-source project. Best-effort support is provided through GitHub Issues. See [SUPPORT.md](SUPPORT.md).
