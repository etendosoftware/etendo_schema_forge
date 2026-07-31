#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1] ?? fallback;
};
const input = resolve(value('--input', './tmp/test-selection-branches.json'));
const output = resolve(value('--out', './tmp/test-selection-exploratory-report.html'));
const data = JSON.parse(readFileSync(input, 'utf8'));
const rows = data.rows;

const esc = (value) => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const pct = (value, total = rows.length) => `${(100 * value / total).toFixed(0)}%`;
const fileCounts = rows.map((row) => row.files.length).sort((a, b) => a - b);
const quantile = (q) => fileCounts[Math.min(fileCounts.length - 1, Math.floor(q * fileCounts.length))];
const profiles = ['none', 'affected', 'full'].map((profile) => ({ profile, count: data.counts[profile] ?? 0 }));
const sections = Object.entries(data.sectionCounts).sort((a, b) => b[1] - a[1]);
const bases = Object.entries(rows.reduce((acc, row) => ({ ...acc, [row.base]: (acc[row.base] ?? 0) + 1 }), {}));
const fullRows = rows.filter((row) => row.plan.profile === 'full');
const fallbackKinds = {
  'Multi-surface threshold': fullRows.filter((row) => row.plan.reasons.some((reason) => reason.startsWith('Change spans '))).length,
  'CI/repository infrastructure': fullRows.filter((row) => row.plan.reasons.some((reason) => reason.includes('CI or repository infrastructure'))).length,
  'Unknown path': fullRows.filter((row) => row.plan.reasons.some((reason) => reason.includes('unknown change surface'))).length,
};
const representative = [951, 997, 983, 934, 974, 961]
  .map((number) => rows.find((row) => row.number === number)).filter(Boolean);

function bars(items, max, color) {
  return items.map(([label, count]) => `<div class="bar-row"><span>${esc(label)}</span><div class="track"><i style="width:${100 * count / max}%;background:${color}"></i></div><b>${count}</b></div>`).join('');
}

const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Análisis exploratorio — selección de tests en 100 PRs</title>
<style>
:root{--bg:#07111f;--panel:#101d30;--panel2:#14243a;--text:#e9f1fb;--muted:#95a9c2;--line:#263a53;--cyan:#44d7d1;--blue:#5da9ff;--amber:#ffbc5b;--red:#ff7272;--green:#61d095}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 10% 0,#11294a 0,transparent 33%),var(--bg);color:var(--text);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}.wrap{max-width:1220px;margin:auto;padding:42px 24px 72px}h1{font-size:clamp(32px,5vw,62px);line-height:1.02;letter-spacing:-.04em;margin:8px 0 16px}.eyebrow{color:var(--cyan);font-weight:800;text-transform:uppercase;letter-spacing:.13em;font-size:12px}.lead{max-width:850px;color:#bfd0e4;font-size:19px}.grid{display:grid;grid-template-columns:repeat(12,1fr);gap:16px;margin:26px 0}.card{background:linear-gradient(145deg,var(--panel2),var(--panel));border:1px solid var(--line);border-radius:18px;padding:20px;box-shadow:0 20px 60px #0004}.metric{grid-column:span 3}.metric strong{display:block;font-size:34px;letter-spacing:-.03em}.metric span,.muted{color:var(--muted)}.wide{grid-column:span 7}.narrow{grid-column:span 5}.full{grid-column:1/-1}h2{font-size:24px;margin:4px 0 18px}h3{font-size:17px;margin:20px 0 8px}.bar-row{display:grid;grid-template-columns:minmax(130px,1fr) 3fr 38px;gap:12px;align-items:center;margin:11px 0}.track{height:10px;background:#06101d;border-radius:999px;overflow:hidden}.track i{height:100%;display:block;border-radius:inherit}.callout{border-left:4px solid var(--amber);padding:14px 18px;background:#ffbc5b10;border-radius:0 12px 12px 0}.good{border-color:var(--green)}.danger{border-color:var(--red)}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:10px 9px;border-bottom:1px solid var(--line);vertical-align:top}th{color:#b9cee7;position:sticky;top:0;background:var(--panel);cursor:pointer}.table-wrap{max-height:600px;overflow:auto;border:1px solid var(--line);border-radius:12px}.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:3px 8px;font-size:12px}.p-full{color:#ffc0c0;background:#ff727214}.p-affected{color:#b9ddff;background:#5da9ff14}.p-none{color:#aef0cb;background:#61d09514}code{color:#a9e9ff}input,select{background:#091525;border:1px solid var(--line);color:var(--text);padding:10px 12px;border-radius:9px;margin:0 8px 14px 0}.small{font-size:12px;color:var(--muted)}ul{padding-left:20px}@media(max-width:850px){.metric,.wide,.narrow{grid-column:1/-1}.bar-row{grid-template-columns:110px 1fr 32px}.wrap{padding:28px 14px}}
</style></head><body><main class="wrap">
<div class="eyebrow">Schema Forge · pre-push · validación histórica</div>
<h1>Qué ocurrió al aplicar el selector a 100 PRs reales</h1>
<p class="lead">Análisis exploratorio del recorrido rama por rama. Cada PR fue traído desde <code>refs/pull/&lt;n&gt;/head</code>, checkout detached, verificado contra su SHA de GitHub y comparado con su base real.</p>

<section class="grid">
<div class="card metric"><strong>100</strong><span>PRs inspeccionados</span></div>
<div class="card metric"><strong>0</strong><span>desvíos de SHA</span></div>
<div class="card metric"><strong>${data.counts.affected}</strong><span>planes affected</span></div>
<div class="card metric"><strong>${data.counts.full}</strong><span>fallbacks full</span></div>

<div class="card wide"><h2>Distribución de perfiles</h2>${bars(profiles.map((p) => [p.profile, p.count]), Math.max(...profiles.map((p) => p.count)), 'linear-gradient(90deg,var(--cyan),var(--blue))')}<p class="small">El perfil <code>focused</code> no apareció porque la simulación evaluó el gate <code>affected</code>.</p></div>
<div class="card narrow"><h2>Tamaño de los diffs</h2><div class="bar-row"><span>mínimo</span><div class="track"><i style="width:2%;background:var(--green)"></i></div><b>${fileCounts[0]}</b></div><div class="bar-row"><span>mediana</span><div class="track"><i style="width:${100*quantile(.5)/fileCounts.at(-1)}%;background:var(--blue)"></i></div><b>${quantile(.5)}</b></div><div class="bar-row"><span>p90</span><div class="track"><i style="width:${100*quantile(.9)/fileCounts.at(-1)}%;background:var(--amber)"></i></div><b>${quantile(.9)}</b></div><div class="bar-row"><span>máximo</span><div class="track"><i style="width:100%;background:var(--red)"></i></div><b>${fileCounts.at(-1)}</b></div><p class="small">Media: ${(fileCounts.reduce((a,b)=>a+b,0)/fileCounts.length).toFixed(1)} archivos. Los dos PRs contra <code>develop</code> son rollups de 570 y 690 archivos.</p></div>

<div class="card wide"><h2>Secciones seleccionadas</h2>${bars(sections, sections[0][1], 'linear-gradient(90deg,#806cff,var(--cyan))')}</div>
<div class="card narrow"><h2>Por qué cayó en full</h2>${bars(Object.entries(fallbackKinds), Math.max(...Object.values(fallbackKinds)), 'linear-gradient(90deg,var(--amber),var(--red))')}<p class="small">Las causas se superponen; un PR puede activar más de una.</p></div>

<div class="card full"><h2>Lectura exploratoria</h2><div class="callout good"><b>La automatización fue reproducible.</b> Los 100 heads coincidieron con GitHub y se compararon contra 98 bases épicas y 2 bases <code>develop</code>. Se eliminaron las aproximaciones producidas por reconstruir PRs desde merge blocks.</div><h3>Lo que funcionó</h3><ul><li>Documentación pura quedó aislada: #951 y #771 terminaron en <code>none</code>.</li><li>Los bumps de dependencias convergieron consistentemente en <code>dependencies + build</code>.</li><li>Los cambios tests-only conservaron su runner: Node, Vitest o Playwright.</li><li>Locales, artifacts y regeneración aparecieron como secciones explícitas y explicables.</li></ul><h3>Lo que quedó demasiado conservador</h3><div class="callout danger"><b>53% en full es alto frente al análisis manual previo.</b> La regla que convierte múltiples raíces funcionales en <code>full</code> domina el resultado. En este repositorio es normal que una feature toque implementación, docs, tests, E2E y artifacts; contar esas superficies no equivale por sí solo a transversalidad riesgosa.</div><h3>Decisión operativa</h3><p>El hook conserva <code>full</code> como valor predeterminado. La segmentación queda disponible mediante <code>PRE_PUSH_TEST_LEVEL=affected</code> hasta revisar falsos negativos. Para activar <code>affected</code> por defecto conviene reemplazar el conteo bruto de raíces por señales de riesgo: infraestructura CI, generadores compartidos, código compartido de alto fan-out y diffs masivos.</p></div>

<div class="card full"><h2>Casos representativos</h2><table><thead><tr><th>PR</th><th>Cambio</th><th>Archivos</th><th>Perfil</th><th>Secciones</th></tr></thead><tbody>${representative.map((row)=>`<tr><td>#${row.number}</td><td>${esc(row.title)}</td><td>${row.files.length}</td><td><span class="pill p-${row.plan.profile}">${row.plan.profile}</span></td><td>${esc(row.plan.sections.join(', '))}</td></tr>`).join('')}</tbody></table></div>

<div class="card full"><h2>Detalle de los 100 PRs</h2><div><input id="q" placeholder="Buscar PR, rama o título"><select id="profile"><option value="">Todos los perfiles</option><option>none</option><option>affected</option><option>full</option></select></div><div class="table-wrap"><table id="prs"><thead><tr><th>PR</th><th>Rama</th><th>Base</th><th>Archivos</th><th>Perfil</th><th>Secciones</th></tr></thead><tbody>${rows.map((row)=>`<tr data-profile="${row.plan.profile}" data-search="${esc(`${row.number} ${row.head} ${row.title}`.toLowerCase())}"><td>#${row.number}<br><span class="small">${esc(row.title)}</span></td><td><code>${esc(row.head)}</code></td><td>${esc(row.base)}</td><td>${row.files.length}</td><td><span class="pill p-${row.plan.profile}">${row.plan.profile}</span></td><td>${esc(row.plan.sections.join(', '))}</td></tr>`).join('')}</tbody></table></div></div>

<div class="card full"><h2>Metodología y límites</h2><ul><li>Fuente de ramas: GitHub connector; checkout aislado en <code>${esc(data.checkout)}</code>.</li><li>La corrida valida selección, no ejecuta todas las suites históricas dentro de cada branch.</li><li>No estima ahorro temporal: Jenkins tiene retención corta y GitHub/Jenkins requieren correlación por PR + SHA + intento.</li><li>Los resultados describen esta versión del selector; cambiar reglas exige repetir las 100 ramas.</li></ul><p class="small">Generado desde <code>${esc(input)}</code>. Bases: ${bases.map(([base,count])=>`${esc(base)} (${count})`).join(', ')}.</p></div>
</section></main>
<script>const q=document.querySelector('#q'),p=document.querySelector('#profile'),rows=[...document.querySelectorAll('#prs tbody tr')];function filter(){const term=q.value.toLowerCase();rows.forEach(r=>r.hidden=!(r.dataset.search.includes(term)&&(!p.value||r.dataset.profile===p.value)))}q.addEventListener('input',filter);p.addEventListener('change',filter);</script>
</body></html>`;

writeFileSync(output, html);
console.log(`Wrote ${output}`);
