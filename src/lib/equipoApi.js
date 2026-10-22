// Equipo del proyecto (dueño, editor, lector), registro de accesos y cupo del asistente.
// Las reglas viven en la base (políticas por rol y funciones de Supabase); aquí solo se llaman y se traducen errores.
import { supabase } from '../supabase';

const MENSAJES = {
  solo_dueno: 'Solo el dueño del proyecto puede administrar el equipo.',
  sin_cuenta: 'No hay una cuenta de AuraGrid con ese correo. Créala en Supabase (Authentication → Users → Add user) o invítala cuando la app esté publicada.',
  es_dueno: 'Ya eres el dueño del proyecto.',
  rol_invalido: 'El rol debe ser editor o lector.',
  limite_invalido: 'El límite diario debe estar entre 0 y 1,000 consultas.',
  no_miembro: 'Esa persona ya no es miembro del proyecto.',
};

function error(e, generico) {
  if (MENSAJES[e?.hint]) return new Error(MENSAJES[e.hint]);
  console.error('Error de equipo:', [e?.code, e?.message].filter(Boolean).join(' '));
  return new Error(generico);
}

/** Rol del usuario actual en el proyecto: 'dueno' | 'editor' | 'lector' | null. */
export async function rolEnProyecto(projectId) {
  const { data, error: e } = await supabase.rpc('rol_en_proyecto', { p_project_id: projectId });
  if (e) throw error(e, 'No se pudo leer tu rol en el proyecto.');
  return data ?? null;
}

/** Roles del usuario en los proyectos compartidos con él: { [projectId]: 'editor' | 'lector' }. */
export async function rolesCompartidos(userId) {
  const { data, error: e } = await supabase.from('project_members').select('project_id, rol').eq('user_id', userId);
  if (e) throw error(e, 'No se pudieron leer los proyectos compartidos.');
  return Object.fromEntries(data.map((f) => [f.project_id, f.rol]));
}

export async function miembrosProyecto(projectId) {
  const { data, error: e } = await supabase.rpc('miembros_proyecto', { p_project_id: projectId });
  if (e) throw error(e, 'No se pudo leer el equipo del proyecto.');
  return data.map((m) => ({
    userId: m.user_id, correo: m.correo, rol: m.rol, desde: m.desde,
    limite: m.limite_asistente, limitePropio: m.limite_propio, usadasHoy: m.usadas_hoy,
  }));
}

/** Agrega (o cambia el rol de) un miembro. limite: consultas diarias del lector (null = el predeterminado). */
export async function agregarMiembro(projectId, correo, rol, limite = null) {
  const { error: e } = await supabase.rpc('agregar_miembro', { p_project_id: projectId, p_correo: correo, p_rol: rol, p_limite: limite });
  if (e) throw error(e, 'No se pudo agregar a la persona al equipo.');
}

export async function cambiarLimite(projectId, userId, limite) {
  const { error: e } = await supabase.rpc('cambiar_limite_asistente', { p_project_id: projectId, p_user_id: userId, p_limite: limite });
  if (e) throw error(e, 'No se pudo cambiar el límite.');
}

export async function quitarMiembro(projectId, userId) {
  const { error: e } = await supabase.rpc('quitar_miembro', { p_project_id: projectId, p_user_id: userId });
  if (e) throw error(e, 'No se pudo quitar a la persona del equipo.');
}

/** Anota que un editor o lector abrió el proyecto (como máximo una vez por hora; el dueño no se registra). */
export async function registrarAcceso(projectId) {
  const { error: e } = await supabase.rpc('registrar_acceso', { p_project_id: projectId });
  if (e) console.error('No se pudo registrar el acceso:', e.message);
}

/** Últimos accesos de los miembros (solo los ve el dueño). */
export async function accesosProyecto(projectId, limite = 50) {
  const { data, error: e } = await supabase.from('project_access_log')
    .select('user_email, rol, accedido_en').eq('project_id', projectId).order('accedido_en', { ascending: false }).limit(limite);
  if (e) throw error(e, 'No se pudo leer el registro de accesos.');
  return data.map((f) => ({ correo: f.user_email, rol: f.rol, momento: f.accedido_en }));
}

/**
 * Registra quién exporta (antes de generar el archivo). Si falla, se lanza el error y no se exporta: así no quedan
 * exportaciones sin rastro.
 */
export async function registrarExportacion(projectId, tipo) {
  const { error: e } = await supabase.rpc('registrar_exportacion', { p_project_id: projectId, p_tipo: tipo });
  if (e) {
    console.error('No se pudo registrar la exportación:', [e.code, e.message].filter(Boolean).join(' '));
    throw new Error('No se pudo registrar la exportación, así que no se generó el archivo. Intenta de nuevo en unos minutos.');
  }
}

/** Últimas exportaciones del proyecto (solo las ve el dueño). */
export async function exportacionesProyecto(projectId, limite = 50) {
  const { data, error: e } = await supabase.from('project_export_log')
    .select('user_email, rol, tipo, exportado_en').eq('project_id', projectId).order('exportado_en', { ascending: false }).limit(limite);
  if (e) throw error(e, 'No se pudo leer el registro de exportaciones.');
  return data.map((f) => ({ correo: f.user_email, rol: f.rol, tipo: f.tipo, momento: f.exportado_en }));
}

/** Cupo del asistente para el usuario actual en el proyecto (lo calcula la base). */
export async function cupoAsistente(projectId) {
  const { data, error: e } = await supabase.rpc('cupo_asistente', { p_project_id: projectId ?? null });
  if (e) throw error(e, 'No se pudo leer el cupo del asistente.');
  const c = data?.[0];
  return c ? { rol: c.rol, limite: c.limite, usadas: c.usadas, restantes: c.restantes, motivo: c.motivo, reinicia: c.reinicia ?? null } : null;
}
