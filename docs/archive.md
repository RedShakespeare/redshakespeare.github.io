# hexo-sil-archive 使用说明

`hexo-sil-archive` 是本仓库的本地 Hexo 插件，用于生成可筛选、可下载的资料库。启用资产集成时读取
版本化清单；资产插件缺失时从 `source/<prefix>/` 生成同样的目录树。

## 配置

配置位于 `_config.yml` 的 `archive` 段。`prefix` 是清单 object key 和站内下载路径的共同前缀，例如
`files/hxh_civ`。`source_dir` 是资产插件缺失时实际读取的 legacy 本地目录。

```yaml
archive:
  assets:
    enabled: true
  skin:
    builtin: ephesus
    # override: /css/hexo-sil-archive.local.css

  defaults:
    prefix: files
    # source_dir: files
    title: 搜索...
    placeholder: 输入文件名或目录名
    hint: 支持搜索文件名和目录名称

  collections:
    hxh-civ:
      prefix: files/hxh_civ
      # source_dir: files/hxh_civ
```

文件链接固定使用最终的 `prefix`，因此上例会指向 `/files/hxh_civ/`。`source_dir` 相对于 Hexo
`source/`，仅在 legacy 本地目录不同于 prefix 时填写。目录索引会生成到
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
{% archive prefix=files/rl title="Roguelike 文件搜索" %}
{% archive prefix=files/releases source_dir=legacy/releases title="下载归档" %}
```

支持的标签字段为 `collection`、`prefix`、`source_dir`、`title`、`placeholder`、`hint`。
字段优先级为：**标签参数 > `collections.<name>` > `defaults`**。只配置 prefix 时，legacy source_dir
默认使用同一相对目录；只配置 source_dir 时，它也会作为 prefix 使用。

一个页面可以放置多个卡片。相同 prefix 只能映射到同一个 legacy 源目录，否则构建会失败，避免生成不确定的
`tree.json`。

## 文件与安全规则

- `prefix` 和 `source_dir` 必须是安全的相对目录，不能包含绝对路径、`..`、查询字符串或片段。
- 配置的前缀在资产清单中没有对象时，Hexo 构建失败。
- 目录树会忽略 `tree.json`、`index.html`、隐藏文件、`.DS_Store` 和 `Thumbs.db`。
- 清单会保存上传时计算的实际文件大小和 SHA-256；构建不会读取 Git LFS 指针。

## 自定义皮肤接口

自定义 CSS 可使用 `.sil-archive-card` 及其 `__header`、`__title`、`__meta`、`__control`、
`__input`、`__clear`、`__hint`、`__root` 元素。卡片会设置 `data-sil-archive-theme="light|dark"`，
加载失败时设置 `data-sil-archive-error="true"`。

## 验证

```bash
npm run test:hexo-sil-archive
npm run build
```
