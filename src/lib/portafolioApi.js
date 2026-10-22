// Datos de todos los proyectos para Inicio con 5 consultas en total (no una por proyecto): entregables, garantías,
// cronograma de caja, supuestos y créditos, filtrados por la lista de proyectos visibles (RLS aplica igual que en el tablero).
import { supabase } from '../supabase';
import { COLUMNAS_ENTREGABLES, agruparEntregables, MENSAJE_SIN_ENTREGABLES } from './entregablesApi';
import { COLUMNAS_GARANTIAS, aGarantia, MENSAJE_SIN_GARANTIAS } from './garantiasApi';
import { COLUMNAS_MOVIMIENTOS, aMovimiento, MENSAJE_SIN_CRONOGRAMA } from './cronogramaApi';
import { aSupuestos, COLUMNAS_SUPUESTOS, MENSAJE_SIN_SUPUESTOS } from './supuestosApi';
import { COLUMNAS_CREDITOS, aCredito, MENSAJE_SIN_CREDITOS } from './creditosApi';

/** Agrupa filas por project_id, conservando el orden de la consulta. */
const porProyecto = (filas) => {
  const m = new Map();
  for (const f of filas ?? []) m.set(f.project_id, [...(m.get(f.project_id) ?? []), f]);
  return m;
};

/**
 * Map<projectId, { frentes, garantias, movimientos, supuestos, creditos, errores: {entregables?, garantias?, cronograma?, supuestos?, creditos?} }>.
 * Una tabla que no se pudo leer deja su error en todos los proyectos (la tarjeta lo muestra como dato incompleto).
 */
export async function cargarDatosPortafolio(ids) {
  const resultado = new Map();
  if (!ids.length) return resultado;
  const [ent, gar, mov, sup, cre] = await Promise.all([
    supabase.from('project_deliverables').select(`project_id, ${COLUMNAS_ENTREGABLES}`).in('project_id', ids)
      .order('frente_orden', { ascending: true }).order('orden', { ascending: true }),
    supabase.from('project_guarantees').select(COLUMNAS_GARANTIAS).in('project_id', ids).order('vence', { ascending: true }),
    supabase.from('project_cash_movements').select(`project_id, ${COLUMNAS_MOVIMIENTOS}`).in('project_id', ids).order('fecha', { ascending: true }),
    supabase.from('project_financial_assumptions').select(COLUMNAS_SUPUESTOS).in('project_id', ids),
    supabase.from('project_loans').select(COLUMNAS_CREDITOS).in('project_id', ids).order('orden', { ascending: true }),
  ]);
  for (const [nombre, r] of [['entregables', ent], ['garantias', gar], ['cronograma', mov], ['supuestos', sup], ['creditos', cre]]) {
    if (r.error) console.error(`Inicio: no se pudo leer ${nombre}:`, [r.error.code, r.error.message].filter(Boolean).join(' '));
  }
  const e = porProyecto(ent.data), g = porProyecto(gar.data), m = porProyecto(mov.data), s = porProyecto(sup.data), c = porProyecto(cre.data);
  for (const id of ids) {
    resultado.set(id, {
      frentes: agruparEntregables(e.get(id) ?? []),
      garantias: (g.get(id) ?? []).map(aGarantia),
      movimientos: (m.get(id) ?? []).map(aMovimiento),
      supuestos: s.get(id)?.[0] ? aSupuestos(s.get(id)[0]) : null,
      creditos: (c.get(id) ?? []).map(aCredito),
      errores: {
        ...(ent.error ? { entregables: MENSAJE_SIN_ENTREGABLES } : {}),
        ...(gar.error ? { garantias: MENSAJE_SIN_GARANTIAS } : {}),
        ...(mov.error ? { cronograma: MENSAJE_SIN_CRONOGRAMA } : {}),
        ...(sup.error ? { supuestos: MENSAJE_SIN_SUPUESTOS } : {}),
        ...(cre.error ? { creditos: MENSAJE_SIN_CREDITOS } : {}),
      },
    });
  }
  return resultado;
}
