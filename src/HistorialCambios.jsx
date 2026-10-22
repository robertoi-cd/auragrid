import React, { useState } from 'react';
import { describirCambio, formatearMomento, registroParaLector } from './lib/historialCambios';
import { COLUMNAS } from './lib/supuestosApi';
import { ETIQUETAS_HISTORIAL_CREDITOS } from './lib/creditosApi';
import { GRUPOS, CAMPOS_DEPRECIACION_CATEGORIAS, CAMPOS_IVA, CAMPOS_RIESGOS, CAMPOS_ESTADOS } from './lib/camposSupuestos';

// Columna de project_financial_assumptions o de project_loans → nombre legible (para los cambios de supuestos y créditos)
const ETIQUETAS_SUPUESTOS = {
  ...Object.fromEntries(
    [...GRUPOS.flatMap(([, campos]) => campos), ...CAMPOS_DEPRECIACION_CATEGORIAS, ...CAMPOS_IVA, ...CAMPOS_RIESGOS, ...CAMPOS_ESTADOS].filter(([campo]) => COLUMNAS[campo]).map(([campo, etiqueta, unidad]) => [COLUMNAS[campo], `${etiqueta} (${unidad})`])
  ),
  ...ETIQUETAS_HISTORIAL_CREDITOS,
};

const INICIALES = 10;

// Historial de cambios del proyecto (project_change_log), del más reciente al más antiguo. Cada módulo lo muestra
// filtrado (registros = los de ese módulo; titulo y descripcion dicen cuáles son).
// ocultarCorreos (lector): sin correos de otras personas; los cambios del equipo se describen por el rol.
export default function HistorialCambios({ registros = [], cargando = false, error = '', titulo = 'Historial', descripcion = 'Cambios del proyecto, sus supuestos, entregables y garantías · no se puede editar', vacio = 'Aún no hay cambios registrados en este proyecto.', ocultarCorreos = false, correoPropio = null }) {
  const [verTodo, setVerTodo] = useState(false);
  const lista = ocultarCorreos ? registros.map(r => registroParaLector(r, correoPropio)) : registros;
  const visibles = verTodo ? lista : lista.slice(0, INICIALES);

  return (
    <div style={{ backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '20px 24px', display: 'grid', gap: '12px', color: '#e8e6e1', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>{titulo}</h2>
        <span style={{ fontSize: '12px', color: '#9aa1ad' }}>{descripcion}</span>
      </div>

      {cargando && <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Cargando historial…</span>}
      {error && (
        <div role="alert" style={{ border: '1px solid #f2867b', backgroundColor: '#3d1c1a', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f2867b' }}>
          ⚠ {error}. Los cambios se siguen registrando; recarga para verlos.
        </div>
      )}
      {!cargando && !error && registros.length === 0 && (
        <span style={{ fontSize: '13px', color: '#9aa1ad' }}>{vacio}</span>
      )}

      {visibles.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '2px' }}>
          {visibles.map(r => (
            <li key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 150px) 1fr', gap: '12px', padding: '8px 0', borderTop: '1px solid #2b313b' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#9aa1ad' }}>{formatearMomento(r.momento)}</span>
              <div style={{ display: 'grid', gap: '2px' }}>
                <span style={{ fontSize: '13px' }}>
                  <strong>{r.entregable}</strong> · {r.descripcion && r.campo !== 'supuesto' ? r.descripcion : describirCambio(r, ETIQUETAS_SUPUESTOS)}
                  {r.tipo === 'correccion' && (
                    <span style={{ marginLeft: '8px', fontSize: '10.5px', padding: '1px 7px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', fontWeight: 600 }}>Corrección</span>
                  )}
                </span>
                {r.motivo && <span style={{ fontSize: '12px', color: '#c5c9d0' }}>Motivo: {r.motivo}</span>}
                <span style={{ fontSize: '11px', color: '#7d8490' }}>{r.usuario || 'Usuario desconocido'}</span>
              </div>
            </li>
          ))}
        </ol>
      )}
      {registros.length > INICIALES && (
        <button type="button" onClick={() => setVerTodo(!verTodo)}
          style={{ justifySelf: 'start', padding: '4px 10px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '12px', cursor: 'pointer' }}>
          {verTodo ? 'Ver solo los últimos' : `Ver todo (${registros.length})`}
        </button>
      )}
    </div>
  );
}
