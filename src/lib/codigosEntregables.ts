// Tipo interno fijo de cada entregable (project_deliverables.codigo). Las reglas identifican los entregables por
// su código, nunca por el nombre: el usuario puede renombrar cualquiera sin romperlas. Los entregables que agrega
// el usuario tienen código 'otro' y no activan reglas especiales.
import { CODIGOS_CATALOGO } from './datosProyecto.js';
import type { Entregable } from './validaciones';

export const CODIGO_OTRO = 'otro';
/** Entregable automático: su estado se calcula con las garantías. */
export const CODIGO_GARANTIAS = 'garantias_vigencia';
/** Su estado confirma (o no) el tramo 2 en el cronograma de ejemplo. */
export const CODIGO_TRAMO_2 = 'financiamiento_tramo_2';
/** Permisos sin los cuales no se puede pagar obra ni equipos. */
export const CODIGOS_PERMISOS_OBRA = ['ambiental_mia_resolutivo', 'ambiental_cambio_uso_suelo', 'permisos_licencia_construccion'];

/**
 * Código del entregable: el que trae de la base (meta.codigo). Si no lo trae (datos anteriores a la migración
 * 20261013100000 o creados en memoria sin código), el del catálogo según su título; si no está en el catálogo, 'otro'.
 */
export function codigoEntregable(item: Entregable): string {
  return item[4]?.codigo ?? CODIGOS_CATALOGO[item[0]] ?? CODIGO_OTRO;
}

/** Qué regla usa cada entregable con código especial (para avisar al eliminarlo). */
export const REGLA_POR_CODIGO: Record<string, string> = {
  ambiental_mia_resolutivo: 'la validación de obra antes de permisos',
  ambiental_cambio_uso_suelo: 'la validación de obra antes de permisos',
  permisos_licencia_construccion: 'la validación de obra antes de permisos',
  financiamiento_tramo_2: 'la confirmación del tramo 2 en el cronograma de ejemplo',
};
