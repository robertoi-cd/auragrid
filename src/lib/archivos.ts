// Reglas de los documentos del proyecto (bucket privado "aura-documentos"). Funciones puras: se prueban sin Supabase.
// Ruta de cada archivo: <project_id>/<deliverable_id>/<marca de tiempo>-<nombre>. Los permisos los da el rol en el
// proyecto (lector lee; editor y dueño suben y borran); un archivo subido no se modifica.

export const BUCKET_DOCUMENTOS = 'aura-documentos';
export const TAMANO_MAXIMO = 50 * 1024 * 1024; // 50 MB
/** Caducidad de los enlaces de descarga (createSignedUrl). */
export const SEGUNDOS_ENLACE = 600;
export const MAX_NOMBRE_ARCHIVO = 200;

/**
 * Tipos permitidos por extensión: el primero es el que declara la app al subir. Deben ser los mismos que acepta el
 * bucket (allowed_mime_types) y la tabla deliverable_evidence (migración 20261017100000).
 * XER (Primavera P6) no tiene tipo estándar: la app declara application/x-primavera-xer.
 */
export const TIPOS_PERMITIDOS: Record<string, string[]> = {
  pdf: ['application/pdf'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  xml: ['application/xml', 'text/xml'],
  mpp: ['application/vnd.ms-project'],
  xer: ['application/x-primavera-xer'],
  jpg: ['image/jpeg'],
  jpeg: ['image/jpeg'],
  png: ['image/png'],
};
export const EXTENSIONES_PERMITIDAS = Object.keys(TIPOS_PERMITIDOS);
/** Lista única de tipos (la del bucket y la de la tabla), en el orden de arriba. */
export const TIPOS_MIME_PERMITIDOS = [...new Set(Object.values(TIPOS_PERMITIDOS).flat())];

/**
 * Tipos que el navegador informa cuando no reconoce el archivo (un XER siempre; un MPP o un XML a veces) o con un
 * nombre distinto: se sustituyen por el tipo de la extensión. Cualquier otro tipo que no coincida se rechaza.
 */
const TIPOS_GENERICOS = ['application/octet-stream', 'application/x-msproject', 'application/msproject', 'image/pjpeg'];

const extension = (nombre: string) => (nombre.includes('.') ? nombre.split('.').pop()!.toLowerCase() : '');

/**
 * Tipo MIME con que se sube el archivo. Algunos navegadores no informan el tipo de un XML o un DOCX: en ese caso
 * se toma el de su extensión. null si el tipo o la extensión no están permitidos.
 */
export function tipoDeArchivo(nombre: string, tipoNavegador = ''): string | null {
  const permitidos = TIPOS_PERMITIDOS[extension(nombre)];
  if (!permitidos) return null;
  if (!tipoNavegador || TIPOS_GENERICOS.includes(tipoNavegador)) return permitidos[0];
  return permitidos.includes(tipoNavegador) ? tipoNavegador : null;
}

/** Mensaje de por qué no se puede subir el archivo, o null si se puede. */
export function problemaArchivo(archivo: { name: string; size: number; type?: string }): string | null {
  if (!archivo.size) return 'El archivo está vacío.';
  if (archivo.size > TAMANO_MAXIMO) return `El archivo pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB; el máximo es 50 MB.`;
  if (!tipoDeArchivo(archivo.name, archivo.type ?? '')) return `Solo se aceptan archivos ${EXTENSIONES_PERMITIDAS.map((e) => e.toUpperCase()).join(', ')}.`;
  if (archivo.name.length > MAX_NOMBRE_ARCHIVO) return `El nombre del archivo admite hasta ${MAX_NOMBRE_ARCHIVO} caracteres.`;
  return null;
}

/** Nombre apto para la ruta: sin acentos, espacios ni caracteres especiales (el nombre original se guarda aparte). */
export function nombreSeguro(nombre: string): string {
  const ext = extension(nombre);
  const base = (ext ? nombre.slice(0, -(ext.length + 1)) : nombre)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_').replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 80) || 'archivo';
  return ext ? `${base}.${ext}` : base;
}

/** Ruta en el bucket: <project_id>/<deliverable_id>/<marca>-<nombre seguro>. La marca evita choques de nombre. */
export function rutaDocumento(projectId: string, deliverableId: string, nombre: string, marca: number = Date.now()): string {
  if (!projectId || !deliverableId || /[/\\]/.test(projectId) || /[/\\]/.test(deliverableId)) {
    throw new Error('Proyecto o entregable inválido para la ruta del documento.');
  }
  return `${projectId}/${deliverableId}/${marca}-${nombreSeguro(nombre)}`;
}

/** true si la ruta pertenece a ese proyecto y entregable (la base de datos lo exige también). */
export function esRutaDe(ruta: string, projectId: string, deliverableId: string): boolean {
  const partes = ruta.split('/');
  return partes.length === 3 && partes[0] === projectId && partes[1] === deliverableId && partes[2] !== '';
}

/** Ruta del documento de una garantía: <project_id>/garantias/<guarantee_id>/<marca>-<nombre seguro>. */
export function rutaDocumentoGarantia(projectId: string, guaranteeId: string, nombre: string, marca: number = Date.now()): string {
  if (!projectId || !guaranteeId || /[/\\]/.test(projectId) || /[/\\]/.test(guaranteeId)) {
    throw new Error('Proyecto o garantía inválidos para la ruta del documento.');
  }
  return `${projectId}/garantias/${guaranteeId}/${marca}-${nombreSeguro(nombre)}`;
}

/** "1.2 MB", "350 KB" */
export function formatearTamano(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
