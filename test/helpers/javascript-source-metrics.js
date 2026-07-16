'use strict';

function maskNonCode(source) {
  let output = '';
  let state = 'code';
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (state === 'code' && character === '/' && next === '/') { state = 'line'; output += '  '; index += 1; continue; }
    if (state === 'code' && character === '/' && next === '*') { state = 'block'; output += '  '; index += 1; continue; }
    if (state === 'code' && (character === '\'' || character === '"' || character === '`')) { state = character; output += ' '; continue; }
    if (state === 'line' && character === '\n') { state = 'code'; output += '\n'; continue; }
    if (state === 'block' && character === '*' && next === '/') { state = 'code'; output += '  '; index += 1; continue; }
    if ((state === '\'' || state === '"' || state === '`') && character === '\\') { output += '  '; index += 1; continue; }
    if (state === character && (state === '\'' || state === '"' || state === '`')) { state = 'code'; output += ' '; continue; }
    output += state === 'code' ? character : character === '\n' ? '\n' : ' ';
  }
  return output;
}

function functionBodies(source) {
  const code = maskNonCode(source);
  const ranges = [];
  const pattern = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  for (const match of code.matchAll(pattern)) {
    const bodyStart = match.index + match[0].length;
    let depth = 1;
    let index = bodyStart;
    while (index < code.length && depth > 0) {
      if (code[index] === '{') depth += 1;
      else if (code[index] === '}') depth -= 1;
      index += 1;
    }
    ranges.push({ name: match[1], start: bodyStart, end: index - 1 });
  }
  return ranges.map(range => {
    const characters = Array.from(code.slice(range.start, range.end));
    for (const nested of ranges) {
      if (nested.start <= range.start || nested.end > range.end) continue;
      const start = nested.start - range.start;
      const end = nested.end - range.start;
      characters.fill(' ', start, end);
    }
    return { name: range.name, body: characters.join('') };
  });
}

function decisionCount(body) {
  return (body.match(/\b(?:if|catch|for|while|case)\b|&&|\|\||\?\?/g) || []).length;
}

module.exports = { decisionCount, functionBodies };
