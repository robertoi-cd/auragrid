// Entregables por proyecto (project_deliverables) y fecha RTB (solar_projects.fecha_rtb).
// RLS en Supabase: cada usuario solo lee y modifica los de sus propios proyectos.
import { supabase } from '../supabase';
import { filasEntregables } from './datosProyecto';

export const MENSAJE_SIN_ENTREGABLES = 'Entregables no disponibles';
/** Largo máximo del nombre de un entregable (lo valida también la base de datos). */
export const MAX_NOMBRE_ENTREGABLE = 200;

/** Frentes del proyecto, en el formato del motor: [título, estado, responsable, fecha|null, { id, codigo }]. */
export const COLUMNAS_ENTREGABLES = 'id, frente, frente_orden, orden, titulo, estado, responsable, fecha, codigo';

/** Filas (ordenadas por frente y orden) → frentes con sus entregables, como los usa el modelo. */
export function agruparEntregables(filas) {
  const frentes = [];
  for (const fila of filas) {
    let frente = frentes[frentes.length - 1];
    if (!frente || frente.nombre !== fila.frente) {
      frente = { nombre: fila.frente, items: [] };
      frentes.push(frente);
    }
    frente.items.push([fila.titulo, fila.estado, fila.responsable, fila.fecha, { id: fila.id, codigo: fila.codigo }]);
  }
  return frentes;
}

export async function cargarEntregables(projectId) {
  const { data, error } = await supabase
    .from('project_deliverables')
    .select(COLUMNAS_ENTREGABLES)
    .eq('project_id', projectId)
    .order('frente_orden', { ascending: true })
    .order('orden', { ascending: true });
  if (error) {
    console.error('Error al cargar project_deliverables:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_ENTREGABLES);
  }
  return agruparEntregables(data);
}

// Los cambios pasan por la función actualizar_entregable(): el trigger de la base los registra en el
// historial (project_change_log) junto con el motivo.
function errorDeCambio(error, generico) {
  if (error.hint === 'motivo_obligatorio') return new Error('Escribe el motivo: un entregable completo solo puede cambiar de estado con motivo.');
  if (error.hint === 'nombre_vacio') return new Error('El nombre del entregable no puede quedar vacío.');
  if (error.hint === 'nombre_largo') return new Error(`El nombre del entregable admite hasta ${MAX_NOMBRE_ENTREGABLE} caracteres.`);
  if (error.hint === 'duplicado' || error.code === '23505') return new Error('Ya existe un entregable con ese nombre en el proyecto.');
  if (error.hint === 'sin_permiso' || error.code === '42501') return new Error('No tienes permiso para modificar este entregable.');
  console.error('Error en actualizar_entregable:', [error.code, error.message].filter(Boolean).join(' '));
  return new Error(generico);
}

/** Cambia el estado (con motivo; obligatorio al salir de "completo") y devuelve la fila guardada. */
export async function actualizarEstadoEntregable(id, estado, motivo = '') {
  const { data, error } = await supabase.rpc('actualizar_entregable', { p_id: id, p_estado: estado, p_motivo: motivo || null });
  if (error) throw errorDeCambio(error, 'No se pudo guardar el estado del entregable.');
  return data;
}

/** Agrega un entregable (pendiente) al final de su frente o en un frente nuevo; queda en el historial. */
export async function agregarEntregable(projectId, { frente, titulo, responsable = '', fecha = null, motivo = '' }) {
  const { data, error } = await supabase.rpc('agregar_entregable', {
    p_project_id: projectId, p_frente: frente, p_titulo: titulo, p_responsable: responsable, p_fecha: fecha || null, p_motivo: motivo || null,
  });
  if (error) {
    if (error.hint === 'duplicado' || error.code === '23505') throw new Error('Ya existe un entregable con ese nombre en el proyecto.');
    if (error.code === '42501') throw new Error('No tienes permiso para modificar este proyecto.');
    if (error.code === '22023') throw new Error('Indica el frente y el nombre del entregable.');
    throw errorDeCambio(error, 'No se pudo agregar el entregable.');
  }
  return data;
}

/** Elimina un entregable con motivo (obligatorio); queda en el historial. El de garantías no se puede eliminar. */
export async function eliminarEntregable(id, motivo) {
  const { error } = await supabase.rpc('eliminar_entregable', { p_id: id, p_motivo: motivo });
  if (error) {
    if (error.hint === 'entregable_automatico') throw new Error('El entregable de garantías se calcula automáticamente y no se puede eliminar.');
    if (error.hint === 'motivo_obligatorio') throw new Error('Escribe el motivo para eliminar el entregable.');
    throw errorDeCambio(error, 'No se pudo eliminar el entregable.');
  }
}

/** Guarda el nombre (si cambió), la fecha compromiso (o null) y el responsable de un entregable. */
export async function actualizarDetalleEntregable(id, { titulo, fecha, responsable }) {
  const { data, error } = await supabase.rpc('actualizar_entregable', {
    p_id: id, p_cambiar_fecha: true, p_fecha: fecha || null, p_responsable: responsable, p_titulo: titulo ?? null,
  });
  if (error) throw errorDeCambio(error, 'No se pudo guardar el entregable.');
  return data;
}

/** Crea los entregables de un proyecto nuevo: plantilla vacía o, si se pide, el ejemplo. */
export async function crearEntregablesIniciales(projectId, ejemplo = false) {
  const filas = filasEntregables(ejemplo).map((f) => ({ ...f, project_id: projectId }));
  const { error } = await supabase.from('project_deliverables').insert(filas);
  if (error) throw new Error('El proyecto se creó, pero no se pudieron crear sus entregables.');
}

export async function guardarFechaRtb(projectId, fecha) {
  const { data, error } = await supabase
    .from('solar_projects')
    .update({ fecha_rtb: fecha })
    .eq('id', projectId)
    .select('fecha_rtb')
    .single();
  if (error) throw new Error(error.code === 'PGRST116' ? 'No tienes permiso para modificar este proyecto.' : 'No se pudo guardar la fecha RTB.');
  return data.fecha_rtb;
}
