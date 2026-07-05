# Privacy Policy / 隐私政策

**Last Updated / 最后更新**: July 5, 2026 / 2026年7月5日

---

## Overview / 概述

**English:**
Jasmine Translator ("the Extension") is a web page translation extension that helps users translate foreign language content on any website. This Privacy Policy explains how the Extension handles user data.

**中文:**
花茶翻译器（"本扩展"）是一个网页翻译扩展，帮助用户翻译任何网站上的外语内容。本隐私政策说明了扩展如何处理用户数据。

---

## Data Collection / 数据收集

**English:**
**The Extension does NOT collect, store, or transmit any user data to the developer's servers.**

**中文:**
**本扩展不会收集、存储或向开发者的服务器传输任何用户数据。**

### What Data the Extension Accesses / 扩展访问哪些数据

**English:**
The Extension accesses the following data **ONLY when users actively trigger translation**:

1. **Selected Text**: When you select text and click the translate button, the Extension reads the selected text.
2. **Web Page Content**: When you activate full-page translation, the Extension reads text content from the current web page.

**中文:**
本扩展**仅在用户主动触发翻译时**访问以下数据：

1. **选中的文本**：当您选中文本并点击翻译按钮时，扩展会读取选中的文本。
2. **网页内容**：当您激活整页翻译时，扩展会读取当前网页的文本内容。

---

## How This Data Is Used / 数据如何使用

**English:**
- **Translation Only**: The data is used solely for translation purposes.
- **Direct Transmission**: Selected text and page content are sent **directly** to the AI service provider you configure (via your own API key).
- **No Developer Servers**: The data does **NOT** pass through the extension developer's servers.
- **Local Caching**: Translation results are cached locally in your browser (maximum 2000 entries) to provide instant results for repeated translations and reduce API costs.

**中文:**
- **仅用于翻译**：数据仅用于翻译目的。
- **直接传输**：选中的文本和页面内容**直接**发送到您配置的 AI 服务提供商（通过您自己的 API 密钥）。
- **不经过开发者服务器**：数据**不会**经过扩展开发者的服务器。
- **本地缓存**：翻译结果在您的浏览器中本地缓存（最多 2000 条），以便为重复翻译提供即时结果并降低 API 成本。

---

## Data Flow / 数据流向

**English:**
```
Your Browser → Your Configured AI Service Provider
```

The Extension acts as a bridge between your browser and your chosen AI service. No data is transmitted to the extension developer or any third parties.

**中文:**
```
您的浏览器 → 您配置的 AI 服务提供商
```

扩展充当您的浏览器和您选择的 AI 服务之间的桥梁。不会向扩展开发者或任何第三方传输数据。

---

## Data Storage / 数据存储

### Local Storage Only / 仅本地存储

**English:**
All data is stored locally in your browser using `chrome.storage` APIs:

1. **User Settings**:
   - API keys (stored encrypted in your browser)
   - Target language preferences
   - Service provider configuration

2. **Translation Cache**:
   - Previously translated content (maximum 2000 entries, LRU cache)
   - Used to provide instant results and reduce API costs

3. **Extension State**:
   - Whether full-page translation is active
   - Site-specific preferences

**中文:**
所有数据均使用 `chrome.storage` API 在您的浏览器中本地存储：

1. **用户设置**：
   - API 密钥（在浏览器中加密存储）
   - 目标语言偏好
   - 服务提供商配置

2. **翻译缓存**：
   - 先前翻译的内容（最多 2000 条，LRU 缓存）
   - 用于提供即时结果并降低 API 成本

3. **扩展状态**：
   - 整页翻译是否激活
   - 特定网站的偏好设置

### No Remote Storage / 无远程存储

**English:**
The Extension does **NOT** store any data on remote servers. All data remains in your local browser storage.

**中文:**
扩展**不会**在远程服务器上存储任何数据。所有数据都保留在您的本地浏览器存储中。

---

## Data Sharing / 数据共享

### No Third-Party Sharing / 不与第三方共享

**English:**
The Extension does **NOT** share your data with:
- Advertising networks
- Analytics services
- Marketing companies
- Social media platforms
- Any other third parties

**中文:**
扩展**不会**与以下各方共享您的数据：
- 广告网络
- 分析服务
- 营销公司
- 社交媒体平台
- 任何其他第三方

### AI Service Provider / AI 服务提供商

**English:**
When you trigger a translation, the selected text or page content is sent to the AI service provider you configure (e.g., TokenDance, or any custom API endpoint you specify). This transmission occurs directly from your browser to the service provider using your own API key.

**Important**: The extension developer has no access to, control over, or visibility into this data transmission. You are responsible for reviewing the privacy policy of the AI service provider you choose to use.

**中文:**
当您触发翻译时，选中的文本或页面内容会发送到您配置的 AI 服务提供商（例如 TokenDance，或您指定的任何自定义 API 端点）。此传输直接从您的浏览器发送到服务提供商，使用您自己的 API 密钥。

**重要提示**：扩展开发者无法访问、控制或查看此数据传输。您有责任查看所选 AI 服务提供商的隐私政策。

---

## Permissions Explained / 权限说明

**English:**
The Extension requires the following permissions:

### 1. activeTab
- **Purpose**: Read selected text and inject translation UI into the active tab.
- **Usage**: Only when you actively trigger translation.

### 2. contextMenus
- **Purpose**: Add a "Translate" option to the browser's right-click context menu.
- **Usage**: Provides quick access to translation features.

### 3. scripting
- **Purpose**: Inject content scripts to display translations on web pages.
- **Usage**: All scripts are bundled within the Extension package (no remote code).

### 4. storage
- **Purpose**: Store user settings, API keys, and translation cache locally.
- **Usage**: All data is stored in your browser using `chrome.storage` APIs.

### 5. Host Permissions (<all_urls>)
- **Purpose**: Enable translation on any website.
- **Why Needed**: Users may need translation on unpredictable websites (news, documentation, social media, forums). A limited domain whitelist cannot satisfy this requirement.
- **Usage**: Content is read only when you actively trigger translation.

**中文:**
扩展需要以下权限:

### 1. activeTab（活动标签页）
- **用途**：读取选中的文本并向活动标签页注入翻译界面。
- **使用**：仅在您主动触发翻译时使用。

### 2. contextMenus（右键菜单）
- **用途**：在浏览器的右键菜单中添加"翻译"选项。
- **使用**：提供快速访问翻译功能的方式。

### 3. scripting（脚本注入）
- **用途**：注入内容脚本以在网页上显示翻译。
- **使用**：所有脚本均打包在扩展程序包内（无远程代码）。

### 4. storage（存储）
- **用途**：在本地存储用户设置、API 密钥和翻译缓存。
- **使用**：所有数据均使用 `chrome.storage` API 存储在浏览器中。

### 5. 主机权限 (<all_urls>)
- **用途**：在任何网站上启用翻译。
- **为什么需要**：用户可能需要在不可预测的网站上进行翻译（新闻、文档、社交媒体、论坛）。有限的域名白名单无法满足此需求。
- **使用**：仅在您主动触发翻译时读取内容。

---

## User Control / 用户控制

### You Control Your Data / 您控制您的数据

**English:**
- **API Keys**: You provide your own API keys. The Extension does not manage or have access to your account with any AI service provider.
- **Delete Data**: You can clear all locally stored data (settings, cache) at any time via the Extension's settings page.
- **Disable Extension**: You can disable or uninstall the Extension at any time through your browser's extension management page.

**中文:**
- **API 密钥**：您提供自己的 API 密钥。扩展不管理或访问您在任何 AI 服务提供商处的账户。
- **删除数据**：您可以随时通过扩展的设置页面清除所有本地存储的数据（设置、缓存）。
- **禁用扩展**：您可以随时通过浏览器的扩展管理页面禁用或卸载扩展。

### No Automatic Data Collection / 无自动数据收集

**English:**
The Extension does **NOT**:
- Track your browsing history
- Monitor your web activity
- Collect data in the background
- Use analytics or tracking services

Data is accessed **ONLY** when you actively trigger a translation.

**中文:**
扩展**不会**：
- 追踪您的浏览历史
- 监控您的网络活动
- 在后台收集数据
- 使用分析或追踪服务

数据**仅在**您主动触发翻译时被访问。

---

## Security / 安全性

**English:**
### Local Encryption
API keys are stored in your browser's local storage. Chrome's built-in security mechanisms protect this data.

### HTTPS Transmission
All communication between your browser and AI service providers occurs over secure HTTPS connections.

### No Developer Access
The extension developer has **NO** access to:
- Your API keys
- Your translation history
- Your browsing activity
- Any data you translate

**中文:**
### 本地加密
API 密钥存储在浏览器的本地存储中。Chrome 的内置安全机制保护这些数据。

### HTTPS 传输
您的浏览器与 AI 服务提供商之间的所有通信均通过安全的 HTTPS 连接进行。

### 开发者无访问权限
扩展开发者**无法**访问：
- 您的 API 密钥
- 您的翻译历史
- 您的浏览活动
- 您翻译的任何数据

---

## Children's Privacy / 儿童隐私

**English:**
The Extension does not knowingly collect data from children under 13 years of age. The Extension is not directed at children.

**中文:**
扩展不会有意收集 13 岁以下儿童的数据。扩展不针对儿童。

---

## Changes to This Privacy Policy / 隐私政策的变更

**English:**
We may update this Privacy Policy from time to time. The "Last Updated" date at the top of this policy indicates when it was last revised. Continued use of the Extension after any changes constitutes acceptance of the updated policy.

**中文:**
我们可能会不时更新本隐私政策。本政策顶部的"最后更新"日期表示最后修订时间。在任何更改后继续使用扩展即表示接受更新后的政策。

---

## Open Source / 开源

**English:**
The Extension's source code is publicly available on GitHub:
https://github.com/xiaohuaihua/ai-2-

You can review the code to verify how data is handled.

**中文:**
扩展的源代码在 GitHub 上公开：
https://github.com/xiaohuaihua/ai-2-

您可以查看代码以验证数据的处理方式。

---

## Contact / 联系方式

**English:**
If you have questions about this Privacy Policy, please contact:

**Email**: xiaohuaihua2026@163.com  
**GitHub**: https://github.com/xiaohuaihua/ai-2-/issues

**中文:**
如有关于本隐私政策的问题，请联系：

**邮箱**: xiaohuaihua2026@163.com  
**GitHub**: https://github.com/xiaohuaihua/ai-2-/issues

---

## Privacy Principles / 隐私原则

**English:**
This extension is designed with privacy in mind and follows principles consistent with:
- Chrome Web Store Developer Program Policies
- General Data Protection Regulation (GDPR) principles
- California Consumer Privacy Act (CCPA) principles
- Children's Online Privacy Protection Act (COPPA) principles

**中文:**
本扩展在设计时考虑了隐私保护，遵循以下原则：
- Chrome Web Store 开发者计划政策
- 通用数据保护条例 (GDPR) 原则
- 加州消费者隐私法 (CCPA) 原则
- 儿童在线隐私保护法 (COPPA) 原则

---

## Summary / 摘要

**English - Key Points**:
- ✅ No data collection by the developer
- ✅ Data sent directly to your chosen AI service provider
- ✅ All settings and cache stored locally in your browser
- ✅ No third-party sharing
- ✅ No tracking or analytics
- ✅ You control all data
- ✅ Open source code for transparency

**中文 - 关键要点**：
- ✅ 开发者不收集数据
- ✅ 数据直接发送到您选择的 AI 服务提供商
- ✅ 所有设置和缓存都在浏览器本地存储
- ✅ 不与第三方共享
- ✅ 无追踪或分析
- ✅ 您控制所有数据
- ✅ 开源代码，透明可查
