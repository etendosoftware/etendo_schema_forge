import * as React from 'react';
import { Link } from 'react-router-dom';
import { assertInternalPath } from './windowRoutes.js';

const HEADING_RE = /^(#{1,3})\s+(\S.*)$/;
const BULLET_RE = /^[-*]\s+(\S.*)$/;
const ORDERED_RE = /^\d+\.\s+(\S.*)$/;
const INLINE_RE = /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|`([^`\n]{1,500})`|\[([^\]\n]{1,200})\]\(([^\s)]{1,2000})\)/g;
// Only http(s) is opened in a new tab; every other absolute scheme is refused.
const EXTERNAL_HREF_RE = /^https?:\/\//i;
const LINK_CLASS = 'underline underline-offset-2 font-medium hover:opacity-80';

// Table cells are split on "|", so an escaped pipe is parked on a character
// that will not realistically appear in model output, and restored once the
// split is done.
const ESCAPED_PIPE = '\u0000';
const SEPARATOR_CELL_RE = /^:?-+:?$/;

/**
 * Render a markdown link. The href is model-generated, therefore untrusted:
 * http(s) opens externally, an in-app path navigates through the router, and
 * anything else (javascript:, data:, protocol-relative //host, …) degrades to
 * the literal markdown text so a rejected link can never become a live anchor.
 */
function renderLinkNode(raw, label, href, key) {
  if (EXTERNAL_HREF_RE.test(href)) {
    return (
      <a
        key={key}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CLASS}
        data-testid="MarkdownLink__e0b411">{label}</a>
    );
  }
  try {
    // assertInternalPath() is the navigation security boundary (ETP-5064).
    return (
      <Link
        key={key}
        to={assertInternalPath(href)}
        className={LINK_CLASS}
        data-testid="MarkdownInternalLink__e0b411">{label}</Link>
    );
  } catch {
    return raw;
  }
}

function renderInline(text) {
  const nodes = [];
  let lastIndex = 0;
  let match;
  INLINE_RE.lastIndex = 0;
  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[1] !== undefined) nodes.push(<strong key={nodes.length}>{match[1]}</strong>);
    else if (match[2] !== undefined) nodes.push(<em key={nodes.length}>{match[2]}</em>);
    else if (match[3] !== undefined) nodes.push(<code key={nodes.length}>{match[3]}</code>);
    else nodes.push(renderLinkNode(match[0], match[4], match[5], nodes.length));
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/** Split one GFM row into cells; leading/trailing pipes are optional. */
function splitRow(line) {
  const cells = line.trim().replace(/\\\|/g, ESCAPED_PIPE).split('|');
  if (cells.length > 1 && cells[0].trim() === '') cells.shift();
  if (cells.length > 1 && cells[cells.length - 1].trim() === '') cells.pop();
  return cells.map((cell) => cell.split(ESCAPED_PIPE).join('|').trim());
}

function isSeparatorRow(line) {
  if (!line?.includes('|')) return false;
  const cells = splitRow(line);
  return cells.length > 0 && cells.every((cell) => SEPARATOR_CELL_RE.test(cell));
}

/** A table starts on a header row immediately followed by a separator row. */
function startsTable(lines, index) {
  const header = lines[index]?.trim();
  if (!header?.includes('|')) return false;
  const separator = lines[index + 1]?.trim();
  if (!isSeparatorRow(separator)) return false;
  return splitRow(header).length === splitRow(separator).length;
}

function cellAlignment(spec) {
  const left = spec.startsWith(':');
  const right = spec.endsWith(':');
  if (left && right) return 'text-center';
  if (right) return 'text-right';
  if (left) return 'text-left';
  return '';
}

/** GFM makes the border pipes optional, so a table has one style or the other. */
function hasBorderPipes(line) {
  return line.startsWith('|') || line.endsWith('|');
}

/**
 * Decide whether the line continues the table body. A bare `.includes('|')`
 * is not enough: prose such as "usá el filtro estado | fecha" would be eaten
 * as a row, and a second table following with no blank line between would be
 * absorbed into the first. So a body row must not itself start a new table,
 * and it must match the border style the header established — which is what
 * keeps prose out of a bordered table without breaking a borderless one.
 */
function continuesTable(lines, index, bordered) {
  const line = lines[index].trim();
  if (!line.includes('|')) return false;
  if (startsTable(lines, index)) return false;
  return bordered ? hasBorderPipes(line) : splitRow(line).length > 1;
}

/** Model output is often ragged: pad short rows, drop the overflowing cells. */
function normalizeRow(cells, size) {
  return Array.from({ length: size }, (_, position) => cells[position] ?? '');
}

function cellClassName(alignment) {
  return `border border-border px-2 py-1 align-top ${alignment}`.trim();
}

function renderTable(lines, startIndex) {
  const headers = splitRow(lines[startIndex]);
  const alignments = splitRow(lines[startIndex + 1]).map(cellAlignment);
  const bordered = hasBorderPipes(lines[startIndex].trim());
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && continuesTable(lines, index, bordered)) {
    rows.push(normalizeRow(splitRow(lines[index]), headers.length));
    index += 1;
  }
  return {
    // The chat bubble is narrow (max-w-[88%]): a wide table must scroll inside
    // its own container instead of widening the bubble or the page.
    node: <div
      key={`table-${startIndex}`}
      className="my-2 overflow-x-auto"
      data-testid="MarkdownTable__e0b411"><table className="w-full border-collapse text-xs">
      <thead>
        <tr>{headers.map((header, column) => (
          <th key={`h-${column}`} className={`${cellClassName(alignments[column] ?? '')} font-semibold`}>
            {renderInline(header)}
          </th>
        ))}</tr>
      </thead>
      <tbody>{rows.map((row, line) => (
        <tr key={`r-${line}`}>{row.map((cell, column) => (
          <td key={`c-${line}-${column}`} className={cellClassName(alignments[column] ?? '')}>
            {renderInline(cell)}
          </td>
        ))}</tr>
      ))}</tbody>
    </table></div>,
    nextIndex: index,
  };
}

function renderList(lines, startIndex, expression, Tag) {
  const items = [];
  let index = startIndex;
  while (index < lines.length && expression.test(lines[index].trim())) {
    items.push(lines[index].trim().match(expression)[1]);
    index += 1;
  }
  return {
    node: <Tag
      key={`list-${startIndex}`}
      className="my-1 list-inside space-y-1 pl-2"
      data-testid="Tag__e0b411">{items.map((item) => (
      <li key={item}>{renderInline(item)}</li>
    ))}</Tag>,
    nextIndex: index,
  };
}

function isParagraphLine(lines, index) {
  const trimmed = lines[index].trim();
  return Boolean(trimmed)
    && !HEADING_RE.test(trimmed)
    && !BULLET_RE.test(trimmed)
    && !ORDERED_RE.test(trimmed)
    && !startsTable(lines, index);
}

function renderListBlock(lines, index, line) {
  if (BULLET_RE.test(line)) return renderList(lines, index, BULLET_RE, 'ul');
  if (ORDERED_RE.test(line)) return renderList(lines, index, ORDERED_RE, 'ol');
  return null;
}

export function MarkdownContent({ children }) {
  if (!children) return null;
  const lines = String(children).split('\n');
  const blocks = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) { index += 1; continue; }
    const heading = line.match(HEADING_RE);
    if (heading) {
      blocks.push(<h3 key={`heading-${index}`} className="mb-1 mt-2 text-sm font-semibold first:mt-0">{renderInline(heading[2])}</h3>);
      index += 1;
      continue;
    }
    const block = startsTable(lines, index)
      ? renderTable(lines, index)
      : renderListBlock(lines, index, line);
    if (block) {
      blocks.push(block.node);
      index = block.nextIndex;
      continue;
    }
    const paragraph = [];
    while (index < lines.length && isParagraphLine(lines, index)) {
      if (paragraph.length) paragraph.push(<br key={`break-${index}`} />);
      paragraph.push(...renderInline(lines[index]));
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph}</p>);
  }
  return <div className="space-y-2 leading-6">{blocks}</div>;
}
