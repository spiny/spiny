/**
 * A small, dependency-free Markdown parser for the v1 preview
 * (technical/editor.md). It covers the documented feature set — headings,
 * paragraphs, emphasis, links, lists, block quotes, and code blocks — and falls
 * back to literal text for anything it does not recognize, so it can never
 * corrupt the stored Markdown source (which is kept separately as plain text).
 */

export type InlineNode =
  | { type: 'text'; value: string }
  | { type: 'bold'; children: InlineNode[] }
  | { type: 'italic'; children: InlineNode[] }
  | { type: 'code'; value: string }
  | { type: 'link'; target: string; children: InlineNode[] };

export type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'code'; text: string }
  | { type: 'hr' }
  | { type: 'quote'; lines: string[] }
  | { type: 'list'; ordered: boolean; items: string[] };

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const HR_RE = /^(\s*)([-*_])(\s*\2){2,}\s*$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const OL_RE = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;
const FENCE_RE = /^\s*```/;

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Fenced code block
    if (FENCE_RE.test(line)) {
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (if present)
      blocks.push({ type: 'code', text: codeLines.join('\n') });
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    // Heading
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      i += 1;
      continue;
    }

    // Block quote (consecutive)
    if (QUOTE_RE.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        quoteLines.push(QUOTE_RE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: 'quote', lines: quoteLines });
      continue;
    }

    // Ordered list (consecutive)
    if (OL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && OL_RE.test(lines[i])) {
        items.push(OL_RE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Unordered list (consecutive)
    if (UL_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && UL_RE.test(lines[i])) {
        items.push(UL_RE.exec(lines[i])![1]);
        i += 1;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Paragraph (consecutive non-blank, non-structural lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !FENCE_RE.test(lines[i]) &&
      !HR_RE.test(lines[i]) &&
      !HEADING_RE.test(lines[i]) &&
      !QUOTE_RE.test(lines[i]) &&
      !OL_RE.test(lines[i]) &&
      !UL_RE.test(lines[i])
    ) {
      para.push(lines[i]);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: para.join('\n') });
  }

  return blocks;
}

function findMatchingBracket(text: string, openIndex: number): number {
  let depth = 0;
  for (let j = openIndex; j < text.length; j++) {
    if (text[j] === '[') depth += 1;
    else if (text[j] === ']') {
      depth -= 1;
      if (depth === 0) return j;
    }
  }
  return -1;
}

function indexOfSingleMarker(text: string, marker: string, from: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] === marker && text[j + 1] !== marker && text[j - 1] !== marker) return j;
  }
  return -1;
}

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = [];
  let buf = '';
  let i = 0;

  const flush = () => {
    if (buf) {
      nodes.push({ type: 'text', value: buf });
      buf = '';
    }
  };

  while (i < text.length) {
    const ch = text[i];

    // Inline code
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i) {
        flush();
        nodes.push({ type: 'code', value: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Link [text](target)
    if (ch === '[') {
      const close = findMatchingBracket(text, i);
      if (close > i && text[close + 1] === '(') {
        const parenEnd = text.indexOf(')', close + 2);
        if (parenEnd > close) {
          const linkText = text.slice(i + 1, close);
          const target = text.slice(close + 2, parenEnd).trim();
          flush();
          nodes.push({ type: 'link', target, children: parseInline(linkText) });
          i = parenEnd + 1;
          continue;
        }
      }
    }

    // Bold ** or __
    if ((ch === '*' || ch === '_') && text[i + 1] === ch) {
      const marker = ch + ch;
      const end = text.indexOf(marker, i + 2);
      if (end > i + 1) {
        flush();
        nodes.push({ type: 'bold', children: parseInline(text.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    // Italic * or _
    if (ch === '*' || ch === '_') {
      const end = indexOfSingleMarker(text, ch, i + 1);
      if (end > i) {
        flush();
        nodes.push({ type: 'italic', children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buf += ch;
    i += 1;
  }

  flush();
  return nodes;
}
