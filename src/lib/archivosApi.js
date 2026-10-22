// Documentos de evidencia por entregable: bucket privado "aura-documentos" + tabla deliverable_evidence.
// Permisos por rol en el proyecto (lector lee; editor y dueño suben y borran), en la base y en Storage.
// Las descargas son siempre enlaces firmados de 10 minutos: el bucket no es público y nunca se generan URL públicas.
import { supabase } from '../supabase';
import { BUCKET_DOCUMENTOS, SEGUNDOS_ENLACE, EXTENSIONES_PERMITIDAS, problemaArchivo, rutaDocumento, rutaDocumentoGarantia, tipoDeArchivo } from './archivos';

const COLUMNAS = 'id, project_id, deliverable_id, ruta, nombre, tamano, tipo_mime, nota, subido_por, subido_por_email, subido_en';

const aEvidencia = (f) => ({
  id: f.id, projectId: f.project_id, deliverableId: f.deliverable_id, ruta: f.ruta, nombre: f.nombre,
  tamano: Number(f.tamano), tipo: f.tipo_mime, nota: f.nota ?? '', subidoPor: f.subido_por_email ?? null, subidoEn: f.subido_en,
});

function mensaje(error, generico) {
  if (!error) return generico;
  if (error.hint === 'motivo_obligatorio') return 'Escribe el motivo para eliminar el documento.';
  if (error.code === '42501' || error.statusCode === '403' || /row-level security|unauthorized/i.test(error.message ?? '')) {
    return 'No tienes permiso para modificar los documentos de este proyecto.';
  }
  if (/mime type|not supported/i.test(error.message ?? '')) return `Ese tipo de archivo no está permitido (${EXTENSIONES_PERMITIDAS.map((e) => e.toUpperCase()).join(', ')}).`;
  if (/exceeded the maximum allowed size|too large/i.test(error.message ?? '')) return 'El archivo supera los 50 MB.';
  console.error('Error en documentos:', [error.code, error.statusCode, error.message].filter(Boolean).join(' '));
  return generico;
}

/** Evidencias del proyecto, agrupadas por entregable: Map<deliverableId, Evidencia[]> (las más recientes primero). */
export async function cargarEvidencias(projectId) {
  const { data, error } = await supabase
    .from('deliverable_evidence')
    .select(COLUMNAS)
    .eq('project_id', projectId)
    .order('subido_en', { ascending: false });
  if (error) throw new Error(mensaje(error, 'No se pudieron leer los documentos del proyecto.'));
  const porEntregable = new Map();
  for (const f of data) {
    const e = aEvidencia(f);
    porEntregable.set(e.deliverableId, [...(porEntregable.get(e.deliverableId) ?? []), e]);
  }
  return porEntregable;
}

/**
 * Sube el archivo a <project_id>/<deliverable_id>/… (sin sobrescribir) y lo registra; el historial anota quién lo subió.
 * Si el registro falla, se borra el archivo para no dejarlo huérfano.
 */
export async function subirEvidencia(projectId, deliverableId, archivo, nota = '') {
  const problema = problemaArchivo(archivo);
  if (problema) throw new Error(problema);
  const ruta = rutaDocumento(projectId, deliverableId, archivo.name);
  const tipo = tipoDeArchivo(archivo.name, archivo.type);
  const { error: errorSubida } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (errorSubida) throw new Error(mensaje(errorSubida, 'No se pudo subir el archivo.'));
  const { data, error } = await supabase
    .from('deliverable_evidence')
    .insert({ project_id: projectId, deliverable_id: deliverableId, ruta, nombre: archivo.name, tamano: archivo.size, tipo_mime: tipo, nota: nota.trim() || null })
    .select(COLUMNAS)
    .single();
  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([ruta]);
    throw new Error(mensaje(error, 'No se pudo registrar el documento.'));
  }
  return aEvidencia(data);
}

// ---------------------------------------------------------------------------
// Documentos de las garantías (tabla guarantee_evidence; ruta <project_id>/garantias/<guarantee_id>/…)
// ---------------------------------------------------------------------------

const COLUMNAS_GARANTIA = 'id, project_id, guarantee_id, ruta, nombre, tamano, tipo_mime, nota, subido_por, subido_por_email, subido_en';
const aEvidenciaGarantia = (f) => ({ ...aEvidencia({ ...f, deliverable_id: null }), guaranteeId: f.guarantee_id });

/** Documentos de las garantías del proyecto: Map<guaranteeId, Evidencia[]> (los más recientes primero). */
export async function cargarEvidenciasGarantias(projectId) {
  const { data, error } = await supabase
    .from('guarantee_evidence')
    .select(COLUMNAS_GARANTIA)
    .eq('project_id', projectId)
    .order('subido_en', { ascending: false });
  if (error) throw new Error(mensaje(error, 'No se pudieron leer los documentos de las garantías.'));
  const porGarantia = new Map();
  for (const f of data) {
    const e = aEvidenciaGarantia(f);
    porGarantia.set(e.guaranteeId, [...(porGarantia.get(e.guaranteeId) ?? []), e]);
  }
  return porGarantia;
}

/** Sube la póliza, carta de crédito o endoso de una garantía y la registra (mismas reglas que los entregables). */
export async function subirEvidenciaGarantia(projectId, guaranteeId, archivo, nota = '') {
  const problema = problemaArchivo(archivo);
  if (problema) throw new Error(problema);
  const ruta = rutaDocumentoGarantia(projectId, guaranteeId, archivo.name);
  const tipo = tipoDeArchivo(archivo.name, archivo.type);
  const { error: errorSubida } = await supabase.storage.from(BUCKET_DOCUMENTOS).upload(ruta, archivo, { contentType: tipo, upsert: false });
  if (errorSubida) throw new Error(mensaje(errorSubida, 'No se pudo subir el archivo.'));
  const { data, error } = await supabase
    .from('guarantee_evidence')
    .insert({ project_id: projectId, guarantee_id: guaranteeId, ruta, nombre: archivo.name, tamano: archivo.size, tipo_mime: tipo, nota: nota.trim() || null })
    .select(COLUMNAS_GARANTIA)
    .single();
  if (error) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([ruta]);
    throw new Error(mensaje(error, 'No se pudo registrar el documento.'));
  }
  return aEvidenciaGarantia(data);
}

/** Elimina el documento de una garantía con motivo (queda en el historial) y después el archivo. */
export async function eliminarEvidenciaGarantia(evidencia, motivo) {
  const { error } = await supabase.rpc('eliminar_evidencia_garantia', { p_id: evidencia.id, p_motivo: motivo });
  if (error) throw new Error(mensaje(error, 'No se pudo eliminar el documento.'));
  const { error: errorArchivo } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove([evidencia.ruta]);
  if (errorArchivo) console.error('El registro se eliminó, pero el archivo quedó en Storage:', evidencia.ruta, errorArchivo.message);
}

/** Enlace firmado de descarga, válido 10 minutos. */
export async function enlaceDescarga(evidencia) {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS)
    .createSignedUrl(evidencia.ruta, SEGUNDOS_ENLACE, { download: evidencia.nombre });
  if (error) throw new Error(mensaje(error, 'No se pudo generar el enlace de descarga.'));
  return data.signedUrl;
}

/**
 * Elimina un documento con motivo (obligatorio): primero el registro (la base valida el permiso y anota la baja en el
 * historial con el motivo) y después el archivo.
 */
export async function eliminarEvidencia(evidencia, motivo) {
  const { error } = await supabase.rpc('eliminar_evidencia', { p_id: evidencia.id, p_motivo: motivo });
  if (error) throw new Error(mensaje(error, 'No se pudo eliminar el documento.'));
  const { error: errorArchivo } = await supabase.storage.from(BUCKET_DOCUMENTOS).remove([evidencia.ruta]);
  if (errorArchivo) console.error('El registro se eliminó, pero el archivo quedó en Storage:', evidencia.ruta, errorArchivo.message);
}
