// Eliminar definitivamente un proyecto archivado (solo el dueño): primero sus archivos del bucket aura-documentos y
// después la fila de solar_projects, que borra en cascada entregables, garantías, documentos, supuestos, créditos,
// movimientos de caja, equipo e historial. Los archivos van primero porque la política del bucket comprueba el permiso
// de edición sobre el proyecto: si el proyecto ya no existiera, no se podrían borrar.
import { BUCKET_DOCUMENTOS } from './archivos';

export const AVISO_ELIMINAR = 'Se borrarán todos sus entregables, garantías, documentos, supuestos, créditos e historial. No se puede deshacer.';
const POR_PAGINA = 1000;
const POR_LOTE = 100;

/**
 * Nombre para comparar: sin acentos (NFD sin marcas diacríticas; la ñ cuenta como n), en minúsculas, con los espacios
 * repetidos como uno solo (el navegador los muestra así) y sin espacios a los lados.
 */
const normalizarNombre = (x) => String(x ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es-MX').replace(/\s+/g, ' ').trim();

/**
 * El nombre escrito coincide con el del proyecto: sin distinguir mayúsculas ni acentos y con los espacios flexibles,
 * pero completo (una parte del nombre no basta).
 */
export const nombreCoincide = (escrito, nombre) => typeof escrito === 'string' && normalizarNombre(escrito) !== '' && normalizarNombre(escrito) === normalizarNombre(nombre);

/** Rutas de todos los archivos del proyecto en el bucket (recorre sus carpetas: <proyecto>/<entregable o garantía>/…). */
export async function archivosDelProyecto(supabase, projectId, prefijo = projectId) {
  const rutas = [];
  for (let offset = 0; ; offset += POR_PAGINA) {
    const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).list(prefijo, { limit: POR_PAGINA, offset });
    if (error) throw new Error('No se pudieron leer los documentos del proyecto. No se borró nada.');
    for (const e of data) {
      const ruta = `${prefijo}/${e.name}`;
      if (e.id === null) rutas.push(...(await archivosDelProyecto(supabase, projectId, ruta)));
      else rutas.push(ruta);
    }
    if (data.length < POR_PAGINA) break;
  }
  return rutas;
}

/**
 * Borra el proyecto archivado y sus archivos. Lanza un error con un mensaje para el usuario si algo falla; si fallan
 * los archivos, no se borra el proyecto. Devuelve cuántos archivos se borraron.
 */
export async function eliminarProyectoDefinitivo(supabase, projectId) {
  const { data: proyecto, error: errorLectura } = await supabase.from('solar_projects').select('id, is_archived').eq('id', projectId).maybeSingle();
  if (errorLectura || !proyecto) throw new Error('No se encontró el proyecto. No se borró nada.');
  if (!proyecto.is_archived) throw new Error('Solo se pueden eliminar proyectos archivados. Archívalo primero.');

  const rutas = await archivosDelProyecto(supabase, projectId);
  for (let i = 0; i < rutas.length; i += POR_LOTE) {
    const { error } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove(rutas.slice(i, i + POR_LOTE));
    if (error) throw new Error('No se pudieron borrar los documentos del proyecto. El proyecto no se eliminó; intenta de nuevo.');
  }
  // Comprobación: no debe quedar ningún archivo antes de borrar el proyecto
  if ((await archivosDelProyecto(supabase, projectId)).length > 0) {
    throw new Error('Quedaron documentos sin borrar. El proyecto no se eliminó; intenta de nuevo.');
  }

  // RLS: solo el dueño puede borrar; además, solo si sigue archivado
  const { data: borrados, error } = await supabase.from('solar_projects').delete().eq('id', projectId).eq('is_archived', true).select('id');
  if (error || !borrados?.length) throw new Error('No se pudo eliminar el proyecto (solo el dueño puede hacerlo). Sus documentos ya se borraron.');
  return { archivos: rutas.length };
}
