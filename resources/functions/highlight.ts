/**
 * A small TypeScript highlighter for the site's code samples. It emits
 * class-based spans, so the colors come from the site's light and dark
 * tokens instead of a fixed theme.
 */

const keywords = new Set([
  'abstract', 'as', 'async', 'await', 'class', 'const', 'declare', 'default', 'else', 'enum', 'export', 'extends',
  'from', 'function', 'get', 'if', 'implements', 'import', 'in', 'infer', 'interface', 'is', 'keyof', 'let', 'module',
  'namespace', 'new', 'of', 'private', 'protected', 'public', 'readonly', 'return', 'satisfies', 'set', 'static',
  'throw', 'type', 'typeof', 'var',
])

const typeKeywords = new Set([
  'any', 'bigint', 'boolean', 'false', 'never', 'null', 'number', 'object', 'string', 'symbol', 'this', 'true',
  'undefined', 'unknown', 'void',
])

function escape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function span(kind: string, text: string): string {
  return `<span class="tok-${kind}">${escape(text)}</span>`
}

/** A comment, with JSDoc tags and inline code called out. */
function comment(text: string): string {
  let html = ''
  for (const part of text.split(/(@[A-Za-z]+|`[^`\n]*`)/)) {
    if (!part) continue
    if (part.startsWith('@')) html += span('tag', part)
    else if (part.startsWith('`')) html += span('doc-code', part)
    else html += escape(part)
  }
  return `<span class="tok-comment">${html}</span>`
}

/** Highlight TypeScript source or declarations as HTML for a `<pre><code>` block. */
export function highlightTs(source: string): string {
  let html = ''
  let index = 0
  const at = (offset = 0): string => source[index + offset] ?? ''
  const nextNonSpace = (from: number): string => {
    let cursor = from
    while (cursor < source.length && (source[cursor] === ' ' || source[cursor] === '\t')) cursor++
    return source.slice(cursor, cursor + 2)
  }

  while (index < source.length) {
    const char = at()

    if (char === '/' && at(1) === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      html += comment(source.slice(index, stop))
      index = stop
      continue
    }
    if (char === '/' && at(1) === '/') {
      const end = source.indexOf('\n', index)
      const stop = end === -1 ? source.length : end
      html += comment(source.slice(index, stop))
      index = stop
      continue
    }
    if (char === '\'' || char === '"' || char === '`') {
      let cursor = index + 1
      while (cursor < source.length && source[cursor] !== char) cursor += source[cursor] === '\\' ? 2 : 1
      html += span('string', source.slice(index, cursor + 1))
      index = cursor + 1
      continue
    }
    if (/\d/.test(char) && !/[\w$]/.test(source[index - 1] ?? '')) {
      const match = /^\d[\d_]*(?:\.\d[\d_]*)?(?:e[+-]?\d+)?n?/i.exec(source.slice(index))!
      html += span('number', match[0])
      index += match[0].length
      continue
    }
    if (/[A-Za-z_$]/.test(char)) {
      const word = /^[\w$]+/.exec(source.slice(index))![0]
      const after = nextNonSpace(index + word.length)
      const previous = source.slice(0, index).trimEnd()
      if (previous.endsWith('.') && !after.startsWith('(')) html += escape(word)
      else if (keywords.has(word)) html += span('keyword', word)
      else if (typeKeywords.has(word)) html += span('type-keyword', word)
      else if (after.startsWith('(') || /\bfunction$/.test(previous)) html += span('function', word)
      // PascalCase names are types; ALL_CAPS names are constants.
      else if (/^[A-Z](?:[a-z\d]|$)/.test(word)) html += span('type', word)
      else if (after.startsWith(':') || after.startsWith('?:')) html += span('name', word)
      else html += escape(word)
      index += word.length
      continue
    }
    if ('{}[]()<>;:,=|&?.!+-*/%'.includes(char)) {
      html += span('punct', char)
      index++
      continue
    }
    html += escape(char)
    index++
  }
  return html
}
