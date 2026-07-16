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
  const declarations = new Map();
  const used = new Set();

  function visit(node, parent = null) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'VariableDeclaration') {
      for (const declaration of node.declaration.declarations) {
        if (declaration.id.type === 'Identifier') used.add(declaration.id.name);
      }
    }
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') {
      declarations.set(node.id.name, node.id.loc.start.line);
    } else if (node.type === 'Identifier') {
      const declaration = parent?.type === 'VariableDeclarator' && parent.id === node;
      const propertyKey = (parent?.type === 'Property' || parent?.type === 'MethodDefinition') && parent.key === node && !parent.computed && !parent.shorthand;
      const memberKey = parent?.type === 'MemberExpression' && parent.property === node && !parent.computed;
      const label = ['BreakStatement', 'ContinueStatement', 'LabeledStatement'].includes(parent?.type);
      if (!declaration && !propertyKey && !memberKey && !label) used.add(node.name);
    }
    for (const child of childNodes(node)) visit(child, node);
  }

  visit(ast);
  return Array.from(declarations, ([name, line]) => ({ name, line })).filter(binding => !used.has(binding.name));
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
