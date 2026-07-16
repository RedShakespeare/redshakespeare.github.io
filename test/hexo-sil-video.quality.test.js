'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { decisionCount, functionBodies, unusedVariableBindings } = require('./helpers/javascript-source-metrics');

const pluginRoot = path.join(__dirname, '..', 'plugins', 'hexo-sil-video');
const runtimeRoot = path.join(pluginRoot, 'runtime');
const runtimeFiles = fs.readdirSync(runtimeRoot).filter(name => name.endsWith('.js'));
const qualityFiles = [
  ...runtimeFiles.map(name => path.join(runtimeRoot, name)),
  ...fs.readdirSync(path.join(pluginRoot, 'lib')).filter(name => name.endsWith('.js')).map(name => path.join(pluginRoot, 'lib', name)),
  path.join(pluginRoot, 'index.js')
];
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

test('plugin functions stay below their decision-complexity budget', () => {
  const budget = 13;
  for (const filename of qualityFiles) {
    for (const fn of functionBodies(fs.readFileSync(filename, 'utf8'))) {
      const decisions = decisionCount(fn.body);
      assert.ok(decisions <= budget, `${path.relative(pluginRoot, filename)}:${fn.name} complexity ${decisions} exceeds ${budget}`);
    }
  }
});

test('complexity metrics include declarations, methods, and arrow functions', () => {
  const source = `
    function declared(value) { if (value) return true; }
    const object = { method(value) { while (value) value -= 1; } };
    const namedArrow = value => { if (value && value.ready) return value; };
    values.map(value => { if (value) return value; });
    const template = value => \`prefix \${value ? 'yes' : 'no'}\`;
    const regex = value => /[{()}]/.test(value) && value !== '';
  `;
  const functions = functionBodies(source);
  assert.ok(functions.some(fn => fn.name === 'declared' && decisionCount(fn.body) === 1));
  assert.ok(functions.some(fn => fn.name === 'method' && decisionCount(fn.body) === 1));
  assert.ok(functions.some(fn => fn.name === 'namedArrow' && decisionCount(fn.body) === 2));
  assert.ok(functions.some(fn => fn.name.startsWith('<arrow@') && decisionCount(fn.body) === 1));
  assert.ok(functions.some(fn => fn.name === 'template' && decisionCount(fn.body) === 1));
  assert.ok(functions.some(fn => fn.name === 'regex' && decisionCount(fn.body) === 1));
});

test('plugin source contains no unused simple variable bindings', () => {
  for (const filename of qualityFiles) {
    const unused = unusedVariableBindings(fs.readFileSync(filename, 'utf8'));
    assert.deepEqual(unused, [], `${path.relative(pluginRoot, filename)} has unused bindings: ${unused.map(binding => `${binding.name}:${binding.line}`).join(', ')}`);
  }
});

test('unused binding metrics distinguish declarations from property names', () => {
  const source = `
    const used = 1;
    const unused = 2;
    const object = { used, method() { return this.unused; } };
    consume(object);
  `;
  assert.deepEqual(unusedVariableBindings(source), [{ name: 'unused', line: 3 }]);
});
