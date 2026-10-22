// Evidencia documental de los entregables: cuántos completos tienen documento. Se permite marcar "Completo" sin
// documento, pero se avisa (alerta informativa, indicador en la barra de RTB y etiqueta "Sin evidencia").
// El entregable automático de garantías no lleva documentos propios: su evidencia son los documentos de las
// garantías activas (póliza, carta de crédito o endoso), en la tabla de garantías.
import type { Frente } from './validaciones';

export interface ResumenEvidencia {
  completos: number;
  conEvidencia: number;
  /** Entregables completos sin ningún documento (título e id). */
  sinEvidencia: { titulo: string; id: string | null }[];
}

/** Lo mínimo de una garantía para saber si tiene documento vigente. */
export interface GarantiaConDocumentos {
  id?: string;
  estado?: string;
  /** Renovaciones registradas (renovado_en). */
  renovaciones?: { renovado_en: string }[];
}

export interface EstadoDocumentoGarantia {
  /** Tiene al menos un documento subido después de su última renovación. */
  vigente: boolean;
  /** Tiene documentos, pero todos son anteriores a su última renovación (falta el endoso). */
  anteriorARenovacion: boolean;
  documentos: number;
}

export interface EvidenciaGarantias {
  /** Garantías activas (no liberadas). */
  activas: number;
  /** Activas con documento vigente. */
  conDocumento: number;
  porGarantia: Map<string, EstadoDocumentoGarantia>;
}

/**
 * Documento vigente de cada garantía: uno subido después de su última renovación registrada (si se renovó después
 * de subir la póliza, ese archivo ya no respalda la nueva fecha hasta que se suba el endoso).
 * documentos: fechas de subida (ISO) por id de garantía.
 */
export function evidenciaGarantias(garantias: GarantiaConDocumentos[], documentos: Map<string, { subidoEn: string }[]>): EvidenciaGarantias {
  const porGarantia = new Map<string, EstadoDocumentoGarantia>();
  let activas = 0;
  let conDocumento = 0;
  for (const g of garantias) {
    if (!g.id) continue;
    const docs = documentos.get(g.id) ?? [];
    const ultimaRenovacion = (g.renovaciones ?? []).map((r) => r.renovado_en).sort().pop() ?? null;
    const vigente = docs.some((d) => !ultimaRenovacion || Date.parse(d.subidoEn) > Date.parse(ultimaRenovacion));
    porGarantia.set(g.id, { vigente, anteriorARenovacion: docs.length > 0 && !vigente, documentos: docs.length });
    if (g.estado === 'liberada') continue;
    activas += 1;
    if (vigente) conDocumento += 1;
  }
  return { activas, conDocumento, porGarantia };
}

/** Todas las garantías activas tienen documento vigente (y hay al menos una). */
export const garantiasRespaldadas = (e: Pick<EvidenciaGarantias, 'activas' | 'conDocumento'>) => e.activas > 0 && e.conDocumento === e.activas;

/** "Evidencia: tabla de garantías (2 de 3 con documento)" */
export function textoEvidenciaGarantias(e: Pick<EvidenciaGarantias, 'activas' | 'conDocumento'>): string {
  return e.activas === 0
    ? 'Evidencia: tabla de garantías (sin garantías activas)'
    : `Evidencia: tabla de garantías (${e.conDocumento} de ${e.activas} con documento)`;
}

/**
 * documentos: número de documentos por id de entregable. garantias: evidencia de las garantías, para el entregable
 * automático (meta.auto); sin ella, ese entregable cuenta como sin evidencia.
 */
export function resumenEvidencia(
  frentes: Frente[], documentos: Record<string, number>, garantias?: Pick<EvidenciaGarantias, 'activas' | 'conDocumento'>,
): ResumenEvidencia {
  const completos = frentes.flatMap((f) => f.items).filter((i) => i[1] === 'completo');
  const tiene = (i: Frente['items'][number]) => (i[4]?.auto
    ? Boolean(garantias && garantiasRespaldadas(garantias))
    : Boolean(i[4]?.id && (documentos[i[4].id] ?? 0) > 0));
  return {
    completos: completos.length,
    conEvidencia: completos.filter(tiene).length,
    sinEvidencia: completos.filter((i) => !tiene(i)).map((i) => ({
      titulo: i[4]?.auto && garantias ? `${i[0]} (${garantias.conDocumento} de ${garantias.activas} garantías con documento)` : i[0],
      id: i[4]?.id ?? null,
    })),
  };
}

/** "3 de 11 completos con documento" */
export function textoEvidencia(r: Pick<ResumenEvidencia, 'completos' | 'conEvidencia'>): string {
  return `${r.conEvidencia} de ${r.completos} ${r.completos === 1 ? 'completo' : 'completos'} con documento`;
}
