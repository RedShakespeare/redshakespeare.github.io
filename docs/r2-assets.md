# R2 Asset Mirror

`source/files/` remains the source of truth. The R2 bucket mirrors it at the
`files/` prefix, so a source path such as `source/files/rl/game.zip` is served
directly at `https://dl.ephesus.top/files/rl/game.zip`.

Incremental uploads are addressed relative to `source/files/`; this prevents
the bucket's existing `files/` prefix from being duplicated as `files/files/`.
Changes to `tools/sync-r2-assets.js` deliberately trigger one full mirror, so
path-mapping fixes reconcile existing objects as well as future uploads.

Archive directory indexes are published by the `hexo-sil-archive` plugin below
`/archive-data/`, independently of the mirrored file URLs. R2 synchronization
therefore only mirrors the actual files beneath `source/files/`.

The HXH CIV browser itself is a regular Hexo page at `/hxh_civ/`, so it uses
the installed Inside theme directly. `/files/hxh_civ/` remains a legacy entry
point and the Worker redirects it to that page; only the browser's tree data
and downloadable files are served from R2.

The `ephesus-files-proxy` Worker routes `www.ephesus.top/files/*` to the same
objects. Existing site links therefore remain unchanged after Pages stops
publishing `files/`.

## Required GitHub Secrets

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Create the R2 credentials with Object Read & Write access limited to the
`ephesus-files` bucket. The Worker token should be separate from the R2 token
and limited to the Worker, R2 binding, and route permissions it needs.

The workflow configures rclone with `no_check_bucket = true`, which is required
when these R2 credentials are scoped to a specific bucket.
It also sets `no_head = true` because R2 can return HTTP 501 for rclone's HEAD
check of an object that does not yet exist.

## Initial Migration

1. Add the R2 secrets and push this workflow while `R2_ASSETS_ENABLED` is not
   set. Existing Pages files stay live.
2. Run the `Build Hexo and Deploy to main` workflow manually with `sync_mode`
   set to `full`. This downloads the LFS assets and mirrors all of
   `source/files/` into R2.
3. Verify a normal file, an LFS archive, and a H5 entry point from
   `https://dl.ephesus.top/files/...`.
4. Run the `Deploy files proxy Worker` workflow manually. Verify the same
   paths through `https://www.ephesus.top/files/...`, including a Range request
   for a large archive.
5. Set the repository Actions variable `R2_ASSETS_ENABLED` to `true`, then run
   the build workflow again. Future Pages deployments remove `public/files/`.

With the variable enabled, every `src` push synchronizes changed files before
the Pages build. Renames upload the new object and delete the old one; deletes
are removed from R2 to keep the mirror strict. Deployments run serially so a
full mirror is never cancelled halfway through.

## Rollback

Set `R2_ASSETS_ENABLED` to a value other than `true` and run the build
workflow. It publishes `files/` from the repository again. The R2 mirror is
left intact; disable the Worker route only after confirming the Pages copy is
available.
