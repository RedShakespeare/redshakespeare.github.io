# hexo-sil-video（本地开发版）

为 Ephesus 提供支持 R2 资产清单的 MP4、M4V、WebM 视频播放器，以及由 JASSUB 渲染的
ASS/SRT 字幕。插件当前由 `scripts/hexo-sil-video.js` 加载；稳定后再提取到 npm workspace。

## 配置

```yaml
video:
  assets:
    enabled: true
  media:
    prefix: files
    # source_dir: files
    # url: https://media.example.com/files/
  preload: metadata
  aspect_ratio: 16/9
  subtitles:
    fonts:
      # Noto Sans CJK SC: video/fonts/NotoSansCJKsc-Regular.woff2
    # fallback_font: Noto Sans CJK SC
  skin:
    builtin: ephesus
    # override: /css/hexo-sil-video.local.css
```

字幕和自定义字体必须位于 `video.media.prefix` 下；当 `hexo-sil-assets` 不可用时，插件会从
`video.media.source_dir` 回退读取 legacy 本地文件。`source_dir` 只在 legacy 目录与 prefix 不同时填写，
`url` 只在整组媒体通过外部 HTTPS 基址提供时填写。

## 文章

```yaml
video:
  file: video/demo.mp4
  title: 演示视频
  poster: video/demo.webp
  subtitles:
    - file: video/demo.ass
      srclang: zh-Hans
      label: 简体中文
      default: true
    - file: video/demo.srt
      srclang: en
      label: English
```

视频源可以将 `file` 替换成绝对 HTTPS `url`。`{% video %}` 可把 Front Matter 播放器放到正文指定位置；
没有标签时插件自动将播放器放到文章开头。ASS/SRT 必须使用 UTF-8。

## 操作

播放器提供播放、进度、悬浮音量、字幕、七档倍速、单次/循环、全屏和下载控件。播放器卡片或视频画面
获得焦点时，空格播放或暂停，Enter 进入全屏，Esc 只退出全屏，上下键以 5% 调节音量，左右键以五秒
调节进度，M 切换静音。单次播放结束后播放按钮变为重播；循环模式则自动从头继续。

浏览器运行时依赖 JASSUB 2.5.7、subsrt 1.1.1，并由 esbuild 在 Hexo 生成阶段打包。播放器不使用
CDN；JASSUB Worker、WASM 和默认字体均生成到站点自身路径。
