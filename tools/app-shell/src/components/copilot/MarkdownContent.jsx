import * as React from 'react';

const HEADING_RE = /^(#{1,3})\s+(\S.*)$/;
const BULLET_RE = /^[-*]\s+(\S.*)$/;
const ORDERED_RE = /^\d+\.\s+(\S.*)$/;
const INLINE_RE = /\*\*([^*\n]{1,500})\*\*|\*([^*\n]{1,500})\*|`([^`\n]{1,500})`|\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,2000})\)/g;

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
    else nodes.push(<a key={nodes.length} href={match[5]} target="_blank" rel="noopener noreferrer">{match[4]}</a>);
    lastIndex = INLINE_RE.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderList(lines, startIndex, expression, Tag) {
  const items = [];
  let index = startIndex;
  while (index < lines.length && expression.test(lines[index].trim())) {
    items.push(lines[index].trim().match(expression)[1]);
    index += 1;
  }
  return {
    node: <Tag key={`list-${startIndex}`} className="my-1 list-inside space-y-1 pl-2">{items.map((item) => (
      <li key={item}>{renderInline(item)}</li>
    ))}</Tag>,
    nextIndex: index,
  };
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
    if (BULLET_RE.test(line)) {
      const result = renderList(lines, index, BULLET_RE, 'ul');
      blocks.push(result.node);
      index = result.nextIndex;
      continue;
    }
    if (ORDERED_RE.test(line)) {
      const result = renderList(lines, index, ORDERED_RE, 'ol');
      blocks.push(result.node);
      index = result.nextIndex;
      continue;
    }
    const paragraph = [];
    while (index < lines.length && lines[index].trim() && !HEADING_RE.test(lines[index].trim())
      && !BULLET_RE.test(lines[index].trim()) && !ORDERED_RE.test(lines[index].trim())) {
      if (paragraph.length) paragraph.push(<br key={`break-${index}`} />);
      paragraph.push(...renderInline(lines[index]));
      index += 1;
    }
    blocks.push(<p key={`paragraph-${index}`}>{paragraph}</p>);
  }
  return <>{blocks}</>;
}
