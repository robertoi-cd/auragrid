import React from 'react';
import { MENSAJE_INDICATIVO } from '../lib/creditos';
import { Link } from 'react-router-dom';
import { formatearMoneda, formatearFecha, formatearPorcentaje, formatearDscr } from '../lib/formato';
import { estadoPreparacionRtb, kpisResumen } from '../lib/modulos';
import Hitos from './Hitos';
import { hoyISO } from '../lib/validaciones';

const tarjeta = { backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '18px 22px', display: 'grid', gap: '12px', color: '#e8e6e1', fontFamily: 'sans-serif' };
const h2 = { margin: 0, fontSize: '16px', fontWeight: 700 };
const gris = { fontSize: '12px', color: '#9aa1ad' };
const enlace = { color: '#7cc4ff', fontWeight: 600, textDecoration: 'none', fontSize: '12px' };


// Estado de la preparación: bloqueados → "RTB no alcanzable aún"; fecha posterior al RTB → "RTB en riesgo".
function EstadoRtb({ frentes, fechaRtb, rutaPermisos }) {
  const e = estadoPreparacionRtb(frentes, fechaRtb);
  if (e.alcanzable && !e.enRiesgo) return null;
  const Lista = ({ items, conFecha }) => (
    <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '3px', fontSize: '13px' }}>
      {items.map((i) => (
        <li key={`${i.iFrente}-${i.iItem}`}>
          <strong style={{ fontWeight: 600 }}>{i.titulo}</strong>
          <span style={gris}> · {i.frente} · {i.responsable || 'sin responsable'}{conFecha && i.fecha ? ` · compromiso ${formatearFecha(i.fecha)}` : ''}</span>
        </li>
      ))}
    </ul>
  );
  return (
    <div style={{ display: 'grid', gap: '12px' }}>
      {!e.alcanzable && (
        <div role="alert" style={{ ...tarjeta, borderColor: '#f2867b', backgroundColor: '#2a1a19' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ ...h2, color: '#f2867b' }}>RTB no alcanzable aún</h2>
            <Link to={rutaPermisos} style={enlace}>Ir a Permisos y frentes →</Link>
          </div>
          <span style={gris}>{e.bloqueados.length} {e.bloqueados.length === 1 ? 'entregable bloqueado impide' : 'entregables bloqueados impiden'} declarar RTB:</span>
          <Lista items={e.bloqueados} conFecha />
        </div>
      )}
      {e.enRiesgo && (
        <div role="status" style={{ ...tarjeta, borderColor: '#f0b65a', backgroundColor: '#2a2414' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <h2 style={{ ...h2, color: '#f0b65a' }}>RTB en riesgo: {e.despuesDelRtb.length} {e.despuesDelRtb.length === 1 ? 'entregable termina' : 'entregables terminan'} después del RTB objetivo</h2>
            <Link to={rutaPermisos} style={enlace}>Ir a Permisos y frentes →</Link>
          </div>
          <span style={gris}>RTB objetivo: {formatearFecha(fechaRtb)}. Entregables no completos con fecha compromiso posterior:</span>
          <Lista items={e.despuesDelRtb} conFecha />
        </div>
      )}
    </div>
  );
}

function valorKpi(k) {
  if (k.tipo === 'estructura') return `${formatearMoneda(k.valor)} / ${formatearMoneda(k.equity)}`;
  if (k.valor == null) return 'N/D';
  if (k.tipo === 'porcentaje') return formatearPorcentaje(k.valor, 2);
  if (k.tipo === 'dscr') return formatearDscr(k.valor);
  if (k.tipo === 'moneda') return formatearMoneda(k.valor);
  if (k.tipo === 'usdMwh') return `${formatearMoneda(k.valor, 2)}/MWh`;
  if (k.tipo === 'precios') return `${formatearMoneda(k.valor, 2)} vs ${k.mercado != null ? formatearMoneda(k.mercado, 2) : 'N/D'}`;
  return String(k.valor);
}
const colorKpi = (k) =>
  k.valor == null ? '#7d8490'
    : k.clave === 'tirEquity' && k.objetivo != null && k.valor < k.objetivo ? '#f0b65a'
    : k.tipo === 'dscr' && k.covenant != null && k.valor < k.covenant ? '#f2867b'
    : '#f8fafc';

function Kpis({ finanzas, rentabilidad, supuestos, motivoNd, rutaFinanzas, modelo, indicativo, escenarios, quiebres }) {
  const kpis = kpisResumen({ finanzas, rentabilidad, supuestos, motivoNd, escenarios, quiebres });
  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h2 style={h2}>Indicadores</h2>
        <Link to={rutaFinanzas} style={enlace}>Ver el detalle en Finanzas →</Link>
      </div>
      {indicativo && <span role="status" data-indicativo="" style={{ fontSize: '12.5px', color: '#f0b65a', fontWeight: 600 }}>{MENSAJE_INDICATIVO}</span>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))', gap: '14px' }}>
        {kpis.map((k) => (
          <div key={k.clave} data-kpi={k.clave} style={{ display: 'grid', gap: '2px', alignContent: 'start' }}>
            <span style={{ fontSize: '11px', color: '#9aa1ad', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 }}>
              {k.titulo}{k.tipo === 'estructura' ? ` (${formatearPorcentaje(1 - k.equityPct)} deuda)` : k.tipo === 'precios' ? ' (USD/MWh)' : ''}
            </span>
            <span style={{ fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: colorKpi(k) }}>{valorKpi(k)}</span>
            <span style={{ fontSize: '11px', color: '#9aa1ad', lineHeight: 1.4 }}>{k.contexto}</span>
          </div>
        ))}
      </div>
      {modelo}
    </div>
  );
}

function Modelo({ version, actualizado, origenCronograma, esEjemplo }) {
  const fecha = actualizado ? new Date(actualizado).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
  return (
    <p data-modelo="" style={{ margin: 0, fontSize: '12px', color: '#9aa1ad', borderTop: '1px solid #323843', paddingTop: '10px' }}>
      <strong style={{ color: '#e8e6e1' }}>Modelo:</strong> versión de la app {version} · {fecha ? `supuestos actualizados el ${fecha}` : 'supuestos sin fecha de actualización'}
      {origenCronograma === 'ejemplo' ? ' · cronograma de ejemplo' : origenCronograma === 'capturado' ? ' · cronograma capturado' : ' · sin cronograma de caja'}
      {esEjemplo ? ' · proyecto de ejemplo' : ''}
    </p>
  );
}

/**
 * Resumen del proyecto: preparación para RTB (barra existente + estado de bloqueos y fechas), alertas con sus datos
 * y enlace a su módulo, indicadores con contexto, hitos y versión del modelo. Todo viene ya calculado.
 */
export default function Resumen({ barraRtb, alertas, historial, project, frentes, finanzas, rentabilidad, supuestos, motivoNd, fechas, version, rutaDe, financiamientoIndicativo = false, escenarios = null, quiebres = null, hoy = hoyISO() }) {
  return (
    <>
      <section data-seccion="rtb">{barraRtb}</section>
      <EstadoRtb frentes={frentes} fechaRtb={project.fechaRtb} rutaPermisos={rutaDe('permisos')} />
      <section data-seccion="alertas">{alertas}</section>
      <Kpis finanzas={finanzas} rentabilidad={rentabilidad} supuestos={supuestos} motivoNd={motivoNd} rutaFinanzas={rutaDe('finanzas')} indicativo={financiamientoIndicativo} escenarios={escenarios} quiebres={quiebres}
        modelo={<Modelo version={version} actualizado={supuestos?.actualizado ?? null} origenCronograma={finanzas.origenCronograma} esEjemplo={project.esEjemplo} />} />
      <Hitos fechas={fechas} hoy={hoy} />
      {historial}
    </>
  );
}
