# hexo-sil-archive 使用说明

`hexo-sil-archive` 是本仓库的本地 Hexo 插件，用于把站内静态文件目录生成为可筛选、可下载的资料库。
它在构建时读取目录并生成 `tree.json`；浏览器只读取该 JSON，不会暴露服务器目录接口。

## 配置

配置位于 `_config.yml` 的 `archive` 段。`source_dir` 相对于 Hexo 的 `source/` 目录，例如
`files/hxh_civ` 实际读取 `source/files/hxh_civ`。

```yaml
archive:
  skin:
    builtin: ephesus
    # override: /css/hexo-sil-archive.local.css

  defaults:
    source_dir: files
    title: 搜索...
    placeholder: 输入文件名或目录名
    hint: 支持搜索文件名和目录名称

  collections:
    hxh-civ:
      source_dir: files/hxh_civ
      # public_path: files/hxh_civ
```

`public_path` 通常不必填写：它默认等于最终的 `source_dir`，因此上例的文件链接会指向
`/files/hxh_civ/`。只有静态文件的公开 URL 与源目录不同才需要显式覆盖它。目录索引会生成到
`/archive-data/<稳定标识>.json`；该路径独立于文件公开路径，因此文件可以由 R2 提供，而索引仍由
Hexo 页面正常发布。

默认皮肤名为 `ephesus`。插件构建时会自动输出 `/css/hexo-sil-archive.css` 并加载；它沿用本站
音频播放器的白底/黑底、8px 圆角和左侧主题色强调边框。设为 `false` 可关闭内置皮肤，
`skin.override` 可在其后加载站内 CSS 覆盖样式。

## 在页面中插入资料库

命名资料库最简洁：

```markdown
{% archive collection=hxh-civ %}
```

也可以不预先创建资料库，直接在 Markdown 标签中声明目录：

```markdown
{% archive source_dir=files/rl title="Roguelike 文件搜索" %}
{% archive source_dir=files/releases public_path=downloads/releases title="下载归档" %}
```

支持的标签字段为 `collection`、`source_dir`、`public_path`、`title`、`placeholder`、`hint`。
字段优先级为：**标签参数 > `collections.<name>` > `defaults`**。如果高优先级标签覆盖
`source_dir`、但没有同时给出 `public_path`，插件会按新的源目录重新推导公开路径。

一个页面可以放置多个卡片。相同公开路径只能映射到同一个源目录，否则构建会失败，避免生成不确定的
`tree.json`。

## 文件与安全规则

- `source_dir` 和 `public_path` 必须是安全的相对目录，不能包含绝对路径、`..`、查询字符串或片段。
- 配置的源目录不存在或不是目录时，Hexo 构建失败。
- 目录树会忽略 `tree.json`、`index.html`、隐藏文件、`.DS_Store` 和 `Thumbs.db`。
- Git LFS 指针会读取其声明的实际文件大小，而不是指针文件本身的大小。

## 自定义皮肤接口

自定义 CSS 可使用 `.sil-archive-card` 及其 `__header`、`__title`、`__meta`、`__control`、
`__input`、`__clear`、`__hint`、`__root` 元素。卡片会设置 `data-sil-archive-theme="light|dark"`，
加载失败时设置 `data-sil-archive-error="true"`。

## 验证

```bash
npm run test:hexo-sil-archive
npm run build
```
