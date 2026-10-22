// Cronograma de caja capturado (project_cash_movements). RLS: solo el dueño del proyecto lee y modifica.
import { supabase } from '../supabase';

export const MENSAJE_SIN_CRONOGRAMA = 'Cronograma de caja no disponible';

export const COLUMNAS_MOVIMIENTOS = 'id, tipo, concepto, fecha, monto, estado, fuente, confirmado, partida, es_anticipo, compromiso_anticipado, fondeo';
const COLUMNAS = COLUMNAS_MOVIMIENTOS;
const PARTIDAS = new Set(['equipos', 'financiero']);

/** Fila de Supabase → Movimiento del modelo financiero. */
export const aMovimiento = (f) => ({
  id: f.id,
  tipo: f.tipo,
  concepto: f.concepto,
  fecha: f.fecha,
  monto: Number(f.monto),
  estado: f.estado,
  ...(f.tipo === 'fondo'
    ? { fuente: f.fuente, confirmado: f.confirmado }
    : { fondeo: f.fondeo || undefined, partida: f.partida ?? undefined, esAnticipo: f.es_anticipo, compromisoAnticipado: Boolean(f.compromiso_anticipado) })
});

/** Movimiento del formulario → fila de Supabase (solo los campos que aplican a su tipo). */
const aFila = (m) => ({
  tipo: m.tipo,
  concepto: m.concepto,
  fecha: m.fecha,
  monto: m.monto,
  estado: m.estado,
  fuente: m.tipo === 'fondo' ? m.fuente : null,
  confirmado: m.tipo === 'fondo' ? Boolean(m.confirmado) : false,
  partida: m.tipo === 'pago' && PARTIDAS.has(m.partida) ? m.partida : null,
  es_anticipo: m.tipo === 'pago' && m.partida === 'equipos' ? Boolean(m.esAnticipo) : false,
  compromiso_anticipado: m.tipo === 'pago' && m.partida === 'equipos' && Boolean(m.esAnticipo) && Boolean(m.compromisoAnticipado),
  fondeo: m.tipo === 'pago' ? (m.fondeo ?? '') : '',
  updated_at: new Date().toISOString()
});

const mensajeDeError = (error) => {
  console.error('Error en project_cash_movements:', [error.code, error.message].filter(Boolean).join(' '));
  if (error.code === '42501' || error.code === 'PGRST116') return 'No tienes permiso para modificar este proyecto.';
  if (error.code === '23514') return 'Algún dato no es válido (monto mayor que cero, fuente en los fondos).';
  return 'No se pudo guardar el movimiento. Intenta de nuevo.';
};

export async function cargarMovimientos(projectId) {
  const { data, error } = await supabase
    .from('project_cash_movements')
    .select(COLUMNAS)
    .eq('project_id', projectId)
    .order('fecha', { ascending: true });
  if (error) {
    console.error('Error al cargar project_cash_movements:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_CRONOGRAMA);
  }
  return data.map(aMovimiento);
}

export async function agregarMovimiento(projectId, movimiento) {
  const { data, error } = await supabase
    .from('project_cash_movements')
    .insert({ project_id: projectId, ...aFila(movimiento) })
    .select(COLUMNAS)
    .single();
  if (error) throw new Error(mensajeDeError(error));
  return aMovimiento(data);
}

/**
 * Copia el cronograma de ejemplo al proyecto como movimientos propios (un solo insert: entran todos o ninguno).
 * Desde ese momento el proyecto usa sus movimientos y deja de generarse el ejemplo.
 */
export async function copiarCronogramaEjemplo(projectId, pagos, fondos) {
  const filas = [
    ...pagos.map((p) => ({ project_id: projectId, ...aFila({ ...p, tipo: 'pago' }) })),
    ...fondos.map((f) => ({ project_id: projectId, ...aFila({ ...f, tipo: 'fondo' }) }))
  ];
  const { data, error } = await supabase.from('project_cash_movements').insert(filas).select(COLUMNAS);
  if (error) throw new Error(mensajeDeError(error));
  return data.map(aMovimiento);
}

/** Borra todos los movimientos del proyecto (solo se ofrece en proyectos de ejemplo, para volver al ilustrativo). */
export async function eliminarTodosLosMovimientos(projectId) {
  const { data, error } = await supabase.from('project_cash_movements').delete().eq('project_id', projectId).select('id');
  if (error) throw new Error(mensajeDeError(error));
  return data.length;
}

export async function actualizarMovimiento(id, movimiento) {
  const { data, error } = await supabase
    .from('project_cash_movements')
    .update(aFila(movimiento))
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) throw new Error(mensajeDeError(error));
  return aMovimiento(data);
}

export async function eliminarMovimiento(id) {
  const { data, error } = await supabase.from('project_cash_movements').delete().eq('id', id).select('id');
  if (error) throw new Error(mensajeDeError(error));
  if (!data?.length) throw new Error('No tienes permiso para eliminar este movimiento.');
}
