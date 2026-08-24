function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const GREEK_SYMBOLS = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  omega: 'ω',
  Delta: 'Δ',
  Gamma: 'Γ',
  Lambda: 'Λ',
  Omega: 'Ω',
  Pi: 'Π',
  Sigma: 'Σ',
}

function renderMathExpression(expression, display = false) {
  let html = escapeHtml(expression)
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '<span class="inline-flex flex-col align-middle text-center leading-none mx-1"><span class="border-b border-current px-1">$1</span><span class="px-1">$2</span></span>')
    .replace(/\\sqrt\{([^{}]+)\}/g, '<span class="inline-flex items-start gap-0.5"><span>√</span><span class="border-t border-current px-1">$1</span></span>')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\leq/g, '≤')
    .replace(/\\geq/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\approx/g, '≈')
    .replace(/\\infty/g, '∞')

  html = html.replace(/\\([A-Za-z]+)/g, (match, name) => GREEK_SYMBOLS[name] || match)
  html = html.replace(/\^(\{([^{}]+)\}|([A-Za-z0-9+\-=]+))/g, (_match, _group, braced, simple) => `<sup>${braced || simple}</sup>`)
  html = html.replace(/_(\{([^{}]+)\}|([A-Za-z0-9+\-=]+))/g, (_match, _group, braced, simple) => `<sub>${braced || simple}</sub>`)

  return display
    ? `<div class="my-4 overflow-x-auto bg-on-surface/5 border border-outline-variant/20 px-4 py-3 text-center font-mono text-base text-on-surface">${html}</div>`
    : `<span class="inline-block rounded bg-on-surface/5 px-1.5 py-0.5 align-baseline font-mono text-[0.95em] text-on-surface">${html}</span>`
}

function parseInlineMarkdown(text) {
  let result = escapeHtml(text)
  const codeTokens = []
  const mathTokens = []

  result = result.replace(/`([^`]+)`/g, (_match, code) => {
    const token = `\uE000${codeTokens.length}\uE001`
    codeTokens.push(code)
    return token
  })

  result = result.replace(/(^|[^\w\\])\$([^\s$](?:[^$\n]*?[^\s$])?)\$/g, (_match, prefix, math) => {
    const token = `\uE100${mathTokens.length}\uE101`
    mathTokens.push(math)
    return `${prefix}${token}`
  })

  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  result = result.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  result = result.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Avoid turning identifiers_like_this into italic text.
  result = result.replace(/(^|[^\w])_([^_]+)_([^\w]|$)/g, '$1<em>$2</em>$3')

  result = result.replace(/\uE000(\d+)\uE001/g, (_match, index) => {
    const code = codeTokens[Number(index)] || ''
    return `<code>${code}</code>`
  })

  result = result.replace(/\uE100(\d+)\uE101/g, (_match, index) => {
    const math = mathTokens[Number(index)] || ''
    return renderMathExpression(math)
  })

  return result
}

function isLikelyHtmlSnippet(lines) {
  const meaningfulLines = lines
    .map((line) => line.trim())
    .filter(Boolean)

  if (meaningfulLines.length < 2) {
    return false
  }

  const firstLine = meaningfulLines[0]
  const lastLine = meaningfulLines[meaningfulLines.length - 1]

  if (!/^<[^>]+>$/.test(firstLine) || !/^<\/[^>]+>$/.test(lastLine)) {
    return false
  }

  return meaningfulLines.some((line) => /<[^>]+>/.test(line))
}

function flushParagraph(lines, output) {
  if (!lines.length) return

  if (isLikelyHtmlSnippet(lines)) {
    output.push(`<pre><code>${escapeHtml(lines.join('\n').replace(/\n+$/, ''))}</code></pre>`)
    lines.length = 0
    return
  }

  // Treat a solitary single-backtick line as a block instead of inline code
  if (lines.length === 1) {
    const text = lines[0].trim()
    if (text.startsWith('`') && text.endsWith('`') && !text.startsWith('```')) {
      const code = text.slice(1, -1)
      output.push(`<pre><code>${escapeHtml(code)}</code></pre>`)
      lines.length = 0
      return
    }
  }

  output.push(`<p>${parseInlineMarkdown(lines.join('\n')).replace(/\n/g, '<br />')}</p>`)
  lines.length = 0
}

function flushList(items, output, listType) {
  if (!items.length) return
  const tag = listType === 'ol' ? 'ol' : 'ul'
  output.push(`<${tag}>${items.map((item) => `<li>${parseInlineMarkdown(item)}</li>`).join('')}</${tag}>`)
  items.length = 0
}

function splitTableRow(row) {
  const normalized = row.trim().replace(/^\|/, '').replace(/\|$/, '')
  return normalized.split('|').map((cell) => cell.trim())
}

function isTableSeparator(line) {
  return /^\|?\s*:?-{3,}:?(\s*\|\s*:?-{3,}:?)+\s*\|?$/.test(line.trim())
}

function isStandardIndentedCodeLine(line) {
  return /^( {4,}|\t)/.test(line)
}

function isContextualIndentedCodeLine(line, lines, index) {
  if (!/^ {2,}\S/.test(line) || isStandardIndentedCodeLine(line)) {
    return false
  }

  if (index < 1 || lines[index - 1].trim()) {
    return false
  }

  let previousNonEmptyIndex = index - 2
  while (previousNonEmptyIndex >= 0 && !lines[previousNonEmptyIndex].trim()) {
    previousNonEmptyIndex -= 1
  }

  if (previousNonEmptyIndex < 0) {
    return false
  }

  return /[:：]$/.test(lines[previousNonEmptyIndex].trim())
}

function isIndentedCodeLine(line, lines, index) {
  return (
    isStandardIndentedCodeLine(line) ||
    isContextualIndentedCodeLine(line, lines, index)
  )
}

function stripCodeIndent(line) {
  if (line.startsWith('\t')) {
    return line.slice(1)
  }

  const spaces = (line.match(/^ +/) || [''])[0].length
  if (spaces >= 4) {
    return line.slice(4)
  }

  if (spaces >= 2) {
    return line.slice(2)
  }

  return line
}

function parseFenceStart(line) {
  const match = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*([a-zA-Z0-9_-]*)[ \t]*$/)
  if (!match) {
    return null
  }

  return {
    marker: match[1][0],
    length: match[1].length,
    lang: match[2] || '',
  }
}

function isFenceEnd(line, fence) {
  if (!fence) {
    return false
  }

  const escapedMarker = fence.marker === '`' ? '`' : '~'
  const pattern = new RegExp(`^[ \\t]*${escapedMarker}{${fence.length},}[ \\t]*$`)
  return pattern.test(line)
}

export function parseMarkdownToHtml(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!source.trim()) {
    return "<p></p>";
  }

  const lines = source.split("\n");
  const output = [];
  const paragraphLines = [];
  const listItems = [];
  let listType = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const trimmed = line.trim();
    const fence = parseFenceStart(line)

    if (fence) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;

      const codeLines = [];
      while (i + 1 < lines.length) {
        i += 1;
        if (isFenceEnd(lines[i], fence)) {
          break;
        }
        codeLines.push(lines[i]);
      }

      const className = fence.lang ? ` class="language-${escapeHtml(fence.lang)}"` : "";
      output.push(`<pre><code${className}>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (isIndentedCodeLine(line, lines, i)) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;

      const indentedLines = [stripCodeIndent(line)];
      while (
        i + 1 < lines.length &&
        (isIndentedCodeLine(lines[i + 1], lines, i + 1) || !lines[i + 1].trim())
      ) {
        i += 1;
        if (lines[i].trim()) {
          indentedLines.push(stripCodeIndent(lines[i]));
        } else {
          indentedLines.push("");
        }
      }

      while (indentedLines.length > 0 && !indentedLines[indentedLines.length - 1].trim()) {
        indentedLines.pop();
      }

      output.push(`<pre><code>${escapeHtml(indentedLines.join("\n"))}</code></pre>`);
      continue;
    }

    if (!trimmed) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;
      continue;
    }

    if (trimmed.startsWith("$$")) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;

      const blockLines = [];
      const firstLine = trimmed.replace(/^\$\$\s?/, "");
      if (firstLine.endsWith("$$") && firstLine.length > 2) {
        output.push(renderMathExpression(firstLine.replace(/\s?\$\$$/, ""), true));
        continue;
      }

      if (firstLine) {
        blockLines.push(firstLine);
      }

      while (i + 1 < lines.length) {
        i += 1;
        const nextLine = lines[i].trim();
        if (nextLine.endsWith("$$")) {
          const finalLine = nextLine.replace(/\s?\$\$$/, "");
          if (finalLine) {
            blockLines.push(finalLine);
          }
          break;
        }
        blockLines.push(lines[i]);
      }

      output.push(renderMathExpression(blockLines.join("\n"), true));
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;

      const blockquoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        blockquoteLines.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      i -= 1;

      output.push(`<blockquote>${parseMarkdownToHtml(blockquoteLines.join("\n"))}</blockquote>`);
      continue;
    }

    if (trimmed.startsWith("#")) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;

      let level = 0;
      while (level < trimmed.length && trimmed[level] === "#") {
        level += 1;
      }
      if (level > 0 && level <= 6 && trimmed[level] === " ") {
        const text = parseInlineMarkdown(trimmed.slice(level + 1).trim());
        output.push(`<h${level}>${text}</h${level}>`);
        continue;
      }
    }

    if (trimmed.match(/^---+$/) || trimmed.match(/^\*\*\*+$/)) {
      flushParagraph(paragraphLines, output);
      flushList(listItems, output, listType);
      listType = null;
      output.push("<hr />");
      continue;
    }

    if (isTableSeparator(line)) {
      flushList(listItems, output, listType);
      listType = null;

      if (paragraphLines.length) {
        const headerRow = paragraphLines.pop();
        flushParagraph(paragraphLines, output);

        const headers = splitTableRow(headerRow);
        const alignments = splitTableRow(line).map((cell) => {
          if (cell.startsWith(":") && cell.endsWith(":")) return "center";
          if (cell.endsWith(":")) return "right";
          return "left";
        });

        output.push("<div class=\"overflow-x-auto my-4\"><table class=\"w-full text-sm border-collapse\">");
        output.push("<thead><tr>");
        headers.forEach((header, index) => {
          const align = alignments[index] || "left";
          output.push(`<th class="text-${align} p-2 border-b border-white/10">${parseInlineMarkdown(header)}</th>`);
        });
        output.push("</tr></thead><tbody>");

        while (i + 1 < lines.length) {
          const nextTrimmed = lines[i + 1].trim();
          if (!nextTrimmed.startsWith("|") && !nextTrimmed.endsWith("|")) {
            break;
          }
          i += 1;
          const cells = splitTableRow(nextTrimmed);
          output.push("<tr>");
          cells.forEach((cell, index) => {
            const align = alignments[index] || "left";
            output.push(`<td class="text-${align} p-2 border-b border-white/5">${parseInlineMarkdown(cell)}</td>`);
          });
          output.push("</tr>");
        }
        output.push("</tbody></table></div>");
        continue;
      }
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("+ ")) {
      flushParagraph(paragraphLines, output);
      if (listType === "ol") {
        flushList(listItems, output, listType);
        listType = "ul";
      } else {
        listType = "ul";
      }
      listItems.push(trimmed.slice(2).trim());
      continue;
    }

    if (trimmed.match(/^\d+\.\s/)) {
      flushParagraph(paragraphLines, output);
      if (listType === "ul") {
        flushList(listItems, output, listType);
        listType = "ol";
      } else {
        listType = "ol";
      }
      listItems.push(trimmed.replace(/^\d+\.\s/, "").trim());
      continue;
    }

    if (listType && (line.startsWith("  ") || line.startsWith("\t"))) {
      listItems[listItems.length - 1] += "\n" + trimmed;
      continue;
    }

    if (listType && !trimmed.startsWith("  ") && !trimmed.startsWith("\t")) {
      flushList(listItems, output, listType);
      listType = null;
    }

    paragraphLines.push(line);
  }

  flushParagraph(paragraphLines, output);
  flushList(listItems, output, listType);

  return output.join("\n");
}
