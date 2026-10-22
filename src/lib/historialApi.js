// Historial del asistente por proyecto (assistant_messages). RLS: cada usuario solo ve y borra sus mensajes.
import { supabase } from '../supabase';

export const MENSAJE_SIN_HISTORIAL = 'No se pudo cargar el historial';
const LIMITE = 100;

/** Mensajes del usuario en este proyecto, del más antiguo al más reciente (los últimos 100). */
export async function cargarHistorial(projectId) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(LIMITE);
  if (error) {
    console.error('Error al cargar assistant_messages:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_HISTORIAL);
  }
  return data.reverse().map(({ id, role, content }) => ({ id, role, content }));
}

export async function guardarMensaje(projectId, role, content) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .insert({ project_id: projectId, role, content: content.slice(0, 20000) })
    .select('id')
    .single();
  if (error) {
    console.error('No se pudo guardar el mensaje:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error('No se pudo guardar en el historial.');
  }
  return data.id;
}

/** Borra todo el historial propio de este proyecto; devuelve cuántos mensajes se borraron. */
export async function borrarHistorial(projectId) {
  const { data, error } = await supabase.from('assistant_messages').delete().eq('project_id', projectId).select('id');
  if (error) throw new Error('No se pudo borrar el historial.');
  return data.length;
}
