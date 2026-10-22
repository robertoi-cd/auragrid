// Tipos de documentos.js (índice del módulo Documentos), para tsc y las pruebas.
import type { Frente, Garantia } from './validaciones';

export interface Evidencia { id: string; nombre: string; subidoEn: string; subidoPor: string | null; tamano: number; ruta?: string; [k: string]: any }
export interface FilaDocumento {
  id: string; evidencia: Evidencia; nombre: string; origen: 'entregable' | 'garantia'; titulo: string; frente: string | null;
  deliverableId: string | null; garantiaId: string | null; subidoEn: string; subidoPor: string | null; tamano: number;
}
export function indiceDocumentos(e: { frentes: Frente[]; evidencias: Map<string, Evidencia[]> | null; garantias: Garantia[]; evidenciasGarantias: Map<string, Evidencia[]> | null }): FilaDocumento[];
export function filtrarDocumentos(filas: FilaDocumento[], filtro?: { frente?: string; garantia?: string }): FilaDocumento[];
export function completosSinDocumento(frentes: Frente[], documentos: Record<string, number>, evidenciaGarantias?: { activas: number; conDocumento: number }): { titulo: string; id: string | null }[];
export function autorVisible(correo: string | null, ocultarCorreos: boolean, correoPropio: string | null): string;
