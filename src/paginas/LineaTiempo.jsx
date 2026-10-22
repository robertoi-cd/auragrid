import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatearFecha } from '../lib/formato';
import { hoyISO } from '../lib/validaciones';
import { filasFrentes, filasGarantias, rangoLineaTiempo, posicion, marcasTrimestre, etiquetaTrimestre, ICONO_CLASE, iconoGarantia } from '../lib/lineaTiempo';
import { ETIQUETAS_ESTADO } from '../lib/historialCambios';
import { tarjeta, h2, gris, enlace } from './estilos';

const COLOR_CLASE = { completo: '#5cc596', vencido: '#f2867b', despuesRtb: '#f0b65a', pendiente: '#7cc4ff' };
const TEXTO_CLASE = { vencido: 'Vencido', despuesRtb: 'Después del RTB' };
const COLOR_NIVEL = { critico: '#f2867b', advertencia: '#f0b65a', info: '#8fb0e0', vigente: '#5cc596' };
const MES = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const etiquetaFila = { flex: '0 0 170px', minWidth: 0, fontSize: '12px', color: '#c5c9d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const pista = { flex: '1 1 220px', minWidth: 0, position: 'relative', height: '24px', borderBottom: '1px solid #2b313b' };

function Referencias({ rango, fechaRtb, hoy }) {
  return (
    <>
      {fechaRtb && <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${posicion(fechaRtb, rango)}%`, width: '2px', backgroundColor: '#f0a535' }} />}
      <span aria-hidden="true" style={{ position: 'absolute', top: 0, bottom: 0, left: `${posicion(hoy, rango)}%`, width: 0, borderLeft: '1px dashed #9aa1ad' }} />
    </>
  );
}

function Fila({ etiqueta, titulo, children, rango, fechaRtb, hoy }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: '10px' }}>
      <span style={etiquetaFila} title={titulo ?? etiqueta}>{etiqueta}</span>
      <div style={pista}>
        <Referencias rango={rango} fechaRtb={fechaRtb} hoy={hoy} />
        {children}
      </div>
    </div>
  );
}

// Marca con ícono y color (el estado no depende solo del color)
const marca = (pct, color) => ({
  position: 'absolute', top: '50%', left: `${pct}%`, transform: 'translate(-50%, -50%)', fontSize: '13px', fontWeight: 700,
  lineHeight: 1, color, textShadow: '0 0 3px #1c2028, 0 0 3px #1c2028', cursor: 'default',
});

/** true en pantallas de 900 px o más (etiquetas por trimestre); en las chicas, solo enero. */
function usePantallaAncha() {
  const consulta = '(min-width: 900px)';
  const [ancha, setAncha] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(consulta).matches);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return undefined;
    const cambio = () => setAncha(m.matches);
    m.addEventListener('change', cambio);
    return () => m.removeEventListener('change', cambio);
  }, []);
  return ancha;
}

/**
 * Línea de tiempo del Cronograma: entregables por frente (rojo vencidos, ámbar después del RTB) y garantías
 * (vencimiento y "vigencia requerida hasta"), con el RTB objetivo como línea de referencia. Debajo, la misma
 * información en lista (para leerla en pantallas angostas y con lector de pantalla).
 */
export default function LineaTiempo({ frentes, garantias, fechas, margen, alertas, fechaRtb, rutaDe, accion = null, hoy = hoyISO() }) {
  const ancha = usePantallaAncha();
  const filas = filasFrentes(frentes, fechaRtb, hoy);
  const filasG = fechas ? filasGarantias(garantias, fechas, margen, alertas) : [];
  const rango = rangoLineaTiempo([hoy, fechaRtb, ...filas.flatMap((f) => f.conFecha.map((i) => i.fecha)), ...filasG.flatMap((g) => [g.vence, g.limite])]);

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h2 style={h2}>Línea de tiempo</h2>
        {accion}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', ...gris }} aria-label="Leyenda">
        {[['vencido', 'Vencido'], ['despuesRtb', 'Termina después del RTB'], ['pendiente', 'Pendiente'], ['completo', 'Completo']].map(([c, t]) => (
          <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span aria-hidden="true" style={{ color: COLOR_CLASE[c], fontWeight: 700 }}>{ICONO_CLASE[c]}</span>{t}</span>
        ))}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ width: '2px', height: '12px', backgroundColor: '#f0a535' }} />RTB objetivo{fechaRtb ? ` (${formatearFecha(fechaRtb)})` : ' sin definir'}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span style={{ height: '12px', borderLeft: '1px dashed #9aa1ad' }} />Hoy</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span aria-hidden="true" style={{ color: '#5cc596', fontWeight: 700 }}>◆</span>Garantía que cubre su vigencia</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}><span aria-hidden="true" style={{ color: '#f0b65a', fontWeight: 700 }}>⚠</span>Garantía que requiere prórroga (en su vencimiento) · <span style={{ width: '2px', height: '12px', backgroundColor: '#e8e6e1' }} />vigencia requerida + margen</span>
      </div>

      {rango ? (
        <div style={{ display: 'grid', gap: '2px' }} aria-hidden="true">
          {/* Eje: inicio de cada trimestre */}
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: '10px' }}>
            <span style={{ ...etiquetaFila, color: 'transparent' }}>.</span>
            <div style={{ ...pista, borderBottom: 'none', height: '16px', overflow: 'hidden' }}>
              {/* Una raya por trimestre; etiqueta solo en enero (no se enciman en pantallas angostas) */}
              {marcasTrimestre(rango).map((m) => (
                <span key={m} style={{ position: 'absolute', left: `${posicion(m, rango)}%`, bottom: 0, height: ancha || m.endsWith('-01-01') ? '16px' : '5px', borderLeft: '1px solid #3a414d' }}>
                  {(ancha || m.endsWith('-01-01')) && (
                    <span style={{ position: 'absolute', left: '3px', top: 0, fontSize: '10px', color: '#9aa1ad', whiteSpace: 'nowrap' }}>{ancha ? etiquetaTrimestre(m) : MES.format(new Date(`${m}T00:00:00Z`)).replace('.', '')}</span>
                  )}
                </span>
              ))}
            </div>
          </div>
          {filas.map((f) => (
            <Fila key={f.frente} etiqueta={f.frente} rango={rango} fechaRtb={fechaRtb} hoy={hoy}>
              {f.conFecha.map((i) => (
                <span key={`${i.iFrente}-${i.iItem}`} title={`${i.titulo} · ${formatearFecha(i.fecha)} · ${ETIQUETAS_ESTADO[i.estado] ?? i.estado}`} style={marca(posicion(i.fecha, rango), COLOR_CLASE[i.clase])}>{ICONO_CLASE[i.clase]}</span>
              ))}
            </Fila>
          ))}
          {filasG.length > 0 && <span style={{ ...gris, marginTop: '6px' }}>Garantías</span>}
          {filasG.map((g) => {
            const pv = posicion(g.vence, rango);
            const pl = g.limite ? posicion(g.limite, rango) : null;
            return (
              <Fila key={g.indice} etiqueta={g.nombre} rango={rango} fechaRtb={fechaRtb} hoy={hoy}>
                {pl != null && !g.cubre && (
                  <span style={{ position: 'absolute', top: '50%', height: '3px', marginTop: '-1px', left: `${pv}%`, width: `${pl - pv}%`, backgroundColor: COLOR_NIVEL[g.nivel], opacity: 0.6 }} />
                )}
                {pl != null && <span title={`Vigencia requerida hasta ${g.hito} + margen: ${formatearFecha(g.limite)}`} style={{ position: 'absolute', top: '4px', bottom: '4px', left: `${pl}%`, width: '2px', backgroundColor: '#e8e6e1' }} />}
                <span title={`${g.nombre} · vence ${formatearFecha(g.vence)} · ${g.nivel === 'vigente' ? 'cubre su vigencia' : g.etiqueta}`} style={marca(pv, COLOR_NIVEL[g.nivel])}>{iconoGarantia(g)}</span>
              </Fila>
            );
          })}
        </div>
      ) : (
        <span style={gris}>Sin fechas que mostrar: captura las fechas compromiso de los entregables y el RTB objetivo.</span>
      )}

      {/* La misma información en lista */}
      <div style={{ display: 'grid', gap: '10px' }}>
        {filas.map((f) => (
          <details key={f.frente}>
            <summary style={{ cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
              {f.frente}{' '}
              <span style={gris}>
                · {f.conFecha.length + f.sinFecha.length} {f.conFecha.length + f.sinFecha.length === 1 ? 'entregable' : 'entregables'}
                {['vencido', 'despuesRtb'].map((c) => {
                  const n = f.conFecha.filter((i) => i.clase === c).length;
                  return n ? <span key={c} style={{ color: COLOR_CLASE[c] }}> · {n} {c === 'vencido' ? (n === 1 ? 'vencido' : 'vencidos') : 'después del RTB'}</span> : null;
                })}
              </span>
            </summary>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px', display: 'grid', gap: '3px', fontSize: '12px' }}>
              {[...f.conFecha, ...f.sinFecha].map((i) => (
                <li key={`${i.iFrente}-${i.iItem}`}>
                  <span aria-hidden="true" style={{ color: COLOR_CLASE[i.clase], fontWeight: 700, marginRight: '4px' }}>{ICONO_CLASE[i.clase]}</span>
                  <span style={{ fontFamily: 'monospace', color: '#c5c9d0' }}>{i.fecha ? formatearFecha(i.fecha) : 'sin fecha'}</span>{' · '}
                  {i.titulo}{' · '}<span style={{ color: '#9aa1ad' }}>{ETIQUETAS_ESTADO[i.estado] ?? i.estado}{i.responsable ? ` · ${i.responsable}` : ''}</span>
                  {TEXTO_CLASE[i.clase] && <strong style={{ marginLeft: '6px', color: COLOR_CLASE[i.clase] }}>{TEXTO_CLASE[i.clase]}</strong>}
                </li>
              ))}
            </ul>
          </details>
        ))}
        {filasG.length > 0 && (
          <div style={{ display: 'grid', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '13px' }}>Vencimientos de garantías y prórrogas</strong>
              <Link to={rutaDe('garantias')} style={enlace}>Ir a Garantías →</Link>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
              {filasG.map((g) => (
                <li key={g.indice} style={{ backgroundColor: '#22272f', borderRadius: '8px', padding: '8px 10px', borderLeft: `3px solid ${COLOR_NIVEL[g.nivel]}`, display: 'grid', gap: '2px', fontSize: '12px' }}>
                  <strong style={{ fontSize: '13px' }}><span aria-hidden="true" style={{ color: COLOR_NIVEL[g.nivel], marginRight: '4px' }}>{iconoGarantia(g)}</span>{g.nombre}</strong>
                  <span>Vence <span style={{ fontFamily: 'monospace' }}>{formatearFecha(g.vence)}</span>
                    {' · '}vigencia requerida hasta {g.hito}{g.fechaHito ? ` (${formatearFecha(g.fechaHito)}${g.estimada ? ', estimada' : ''})` : ''}
                    {g.limite ? ` · debe vencer después del ${formatearFecha(g.limite)}` : ''}</span>
                  <span style={{ color: COLOR_NIVEL[g.nivel] }}>{g.nivel === 'vigente' ? 'Cubre su vigencia requerida' : g.etiqueta}{g.accionCorta ? ` → ${g.accionCorta}` : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
