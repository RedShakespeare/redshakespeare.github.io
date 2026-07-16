'use strict';

const acorn = require('acorn');

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionDeclaration', 'FunctionExpression']);
const DECISION_TYPES = new Set([
  'CatchClause',
  'ConditionalExpression',
  'DoWhileStatement',
  'ForInStatement',
  'ForOfStatement',
  'ForStatement',
  'IfStatement',
  'WhileStatement'
]);

function childNodes(node) {
  const children = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === 'loc' || key === 'start' || key === 'end') continue;
    if (Array.isArray(value)) children.push(...value.filter(item => item && typeof item.type === 'string'));
    else if (value && typeof value.type === 'string') children.push(value);
  }
  return children;
}

function functionName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if ((parent?.type === 'Property' || parent?.type === 'MethodDefinition') && !parent.computed) {
    return parent.key.name || parent.key.value;
  }
  return `<arrow@${node.loc.start.line}>`;
}

function functionBodies(source) {
  const ast = parse(source);
  const functions = [];

  function visit(node, parent = null) {
    if (FUNCTION_TYPES.has(node.type)) functions.push({ name: functionName(node, parent), body: node.body });
    for (const child of childNodes(node)) visit(child, node);
  }

  visit(ast);
  return functions;
}

function parse(source) {
  return acorn.parse(source, { ecmaVersion: 'latest', locations: true, sourceType: 'module' });
}

function unusedVariableBindings(source) {
  const ast = parse(source);
  const unused = [];

  function createScope(parent) {
    return { parent, bindings: new Map() };
  }

  function declare(scope, identifier, parameter = false) {
    if (identifier?.type !== 'Identifier') return;
    if (!scope.bindings.has(identifier.name)) scope.bindings.set(identifier.name, { name: identifier.name, line: identifier.loc.start.line, used: false, parameter });
  }

  function resolve(scope, name) {
    for (let current = scope; current; current = current.parent) {
      const binding = current.bindings.get(name);
      if (binding) return binding;
    }
    return null;
  }

  function visitPattern(pattern, scope, parameter = false) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') declare(scope, pattern, parameter);
    else if (pattern.type === 'AssignmentPattern') visitPattern(pattern.left, scope, parameter);
    else if (pattern.type === 'RestElement') visitPattern(pattern.argument, scope, parameter);
    else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) visitPattern(element, scope, parameter);
    else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) visitPattern(property.value || property.argument, scope, parameter);
  }

  function markPatternUsed(pattern, scope) {
    if (!pattern) return;
    if (pattern.type === 'Identifier') {
      const binding = resolve(scope, pattern.name);
      if (binding) binding.used = true;
    } else if (pattern.type === 'AssignmentPattern') markPatternUsed(pattern.left, scope);
    else if (pattern.type === 'RestElement') markPatternUsed(pattern.argument, scope);
    else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) markPatternUsed(element, scope);
    else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) markPatternUsed(property.value || property.argument, scope);
  }

  function visit(node, parent, scope) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
      visit(node.declaration, node, scope);
      for (const declaration of node.declaration.declarations) markPatternUsed(declaration.id, scope);
      return;
    }
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      const functionScope = createScope(scope);
      for (const parameter of node.params) visitPattern(parameter, functionScope, true);
      visit(node.body, node, functionScope);
      for (const binding of functionScope.bindings.values()) if (!binding.used && !binding.parameter) unused.push(binding);
      return;
    }
    if (node.type === 'BlockStatement') {
      const blockScope = createScope(scope);
      for (const statement of node.body) visit(statement, node, blockScope);
      for (const binding of blockScope.bindings.values()) if (!binding.used && !binding.parameter) unused.push(binding);
      return;
    }
    if (node.type === 'VariableDeclarator') {
      visitPattern(node.id, scope);
      if (node.init) visit(node.init, node, scope);
      return;
    }
    if (node.type === 'Identifier') {
      const declaration = parent?.type === 'VariableDeclarator' && parent.id === node;
      const parameter = parent && (parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression');
      const propertyKey = (parent?.type === 'Property' || parent?.type === 'MethodDefinition') && parent.key === node && !parent.computed && !parent.shorthand;
      const memberKey = parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const label = ['BreakStatement', 'ContinueStatement', 'LabeledStatement'].includes(parent?.type);
      if (!declaration && !parameter && !propertyKey && !memberKey && !label) {
        const binding = resolve(scope, node.name);
        if (binding) binding.used = true;
      }
      return;
    }
    for (const child of childNodes(node)) visit(child, node, scope);
  }

  const programScope = createScope(null);
  visit(ast, null, programScope);
  for (const binding of programScope.bindings.values()) if (!binding.used) unused.push(binding);
  return unused.map(({ name, line }) => ({ name, line }));
}

function decisionCount(body) {
  let count = 0;

  function visit(node, root = false) {
    if (!root && FUNCTION_TYPES.has(node.type)) return;
    if (DECISION_TYPES.has(node.type)) count += 1;
    if (node.type === 'SwitchCase' && node.test) count += 1;
    if (node.type === 'LogicalExpression' && ['&&', '||', '??'].includes(node.operator)) count += 1;
    for (const child of childNodes(node)) visit(child);
  }

  visit(body, true);
  return count;
}

module.exports = { decisionCount, functionBodies, unusedVariableBindings };
