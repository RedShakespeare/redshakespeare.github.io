# R2 资产维护

本站的大型静态资产的目标发布源是 R2。`source/_data/assets.json` 清单包含对象大小、SHA-256、MIME
类型，以及音频的时长和标题。显式开启各插件的 assets 集成后，Hexo 构建从该清单读取；若
`hexo-sil-assets` 未安装，则各插件回退到 `source/<prefix>/` 的 legacy 文件。

清单的 `state` 是受 Git 版本控制的迁移开关：当前 `legacy` 状态保留旧的 LFS/rclone 部署桥接；只有
`npm run assets:migrate -- --finalize` 将每个 R2 对象验证完成后，才会写入 `r2` 状态。`r2` 状态的
Pages 流水线不会安装 git-lfs/rclone，也不会发布 `public/files/`。这避免了仅靠 Actions 环境变量切换时，
迁移提交错误清空 R2 的风险。

`source/files/` 与 `source/img/df.zip` 仍是维护机上的本地工作目录。它们只会在迁移完成、清单进入
`r2` 状态时被自动写入 `.gitignore`；在 `legacy` 状态下仍完全遵循原有 Git LFS 工作流。

## 首次配置与恢复

需要 Node 20+，并在终端环境中设置下列 R2 凭据；它们绝不能写入 Git 或 Markdown：

```text
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET=ephesus-files
```

新机器只在需要修改某个资料目录时拉取它：

```shell
npm ci
npm run assets:pull -- --prefix files/hxh_civ
```

第一次需要完整本地副本时使用 `npm run assets:pull -- --prefix files`。工具只恢复清单中声明的对象，并在
写入目标文件前校验大小和 SHA-256。已拉取范围会记录到未跟踪的 `.assets-workspace.json`；发布只会把该范围
内确实删除的文件从 R2 移除，避免部分拉取误删。

`source/img/df.zip` 可单独恢复：

```shell
npm run assets:pull -- --prefix img/df.zip
```

## 日常发布

### Legacy 过渡期

清单为 `state: legacy` 时，提交方式与原有流程一致：把文件放入 `source/files/` 后照常执行
`git add`、`git commit`、`git push`。CI 会在 LFS 资源准备完成后、测试和 Hexo 构建之前自动执行
`npm run assets:seed`，仅在 runner 中刷新清单；它不会反向提交生成结果。新增的资料库文件和本地音频
因此会进入该次构建，旧的 rclone 镜像步骤也照常运行。

本地预览新增音频或资料库文件时，先运行一次 `npm run assets:seed`，再执行 `npm run build`；这只刷新
本地清单，不会上传 R2。

### R2-only 日常发布

清单进入 `state: r2` 后，工作流是：编辑文件、文章或代码，然后运行一次：

```shell
npm run publish
```

该命令会先确认本地 `src` 未落后于 `origin/src`，列出资产新增、修改和删除，再要求确认。它随后：

1. 计算文件 SHA-256、MIME 类型和音频元数据，并直接上传到 R2；大文件自动使用 S3 multipart upload。
2. 通过 R2 `HEAD` 复核大小和 SHA-256，更新排序稳定的 `source/_data/assets.json`。
3. 执行资产、音频、资料库、播客和 Hexo 构建校验。
4. 展示 Git 变更，交互式询问 commit message，最后提交并推送 `src`。

先预览而不写入：

```shell
npm run publish -- --dry-run
```

只维护一个已拉取目录时可显式传入范围：

```shell
npm run publish -- --prefix files/podcast
```

在 `r2` 状态下，直接 `git commit` 和 `git push` 仅适用于没有资产变化的提交；它们无法看到被忽略的
本地文件。若命令发现改变的文件仍是 Git LFS 指针，会停止并要求先在该维护机拉取真实内容，绝不会把指针
上传到 R2。

## 资料库、音频和播客

- 资料库、普通音频和播客统一使用 `prefix`，例如 `files/hxh_civ`；它同时是清单键前缀与默认站内路径。
- `source_dir` 相对于 Hexo `source/`，仅在 legacy 本地目录与 prefix 不同时配置。
- 普通音频和播客仍可写 `file: podcast/example.mp3`。资产集成可用时从清单读取字节数、MIME 和时长；legacy 回退时直接读取本地文件。
- `/files/...` 链接保持不变。`/img/df.zip` 同样保留，由 Worker 映射到 R2。

## 一次性迁移与审计

旧仓库首次切换时，必须在一个已完整拉取 LFS 的维护机上运行：

```shell
git lfs pull --include="source/files/**,source/img/df.zip"
npm run assets:migrate -- --finalize
npm run publish
```

`assets:migrate -- --finalize` 为每个对象重算 SHA-256，向 R2 补传或覆写不匹配对象，并在上传后逐项复核。
只有完整的 `files` 与 `img/df.zip` 范围都通过验证后，才会把清单切换到 `r2`、自动写入忽略规则，并执行
`git rm --cached` 停止跟踪本机二进制文件（文件本身会保留在磁盘）。随后一次 `npm run publish` 会完成构建、
提交和推送；该提交的 Pages 工作流由清单状态自动切换为 R2-only，不需要配置 GitHub Actions 变量。

若只想预先补传或审计，省略 `--finalize`；它不会切换部署，也不会修改 Git 索引。切换前可额外执行
`npm run assets:verify -- --remote`。

首次切换时，请先提交这套迁移代码并保持清单为 `state: legacy`；待迁移命令成功后部署 Worker 的
`/img/df.zip` 路由，再运行上面的 `npm run publish`。这样 Worker 绝不会在 R2 对象就绪前接管下载请求。

要审计已管理资产而不连接 R2：

```shell
npm run assets:verify
```

显式删除单个对象（不会接受通配符）：

```shell
npm run assets:delete -- --key files/example/old.zip
```

删除会要求确认，并更新清单；随后运行 `npm run publish` 提交该清单变更。

从当前分支删除文件只会停止未来双传，不会自动抹去 GitHub LFS 的历史对象或历史计费。该项清理需要单独评估，
不能在日常发布中执行。
