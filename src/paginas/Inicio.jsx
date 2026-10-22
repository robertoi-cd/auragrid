import React, { useState } from 'react';
import { MENSAJE_INDICATIVO } from '../lib/creditos';
import { Link } from 'react-router-dom';
import { formatearMoneda, formatearFecha, formatearPorcentaje, formatearDscr, formatearTir } from '../lib/formato';
import EliminarArchivado from '../EliminarArchivado';

// Mismo estilo oscuro que las tarjetas de los módulos (Resumen, Permisos, Garantías, Finanzas)
const tarjeta = { backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '16px 18px', display: 'grid', alignContent: 'start', gap: '10px', textDecoration: 'none', color: '#e8e6e1', fontFamily: 'sans-serif' };
const etiqueta = { fontSize: '11px', color: '#9aa1ad', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 };
const dato = { fontSize: '15px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' };

// nombreCompleto: el nombre largo del indicador como tooltip (title) y para lectores de pantalla (aria-label), para no
// alargar la etiqueta visible
function Indicador({ titulo, valor, detalle, nombreCompleto }) {
  return (
    <div style={{ display: 'grid', gap: '1px' }} title={nombreCompleto} role={nombreCompleto ? 'group' : undefined} aria-label={nombreCompleto}>
      <span style={etiqueta}>{titulo}</span>
      <span style={{ ...dato, color: valor === 'N/D' ? '#7d8490' : '#f8fafc' }}>{valor}</span>
      {detalle && <span style={{ fontSize: '11px', color: '#9aa1ad' }}>{detalle}</span>}
    </div>
  );
}

function Tarjeta({ t }) {
  const dias = t.diasRtb == null ? null : t.diasRtb >= 0 ? `${t.diasRtb} días restantes` : `vencido hace ${-t.diasRtb} días`;
  return (
    <Link to={`/proyectos/${t.id}/resumen`} style={tarjeta} aria-label={`Abrir ${t.nombre}`}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '16px' }}>{t.nombre}</strong>
        <span style={{ fontSize: '11px', color: '#9aa1ad' }}>
          {t.estado}{t.esEjemplo ? ' · ejemplo' : ''}{t.rol && t.rol !== 'dueno' ? ` · ${t.rol}` : ''}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '10px' }}>
        <Indicador titulo="RTB objetivo" valor={t.fechaRtb ? formatearFecha(t.fechaRtb) : 'Sin definir'} detalle={dias} />
        <Indicador titulo="Preparación RTB" valor={`${t.preparacionRtb} %`} />
        <Indicador titulo="Alertas críticas" valor={String(t.criticas)} detalle={t.completo ? null : 'con los datos disponibles'} />
        <Indicador titulo="CAPEX" valor={t.capex != null ? formatearMoneda(t.capex) : 'N/D'} />
        <Indicador titulo="TIR de equity" nombreCompleto="TIR de equity (flujo disponible)" valor={t.tirEquity != null ? formatearTir(t.tirEquity) : 'N/D'} />
        <Indicador titulo="DSCR mínimo (P50)" valor={t.dscrMinimo != null ? formatearDscr(t.dscrMinimo) : 'N/D'} />
      </div>
      {t.financiamientoIndicativo && (
        <span data-indicativo="" style={{ fontSize: '12px', color: '#f0b65a', fontWeight: 600 }}>{MENSAJE_INDICATIVO}</span>
      )}
      {t.completo ? null : (
        <div style={{ backgroundColor: '#22272f', border: '1px solid #3a414d', borderRadius: '8px', padding: '8px 10px', display: 'grid', gap: '3px' }}>
          <strong style={{ fontSize: '12px', color: '#c5c9d0' }}>Datos incompletos</strong>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#9aa1ad' }}>
            {t.faltantes.map((f) => <li key={f}>{f}</li>)}
          </ul>
        </div>
      )}
    </Link>
  );
}

// Inicio: una tarjeta por proyecto activo, crear proyecto (según el rol) y proyectos archivados.
export default function Inicio({ portafolio, proyectos, archivados, puedeCrear, onNuevo, onRestaurar, onEliminar }) {
  const [verArchivados, setVerArchivados] = useState(false);
  return (
    <div style={{ display: 'grid', gap: '18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#0f172a' }}>Proyectos</h1>
          <span style={{ fontSize: '13px', color: '#64748b' }}>{proyectos.length} {proyectos.length === 1 ? 'proyecto activo' : 'proyectos activos'}</span>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {puedeCrear && (
            <button onClick={onNuevo} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              + Nuevo Parque Solar
            </button>
          )}
          <button onClick={() => setVerArchivados(!verArchivados)} aria-expanded={verArchivados}
            style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
            📂 Archivados ({archivados.length})
          </button>
        </div>
      </div>

      {portafolio.cargando && <span role="status" style={{ fontSize: '13px', color: '#64748b' }}>Cargando los proyectos…</span>}
      {portafolio.error && <span role="alert" style={{ fontSize: '13px', color: '#b91c1c' }}>⚠ {portafolio.error}</span>}
      {!portafolio.cargando && !portafolio.error && proyectos.length === 0 && (
        <div style={{ ...tarjeta, textAlign: 'center' }}>
          <strong>No hay proyectos activos</strong>
          <span style={{ fontSize: '13px', color: '#9aa1ad' }}>{puedeCrear ? 'Crea un nuevo parque solar o restaura uno de los archivados.' : 'No tienes proyectos activos compartidos contigo.'}</span>
        </div>
      )}
      {!portafolio.cargando && portafolio.tarjetas.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))', gap: '16px' }}>
          {portafolio.tarjetas.map((t) => <Tarjeta key={t.id} t={t} />)}
        </div>
      )}

      {verArchivados && (
        <div style={{ ...tarjeta, gap: '12px' }}>
          <strong style={{ fontSize: '15px' }}>Proyectos archivados</strong>
          <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Sus datos financieros y trazas de auditoría se conservan intactos.</span>
          {archivados.length === 0
            ? <span style={{ fontSize: '13px', color: '#7d8490', fontStyle: 'italic' }}>No hay proyectos archivados.</span>
            : archivados.map((a) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '12px', backgroundColor: '#22272f', border: '1px solid #323843', borderRadius: '8px' }}>
                <div>
                  <strong style={{ fontSize: '14px' }}>{a.name} ({a.state})</strong>
                  <div style={{ fontSize: '12px', color: '#9aa1ad' }}>Capacidad: {a.capacityMw} MWac · CAPEX: {formatearMoneda(a.capex)}</div>
                </div>
                {a.rol === 'dueno' && (
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button onClick={() => onRestaurar(a.id)} style={{ backgroundColor: '#059669', color: '#ffffff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>
                    Restaurar al portafolio
                  </button>
                  {onEliminar && <EliminarArchivado proyecto={a} onEliminar={onEliminar} />}
                  </div>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
