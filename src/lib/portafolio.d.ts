// Tipos de portafolio.js (tarjetas de Inicio y alertas por módulo), para tsc y las pruebas.
import type { Alerta, Frente, Garantia } from './validaciones';
import type { Supuestos } from './rentabilidad';
import type { Credito } from './creditos';

export type Modulo = 'garantias' | 'documentos' | 'permisos' | 'cronograma' | 'finanzas' | 'resumen';
export function moduloDeAlerta(alerta: Alerta): Modulo;
export function criticasPorModulo(alertas: Alerta[]): { porModulo: Partial<Record<Modulo, number>>; total: number };
export function porcentajeRtb(frentes: Frente[]): number;

export interface DatosTarjeta {
  frentes: Frente[];
  garantias: Garantia[];
  movimientos: any[];
  supuestos: Supuestos | null;
  /** Créditos de la deuda (portafolioApi); sin el campo, los supuestos tal cual. */
  creditos?: Credito[];
  errores?: Record<string, string>;
}
export interface TarjetaProyecto {
  id: string; nombre: string; estado: string; rol?: string; esEjemplo: boolean;
  fechaRtb: string | null; diasRtb: number | null; preparacionRtb: number;
  criticas: number; criticasPorModulo: Partial<Record<Modulo, number>>;
  capex: number | null; tirEquity: number | null; dscrMinimo: number | null;
  faltantes: string[]; completo: boolean;
  /** Todos los créditos pendientes o sin banco definido: "Financiamiento indicativo: aún sin banco". */
  financiamientoIndicativo: boolean;
}
export function tarjetaProyecto(project: any, datos: DatosTarjeta, hoy?: string): TarjetaProyecto;
