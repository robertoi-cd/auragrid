// Acceso a project_guarantees. RLS en Supabase garantiza que cada usuario solo lee y edita
// las garantías de sus propios proyectos; aquí solo se traducen filas y errores.
import { supabase } from '../supabase';

export const COLUMNAS_GARANTIAS = 'id, project_id, tipo, beneficiario, emisor, concepto, categoria, monto, vence, estado, vigencia_requerida, vigencia_fecha, ' +
  'renovaciones:project_guarantee_renewals(id, vence_anterior, vence_nueva, renovado_en)';

// Si la consulta falla no se muestran datos de respaldo: se avisa en la tabla, la barra RTB, el asesor y el chat
export const MENSAJE_SIN_GARANTIAS = 'Datos de garantías no disponibles';

/** Largos máximos (los valida también la base de datos). El nombre de una garantía es su concepto. */
export const MAX_GARANTIA = { concepto: 200, tipo: 60, beneficiario: 120 };

export const ESTADOS_GARANTIA = {
  vigente: 'Vigente',
  en_renovacion: 'En renovación',
  liberada: 'Liberada'
};

const COLUMNAS = COLUMNAS_GARANTIAS;

export const aGarantia = (fila) => ({
  id: fila.id,
  projectId: fila.project_id,
  tipo: fila.tipo,
  beneficiario: fila.beneficiario,
  emisor: fila.emisor,
  concepto: fila.concepto,
  categoria: fila.categoria ?? null,
  monto: Number(fila.monto),
  vence: fila.vence,
  estado: fila.estado,
  vigenciaRequerida: fila.vigencia_requerida ?? null,
  vigenciaFecha: fila.vigencia_fecha ?? null,
  renovaciones: [...(fila.renovaciones ?? [])].sort((a, b) => b.renovado_en.localeCompare(a.renovado_en))
});

// "Vigencia requerida hasta": la fecha solo se guarda con la opción "fecha específica"
const vigencia = (requerida, fecha) => ({ vigencia_requerida: requerida, vigencia_fecha: requerida === 'fecha' ? fecha : null });

// Mensaje claro para los errores esperables (sin permiso, fecha inválida, red)
const mensajeDeError = (error) => {
  if (!error) return 'Error desconocido.';
  if (error.code === '42501' || error.code === 'PGRST116') return 'No tienes permiso para modificar esta garantía.';
  if (error.code === '22023' || error.code === '23514') return error.message;
  return 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';
};

export async function cargarGarantias(projectId) {
  const { data, error } = await supabase
    .from('project_guarantees')
    .select(COLUMNAS)
    .eq('project_id', projectId)
    .order('vence', { ascending: true });
  if (error) {
    console.error('Error al cargar project_guarantees:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_GARANTIAS);
  }
  return data.map(aGarantia);
}

/** Los cambios de nombre (concepto), tipo, beneficiario y categoría quedan en el historial (trigger en la base). */
export async function actualizarGarantia(id, { concepto, tipo, beneficiario, categoria, monto, emisor, vence, estado, vigenciaRequerida, vigenciaFecha }) {
  const { data, error } = await supabase
    .from('project_guarantees')
    .update({ concepto, tipo, beneficiario, categoria, monto, emisor, vence, estado, ...vigencia(vigenciaRequerida, vigenciaFecha), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNAS)
    .single();
  if (error) throw new Error(mensajeDeError(error));
  return aGarantia(data);
}

/** Registra una garantía nueva. RLS (insert) solo lo permite en proyectos propios. */
export async function agregarGarantia(projectId, { tipo, beneficiario, emisor, concepto, categoria, monto, vence, estado, vigenciaRequerida, vigenciaFecha }) {
  const { data, error } = await supabase
    .from('project_guarantees')
    .insert({ project_id: projectId, tipo, beneficiario, emisor, concepto, categoria, monto, vence, estado, ...vigencia(vigenciaRequerida, vigenciaFecha) })
    .select(COLUMNAS)
    .single();
  if (error) {
    console.error('Error al agregar garantía:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(error.code === '42501' ? 'No tienes permiso para agregar garantías a este proyecto.' : mensajeDeError(error));
  }
  return aGarantia(data);
}

/**
 * Elimina una garantía con motivo (obligatorio). Queda en el historial con sus datos y el número de renovaciones
 * (su historial de renovaciones se borra con ella). Para una que ya terminó, mejor marcarla como liberada.
 */
export async function eliminarGarantia(id, motivo) {
  const { error } = await supabase.rpc('eliminar_garantia', { p_id: id, p_motivo: motivo });
  if (error) {
    console.error('Error en eliminar_garantia:', [error.code, error.message].filter(Boolean).join(' '));
    if (error.hint === 'motivo_obligatorio') throw new Error('Escribe el motivo para eliminar la garantía.');
    if (error.hint === 'sin_permiso') throw new Error('No se encontró la garantía o no tienes permiso para eliminarla.');
    // guarantee_evidence la referencia: primero se eliminan sus documentos, cada uno con su motivo
    if (error.code === '23503') throw new Error('Esta garantía tiene documentos adjuntos: elimínalos primero (📎, cada uno con su motivo) y después la garantía.');
    throw new Error(mensajeDeError(error));
  }
}

// Margen por proyecto (solar_projects.margen_garantias_dias). RLS: solo el dueño del proyecto puede cambiarlo.
export async function guardarMargenGarantias(projectId, dias) {
  const { data, error } = await supabase
    .from('solar_projects')
    .update({ margen_garantias_dias: dias })
    .eq('id', projectId)
    .select('margen_garantias_dias')
    .single();
  if (error) throw new Error(mensajeDeError(error));
  return data.margen_garantias_dias;
}

export async function registrarRenovacion(id, nuevaFecha) {
  const { error } = await supabase.rpc('registrar_renovacion_garantia', { p_garantia_id: id, p_nueva_fecha: nuevaFecha });
  if (error) throw new Error(mensajeDeError(error));
  // Se vuelve a leer para traer también la renovación recién guardada en el historial
  const { data, error: errorLectura } = await supabase.from('project_guarantees').select(COLUMNAS).eq('id', id).single();
  if (errorLectura) throw new Error('La renovación se guardó, pero no se pudo recargar la garantía.');
  return aGarantia(data);
}
