// Acceso a project_loans: créditos de la deuda senior (RLS: el equipo lee; dueño y editor escriben).
// El historial lo registra la base (trigger project_loans_historial).
import { supabase } from '../supabase';

export const MENSAJE_SIN_CREDITOS = 'Créditos de la deuda no disponibles';
export const COLUMNAS_CREDITOS = 'id, project_id, orden, banco, participacion_pct, tasa_anual_pct, comision_estructuracion_pct, comision_no_disposicion_pct, estado, updated_at';

const numero = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Fila de Supabase → crédito del modelo (creditos.ts). Vacío se conserva vacío (null), sin valores supuestos. */
export const aCredito = (f) => ({
  id: f.id,
  orden: f.orden,
  banco: f.banco ?? null,
  participacionPct: numero(f.participacion_pct),
  tasaAnualPct: numero(f.tasa_anual_pct),
  comisionEstructuracionPct: numero(f.comision_estructuracion_pct),
  comisionNoDisposicionPct: numero(f.comision_no_disposicion_pct),
  estado: f.estado ?? null,
});

/** Crédito → columnas que se guardan. */
export const aFilaCredito = (c) => ({
  banco: c.banco?.trim() || null,
  participacion_pct: numero(c.participacionPct),
  tasa_anual_pct: numero(c.tasaAnualPct),
  comision_estructuracion_pct: numero(c.comisionEstructuracionPct),
  comision_no_disposicion_pct: numero(c.comisionNoDisposicionPct),
  estado: c.estado || null,
});

const mismoCredito = (a, b) => JSON.stringify(aFilaCredito(a)) === JSON.stringify(aFilaCredito(b));

function errorAlGuardar(error) {
  console.error('Error al guardar project_loans:', [error.code, error.message].filter(Boolean).join(' '));
  if (error.code === '23514') return new Error('Algún valor de los créditos está fuera del rango permitido.');
  if (error.code === '23505') return new Error('Dos créditos quedaron con el mismo orden. Recarga la página e intenta de nuevo.');
  if (error.code === 'PGRST116' || error.code === '42501') return new Error('No tienes permiso para modificar este proyecto.');
  return new Error('No se pudieron guardar los créditos. Intenta de nuevo.');
}

/** Créditos del proyecto, por orden. */
export async function cargarCreditos(projectId) {
  const { data, error } = await supabase.from('project_loans').select(COLUMNAS_CREDITOS).eq('project_id', projectId).order('orden', { ascending: true });
  if (error) {
    console.error('Error al cargar project_loans:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_CREDITOS);
  }
  return (data ?? []).map(aCredito);
}

/**
 * Guarda la tabla de créditos editada: bajas (los que ya no están), cambios (solo los que cambiaron) y altas (con el
 * orden siguiente al mayor que queda). Devuelve los créditos ya guardados.
 */
export async function guardarCreditos(projectId, nuevos, anteriores) {
  const quedan = new Set(nuevos.filter((c) => c.id).map((c) => c.id));
  for (const c of anteriores.filter((a) => !quedan.has(a.id))) {
    const { error } = await supabase.from('project_loans').delete().eq('id', c.id).eq('project_id', projectId);
    if (error) throw errorAlGuardar(error);
  }
  const ahora = new Date().toISOString();
  for (const c of nuevos.filter((x) => x.id)) {
    const antes = anteriores.find((a) => a.id === c.id);
    if (antes && mismoCredito(antes, c)) continue;
    const { error } = await supabase.from('project_loans').update({ ...aFilaCredito(c), updated_at: ahora }).eq('id', c.id).eq('project_id', projectId);
    if (error) throw errorAlGuardar(error);
  }
  let orden = Math.max(0, ...nuevos.filter((c) => c.id).map((c) => c.orden));
  const altas = nuevos.filter((c) => !c.id).map((c) => ({ project_id: projectId, orden: ++orden, ...aFilaCredito(c) }));
  if (altas.length) {
    const { error } = await supabase.from('project_loans').insert(altas);
    if (error) throw errorAlGuardar(error);
  }
  return cargarCreditos(projectId);
}

/**
 * Nombres legibles para el historial (project_change_log, campo 'supuesto', "columna=valor"): columnas de project_loans
 * y, para los registros anteriores al 23 oct 2026, las dos columnas de supuestos en desuso. Solo es texto del
 * historial: esas columnas ya no se leen ni se escriben.
 */
export const ETIQUETAS_HISTORIAL_CREDITOS = {
  banco: 'Banco',
  participacion_pct: 'Participación (%)',
  tasa_anual_pct: 'Tasa anual total (%)',
  comision_estructuracion_pct: 'Comisión de estructuración (%)',
  comision_no_disposicion_pct: 'Comisión por no disposición (% anual)',
  estado: 'Estado',
  orden: 'Orden',
  tasa_interes_pct: 'Tasa de interés (%) (antes de los créditos)',
};
