# hexo-sil-audio 使用说明

`hexo-sil-audio` 是本仓库的本地 Hexo 插件，提供普通文章音乐和播客共用的播放器。
核心负责音频元数据、HTML 结构、无障碍属性和播放交互；外观由可替换的皮肤负责。它不会生成
RSS，也不会把音乐加入 `/podcasts/`。

## 配置

本地音频默认位于 `source/files/`，并以 `/files/` 提供：

```yaml
audio:
  media:
    source_dir: source/files
    public_path: /files/
  skin:
    builtin: ephesus
    # override: /css/hexo-sil-audio.local.css
```

`source_dir` 和 `public_path` 都可修改为安全的相对路径。普通文章音乐不使用
`podcast.media`，后者仍只用于播客 RSS enclosure。

## 播放器皮肤

默认内置皮肤名为 `ephesus`。构建时插件会自动生成 `/css/hexo-sil-audio.css`，并在页面中加载它；
因此未来作为 npm 插件安装时，默认样式也会随包提供，无须复制 CSS 文件。

`audio.skin.override` 是可选的站内根路径 CSS（例如 `/css/hexo-sil-audio.local.css`），在默认皮肤
之后加载，可只覆盖需要调整的规则。它必须是以 `/` 开头、以 `.css` 结尾的站内路径，不能包含
查询字符串或 `.`、`..` 路径段。

要完全自行设计播放器，关闭内置皮肤即可：

```yaml
audio:
  skin:
    builtin: false
    override: /css/my-audio-skin.css
```

未加载皮肤时播放器仍保留浏览器原生音频控件和可操作的 HTML 按钮，但不会有默认布局或配色。

### 自定义皮肤接口

以下类名和状态属性是自定义皮肤可依赖的接口：

- 根节点与区块：`.sil-audio-player`、`__header`、`__status`、`__meta`、`__audio`、`__controls`、`__footer`。
- 控件：`__play-button`、`__volume-button`、`__download`、`__progress`、`__current`、`__duration`。
- 状态属性：`data-sil-audio-enhanced`、`data-sil-audio-playing`、`data-sil-audio-muted`、
  `data-sil-audio-loading`、`data-sil-audio-error`、`data-sil-audio-title-overflow` 和
  `data-sil-audio-theme`。

Ephesus 皮肤使用这些状态实现加载提示、播放/静音图标切换、标题滚动和明暗模式。当前布局为：进度
位于卡片中部；底部从左至右依次为静音、播放/暂停和圆形下载按钮。

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
