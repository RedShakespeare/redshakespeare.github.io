# hexo-sil-video（本地开发版）

为 Ephesus 提供支持 R2 资产清单的 MP4、M4V、WebM、OGG/OGV、MPEG、MOV、3GP/3G2 视频播放器，以及由 JASSUB 渲染的
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
  download: false
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

`download` 默认为 `true`；设置为 `false`，或在标签中使用 `{% video file=video/demo.mp4 download=false %}`，
会隐藏视频工具栏中的下载按钮。

## 操作

播放器提供播放、进度、纵向悬浮音量、字幕、七档倍速、真全屏和下载控件。视频始终单次播放，播放完成后
播放按钮变为重播。音量图标按
静音、低、中、高四档显示，鼠标离开音量区后延迟收起滑杆。全屏只放大视频 stage，控制条覆盖在画面上，
播放时无操作会自动隐藏。单击视频画面播放或暂停，鼠标双击切换全屏；进入或退出全屏后播放器会继续
保持键盘焦点。播放器卡片或视频画面获得焦点时，空格播放或暂停，Enter 进入全屏，Esc 只退出全屏，
上下键以 5% 调节音量，左右键以五秒调节进度，M 切换静音。所有由键盘、按钮或滑杆发起的音量和
进度调整都会在画面中央短暂显示当前百分比或时间。单击画面切换播放状态时，中央还会短暂显示带
半透明圆形底的播放或暂停图标。
进度条以主题原色显示已播放部分，以略深于未加载轨道的主题色精确显示所有已缓冲区段；
跳转导致缓冲区不连续时不会把中间空洞误标为已加载。

在支持屏幕方向锁定的安卓浏览器中，全屏会尝试切换到横屏，退出全屏后解除锁定。触摸视频区域时，
左右滑满画面宽度可预览前后 60 秒并在松手时跳转；左半边上下滑动将视频和字幕亮度在 0%–200% 间
调整，右半边上下滑动调整视频音量。触屏双击左半边后退 15 秒，双击右半边前进 15 秒；全屏控制层
隐藏时双击不会将其唤出，单击则在双击判定结束后只唤出控制层。原画亮度为 100%。PC 上播放器获得
焦点后，在视频区域滚动鼠标滚轮也会以 5% 调整音量。亮度、音量和手势进度均使用画面中央提示。

普通页面只注入一个很小的内联 bootstrap；只有初始 HTML 或 Inside 动态内容中实际出现播放器时，
浏览器才加载皮肤和播放器核心。核心增强成功前保留原生 `video controls`，皮肤或脚本失败时也继续使用
原生控件。

浏览器运行时依赖 JASSUB 2.5.7、subsrt 1.1.1，并由 esbuild 在 Hexo 生成阶段拆成核心和字幕 ESM 包。
默认字幕在首次 focus、keydown、pointerdown、wheel 或 play 后才激活；没有字幕或从未交互的播放器不会
请求字幕包、Worker、WASM 或字体。播放器不使用 CDN；这些资源均生成到站点自身路径。

运行 `npm run test:hexo-sil-video` 执行 JSDOM 回归测试，运行
`npm run test:hexo-sil-video:browser` 执行 Chromium 与 WebKit Playwright 门禁。
