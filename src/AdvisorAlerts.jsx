import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { contarAlertas, ordenarAlertas, diasEntre, hoyISO } from './lib/validaciones';
import { formatearFecha, formatearMoneda } from './lib/formato';

const textoDias = (dias) => (dias === 0 ? 'hoy' : dias > 0 ? `en ${dias} ${dias === 1 ? 'día' : 'días'}` : `hace ${-dias} ${dias === -1 ? 'día' : 'días'}`);

// Datos de la alerta en una línea (monto con su nombre, fecha, días, responsable) y el enlace al módulo donde se
// resuelve. Si no tiene ninguno de esos datos, solo el enlace. data-agregado: no forma parte del texto de la alerta.
function DatosAlerta({ a, hoy, enlace }) {
  const conDatos = a.monto != null || a.fecha || a.responsable;
  const partes = conDatos ? [
    [a.montoEtiqueta ?? 'Monto', a.monto != null ? formatearMoneda(a.monto) : '—'],
    ['Fecha', a.fecha ? formatearFecha(a.fecha) : '—'],
    ['Días', a.fecha ? textoDias(diasEntre(hoy, a.fecha)) : '—'],
    ['Responsable', a.responsable || '—'],
  ] : [];
  if (!conDatos && !enlace) return null;
  return (
    <div data-agregado="" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px', fontSize: '12px', color: '#9aa1ad', ...(conDatos ? { borderTop: '1px solid #323843', paddingTop: '6px' } : {}) }}>
      {partes.map(([k, v]) => <span key={k}>{k}: <strong style={{ color: '#e8e6e1', fontWeight: 600 }}>{v}</strong></span>)}
      {enlace && <Link to={enlace.to} style={{ marginLeft: 'auto', color: '#7cc4ff', fontWeight: 600, textDecoration: 'none' }}>Ir a {enlace.texto} →</Link>}
    </div>
  );
}

const SEVERIDAD = {
  critico: { label: 'Crítica', bg: '#3d1c1a', color: '#f2867b', borde: '#f2867b' },
  advertencia: { label: 'Advertencia', bg: '#3a2c12', color: '#f0b65a', borde: '#f0b65a' },
  // Seguimiento sin riesgo inmediato (p. ej. una prórroga que vence en más de 90 días)
  info: { label: 'Informativa', bg: '#16263a', color: '#8fb0e0', borde: '#8fb0e0' }
};

// Alerta agrupada de garantías: un renglón corto por garantía (nombre, vencimiento, severidad y acción en pocas
// palabras) y el detalle completo desplegable.
function RenglonGarantia({ g }) {
  const [abierto, setAbierto] = useState(false);
  const sev = SEVERIDAD[g.nivel];
  return (
    <li style={{ backgroundColor: '#1c2028', borderRadius: '6px', padding: '6px 10px' }}>
      <details onToggle={(e) => setAbierto(e.currentTarget.open)}>
        <summary style={{ cursor: 'pointer', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 10px', fontSize: '13px', listStyle: 'none' }}>
          <span aria-hidden="true" style={{ color: '#9aa1ad', fontSize: '11px', width: '10px' }}>{abierto ? '▾' : '▸'}</span>
          <strong style={{ fontWeight: 600 }}>{g.nombre}</strong>
          {g.monto != null && <span data-agregado="" style={{ fontSize: '12px', color: '#9aa1ad' }}>{formatearMoneda(g.monto)}</span>}
          <span style={{ fontSize: '12px', color: '#9aa1ad', fontFamily: 'monospace' }}>vence {formatearFecha(g.vence)}</span>
          <span title={g.etiqueta} style={{ fontSize: '11px', fontWeight: 700, padding: '1px 8px', borderRadius: '999px', backgroundColor: sev.bg, color: sev.color }}>{sev.label}</span>
          <span style={{ fontSize: '12px', color: '#f0a535' }}>→ {g.accionCorta}</span>
        </summary>
        <div style={{ display: 'grid', gap: '4px', marginTop: '6px', paddingLeft: '14px', fontSize: '12px', lineHeight: 1.45 }}>
          <span style={{ color: '#9aa1ad' }}>{g.linea}</span>
          <span><strong style={{ color: '#f0a535' }}>Acción: </strong>{g.accion}</span>
        </div>
      </details>
    </li>
  );
}

function RenglonesGarantias({ garantias }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '4px' }}>
      {garantias.map((g) => <RenglonGarantia key={g.indice} g={g} />)}
    </ul>
  );
}

// Alertas del asesor: salen de validarProyecto(); este panel solo las presenta.
// enlaceModulo(alerta) → { to, texto }: con él, cada alerta muestra sus datos y el enlace a su módulo (Resumen).
export default function AdvisorAlerts({ alertas = [], avisoDatos = '', enlaceModulo, hoy = hoyISO() }) {
  const { criticas, advertencias, informativas } = contarAlertas(alertas);
  const ordenadas = ordenarAlertas(alertas);

  return (
    <div style={{ backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '20px 24px', display: 'grid', gap: '14px', color: '#e8e6e1', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Alertas del asesor</h2>
        <span style={{ fontSize: '12px', color: '#9aa1ad' }}>
          {criticas} críticas · {advertencias} advertencias{informativas > 0 ? ` · ${informativas} informativas` : ''} · ordenadas por severidad
        </span>
      </div>

      {avisoDatos && (
        <div role="alert" style={{ border: '1px solid #f0b65a', backgroundColor: '#3a2c12', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f0b65a' }}>
          ⚠ {avisoDatos}: la lista puede estar incompleta.
        </div>
      )}

      {ordenadas.length === 0 ? (
        <p style={{ margin: 0, fontSize: '13px', color: '#9aa1ad' }}>
          El motor de validaciones no encontró alertas con los datos disponibles.
        </p>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '10px' }}>
          {ordenadas.map((a) => {
            const sev = SEVERIDAD[a.sev];
            return (
              <li key={a.id} style={{ borderLeft: `3px solid ${sev.borde}`, backgroundColor: '#22272f', borderRadius: '8px', padding: '12px 14px', display: 'grid', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '999px', backgroundColor: sev.bg, color: sev.color }}>{sev.label}</span>
                  <span style={{ fontSize: '11px', color: '#9aa1ad' }}>{a.categoria}{a.fecha ? ` · ${formatearFecha(a.fecha)}` : ''}</span>
                </div>
                <div style={{ fontSize: '14px', fontWeight: '600' }}>{a.titulo}</div>
                {a.garantias?.length ? (
                  <>
                    <RenglonesGarantias garantias={a.garantias} />
                    <span style={{ fontSize: '11px', color: '#7d8490' }}>Toca una garantía para ver el detalle y la acción completa.</span>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '12px', color: '#9aa1ad', lineHeight: 1.45 }}>{a.detalle}</div>
                    <div style={{ fontSize: '13px', lineHeight: 1.45 }}>
                      <strong style={{ color: '#f0a535' }}>Acción recomendada: </strong>{a.accion}
                    </div>
                  </>
                )}
                {enlaceModulo && <DatosAlerta a={a} hoy={hoy} enlace={enlaceModulo(a)} />}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
