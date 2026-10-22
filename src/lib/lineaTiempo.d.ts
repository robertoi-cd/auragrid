// Tipos de lineaTiempo.js (línea de tiempo del Cronograma), para tsc y las pruebas.
import type { Alerta, Frente, Garantia, FechasClave } from './validaciones';

export type ClaseEntregable = 'completo' | 'vencido' | 'despuesRtb' | 'pendiente';
export function claseEntregable(estado: string, fecha: string | null, fechaRtb: string | null, hoy?: string): ClaseEntregable;
export interface PuntoEntregable { titulo: string; estado: string; responsable: string; fecha: string | null; iFrente: number; iItem: number; clase: ClaseEntregable }
export function filasFrentes(frentes: Frente[], fechaRtb: string | null, hoy?: string): { frente: string; conFecha: PuntoEntregable[]; sinFecha: PuntoEntregable[] }[];
export interface FilaGarantia {
  indice: number; id?: string; nombre: string; vence: string; hito: string; fechaHito: string | null; limite: string | null;
  estimada: boolean; cubre: boolean; nivel: string; etiqueta: string; accionCorta: string | null;
}
export function filasGarantias(garantias: Garantia[], fechas: FechasClave, margen?: number, alertas?: Alerta[]): FilaGarantia[];
export function rangoLineaTiempo(fechas: (string | null | undefined)[]): { desde: number; hasta: number } | null;
export function posicion(iso: string, rango: { desde: number; hasta: number }): number;
export function marcasTrimestre(rango: { desde: number; hasta: number }): string[];
export function etiquetaTrimestre(iso: string): string;
export const ICONO_CLASE: Record<ClaseEntregable, string>;
export function iconoGarantia(fila: Pick<FilaGarantia, 'nivel'>): string;
