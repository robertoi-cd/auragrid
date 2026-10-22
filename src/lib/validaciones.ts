// Motor de validaciones de AuraGrid.
// Es la única fuente de indicadores de riesgo de la app: el contador de críticas de la barra RTB,
// las alertas del asesor y el estado de cada garantía salen de validarProyecto().

import { formatearFecha, formatearMoneda, formatearPorcentaje, formatearNumero, formatearTir } from './formato';
import { calcularFlujoAcumulado, esPagoDeObra, type ModeloFinanciero, type Movimiento } from './modeloFinanciero';
import { type AlertaAsesor, type CifraAsesor, type ProyectoAsesor } from '../../supabase/functions/_shared/asesor.ts';
import { codigoEntregable, CODIGO_GARANTIAS, CODIGOS_PERMISOS_OBRA } from './codigosEntregables';
import { ITERACIONES_DEUDA } from './rentabilidad';
import { resumenEvidencia, textoEvidencia } from './evidencia';

// ---------------------------------------------------------------------------
// Modelo de datos (refleja las estructuras que usa App.jsx)
// ---------------------------------------------------------------------------

/** Informativa: seguimiento sin riesgo inmediato (p. ej. una prórroga que vence en más de 90 días). */
export type Severidad = 'critico' | 'advertencia' | 'info';
export type EstadoEntregable = 'pendiente' | 'curso' | 'completo' | 'bloqueado';

/** Datos extra de un entregable: su id en project_deliverables y, si lo calcula la app, el motivo. */
export interface MetaEntregable {
  id?: string;
  /** Tipo interno fijo (project_deliverables.codigo): las reglas lo usan en lugar del nombre. */
  codigo?: string;
  /** true si la app calcula el estado (no se puede cambiar a mano). */
  auto?: boolean;
  /** Por qué tiene ese estado, en una frase que la interfaz y las alertas muestran tal cual. */
  motivo?: string;
}

/** Entregable: [título, estado, responsable, fecha ISO o null si no se ha capturado, meta opcional]. */
export type Entregable = [titulo: string, estado: EstadoEntregable, responsable: string, fecha: string | null, meta?: MetaEntregable];

export interface Frente {
  nombre: string;
  items: Entregable[];
}

export type EstadoGarantiaOperativo = 'vigente' | 'en_renovacion' | 'liberada';

export interface Garantia {
  id?: string;
  /** Estado que captura el usuario. Una garantía liberada ya no genera alertas de vencimiento. */
  estado?: EstadoGarantiaOperativo;
  tipo: string;
  beneficiario: string;
  emisor: string;
  concepto: string;
  monto: number;
  vence: string;
  /** Hasta cuándo debe estar vigente (project_guarantees.vigencia_requerida). Sin valor: el de su tipo. */
  vigenciaRequerida?: VigenciaRequerida | null;
  /** Solo con vigenciaRequerida = 'fecha': la fecha específica. */
  vigenciaFecha?: string | null;
  /** Qué garantiza (project_guarantees.categoria). Sin valor se deduce del texto (garantías aún no guardadas). */
  categoria?: CategoriaGarantia | null;
}

/** "Vigencia requerida hasta": hito del proyecto (o fecha específica) que la garantía debe cubrir. */
export type VigenciaRequerida = 'rtb' | 'ntp' | 'interconexion' | 'cod' | 'fin_construccion' | 'fecha';

export const VIGENCIAS_REQUERIDAS: Record<VigenciaRequerida, string> = {
  rtb: 'RTB',
  ntp: 'NTP',
  interconexion: 'Conclusión de obras de interconexión',
  cod: 'COD',
  fin_construccion: 'Fin de construcción',
  fecha: 'Fecha específica',
};

/** Nota que acompaña a las garantías de interconexión: el plazo exigido debe confirmarse en la normativa y el contrato. */
export const NOTA_GARANTIA_INTERCONEXION =
  'Por confirmar con el Manual de Interconexión (cap. 15 Garantías Financieras) y el contrato de interconexión vigente';

/** Contra qué hito se valida una garantía según lo que garantiza. */
export type CategoriaGarantia = 'interconexion' | 'cumplimiento_epc' | 'otra';

export const CATEGORIAS_GARANTIA: Record<CategoriaGarantia, string> = {
  interconexion: 'Interconexión',
  cumplimiento_epc: 'Cumplimiento EPC',
  otra: 'Otra',
};

/**
 * Qué garantiza: la categoría guardada (project_guarantees.categoria), que no cambia al renombrar la garantía.
 * Sin categoría guardada (una garantía nueva antes de elegirla) se sugiere desde el texto con categoriaSugerida().
 */
export function categoriaGarantia(g: Pick<Garantia, 'beneficiario' | 'concepto' | 'tipo' | 'categoria'>): CategoriaGarantia {
  return g.categoria ?? categoriaSugerida(g);
}

/** Sugerencia desde el texto: interconexión si es para CENACE o menciona interconexión; cumplimiento EPC si menciona EPC o cumplimiento. */
export function categoriaSugerida(g: Pick<Garantia, 'beneficiario' | 'concepto' | 'tipo'>): CategoriaGarantia {
  const texto = `${g.beneficiario} ${g.concepto} ${g.tipo}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (/cenace|interconexion/.test(texto)) return 'interconexion';
  if (/\bepc\b|cumplimiento/.test(texto)) return 'cumplimiento_epc';
  return 'otra';
}

/** Valor por defecto de "Vigencia requerida hasta": interconexión → COD; cumplimiento EPC → fin de construcción; otras → RTB. */
export function vigenciaPorDefecto(g: Pick<Garantia, 'beneficiario' | 'concepto' | 'tipo' | 'categoria'>): VigenciaRequerida {
  const categoria = categoriaGarantia(g);
  return categoria === 'interconexion' ? 'cod' : categoria === 'cumplimiento_epc' ? 'fin_construccion' : 'rtb';
}

/** Hitos del proyecto contra los que se validan las garantías. */
export interface FechasClave {
  rtb: string | null;
  /** Notice to proceed / cierre financiero. */
  ntp?: string | null;
  /** Conclusión de obras de interconexión. */
  finInterconexion?: string | null;
  /** Operación comercial (COD). */
  cod: string | null;
  /** Fin de la construcción (sin fecha propia en AuraGrid: coincide con la COD). */
  finConstruccion: string | null;
  /** true si NTP, COD y fin de construcción se estimaron (desde el RTB) por no haber cronograma. */
  estimadas: boolean;
  /** true si la conclusión de interconexión no sale de un pago de interconexión del cronograma. */
  finInterconexionEstimada?: boolean;
}

export interface ReferenciaGarantia {
  categoria: CategoriaGarantia;
  vigencia: VigenciaRequerida;
  /** true si la vigencia es la de su tipo (no se capturó). */
  porDefecto: boolean;
  /** Nombre del hito con que se valida (si el elegido no tiene fecha, el RTB). */
  hito: string;
  /** Fecha del hito (null si no se puede determinar). */
  fecha: string | null;
  /** Hito + margen: la garantía debe vencer después de esta fecha. */
  limite: string | null;
  estimada: boolean;
}

// Nombre de cada hito en textos (se usa en la tabla, las alertas y el asistente)
const NOMBRE_HITO: Record<VigenciaRequerida, string> = {
  rtb: 'RTB', ntp: 'NTP', interconexion: 'conclusión de obras de interconexión', cod: 'COD',
  fin_construccion: 'fin de construcción', fecha: 'fecha específica',
};

/**
 * Fecha contra la que se valida la garantía: la de su "Vigencia requerida hasta" (o la de su tipo si no se capturó).
 * Si el hito elegido no tiene fecha conocida (p. ej. sin cronograma), se valida contra el RTB.
 */
export function referenciaGarantia(
  g: Pick<Garantia, 'beneficiario' | 'concepto' | 'tipo' | 'categoria' | 'vigenciaRequerida' | 'vigenciaFecha'>, fechas: FechasClave, margen: number,
): ReferenciaGarantia {
  const categoria = categoriaGarantia(g);
  const vigencia = g.vigenciaRequerida ?? vigenciaPorDefecto(g);
  const porHito: Record<VigenciaRequerida, { fecha: string | null | undefined; estimada: boolean }> = {
    rtb: { fecha: fechas.rtb, estimada: false },
    ntp: { fecha: fechas.ntp, estimada: fechas.estimadas },
    interconexion: { fecha: fechas.finInterconexion, estimada: Boolean(fechas.finInterconexionEstimada) || fechas.estimadas },
    cod: { fecha: fechas.cod, estimada: fechas.estimadas },
    fin_construccion: { fecha: fechas.finConstruccion, estimada: fechas.estimadas },
    fecha: { fecha: g.vigenciaFecha, estimada: false },
  };
  const elegido = porHito[vigencia];
  const usado = elegido.fecha ? { hito: NOMBRE_HITO[vigencia], fecha: elegido.fecha, estimada: elegido.estimada } : { hito: 'RTB', fecha: fechas.rtb, estimada: false };
  return {
    categoria, vigencia, porDefecto: !g.vigenciaRequerida, ...usado,
    limite: usado.fecha ? sumarDias(usado.fecha, margen) : null,
  };
}

/** "COD 15 abr 2028 + 90 días = 14 jul 2028" */
export function describirReferencia(r: ReferenciaGarantia, margen: number): string {
  if (!r.fecha || !r.limite) return 'Sin fecha de referencia (falta el RTB objetivo)';
  return `${r.hito} ${formatearFecha(r.fecha)}${r.estimada ? ' (estimada)' : ''} + ${margen} días = ${formatearFecha(r.limite)}`;
}

/** Proyecto activo (formato que arma fetchSolarProjects en App.jsx). */
export interface Proyecto {
  id?: string;
  name: string;
  state?: string;
  capacityMw?: number;
  /** RTB objetivo capturado por el usuario; null si aún no se define. */
  fechaRtb: string | null;
  /** Días que las garantías deben seguir vigentes después de su vigencia requerida (solar_projects.margen_garantias_dias). */
  margenGarantiasDias?: number;
}

export type Referencia =
  | { tipo: 'entregable'; frente: number; item: number }
  | { tipo: 'financiamiento'; clave: 'estructura' | 'anticipo' | 'caja' | 'dscr' | 'plazo' | 'supuestos' | 'cronograma' | 'iva' | 'tir' }
  | { tipo: 'proyecto'; clave: 'rtb' | 'sin_garantias' | 'evidencia' }
  /** Alerta agrupada de garantías: el estado de cada una va en Alerta.garantias. */
  | { tipo: 'garantias' };

/**
 * Estado de una garantía dentro de la alerta agrupada (índice del arreglo que recibió validarProyecto), con lo
 * necesario para mostrarla en un renglón: nombre, vencimiento, acción en pocas palabras y el detalle completo.
 */
export interface EstadoGarantiaEnAlerta {
  indice: number;
  nivel: Severidad;
  etiqueta: string;
  nombre: string;
  vence: string;
  /** Monto de la garantía (USD). */
  monto: number;
  /** Acción en pocas palabras (p. ej. "Prórroga hasta después del 14 jul 2028"). */
  accionCorta: string;
  /** Detalle completo y acción completa (los mismos textos de detalle y accion de la alerta). */
  linea: string;
  accion: string;
}

/** IVA de construcción para las reglas: qué falta, el pico y la línea (rentabilidad.iva). */
export interface ResumenIva {
  problemas: string[];
  pico?: number | null;
  mesPico?: string | null;
  financiamiento?: 'equity' | 'linea';
  lineaMonto?: number | null;
  /** Importación directa sin pago de equipos de "entrega": el IVA del equipo se fechó en sus pagos. */
  sinHitoEntrega?: boolean;
  /** Pico de la necesidad que cubre el equity, y su mes. */
  compromisoMaximoEquity?: number | null;
  mesCompromisoMaximo?: string | null;
  /** Equity de fuentes y usos y fondos de equity comprometidos (confirmados) del cronograma. */
  equityFuentesUsos?: number | null;
  equityComprometido?: number | null;
}

/** IVA de construcción: datos faltantes (TIR en N/D), línea menor al pico y equipo sin hito de entrega. */
function validarIva(iva: ResumenIva): Alerta[] {
  const ref: Referencia = { tipo: 'financiamiento', clave: 'iva' };
  const alertas: Alerta[] = [];
  if (iva.problemas.length) {
    alertas.push({
      id: 'financiamiento-iva-datos', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'IVA incompleto',
      titulo: 'Faltan datos del IVA de construcción: no se calculó la TIR',
      detalle: `${iva.problemas.join(' ')} No se calcula con un valor supuesto: la TIR de proyecto y la de equity se muestran como N/D; el DSCR no depende del IVA y se sigue mostrando.`,
      accion: 'Captura el dato que falta en los supuestos de IVA (con tu asesor fiscal) o desactiva el IVA de construcción.',
    });
  }
  if (iva.financiamiento === 'linea' && iva.pico != null && iva.lineaMonto != null && iva.pico > iva.lineaMonto + 1e-6) {
    const excedente = iva.pico - iva.lineaMonto;
    alertas.push({
      id: 'financiamiento-iva-linea', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'Línea IVA corta',
      titulo: `Línea de IVA menor al pico de IVA (${formatearMoneda(iva.pico)}${iva.mesPico ? ` en ${iva.mesPico}` : ''})`,
      detalle: `La línea de crédito IVA es de ${formatearMoneda(iva.lineaMonto)}; el excedente de hasta ${formatearMoneda(excedente)} lo cubre el equity.`,
      accion: `Negociar una línea de IVA de al menos ${formatearMoneda(iva.pico)} o prever el equity adicional en el cronograma de aportaciones.`,
    });
  }
  // Los fondos de equity comprometidos deben cubrir el equity de fuentes y usos más el compromiso máximo por IVA
  // (no solo el IVA pendiente en la COD)
  if (iva.compromisoMaximoEquity != null && iva.compromisoMaximoEquity > 0 && iva.equityFuentesUsos != null && iva.equityComprometido != null) {
    const requerido = iva.equityFuentesUsos + iva.compromisoMaximoEquity;
    if (iva.equityComprometido < requerido - 0.5) {
      alertas.push({
        id: 'financiamiento-iva-equity', sev: 'advertencia', categoria: 'Financiamiento', ref,
        etiqueta: 'Equity para IVA',
        titulo: `Equity comprometido insuficiente para el IVA: faltan ${formatearMoneda(requerido - iva.equityComprometido)}`,
        detalle: `El IVA compromete hasta ${formatearMoneda(iva.compromisoMaximoEquity)} de equity${iva.mesCompromisoMaximo ? ` (en ${iva.mesCompromisoMaximo})` : ''}, además de los ${formatearMoneda(iva.equityFuentesUsos)} de fuentes y usos; los fondos de equity comprometidos suman ${formatearMoneda(iva.equityComprometido)}.`,
        accion: 'Comprometer el equity adicional con los socios antes del pico, o contratar una línea de crédito IVA.',
      });
    }
  }
  if (iva.sinHitoEntrega) {
    alertas.push({
      id: 'financiamiento-iva-entrega', sev: 'info', categoria: 'Financiamiento', ref,
      etiqueta: 'IVA sin hito de entrega',
      titulo: 'IVA del equipo importado fechado en sus pagos',
      detalle: 'El cronograma no tiene un pago de equipos de "entrega": el IVA de importación se fechó en cada pago de equipos (más pronto que la importación real).',
      accion: 'Registra el hito de entrega del equipo en el cronograma de caja para fechar el IVA de importación.',
    });
  }
  return alertas;
}

/** Resumen de rentabilidad calculada (rentabilidad.ts) que necesita el motor para sus reglas. */
export interface ResumenRentabilidad {
  /** depreciacion_incompleta: la depreciación por categorías no tiene todos sus datos; no se calcula con valores supuestos. */
  /** creditos_incompletos: un crédito sin condiciones capturadas o participaciones que no suman 100 %; no se calcula. */
  estado: 'calculada' | 'sin_supuestos' | 'no_disponible' | 'depreciacion_incompleta' | 'creditos_incompletos';
  /** Solo con depreciacion_incompleta o creditos_incompletos: qué falta (problemasDepreciacion / problemasCreditos). */
  problemas?: string[];
  dscrMinP50?: number | null;
  anoDscrMinP50?: number | null;
  dscrMinP90?: number | null;
  anoDscrMinP90?: number | null;
  /** DSCR mínimo del contrato de crédito. */
  covenant?: number;
  /** DSCR con que se dimensionó la deuda sobre P50 y P90. */
  dscrDimensionamientoP50?: number;
  dscrDimensionamientoP90?: number;
  plazoDeudaAnos?: number;
  ppaPlazoAnos?: number;
  /** USD/año; en 0 se avisa que falta (subestima los costos e infla la TIR). */
  segurosAnual?: number;
  estructura?: string;
  /** TIR de equity calculada (estructura seleccionada, caso P50) y la objetivo capturada (fracciones; null = sin capturar). */
  tirEquity?: number | null;
  tirObjetivo?: number | null;
  /** PPA actual: precio (USD/MWh) y % de la energía contratada. */
  ppaPrecio?: number;
  ppaPorcentaje?: number;
  /** Precio de PPA mínimo para la TIR objetivo (solo donde se calcula: el tablero). precio null = no se alcanza hasta maximo. */
  precioMinimo?: { precio: number | null; maximo: number } | null;
  /** false si el dimensionamiento de la deuda no convergió (tolerancia 1 USD). */
  deudaConvergio?: boolean;
  /** Solo si la DSRA no cubre el faltante del año 1 con la COD 6 meses tarde (escenarios.ts). */
  cod6Incumple?: { cfadsAno1: number; servicioAno1: number; faltante: number; dsra: number; usoDsra: number };
  /** Solo con DSCR de lock-up capturado: años del caso base o de un escenario por debajo. */
  lockup?: { dscr: number; casos: { escenario: string; ano: number; dscr: number }[] };
}

/** Diferencia que se tolera al comparar un DSCR calculado con el de dimensionamiento (redondeo). */
const TOLERANCIA_DSCR = 0.005;

export interface Alerta {
  id: string;
  sev: Severidad;
  categoria: 'Garantías' | 'Frentes de trabajo' | 'Financiamiento' | 'Proyecto';
  /** Texto corto para insignias (p. ej. "Vence antes de RTB"). */
  etiqueta: string;
  titulo: string;
  detalle: string;
  accion: string;
  fecha?: string;
  /** USD que están en juego, si la regla los conoce (garantías de la alerta, hueco de caja, anticipo, pagos afectados). Solo dato: no cambia textos ni conteos. */
  monto?: number;
  /** Qué es el monto, para mostrarlo con su nombre ("Pagos en riesgo", "Hueco máximo"…). */
  montoEtiqueta?: string;
  /** Responsable del entregable (o de los permisos) de la alerta, si lo tiene capturado. */
  responsable?: string;
  ref: Referencia;
  /** Solo en la alerta agrupada de garantías: el estado de cada garantía que incluye. */
  garantias?: EstadoGarantiaEnAlerta[];
}

export interface EntradaValidacion {
  proyecto: Proyecto;
  frentes: Frente[];
  garantias: Garantia[];
  finanzas?: ModeloFinanciero;
  /** false si no se pudieron leer las garantías: el entregable automático queda pendiente, no completo. */
  garantiasDisponibles?: boolean;
  rentabilidad?: ResumenRentabilidad;
  /** Hitos del proyecto (NTP, interconexión, COD, fin de construcción) para la vigencia requerida de las garantías; sin ellos, contra el RTB. */
  fechasClave?: FechasClave;
  /** Fecha de corte ISO; por defecto, la fecha local de hoy. */
  hoy?: string;
  /** Documentos por id de entregable (deliverable_evidence). Si se indica, avisa de los completos sin documento. */
  documentos?: Record<string, number>;
  /** IVA de construcción (rentabilidad.iva y problemasIva). Solo si el IVA está activo. */
  iva?: ResumenIva;
  /** Créditos de la deuda con banco o estado sin capturar (avisosCreditos). No detienen el cálculo. */
  creditos?: { bancoSinCapturar: string[]; estadoSinCapturar: string[] };
  /** Garantías activas y cuántas tienen documento vigente: evidencia del entregable automático de garantías. */
  evidenciaGarantias?: { activas: number; conDocumento: number };
}

export const DIAS_AVISO_ENTREGABLE = 45;
export const DIAS_AVISO_GARANTIA = 60;
/** Garantía que necesita prórroga: más de 90 días para su vencimiento es informativa; de 30 a 90, advertencia; menos de 30 o vencida, crítica. */
export const DIAS_PRORROGA_ADVERTENCIA = 90;
export const DIAS_PRORROGA_CRITICA = 30;
/** Una garantía que cubre su fecha requerida + margen con menos de estos días de sobra es advertencia (un retraso del hito la deja sin cubrir). */
export const DIAS_HOLGURA_GARANTIA = 30;
/** Un hueco de caja a más de estos días es advertencia; a estos días o menos (o ya iniciado), crítico. */
export const DIAS_HUECO_CRITICO = 90;
/** Un fondo que llega menos de estos días antes del pago que cubre deja el pago sin margen ante un retraso. */
export const DIAS_HOLGURA_FONDEO = 5;

/** Severidad de una garantía que vence antes de lo requerido, según los días que faltan para su vencimiento. */
export function severidadPorPlazo(diasAlVencimiento: number): Severidad {
  if (diasAlVencimiento < DIAS_PRORROGA_CRITICA) return 'critico';
  if (diasAlVencimiento <= DIAS_PRORROGA_ADVERTENCIA) return 'advertencia';
  return 'info';
}
export const MARGEN_GARANTIAS_DEFAULT = 90;
/** Nombre de catálogo del entregable que se calcula solo a partir de las garantías (el usuario puede renombrarlo). */
export const ENTREGABLE_GARANTIAS = 'Garantías con la vigencia requerida';
/** Nombre anterior del entregable ("hasta RTB"). */
export const ENTREGABLE_GARANTIAS_ANTERIOR = 'Garantías vigentes hasta RTB';
/** El entregable automático se reconoce por su código, no por su nombre. */
export const esEntregableGarantias = (item: Entregable) => codigoEntregable(item) === CODIGO_GARANTIAS;
/** Anticipo máximo razonable sobre el contrato de equipos. */
export const ANTICIPO_MAXIMO = 0.3;

// ---------------------------------------------------------------------------
// Utilidades de fecha (por día calendario, sin efectos de zona horaria)
// ---------------------------------------------------------------------------

export function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function aDiaUTC(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Días calendario de `desde` a `hasta` (negativo si `hasta` ya pasó). */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((aDiaUTC(hasta) - aDiaUTC(desde)) / 86_400_000);
}

export function sumarDias(iso: string, dias: number): string {
  return new Date(aDiaUTC(iso) + dias * 86_400_000).toISOString().slice(0, 10);
}

const margenDe = (p: Proyecto) => p.margenGarantiasDias ?? MARGEN_GARANTIAS_DEFAULT;

// ---------------------------------------------------------------------------
// Entregable automático: "Garantías con la vigencia requerida" (antes "Garantías vigentes hasta RTB")
// ---------------------------------------------------------------------------

export interface CoberturaGarantias {
  estado: 'completo' | 'bloqueado' | 'pendiente';
  /** RTB + margen: para el RTB, las garantías deben vencer después de esta fecha (null sin RTB definido). */
  limite: string | null;
  sinCobertura: Garantia[];
  motivo: string;
}

/** Sin hitos del proyecto conocidos (NTP, interconexión, COD…), las garantías se validan contra el RTB. */
const soloRtb = (fechaRtb: string | null): FechasClave => ({ rtb: fechaRtb, cod: null, finConstruccion: null, estimadas: false });

/**
 * Requisito de RTB: completo si todas las garantías activas (no liberadas) siguen vigentes al RTB + margen (o a su
 * propia vigencia requerida + margen, si esa es anterior); bloqueado si alguna no. La continuidad hasta NTP,
 * interconexión, COD o fin de obra es seguimiento (alerta de garantías) y no bloquea el RTB.
 * Pendiente (nunca completo) si no hay RTB, no hay garantías activas o no se pudieron leer.
 */
export function calcularCoberturaGarantias(
  garantias: Garantia[], fechaRtb: string | null, margen: number, disponibles = true, fechasClave?: FechasClave,
): CoberturaGarantias {
  if (!fechaRtb) {
    return { estado: 'pendiente', limite: null, sinCobertura: [], motivo: 'Falta la fecha RTB objetivo; no se puede comprobar la cobertura.' };
  }
  const fechas = { ...(fechasClave ?? soloRtb(fechaRtb)), rtb: fechaRtb };
  const limite = sumarDias(fechaRtb, margen);
  const regla = `RTB + ${margen} días = ${formatearFecha(limite)}`;
  // Para el RTB basta con cubrir el RTB + margen (o su propia vigencia requerida + margen, si es anterior)
  const requisitoRtb = (g: Garantia) => {
    const r = referenciaGarantia(g, fechas, margen);
    return r.limite && r.limite < limite ? r.limite : limite;
  };
  if (!disponibles) {
    return { estado: 'pendiente', limite, sinCobertura: [], motivo: `Datos de garantías no disponibles; no se puede comprobar la cobertura (${regla}).` };
  }
  const activas = garantias.filter((g) => g.estado !== 'liberada');
  if (activas.length === 0) {
    return {
      estado: 'pendiente', limite, sinCobertura: [],
      motivo: garantias.length === 0
        ? `No hay garantías registradas; no puede completarse (${regla}).`
        : `Todas las garantías están liberadas; no hay ninguna activa que cubra el RTB (${regla}).`,
    };
  }
  const sinCobertura = activas.filter((g) => g.vence <= requisitoRtb(g));
  if (sinCobertura.length > 0) {
    const lista = sinCobertura.map((g) => `${g.tipo} ${g.beneficiario} (vence ${formatearFecha(g.vence)})`).join(', ');
    return { estado: 'bloqueado', limite, sinCobertura, motivo: `No siguen vigentes al RTB + margen (${regla}): ${lista}. Detalle y acciones en la alerta de garantías.` };
  }
  // Cubren el RTB; las que deben seguir hasta un hito posterior y vencen antes son seguimiento, no bloqueo
  const prorrogas = activas.filter((g) => {
    const r = referenciaGarantia(g, fechas, margen);
    return r.limite != null && g.vence <= r.limite;
  }).length;
  return {
    estado: 'completo', limite, sinCobertura: [],
    motivo: `Las ${activas.length} garantías activas siguen vigentes después del ${formatearFecha(limite)} (${regla}).`
      + (prorrogas > 0
        ? ` Seguimiento: ${prorrogas} ${prorrogas === 1 ? 'requiere' : 'requieren'} prórroga para cubrir su vigencia posterior al RTB (ver la alerta de garantías); no afecta el RTB.`
        : ''),
  };
}

/**
 * Sustituye el estado manual del entregable de garantías por el calculado. Conserva su id y el nombre que le haya
 * dado el usuario (se reconoce por su código). Es idempotente.
 */
export function aplicarEntregablesAutomaticos(frentes: Frente[], cobertura: CoberturaGarantias): Frente[] {
  return frentes.map((f) => ({
    ...f,
    items: f.items.map((item): Entregable =>
      esEntregableGarantias(item)
        ? [item[0], cobertura.estado, item[2], item[3], { ...item[4], codigo: CODIGO_GARANTIAS, auto: true, motivo: cobertura.motivo }]
        : item),
  }));
}

// ---------------------------------------------------------------------------
// Reglas
// ---------------------------------------------------------------------------

// Cómo se nombra cada hito en los textos de las alertas ("antes del RTB", "antes de la COD"…)
const HITO: Record<string, { del: string; la: string; etiqueta: string }> = {
  RTB: { del: 'del RTB', la: 'del RTB objetivo', etiqueta: 'Vence antes de RTB' },
  NTP: { del: 'del NTP', la: 'del NTP', etiqueta: 'Vence antes del NTP' },
  'conclusión de obras de interconexión': { del: 'de la conclusión de obras de interconexión', la: 'de la conclusión de obras de interconexión', etiqueta: 'Vence antes de interconexión' },
  COD: { del: 'de la COD', la: 'de la COD', etiqueta: 'Vence antes de COD' },
  'fin de construcción': { del: 'del fin de construcción', la: 'del fin de construcción', etiqueta: 'Vence antes del fin de obra' },
  'fecha específica': { del: 'de la fecha requerida', la: 'de la fecha requerida', etiqueta: 'Vence antes de lo requerido' },
};

function validarGarantias(garantias: Garantia[], fechas: FechasClave, margen: number, hoy: string): Alerta[] {
  const alertas: Alerta[] = [];

  // Sin garantías activas no hay nada que cubra las obligaciones del proyecto
  if (!garantias.some((g) => g.estado !== 'liberada')) {
    alertas.push({
      id: 'proyecto-sin-garantias', sev: 'critico', categoria: 'Garantías', ref: { tipo: 'proyecto', clave: 'sin_garantias' },
      etiqueta: 'Sin garantías',
      titulo: garantias.length === 0 ? 'No hay garantías registradas' : 'No hay garantías activas (todas liberadas)',
      detalle: `El proyecto no tiene garantías ${garantias.length === 0 ? 'registradas' : 'activas'}; el entregable automático de garantías no puede completarse.`,
      accion: 'Registrar con "Agregar garantía" las fianzas y cartas de crédito del proyecto (interconexión CENACE, cumplimiento EPC, pago de equipos).',
    });
  }

  // Una sola alerta para todas las garantías con algún problema, con el detalle de cada una
  interface Evaluada { indice: number; nivel: Severidad; etiqueta: string; tipo: 'vencida' | 'prorroga' | 'holgura' | 'por_vencer'; nombre: string; linea: string; accion: string; accionCorta: string; vence: string }
  const evaluadas: Evaluada[] = [];

  garantias.forEach((g, indice) => {
    if (g.estado === 'liberada') return;
    const dias = diasEntre(hoy, g.vence);
    const nombre = `${g.tipo} ${g.beneficiario}`;
    const base = `${g.concepto ? `${g.concepto} · ` : ''}${formatearMoneda(g.monto)} · emisor ${g.emisor}`;
    // Fecha contra la que se valida: su "Vigencia requerida hasta" (por defecto: interconexión → COD,
    // cumplimiento EPC → fin de construcción, demás → RTB)
    const r = referenciaGarantia(g, fechas, margen);
    const hito = HITO[r.hito] ?? HITO.RTB;
    const regla = `${r.hito} + ${margen} días`;
    const tipoTexto = r.hito === 'RTB' && r.vigencia === 'rtb' ? ''
      : ` (vigencia requerida hasta: ${r.hito}${r.estimada ? ', fecha estimada' : ''}${r.categoria === 'interconexion' ? `; ${NOTA_GARANTIA_INTERCONEXION.toLowerCase()}` : ''})`;

    // Para el RTB basta con RTB + margen (o su propia vigencia, si es anterior); si no lo cubre, bloquea el entregable
    const limiteRtb = fechas.rtb ? sumarDias(fechas.rtb, margen) : null;
    const requisitoRtb = r.limite && limiteRtb && r.limite < limiteRtb ? r.limite : limiteRtb;
    const bloqueaRtb = requisitoRtb != null && g.vence <= requisitoRtb
      ? ' No sigue vigente al RTB + margen: bloquea el entregable automático de garantías.' : '';

    if (dias < 0) {
      evaluadas.push({
        indice, nivel: 'critico', etiqueta: 'Vencida', tipo: 'vencida', vence: g.vence, nombre,
        accionCorta: `Emitir una nueva con ${g.emisor}`,
        linea: `${nombre} (${base}): vencida desde el ${formatearFecha(g.vence)}; ya no cubre la obligación.${bloqueaRtb}`,
        accion: `${nombre}: emitir de inmediato una nueva ${g.tipo.toLowerCase()} con ${g.emisor} y entregarla a ${g.beneficiario}.`,
      });
    } else if (r.fecha && r.limite && g.vence <= r.limite) {
      // Vence antes de su vigencia requerida + margen: necesita prórroga; la urgencia depende de cuánto falta para que venza
      const nivel = severidadPorPlazo(dias);
      const etiqueta = nivel === 'critico' ? `Vence en ${dias} d` : nivel === 'advertencia' ? `Prórroga pendiente (${dias} d)` : 'Requiere prórroga';
      const respecto = g.vence < r.fecha
        ? `${diasEntre(g.vence, r.fecha)} días antes ${hito.la} (${formatearFecha(r.fecha)})`
        : `solo ${diasEntre(r.fecha, g.vence)} de los ${margen} días de margen después ${hito.del}`;
      evaluadas.push({
        indice, nivel, etiqueta, tipo: 'prorroga', vence: g.vence, nombre,
        accionCorta: `Prórroga hasta después del ${formatearFecha(r.limite)}`,
        linea: `${nombre} (${base}): vence el ${formatearFecha(g.vence)}, en ${dias} días, ${respecto}; debe cubrir ${describirReferencia(r, margen)}${tipoTexto}.${bloqueaRtb}`,
        accion: `${nombre}: solicitar a ${g.emisor} la prórroga hasta después del ${formatearFecha(r.limite)} (${regla}) y obtener el endoso aceptado por ${g.beneficiario} antes del ${formatearFecha(g.vence)}.`,
      });
    } else if (r.fecha && r.limite && diasEntre(r.limite, g.vence) < DIAS_HOLGURA_GARANTIA) {
      // Cubre su fecha requerida + margen, pero por poco: si el hito se retrasa unos días, deja de cubrirlo
      const holgura = diasEntre(r.limite, g.vence);
      evaluadas.push({
        indice, nivel: 'advertencia', etiqueta: `Holgura de ${holgura} d`, tipo: 'holgura', vence: g.vence, nombre,
        accionCorta: `Prórroga a ${DIAS_HOLGURA_GARANTIA}+ días después del ${formatearFecha(r.limite)}`,
        linea: `${nombre} (${base}): vence el ${formatearFecha(g.vence)}; cubre ${describirReferencia(r, margen)} con solo ${holgura} ${holgura === 1 ? 'día' : 'días'} de holgura (mínimo recomendado: ${DIAS_HOLGURA_GARANTIA})${tipoTexto}.`,
        accion: `${nombre}: pedir a ${g.emisor} una prórroga para que venza al menos ${DIAS_HOLGURA_GARANTIA} días después del ${formatearFecha(r.limite)}; un retraso ${hito.del} de más de ${holgura} ${holgura === 1 ? 'día' : 'días'} la dejaría sin cubrir.`,
      });
    } else if (dias <= DIAS_AVISO_GARANTIA) {
      evaluadas.push({
        indice, nivel: 'advertencia', etiqueta: `Por vencer (${dias} d)`, tipo: 'por_vencer', vence: g.vence, nombre,
        accionCorta: 'Confirmar si se renueva',
        linea: `${nombre} (${base}): vence el ${formatearFecha(g.vence)}, en ${dias} días; ya cubre su vigencia requerida.`,
        accion: `${nombre}: confirmar con ${g.beneficiario} si debe renovarse e iniciar el trámite con ${g.emisor}; las afianzadoras suelen requerir varias semanas para emitir el endoso.`,
      });
    }
  });

  if (evaluadas.length > 0) {
    const ordenadas = [...evaluadas].sort((a, b) => PESO[a.nivel] - PESO[b.nivel] || a.vence.localeCompare(b.vence));
    const peor = ordenadas[0];
    const cuenta = (tipo: Evaluada['tipo']) => evaluadas.filter((e) => e.tipo === tipo).length;
    const [vencidas, prorrogas, holguras, porVencer] = [cuenta('vencida'), cuenta('prorroga'), cuenta('holgura'), cuenta('por_vencer')];
    const partes = [
      ...(vencidas ? [`${vencidas} ${vencidas === 1 ? 'vencida' : 'vencidas'}`] : []),
      ...(prorrogas ? [`${prorrogas} ${prorrogas === 1 ? 'requiere' : 'requieren'} prórroga`] : []),
      ...(holguras ? [`${holguras} con holgura menor a ${DIAS_HOLGURA_GARANTIA} días`] : []),
      ...(porVencer ? [`${porVencer} por vencer`] : []),
    ];
    alertas.push({
      id: 'garantias', sev: peor.nivel, categoria: 'Garantías', ref: { tipo: 'garantias' },
      fecha: [...evaluadas].sort((a, b) => a.vence.localeCompare(b.vence))[0].vence,
      monto: evaluadas.reduce((s, e) => s + garantias[e.indice].monto, 0), montoEtiqueta: 'Garantías de la alerta',
      etiqueta: peor.etiqueta,
      titulo: `Garantías: ${partes.join(', ')}`,
      detalle: ordenadas.map((e, i) => `${i + 1}) [${TEXTO_SEVERIDAD[e.nivel]}] ${e.linea}`).join(' '),
      accion: ordenadas.map((e) => e.accion).join(' '),
      // En el orden de la alerta (severidad y luego vencimiento), un renglón por garantía
      garantias: ordenadas.map(({ indice, nivel, etiqueta, nombre, vence, accionCorta, linea, accion }) => ({ indice, nivel, etiqueta, nombre, vence, monto: garantias[indice].monto, accionCorta, linea, accion })),
    });
  }

  return alertas;
}

/** Un entregable vencido es crítico si está en la ruta hacia RTB y lleva más de estos días vencido. */
export const DIAS_VENCIDO_CRITICO = 30;

const TEXTO_ESTADO: Record<EstadoEntregable, string> = { pendiente: 'pendiente', curso: 'en curso', completo: 'completo', bloqueado: 'bloqueado' };

interface Vencimiento { dias: number; critico: boolean }

/**
 * Vencido: fecha compromiso anterior a hoy y estado distinto de completo. Está en la ruta hacia RTB si su fecha
 * es anterior o igual al RTB objetivo (o si no hay RTB: todos los entregables son requisitos de RTB).
 */
function vencimiento(estado: EstadoEntregable, fecha: string | null, fechaRtb: string | null, hoy: string): Vencimiento | null {
  if (estado === 'completo' || !fecha || fecha >= hoy) return null;
  const dias = diasEntre(fecha, hoy);
  const enRuta = !fechaRtb || fecha <= fechaRtb;
  return { dias, critico: enRuta && dias > DIAS_VENCIDO_CRITICO };
}

function validarFrentes(frentes: Frente[], fechaRtb: string | null, hoy: string): Alerta[] {
  const alertas: Alerta[] = [];

  frentes.forEach((frente, iFrente) => {
    frente.items.forEach(([titulo, estado, responsable, fecha, meta], iItem) => {
      if (estado === 'completo') return;

      const ref: Referencia = { tipo: 'entregable', frente: iFrente, item: iItem };
      const id = `entregable-${iFrente}-${iItem}`;
      const fechaAlerta = fecha ?? undefined;
      // Sin fecha compromiso o sin RTB no se pueden evaluar plazos: solo cuentan los bloqueos
      const despuesDeRtb = Boolean(fecha && fechaRtb && fecha > fechaRtb);
      const dias = fecha ? diasEntre(hoy, fecha) : null;
      const contexto = `${frente.nombre} · ${responsable || 'sin responsable'} · ${fecha ? `compromiso ${formatearFecha(fecha)}` : 'sin fecha compromiso'}`;
      const antesDelRtb = fechaRtb ? `anterior al ${formatearFecha(fechaRtb)}` : 'anterior al RTB';
      const vencido = vencimiento(estado, fecha, fechaRtb, hoy);
      const notaVencido = vencido ? ` Además, su fecha compromiso venció hace ${vencido.dias} días.` : '';
      // Una sola alerta por entregable: vencido (advertencia, o crítica si va hacia RTB y lleva más de 30 días)
      const alertaVencido = (v: Vencimiento, detalleExtra: string, accion: string): Alerta => ({
        id, sev: v.critico ? 'critico' : 'advertencia', categoria: 'Frentes de trabajo', ref, fecha: fechaAlerta,
        etiqueta: `Vencido ${v.dias} d`,
        titulo: `Vencido hace ${v.dias} días: ${titulo}`,
        detalle: `${contexto}. Sigue ${TEXTO_ESTADO[estado]}.${detalleExtra}${v.critico ? ` Está en la ruta hacia el RTB y lleva más de ${DIAS_VENCIDO_CRITICO} días vencido.` : ''}`,
        accion,
      });

      // Entregable calculado (garantías): no genera alerta propia. El mismo problema ya lo cuentan la alerta
      // agrupada de garantías o "No hay garantías registradas"; su estado sigue visible en el frente.
      if (meta?.auto) return;

      if (estado === 'bloqueado') {
        alertas.push({
          id, sev: 'critico', categoria: 'Frentes de trabajo', ref, fecha: fechaAlerta,
          etiqueta: 'Bloqueado',
          titulo: `Bloqueado: ${titulo}`,
          detalle: `${contexto}. Un entregable bloqueado impide declarar RTB${despuesDeRtb ? '; además su fecha es posterior al RTB objetivo' : ''}.${notaVencido}`,
          accion: `Escalar con ${responsable || 'el responsable'}: documentar la causa del bloqueo, asignar quién lo destraba y fijar una fecha compromiso ${antesDelRtb}.`,
        });
      } else if (despuesDeRtb && fecha && fechaRtb) {
        alertas.push({
          id, sev: 'critico', categoria: 'Frentes de trabajo', ref, fecha: fechaAlerta,
          etiqueta: 'Después del RTB',
          titulo: `Fuera de plazo: ${titulo}`,
          detalle: `${contexto}. La fecha es ${diasEntre(fechaRtb, fecha)} días posterior al RTB objetivo (${formatearFecha(fechaRtb)}).${notaVencido}`,
          accion: `Acordar con ${responsable || 'el responsable'} un plan de aceleración para cerrar antes del RTB o presentar al comité una nueva fecha de RTB.`,
        });
      } else if (vencido) {
        alertas.push(alertaVencido(vencido, '',
          estado === 'pendiente'
            ? `Confirmar con ${responsable || 'el responsable'} la fecha de ingreso del trámite y pasarlo a "En curso"; si depende de otro entregable, registrarlo como bloqueado.`
            : `Confirmar con ${responsable || 'el responsable'} qué falta para cerrarlo y una nueva fecha compromiso ${antesDelRtb}; si ya está terminado, marcarlo como completo.`));
      } else if (estado === 'pendiente' && dias !== null && dias < DIAS_AVISO_ENTREGABLE) {
        alertas.push({
          id, sev: 'advertencia', categoria: 'Frentes de trabajo', ref, fecha: fechaAlerta,
          etiqueta: `${dias} d`,
          titulo: `Sin iniciar a ${dias} días: ${titulo}`,
          detalle: `${contexto}. Sigue en estado pendiente.`,
          accion: `Confirmar con ${responsable || 'el responsable'} la fecha de ingreso del trámite y pasarlo a "En curso"; si depende de otro entregable, registrarlo como bloqueado.`,
        });
      }
    });
  });

  // Responsable del entregable como dato aparte (ya va en el detalle)
  return alertas.map((a) => {
    const responsable = a.ref.tipo === 'entregable' ? frentes[a.ref.frente].items[a.ref.item][2] : '';
    return responsable ? { ...a, responsable } : a;
  });
}

function validarFinanciamiento(m: ModeloFinanciero, fechaRtb: string | null, hoy: string): Alerta[] {
  const alertas: Alerta[] = [];
  const suma = (lista: { monto: number }[]) => lista.reduce((s, x) => s + x.monto, 0);

  // Proyecto sin cronograma capturado: no hay pagos ni fuentes que cuadrar ni huecos que calcular
  // Usos = CAPEX + costos financieros (intereses en construcción, comisión y DSRA) cuando la deuda está dimensionada
  const nombreUsos = m.usos === m.capex ? 'CAPEX' : 'usos';
  if (m.pagos.length === 0 && m.fondos.length === 0) {
    if (m.equity + m.deuda !== m.usos) {
      alertas.push({
        id: 'financiamiento-estructura', sev: 'critico', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'estructura' },
        etiqueta: 'Descuadre', titulo: 'La estructura financiera no cuadra',
        detalle: `equity + deuda = ${formatearMoneda(m.equity + m.deuda)} frente a ${nombreUsos} ${formatearMoneda(m.usos)}.`,
        accion: `Corregir el modelo financiero: las fuentes deben igualar a los usos.`,
      });
    }
    alertas.push({
      id: 'financiamiento-cronograma', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'cronograma' },
      etiqueta: 'Sin cronograma',
      titulo: 'Sin cronograma de pagos ni fuentes de fondeo',
      detalle: 'El proyecto no tiene pagos a proveedores, aportaciones ni desembolsos de deuda capturados; no se pueden detectar huecos de caja.',
      accion: 'Capturar el calendario de pagos del contrato EPC y de equipos, las aportaciones de equity y los desembolsos de deuda.',
    });
    return alertas;
  }

  const deudaEnTramos = suma(m.fondos.filter((f) => f.fuente === 'deuda'));
  const equityEnAportes = suma(m.fondos.filter((f) => f.fuente === 'equity'));
  const totalPagos = suma(m.pagos);

  // [concepto, programado, objetivo]
  const comparaciones: [string, number, number][] = [
    ['tramos de deuda', deudaEnTramos, m.deuda],
    ['aportaciones de equity', equityEnAportes, m.equity],
    ['pagos programados', totalPagos, m.usos],
  ];
  const texto = ([c, prog, obj]: [string, number, number]) => `${c} = ${formatearMoneda(prog)} frente a ${formatearMoneda(obj)}`;
  const capturado = m.origenCronograma === 'capturado';

  // Cronograma capturado a medias: faltar por programar es advertencia; programar de más es crítico
  const excedidos = comparaciones.filter(([, prog, obj]) => (capturado ? prog > obj : prog !== obj));
  const faltantes = capturado ? comparaciones.filter(([, prog, obj]) => prog < obj) : [];
  const descuadres = [
    ...(m.equity + m.deuda !== m.usos ? [`equity + deuda = ${formatearMoneda(m.equity + m.deuda)} frente a ${nombreUsos} ${formatearMoneda(m.usos)}`] : []),
    ...excedidos.map(texto),
  ];

  if (faltantes.length > 0) {
    alertas.push({
      id: 'financiamiento-cronograma', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'cronograma' },
      etiqueta: 'Cronograma incompleto',
      titulo: 'Cronograma de caja incompleto',
      detalle: `Falta por programar: ${faltantes.map(([c, prog, obj]) => `${c} ${formatearMoneda(obj - prog)} (llevas ${formatearMoneda(prog)} de ${formatearMoneda(obj)})`).join('; ')}. Los huecos de caja solo consideran lo capturado.`,
      accion: `Completar el cronograma hasta que pagos = ${nombreUsos}, aportaciones = equity y tramos = deuda.`,
    });
  }

  if (descuadres.length > 0) {
    alertas.push({
      id: 'financiamiento-estructura', sev: 'critico', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'estructura' },
      etiqueta: 'Descuadre',
      titulo: capturado ? 'Cronograma de caja con montos de más' : 'La estructura financiera no cuadra',
      detalle: `${descuadres.join('; ')}.`,
      accion: capturado
        ? `Revisar los movimientos capturados: no pueden superar ${nombreUsos === 'CAPEX' ? 'el CAPEX' : 'los usos'}, el equity ni la deuda del proyecto.`
        : `Corregir el modelo financiero antes de presentarlo al banco: las fuentes deben igualar ${nombreUsos === 'CAPEX' ? 'al CAPEX' : 'a los usos'} y los pagos.`,
    });
  }

  if (m.anticipoPct > ANTICIPO_MAXIMO) {
    alertas.push({
      id: 'financiamiento-anticipo', sev: 'critico', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'anticipo' },
      monto: m.anticipoEquipos, montoEtiqueta: 'Anticipo',
      etiqueta: 'Anticipo excesivo',
      titulo: `Anticipo de equipos del ${Math.round(m.anticipoPct * 100)} % del contrato`,
      detalle: `Anticipo de ${formatearMoneda(m.anticipoEquipos)} sobre un contrato de ${formatearMoneda(m.contratoEquipos)}; supera el ${ANTICIPO_MAXIMO * 100} % máximo.`,
      accion: 'Renegociar con el proveedor un anticipo menor y el resto contra hitos (embarque, entrega, puesta en marcha), respaldado por carta de crédito.',
    });
  }

  const flujo = calcularFlujoAcumulado(m);
  const inicio = flujo.find((p) => p.hueco > 0);
  if (inicio) {
    const peor = flujo.reduce((a, b) => (b.hueco > a.hueco ? b : a));
    const pendientes = m.fondos.filter((f) => !f.confirmado).sort((a, b) => a.fecha.localeCompare(b.fecha));
    // Urgencia según cuánto falta para que empiece el hueco: crítico a 90 días o menos (o si ya empezó)
    const faltan = diasEntre(hoy, inicio.fecha);
    const critico = faltan <= DIAS_HUECO_CRITICO;
    const cuando = faltan < 0 ? `empezó hace ${-faltan} días` : `empieza en ${faltan} días`;
    alertas.push({
      id: 'financiamiento-caja', sev: critico ? 'critico' : 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'caja' }, fecha: inicio.fecha, monto: peor.hueco, montoEtiqueta: 'Hueco máximo',
      etiqueta: 'Hueco de caja',
      titulo: `Hueco de caja desde el ${formatearFecha(inicio.fecha)}`,
      detalle: `Los pagos acumulados${m.iva ? ' (incluido el IVA de construcción)' : ''} superan a los fondos confirmados${m.iva?.entradas.length ? ' y las devoluciones de IVA' : ''} por ${formatearMoneda(inicio.hueco)} en esa fecha${fechaRtb && inicio.fecha <= fechaRtb ? ' (antes del RTB)' : ''}; el hueco máximo es de ${formatearMoneda(peor.hueco)} el ${formatearFecha(peor.fecha)}. El hueco ${cuando}${critico ? '' : ` (pasa a crítico a ${DIAS_HUECO_CRITICO} días o menos)`}.`,
      accion: pendientes.length > 0
        ? `Confirmar a más tardar en su fecha de desembolso programada: ${pendientes.map((f) => `${f.concepto} (${formatearMoneda(f.monto)}, ${f.estado.toLowerCase()}, desembolso ${formatearFecha(f.fecha)})`).join(', ')}. Sin ${pendientes.length === 1 ? 'ese fondo' : 'esos fondos'}, el hueco empieza el ${formatearFecha(inicio.fecha)}; si no ${pendientes.length === 1 ? 'llega' : 'llegan'} a tiempo, diferir pagos con el proveedor o gestionar un crédito puente.`
        : `Conseguir fondos adicionales por ${formatearMoneda(peor.hueco)} o diferir pagos con el proveedor.`,
    });
  }

  // Fondeo justo a tiempo: pagos a proveedores cubiertos solo por fondos que llegan el mismo día o pocos días antes
  // (los pagos financieros —comisión, intereses, DSRA— se liquidan con los propios desembolsos y no cuentan)
  const confirmados = m.fondos.filter((f) => f.confirmado);
  const acumulado = (lista: Movimiento[], hasta: string) => suma(lista.filter((x) => x.fecha <= hasta));
  const justos = m.pagos.filter((p) => p.partida !== 'financiero').flatMap((p) => {
    const necesario = acumulado(m.pagos, p.fecha);
    const antes = sumarDias(p.fecha, -DIAS_HOLGURA_FONDEO);
    if (acumulado(confirmados, p.fecha) < necesario || acumulado(confirmados, antes) >= necesario) return [];
    const llegan = confirmados.filter((f) => f.fecha > antes && f.fecha <= p.fecha);
    return [{ p, llegan }];
  });
  if (justos.length > 0) {
    const cuando = (f: Movimiento, p: Movimiento) => (f.fecha === p.fecha ? 'el mismo día' : `${diasEntre(f.fecha, p.fecha)} días antes`);
    alertas.push({
      id: 'financiamiento-fondeo-justo', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'caja' },
      fecha: justos[0].p.fecha,
      // Suma de los pagos que dependen de fondos que llegan el mismo día o pocos días antes
      monto: suma(justos.map(({ p }) => p)), montoEtiqueta: 'Pagos en riesgo',
      etiqueta: 'Fondeo justo',
      titulo: `Fondos que llegan justo a tiempo para ${justos.length} ${justos.length === 1 ? 'pago' : 'pagos'}`,
      detalle: `${justos.map(({ p, llegan }) => `${p.concepto} (${formatearFecha(p.fecha)}, ${formatearMoneda(p.monto)}) depende de ${llegan.map((f) => `${f.concepto}, que llega ${cuando(f, p)}`).join(' y ')}`).join('; ')}. Un retraso de un día en esos fondos deja el pago sin cubrir.`,
      accion: `Programar esos fondos al menos ${DIAS_HOLGURA_FONDEO} días antes de cada pago, o pactar con el proveedor un plazo de pago posterior a la llegada de los fondos.`,
    });
  }

  return alertas;
}

/** Permisos sin los cuales no se puede pagar obra ni equipos (códigos; el nombre puede cambiar). */
export const PERMISOS_PARA_OBRA = CODIGOS_PERMISOS_OBRA;

/**
 * Obra antes de permisos (crítica) y antes del RTB (advertencia). Un pago de obra o equipos programado antes de
 * la fecha de un permiso requerido que no está completo es crítico; si el permiso no tiene fecha, también (no se
 * sabe cuándo se obtendrá). Antes del RTB objetivo es advertencia, salvo anticipos de equipos marcados como
 * "compromiso anticipado".
 */
function validarObraAntesDePermisos(m: ModeloFinanciero, frentes: Frente[], fechaRtb: string | null): Alerta[] {
  const alertas: Alerta[] = [];
  const deObra = m.pagos.filter(esPagoDeObra);
  if (deObra.length === 0) return alertas;
  const lista = (pagos: Movimiento[]) =>
    pagos.map((p) => `${p.concepto} (${formatearFecha(p.fecha)}, ${formatearMoneda(p.monto)})`).join('; ');

  const permisos = frentes.flatMap((f) => f.items).filter((i) => PERMISOS_PARA_OBRA.includes(codigoEntregable(i)) && i[1] !== 'completo');
  const problemas = permisos.flatMap(([titulo, , responsable, fecha]) => {
    const antes = fecha ? deObra.filter((p) => p.fecha < fecha) : deObra;
    return antes.length ? [{ titulo, responsable, fecha, antes }] : [];
  });
  if (problemas.length > 0) {
    const primero = [...problemas.flatMap((x) => x.antes)].sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    const pagosAfectados = [...new Set(problemas.flatMap((x) => x.antes))].sort((a, b) => a.fecha.localeCompare(b.fecha));
    alertas.push({
      id: 'financiamiento-obra-permisos', sev: 'critico', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'cronograma' },
      fecha: primero.fecha,
      monto: pagosAfectados.reduce((s, p) => s + p.monto, 0), montoEtiqueta: 'Pagos antes del permiso',
      ...(() => { const r = [...new Set(problemas.map((x) => x.responsable).filter(Boolean))].join(', '); return r ? { responsable: r } : {}; })(),
      etiqueta: 'Obra antes de permiso',
      titulo: 'Obra programada antes de permiso',
      detalle: `${problemas.map((x) => `${x.titulo} (${x.fecha ? `fecha compromiso ${formatearFecha(x.fecha)}` : 'sin fecha compromiso'})`).join(', ')} aún no ${problemas.length === 1 ? 'está completo' : 'están completos'} y hay pagos de obra o equipos antes: ${lista(pagosAfectados)}.`,
      accion: 'Mover los pagos de obra y equipos después de la fecha de los permisos (o acelerar los permisos con su responsable); no comprometer obra sin MIA, cambio de uso de suelo y licencia de construcción.',
    });
  }

  if (fechaRtb) {
    const antesRtb = deObra.filter((p) => p.fecha < fechaRtb && !(p.esAnticipo && p.compromisoAnticipado));
    if (antesRtb.length > 0) {
      alertas.push({
        id: 'financiamiento-obra-rtb', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'cronograma' },
        fecha: antesRtb[0].fecha,
        monto: antesRtb.reduce((s, p) => s + p.monto, 0), montoEtiqueta: 'Pagos antes del RTB',
        etiqueta: 'Obra antes del RTB',
        titulo: 'Pagos de construcción antes del RTB',
        detalle: `Programados antes del RTB objetivo (${formatearFecha(fechaRtb)}): ${lista(antesRtb)}. Antes del RTB el proyecto aún no tiene cierre financiero ni NTP.`,
        accion: 'Programar los pagos de obra después del cierre financiero / NTP. Si un anticipo de equipos se aprobó a propósito (p. ej. reserva de módulos), márcalo como "compromiso anticipado".',
      });
    }
  }
  return alertas;
}

function validarRentabilidad(r: ResumenRentabilidad): Alerta[] {
  const ref: Referencia = { tipo: 'financiamiento', clave: r.estado === 'calculada' ? 'dscr' : 'supuestos' };
  if (r.estado === 'depreciacion_incompleta') {
    return [{
      id: 'financiamiento-depreciacion', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'Depreciación incompleta',
      titulo: 'Depreciación por categorías incompleta: no se calcularon la TIR, el DSCR ni el LCOE',
      detalle: `${(r.problemas ?? []).join(' ')} No se calcula con un valor supuesto: TIR, DSCR, LCOE, deuda dimensionada e ISR se muestran como N/D.`,
      accion: 'En "Editar supuestos", captura la tasa de depreciación que falta (con tu asesor fiscal) o pon en 0 % el reparto de esa categoría.',
    }];
  }
  if (r.estado === 'creditos_incompletos') {
    return [{
      id: 'financiamiento-creditos', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'Créditos incompletos',
      titulo: 'Créditos de la deuda incompletos: no se calcularon la TIR, el DSCR ni el LCOE',
      detalle: `${(r.problemas ?? []).join(' ')} No se calcula con un valor supuesto: TIR, DSCR, LCOE, deuda dimensionada e ISR se muestran como N/D.`,
      accion: 'En Finanzas, completa los créditos (participación, tasa anual y comisión de estructuración) y ajusta las participaciones para que sumen 100 %.',
    }];
  }
  if (r.estado !== 'calculada') {
    return [{
      id: 'financiamiento-supuestos', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'Sin supuestos',
      titulo: r.estado === 'sin_supuestos' ? 'Faltan los supuestos de ingresos y producción' : 'Supuestos financieros no disponibles',
      detalle: 'Sin precio de venta, producción ni condiciones de deuda no se pueden calcular la TIR, el DSCR ni el LCOE; se muestran como N/D.',
      accion: r.estado === 'sin_supuestos'
        ? 'Capturar los supuestos del proyecto (precio PPA y de mercado, P50, degradación, deuda e ISR).'
        : 'Recargar la página; si persiste, revisar la conexión con Supabase.',
    }];
  }
  const alertas: Alerta[] = [];
  if (r.deudaConvergio === false) {
    alertas.push({
      id: 'financiamiento-convergencia', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'Deuda sin converger',
      titulo: 'El dimensionamiento de la deuda no convergió',
      detalle: `La deuda, los usos y las comisiones no se estabilizaron a menos de 1 USD en ${ITERACIONES_DEUDA} iteraciones; las cifras son las de la última iteración.`,
      accion: 'Revisar las comisiones de los créditos y el apalancamiento máximo; si persiste, reportarlo.',
    });
  }
  const covenant = r.covenant ?? 0;
  const x = (v: number) => `${v.toFixed(2)}x`;
  const estructura = `Estructura: ${r.estructura ?? '—'}.`;
  const p50 = r.dscrMinP50, p90 = r.dscrMinP90;

  if (p50 != null && p50 < covenant) {
    // Con la producción esperada ya no alcanza: incumplimiento probable del contrato de crédito
    alertas.push({
      id: 'financiamiento-dscr', sev: 'critico', categoria: 'Financiamiento', ref,
      etiqueta: 'DSCR bajo covenant',
      titulo: `DSCR mínimo con P50 de ${x(p50)}, por debajo del covenant de ${x(covenant)}`,
      detalle: `${estructura} El mínimo se da en el año ${r.anoDscrMinP50 ?? '—'} de operación (con P90: ${p90 != null ? x(p90) : 'N/D'}). Con la producción esperada el proyecto incumpliría el covenant.`,
      accion: 'Revisar con el banco: reducir el monto o alargar el plazo de la deuda, mejorar el precio o el porcentaje del PPA, o confirmar con el asesor fiscal el esquema de depreciación.',
    });
  } else if (p90 != null && p90 < covenant) {
    alertas.push({
      id: 'financiamiento-dscr', sev: 'advertencia', categoria: 'Financiamiento', ref,
      etiqueta: 'DSCR P90 bajo covenant',
      titulo: `DSCR mínimo con P90 de ${x(p90)}, por debajo del covenant de ${x(covenant)}`,
      detalle: `${estructura} Solo en el escenario P90 (año ${r.anoDscrMinP90 ?? '—'}); con P50 el mínimo es ${p50 != null ? x(p50) : 'N/D'}. Un año de baja producción podría activar el covenant.`,
      accion: 'Negociar con el banco una cuenta de reserva mayor o un monto de deuda menor, o mejorar las condiciones del PPA.',
    });
  } else {
    // Sobre el covenant pero sin la holgura con que se dimensionó la deuda
    const holgura = [
      ...(p50 != null && r.dscrDimensionamientoP50 != null && p50 < r.dscrDimensionamientoP50 - TOLERANCIA_DSCR ? [`con P50 ${x(p50)} (dimensionado a ${x(r.dscrDimensionamientoP50)})`] : []),
      ...(p90 != null && r.dscrDimensionamientoP90 != null && p90 < r.dscrDimensionamientoP90 - TOLERANCIA_DSCR ? [`con P90 ${x(p90)} (dimensionado a ${x(r.dscrDimensionamientoP90)})`] : []),
    ];
    if (holgura.length > 0) {
      alertas.push({
        id: 'financiamiento-dscr', sev: 'advertencia', categoria: 'Financiamiento', ref,
        etiqueta: 'DSCR sin holgura',
        titulo: `DSCR entre el covenant de ${x(covenant)} y el de dimensionamiento`,
        detalle: `${estructura} DSCR mínimo ${holgura.join('; ')}. Cumple el covenant, pero sin el margen que pide el banco.`,
        accion: 'Volver a dimensionar la deuda con los supuestos actuales o revisar con el banco el monto aprobado.',
      });
    }
  }

  if (r.plazoDeudaAnos != null && r.ppaPlazoAnos != null && r.plazoDeudaAnos > r.ppaPlazoAnos) {
    alertas.push({
      id: 'financiamiento-plazo', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'plazo' },
      etiqueta: 'Plazo mayor al PPA',
      titulo: `Plazo de la deuda (${r.plazoDeudaAnos} años) mayor al del PPA (${r.ppaPlazoAnos} años)`,
      detalle: `Los últimos ${r.plazoDeudaAnos - r.ppaPlazoAnos} años de servicio dependen solo de ingresos de mercado, sin contrato; se dimensionan al DSCR de mercado.`,
      accion: 'Confirmar con el banco que acepta riesgo de mercado (tail) o ajustar el plazo de la deuda al del PPA.',
    });
  }

  // Sin cola de PPA: la deuda termina con el PPA o a un año (si es más larga, ya avisa la regla anterior)
  if (r.plazoDeudaAnos != null && r.ppaPlazoAnos != null && r.plazoDeudaAnos >= r.ppaPlazoAnos - 1 && r.plazoDeudaAnos <= r.ppaPlazoAnos) {
    alertas.push({
      id: 'financiamiento-cola-ppa', sev: 'info', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'plazo' },
      etiqueta: 'Sin cola de PPA',
      titulo: 'Sin cola de PPA',
      detalle: `El plazo de la deuda (${r.plazoDeudaAnos} años) ${r.plazoDeudaAnos === r.ppaPlazoAnos ? 'iguala al' : 'termina un año antes que el'} del PPA (${r.ppaPlazoAnos} años); los bancos suelen pedir 1–3 años de cola (PPA más largo que la deuda).`,
      accion: 'Confirmar con el banco el plazo aceptable o negociar un PPA más largo.',
    });
  }

  // COD +6 meses: si la DSRA no alcanza para el faltante del año 1, hay incumplimiento de pago
  if (r.cod6Incumple) {
    const c = r.cod6Incumple;
    alertas.push({
      id: 'financiamiento-cod6', sev: 'critico', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'dscr' },
      monto: c.faltante - c.usoDsra, montoEtiqueta: 'Sin cubrir',
      etiqueta: 'Incumplimiento con COD +6',
      titulo: 'Incumplimiento de pago en el año 1 con COD +6 meses',
      detalle: `Con la COD 6 meses tarde, el CFADS del año 1 (${formatearMoneda(c.cfadsAno1)}) no cubre el servicio (${formatearMoneda(c.servicioAno1)}): faltan ${formatearMoneda(c.faltante)} y la DSRA (${formatearMoneda(c.dsra)}) no alcanza; quedan ${formatearMoneda(c.faltante - c.usoDsra)} sin pagar.`,
      accion: 'Ampliar la DSRA, pactar con los bancos un periodo de gracia o un primer pago posterior, o pedir al EPC penalizaciones por retraso que cubran el faltante.',
    });
  }

  // Lock-up: algún año del caso base o de un escenario por debajo del DSCR capturado (dividendos bloqueados)
  if (r.lockup && r.lockup.casos.length > 0) {
    const { dscr, casos } = r.lockup;
    const porEscenario = new Map<string, { ano: number; dscr: number }[]>();
    for (const c of casos) porEscenario.set(c.escenario, [...(porEscenario.get(c.escenario) ?? []), c]);
    alertas.push({
      id: 'financiamiento-lockup', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'dscr' },
      etiqueta: 'Lock-up',
      titulo: `Lock-up: DSCR bajo ${dscr.toFixed(2)}x en ${porEscenario.size === 1 ? '1 caso' : `${porEscenario.size} casos`}`,
      detalle: `Con DSCR menor a ${dscr.toFixed(2)}x no se pueden distribuir dividendos: ${[...porEscenario].map(([e, l]) => `${e} (${l.length === 1 ? `año ${l[0].ano}` : `${l.length} años`}, mínimo ${Math.min(...l.map((x) => x.dscr)).toFixed(2)}x)`).join('; ')}.`,
      accion: 'Revisar con los socios el efecto en las distribuciones o negociar con los bancos el DSCR de lock-up.',
    });
  }

  // TIR de equity contra la objetivo de los socios: solo con un objetivo capturado (sin él, una sugerencia)
  if (r.tirEquity != null && r.tirObjetivo === null) {
    alertas.push({
      id: 'financiamiento-tir-objetivo', sev: 'info', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'tir' },
      etiqueta: 'Sin TIR objetivo',
      titulo: 'Captura la TIR objetivo de los socios para evaluar el retorno',
      detalle: `La TIR de equity calculada es ${formatearTir(r.tirEquity)} (caso P50 · ${r.estructura ?? '—'}), pero no hay una TIR objetivo capturada contra la cual compararla ni para calcular el precio de PPA mínimo.`,
      accion: 'En "Editar supuestos", captura la TIR de equity que exigen los socios.',
    });
  } else if (r.tirEquity != null && r.tirObjetivo != null && r.tirEquity < r.tirObjetivo) {
    const contratado = r.ppaPorcentaje != null ? ` (sobre el ${formatearNumero(r.ppaPorcentaje)} % contratado)` : '';
    const hoy = r.ppaPrecio != null ? ` (hoy ${formatearMoneda(r.ppaPrecio, 2)}/MWh)` : '';
    const precio = !r.precioMinimo ? ''
      : r.precioMinimo.precio != null
        ? ` Precio de PPA mínimo${contratado}: ${formatearMoneda(r.precioMinimo.precio, 2)}/MWh${hoy}, con la deuda redimensionada.`
        : ` No se alcanza con un precio de PPA${contratado} de hasta ${formatearMoneda(r.precioMinimo.maximo, 2)}/MWh${hoy}.`;
    alertas.push({
      id: 'financiamiento-tir-objetivo', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'tir' },
      etiqueta: 'TIR bajo objetivo',
      titulo: `TIR de equity bajo el objetivo: ${formatearTir(r.tirEquity)} frente a ${formatearTir(r.tirObjetivo)}`,
      detalle: `Caso P50 · ${r.estructura ?? '—'}. Con los supuestos actuales, el retorno para los socios queda ${formatearNumero((r.tirObjetivo - r.tirEquity) * 100, 2)} puntos por debajo del objetivo.${precio}`,
      accion: 'Mejorar el precio o el porcentaje del PPA, el CAPEX o las condiciones de la deuda; o revisar con los socios el objetivo de retorno.',
    });
  }

  if (r.segurosAnual === 0) {
    alertas.push({
      id: 'financiamiento-seguros', sev: 'advertencia', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'supuestos' },
      etiqueta: 'Sin seguros',
      titulo: 'Seguros sin capturar',
      detalle: 'Los seguros de operación están en USD 0 al año: los costos quedan subestimados y la TIR, la deuda y el DSCR salen más altos de lo real.',
      accion: 'Capturar en "Editar supuestos" la prima anual cotizada por la aseguradora (daños materiales, pérdida de beneficios y responsabilidad civil).',
    });
  }
  return alertas;
}

const PESO: Record<Severidad, number> = { critico: 0, advertencia: 1, info: 2 };
const TEXTO_SEVERIDAD: Record<Severidad, string> = { critico: 'Crítica', advertencia: 'Advertencia', info: 'Informativa' };

/** Ordena por severidad y, dentro de cada nivel, por la fecha más próxima. */
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort(
    (a, b) => PESO[a.sev] - PESO[b.sev] || (a.fecha ?? '9999').localeCompare(b.fecha ?? '9999') || a.id.localeCompare(b.id),
  );
}

/** Créditos con banco o estado sin capturar: informativa (no detiene el cálculo). */
function validarDatosCreditos(c: { bancoSinCapturar: string[]; estadoSinCapturar: string[] }): Alerta[] {
  if (c.bancoSinCapturar.length === 0 && c.estadoSinCapturar.length === 0) return [];
  const partes = [
    ...(c.bancoSinCapturar.length ? [`Falta el banco de: ${c.bancoSinCapturar.join(', ')}.`] : []),
    ...(c.estadoSinCapturar.length ? [`Falta el estado de: ${c.estadoSinCapturar.join(', ')}; su parte de los desembolsos no cuenta como confirmada.`] : []),
  ];
  return [{
    id: 'financiamiento-creditos-datos', sev: 'info', categoria: 'Financiamiento', ref: { tipo: 'financiamiento', clave: 'supuestos' },
    etiqueta: c.bancoSinCapturar.length ? 'Banco sin capturar' : 'Estado sin capturar',
    titulo: c.bancoSinCapturar.length ? 'Banco sin capturar' : 'Estado del crédito sin capturar',
    detalle: `${partes.join(' ')} No cambia la deuda, la TIR ni el DSCR.`,
    accion: 'En Finanzas, captura el banco y el estado de cada crédito.',
  }];
}

export function validarProyecto({ proyecto, frentes, garantias, finanzas, garantiasDisponibles = true, rentabilidad, fechasClave, hoy = hoyISO(), documentos, evidenciaGarantias, iva, creditos }: EntradaValidacion): Alerta[] {
  const fechaRtb = proyecto.fechaRtb;
  const margen = margenDe(proyecto);
  const fechas: FechasClave = { ...(fechasClave ?? soloRtb(fechaRtb)), rtb: fechaRtb };
  // El entregable de garantías siempre se evalúa con su estado calculado, aunque llegue con uno manual
  const cobertura = calcularCoberturaGarantias(garantias, fechaRtb, margen, garantiasDisponibles, fechasClave);
  const sinRtb: Alerta[] = fechaRtb ? [] : [{
    id: 'proyecto-sin-rtb', sev: 'advertencia', categoria: 'Proyecto', ref: { tipo: 'proyecto', clave: 'rtb' },
    etiqueta: 'Sin RTB',
    titulo: 'Falta la fecha RTB objetivo',
    detalle: 'Sin RTB objetivo no se pueden evaluar los plazos de los entregables ni la cobertura de las garantías.',
    accion: 'Definir la fecha RTB objetivo del proyecto en la barra de preparación.',
  }];
  return ordenarAlertas(unaAlertaPorIva([
    ...sinRtb,
    // Si no se pudieron leer las garantías no se evalúan (habría una falsa alerta de "no hay garantías")
    ...(garantiasDisponibles ? validarGarantias(garantias, fechas, margen, hoy) : []),
    ...validarFrentes(aplicarEntregablesAutomaticos(frentes, cobertura), fechaRtb, hoy),
    ...(finanzas ? validarFinanciamiento(finanzas, fechaRtb, hoy) : []),
    ...(finanzas ? validarObraAntesDePermisos(finanzas, aplicarEntregablesAutomaticos(frentes, cobertura), fechaRtb) : []),
    ...(rentabilidad ? validarRentabilidad(rentabilidad) : []),
    ...(documentos ? validarEvidencia(aplicarEntregablesAutomaticos(frentes, cobertura), documentos, evidenciaGarantias, fechaRtb, hoy) : []),
    ...(iva ? validarIva(iva) : []),
    ...(creditos ? validarDatosCreditos(creditos) : []),
  ], finanzas));
}

/**
 * Una sola alerta cuando el hueco de caja y "equity comprometido insuficiente para el IVA" se deben al mismo IVA:
 * si sin los movimientos del IVA no hay hueco, la alerta de caja explica que la causa es el IVA y la de equity se
 * omite. Si el hueco existe también sin IVA, se conservan las dos y la de equity remite a la de caja.
 */
function unaAlertaPorIva(alertas: Alerta[], finanzas?: ModeloFinanciero): Alerta[] {
  const caja = alertas.find((a) => a.id === 'financiamiento-caja');
  const equityIva = alertas.find((a) => a.id === 'financiamiento-iva-equity');
  if (!caja || !equityIva || !finanzas?.iva) return alertas;
  const huecoSinIva = calcularFlujoAcumulado({ pagos: finanzas.pagos, fondos: finanzas.fondos }).some((p) => p.hueco > 0);
  if (huecoSinIva) {
    return alertas.map((a) => (a === equityIva ? { ...a, detalle: `${a.detalle} Este faltante también agranda el hueco de caja (ver la alerta "${caja.titulo}").` } : a));
  }
  return alertas
    .filter((a) => a !== equityIva)
    .map((a) => (a === caja ? { ...a, detalle: `${a.detalle} El hueco se debe al IVA de construcción: ${equityIva.detalle}`, accion: `${a.accion} ${equityIva.accion}` } : a));
}

/** Máximo de títulos que se listan en la alerta de entregables completos sin documento. */
const MAX_LISTA_EVIDENCIA = 8;

/** Completos sin documento: advertencia cuando faltan esta cantidad de días o menos para el RTB objetivo (o ya pasó). */
export const DIAS_EVIDENCIA_ADVERTENCIA = 180;

/**
 * Completos sin documento: se permite (un banco pedirá el respaldo de cada uno). Advertencia a 180 días o menos del
 * RTB objetivo o si ya pasó; informativa si falta más o no hay RTB objetivo.
 */
function validarEvidencia(frentes: Frente[], documentos: Record<string, number>, garantias: { activas: number; conDocumento: number } | undefined, fechaRtb: string | null, hoy: string): Alerta[] {
  const r = resumenEvidencia(frentes, documentos, garantias);
  if (r.sinEvidencia.length === 0) return [];
  const n = r.sinEvidencia.length;
  const diasRtb = fechaRtb ? diasEntre(hoy, fechaRtb) : null;
  const cercaDelRtb = diasRtb != null && diasRtb <= DIAS_EVIDENCIA_ADVERTENCIA;
  const lista = r.sinEvidencia.slice(0, MAX_LISTA_EVIDENCIA).map((e) => e.titulo).join(', ')
    + (n > MAX_LISTA_EVIDENCIA ? ` y ${n - MAX_LISTA_EVIDENCIA} más` : '');
  return [{
    id: 'evidencia', sev: cercaDelRtb ? 'advertencia' : 'info', categoria: 'Frentes de trabajo', ref: { tipo: 'proyecto', clave: 'evidencia' },
    etiqueta: 'Sin evidencia',
    titulo: `${n} ${n === 1 ? 'entregable completo' : 'entregables completos'} sin documento`,
    detalle: `${textoEvidencia(r)}. Sin documento: ${lista}.${cercaDelRtb && fechaRtb ? ` ${diasRtb! < 0 ? `El RTB objetivo (${formatearFecha(fechaRtb)}) ya pasó.` : `Faltan ${diasRtb} días para el RTB objetivo (${formatearFecha(fechaRtb)}).`}` : ''}`,
    accion: 'Sube el documento que respalda cada uno (resolutivo, contrato, permiso) con el botón 📎 del entregable; para el de garantías, la póliza o carta de crédito de cada garantía activa en la tabla de garantías. Un banco o asesor lo pedirá para dar el entregable por cumplido.',
  }];
}

// ---------------------------------------------------------------------------
// Lecturas derivadas para la interfaz
// ---------------------------------------------------------------------------

export interface EntregableVencido {
  frente: string;
  titulo: string;
  estado: EstadoEntregable;
  responsable: string;
  fecha: string;
  diasVencido: number;
  /** En la ruta hacia RTB y con más de 30 días vencido (alerta crítica). */
  critico: boolean;
}

export interface AvancePlan {
  total: number;
  completos: number;
  /** Entregables que según su fecha compromiso ya deberían estar completos (fecha ≤ hoy). */
  planeados: number;
  realPct: number;      // fracción
  planeadoPct: number;  // fracción
  vencidos: EntregableVencido[];  // del más vencido al menos
  /** Entregables no completos sin fecha compromiso: la proyección no los considera. */
  sinFecha: number;
  /** Fecha del entregable no completo más tardío (los vencidos cuentan como hoy); null si no hay ninguno con fecha. */
  rtbProyectado: string | null;
  entregableRtbProyectado: string | null;
  /** Días del RTB proyectado después del objetivo (0 si llega a tiempo; null sin RTB objetivo o sin proyección). */
  diasAtraso: number | null;
  /** Bloqueados con fecha compromiso ≤ RTB objetivo: con ellos el RTB proyectado no puede darse por "a tiempo". */
  bloqueadosEnRiesgo: { titulo: string; fecha: string; vencido: boolean }[];
}

/** Situación del RTB proyectado para mostrarla: atraso (rojo), en riesgo por bloqueos (ámbar o rojo) o a tiempo. */
export type SituacionRtb =
  | { tipo: 'sin_proyeccion' }
  | { tipo: 'atraso'; dias: number; bloqueados: number }
  | { tipo: 'en_riesgo'; bloqueados: number; grave: boolean }
  | { tipo: 'a_tiempo' };

/**
 * En riesgo si hay bloqueados con fecha ≤ RTB objetivo. Es grave (rojo) si alguno ya venció o falta 30 días
 * o menos para el RTB; si no, ámbar. El atraso (proyectado después del objetivo) siempre manda.
 */
export function situacionRtb(a: AvancePlan, fechaRtb: string | null, hoy: string = hoyISO()): SituacionRtb {
  if (!a.rtbProyectado || a.diasAtraso == null) return { tipo: 'sin_proyeccion' };
  const bloqueados = a.bloqueadosEnRiesgo.length;
  if (a.diasAtraso > 0) return { tipo: 'atraso', dias: a.diasAtraso, bloqueados };
  if (bloqueados > 0) {
    const grave = a.bloqueadosEnRiesgo.some((b) => b.vencido) || (fechaRtb != null && diasEntre(hoy, fechaRtb) <= DIAS_VENCIDO_CRITICO);
    return { tipo: 'en_riesgo', bloqueados, grave };
  }
  return { tipo: 'a_tiempo' };
}

/** Avance real contra el plan (fechas compromiso), entregables vencidos y RTB proyectado. */
export function calcularAvance(frentes: Frente[], fechaRtb: string | null, hoy: string = hoyISO()): AvancePlan {
  const items = frentes.flatMap((f) => f.items.map((i) => ({ frente: f.nombre, i })));
  const total = items.length;
  const completos = items.filter(({ i }) => i[1] === 'completo').length;
  const planeados = items.filter(({ i }) => i[3] && i[3] <= hoy).length;
  const vencidos: EntregableVencido[] = items.flatMap(({ frente, i: [titulo, estado, responsable, fecha] }) => {
    const v = vencimiento(estado, fecha, fechaRtb, hoy);
    return v && fecha ? [{ frente, titulo, estado, responsable, fecha, diasVencido: v.dias, critico: v.critico }] : [];
  }).sort((a, b) => b.diasVencido - a.diasVencido);

  const abiertos = items.filter(({ i }) => i[1] !== 'completo');
  // Un entregable vencido no puede cerrarse en el pasado: cuenta como hoy
  const proyecciones = abiertos.filter(({ i }) => i[3]).map(({ i }) => ({ titulo: i[0], fecha: i[3]! < hoy ? hoy : i[3]! }));
  const ultimo = proyecciones.reduce<{ titulo: string; fecha: string } | null>((m, p) => (!m || p.fecha > m.fecha ? p : m), null);
  return {
    total, completos, planeados,
    realPct: total ? completos / total : 0,
    planeadoPct: total ? planeados / total : 0,
    vencidos,
    sinFecha: abiertos.length - proyecciones.length,
    rtbProyectado: ultimo?.fecha ?? null,
    entregableRtbProyectado: ultimo?.titulo ?? null,
    diasAtraso: fechaRtb && ultimo ? Math.max(0, diasEntre(fechaRtb, ultimo.fecha)) : null,
    bloqueadosEnRiesgo: fechaRtb
      ? abiertos.filter(({ i }) => i[1] === 'bloqueado' && i[3] && i[3] <= fechaRtb).map(({ i }) => ({ titulo: i[0], fecha: i[3]!, vencido: i[3]! < hoy }))
      : [],
  };
}

export function contarAlertas(alertas: Alerta[]): { criticas: number; advertencias: number; informativas: number } {
  return {
    criticas: alertas.filter((a) => a.sev === 'critico').length,
    advertencias: alertas.filter((a) => a.sev === 'advertencia').length,
    informativas: alertas.filter((a) => a.sev === 'info').length,
  };
}

// ---------------------------------------------------------------------------
// Contexto para el asistente (Gemini)
// ---------------------------------------------------------------------------

// Las reglas y el armado del contexto viven en un módulo compartido con la Edge Function gemini-proxy,
// que es quien los agrega al contexto de sistema. Aquí solo se preparan los datos que envía el chat.
export { INSTRUCCION_SISTEMA, MAX_PREGUNTA } from '../../supabase/functions/_shared/asesor.ts';

/** Proyecto con cifras ya calculadas y formateadas por la app, listas para citarse tal cual. */
export interface ProyectoParaPrompt extends Proyecto {
  cifras?: CifraAsesor[];
}

/** Lo que el chat envía junto con la pregunta: datos del proyecto y alertas de validarProyecto(). */
export function datosParaAsesor(proyecto: ProyectoParaPrompt | null, alertas: Alerta[]): { proyecto: ProyectoAsesor | null; alertas: AlertaAsesor[] } {
  return {
    proyecto: proyecto && {
      name: proyecto.name,
      state: proyecto.state,
      cifras: [{ etiqueta: 'RTB objetivo', valor: proyecto.fechaRtb ? formatearFecha(proyecto.fechaRtb) : 'sin definir' }, ...(proyecto.cifras ?? [])],
    },
    alertas: ordenarAlertas(alertas).map(({ sev, titulo, detalle, accion }) => ({ sev, titulo, detalle, accion })),
  };
}

/** Estado de una garantía según la alerta agrupada de garantías; si no aparece en ella, está vigente. */
export function estadoGarantia(alertas: Alerta[], indice: number): { nivel: Severidad | 'vigente'; etiqueta: string } {
  const estado = alertas.flatMap((a) => a.garantias ?? []).find((e) => e.indice === indice);
  return estado ? { nivel: estado.nivel, etiqueta: estado.etiqueta } : { nivel: 'vigente', etiqueta: 'Sin alerta' };
}
