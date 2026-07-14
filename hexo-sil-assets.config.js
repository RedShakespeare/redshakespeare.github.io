'use strict';

module.exports = {
  manifest: 'source/_data/assets.json',
  managed: [
    { prefix: 'files', source: 'source/files', ignore: 'source/files/**' },
    { prefix: 'img/df.zip', source: 'source/img/df.zip', ignore: 'source/img/df.zip' }
  ],
  workspace: '.assets-workspace.json',
  publish: {
    checks: [
      { command: 'npm', args: ['run', 'test:assets'] },
      { command: 'npm', args: ['run', 'test:hexo-sil-audio'] },
      { command: 'npm', args: ['run', 'test:hexo-sil-archive'] },
      { command: 'npm', args: ['run', 'test:hexo-sil-video'] },
      { command: 'npm', args: ['run', 'test:hexo-sil-podcast'] },
      { command: 'npm', args: ['run', 'test:hexo-sil-podcast-inside'] },
      { command: 'npm', args: ['run', 'test:podcast-feed-verifier'] },
      { command: 'npm', args: ['run', 'test:r2-assets'] },
      { command: 'npm', args: ['run', 'test:r2-worker'] },
      { command: 'npx', args: ['hexo', 'generate', '--bail'] }
    ],
    git: {
      remote: 'origin',
      branch: 'src',
      stage: true,
      commit: true,
      push: true
    }
  },
  legacySync: {
    source: 'source/files',
    remote: 'r2:ephesus-files/files',
    implementationInputs: [
      'hexo-sil-assets.config.js',
      'package.json',
      'package-lock.json',
      '.github/workflows/deploy.yml'
    ]
  }
};
