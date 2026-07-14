# R2 Asset Mirror

R2 becomes the source of truth for binary assets once the versioned
`source/_data/assets.json` manifest is finalized with `state: r2`. Objects retain
their existing key paths, so `files/rl/game.zip` is served directly at
`https://dl.ephesus.top/files/rl/game.zip`. After finalization, maintenance
machines can retain an ignored `source/files/` working copy, but the versioned
source of build metadata is the manifest.

Use `npm run publish` to upload changes and commit the refreshed manifest in one
interactive operation. See [assets.md](assets.md) for setup, partial restores,
verification, and the one-time LFS migration procedure.

Archive directory indexes are published by the `hexo-sil-archive` plugin below
`/archive-data/`, independently of the asset URLs. The plugin reads the
versioned asset manifest, so Pages builds do not need R2 credentials or files.

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
and limited to the Worker, R2 binding, and route permissions it needs. The
cross-platform Node publisher uses the S3 API directly; no rclone configuration
is required.

## Initial Migration

First push the migration implementation while the manifest is still `state: legacy`.
That deployment continues to serve the Git/LFS copy; do not deploy the new Worker
route yet.

1. On a fully hydrated legacy checkout, run `npm run assets:migrate -- --finalize`.
   It uploads or verifies every managed object, sets the manifest state to `r2`,
   adds the required ignore rules, and removes binary assets from the Git index
   without deleting the local files.
2. Deploy the Worker route for `/img/df.zip`, then verify a normal file, an LFS
   archive, and a H5 entry point from
   `https://dl.ephesus.top/files/...`.
3. Run the `Deploy files proxy Worker` workflow manually. Verify the same
   paths through `https://www.ephesus.top/files/...`, including a Range request
   for a large archive.
4. Run `npm run publish` to validate, commit, and deploy the finalized manifest.
   The workflow reads its state directly: it skips LFS/rclone and removes
   `public/files/` only for `state: r2`. No repository variable is required.

## Rollback

Restore a local asset directory from R2 with `npm run assets:pull`; do not
re-enable Git LFS or add binary assets back to the repository. If R2 itself
must be rolled back, restore objects from an external backup before changing
Worker routing.
