// Tipos de datosProyecto.js (catálogo de entregables y caso de ejemplo Alpha I), para tsc y las pruebas.
import type { EstadoEntregable, Frente, Garantia } from './validaciones';

/** Fila para insertar en project_deliverables. */
export interface FilaEntregable {
  frente: string;
  frente_orden: number;
  orden: number;
  titulo: string;
  /** Tipo interno fijo (project_deliverables.codigo). */
  codigo: string;
  estado: EstadoEntregable;
  responsable: string;
  fecha: string | null;
}

/** Código de cada entregable del catálogo por su título original. */
export const CODIGOS_CATALOGO: Record<string, string>;
export function filasEntregables(ejemplo?: boolean): FilaEntregable[];
export const PLANTILLA_FRENTES: Frente[];
export const FECHA_RTB_EJEMPLO: string;
export const FRENTES_EJEMPLO: Frente[];
export const FECHA_RTB_OBJETIVO: string;
export const FRENTES_INICIALES: Frente[];
export const GARANTIAS: Garantia[];
