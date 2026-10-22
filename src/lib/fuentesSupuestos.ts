// Fuente o justificación de los supuestos ilustrativos del proyecto de ejemplo (Alpha I).
// La justificación solo se muestra mientras el valor siga siendo el ilustrativo; si el usuario lo cambia,
// se indica que fue modificado (la fuente original ya no aplica).

import { SUPUESTOS_DEFAULT, type Supuestos } from './rentabilidad';
import { RECURSO_SOLAR_ESTADOS, FUENTE_RECURSO_SOLAR, type RecursoSolarEstado } from './recursoSolarEstados';

/** Valores ilustrativos de Alpha I (migraciones 20261011180000, 20261011220000 y 20261011230000). */
export const SUPUESTOS_ILUSTRATIVOS: Supuestos = {
  ...SUPUESTOS_DEFAULT,
  // Datos del ejemplo Alpha I (ilustrativos): incluye una TIR objetivo de referencia, que en un proyecto real se captura
  tirEquityObjetivoPct: 12,
  tasaInteresPct: 7,
  opexAnual: 520_000,
  segurosAnual: 130_000,
};

export const ETIQUETA_ILUSTRATIVO = 'Ilustrativo: validar con cotizaciones reales';

type Campo = keyof Supuestos;

/** Justificación por grupo de campos; aplica mientras todos los campos tengan su valor ilustrativo. */
export const FUENTES: [Campo[], string][] = [
  [['ppaPrecio', 'ppaPorcentaje'], 'Supuesto de trabajo; reemplazar con la oferta de PPA.'],
  [['ppaPlazoAnos', 'ppaEscalamientoPct'], 'Plazo habitual de un PPA corporativo; confirmar en el contrato.'],
  [['mercadoPrecio', 'mercadoEscalamientoPct'], 'Supuesto de trabajo; validar con un pronóstico de precios del mercado eléctrico.'],
  [['celPrecio'], 'Sin ingreso por CELs (conservador).'],
  [['rendimientoFijaKwhKwp', 'gananciaUnEjePct'], 'PVGIS (JRC), 1,810 kWh/kWp con estructura fija; seguidor a un eje +20 % (rango de campo 15–25 %, NREL y Solar Power World).'],
  [['p90Pct'], 'Supuesto de trabajo; reemplazar con el estudio de recurso independiente.'],
  [['degradacionPct'], 'Supuesto de trabajo para módulos cristalinos; validar con la garantía del fabricante.'],
  [['vidaUtilAnos'], 'Supuesto de trabajo.'],
  [['mesesConstruccion'], 'Supuesto de trabajo; confirmar con el programa del contratista EPC.'],
  [['sobrecostoUnEjeUsdWdc', 'omExtraUnEjeUsdKwdc'], 'Sobrecosto de un eje: NREL Cost Benchmarks 2016–2021 (USD 0.06–0.08/Wdc). O&M extra: estimación; reemplazar con cotización.'],
  [['gananciaDosEjesPct', 'sobrecostoDosEjesUsdWdc', 'omExtraDosEjesUsdKwdc'], 'Estimaciones sin fuente sólida; reemplazar con cotización.'],
  [['tasaDescuentoPct'], 'Supuesto de trabajo; solo afecta el LCOE.'],
  [['tirEquityObjetivoPct'], 'Objetivo de referencia; ajustar al retorno que exigen los socios.'],
  [['opexAnual', 'arrendamientoAnual', 'opexEscalamientoPct'], 'Supuesto de trabajo; validar con la oferta de O&M y el contrato de arrendamiento.'],
  [['segurosAnual'], '≈ 0.28 % del CAPEX; validar con la cotización de la aseguradora.'],
  [['isrPct'], 'Tasa general de ISR (LISR art. 9); pérdidas amortizables 10 años (LISR art. 57).'],
  [['depreciacionEsquema', 'depreciacionAno1Pct', 'depreciacionTasaAnualPct'], 'Supuesto; validar con asesor fiscal.'],
  [['depreciacionPorCategorias', 'depreciacionGeneracionPct', 'depreciacionObraCivilPct', 'depreciacionSubestacionPct', 'depreciacionInterconexionPct',
    'depreciacionGeneracionTasaPct', 'depreciacionObraCivilTasaPct', 'depreciacionSubestacionTasaPct', 'depreciacionInterconexionTasaPct'],
    'Dato del usuario; validar con asesor fiscal qué activos califican para la deducción inmediata.'],
  [['ivaActivo', 'ivaTasaPct', 'ivaCapexSujetoPct', 'ivaRecuperacionMeses', 'ivaOrigenEquipo', 'ivaFinanciamiento', 'ivaLineaMonto', 'ivaLineaTasaPct', 'ivaLineaComisionPct'],
    'Dato del usuario. IVA de construcción: supuesto simplificado; validar con asesor fiscal.'],
  [['tasaInteresPct', 'plazoDeudaAnos'], 'Supuesto de trabajo; reemplazar con el term sheet del banco.'],
  [['dscrDimensionamientoP50', 'dscrDimensionamientoP90', 'dscrMercado', 'dscrCovenant', 'apalancamientoMaxPct', 'comisionEstructuracionPct', 'dsraMeses'],
    'Valores habituales en bancos para solar con PPA; confirmar con el term sheet.'],
];

// ── Valores sugeridos al crear un proyecto (formulario "Nuevo parque solar") ──
// Son referencias para precargar el formulario; el usuario los puede cambiar. No son datos del sitio.

/** Las 32 entidades federativas (31 estados y Ciudad de México), en orden alfabético. */
export const ESTADOS_MEXICO: string[] = Object.keys(RECURSO_SOLAR_ESTADOS);

export const ETIQUETA_PROMEDIO_ESTATAL = 'Ilustrativo: promedio estatal';
export const ETIQUETA_POR_CONFIRMAR = 'Por confirmar';
export const ETIQUETA_DATO_USUARIO = 'Dato del usuario';
export { FUENTE_RECURSO_SOLAR };

/** GHI y producción específica promedio del estado (Global Solar Atlas); null si el estado no está en el catálogo. */
export const recursoSolar = (estado: string): RecursoSolarEstado | null => RECURSO_SOLAR_ESTADOS[estado] ?? null;

/**
 * Multiplicador del costo de generación por estado. No hay una fuente pública verificable de costos de
 * construcción fotovoltaica por entidad federativa, así que es 1.00 (sin ajuste) y queda "por confirmar"
 * en todos los estados.
 */
export const MULTIPLICADOR_COSTO_ESTADO = 1;
export const FUENTE_MULTIPLICADOR_COSTO = 'Por confirmar: sin fuente pública de costos de construcción por estado; se usa 1.00 (sin ajuste regional). Reemplazar con la oferta EPC.';

/** Producción específica con estructura fija para un proyecto nuevo y de dónde sale. */
export interface ProduccionEspecifica {
  valor: number;
  origen: 'usuario' | 'promedio_estatal' | 'por_defecto';
  etiqueta: string;
}

/**
 * Valor capturado (estudio de recurso o PVsyst) → "dato del usuario"; si no, el promedio estatal de Global Solar
 * Atlas; si el estado no tiene dato, el valor por defecto de los supuestos (PVGIS), "por confirmar".
 */
export function produccionEspecifica(estado: string, capturada?: unknown): ProduccionEspecifica {
  const valor = parseFloat(String(capturada ?? ''));
  if (Number.isFinite(valor) && valor > 0) return { valor: Math.round(valor), origen: 'usuario', etiqueta: ETIQUETA_DATO_USUARIO };
  const pvout = recursoSolar(estado)?.pvout;
  if (pvout) return { valor: pvout, origen: 'promedio_estatal', etiqueta: `${ETIQUETA_PROMEDIO_ESTATAL} (Global Solar Atlas)` };
  return { valor: SUPUESTOS_DEFAULT.rendimientoFijaKwhKwp, origen: 'por_defecto', etiqueta: `${ETIQUETA_POR_CONFIRMAR}: valor por defecto (PVGIS)` };
}

/**
 * Origen de la producción específica guardada en un proyecto (no hay columna para guardarlo): igual al promedio
 * de su estado → promedio estatal; igual al valor por defecto → por defecto; cualquier otro valor lo capturó el usuario.
 */
export function origenProduccion(valor: number, estado: string): string {
  if (recursoSolar(estado)?.pvout === valor) return `${ETIQUETA_PROMEDIO_ESTATAL}: ${FUENTE_RECURSO_SOLAR}.`;
  if (valor === SUPUESTOS_DEFAULT.rendimientoFijaKwhKwp) return `Valor por defecto (PVGIS, 1,810 kWh/kWp con estructura fija); ${ETIQUETA_POR_CONFIRMAR.toLowerCase()} con un estudio de recurso del sitio.`;
  return `${ETIQUETA_DATO_USUARIO} (estudio de recurso o PVsyst).`;
}

/** Perfiles de interconexión: distancia típica al punto de interconexión y costo base de subestación. */
export const PERFILES_INTERCONEXION: Record<string, { label: string; km: number; baseCost: number }> = {
  adylac: { label: 'Adyacente / Cercana (< 3 km)', km: 2, baseCost: 400_000 },
  standard: { label: 'Estándar de Media/Alta Tensión (5 - 15 km)', km: 10, baseCost: 1_200_000 },
  remote: { label: 'Remota / Alta Complejidad (> 20 km)', km: 25, baseCost: 3_500_000 },
};

export const CAPEX_GENERACION_USD_MW = 950_000;
export const COSTO_LINEA_USD_KM = 120_000;
export const OPEX_USD_MW = 12_000;
export const ARRENDAMIENTO_USD_MW = 2_500;

/** Fuente o justificación de cada valor sugerido (se muestran en el formulario). */
export const FUENTES_PROYECTO_NUEVO = {
  ghi: `GHI y producción específica: ${ETIQUETA_PROMEDIO_ESTATAL.toLowerCase()} de ${FUENTE_RECURSO_SOLAR}. No sustituye un estudio de recurso del sitio; en el módulo de Sitios se obtendrá por coordenada del terreno.`,
  capex: `Generación: USD ${CAPEX_GENERACION_USD_MW.toLocaleString('en-US')}/MWac (supuesto de trabajo); reemplazar con la oferta EPC. Ajuste por estado: ${FUENTE_MULTIPLICADOR_COSTO.charAt(0).toLowerCase()}${FUENTE_MULTIPLICADOR_COSTO.slice(1)}`,
  interconexion: `Interconexión: costo base del perfil + USD ${COSTO_LINEA_USD_KM.toLocaleString('en-US')}/km de línea (supuesto); reemplazar con los estudios de CENACE.`,
  operacion: `OPEX USD ${OPEX_USD_MW.toLocaleString('en-US')}/MW·año y arrendamiento USD ${ARRENDAMIENTO_USD_MW.toLocaleString('en-US')}/MW·año (supuestos); validar con la oferta de O&M y el contrato de arrendamiento.`,
};

const mw = (capacidad: unknown) => parseFloat(String(capacidad)) || 50;

/** CAPEX de referencia: generación (sin ajuste por estado, multiplicador por confirmar) + interconexión (editable por el usuario). */
export function capexReferencia(capacidad: unknown, _estado: string, costoInterconexion: unknown): number {
  return mw(capacidad) * CAPEX_GENERACION_USD_MW * MULTIPLICADOR_COSTO_ESTADO + (parseFloat(String(costoInterconexion)) || 0);
}

export function interconexionReferencia(perfil: string): number {
  const p = PERFILES_INTERCONEXION[perfil] ?? PERFILES_INTERCONEXION.standard;
  return p.baseCost + p.km * COSTO_LINEA_USD_KM;
}

export const opexReferencia = (capacidad: unknown) => mw(capacidad) * OPEX_USD_MW;
export const arrendamientoReferencia = (capacidad: unknown) => mw(capacidad) * ARRENDAMIENTO_USD_MW;

const MODIFICADO = 'Modificado por el usuario.';

/** Justificación de un grupo de campos, o "Modificado por el usuario." si alguno ya no es el ilustrativo. */
export function fuenteDe(campos: Campo[], s: Supuestos): string {
  const fila = FUENTES.find(([c]) => campos.every((x) => c.includes(x)));
  if (!fila) return '';
  return campos.every((c) => String(s[c]) === String(SUPUESTOS_ILUSTRATIVOS[c])) ? fila[1] : MODIFICADO;
}
