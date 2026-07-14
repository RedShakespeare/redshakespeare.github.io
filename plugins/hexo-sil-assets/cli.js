#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline/promises');
const {
  DEFAULT_MANIFEST_PATH,
  getObject,
  loadAssetManifest,
  manifestFilePath,
  normaliseObjectKey,
  serialiseManifest
} = require('./lib/manifest');
const { createR2Client, hashFile } = require('./lib/r2-client');

const REPOSITORY_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE_PATH = path.join(REPOSITORY_ROOT, '.assets-workspace.json');
const GITIGNORE_PATH = path.join(REPOSITORY_ROOT, '.gitignore');
const R2_ASSET_IGNORE_RULES = ['source/files/**', 'source/img/df.zip'];
const AUDIO_EXTENSIONS = new Map([
  ['.mp3', 'audio/mpeg'], ['.m4a', 'audio/mp4'], ['.m4b', 'audio/mp4'], ['.mp4', 'audio/mp4'],
  ['.aac', 'audio/aac'], ['.ogg', 'audio/ogg'], ['.opus', 'audio/opus'], ['.wav', 'audio/wav'],
  ['.wave', 'audio/wav'], ['.flac', 'audio/flac'], ['.aif', 'audio/aiff'], ['.aiff', 'audio/aiff'], ['.webm', 'audio/webm']
]);
const MIME_TYPES = new Map([
  ...AUDIO_EXTENSIONS,
  ['.7z', 'application/x-7z-compressed'], ['.apk', 'application/vnd.android.package-archive'], ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'], ['.htm', 'text/html; charset=utf-8'], ['.html', 'text/html; charset=utf-8'], ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.pdf', 'application/pdf'], ['.png', 'image/png'], ['.svg', 'image/svg+xml'], ['.tar', 'application/x-tar'], ['.tgz', 'application/gzip'],
  ['.txt', 'text/plain; charset=utf-8'], ['.wasm', 'application/wasm'], ['.wav', 'audio/wav'], ['.webp', 'image/webp'], ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'], ['.zip', 'application/zip'], ['.bz2', 'application/x-bzip2'], ['.gz', 'application/gzip']
]);

function assetError(message) {
  return new Error(`Assets: ${message}`);
}

function formatDuration(seconds) {
  const total = Math.max(1, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  const pad = value => String(value).padStart(2, '0');
  return hours ? `${pad(hours)}:${pad(minutes)}:${pad(remaining)}` : `${pad(minutes)}:${pad(remaining)}`;
}

function mimeType(filePath) {
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
}

function safeRelative(value, field) {
  const candidate = String(value || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!candidate || candidate.includes('?') || candidate.includes('#') || candidate.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw assetError(`${field} must be a safe relative path.`);
  }
  return candidate;
}

function lfsPointer(contents) {
  const source = Buffer.isBuffer(contents) ? contents.toString('utf8') : String(contents || '');
  const oid = source.match(/^oid sha256:([a-f0-9]{64})$/m);
  const size = source.match(/^size (\d+)$/m);
  return oid && size && source.startsWith('version https://git-lfs.github.com/spec/v1\n') ? { sha256: oid[1], size: Number(size[1]) } : null;
}

async function inspectFile(filePath, key) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw assetError(`${filePath} must be a regular file.`);
  const descriptor = await fsp.open(filePath, 'r');
  let sample;
  try {
    sample = Buffer.alloc(Math.min(stat.size, 1024));
    const { bytesRead } = await descriptor.read(sample, 0, sample.length, 0);
    sample = sample.subarray(0, bytesRead);
  } finally {
    await descriptor.close();
  }
  const pointer = lfsPointer(sample);
  const type = mimeType(filePath);
  const entry = {
    size: pointer ? pointer.size : stat.size,
    sha256: pointer ? pointer.sha256 : await hashFile(filePath),
    type,
    pointer: Boolean(pointer),
    sourcePath: filePath,
    key: normaliseObjectKey(key)
  };
  if (!pointer && AUDIO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    try {
      const metadata = await require('music-metadata').parseFile(filePath, { duration: true });
      const duration = Number(metadata && metadata.format && metadata.format.duration);
      if (Number.isFinite(duration) && duration > 0) entry.duration = formatDuration(duration);
      const title = String(metadata && metadata.common && metadata.common.title || '').trim();
      if (title) entry.title = title;
    } catch (error) {
      throw assetError(`could not read audio metadata from ${filePath}: ${error.message}.`);
    }
  }
  return entry;
}

async function walk(directory, relative = '') {
  let entries;
  try {
    entries = await fsp.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const output = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))) {
    const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(absolute, childRelative));
    else if (entry.isFile()) output.push({ absolute, relative: childRelative });
  }
  return output;
}

async function scanLocalAssets(root = REPOSITORY_ROOT, scopes = ['files', 'img/df.zip']) {
  const output = new Map();
  for (const rawScope of scopes) {
    const scope = safeRelative(rawScope, 'scope');
    if (scope === 'files' || scope.startsWith('files/')) {
      const relative = scope === 'files' ? '' : scope.slice('files/'.length);
      const source = path.join(root, 'source', 'files', ...relative.split('/').filter(Boolean));
      let stat;
      try { stat = await fsp.stat(source); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      if (stat.isFile()) output.set(scope, await inspectFile(source, scope));
      else {
        for (const item of await walk(source)) {
          const key = relative ? `files/${relative}/${item.relative}` : `files/${item.relative}`;
          output.set(key, await inspectFile(item.absolute, key));
        }
      }
    } else if (scope === 'img/df.zip') {
      const source = path.join(root, 'source', 'img', 'df.zip');
      try { output.set(scope, await inspectFile(source, scope)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    } else {
      throw assetError(`unsupported managed scope ${scope}.`);
    }
  }
  return output;
}

function manifestEntry(entry) {
  const value = { size: entry.size, sha256: entry.sha256, type: entry.type };
  if (entry.duration) value.duration = entry.duration;
  if (entry.title) value.title = entry.title;
  return value;
}

async function writeManifest(objects, root = REPOSITORY_ROOT, state = 'legacy') {
  const filePath = manifestFilePath(root, DEFAULT_MANIFEST_PATH);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(temporary, serialiseManifest(objects, state));
  await fsp.rename(temporary, filePath);
}

function existingManifestState(root = REPOSITORY_ROOT) {
  const filePath = manifestFilePath(root, DEFAULT_MANIFEST_PATH);
  try {
    return loadAssetManifest(filePath).state;
  } catch (error) {
    if (String(error.message).includes('could not read') && String(error.message).includes('ENOENT')) return 'legacy';
    throw error;
  }
}

async function loadWorkspace() {
  try {
    const value = JSON.parse(await fsp.readFile(WORKSPACE_PATH, 'utf8'));
    const scopes = Array.isArray(value.scopes) ? value.scopes.map(scope => safeRelative(scope, 'workspace scope')) : [];
    return { version: 1, scopes: [...new Set(scopes)] };
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, scopes: [] };
    throw assetError(`could not read .assets-workspace.json: ${error.message}.`);
  }
}

async function writeWorkspace(scopes) {
  const value = { version: 1, scopes: [...new Set(scopes.map(scope => safeRelative(scope, 'workspace scope')))].sort() };
  await fsp.writeFile(WORKSPACE_PATH, `${JSON.stringify(value, null, 2)}\n`);
}

async function enableR2AssetIgnores() {
  let current = '';
  try {
    current = await fsp.readFile(GITIGNORE_PATH, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const rules = new Set(current.split(/\r?\n/).map(line => line.trim()).filter(Boolean));
  const missing = R2_ASSET_IGNORE_RULES.filter(rule => !rules.has(rule));
  if (!missing.length) return;
  const separator = current && !current.endsWith('\n') ? '\n' : '';
  await fsp.writeFile(GITIGNORE_PATH, `${current}${separator}${missing.join('\n')}\n`);
}

function keyInScope(key, scope) {
  return key === scope || key.startsWith(`${scope}/`);
}

function diffManifest(manifest, local, scopes) {
  const uploads = [];
  const deletes = [];
  for (const [key, entry] of local) {
    const current = getObject(manifest, key);
    if (!current || current.sha256 !== entry.sha256 || current.size !== entry.size || current.type !== entry.type || current.duration !== entry.duration || current.title !== entry.title) {
      uploads.push(entry);
    }
  }
  for (const key of Object.keys(manifest.objects)) {
    if (scopes.some(scope => keyInScope(key, scope)) && !local.has(key)) deletes.push(key);
  }
  return { uploads: uploads.sort((left, right) => left.key.localeCompare(right.key)), deletes: deletes.sort() };
}

function command(name, args, options = {}) {
  const executable = process.platform === 'win32' && (name === 'npm' || name === 'npx') ? `${name}.cmd` : name;
  const result = spawnSync(executable, args, { cwd: REPOSITORY_ROOT, stdio: options.stdio || 'inherit', encoding: 'utf8' });
  if (result.error) throw assetError(`could not run ${name}: ${result.error.message}.`);
  if (result.status !== 0) throw assetError(`${name} ${args.join(' ')} failed.`);
  return result.stdout || '';
}

async function confirm(question, force) {
  if (force) return true;
  if (!process.stdin.isTTY) throw assetError(`${question} requires an interactive terminal or --yes.`);
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(?:es)?$/i.test((await prompt.question(`${question} [y/N] `)).trim());
  } finally {
    prompt.close();
  }
}

async function promptCommitMessage(force, supplied) {
  if (supplied) return supplied;
  if (!process.stdin.isTTY) throw assetError('a commit message is required outside an interactive terminal (--message).');
  const prompt = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const message = (await prompt.question('Commit message: ')).trim();
    if (!message) throw assetError('commit message must not be empty.');
    return message;
  } finally {
    prompt.close();
  }
}

async function seed() {
  const scanned = await scanLocalAssets();
  const objects = {};
  for (const entry of scanned.values()) objects[entry.key] = manifestEntry(entry);
  await writeManifest(objects, REPOSITORY_ROOT, existingManifestState());
  await writeWorkspace(['files', 'img/df.zip']);
  console.log(`Wrote ${DEFAULT_MANIFEST_PATH} with ${Object.keys(objects).length} objects.`);
}

async function verify(options) {
  const manifest = loadAssetManifest(manifestFilePath(REPOSITORY_ROOT, DEFAULT_MANIFEST_PATH));
  const workspace = await loadWorkspace();
  const scopes = options.scope.length ? options.scope : workspace.scopes;
  if (!scopes.length) throw assetError('no managed workspace scope; run assets:pull or assets:seed first.');
  const local = await scanLocalAssets(REPOSITORY_ROOT, scopes);
  if (manifest.state === 'r2' && Array.from(local.values()).some(entry => entry.pointer)) {
    throw assetError('an R2-managed local asset is still a Git LFS pointer; restore it with assets:pull before verifying.');
  }
  const difference = diffManifest(manifest, local, scopes);
  if (difference.uploads.length || difference.deletes.length) throw assetError(`local assets differ from the manifest (${difference.uploads.length} changed, ${difference.deletes.length} missing).`);
  if (options.remote) {
    const client = createR2Client();
    for (const key of Object.keys(manifest.objects).filter(key => scopes.some(scope => keyInScope(key, scope)))) {
      const expected = manifest.objects[key];
      const actual = await client.headObject(key);
      if (actual.size !== expected.size || actual.sha256 !== expected.sha256) throw assetError(`R2 object does not match manifest: ${key}.`);
    }
  }
  console.log(`Verified ${local.size} managed local assets${options.remote ? ' and R2 objects' : ''}.`);
}

async function migrate(options) {
  const scopes = options.scope.length ? options.scope : ['files', 'img/df.zip'];
  if (options.finalize && (scopes.length !== 2 || !scopes.includes('files') || !scopes.includes('img/df.zip'))) {
    throw assetError('--finalize requires the complete `files` and `img/df.zip` migration scope.');
  }
  const local = await scanLocalAssets(REPOSITORY_ROOT, scopes);
  const pointers = Array.from(local.values()).filter(entry => entry.pointer);
  if (pointers.length) throw assetError(`${pointers.length} LFS pointer(s) are not hydrated. Run git lfs pull --include="source/files/**,source/img/df.zip" in this one-time migration checkout.`);
  console.log(`Migration will SHA-256 verify ${local.size} local assets against R2.`);
  if (!await confirm('Upload missing or mismatched R2 assets and rewrite the manifest?', options.yes)) return;
  const client = createR2Client();
  const objects = {};
  let uploaded = 0;
  for (const entry of local.values()) {
    let matches = false;
    try {
      const remote = await client.headObject(entry.key);
      matches = remote.size === entry.size && remote.sha256 === entry.sha256;
    } catch (error) {
      if (!String(error.message).includes('404')) throw error;
    }
    if (!matches) {
      await client.uploadFile(entry.key, entry.sourcePath, entry);
      uploaded += 1;
    }
    const verified = await client.headObject(entry.key);
    if (verified.size !== entry.size || verified.sha256 !== entry.sha256) throw assetError(`R2 verification failed for ${entry.key}.`);
    objects[entry.key] = manifestEntry(entry);
  }
  const state = options.finalize ? 'r2' : existingManifestState();
  await writeManifest(objects, REPOSITORY_ROOT, state);
  await writeWorkspace(scopes);
  if (options.finalize) {
    if (!await confirm('Stop Git tracking the verified local binary assets (files stay on disk)?', options.yes)) {
      console.log('Remote migration completed, but the repository remains in legacy mode until tracking is removed.');
      await writeManifest(objects, REPOSITORY_ROOT, 'legacy');
      return;
    }
    await enableR2AssetIgnores();
    command('git', ['rm', '-r', '--cached', '--ignore-unmatch', '--', 'source/files', 'source/img/df.zip']);
  }
  console.log(`Migration complete: ${uploaded} object(s) uploaded, ${local.size} object(s) verified.`);
}

async function pull(options) {
  const scopes = options.scope.length ? options.scope : ['files'];
  const client = createR2Client();
  const manifest = loadAssetManifest(manifestFilePath(REPOSITORY_ROOT, DEFAULT_MANIFEST_PATH));
  for (const scope of scopes) {
    const objects = Object.entries(manifest.objects).filter(([key]) => keyInScope(key, scope));
    if (!objects.length) throw assetError(`asset manifest has no objects under ${scope}.`);
    for (const [relative, expected] of objects) {
      let destination;
      if (relative.startsWith('files/')) destination = path.join(REPOSITORY_ROOT, 'source', 'files', ...relative.slice('files/'.length).split('/'));
      else if (relative === 'img/df.zip') destination = path.join(REPOSITORY_ROOT, 'source', 'img', 'df.zip');
      else continue;
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      const temporary = `${destination}.${process.pid}.${crypto.randomUUID()}.partial`;
      try {
        await pipeline(await client.getObject(relative), fs.createWriteStream(temporary));
        const stat = await fsp.stat(temporary);
        const digest = await hashFile(temporary);
        if (stat.size !== expected.size || digest !== expected.sha256) {
          throw assetError(`downloaded R2 object does not match manifest: ${relative}.`);
        }
        await fsp.rename(temporary, destination);
      } catch (error) {
        await fsp.unlink(temporary).catch(() => undefined);
        throw error;
      }
      console.log(`Downloaded ${relative}`);
    }
  }
  const workspace = await loadWorkspace();
  await writeWorkspace([...workspace.scopes, ...scopes]);
}

async function publish(options) {
  command('git', ['fetch', 'origin', 'src'], { stdio: 'inherit' });
  const divergence = command('git', ['rev-list', '--left-right', '--count', 'src...origin/src'], { stdio: 'pipe' }).trim().split(/\s+/).map(Number);
  if (divergence[1] > 0) throw assetError('src is behind origin/src; run git pull --ff-only before publishing.');
  const workspace = await loadWorkspace();
  const scopes = options.scope.length ? options.scope : workspace.scopes;
  if (!scopes.length) throw assetError('no managed workspace scope; run assets:pull or assets:seed first.');
  const manifest = loadAssetManifest(manifestFilePath(REPOSITORY_ROOT, DEFAULT_MANIFEST_PATH));
  const local = await scanLocalAssets(REPOSITORY_ROOT, scopes);
  if (manifest.state === 'r2' && Array.from(local.values()).some(entry => entry.pointer)) {
    throw assetError('an R2-managed local asset is still a Git LFS pointer; restore it with assets:pull before publishing.');
  }
  const changes = diffManifest(manifest, local, scopes);
  console.log(`Assets: ${changes.uploads.length} upload/update, ${changes.deletes.length} delete.`);
  for (const entry of changes.uploads) console.log(`  upload ${entry.key}`);
  for (const key of changes.deletes) console.log(`  delete ${key}`);
  if (options.dryRun) return;
  if ((changes.uploads.length || changes.deletes.length) && !await confirm('Apply this R2 asset change?', options.yes)) {
    console.log('Cancelled.');
    return;
  }
  const objects = { ...manifest.objects };
  if (changes.uploads.length || changes.deletes.length) {
    const client = createR2Client();
    for (const entry of changes.uploads) {
      if (entry.pointer) throw assetError(`${entry.key} is an LFS pointer; hydrate its actual content before publishing.`);
      await client.uploadFile(entry.key, entry.sourcePath, entry);
      const actual = await client.headObject(entry.key);
      if (actual.size !== entry.size || actual.sha256 !== entry.sha256) throw assetError(`R2 verification failed for ${entry.key}.`);
      objects[entry.key] = manifestEntry(entry);
    }
    for (const key of changes.deletes) {
      await client.deleteObject(key);
      delete objects[key];
    }
  }
  if (changes.uploads.length || changes.deletes.length) await writeManifest(objects, REPOSITORY_ROOT, manifest.state);
  if (options.noGit) return;
  command('npm', ['run', 'test:assets']);
  command('npm', ['run', 'test:hexo-sil-audio']);
  command('npm', ['run', 'test:hexo-sil-archive']);
  command('npm', ['run', 'test:hexo-sil-podcast']);
  command('npm', ['run', 'test:hexo-sil-podcast-inside']);
  command('npm', ['run', 'test:podcast-feed-verifier']);
  command('npm', ['run', 'test:r2-assets']);
  command('npx', ['hexo', 'generate', '--bail']);
  command('git', ['add', '-A']);
  const staged = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: REPOSITORY_ROOT });
  if (staged.status === 0) {
    console.log('No tracked changes to commit.');
    return;
  }
  if (!await confirm('Commit and push all staged non-ignored changes?', options.yes)) {
    console.log('R2 assets are updated; Git changes remain staged.');
    return;
  }
  const message = await promptCommitMessage(options.yes, options.message);
  command('git', ['commit', '-m', message]);
  command('git', ['push', 'origin', 'src']);
}

async function deleteAsset(options) {
  if (!options.key) throw assetError('delete requires --key <R2 object key>.');
  const key = normaliseObjectKey(options.key);
  if (!await confirm(`Delete ${key} from R2 and the manifest?`, options.yes)) return;
  const manifest = loadAssetManifest(manifestFilePath(REPOSITORY_ROOT, DEFAULT_MANIFEST_PATH));
  if (!manifest.objects[key]) throw assetError(`${key} is not in the manifest.`);
  await createR2Client().deleteObject(key);
  const objects = { ...manifest.objects };
  delete objects[key];
  await writeManifest(objects, REPOSITORY_ROOT, manifest.state);
  console.log(`Deleted ${key}; run npm run publish to validate, commit, and push the updated manifest.`);
}

function mode() {
  const manifest = loadAssetManifest(manifestFilePath(REPOSITORY_ROOT, DEFAULT_MANIFEST_PATH));
  console.log(`Asset pipeline mode: ${manifest.state}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mode=${manifest.state}\n`);
}

function parseArguments(argv) {
  const [commandName = '', ...rest] = argv;
  const options = { scope: [], dryRun: false, remote: false, yes: false, noGit: false, finalize: false, key: '', message: '' };
  for (let index = 0; index < rest.length; index += 1) {
    const value = rest[index];
    if (value === '--scope' || value === '--prefix') options.scope.push(safeRelative(rest[++index], value));
    else if (value === '--key') options.key = rest[++index];
    else if (value === '--message') options.message = rest[++index] || '';
    else if (value === '--dry-run') options.dryRun = true;
    else if (value === '--remote') options.remote = true;
    else if (value === '--yes') options.yes = true;
    else if (value === '--no-git') options.noGit = true;
    else if (value === '--finalize') options.finalize = true;
    else throw assetError(`unknown argument ${value}.`);
  }
  return { commandName, options };
}

async function main(argv = process.argv.slice(2)) {
  const { commandName, options } = parseArguments(argv);
  if (commandName === 'seed') return seed();
  if (commandName === 'verify') return verify(options);
  if (commandName === 'pull') return pull(options);
  if (commandName === 'publish') return publish(options);
  if (commandName === 'migrate') return migrate(options);
  if (commandName === 'delete') return deleteAsset(options);
  if (commandName === 'mode') return mode();
  throw assetError('use one of: seed, verify, pull, publish, migrate, delete, mode.');
}

if (require.main === module) main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = {
  AUDIO_EXTENSIONS,
  DEFAULT_MANIFEST_PATH,
  R2_ASSET_IGNORE_RULES,
  diffManifest,
  enableR2AssetIgnores,
  formatDuration,
  inspectFile,
  lfsPointer,
  mimeType,
  parseArguments,
  scanLocalAssets,
  seed
};
