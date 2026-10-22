import React from 'react';
import { formatearMoneda, formatearNumero } from './lib/formato';
import { CAMPOS_IVA } from './lib/camposSupuestos';
import { ORIGENES_EQUIPO, FINANCIAMIENTOS_IVA, NOTA_IVA, LIMITACION_IVA_IMPORTACION, LIMITACION_IVA_INTERESES, FUENTE_TASA_IVA, NOTA_TASA_IVA, NOTA_TASA_LINEA_IVA } from './lib/iva';

const campoEstilo = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '13px' };

// IVA de construcción en el editor de supuestos: campos, cómo se muestran y el rango que acepta cada uno (los
// mismos checks que la base de datos).
export const ETIQUETA_IVA = Object.fromEntries(CAMPOS_IVA.map(([c, e]) => [c, e]));
const TEXTO_IVA = new Set(['ivaOrigenEquipo', 'ivaFinanciamiento']);
export const vacio = (v) => v === null || v === '' || v === undefined;

export function valorIva(c, v) {
  if (c === 'ivaActivo') return v ? 'Activo' : 'Apagado';
  if (vacio(v)) return 'Sin capturar';
  if (c === 'ivaOrigenEquipo') return ORIGENES_EQUIPO[v] ?? v;
  if (c === 'ivaFinanciamiento') return FINANCIAMIENTOS_IVA[v] ?? v;
  if (c === 'ivaLineaMonto') return formatearMoneda(Number(v));
  if (c === 'ivaRecuperacionMeses') return `${v} meses`;
  return `${formatearNumero(Number(v), 2)} %`;
}

export const RANGO_IVA = {
  ivaTasaPct: [(n) => n > 0 && n <= 100, 'mayor a 0 y hasta 100 %'],
  ivaCapexSujetoPct: [(n) => n >= 0 && n <= 100, '0 a 100 %'],
  ivaRecuperacionMeses: [(n) => Number.isInteger(n) && n >= 0 && n <= 60, 'meses enteros de 0 a 60'],
  ivaLineaMonto: [(n) => n > 0, 'mayor a 0'],
  ivaLineaTasaPct: [(n) => n >= 0 && n <= 100, '0 a 100 %'],
  ivaLineaComisionPct: [(n) => n >= 0 && n <= 100, '0 a 100 %'],
};

/** Problema del IVA del borrador antes de guardar (tasa obligatoria y rangos), o '' si está bien. */
export function revisarIva(b) {
  if (vacio(b.ivaTasaPct)) return 'La tasa de IVA es obligatoria (16 %, LIVA art. 1).';
  for (const [c, [valido, texto]] of Object.entries(RANGO_IVA)) {
    if (!vacio(b[c]) && !(Number.isFinite(Number(b[c])) && valido(Number(b[c])))) return `Revisa "${ETIQUETA_IVA[c]}" (${texto}).`;
  }
  return '';
}

/** Supuestos de IVA del borrador con su tipo (para el aviso y para guardar): vacío → null, nunca un valor supuesto. */
export const ivaDelBorrador = (b) => Object.fromEntries(Object.keys(ETIQUETA_IVA).map((c) => [c,
  c === 'ivaActivo' ? Boolean(b[c]) : vacio(b[c]) ? null : TEXTO_IVA.has(c) ? b[c] : Number(b[c])]));

/** Una línea con los supuestos de IVA (resumen de supuestos). */
export const descripcionIva = (s) => [
  `${valorIva('ivaTasaPct', s.ivaTasaPct)} sobre ${valorIva('ivaCapexSujetoPct', s.ivaCapexSujetoPct)} del CAPEX`,
  valorIva('ivaOrigenEquipo', s.ivaOrigenEquipo),
  `recuperación: ${valorIva('ivaRecuperacionMeses', s.ivaRecuperacionMeses)}`,
  `financiamiento: ${valorIva('ivaFinanciamiento', s.ivaFinanciamiento)}`,
  ...(s.ivaFinanciamiento === 'linea' ? [`línea ${valorIva('ivaLineaMonto', s.ivaLineaMonto)} al ${valorIva('ivaLineaTasaPct', s.ivaLineaTasaPct)} anual, comisión ${valorIva('ivaLineaComisionPct', s.ivaLineaComisionPct)}`] : []),
].join(' · ') + ` · ${NOTA_IVA}`;

// Interruptor y, activo, los datos del IVA. Todo vacío al activarlo (sin valores inventados) salvo la tasa, que es
// dato de ley (LIVA art. 1) y viene prellenada. Con línea de IVA: monto, tasa anual y comisión.
export default function CamposIva({ borrador, setBorrador }) {
  const activo = Boolean(borrador.ivaActivo);
  const set = (c) => (e) => setBorrador({ ...borrador, [c]: e.target.value });
  const nota = { fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' };
  const numero = (c, paso, unidad, ayuda, texto = `${ETIQUETA_IVA[c]} (${unidad})`) => (
    <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>{texto}
      <input name={c} type="number" step={paso} value={borrador[c] ?? ''} placeholder="Sin capturar" onChange={set(c)} style={campoEstilo} />
      {ayuda && <span style={nota}>{ayuda}</span>}
    </label>
  );
  const opcion = (c, opciones) => (
    <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>{ETIQUETA_IVA[c]}
      <select name={c} value={borrador[c] ?? ''} onChange={set(c)} style={campoEstilo}>
        <option value="">Elige…</option>
        {Object.entries(opciones).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
  return (
    <fieldset style={{ display: 'grid', gap: '8px' }}>
      <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>IVA de construcción</legend>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#e2e8f0' }}>
        <input type="checkbox" name="ivaActivo" checked={activo}
          onChange={(e) => setBorrador({ ...borrador, ivaActivo: e.target.checked, ...(e.target.checked && vacio(borrador.ivaTasaPct) ? { ivaTasaPct: 16 } : {}) })} />
        Considerar el IVA de construcción (necesidad temporal de caja que se recupera del SAT)
      </label>
      {activo && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {numero('ivaTasaPct', 0.5, '%', `Fuente: ${FUENTE_TASA_IVA}. ${NOTA_TASA_IVA}`)}
            {numero('ivaCapexSujetoPct', 0.5, '%')}
            {opcion('ivaOrigenEquipo', ORIGENES_EQUIPO)}
            {numero('ivaRecuperacionMeses', 1, 'meses')}
            {opcion('ivaFinanciamiento', FINANCIAMIENTOS_IVA)}
          </div>
          {borrador.ivaFinanciamiento === 'linea' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
              {numero('ivaLineaMonto', 1000, 'USD', null, 'Monto máximo (equivalente en USD)')}
              {numero('ivaLineaTasaPct', 0.1, '% anual', NOTA_TASA_LINEA_IVA)}
              {numero('ivaLineaComisionPct', 0.1, '%', '0 % es válido (sin comisión).')}
            </div>
          )}
          <span style={nota}>{borrador.ivaOrigenEquipo !== 'local' ? `${LIMITACION_IVA_IMPORTACION} ` : ''}{borrador.ivaFinanciamiento === 'linea' ? LIMITACION_IVA_INTERESES : ''}</span>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>{NOTA_IVA}</span>
        </>
      )}
    </fieldset>
  );
}
