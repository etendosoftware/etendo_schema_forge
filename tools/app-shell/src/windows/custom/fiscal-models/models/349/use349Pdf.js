import React, { useState } from 'react';
import { renderPdf, COMMON_HANDLEBARS_HELPERS } from '../../../shared/pdfUtils.js';

const HELPERS = `
function fmtAmount(v) {
  if (v == null) return '0,00';
  var n = Number(v);
  if (isNaN(n)) return String(v);
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n);
}
function fmtInt(v) { return v == null ? '0' : String(parseInt(v, 10) || 0); }
` + COMMON_HANDLEBARS_HELPERS;

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Inter',sans-serif; font-size:11px; color:#111; background:#fff; -webkit-print-color-adjust:exact; }
.page { width:794px; min-height:1123px; padding:20px 24px; }

.hdr { display:flex; align-items:stretch; border:1px solid #999; margin-bottom:6px; }
.hdr-logo { padding:8px 12px; border-right:1px solid #999; display:flex; flex-direction:column; justify-content:center; min-width:160px; }
.hdr-logo .at-name { font-weight:700; font-size:10px; }
.hdr-logo .at-phone { font-size:8px; color:#555; margin-top:2px; }
.hdr-title { flex:1; padding:8px 12px; text-align:center; background:#fff; }
.hdr-title h1 { font-size:13px; font-weight:700; line-height:1.3; }
.hdr-title .subtitle { font-size:8px; color:#444; margin-top:2px; }
.hdr-right { display:flex; flex-direction:column; align-items:stretch; border-left:1px solid #999; }
.hdr-sheet { padding:3px 10px; font-size:8px; font-weight:600; text-align:right; border-bottom:1px solid #999; }
.hdr-badge { background:#1a3c6b; color:#fff; padding:8px 14px; display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; }
.hdr-badge .label { font-size:7px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; }
.hdr-badge .model { font-size:28px; font-weight:700; line-height:1; }

.num-just { border:1px dashed #aaa; padding:4px 10px; font-size:9px; text-align:right; margin-bottom:6px; }

.section { border:1px solid #999; margin-bottom:6px; }
.section-title { background:#d4e1f7; padding:3px 8px; font-size:9px; font-weight:700; border-bottom:1px solid #999; }
.section-body { padding:6px 8px; }

.two-col { display:flex; gap:6px; margin-bottom:6px; }
.two-col .section { margin-bottom:0; }
.col-declarante { flex:1.5; }
.col-ejercicio { flex:1; }

.field { display:flex; flex-direction:column; gap:2px; margin-bottom:5px; }
.field label { font-size:8px; color:#555; }
.field-box { border:1px solid #777; padding:3px 6px; font-size:10px; background:#fff; min-height:18px; }

.contact-row { display:flex; gap:10px; }
.contact-row .field:first-child { flex:2; }
.contact-row .field:last-child { flex:1; }

.summary-row { display:flex; align-items:center; border-bottom:1px solid #eee; padding:5px 0; }
.summary-row:last-child { border-bottom:none; }
.summary-label { flex:1; font-size:9px; padding-right:8px; }
.summary-casilla { font-size:8px; font-weight:700; color:#1a3c6b; width:22px; text-align:center; border:1px solid #1a3c6b; padding:1px 3px; margin-right:6px; flex-shrink:0; }
.summary-value { border:1px solid #777; padding:2px 8px; min-width:110px; text-align:right; font-size:10px; font-family:'IBM Plex Mono',monospace; background:#fff; }

.ops-table { width:100%; border-collapse:collapse; font-size:9px; margin-top:4px; }
.ops-table th { background:#eef2f8; border:1px solid #bbb; padding:3px 5px; font-weight:600; text-align:left; font-size:8px; }
.ops-table td { border:1px solid #ccc; padding:3px 5px; }
.ops-table tr:nth-child(even) td { background:#f9f9fb; }
.mono { font-family:'IBM Plex Mono',monospace; }
.right { text-align:right; }
.key-badge { display:inline-block; background:#1a3c6b; color:#fff; border-radius:3px; padding:1px 5px; font-size:8px; font-weight:700; }

.comp-text { font-size:8px; color:#333; line-height:1.5; margin-bottom:8px; }
.comp-checks { display:flex; gap:20px; align-items:flex-start; }
.comp-check { font-size:9px; display:flex; align-items:center; gap:6px; }
.check-box { border:1px solid #666; width:12px; height:12px; display:inline-block; flex-shrink:0; }
.former-field { margin-left:16px; }
.former-field label { font-size:8px; color:#555; display:block; margin-bottom:3px; }
.former-box { border:1px solid #777; padding:2px 6px; min-width:160px; font-size:10px; background:#fff; min-height:18px; }

.footer { margin-top:12px; font-size:7px; color:#aaa; text-align:center; border-top:1px solid #eee; padding-top:4px; }

.watermark {
  position:fixed; top:50%; left:50%;
  transform:translate(-50%,-50%) rotate(-40deg);
  font-size:72px; font-weight:800; letter-spacing:.06em; text-transform:uppercase;
  color:rgba(180,0,0,0.07); white-space:nowrap; pointer-events:none;
  z-index:9999; user-select:none;
}
`;

const HTML = `
<html lang="es"><head><meta charset="UTF-8"><style>{{{css}}}</style></head><body>
<div class="page">

  <!-- Header -->
  <div class="hdr">
    <div class="hdr-title">
      <h1>Declaración recapitulativa de operaciones<br>intracomunitarias</h1>
    </div>
    <div class="hdr-right">
      <div class="hdr-sheet">Hoja Resumen</div>
      <div class="hdr-badge">
        <span class="label">Modelo</span>
        <span class="model">349</span>
      </div>
    </div>
  </div>

  <!-- Declarante + Ejercicio -->
  <div class="two-col">
    <div class="section col-declarante">
      <div class="section-title">Declarante</div>
      <div class="section-body">
        <div class="field">
          <label>N.º de identificación fiscal (NIF)</label>
          <div class="field-box" style="max-width:120px;">{{nif}}</div>
        </div>
        <div class="field">
          <label>Apellidos y nombre (por este orden), denominación o razón social del declarante</label>
          <div class="field-box">{{orgName}}</div>
        </div>
        <div class="field" style="margin-bottom:0;">
          <label>NIF del representante legal</label>
          <div class="field-box" style="max-width:140px;"></div>
        </div>
      </div>
    </div>
    <div class="section col-ejercicio">
      <div class="section-title">Ejercicio</div>
      <div class="section-body">
        <div class="field">
          <label>Ejercicio (con 4 cifras)</label>
          <div class="field-box" style="max-width:80px;">{{year}}</div>
        </div>
        <div class="field">
          <label>Período</label>
          <div class="field-box" style="max-width:60px;">{{period}}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Persona de contacto -->
  <div class="section">
    <div class="section-title">Persona y teléfono de contacto</div>
    <div class="section-body">
      <div class="contact-row">
        <div class="field">
          <label>Apellidos y nombre (por este orden) de la persona con quien relacionarse</label>
          <div class="field-box">{{contact}}</div>
        </div>
        <div class="field">
          <label>Teléfono de contacto</label>
          <div class="field-box">{{phone}}</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Resumen -->
  <div class="section">
    <div class="section-title">Resumen de los datos incluidos en la declaración</div>
    <div class="section-body">
      <div class="summary-row">
        <div class="summary-label">Número total de operadores intracomunitarios</div>
        <div class="summary-casilla">01</div>
        <div class="summary-value">{{fmtInt totalOperators}}</div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Importe de las operaciones intracomunitarias</div>
        <div class="summary-casilla">02</div>
        <div class="summary-value">{{fmtAmount totalAmount}}</div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Número total de operadores intracomunitarios con rectificaciones</div>
        <div class="summary-casilla">03</div>
        <div class="summary-value">{{fmtInt totalRectifOps}}</div>
      </div>
      <div class="summary-row">
        <div class="summary-label">Importe de las rectificaciones</div>
        <div class="summary-casilla">04</div>
        <div class="summary-value">{{fmtAmount totalRectifAmount}}</div>
      </div>
    </div>
  </div>

  <!-- Operators detail -->
  {{#if operators.length}}
  <div class="section">
    <div class="section-title">Detalle de operadores intracomunitarios</div>
    <div class="section-body" style="padding:4px 6px;">
      <table class="ops-table">
        <thead>
          <tr>
            <th>NIF/IVA Operador</th>
            <th>Nombre / Razón Social</th>
            <th>Clave op.</th>
            <th class="right">Base imponible (€)</th>
          </tr>
        </thead>
        <tbody>
          {{#each operators}}
          <tr>
            <td class="mono">{{this.nif}}</td>
            <td>{{this.name}}</td>
            <td><span class="key-badge">{{this.key}}</span></td>
            <td class="mono right">{{fmtAmount this.base}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>
  </div>
  {{/if}}

  <!-- Complementaria / sustitutiva -->
  <div class="section">
    <div class="section-title">Declaración complementaria o sustitutiva</div>
    <div class="section-body">
      <p class="comp-text">
        Si la presentación de esta declaración tiene por objeto incluir operaciones que, debiendo haber sido relacionadas en otra declaración
        del mismo período presentada anteriormente, hubieran sido completamente omitidas en la misma o si el objeto es modificar parcialmente
        el contenido de la anteriormente presentada, se marcará con "X" la casilla "Declaración complementaria".<br>
        Cuando la presentación de esta declaración tenga por objeto anular y sustituir por completo a otra declaración del mismo ejercicio
        presentada anteriormente, en la cual se hubieran consignado datos inexactos o erróneos, se indicará su carácter de declaración
        sustitutiva marcando con "X" la casilla correspondiente.<br>
        En ambos casos, se hará constar el número de 13 dígitos identificativo de la declaración del mismo ejercicio anteriormente presentada.
      </p>
      <div class="comp-checks">
        <div class="comp-check"><span class="check-box"></span> Declaración complementaria</div>
        <div class="comp-check"><span class="check-box"></span> Declaración sustitutiva</div>
        <div class="former-field">
          <label>Número identificativo de la declaración anterior</label>
          <div class="former-box"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">BORRADOR — Generado desde Etendo GO · Modelo 349 · {{year}} {{period}}</div>
</div>
<div class="watermark">Solo referencia · No presentar</div>
</body></html>
`;

export function use349Pdf() {
  const [pdfUrl,  setPdfUrl]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // Revoke the object URL when the component unmounts to avoid memory leaks
  React.useEffect(() => {
    return () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); };
  }, [pdfUrl]);

  async function generatePdf(decl, operators = []) {
    setLoading(true);
    setError(null);
    try {
      const totalAmount = operators.reduce((s, op) => s + Number(op.base || 0), 0);
      const data = {
        nif:               decl._precomputed?.orgNif  ?? decl.nif     ?? '',
        orgName:           decl._precomputed?.orgName ?? decl.orgName ?? '',
        year:              decl.year,
        period:            decl.period,
        contact:           decl.contact  ?? '',
        phone:             decl.phone    ?? '',
        totalOperators:    operators.length,
        totalAmount,
        totalRectifOps:    0,
        totalRectifAmount: 0,
        operators,
      };
      const blob = await renderPdf(HTML, CSS, HELPERS, data);
      const url = URL.createObjectURL(blob);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(url);
      return url;
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function clearPdf() {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setError(null);
  }

  return { pdfUrl, loading, error, generatePdf, clearPdf };
}
