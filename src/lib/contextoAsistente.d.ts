// Tipos de contextoAsistente.js, para tsc y las pruebas.
import type { Alerta } from './validaciones';

export function proyectoDeRuta<T extends { id: string }>(proyectos: T[], id: string | null | undefined): T | null;
export function contextoAsistente(e: {
  project: { id: string } | null;
  proyectoParaIA: { cifras: { etiqueta: string; valor: string }[]; [k: string]: any } | null;
  alertas: Alerta[];
  moduloActual: string;
}): { proyecto: any | null; alertas: Alerta[]; projectId: string | null };
