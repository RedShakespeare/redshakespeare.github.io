'use strict';

const { existsSync, openSync, readSync, closeSync } = require('fs');
const { spawnSync } = require('child_process');

const SOURCE_PREFIX = 'source/files/';
const DEFAULT_REMOTE = 'r2:ephesus-files/files';
const ZERO_SHA = /^0+$/;
const R2_SYNC_IMPLEMENTATION_INPUTS = ['plugins/hexo-sil-assets/legacy-sync.js'];

function fail(message) {
  console.error(`R2 asset sync: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    fail(`could not run ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
    fail(`${command} ${args.join(' ')} failed${stderr ? `: ${stderr}` : ''}`);
  }
  return result.stdout;
}

function gitCommitExists(revision) {
  if (!revision || ZERO_SHA.test(revision)) return false;
  const result = spawnSync('git', ['rev-parse', '--verify', `${revision}^{commit}`], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

function parseDiff(base, head) {
  const output = run(
    'git',
    ['diff', '--name-status', '-z', '--find-renames', base, head, '--', 'source/files'],
    { encoding: 'buffer' },
  );
  const fields = output.toString('utf8').split('\0');
  const uploads = new Set();
  const deletes = new Set();

  for (let index = 0; index < fields.length - 1;) {
    const status = fields[index++];
    if (!status) continue;
    const code = status[0];

    if (code === 'R' || code === 'C') {
      const oldPath = fields[index++];
      const newPath = fields[index++];
      if (code === 'R' && oldPath.startsWith(SOURCE_PREFIX)) deletes.add(oldPath);
      if (newPath.startsWith(SOURCE_PREFIX)) uploads.add(newPath);
      continue;
    }

    const path = fields[index++];
    if (!path || !path.startsWith(SOURCE_PREFIX)) continue;
    if (code === 'D') {
      deletes.add(path);
    } else {
      uploads.add(path);
    }
  }

  for (const path of uploads) deletes.delete(path);
  return { uploads: [...uploads].sort(), deletes: [...deletes].sort() };
}

function requestedMode() {
  const mode = process.env.SYNC_MODE || 'incremental';
  if (!['incremental', 'full'].includes(mode)) {
    fail(`SYNC_MODE must be incremental or full, received ${mode}`);
  }
  return mode;
}

function hasR2SyncImplementationChanges(base, head) {
  const output = run('git', ['diff', '--name-only', base, head, '--', ...R2_SYNC_IMPLEMENTATION_INPUTS]);
  return output.trim().length > 0;
}

function collectChanges(base, head) {
  const changes = parseDiff(base, head);
  return {
    ...changes,
    r2SyncImplementation: hasR2SyncImplementationChanges(base, head),
  };
}

function detectMode() {
  if (requestedMode() === 'full') return 'full';

  const base = process.env.GITHUB_EVENT_BEFORE;
  const head = process.env.GITHUB_SHA || 'HEAD';
  if (!gitCommitExists(base) || !gitCommitExists(head)) return 'full';

  const { uploads, deletes, r2SyncImplementation } = collectChanges(base, head);
  if (r2SyncImplementation) return 'full';
  if (uploads.length || deletes.length) return 'incremental';
  return 'none';
}

function isLfsPointer(path) {
  if (!existsSync(path)) return false;
  const descriptor = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(128);
    const bytesRead = readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString('utf8').startsWith(
      'version https://git-lfs.github.com/spec/v1\n',
    );
  } finally {
    closeSync(descriptor);
  }
}

function hydrate(paths, mode) {
  run('git', ['lfs', 'install', '--local'], { stdio: 'inherit' });
  if (mode === 'full') {
    run('git', ['lfs', 'pull', '--include=source/files/**'], { stdio: 'inherit' });
    return;
  }

  for (const path of paths) {
    if (isLfsPointer(path)) {
      run('git', ['lfs', 'pull', `--include=${path}`], { stdio: 'inherit' });
    }
  }
}

function objectPath(sourcePath) {
  if (!sourcePath.startsWith(SOURCE_PREFIX)) fail(`unexpected source path ${sourcePath}`);
  // `remote` already ends with the bucket's `files/` prefix, so incremental
  // uploads must be relative to source/files/ rather than source/.
  return sourcePath.slice(SOURCE_PREFIX.length);
}

function sync(mode) {
  const remote = process.env.R2_REMOTE || DEFAULT_REMOTE;
  const base = process.env.GITHUB_EVENT_BEFORE;
  const head = process.env.GITHUB_SHA || 'HEAD';
  const changes = mode === 'incremental' ? collectChanges(base, head) : {
    uploads: [],
    deletes: [],
  };

  hydrate(changes.uploads, mode);
  // Listing the destination prefix verifies the scoped bucket credentials
  // without requiring permission to enumerate every bucket in the account.
  run('rclone', ['lsf', remote, '--max-depth', '1'], { stdio: 'inherit' });

  if (mode === 'full') {
    run('rclone', ['sync', 'source/files', remote, '--fast-list', '--delete-during', '--progress'], {
      stdio: 'inherit',
    });
    return;
  }

  for (const path of changes.uploads) {
    if (!existsSync(path)) fail(`changed asset no longer exists: ${path}`);
    run('rclone', ['copyto', path, `${remote}/${objectPath(path)}`, '--progress'], {
      stdio: 'inherit',
    });
  }
  for (const path of changes.deletes) {
    run('rclone', ['deletefile', `${remote}/${objectPath(path)}`], { stdio: 'inherit' });
  }
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--detect')) {
    const mode = detectMode();
    console.log(`mode=${mode}`);
    if (process.env.GITHUB_OUTPUT) {
      require('fs').appendFileSync(process.env.GITHUB_OUTPUT, `mode=${mode}\n`);
    }
    return;
  }
  if (args.has('--sync')) {
    const modeIndex = process.argv.indexOf('--mode');
    const mode = modeIndex === -1 ? detectMode() : process.argv[modeIndex + 1];
    if (!['incremental', 'full'].includes(mode)) fail(`invalid sync mode ${mode}`);
    sync(mode);
    return;
  }
  fail('use --detect or --sync');
}

if (require.main === module) main();

module.exports = {
  R2_SYNC_IMPLEMENTATION_INPUTS,
  collectChanges,
  detectMode,
  hasR2SyncImplementationChanges,
  objectPath,
};
