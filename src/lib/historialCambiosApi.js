// Lectura del historial de cambios de los entregables (project_change_log).
// RLS: cada usuario solo ve el de sus propios proyectos; nadie puede editarlo ni borrarlo desde la app.
import { supabase } from '../supabase';
import { aRegistroCambio } from './historialCambios';

export const MENSAJE_SIN_HISTORIAL = 'Historial de cambios no disponible';
const LIMITE = 500;

/** Cambios del proyecto, del más reciente al más antiguo. */
export async function cargarHistorialCambios(projectId) {
  const { data, error } = await supabase
    .from('project_change_log')
    .select('id, deliverable_id, entregable, campo, valor_anterior, valor_nuevo, motivo, tipo, user_email, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  if (error) {
    console.error('Error al cargar project_change_log:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_HISTORIAL);
  }
  return data.map(aRegistroCambio);
}
