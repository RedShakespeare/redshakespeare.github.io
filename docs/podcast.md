# hexo-sil-podcast 使用说明

`hexo-sil-podcast` 是本站通过 npm 安装的 Hexo 插件。它会为带 `podcast` front matter 的文章生成播客订阅源；
播放器由独立的 `hexo-sil-audio` 提供。普通博客 RSS `/atom.xml` 不会包含音频 enclosure。

## 网站中的位置

播客文章同时是 Show Notes，因此会保留在首页 `Writings`，可被普通文章搜索、归档和
RSS 收录。`hexo-sil-podcast` 本体不依赖具体主题；当前 Inside 主题的播客列表由独立扩展
`hexo-sil-podcast-inside` 提供。

扩展可用时，侧栏的 `🎙 Podcasts` 指向 `/podcasts/`，页面使用与 `Writings` 相同的列表、
分页和卡片样式，并按 `podcast` front matter 筛选文章，而不是按标签筛选。脚手架仍默认写入
`Podcast` 标签：这是扩展缺失或与定制主题不兼容时自动回退到 `/tags/Podcast/` 的兼容入口。

## 工作模式

配置位于 `_config.yml` 的 `podcast` 段：

```yaml
podcast:
  dry_run: true
  inside:
    enabled: true
  path: podcast.xml
  assets:
    enabled: true
  media:
    # prefix: files
    # source_dir: files
    # url: https://media.example.com/files/
```

`dry_run: true` 是当前默认值：文章播放器照常生成，但不会生成
`public/podcast.xml`，也不会改变 `/atom.xml`。它适合调试前端；若节目已公开
订阅，不要重新打开它，否则下一次部署会移除 `/podcast.xml`。

### Inside 列表扩展

`podcast.inside.enabled` 默认为 `true`。启用后，安装依赖时会由
`hexo-sil-podcast-inside` 的 postinstall 在当前的 Inside 编译产物中寻找四个精确锚点；全部
匹配时才插入 `/podcasts/` 路由和独立分页支持。它只替换这些最小片段，不会以官方主题包
覆盖你的定制主题。

若当前主题版本或定制方式使任一锚点不匹配，扩展不会修改任何主题文件；构建时会给出警告，
并将侧栏菜单自动指向 `/tags/Podcast/`。因此保留 `Podcast` 标签即可正常继续发布，不会
出现失效链接。设为 `false` 会关闭扩展并隐藏该侧栏菜单；播放器、文章和播客 RSS 均不受
影响。

准备公开订阅源时，将 `dry_run` 改成 `false`，换掉临时 `favicon.png` 封面。站内封面只接受
无透明通道的 PNG/JPEG、1400–3000px 正方形图片；当前的 500px RGBA favicon 会被正式构建拒绝。
还必须至少有一集已发布播客、有效的 HTTPS 频道 URL，以及 Apple Podcasts 支持的分类。

执行 `npm run build` 后再部署。GitHub Actions 会先运行相同的完整预检；任何 RSS 校验或 Hexo
生成失败都会阻止 R2 同步和 Pages 部署。部署完成后运行：

```bash
npm run verify:podcast
```

该命令会检查公开的 `https://www.ephesus.top/podcast.xml`、封面和每个 enclosure 的 HTTPS、HEAD、
Range、内容类型与字节数。验证其他环境时使用
`npm run verify:podcast -- --url https://example.com/podcast.xml`。线上验证不会回滚既有部署，
因为 Pages URL 只有部署后才能访问。RSS 的 `lastBuildDate` 取最新一集的发布日期，不会因单纯重新构建而变化。

## 推荐：本地音频自动模式

把音频放到维护机的 `source/files/`，运行 `npm run publish` 后，只填写相对于 `files/` R2 前缀的 ASCII 路径：

```yaml
---
title: 第 1 集标题
date: 2026-07-13 20:00:00
tags:
  - Podcast
podcast:
  file: podcast/episode-001.mp3
  episode: 1
  season: 1
  episode_type: full
  explicit: false
  summary: 本集简介，会显示在播客客户端中。
  # guid: 发布后不要修改；省略时为 R2 音频 URL。
  # image: 可选的单集正方形封面 URL。
---

这里是本集的 Show Notes。
```

例如 `podcast/episode-001.mp3` 对应资产清单中的
`files/podcast/episode-001.mp3`。插件会自动读取：

- 音频文件字节数，写入 RSS enclosure 的 `length`；
- 音频时长，写入播放器和 `itunes:duration`；
- 文件扩展名对应的 MIME 类型。

文章页面的播放器和下载链接指向 `/files/podcast/episode-001.mp3`。RSS enclosure 与默认 GUID 会用
站点 `url` 解析为 `https://www.ephesus.top/files/podcast/episode-001.mp3`，由现有 Worker 转发到 R2。
只有媒体需要直接使用其他 HTTPS 域名时才配置 `podcast.media.url`；它会同时覆盖页面与 RSS 地址。

`podcast.file` 必须位于有效 `podcast.media.prefix` 下；该 prefix 未配置时继承 `audio.media.prefix`。路径不能使用 `..`、反斜杠、
查询字符串或非 ASCII 文件名，也不能同时保留旧的 `audio`、`type`、`length`、
`duration` 字段。插件会拒绝清单中不存在、缺少时长或未知格式的文件。

### 支持的本地格式

自动模式支持以下扩展名（实际时长在 `npm run publish` 时由 `music-metadata` 写入清单）：

| 格式 | RSS MIME 类型 |
| --- | --- |
| MP3 | `audio/mpeg` |
| M4A、M4B、MP4 | `audio/mp4` |
| AAC | `audio/aac` |
| OGG | `audio/ogg` |
| Opus | `audio/opus` |
| WAV | `audio/wav` |
| FLAC | `audio/flac` |
| AIFF | `audio/aiff` |
| WebM | `audio/webm` |

MP3 是浏览器与播客客户端兼容性最好的选择。正式发布前还应确认文件服务支持
HTTPS、`HEAD` 和 Range 请求。

## 兼容：手动外链模式

历史文章可以继续保留完整的外部 HTTPS 音频元数据，无需迁移：

```yaml
podcast:
  audio: https://dl.ephesus.top/files/podcast/episode-001.mp3
  type: audio/mpeg
  length: 12345678
  duration: "00:42:10"
  episode: 1
  season: 1
  summary: 本集简介
```

手动模式要求 `audio` 为 ASCII 的绝对 HTTPS URL，`type` 为 `audio/*`，`length`
为正整数，`duration` 为 `MM:SS` 或 `HH:MM:SS`。播放器也会直接使用该 URL。

## 可选单集字段

| 字段 | 默认值 / 作用 |
| --- | --- |
| `episode` | 正整数；显示并写入 RSS 集数 |
| `season` | 正整数；写入 RSS 季数 |
| `episode_type` | `full`；也可为 `trailer` 或 `bonus` |
| `explicit` | 继承频道的 `podcast.explicit` |
| `summary` | 本集纯文本简介；缺省时从正文提取 |
| `guid` | 默认音频 URL；发布后保持不变 |
| `image` | 单集封面 URL；缺省时使用频道封面 |

同一订阅源中不得出现重复的音频 URL 或 GUID。替换已经发布的音频时，应新建一集，
不要复用旧 URL。

## 新建与预览

执行下面命令会使用 `scaffolds/podcast.md` 创建采用自动模式的文章：

```bash
npx hexo new podcast "episode-001"
npm run build
npm run server
```

打开新文章，确认播放器、时长和下载链接正常。播放器由 `hexo-sil-audio` 统一提供，默认使用
Ephesus 皮肤；播放器头部显示文章标题。启用 JavaScript 时，播放器提供播放、进度、静音与下载控制：
底栏五个元素的中心依次处于播放器卡片外边界的 10%、30%、50%、70% 与 90%；进度条从 10% 延至 90%，
两端与时间中心对齐。浅色模式为白底浅紫色与淡紫轨道，
深色模式为黑底主题深紫色。皮肤可通过 `audio.skin` 配置覆盖或替换，详见 [音频插件文档](audio.md)。
禁用 JavaScript 时会回退到浏览器原生音频控件。

可用以下命令验证插件：

```bash
npm run test:hexo-sil-podcast
npm run test:hexo-sil-audio
npm run test:hexo-sil-podcast-inside
npm run test:podcast-feed-verifier
npm run build
```

## 频道配置

| 字段 | 用途 |
| --- | --- |
| `path` | RSS 输出路径，默认 `podcast.xml` |
| `title`、`description`、`author` | 播客客户端展示的频道信息 |
| `email` | 公开的联系和平台所有权验证邮箱 |
| `language` | 频道语言，例如 `zh-CN` |
| `link` | 节目主页链接 |
| `image` | 频道封面；站内图片必须是无透明通道的 1400–3000px PNG/JPEG 正方形 |
| `category` | 必填；Apple Podcasts 精确主分类与可选子分类 |
| `explicit` | 默认的成人内容标记 |
| `limit` | `0` 表示输出全部已发布集数；正整数表示最新 N 集 |
| `inside.enabled` | `true` 时启用独立的 Inside 播客列表；`false` 时隐藏其侧栏入口 |
| `media.prefix` | 清单键和站内媒体路径前缀；缺省时继承 `audio.media.prefix` |
| `media.source_dir` | legacy 本地目录，相对于 `source/`；默认等于有效 prefix |
| `media.url` | 可选外部 HTTPS 媒体根 URL；同时覆盖页面与 RSS 地址 |

当 `dry_run: false` 时，`title`、`description`、`author`、`email`、
`language`、`image` 和 `category.text` 都不能为空；邮箱必须是可公开使用的有效联系地址，
频道链接、RSS、封面与 enclosure 都必须为 ASCII HTTPS URL。分类名称区分大小写，必须与 Apple
Podcasts 分类表精确一致；例如当前的 `Leisure / Games` 有效。正式 feed 至少包含一集已发布文章，
`itunes:explicit` 输出为 `true` 或 `false`。
