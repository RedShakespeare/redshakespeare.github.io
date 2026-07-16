'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const runtimeRoot = path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime');
const runtimeFiles = fs.readdirSync(runtimeRoot).filter(name => name.endsWith('.js'));
const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');

test('video runtime static contracts reject legacy dependencies and broad ref forwarding', () => {
  const sources = runtimeFiles.map(name => [name, read(name)]);
  for (const [name, source] of sources) {
    assert.doesNotMatch(source, /legacy(?:State|Ui|Diagnostics|Clock)/, `${name} contains a legacy service parameter`);
    assert.doesNotMatch(source, /\.\.\.refs\b/, `${name} forwards the complete view ref object`);
  }
});

test('video controllers report diagnostics without direct console errors', () => {
  const controllers = runtimeFiles.filter(name => name.endsWith('-controller.js'));
  for (const name of controllers) assert.doesNotMatch(read(name), /console\.error\s*\(/, `${name} writes directly to console.error`);
});

test('subtitle controller only uses the renderer manager public transaction API', () => {
  const source = read('subtitle-controller.js');
  const calls = Array.from(source.matchAll(/rendererManager\.([A-Za-z0-9_]+)\s*\(/g), match => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ['destroy', 'disableTrack', 'loadTrack', 'resize']);
});

test('key runtime modules stay below their branch-complexity budgets', () => {
  const budgets = {
    'player.js': 42,
    'media-controller.js': 28,
    'fullscreen-controller.js': 28,
    'subtitle-renderer-manager.js': 24
  };
  for (const [name, budget] of Object.entries(budgets)) {
    const branches = (read(name).match(/\b(?:if|catch|for|while|case)\b|\?\?|&&|\|\|/g) || []).length;
    assert.ok(branches <= budget, `${name} complexity ${branches} exceeds ${budget}`);
  }
});
