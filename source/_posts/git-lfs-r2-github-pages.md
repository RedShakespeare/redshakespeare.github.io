---
title: GitHub Pages + CloudFlare R2 cdn 工作流：以以弗所为例 
date: 2026-07-11 05:20:00
tags:
  - 技术分享
  - Hexo
  - GitHub Actions
  - Git LFS
  - Cloudflare
  - R2
---

上个月群友问有没有适合上班摸鱼的 H5 游戏，本来想说之前部署过 js 版 poa，进去试了一下发现页面加载不出来， asset文件丢了，游戏本体识别不出来资源。前两天有新群友看我的 [Archive RL S](/roguelike/)，说里面不少文件下载后打不开，而且小得不正常。我自己下了个nh试试，结果解压不了，拿文本编辑器打开发现里面是 Git LFS 的指针：

```txt
version https://git-lfs.github.com/spec/v1
oid sha256:...
size 5044120
```

去年工作流重构之后以弗所的源码放在 `src` 分支，每次 push 后，GitHub Actions 构造 hexo 环境编译一个 `public/`推送到 `main` 分支，然后再部署到 GitHub Pages上。当时没仔细检查，测了几个小文件下载正常还以为文件都放上去了。

白天上班摸鱼的时候和 gpt 5.5 chat定位了一下问题，说是 Github 会强制拒绝 100MB 以上的大文件，并且 GitHub Pages 也强制要求网站本体在 1GB 以内，之前配的部署前根据索引获取 lfs 文件没办法实现。gpt推荐说CloudFlare R2 提供免费的 10 GB 内、百万次访问量级 cdn 服务，晚上 strange mood 大爆发，想把这个做掉算了。

我的预期是上传文件和博文的流程和之前完全一致，Actions 检测 src 提交之后自动把改动同步到 R2 数据服务上，Pages 则不再保留 `files/`路径。先用讯飞 Coding Plan 的 GLM 5.2 配 Claude Code 出了一版方案，顺便把以弗所的 nameserver 迁到 Cloudflare 方便之后配置自定义cdn域名，但是它一直在thinking，token哗哗掉，ctrl+o一看发现在说车轱辘话。想起来 GPT 5.6 上 Plus 了，就改用 codex 调 5.6 Terra xHigh 试试。

大文件主要在 `source/files/`， 镜像到 R2。路径保持一致：

```txt
source/files/rl/adom/adomgb/tiles/item319.png
                         ↓
R2: files/rl/adom/adomgb/tiles/item319.png
```

桶绑定了 `dl.ephesus.top`，所以可以直接拿一个文件试试：

```txt
https://dl.ephesus.top/files/rl/adom/adomgb/tiles/item319.png
```

问题在于`files/` 里有一堆H5游戏和文章引用的图片，如果修改引用地址那所有对应的文件都要大改，非常折腾。GPT 5.6 提的办法省心很多：给 `www.ephesus.top/files/*` 配一个 Worker，把原路径的请求拿去读 R2 里同名的 key，这样什么都不用动。

```txt
www.ephesus.top/files/rl/adom/adomgb/tiles/item319.png
        ↓
Worker
        ↓
ephesus-files 的 files/rl/adom/adomgb/tiles/item319.png
```

## Worker

Worker 在 `workers/ephesus-files-proxy/`。主要做了两件事，一是绑定 `ephesus-files`，二是把 `www.ephesus.top/files/*` 给它重定向。

```jsonc
{
  "name": "ephesus-files-proxy",
  "main": "src/index.js",
  "workers_dev": false,
  "r2_buckets": [
    {
      "binding": "EPHESUS_FILES",
      "bucket_name": "ephesus-files"
    }
  ],
  "routes": [
    {
      "pattern": "www.ephesus.top/files/*",
      "zone_name": "ephesus.top"
    }
  ]
}
```

HTTP请求只接收 `GET` 和 `HEAD`。`/files/hxh_civ/3D%20Art.zip` 会变成 R2 的 `files/hxh_civ/3D Art.zip`。安全起见，空路径、`.`、`..` 直接返回 404。

还有一件事，浏览器和下载器请求大文件时经常只取到其中一段，Worker 需要把原请求头传给 R2：

```js
const object = await env.EPHESUS_FILES.get(key, { range: request.headers });
```

R2 取到范围对象时，Worker 返回 `206 Partial Content`，并补好 `Content-Range`、`Content-Length`、`Accept-Ranges`。这部分是为了支持断点续传和部分下载。

R2 里的旧对象有些没有 content type。Worker 会先写回 R2 的 HTTP metadata，再按扩展名给 `html`、`js`、`css`、`json`、`wasm`、`woff`、`woff2` 兜底。wasm 被浏览器当成普通二进制文件的话，H5 游戏同样跑不起来。

## Actions 怎样同步

同步脚本在 `tools/sync-r2-assets.js`。它拿到这次 push 前后的 SHA，先运行以下指令：

```shell
git diff --name-status -z --find-renames BASE HEAD -- source/files
```
 同步分为三种模式：

- `full`：第一次同步、找不到前一个提交，或者手动要求完整同步。
- `incremental`：`source/files/` 有新增、修改、删除或改名。
- `none`：只改了文章、工作流等不在 `source/files/` 的内容。

文件改名采取先上传新路径再删旧路径的方式实现，确保R2和src/files完全同步。

完整同步指令如下：

```shell
rclone sync source/files r2:ephesus-files/files \
  --fast-list --delete-during --progress
```

`sync` 会顺便删除 Git 里已经删掉但 R2 里还在的文件。增量模式按 diff 一个个 `copyto` 或 `deletefile`。

完整同步时，会执行

```shell
git lfs pull --include=source/files/**
```
拉取 所有 lfs 文件；增量同步则会先看看改动文件是不是 LFS 指针，若是才会执行 `git lfs pull --include=对应路径`。改一篇文章不需要把几个 G 的东西全下回来。

资料库页面由 `hexo-sil-archive` 在生成站点时读取对应目录，并在 `/archive-data/` 发布目录树 JSON。文件下载仍走 R2，但索引 JSON 不再放在 `files/` 下，因此同步脚本不需要为任何特定资料库补生成文件。生成目录树时，插件会从 LFS 指针读取声明的实际文件大小，而不是指针文件本身的大小（全是130B）。

工作流中和同步相关的部分如下：

```yaml
on:
  push:
    branches: ["src"]
  workflow_dispatch:
    inputs:
      sync_mode:
        type: choice
        options:
          - incremental
          - full

concurrency:
  group: hexo-deploy
  cancel-in-progress: false
```
GPT一开始指示我运行none模式，但 Actions 菜单里没有 `none`，它只是脚本发现没有 files 改动以后自动设定的模式。手动重新发布页面时选 `incremental` 就行，rclone 会被跳过。第一次迁移，或者发现数据桶里缺文件时再选 `full`。

`cancel-in-progress: false` 也很重要。完整同步用了 `--delete-during`；要是跑到一半刚删了一批旧文件，就被后一次 push 取消，后面的增量任务不会知道要把它们全补回来。让它们排队，至少 files 不会只剩半个。

构建 job 也是 checkout `src`，但不自动拉全部 LFS。以弗所还有一个 `source/img/df.zip` 得留在 Pages，单独拉它：

```yaml
- name: Hydrate Pages LFS asset
  run: git lfs pull --include="source/img/df.zip"
```

然后用 Actions variable 控制要不要删 `public/files/`：

```yaml
if [ "${R2_ASSETS_ENABLED}" = "true" ]; then
  rm -rf public/files
fi
```

变量在以弗所repo `Settings -> Secrets and variables -> Actions -> Variables`，叫 `R2_ASSETS_ENABLED`，值填小写 `true`。刚开始先别开它：完整同步做完、`dl.ephesus.top` 和 `www.ephesus.top` 都能拿到文件之后，再打开变量重新部署。这样整个迁移期间 Pages 上原来的 `files/` 还在。

变量打开后，构建 job 会确认 `public/files` 已经被删掉，再扫描 `public/` 里有没有 LFS 指针：

```yaml
if [ "${R2_ASSETS_ENABLED}" = "true" ] && [ -e public/files ]; then
  echo "public/files must be served by R2 once migration is enabled"
  exit 1
fi

if [ "${R2_ASSETS_ENABLED}" = "true" ] && rg -l --glob '*' \
  'version https://git-lfs.github.com/spec/v1' public; then
  echo "Generated site contains Git LFS pointer files"
  exit 1
fi
```

如果需要回退到无cdn版本（为什么？），把变量删掉或改成别的值，再跑一次build，Pages 就会重新获取 `public/files/`，同时不影响 R2 中的文件。

## Secrets 配置

GitHub Actions 里放以下 Repository secrets：

- `R2_ACCOUNT_ID`：Cloudflare Account ID。
- `R2_ACCESS_KEY_ID`：R2 API Token 生成的 Access Key ID。
- `R2_SECRET_ACCESS_KEY`：同一组 R2 凭据的 Secret Access Key。
- `CLOUDFLARE_ACCOUNT_ID`：给 Wrangler 部署 Worker 用的 Account ID，当前和 `R2_ACCOUNT_ID` 一样。
- `CLOUDFLARE_API_TOKEN`：给 Wrangler 的 Cloudflare API Token。

R2 的 Access Key 在 Cloudflare R2 API token 页面创建。权限选 `Object Read & Write`，资源范围只选 `ephesus-files`。Worker 另外用一个 token，至少给 Workers Scripts 编辑、Workers R2 Storage 编辑和 `ephesus.top` 的 Workers Routes 编辑权限。分两个 token 没什么神秘理由，单纯是一个泄露了也别把另一个权限一块交出去。

rclone 的 R2 配置从 Actions 环境变量读：

```yaml
R2_REMOTE: r2:ephesus-files/files
RCLONE_CONFIG_R2_TYPE: s3
RCLONE_CONFIG_R2_PROVIDER: Cloudflare
RCLONE_CONFIG_R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
RCLONE_CONFIG_R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
RCLONE_CONFIG_R2_REGION: auto
RCLONE_CONFIG_R2_FORCE_PATH_STYLE: "true"
```

## 部署时遇到的问题

### bucket 检查

R2 key 限制到 `ephesus-files` 后，rclone 还想列出整个账户的 bucket，权限不够，解决方案是令同步脚本只列出目标前缀：

```shell
rclone lsf r2:ephesus-files/files --max-depth 1
```

并加上：

```yaml
RCLONE_CONFIG_R2_NO_CHECK_BUCKET: "true"
```

按照原先的写法 `rclone lsd r2:`，token 需要有列出账户所有 bucket 的权限，不符合权限最小原则。

### `NotImplemented: Not Implemented`

第一次跑 `full` 时，日志里刷出了好多 `NotImplemented`：

```txt
ERROR : rl/adom/adomgb/tiles/item319.png: Failed to copy:
NotImplemented: Not Implemented
status code: 501
```

问题不在文件本身，而是在 rclone 上传前的 HEAD 检查。R2 对还不存在的对象返回 501，rclone 于是给每个要上传的文件都报一个错。

配置里加上：

```yaml
RCLONE_CONFIG_R2_NO_HEAD: "true"
```

再跑一次 `full` 就完成了。

## Actions 找不到 Worker

Worker 还有个单独的 `Deploy files proxy Worker` 工作流：

```yaml
on:
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: src
      - working-directory: workers/ephesus-files-proxy
        run: npx --yes wrangler@4 deploy
```

我第一次去 Actions 页面时根本没看见它。GitHub 的 `workflow_dispatch` 有个限制：工作流文件得在默认分支，按钮才会出现。以弗所默认分支是 `main`，源码却放 `src`，这里卡了一下。

解决办法是把工作流复制到 `main`，之后在 `Actions -> Deploy files proxy Worker -> Run workflow` 里选 `src` 就能部署。

## 附：GPT 5.6 Terra生成的Plan - R2 全量静态资源迁移
  ### Summary

  保留 src 分支的 source/files/** 作为唯一编辑源，保持现有“提交并推送后自动发布”的习惯不变。

  - R2 ephesus-files 镜像全部 source/files/**，对象键固定为 files/<原相对路径>。
  - dl.ephesus.top/files/... 提供直接访问。
  - Cloudflare Worker 将 www.ephesus.top/files/* 透明代理到 R2，现有文章链接、H5 相对资源、搜索引擎旧链接均无需改动。
  - Pages 构建完成后不再发布 public/files，解决 LFS 指针和 Pages 体积问题。

  ### Implementation Changes

  - 新增 R2 同步脚本与依赖，使用 S3 API 和 multipart upload：
      - 推送增量时仅处理 git diff 中变更的 source/files/** 对象；新增和修改上传，删除从 R2 删除。
      - 对 LFS 指针仅执行目标文件的 git lfs pull，避免每次普通文章更新下载 3.1 GiB。
      - workflow_dispatch 提供 full 模式，初始迁移或无法取得可靠 diff 时扫描并严格镜像整个目录。
      - 上传时写入正确的 Content-Type、Cache-Control: public, max-age=3600 及 Git blob OID 元数据；静态 HTML、JS、CSS、WASM、字体和 H5 图片可正常被浏览器
        加载。

      - 严格镜像 files/ 前缀，R2 其他前缀不受影响。

  - 修改 .github/workflows/deploy.yml：
      - 增加先执行的资产同步 job，页面构建 job 必须等待它成功。
      - Hexo 构建后删除生成产物中的 public/files/，并断言该目录不存在，再维持现有 src -> main -> Pages 自动部署链路。
      - 页面构建仅按需拉取仍由 Pages 承载的 source/img/df.zip，并检查 public/ 不含任何 LFS 指针。
      - 后续内容或资源提交仍只需 git commit 和 git push。

  - 新增 Worker 项目：
      - 绑定 ephesus-files 为只读 R2 binding。
      - 路由为 www.ephesus.top/files/*，对象键直接取请求路径去掉首个 / 后的值。
      - 仅接受 GET 和 HEAD；转发 Range、条件请求、ETag、Content-Type、Content-Length 与缓存元数据，缺失对象返回 404。
      - 拒绝路径穿越和非 /files/ 前缀请求。
      - 单独提供手动 Worker 部署工作流；资源内容变更不需要部署 Worker。
      - 为 dl.ephesus.top 配置 GET, HEAD 的 CORS，允许 https://www.ephesus.top 与 https://ephesus.top。

  - 配置 GitHub Secrets：
      - R2_ACCESS_KEY_ID
      - R2_SECRET_ACCESS_KEY
      - R2_ACCOUNT_ID
      - CLOUDFLARE_API_TOKEN，仅用于 Worker 部署，最小权限为 Workers 脚本/路由编辑及 R2 binding 所需读取权限。
      - R2 token 限定为 ephesus-files 的 Object Read & Write，并使用 https://<ACCOUNT_ID>.r2.cloudflarestorage.com S3 endpoint。Cloudflare R2 S3 API
        (https://developers.cloudflare.com/r2/get-started/s3/)

  ### Rollout And Verification

  1. 提交同步脚本与手动全量同步入口，但暂不移除 Pages 的 files/ 输出。
  2. 手动运行 full 同步，核对 R2 的对象数、总大小和 Git OID 元数据。
  3. 部署 Worker，并验证 www.ephesus.top/files/... 与 dl.ephesus.top/files/... 对压缩包、图片、HTML、JS、WASM 均返回正确状态码和 MIME 类型；大文件需验证
     Range 下载。

  4. 启用构建阶段的 public/files 排除并发布，确认 main 不再携带 files/，但旧链接、静态镜像和 cataclysmIdle 等 H5 页面继续可用。
  5. 验证新增、修改、重命名和删除各一个资源：R2 内容应与 Git 一致，删除应在下次推送后从 R2 移除。

  ### Assumptions

  - www.ephesus.top 已是 Cloudflare 橙云代理，满足 Worker Route 前提。Cloudflare Workers Routes
    (https://developers.cloudflare.com/workers/configuration/routing/routes/)

  - R2 为公开读取，Git/LFS 仍是资源的唯一来源，R2 不接受人工长期修改。
  - 全部 source/files/** 共 4,826 个对象均迁移；图片、文档、镜像站和 H5 依赖不会丢失。
  - 现有主站 URL 保持不变；dl.ephesus.top 是附加的直接访问入口。

## 附：GitHub Actions Secrets 配置

进入仓库：

```text
Settings -> Secrets and variables -> Actions
```

先在 **Secrets** 页签创建以下 5 个 **Repository secrets**。

> 工作流直接读取仓库级 secrets，不要创建成 Environment secret。

| GitHub Secret           | 填入内容                           | 用途                       |
| ----------------------- | ------------------------------ | ------------------------ |
| `R2_ACCOUNT_ID`         | Cloudflare Account ID          | 组成 R2 S3 API endpoint    |
| `R2_ACCESS_KEY_ID`      | R2 S3 Access Key ID            | Actions 连接 R2            |
| `R2_SECRET_ACCESS_KEY`  | R2 S3 Secret Access Key        | Actions 写入 R2            |
| `CLOUDFLARE_ACCOUNT_ID` | 同一个 Cloudflare Account ID      | Wrangler 部署 Worker       |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare Worker 部署 API Token | 创建 Worker、R2 binding 与路由 |

`R2_ACCOUNT_ID` 与 `CLOUDFLARE_ACCOUNT_ID` 的值相同。当前工作流将两者都作为 Secret 使用，直接复制同一值即可。

---

## 附：创建 R2 凭据

1. 进入 **Cloudflare Dashboard -> R2 Object Storage -> Overview**。

2. 在 **Account Details** 中点击 **Manage -> API Tokens -> 创建 API Token**。

3. 权限选择 **Object Read & Write**。

4. **Bucket scope** 选择 **Apply to specific buckets only**，只勾选 `ephesus-files`。

5. 创建后立即复制：

   | Cloudflare 凭据     | 填入 GitHub Secret       |
   | ----------------- | ---------------------- |
   | Access Key ID     | `R2_ACCESS_KEY_ID`     |
   | Secret Access Key | `R2_SECRET_ACCESS_KEY` |

6. 从 **R2 Overview** 复制 **Account ID**，同时填入：

   * `R2_ACCOUNT_ID`
   * `CLOUDFLARE_ACCOUNT_ID`

> `R2_SECRET_ACCESS_KEY` 只显示一次；丢失后需要新建凭据并更新 GitHub Secret。

参考文档：[Cloudflare R2 S3 凭据说明](https://developers.cloudflare.com/r2/api/tokens/)

---

## 附：创建 Worker 部署令牌

此令牌必须与 R2 S3 凭据分开。

1. 进入 **Cloudflare Dashboard -> 右上角用户菜单 -> My Profile -> API Tokens -> Create Token**。

2. 选择 **Create Custom Token**。

3. 名称使用：

   ```text
   github-ephesus-files-worker-deploy
   ```

4. 配置以下权限：

   | 范围      | 权限                 | 级别   |
   | ------- | ------------------ | ---- |
   | Account | Workers Scripts    | Edit |
   | Account | Workers R2 Storage | Edit |
   | Account | Account Settings   | Read |
   | Zone    | Workers Routes     | Edit |
   | User    | User Details       | Read |
   | User    | Memberships        | Read |

5. **Account Resources** 限制为部署 `ephesus-files-proxy` 的 Cloudflare account。

6. **Zone Resources** 限制为 `ephesus.top`。

7. 不要添加 **DNS Write**、**Zone Edit** 或 **Global API Key**。

8. 创建并复制 token 到 GitHub 的：

   ```text
   CLOUDFLARE_API_TOKEN
   ```

Worker CI/CD 需要 API token 与 Account ID；路由部署需要 `Workers Routes Edit`，而 R2 binding 需要 `Workers R2 Storage Edit`。

参考文档：

* [Cloudflare Workers GitHub Actions 文档](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
* [Cloudflare API Token 权限参考](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)

---

## 启用顺序

1. 添加五个 Secrets 后，推送本次代码。

2. 不要先创建 `R2_ASSETS_ENABLED`。

3. 在 GitHub Actions 中手动运行 **Build Hexo and Deploy to main**，选择：

   ```text
   sync_mode: full
   ```

4. 完成后访问以下地址验证对象：

   ```text
   https://dl.ephesus.top/files/...
   ```

5. 手动运行 **Deploy files proxy Worker**。

6. 验证旧地址：

   ```text
   https://www.ephesus.top/files/...
   ```

7. 回到：

   ```text
   Settings -> Secrets and variables -> Actions -> Variables
   ```

   创建普通 Actions Variable：

   | Name                | Value  |
   | ------------------- | ------ |
   | `R2_ASSETS_ENABLED` | `true` |

8. 再手动运行一次构建工作流。

此后 Pages 会移除 `files/`，由 Worker/R2 提供内容。

> 不要把 `R2_ASSETS_ENABLED` 创建为 Secret，它是普通 Actions Variable。
