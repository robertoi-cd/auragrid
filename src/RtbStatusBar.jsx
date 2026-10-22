import React, { useState } from 'react';
import { contarAlertas, diasEntre, hoyISO, situacionRtb } from './lib/validaciones';
import { formatearFecha } from './lib/formato';
import { guardarFechaRtb } from './lib/entregablesApi';

const titulo = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.07em', color: '#9aa1ad', fontWeight: '600' };
const boton = { padding: '3px 9px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '11px', cursor: 'pointer', justifySelf: 'start' };
const botonPrimario = { ...boton, border: 'none', backgroundColor: '#f0a535', color: '#1c2028', fontWeight: 700 };

const COLOR_SITUACION = { atraso: '#f2867b', en_riesgo: '#f0b65a', a_tiempo: '#5cc596' };
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
function textoSituacion(s) {
  if (s.tipo === 'atraso') return `${s.dias} días de atraso${s.bloqueados ? ` · ${plural(s.bloqueados, 'bloqueado', 'bloqueados')}` : ''}`;
  if (s.tipo === 'en_riesgo') return `En riesgo: ${plural(s.bloqueados, 'entregable bloqueado', 'entregables bloqueados')}`;
  return 'a tiempo';
}

// RTB objetivo: lo captura el usuario; se confirma antes de guardar
function EditorRtb({ projectId, fechaRtb, onGuardada, onCerrar }) {
  const [valor, setValor] = useState(fechaRtb ?? '');
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async () => {
    setGuardando(true);
    try {
      onGuardada?.(await guardarFechaRtb(projectId, valor));
      onCerrar();
    } catch (err) {
      setError(err.message);
      setConfirmar(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      {confirmar ? (
        <>
          <span style={{ fontSize: '12px' }}>
            ¿Guardar RTB objetivo? {fechaRtb ? `${formatearFecha(fechaRtb)} → ` : ''}<strong>{formatearFecha(valor)}</strong>
          </span>
          <span style={{ fontSize: '11px', color: '#9aa1ad' }}>Se recalcularán plazos, garantías y alertas.</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar'}</button>
            <button type="button" style={boton} disabled={guardando} onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); if (!valor) { setError('Elige una fecha.'); return; } if (valor === fechaRtb) { setError('La fecha no cambió.'); return; } setError(''); setConfirmar(true); }} style={{ display: 'grid', gap: '6px' }}>
          <input id="fecha-rtb" name="fecha_rtb" type="date" required value={valor} onChange={(e) => setValor(e.target.value)}
            aria-label="Fecha RTB objetivo"
            style={{ padding: '5px 7px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: '#22272f', color: '#e8e6e1', colorScheme: 'dark' }} />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" style={botonPrimario}>Revisar</button>
            <button type="button" style={boton} onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Lector (puedeEditar false): sin botones de edición. evidencia: texto "N de M completos con documento" (null si los documentos no se pudieron leer)
// vista: 'resumen' (preparación, RTB objetivo con su situación y alertas; la fecha se edita en Cronograma: accionRtb
// es el enlace) o 'cronograma' (avance real contra el plan, vencidos, RTB objetivo con su edición y siguiente hito).
// Los textos de cada parte son los mismos en las dos vistas.
export default function RtbStatusBar({ project, capacidad, frentes = [], alertas = [], avance, avisoDatos = '', onRtbGuardada, puedeEditar = true, evidencia = null, vista = 'resumen', accionRtb = null }) {
  const enResumen = vista === 'resumen';
  const enCronograma = vista === 'cronograma';
  const [editandoRtb, setEditandoRtb] = useState(false);

  // Cálculo de entregables completos vs totales
  const allItems = frentes.flatMap(f => f.items || []);
  const completedItems = allItems.filter(i => i[1] === 'completo').length;
  const progressPct = allItems.length > 0 ? Math.round((completedItems / allItems.length) * 100) : 0;
  const planeadoPct = avance && avance.total > 0 ? Math.round(avance.planeadoPct * 100) : null;
  const atrasoPlan = planeadoPct != null && planeadoPct > progressPct;
  const nVencidos = avance?.vencidos.length ?? 0;
  const vencidosCriticos = avance?.vencidos.filter(v => v.critico).length ?? 0;
  const situacion = avance ? situacionRtb(avance, project?.fechaRtb ?? null) : null;
  const tituloProyeccion = avance?.rtbProyectado
    ? [`Fecha del entregable no completo más tardío: ${avance.entregableRtbProyectado}`,
       ...(avance.bloqueadosEnRiesgo.length ? [`Bloqueados antes del RTB: ${avance.bloqueadosEnRiesgo.map(b => b.titulo).join(', ')}`] : [])].join('\n')
    : undefined;

  // RTB objetivo capturado por el usuario (puede no estar definido)
  const fechaRtb = project?.fechaRtb ?? null;
  const daysToRtb = fechaRtb ? diasEntre(hoyISO(), fechaRtb) : null;

  // Conteo de alertas (vienen de validarProyecto)
  const { criticas: criticalCount, advertencias: warningCount, informativas: infoCount } = contarAlertas(alertas);

  // Siguiente hito: el pendiente con fecha más próxima; los entregables sin fecha no se pueden ordenar
  const pendientes = allItems.filter(i => i[1] !== 'completo');
  const conFecha = pendientes.filter(i => i[3]).sort((a, b) => a[3].localeCompare(b[3]));
  const nextMilestone = conFecha[0];

  const kpi = { display: 'grid', gap: '2px', borderLeft: '1px solid #323843', paddingLeft: '16px', flex: '1 1 200px', minWidth: 0 };

  return (
    <div style={{
      backgroundColor: '#1c2028',
      border: '1px solid #323843',
      borderRadius: '12px',
      padding: '20px 24px',
      // Flex en lugar de grid: el progreso ocupa el doble en pantallas anchas y todo se apila en las angostas
      display: 'flex',
      flexWrap: 'wrap',
      gap: '20px',
      alignItems: 'center',
      color: '#e8e6e1',
      fontFamily: 'sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
    }}>
      {/* Progreso RTB */}
      <div style={{ display: 'grid', gap: '6px', flex: '2 1 min(440px, 100%)', minWidth: 0 }}>
        <span style={titulo}>
          {enCronograma ? 'Avance contra el plan' : 'Preparación para RTB'} • {project?.name || 'Proyecto'} • {project?.state || 'México'} • {capacidad}
          {project?.esEjemplo && (
            <span style={{ marginLeft: '8px', padding: '1px 8px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', letterSpacing: 0 }}>Ejemplo</span>
          )}
        </span>
        {enResumen && <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <span style={{ fontSize: '36px', fontWeight: '800', fontFamily: 'monospace', color: '#f0a535' }}>{progressPct}%</span>
          <span style={{ fontSize: '13px', color: '#9aa1ad' }}>{completedItems} de {allItems.length} entregables completos</span>
        </div>}
        {enResumen && evidencia && <span title="Entregables completos con al menos un documento de respaldo" style={{ fontSize: '12px', color: '#9aa1ad' }}>📎 {evidencia}</span>}
        <div style={{ position: 'relative', height: '8px', backgroundColor: '#2b313b', borderRadius: '4px', overflow: 'hidden' }}>
          <div style={{ width: `${progressPct}%`, height: '100%', backgroundColor: '#f0a535', borderRadius: '4px', transition: 'width 0.4s ease' }}></div>
          {enCronograma && planeadoPct != null && (
            <div title={`Planeado a hoy: ${planeadoPct} %`} style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(${planeadoPct}% - 1px)`, width: '2px', backgroundColor: '#e8e6e1' }}></div>
          )}
        </div>
        {enCronograma && avance && (
          <span style={{ fontSize: '12px', color: '#9aa1ad' }}>
            Real <strong style={{ color: '#e8e6e1' }}>{progressPct} %</strong>
            {' · '}Planeado a hoy <strong style={{ color: atrasoPlan ? '#f0b65a' : '#e8e6e1' }}>{planeadoPct} %</strong>
            {' · '}<strong style={{ color: vencidosCriticos > 0 ? '#f2867b' : nVencidos > 0 ? '#f0b65a' : '#5cc596' }}>{nVencidos} {nVencidos === 1 ? 'vencido' : 'vencidos'}</strong>
            {avance.sinFecha > 0 ? ` · ${avance.sinFecha} sin fecha compromiso` : ''}
          </span>
        )}
      </div>

      {/* KPI: RTB Objetivo */}
      <div style={kpi}>
        <span style={titulo}>RTB Objetivo</span>
        {editandoRtb ? (
          <EditorRtb projectId={project?.id} fechaRtb={fechaRtb} onGuardada={onRtbGuardada} onCerrar={() => setEditandoRtb(false)} />
        ) : fechaRtb ? (
          <>
            <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace' }}>{formatearFecha(fechaRtb)}</span>
            <span style={{ fontSize: '12px', color: '#9aa1ad' }}>{daysToRtb >= 0 ? `${daysToRtb} días restantes` : `vencido hace ${-daysToRtb} días`}</span>
            {situacion && situacion.tipo !== 'sin_proyeccion' && (
              <span title={tituloProyeccion} style={{ fontSize: '12px', color: COLOR_SITUACION[situacion.tipo === 'en_riesgo' && situacion.grave ? 'atraso' : situacion.tipo], fontWeight: situacion.tipo === 'a_tiempo' ? 400 : 600 }}>
                Proyectado {formatearFecha(avance.rtbProyectado)} · {textoSituacion(situacion)}
              </span>
            )}
            {enCronograma && project?.id && puedeEditar && <button type="button" style={boton} onClick={() => setEditandoRtb(true)}>Cambiar</button>}
            {enResumen && puedeEditar && accionRtb}
          </>
        ) : (
          <>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#f0b65a' }}>Sin definir</span>
            {enCronograma && project?.id && puedeEditar && <button type="button" style={botonPrimario} onClick={() => setEditandoRtb(true)}>Definir RTB</button>}
            {enResumen && puedeEditar && accionRtb}
          </>
        )}
      </div>

      {/* KPI: Alertas */}
      {enResumen && <div style={kpi}>
        <span style={titulo}>Alertas de Riesgo</span>
        <span style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace', color: criticalCount > 0 ? '#f2867b' : avisoDatos ? '#f0b65a' : '#5cc596' }}>
          {criticalCount} Críticas
        </span>
        <span style={{ fontSize: '12px', color: '#9aa1ad' }}>{warningCount} advertencias{infoCount > 0 ? ` · ${infoCount} informativas` : ''}</span>
        {avisoDatos && <span style={{ fontSize: '11px', color: '#f0b65a', fontWeight: 600 }}>⚠ {avisoDatos}</span>}
      </div>}

      {/* KPI: Siguiente Hito */}
      {enCronograma && <div style={kpi}>
        <span style={titulo}>Siguiente Hito</span>
        <span style={{ fontSize: '14px', fontWeight: '700', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {allItems.length === 0 ? '—'
            : nextMilestone ? nextMilestone[0]
            : pendientes.length > 0 ? 'Sin fechas compromiso'
            : 'Todo completo'}
        </span>
        <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#9aa1ad' }}>
          {nextMilestone ? `${formatearFecha(nextMilestone[3])}${nextMilestone[3] < hoyISO() ? ' · vencido' : ''}` : pendientes.length > 0 ? `${pendientes.length} entregables pendientes sin fecha` : ''}
        </span>
      </div>}
    </div>
  );
}
