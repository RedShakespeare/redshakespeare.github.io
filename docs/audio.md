# hexo-sil-audio 使用说明

`hexo-sil-audio` 是本仓库的本地 Hexo 插件，提供普通文章音乐和播客共用的播放器。
它负责播放器主题色、暗色模式、加载状态、进度、音量和下载；它不会生成 RSS，也不会把音乐
加入 `/podcasts/`。

## 配置

本地音频默认位于 `source/files/`，并以 `/files/` 提供：

```yaml
audio:
  media:
    source_dir: source/files
    public_path: /files/
```

`source_dir` 和 `public_path` 都可修改为安全的相对路径。普通文章音乐不使用
`podcast.media`，后者仍只用于播客 RSS enclosure。

## 在文章中插入音乐

在 Front Matter 中定义一首默认音乐；没有行内标签时，播放器会自动放在正文开头：

```yaml
---
title: 一篇有音乐的文章
music:
  file: music/example.mp3
  title: 可选的曲名
---
```

也可以在 Markdown 任意位置插入：

```markdown
{% music %}
{% music file="music/example.mp3" title="可选的曲名" %}
{% music audio="https://media.example.com/example.mp3" title="外链曲名" %}
```

`{% music %}` 使用 Front Matter 的默认音乐并控制其位置。带参数的标签会覆盖默认字段；
显式 `file` 或 `audio` 会替换默认音源。只要文章内存在音乐标签，就不会再在开头重复插入
默认播放器；因此一篇文章可以放置多首音乐。

音源必须唯一选择本地 `file` 或绝对 HTTPS `audio`。本地路径相对于 `audio.media.source_dir`，
支持 MP3、M4A/M4B/MP4、AAC、OGG、Opus、WAV、FLAC、AIFF 和 WebM，并自动读取时长与
MIME 类型。外链音频的时长会在浏览器取得元数据后显示。

播放器标题依次使用：显式 `music.title` 或标签 `title`、文章标题、本地音频内嵌标题、文件名。
外链音频没有内嵌标题读取，会最后回退到 URL 文件名。

## 验证

```bash
npm run test:hexo-sil-audio
npm run build
```
