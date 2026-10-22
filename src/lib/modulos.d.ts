// Tipos de modulos.js (módulos del proyecto y datos de Resumen), para tsc y las pruebas.
import type { Frente, FechasClave } from './validaciones';
import type { RegistroCambio } from './historialCambios';

export type ClaveModulo = 'resumen' | 'permisos' | 'garantias' | 'cronograma' | 'finanzas' | 'documentos' | 'configuracion';
export const MODULOS: { clave: ClaveModulo; ruta: string; nombre: string; soloEdicion?: boolean }[];
export function modulosVisibles(puedeEditar: boolean): typeof MODULOS;
export function moduloDisponible(clave: string): ClaveModulo;
export function nombreModulo(clave: string): string;
export function moduloDeCambio(r: Pick<RegistroCambio, 'campo'>): ClaveModulo;
export function cambiosDelModulo<T extends Pick<RegistroCambio, 'campo'>>(registros: T[], modulo: ClaveModulo): T[];

export interface EntregableRtb { titulo: string; estado: string; responsable: string; fecha: string | null; frente: string; iFrente: number; iItem: number }
export function estadoPreparacionRtb(frentes: Frente[], fechaRtb: string | null): { bloqueados: EntregableRtb[]; despuesDelRtb: EntregableRtb[]; alcanzable: boolean; enRiesgo: boolean };

export interface Hito { clave: 'rtb' | 'ntp' | 'interconexion' | 'cod'; nombre: string; fecha: string | null; estimada: boolean; dias: number | null }
export function hitosProyecto(fechas: FechasClave | null, hoy?: string, conInterconexion?: boolean): Hito[];

export interface Kpi { clave: string; titulo: string; tipo: string; valor: number | null; contexto: string; [k: string]: any }
export function kpisResumen(e: { finanzas: any; rentabilidad: any; supuestos: any; motivoNd: string; escenarios?: any[] | null; quiebres?: any | null }): Kpi[];
