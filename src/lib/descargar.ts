// Descarga de archivos generados en el navegador. Siempre un Blob con tipo explícito y un enlace con el atributo
// "download" y el nombre con su extensión: el archivo nunca pasa por el servidor (que respondería index.html a
// cualquier ruta) ni se abre en una pestaña nueva que, al guardarla, terminaría como .html.

/** Mínimo de document que se usa (permite probarlo sin navegador). */
export interface DocumentoDescarga {
  createElement(etiqueta: 'a'): { href: string; download: string; rel: string; style: { display: string }; click(): void; remove(): void };
  body: { appendChild(nodo: unknown): unknown };
}

const SEGUNDOS_ANTES_DE_LIBERAR = 60;

export function descargarBlob(blob: Blob, nombre: string, documento?: DocumentoDescarga): void {
  if (!/\.[a-z0-9]+$/i.test(nombre)) throw new Error(`El nombre del archivo debe tener extensión: ${nombre}`);
  if (!blob.type) throw new Error('El archivo debe tener un tipo (MIME) explícito.');
  const doc = documento ?? (document as unknown as DocumentoDescarga);
  const url = URL.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = nombre;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Se libera después: algunos navegadores leen el Blob de forma asíncrona tras el clic
  setTimeout(() => URL.revokeObjectURL(url), SEGUNDOS_ANTES_DE_LIBERAR * 1000);
}
