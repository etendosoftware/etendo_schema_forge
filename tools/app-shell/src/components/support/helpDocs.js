// Real Etendo Go documentation, fetched from the published MkDocs Material search
// index. No mocked/hardcoded articles — always reflects the current published site.
const DOCS_BASE_URL = 'https://etendosoftware.github.io/etendo-go-docs';
const SEARCH_INDEX_URL = `${DOCS_BASE_URL}/search/search_index.json`;
const MKDOCS_YML_URL = 'https://raw.githubusercontent.com/etendosoftware/etendo-go-docs/main/mkdocs.yml';

let cachedDocs = null;
let pendingFetch = null;

function mdPathToLocation(mdPath) {
  if (mdPath === 'index.md') return '';
  if (mdPath.endsWith('/index.md')) return mdPath.slice(0, -'index.md'.length);
  return mdPath.replace(/\.md$/, '/');
}

// The docs repo has orphan pages left over from folder renames (e.g. a leftover
// "facturas-de-venta/" next to the real "factura-de-venta/") — not linked from
// mkdocs.yml's nav, but mkdocs still builds and indexes every .md file under
// docs/, so they'd otherwise show up as confusing duplicates. mkdocs.yml's nav
// is the source of truth for which pages are actually reachable from the site.
function fetchCanonicalLocations() {
  return fetch(MKDOCS_YML_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`mkdocs.yml: ${res.status}`);
      return res.text();
    })
    .then((text) => {
      // The body class deliberately excludes "." so it can never overlap with
      // the literal `.md` suffix — the engine never has more than one way to
      // split the match, so there is nothing to backtrack over regardless of
      // input length (unlike the earlier `X+(?:/X+)*` and `[\w./-]+` shapes,
      // both flagged by Sonar for super-linear backtracking risk).
      const mdPaths = text.match(/[\w/-]+\.md/g) || [];
      return new Set(mdPaths.map(mdPathToLocation));
    });
}

export function fetchHelpDocs() {
  if (cachedDocs) return Promise.resolve(cachedDocs);
  if (pendingFetch) return pendingFetch;

  pendingFetch = Promise.all([
    fetch(SEARCH_INDEX_URL).then((res) => {
      if (!res.ok) throw new Error(`search_index.json: ${res.status}`);
      return res.json();
    }),
    fetchCanonicalLocations(),
  ])
    .then(([data, canonicalLocations]) => {
      cachedDocs = (data.docs || []).filter(
        (d) => !d.location.startsWith('en/') && canonicalLocations.has(d.location.split('#')[0]),
      );
      return cachedDocs;
    })
    .finally(() => {
      pendingFetch = null;
    });

  return pendingFetch;
}

export function docUrl(location) {
  return `${DOCS_BASE_URL}/${location}`;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || '';
}

function titleCase(segment) {
  return segment
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// One entry per real page (mkdocs emits one entry per page without a #fragment,
// plus one per heading within it — we only want the page-level ones here).
export function getHelpPages(docs) {
  return docs.filter((d) => d.location && !d.location.includes('#'));
}

export function groupHelpCollections(docs) {
  const pages = getHelpPages(docs);
  const groups = new Map();
  for (const page of pages) {
    const segment = page.location.split('/')[0] || 'inicio';
    if (!groups.has(segment)) {
      groups.set(segment, { id: segment, title: titleCase(segment), pages: [] });
    }
    groups.get(segment).pages.push(page);
  }
  return Array.from(groups.values());
}

export function searchHelpDocs(docs, query) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const matches = new Map(); // pageLocation -> best match
  for (const entry of docs) {
    const text = stripHtml(entry.text);
    const haystack = `${entry.title} ${text}`.toLowerCase();
    if (!terms.every((t) => haystack.includes(t))) continue;

    const pageLocation = entry.location.split('#')[0];
    const isTitleMatch = entry.title.toLowerCase().includes(terms[0]);
    const existing = matches.get(pageLocation);
    if (!existing || (isTitleMatch && !existing.isTitleMatch)) {
      matches.set(pageLocation, {
        location: pageLocation,
        title: entry.title,
        snippet: text.slice(0, 140),
        isTitleMatch,
      });
    }
  }
  return Array.from(matches.values());
}
