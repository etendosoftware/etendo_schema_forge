import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { MarkdownContent } from '../MarkdownContent.jsx';

/** Every render goes through a router: an internal link renders a <Link>. */
function renderMarkdown(source) {
  return render(
    <MemoryRouter>
      <MarkdownContent>{source}</MarkdownContent>
    </MemoryRouter>,
  );
}

describe('MarkdownContent — empty input', () => {
  it('renders nothing when there is no content', () => {
    const { container } = renderMarkdown('');
    expect(container).toBeEmptyDOMElement();
  });
});

describe('MarkdownContent — GFM tables', () => {
  it('renders a minimal 2x2 table with thead/tbody, th headers and td cells', () => {
    const { container } = renderMarkdown('| Doc | Total |\n| --- | --- |\n| A-1 | 100 |');

    const table = container.querySelector('table');
    expect(table).toBeInTheDocument();
    const headers = container.querySelectorAll('thead tr th');
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent('Doc');
    expect(headers[1]).toHaveTextContent('Total');
    const cells = container.querySelectorAll('tbody tr td');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent('A-1');
    expect(cells[1]).toHaveTextContent('100');
    // Headers must be th, never td.
    expect(container.querySelectorAll('thead td')).toHaveLength(0);
  });

  it('produces the same cells with and without border pipes', () => {
    const withPipes = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');
    const withoutPipes = renderMarkdown('a | b\n--- | ---\n1 | 2');

    const cellsOf = (result) => [...result.container.querySelectorAll('th, td')]
      .map((cell) => cell.textContent);

    expect(cellsOf(withoutPipes)).toEqual(['a', 'b', '1', '2']);
    expect(cellsOf(withoutPipes)).toEqual(cellsOf(withPipes));
  });

  it('applies the alignment of each separator cell to its th and td', () => {
    const { container } = renderMarkdown([
      '| L | R | C | D |',
      '| :--- | ---: | :---: | --- |',
      '| 1 | 2 | 3 | 4 |',
    ].join('\n'));

    const headers = [...container.querySelectorAll('th')];
    const cells = [...container.querySelectorAll('td')];

    expect(headers[0]).toHaveClass('text-left');
    expect(cells[0]).toHaveClass('text-left');
    expect(headers[1]).toHaveClass('text-right');
    expect(cells[1]).toHaveClass('text-right');
    expect(headers[2]).toHaveClass('text-center');
    expect(cells[2]).toHaveClass('text-center');
    // No colon -> no alignment class at all.
    expect(headers[3].className).not.toMatch(/text-(left|right|center)/);
    expect(cells[3].className).not.toMatch(/text-(left|right|center)/);
  });

  it('renders a table that immediately follows a paragraph line', () => {
    const { container } = renderMarkdown([
      'Resultados:',
      '| Doc | Total |',
      '| --- | --- |',
      '| A-1 | 100 |',
    ].join('\n'));

    const paragraph = container.querySelector('p');
    expect(paragraph).toHaveTextContent('Resultados:');
    // The paragraph must not have swallowed the table rows.
    expect(paragraph).not.toHaveTextContent('Doc');
    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('renders the prose that follows a table', () => {
    const { container } = renderMarkdown([
      '| Doc | Total |',
      '| --- | --- |',
      '| A-1 | 100 |',
      '',
      'Eso es todo.',
    ].join('\n'));

    expect(container.querySelector('table')).toBeInTheDocument();
    expect(container.querySelector('p')).toHaveTextContent('Eso es todo.');
  });

  it('treats an escaped pipe as literal text inside a single cell', () => {
    const { container } = renderMarkdown('| Value | Note |\n| --- | --- |\n| 1\\|2 | ok |');

    const cells = container.querySelectorAll('tbody td');
    expect(cells).toHaveLength(2);
    expect(cells[0]).toHaveTextContent('1|2');
    expect(cells[1]).toHaveTextContent('ok');
  });

  it('pads a row that is shorter than the header', () => {
    const { container } = renderMarkdown('| a | b | c |\n| --- | --- | --- |\n| 1 |');

    const cells = container.querySelectorAll('tbody td');
    expect(cells).toHaveLength(3);
    expect(cells[0]).toHaveTextContent('1');
    expect(cells[1]).toBeEmptyDOMElement();
    expect(cells[2]).toBeEmptyDOMElement();
  });

  it('drops the overflowing cells of a row longer than the header', () => {
    const { container } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 | 3 | 4 |');

    const cells = [...container.querySelectorAll('tbody td')];
    expect(cells).toHaveLength(2);
    expect(cells.map((cell) => cell.textContent)).toEqual(['1', '2']);
  });

  it('does not build a table when the header row has no separator row', () => {
    const { container } = renderMarkdown('| Doc | Total |\nSin separador');

    expect(container.querySelector('table')).not.toBeInTheDocument();
    const paragraph = container.querySelector('p');
    expect(paragraph).toHaveTextContent('| Doc | Total |');
    expect(paragraph).toHaveTextContent('Sin separador');
    expect(paragraph.querySelector('br')).toBeInTheDocument();
  });

  it('renders inline formatting inside table cells', () => {
    const { container } = renderMarkdown([
      '| Campo | Valor |',
      '| --- | --- |',
      '| **Bold** | `code` |',
      '| [Pedido](/sales-order/123) | [Docs](https://example.com) |',
    ].join('\n'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows[0].querySelector('td strong')).toHaveTextContent('Bold');
    expect(rows[0].querySelectorAll('td')[1].querySelector('code')).toHaveTextContent('code');
    const internal = rows[1].querySelector('td a');
    expect(internal).toHaveAttribute('href', '/sales-order/123');
    const external = rows[1].querySelectorAll('td')[1].querySelector('a');
    expect(external).toHaveAttribute('href', 'https://example.com');
  });

  it('wraps the table in a horizontally scrollable container', () => {
    const { container } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');

    const wrapper = container.querySelector('table').parentElement;
    expect(wrapper).toHaveClass('overflow-x-auto');
  });
});

describe('MarkdownContent — links', () => {
  it('opens an https link in a new tab with the tabnabbing guard', () => {
    const { container } = renderMarkdown('Ver [docs](https://example.com)');

    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', 'https://example.com');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('treats an http link as external too', () => {
    const { container } = renderMarkdown('Ver [docs](http://example.com)');

    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', 'http://example.com');
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('matches the external scheme case-insensitively', () => {
    const { container } = renderMarkdown('Ver [docs](HTTPS://EXAMPLE.COM)');

    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', 'HTTPS://EXAMPLE.COM');
    expect(anchor).toHaveAttribute('target', '_blank');
  });

  it('renders an internal path as an in-app router link without target=_blank', () => {
    const { container } = renderMarkdown('Abrí [Pedido 123](/sales-order/123)');

    const anchor = container.querySelector('a');
    expect(anchor).toHaveAttribute('href', '/sales-order/123');
    expect(anchor).toHaveTextContent('Pedido 123');
    expect(anchor).not.toHaveAttribute('target');
  });

  it('gives links a visible underline affordance', () => {
    const { container } = renderMarkdown('[ext](https://example.com) y [int](/sales-order)');

    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) expect(anchor).toHaveClass('underline');
  });

  it.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['data:', '[x](data:text/html,<script>alert(1)</script>)'],
    ['vbscript:', '[x](vbscript:msgbox(1))'],
    ['protocol-relative', '[x](//evil.example)'],
    ['backslash authority', '[x](/\\evil.example)'],
    ['mailto:', '[x](mailto:someone@example.com)'],
  ])('refuses a %s href and renders no anchor at all', (_label, source) => {
    const { container } = renderMarkdown(source);

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('degrades a refused link to its raw markdown source, not to the bare label', () => {
    const { container } = renderMarkdown('Click [x](javascript:alert(1))');

    expect(container).toHaveTextContent('Click [x](javascript:alert(1))');
  });

  it('keeps a refused link inert while still rendering the safe links around it', () => {
    const { container } = renderMarkdown('[ok](https://example.com) y [no](javascript:alert(1))');

    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0]).toHaveAttribute('href', 'https://example.com');
    expect(container).toHaveTextContent('[no](javascript:alert(1))');
  });
});

describe('MarkdownContent — block regression guard', () => {
  it('renders headings of level 1 to 3 as h3', () => {
    const { container } = renderMarkdown('# Uno\n## Dos\n### Tres');

    const headings = container.querySelectorAll('h3');
    expect(headings).toHaveLength(3);
    expect(headings[0]).toHaveTextContent('Uno');
    expect(headings[2]).toHaveTextContent('Tres');
  });

  it('renders a dash bullet list', () => {
    const { container } = renderMarkdown('- Uno\n- Dos\n- Tres');

    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(3);
    expect(items[1]).toHaveTextContent('Dos');
    expect(container.querySelector('ol')).not.toBeInTheDocument();
  });

  it('renders an ordered list', () => {
    const { container } = renderMarkdown('1. Uno\n2. Dos');

    const items = container.querySelectorAll('ol li');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Uno');
    expect(container.querySelector('ul')).not.toBeInTheDocument();
  });

  it('renders bold, italic and inline code', () => {
    const { container } = renderMarkdown('Un **negrita**, un *cursiva* y un `codigo`.');

    expect(container.querySelector('strong')).toHaveTextContent('negrita');
    expect(container.querySelector('em')).toHaveTextContent('cursiva');
    expect(container.querySelector('code')).toHaveTextContent('codigo');
  });

  it('joins consecutive paragraph lines with a line break', () => {
    const { container } = renderMarkdown('Primera linea\nSegunda linea\nTercera linea');

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0].querySelectorAll('br')).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('Primera linea');
    expect(paragraphs[0]).toHaveTextContent('Tercera linea');
  });

  it('splits blank-line separated paragraphs into separate blocks', () => {
    const { container } = renderMarkdown('Primero\n\nSegundo');

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0]).toHaveTextContent('Primero');
    expect(paragraphs[1]).toHaveTextContent('Segundo');
  });
});

describe('MarkdownContent — table row loop', () => {
  it('stops a bordered table at prose containing a pipe on the very next line', () => {
    const { container } = renderMarkdown([
      '| Doc | Total |',
      '| --- | --- |',
      '| A-1 | 100 |',
      'usa el filtro estado | fecha',
    ].join('\n'));

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveTextContent('usa el filtro estado | fecha');
  });

  it('stops a bordered table at prose without a pipe', () => {
    const { container } = renderMarkdown([
      '| Doc | Total |',
      '| --- | --- |',
      '| A-1 | 100 |',
      'Eso es todo.',
    ].join('\n'));

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveTextContent('Eso es todo.');
  });

  it('renders two bordered tables that are not separated by a blank line', () => {
    const { container } = renderMarkdown([
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '| c | d |',
      '| --- | --- |',
      '| 3 | 4 |',
    ].join('\n'));

    const tables = container.querySelectorAll('table');
    expect(tables).toHaveLength(2);
    // The second header must not have been absorbed as a body row of the first.
    const secondHeaders = [...tables[1].querySelectorAll('thead th')].map((th) => th.textContent);
    expect(secondHeaders).toEqual(['c', 'd']);
    expect(tables[0].querySelectorAll('tbody tr')).toHaveLength(1);
    expect(tables[1].querySelectorAll('tbody tr')).toHaveLength(1);
  });

  it('keeps every body row of a coherent borderless table', () => {
    // Border pipes are optional in GFM: the row loop matches the style the
    // header established. Requiring border pipes unconditionally would drop
    // every row of this perfectly valid table.
    const { container } = renderMarkdown([
      'Doc | Total',
      '--- | ---',
      'A-1 | 100',
      'A-2 | 200',
      'A-3 | 300',
    ].join('\n'));

    const rows = container.querySelectorAll('tbody tr');
    expect(rows).toHaveLength(3);
    expect([...rows].map((row) => row.querySelector('td').textContent)).toEqual(['A-1', 'A-2', 'A-3']);
  });

  it('ends a bordered table at a borderless continuation row (accepted behavior)', () => {
    // ACCEPTED, not a bug: a table has one border style or the other, so a
    // style switch mid-table ends the table and the odd row becomes prose.
    // Mixing styles is malformed input; the alternative (accepting any pipe
    // line) is what let prose be eaten as a row.
    const { container } = renderMarkdown([
      '| Doc | Total |',
      '| --- | --- |',
      'A-1 | 100',
    ].join('\n'));

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
    expect(container.querySelector('p')).toHaveTextContent('A-1 | 100');
  });

  it('terminates a bordered table on a blank line', () => {
    const { container } = renderMarkdown([
      '| a | b |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '| 3 | 4 |',
    ].join('\n'));

    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveTextContent('| 3 | 4 |');
  });

  it('terminates a borderless table on a blank line', () => {
    const { container } = renderMarkdown([
      'a | b',
      '--- | ---',
      '1 | 2',
      '',
      '3 | 4',
    ].join('\n'));

    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('p')).toHaveTextContent('3 | 4');
  });

  it('renders a table that ends the input with no following line', () => {
    const { container } = renderMarkdown('| a | b |\n| --- | --- |\n| 1 | 2 |');

    expect(container.querySelectorAll('table')).toHaveLength(1);
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });

  it('does not throw on a row that is only pipes', () => {
    const { container } = renderMarkdown([
      '| a | b |',
      '| --- | --- |',
      '|',
      '||',
    ].join('\n'));

    expect(container.querySelector('table')).toBeInTheDocument();
    // Both degenerate rows are padded to the header width rather than crashing.
    for (const row of container.querySelectorAll('tbody tr')) {
      expect(row.querySelectorAll('td')).toHaveLength(2);
    }
  });

  it('absorbs prose with a pipe after a borderless table (known limitation)', () => {
    // KNOWN LIMITATION, pinned as current behavior, not as desired behavior:
    // "estado | fecha" is indistinguishable from a borderless body row, the
    // same ambiguity GFM itself has. Resolving it would need content
    // heuristics. If that ever changes, this test is the one to update.
    const { container } = renderMarkdown([
      'Doc | Total',
      '--- | ---',
      'A-1 | 100',
      'usa el filtro estado | fecha',
    ].join('\n'));

    expect(container.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(container.querySelector('p')).not.toBeInTheDocument();
  });
});

describe('MarkdownContent — unsupported constructs pinned as-is', () => {
  it('does not treat a level 4 heading as a heading', () => {
    // HEADING_RE only accepts #{1,3}. A model emits "####" unprompted often
    // enough that the raw rendering is worth recording: this pins the current
    // behavior so raising the limit is a conscious change, not an accident.
    const { container } = renderMarkdown('#### Cuatro');

    expect(container.querySelector('h3')).not.toBeInTheDocument();
    expect(container.querySelector('p')).toHaveTextContent('#### Cuatro');
  });
});
