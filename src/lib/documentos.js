// Índice de Documentos: todos los documentos del proyecto (de entregables y de garantías) en una lista, con su origen.
// Sale de los mismos datos que Permisos y Garantías (deliverable_evidence y guarantee_evidence); subir y borrar se
// hace allá. "Completos sin documento" usa resumenEvidencia(), la misma regla que la alerta y la barra de RTB.
import { resumenEvidencia } from './evidencia';
import { AUTOR_OCULTO } from './historialCambios';

/**
 * Filas del índice, de la más reciente a la más antigua.
 * evidencias: Map<deliverableId, Evidencia[]>; evidenciasGarantias: Map<guaranteeId, Evidencia[]> (null = no se leyeron).
 */
export function indiceDocumentos({ frentes, evidencias, garantias, evidenciasGarantias }) {
  const entregables = new Map(frentes.flatMap((f) => f.items.filter((i) => i[4]?.id).map((i) => [i[4].id, { titulo: i[0], frente: f.nombre }])));
  const porId = new Map(garantias.map((g) => [g.id, g]));
  const filas = [
    ...[...(evidencias ?? new Map())].flatMap(([id, lista]) => lista.map((e) => ({
      id: `e-${e.id}`, evidencia: e, nombre: e.nombre, origen: 'entregable',
      titulo: entregables.get(id)?.titulo ?? 'Entregable eliminado', frente: entregables.get(id)?.frente ?? null,
      deliverableId: id, garantiaId: null, subidoEn: e.subidoEn, subidoPor: e.subidoPor, tamano: e.tamano,
    }))),
    ...[...(evidenciasGarantias ?? new Map())].flatMap(([id, lista]) => lista.map((e) => {
      const g = porId.get(id);
      return {
        id: `g-${e.id}`, evidencia: e, nombre: e.nombre, origen: 'garantia',
        titulo: g ? `${g.tipo} ${g.beneficiario}` : 'Garantía eliminada', frente: null,
        deliverableId: null, garantiaId: id, subidoEn: e.subidoEn, subidoPor: e.subidoPor, tamano: e.tamano,
      };
    })),
  ];
  return filas.sort((a, b) => String(b.subidoEn).localeCompare(String(a.subidoEn)));
}

/** filtro: { frente } (nombre del frente) o { garantia } (id; 'todas' = cualquier garantía); sin filtro, todo. */
export function filtrarDocumentos(filas, filtro = {}) {
  if (filtro.frente) return filas.filter((f) => f.origen === 'entregable' && f.frente === filtro.frente);
  if (filtro.garantia === 'todas') return filas.filter((f) => f.origen === 'garantia');
  if (filtro.garantia) return filas.filter((f) => f.garantiaId === filtro.garantia);
  return filas;
}

/** Entregables completos sin documento (misma regla que la alerta y la barra de RTB). */
export const completosSinDocumento = (frentes, documentos, evidenciaGarantias) => resumenEvidencia(frentes, documentos, evidenciaGarantias).sinEvidencia;

/** Quién lo subió: el lector no ve correos de otras personas (igual que en el historial). */
export const autorVisible = (correo, ocultarCorreos, correoPropio) =>
  !correo ? 'Desconocido' : !ocultarCorreos || (correoPropio && correo.toLowerCase() === correoPropio.toLowerCase()) ? correo : AUTOR_OCULTO;
