# YT Downloader & GitHub Auto-Push

Chrome 扩展程序，支持在 YouTube 视频页面一键下载视频，并自动提交到你的 GitHub 仓库。

## 功能特性

- 自动检测当前 YouTube 视频页面，填充 URL
- 支持 360p / 480p / 720p / 1080p / 最高画质
- 支持 MP4、WebM、MP3（仅音频）格式
- 下载视频到本地 Chrome 下载目录
- 通过 GitHub Contents API 将视频 Base64 上传到仓库
- 自定义 Commit 消息模板（支持 `{title}` `{filename}` `{date}` 变量）
- "仅下载"和"下载并推送"两种模式
- 实时日志和进度条，设置持久化保存

## 安装方法

1. 打开 `chrome://extensions/`
2. 右上角开启**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择本目录

## 使用方法

1. 打开任意 YouTube 视频页面
2. 点击扩展图标
3. 填写 GitHub Token、用户名、仓库名（仅首次需要，之后自动保存）
4. 点击**下载并推送**

## GitHub Token 申请

1. 访问 https://github.com/settings/tokens/new
2. 勾选 `repo` 权限（或仅 `public_repo`）
3. 生成并复制 Token（格式：`ghp_xxxxx`）

> Token 仅保存在本地浏览器存储中，不会上传到任何服务器

## Commit 消息模板变量

| 变量 | 说明 |
|------|------|
| `{title}` | 视频标题 |
| `{filename}` | 下载文件名 |
| `{date}` | 当天日期（YYYY-MM-DD）|

## 视频解析说明

使用 [cobalt.tools](https://cobalt.tools) 开源 API，免费、无需登录、不收集数据。

> 注意：YouTube 视频下载可能受版权限制，请仅下载你有权限的内容。

## GitHub 大文件限制

GitHub API 单文件上限 **50MB**，超过建议使用 [Git LFS](https://git-lfs.github.com/) 或选择较低画质。

## 文件结构

```
yt-downloader-extension/
├── manifest.json
├── popup.html
├── popup.js
├── background.js
├── content.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## 隐私说明

所有数据仅在本地和 GitHub API 之间传输，不收集任何用户数据。
