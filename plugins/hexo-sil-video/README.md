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

播放器提供播放、进度、纵向悬浮音量、字幕、七档倍速、单次/循环、真全屏和下载控件。音量图标按
静音、低、中、高四档显示，鼠标离开音量区后延迟收起滑杆。全屏只放大视频 stage，控制条覆盖在画面上，
播放时无操作会自动隐藏。单击视频画面播放或暂停，鼠标双击切换全屏；进入或退出全屏后播放器会继续
保持键盘焦点。播放器卡片或视频画面获得焦点时，空格播放或暂停，Enter 进入全屏，Esc 只退出全屏，
上下键以 5% 调节音量，左右键以五秒调节进度，M 切换静音。所有由键盘、按钮或滑杆发起的音量和
进度调整都会在画面中央短暂显示当前百分比或时间。单击画面切换播放状态时，中央还会短暂显示带
半透明圆形底的播放或暂停图标。单次播放结束后播放按钮变为重播；循环模式则自动从头继续。
进度条以主题原色显示已播放部分，以稍淡的主题色精确显示所有已缓冲区段，未加载区段保持轨道底色；
跳转导致缓冲区不连续时不会把中间空洞误标为已加载。

在支持屏幕方向锁定的安卓浏览器中，全屏会尝试切换到横屏，退出全屏后解除锁定。触摸视频区域时，
左右滑满画面宽度可预览前后 60 秒并在松手时跳转；左半边上下滑动将视频和字幕亮度在 0%–200% 间
调整，右半边上下滑动调整视频音量。触屏双击左半边后退 15 秒，双击右半边前进 15 秒；全屏控制层
隐藏时双击不会将其唤出，单击则在双击判定结束后只唤出控制层。原画亮度为 100%。PC 上播放器获得
焦点后，在视频区域滚动鼠标滚轮也会以 5% 调整音量。亮度、音量和手势进度均使用画面中央提示。

浏览器运行时依赖 JASSUB 2.5.7、subsrt 1.1.1，并由 esbuild 在 Hexo 生成阶段打包。播放器不使用
CDN；JASSUB Worker、WASM 和默认字体均生成到站点自身路径。
