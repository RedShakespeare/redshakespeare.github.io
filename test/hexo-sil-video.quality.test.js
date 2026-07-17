'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const esbuild = require('esbuild');
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

function localDependencies(filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const dependencies = [];
  const imports = source.matchAll(/(?:require\(\s*|from\s+)["'](\.[^"']+)["']/g);
  for (const match of imports) {
    let dependency = path.resolve(path.dirname(filename), match[1]);
    if (!path.extname(dependency)) dependency += '.js';
    if (qualityFiles.includes(dependency)) dependencies.push(dependency);
  }
  return dependencies;
}

function dependencyCycles() {
  const graph = new Map(qualityFiles.map(filename => [filename, localDependencies(filename)]));
  const visited = new Set();
  const active = new Set();
  const stack = [];
  const cycles = [];

  function visit(filename) {
    if (active.has(filename)) {
      const start = stack.indexOf(filename);
      cycles.push([...stack.slice(start), filename].map(entry => path.relative(pluginRoot, entry)));
      return;
    }
    if (visited.has(filename)) return;
    active.add(filename);
    stack.push(filename);
    for (const dependency of graph.get(filename)) visit(dependency);
    stack.pop();
    active.delete(filename);
    visited.add(filename);
  }

  for (const filename of qualityFiles) visit(filename);
  return cycles;
}

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

test('plugin local dependency graph remains acyclic', () => {
  assert.deepEqual(dependencyCycles(), []);
});

test('runtime modules map to unit entrypoints or explicit browser boundaries', async () => {
  const runtimeTests = fs.readdirSync(__dirname)
    .filter(name => /^hexo-sil-video\.runtime-.*\.test\.js$/.test(name));
  const entrypoints = new Set();
  for (const name of runtimeTests) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    for (const match of source.matchAll(/loadRuntime\('([^']+)'\)/g)) entrypoints.add(match[1]);
  }
  const mapped = new Set();
  const builds = await Promise.all([...entrypoints].map(name => esbuild.build({
    entryPoints: [path.join(runtimeRoot, name)],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'browser',
    target: ['es2020'],
    metafile: true
  })));
  for (const build of builds) {
    for (const input of Object.keys(build.metafile.inputs)) {
      const filename = path.resolve(input);
      if (filename.startsWith(`${runtimeRoot}${path.sep}`)) mapped.add(path.basename(filename));
    }
  }
  const browserBoundaries = new Map([
    ['bootstrap.js', 'hexo-sil-video.bootstrap.test.js'],
    ['browser-entry.js', path.join('browser', 'hexo-sil-video.browser.test.js')]
  ]);
  for (const testFile of browserBoundaries.values()) assert.ok(fs.existsSync(path.join(__dirname, testFile)), `${testFile} is missing`);
  const unmapped = runtimeFiles.filter(name => !mapped.has(name) && !browserBoundaries.has(name));
  assert.deepEqual(unmapped, [], `runtime modules lack a test entrypoint mapping: ${unmapped.join(', ')}`);
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

test('unused binding metrics keep same-name bindings isolated by scope', () => {
  const source = `
    function first() { const value = 1; return value; }
    function second() { const value = 2; }
  `;
  assert.deepEqual(unusedVariableBindings(source), [{ name: 'value', line: 3 }]);
});
