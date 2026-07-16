'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { decisionCount, functionBodies } = require('./helpers/javascript-source-metrics');

const runtimeRoot = path.join(__dirname, '..', 'plugins', 'hexo-sil-video', 'runtime');
const runtimeFiles = fs.readdirSync(runtimeRoot).filter(name => name.endsWith('.js'));
const read = name => fs.readFileSync(path.join(runtimeRoot, name), 'utf8');

test('video runtime static contracts reject legacy dependencies and broad ref forwarding', () => {
  const sources = runtimeFiles.map(name => [name, read(name)]);
  for (const [name, source] of sources) {
    assert.doesNotMatch(source, /legacy(?:State|Ui|Diagnostics|Clock)/, `${name} contains a legacy service parameter`);
    assert.doesNotMatch(source, /\.\.\.refs\b/, `${name} forwards the complete view ref object`);
    assert.doesNotMatch(source, /create[A-Z][A-Za-z0-9]*Controller\(refs\)/, `${name} forwards a shared ref bag to a controller`);
  }
  const interaction = read('interaction-controller.js');
  assert.doesNotMatch(interaction, /\{\s*\.\.\.(?:surfaces|controls)/, 'interaction controller recombines narrow dependency groups');
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

test('runtime functions stay below their decision-complexity budget', () => {
  const budget = 13;
  for (const name of runtimeFiles) {
    for (const fn of functionBodies(read(name))) {
      const decisions = decisionCount(fn.body);
      assert.ok(decisions <= budget, `${name}:${fn.name} complexity ${decisions} exceeds ${budget}`);
    }
  }
});
