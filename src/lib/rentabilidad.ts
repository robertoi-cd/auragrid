// Rentabilidad calculada a partir de supuestos de producción, ingresos, costos, deuda e impuestos.
// Modelo anual y determinista. Sustituye a los indicadores fijos (TIR, LCOE, DSCR) que había antes.
//
// Simplificaciones explícitas (documentadas también en la interfaz):
//   - Construcción (flujos anuales de las TIR): el CAPEX y las aportaciones de equity se reparten por igual en los
//     años de construcción.
//   - Deuda esculpida (sculpted) desde el primer año de operación. El servicio de cada año es el menor entre
//     CFADS P50 ÷ DSCR P50 y CFADS P90 ÷ DSCR P90; la parte de la CFADS que viene de ingresos sin contrato
//     (mercado y CELs) se divide siempre entre el DSCR de mercado, también dentro del plazo del PPA.
//     Deuda = VP del servicio a la tasa de la deuda, con tope de apalancamiento sobre los usos.
//   - Usos = CAPEX + intereses durante la construcción + comisión de estructuración + DSRA (meses del servicio
//     del año 1). Equity = usos − deuda. Intereses de construcción: saldo de deuda dispuesto mes a mes × tasa,
//     con el calendario de pagos del proyecto (o uniforme si no hay) y el equity usado antes que la deuda.
//     La DSRA se libera al equity al terminar el plazo de la deuda.
//   - ISR: pérdidas fiscales amortizables en los 10 años siguientes (LISR art. 57), las más antiguas primero.
//     Depreciación configurable: % en el año 1 (por defecto 100 %) o una tasa anual. Validar con asesor fiscal.
//   - Producción: P50 = rendimiento (kWh/kWp) × MWdc; degradación anual compuesta desde el año 2.

export type Estructura = 'fija' | 'un_eje' | 'dos_ejes';

export const ESTRUCTURAS: Record<Estructura, string> = {
  fija: 'Fija',
  un_eje: 'Seguidor a un eje',
  dos_ejes: 'Seguidor a dos ejes',
};

/** ano1: el % indicado en el año 1 y el resto a la tasa anual. anual: la tasa anual desde el año 1. */
export type EsquemaDepreciacion = 'ano1' | 'anual';

export const ESQUEMAS_DEPRECIACION: Record<EsquemaDepreciacion, string> = {
  ano1: 'Inmediata en el año 1',
  anual: 'Tasa anual',
};

export interface Supuestos {
  estructuraBase: Estructura;          // estructura a la que corresponde el CAPEX registrado del proyecto
  estructuraSeleccionada: Estructura;  // la que usan el tablero, las alertas y el asistente
  rendimientoFijaKwhKwp: number;       // producción específica con estructura fija (PVGIS)
  gananciaUnEjePct: number;            // un eje frente a fija
  gananciaDosEjesPct: number;          // dos ejes frente a un eje
  sobrecostoUnEjeUsdWdc: number;       // un eje frente a fija
  sobrecostoDosEjesUsdWdc: number;     // dos ejes frente a un eje
  omExtraUnEjeUsdKwdc: number;         // USD/kWdc·año, un eje frente a fija
  omExtraDosEjesUsdKwdc: number;       // USD/kWdc·año, dos ejes frente a un eje
  p90Pct: number;                      // P90 como % del P50
  degradacionPct: number;
  vidaUtilAnos: number;
  mesesConstruccion: number;
  ppaPrecio: number;                   // USD/MWh
  ppaPorcentaje: number;               // % de la energía vendida por PPA
  ppaPlazoAnos: number;
  ppaEscalamientoPct: number;
  mercadoPrecio: number;               // USD/MWh, resto de la energía y toda después del PPA
  mercadoEscalamientoPct: number;
  celPrecio: number;                   // USD por MWh (1 CEL por MWh)
  opexAnual: number;                   // USD/año de la estructura base (sin seguros)
  segurosAnual: number;                // USD/año
  arrendamientoAnual: number;          // USD/año
  opexEscalamientoPct: number;         // aplica a OPEX, seguros y arrendamiento
  /** Tasa anual de la deuda senior: con créditos, la ponderada por participación (Σ wᵢ·rᵢ). */
  tasaInteresPct: number;
  plazoDeudaAnos: number;
  dscrDimensionamientoP50: number;     // DSCR con que se dimensiona la deuda sobre la CFADS P50
  dscrDimensionamientoP90: number;     // DSCR con que se dimensiona la deuda sobre la CFADS P90 (1 año)
  dscrMercado: number;                 // DSCR de los ingresos sin contrato (mercado y CELs)
  dscrCovenant: number;                // DSCR mínimo del contrato de crédito
  apalancamientoMaxPct: number;        // deuda máxima como % de los usos
  comisionEstructuracionPct: number;   // % de la deuda (con créditos, la ponderada Σ wᵢ·cᵢ)
  /** % anual sobre lo comprometido no dispuesto, del NTP a la COD (ponderada Σ wᵢ·fᵢ). Sin capturar o 0: no se cobra. */
  comisionNoDisposicionPct?: number | null;
  // Riesgos de operación (Nivel bancario A). Vacío = no aplica: la cifra base no cambia.
  /** Disponibilidad de la planta (%): reduce la producción P50 y P90. */
  disponibilidadPct?: number | null;
  /** Curtailment (% de la energía no despachada): reduce la producción P50 y P90. */
  curtailmentPct?: number | null;
  /** Reemplazo de inversores: año de operación y costo en USD/kWac nominales de ese año. */
  reemplazoInversoresAno?: number | null;
  reemplazoInversoresUsdKwac?: number | null;
  /** Años previos al reemplazo en que se fondea la reserva MMRA desde el CFADS, en partes iguales y sin escalamiento. */
  mmraAnosFondeo?: number | null;
  /** DSCR de lock-up (bloqueo de dividendos): alerta si algún año del caso base o de un escenario queda por debajo. */
  dscrLockup?: number | null;
  /** Penalización del EPC por retraso de la COD: USD por día y tope (escenario COD +6 meses; ambos o no aplica). */
  epcPenalizacionUsdDia?: number | null;
  epcPenalizacionTopeUsd?: number | null;
  /** Estados financieros: la caja que no puede salir como dividendo se devuelve como reembolso de capital variable. Vacío = no. */
  devolucionCapitalVariable?: boolean | null;
  dsraMeses: number;                   // meses del servicio del año 1 en la cuenta de reserva
  isrPct: number;
  depreciacionEsquema: EsquemaDepreciacion;
  depreciacionAno1Pct: number;         // esquema ano1
  depreciacionTasaAnualPct: number;    // esquema anual y resto del esquema ano1
  // Depreciación por categorías de activo (si está activa, sustituye al esquema de arriba). Reparto: % del CAPEX
  // (suman 100). Tasa: % anual de cada categoría; null = no capturada (no se calcula con un valor supuesto).
  depreciacionPorCategorias: boolean;
  depreciacionGeneracionPct: number;
  depreciacionObraCivilPct: number;
  depreciacionSubestacionPct: number;
  depreciacionInterconexionPct: number;
  depreciacionGeneracionTasaPct: number;          // 100 = deducción en el año 1 (LISR art. 34 fr. XIII)
  depreciacionObraCivilTasaPct: number | null;
  depreciacionSubestacionTasaPct: number | null;
  depreciacionInterconexionTasaPct: number | null;
  // IVA de construcción v1 (apagado: no cambia ninguna cifra). Sin valores inventados: % sujeto, plazo, origen del
  // equipo, forma de financiamiento y datos de la línea los captura el usuario; si faltan, no se calcula la TIR (el
  // DSCR no depende del IVA). La tasa viene prellenada en 16 % (dato de ley: LIVA art. 1).
  ivaActivo: boolean;
  ivaTasaPct: number;
  ivaCapexSujetoPct: number | null;
  ivaRecuperacionMeses: number | null;
  ivaOrigenEquipo: OrigenEquipo | null;
  ivaFinanciamiento: FinanciamientoIva | null;
  ivaLineaMonto: number | null;
  ivaLineaTasaPct: number | null;
  ivaLineaComisionPct: number | null;   // con línea, obligatoria (0 % es válido)
  tasaDescuentoPct: number;            // para el LCOE
  tirEquityObjetivoPct: number | null; // la capturan los socios (sin valor por defecto); para el precio mínimo de PPA y la alerta de TIR
}

import { problemasIva, calcularIva, flujosFechadosIva, calendarioIvaDesdeFracciones, type CalendarioIva, type ResultadoIva, type OrigenEquipo, type FinanciamientoIva } from './iva';

// Valores iniciales (ver justificación y fuentes en las migraciones 20261011180000 y 20261011220000)
export const SUPUESTOS_DEFAULT: Supuestos = {
  estructuraBase: 'un_eje',
  estructuraSeleccionada: 'un_eje',
  rendimientoFijaKwhKwp: 1810,
  gananciaUnEjePct: 20,
  gananciaDosEjesPct: 8,
  sobrecostoUnEjeUsdWdc: 0.07,
  sobrecostoDosEjesUsdWdc: 0.15,
  omExtraUnEjeUsdKwdc: 2,
  omExtraDosEjesUsdKwdc: 5,
  p90Pct: 92,
  degradacionPct: 0.5,
  vidaUtilAnos: 30,
  mesesConstruccion: 12,
  ppaPrecio: 42,
  ppaPorcentaje: 80,
  ppaPlazoAnos: 15,
  ppaEscalamientoPct: 0,
  mercadoPrecio: 40,
  mercadoEscalamientoPct: 1,
  celPrecio: 0,
  opexAnual: 600000,
  segurosAnual: 0,
  arrendamientoAnual: 125000,
  opexEscalamientoPct: 2,
  tasaInteresPct: 8,
  plazoDeudaAnos: 15,
  dscrDimensionamientoP50: 1.3,
  dscrDimensionamientoP90: 1.2,
  dscrMercado: 1.75,
  dscrCovenant: 1.15,
  apalancamientoMaxPct: 70,
  comisionEstructuracionPct: 1.5,
  dsraMeses: 6,
  isrPct: 30,
  depreciacionEsquema: 'ano1',
  depreciacionAno1Pct: 100,
  depreciacionTasaAnualPct: 10,
  // Apagada: se usa el esquema de arriba. Al encenderla, todo el CAPEX en equipo de generación al 100 % en el año 1
  // (mismo resultado que el esquema actual); las tasas de las otras categorías las captura el usuario.
  depreciacionPorCategorias: false,
  depreciacionGeneracionPct: 100,
  depreciacionObraCivilPct: 0,
  depreciacionSubestacionPct: 0,
  depreciacionInterconexionPct: 0,
  depreciacionGeneracionTasaPct: 100,
  depreciacionObraCivilTasaPct: null,
  depreciacionSubestacionTasaPct: null,
  depreciacionInterconexionTasaPct: null,
  ivaActivo: false,
  ivaTasaPct: 16,
  ivaCapexSujetoPct: null,
  ivaRecuperacionMeses: null,
  ivaOrigenEquipo: null,
  ivaFinanciamiento: null,
  ivaLineaMonto: null,
  ivaLineaTasaPct: null,
  ivaLineaComisionPct: null,
  tasaDescuentoPct: 8,
  // Sin valor por defecto: sin objetivo capturado no hay precio mínimo de PPA ni alerta de TIR (solo una sugerencia)
  tirEquityObjetivoPct: null,
};

const pct = (x: number) => x / 100;

/** Seguros estimados para un proyecto nuevo: % del CAPEX por año (proporción ilustrativa de Alpha I). */
export const SEGUROS_ESTIMADOS_PCT_CAPEX = 0.28;

/** USD/año redondeados a miles; 0 si el CAPEX no es válido. Es un estimado: reemplazar con cotización. */
export function segurosEstimados(capex: number): number {
  return Number.isFinite(capex) && capex > 0 ? Math.round((capex * pct(SEGUROS_ESTIMADOS_PCT_CAPEX)) / 1000) * 1000 : 0;
}

/** Años que una pérdida fiscal puede amortizarse (LISR art. 57). */
export const ANOS_AMORTIZACION_PERDIDAS = 10;

/**
 * ISR anual con pérdidas que caducan: cada pérdida se usa en los 10 años siguientes, la más antigua
 * primero. `pendientes` se modifica en sitio y guarda [año de origen, monto por usar]. Si se pasa
 * `caducado`, acumula ahí la pérdida que caducó sin usarse.
 */
export function isrConPerdidas(
  base: number, ano: number, tasa: number, pendientes: [number, number][], caducado?: { monto: number },
  registro?: MovimientoPerdidas,
): number {
  // Descartar pérdidas que ya caducaron
  while (pendientes.length && ano - pendientes[0][0] > ANOS_AMORTIZACION_PERDIDAS) {
    const [, monto] = pendientes.shift()!;
    if (caducado) caducado.monto += monto;
    if (registro) registro.caducada += monto;
  }
  if (base <= 0) {
    if (base < 0) pendientes.push([ano, -base]);
    if (registro) registro.generada += Math.max(0, -base);
    return 0;
  }
  let gravable = base;
  while (gravable > 0 && pendientes.length) {
    const usar = Math.min(gravable, pendientes[0][1]);
    gravable -= usar;
    pendientes[0][1] -= usar;
    if (registro) registro.usada += usar;
    if (pendientes[0][1] <= 0) pendientes.shift();
  }
  return gravable * tasa;
}

/** Movimiento de pérdidas fiscales de un año (para el reporte; no interviene en el cálculo). */
export interface MovimientoPerdidas { generada: number; usada: number; caducada: number }

// ---------------------------------------------------------------------------
// Depreciación por categorías de activo
// ---------------------------------------------------------------------------

export type CategoriaActivo = 'generacion' | 'obraCivil' | 'subestacion' | 'interconexion';

/** Categoría → nombre y campos de reparto (% del CAPEX) y tasa (% anual). */
export const CATEGORIAS_ACTIVO: { clave: CategoriaActivo; nombre: string; reparto: keyof Supuestos; tasa: keyof Supuestos }[] = [
  { clave: 'generacion', nombre: 'Equipo de generación', reparto: 'depreciacionGeneracionPct', tasa: 'depreciacionGeneracionTasaPct' },
  { clave: 'obraCivil', nombre: 'Obra civil', reparto: 'depreciacionObraCivilPct', tasa: 'depreciacionObraCivilTasaPct' },
  { clave: 'subestacion', nombre: 'Subestación y línea', reparto: 'depreciacionSubestacionPct', tasa: 'depreciacionSubestacionTasaPct' },
  { clave: 'interconexion', nombre: 'Interconexión', reparto: 'depreciacionInterconexionPct', tasa: 'depreciacionInterconexionTasaPct' },
];

const tasaCapturada = (v: unknown): v is number => v !== null && v !== undefined && (v as unknown) !== '' && Number.isFinite(Number(v)) && Number(v) > 0;

/**
 * Por qué no se puede calcular la depreciación por categorías (lista vacía = se puede). Solo aplica si está activa:
 * el reparto debe sumar 100 % y cada categoría con reparto mayor a 0 % necesita su tasa (no se supone ninguna).
 */
export function problemasDepreciacion(s: Supuestos): string[] {
  if (!s.depreciacionPorCategorias) return [];
  const problemas: string[] = [];
  const suma = CATEGORIAS_ACTIVO.reduce((a, c) => a + Number(s[c.reparto] ?? 0), 0);
  if (Math.abs(suma - 100) > 0.01) problemas.push(`El reparto del CAPEX por categoría suma ${Math.round(suma * 100) / 100} % y debe sumar 100 %.`);
  for (const c of CATEGORIAS_ACTIVO) {
    if (Number(s[c.reparto] ?? 0) > 0 && !tasaCapturada(s[c.tasa])) {
      problemas.push(`${c.nombre}: tiene ${s[c.reparto]} % del CAPEX y falta su tasa de depreciación.`);
    }
  }
  return problemas;
}

/** Depreciación de una base a una tasa anual (línea recta desde el año 1, sin pasar de la base). */
function lineaRecta(base: number, tasaPct: number, anos: number): number[] {
  let pendiente = base;
  return Array.from({ length: anos }, () => {
    const d = Math.min(pendiente, base * pct(tasaPct));
    pendiente -= d;
    return d;
  });
}

/** Depreciación de cada categoría por año (para el reporte). Lanza un error si falta un dato: no se supone ninguno. */
export function depreciacionPorCategoria(s: Supuestos, base: number): { clave: CategoriaActivo; nombre: string; base: number; tasaPct: number; montos: number[] }[] {
  const problemas = problemasDepreciacion(s);
  if (problemas.length) throw new Error(problemas.join(' '));
  return CATEGORIAS_ACTIVO.filter((c) => Number(s[c.reparto] ?? 0) > 0).map((c) => {
    const b = base * pct(Number(s[c.reparto]));
    const tasaPct = Number(s[c.tasa]);
    return { clave: c.clave, nombre: c.nombre, base: b, tasaPct, montos: lineaRecta(b, tasaPct, s.vidaUtilAnos) };
  });
}

/** Depreciación fiscal de cada año de operación: por categorías (si está activa) o según el esquema elegido. */
export function depreciacionPorAno(s: Supuestos, base: number): number[] {
  if (s.depreciacionPorCategorias) {
    const categorias = depreciacionPorCategoria(s, base);
    return Array.from({ length: s.vidaUtilAnos }, (_, i) => categorias.reduce((a, c) => a + c.montos[i], 0));
  }
  const tasa = Math.max(0, pct(s.depreciacionTasaAnualPct));
  let pendiente = base;
  return Array.from({ length: s.vidaUtilAnos }, (_, i) => {
    const monto = s.depreciacionEsquema === 'ano1' && i === 0 ? base * pct(s.depreciacionAno1Pct) : base * tasa;
    const d = Math.min(pendiente, monto);
    pendiente -= d;
    return d;
  });
}

/** Relación DC/AC del modelo (MWdc = MWac × 1.25). */
export const RELACION_DC_AC = 1.25;

/** Suma año a año (b puede faltar). */
const sumarAnos = (a: number[], b?: number[]) => (b ? a.map((x, i) => x + (b[i] ?? 0)) : a);

/** Depreciación del reemplazo de inversores con la tasa del equipo de generación (validar con asesor fiscal). */
function depreciacionReemplazo(s: Supuestos, costo: number, anos: number): number[] {
  if (s.depreciacionPorCategorias) return lineaRecta(costo, Number(s.depreciacionGeneracionTasaPct), anos);
  return depreciacionPorAno({ ...s, vidaUtilAnos: anos }, costo);
}

export interface ReemplazoInversores {
  ano: number;
  /** USD nominales del año del reemplazo (USD/kWac × kWac). */
  costo: number;
  /** Años de operación en que se fondea la MMRA (vacío: se paga con la caja del año del reemplazo). */
  anosFondeo: number[];
  /** Por año de operación: lo que se aparta del CFADS (aportación a la MMRA, o el reemplazo si no hay reserva). */
  reservas: number[];
  /** Por año de operación: la inversión del reemplazo (para el flujo del proyecto). */
  capex: number[];
  /** Por año de operación: depreciación fiscal del reemplazo. */
  depreciacion: number[];
}

/**
 * Reemplazo de inversores (año y USD/kWac capturados): la reserva MMRA se fondea desde el CFADS en partes iguales, sin
 * escalamiento, en los N años previos (los que haya desde el año 1); en el año del reemplazo se paga con la reserva.
 * Sin N (o en el año 1), se paga con la caja de ese año. El costo se deprecia con la tasa del equipo de generación.
 * Sin año o sin costo, no aplica (null).
 */
export function reemplazoInversores(s: Supuestos, mwdc: number): ReemplazoInversores | null {
  const ano = s.reemplazoInversoresAno, usdKwac = s.reemplazoInversoresUsdKwac;
  if (ano == null || usdKwac == null || !(ano >= 1 && ano <= s.vidaUtilAnos)) return null;
  const costo = usdKwac * (mwdc / RELACION_DC_AC) * 1000;
  const n = s.mmraAnosFondeo == null ? 0 : Math.min(Math.max(0, Math.round(s.mmraAnosFondeo)), ano - 1);
  const anosFondeo = Array.from({ length: n }, (_, i) => ano - n + i);
  const vacio = () => Array(s.vidaUtilAnos).fill(0) as number[];
  const reservas = vacio(), capex = vacio(), depreciacion = vacio();
  if (n > 0) for (const a of anosFondeo) reservas[a - 1] = costo / n;
  else reservas[ano - 1] = costo;
  capex[ano - 1] = costo;
  depreciacionReemplazo(s, costo, s.vidaUtilAnos - ano + 1).forEach((d, i) => { depreciacion[ano - 1 + i] = d; });
  return { ano, costo, anosFondeo, reservas, capex, depreciacion };
}

// ---------------------------------------------------------------------------
// Finanzas básicas
// ---------------------------------------------------------------------------

export function valorPresente(flujos: number[], tasa: number): number {
  return flujos.reduce((s, f, t) => s + f / (1 + tasa) ** t, 0);
}

/** TIR por bisección. null si los flujos no cambian de signo o no hay raíz en (-99 %, 100 %]. */
export function tir(flujos: number[]): number | null {
  if (!flujos.some((f) => f < 0) || !flujos.some((f) => f > 0)) return null;
  let lo = -0.99, hi = 1;
  let vLo = valorPresente(flujos, lo), vHi = valorPresente(flujos, hi);
  if (Math.sign(vLo) === Math.sign(vHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = valorPresente(flujos, mid);
    if (Math.abs(v) < 1e-6) return mid;
    if (Math.sign(v) === Math.sign(vLo)) { lo = mid; vLo = v; } else { hi = mid; vHi = v; }
  }
  return (lo + hi) / 2;
}

/** Valor presente de flujos con fecha: t en años desde el periodo 0 (fracciones de año = meses/12). */
export function valorPresenteFechado(flujos: { t: number; monto: number }[], tasa: number): number {
  return flujos.reduce((s, f) => s + f.monto / (1 + tasa) ** f.t, 0);
}

/** TIR de flujos con fecha (descuento exacto (1 + TIR)^t), por bisección, como tir(). */
export function tirFechada(flujos: { t: number; monto: number }[]): number | null {
  if (!flujos.some((f) => f.monto < 0) || !flujos.some((f) => f.monto > 0)) return null;
  let lo = -0.99, hi = 1;
  let vLo = valorPresenteFechado(flujos, lo);
  const vHi = valorPresenteFechado(flujos, hi);
  if (Math.sign(vLo) === Math.sign(vHi)) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const v = valorPresenteFechado(flujos, mid);
    if (Math.abs(v) < 1e-6) return mid;
    if (Math.sign(v) === Math.sign(vLo)) { lo = mid; vLo = v; } else { hi = mid; }
  }
  return (lo + hi) / 2;
}

// ---------------------------------------------------------------------------
// Variantes por estructura
// ---------------------------------------------------------------------------

export interface Variante {
  estructura: Estructura;
  rendimientoKwhKwp: number;
  p50Mwh: number;
  capex: number;
  omExtraAnual: number; // respecto de la estructura base
}

export function variantePorEstructura(s: Supuestos, estructura: Estructura, capexBase: number, mwdc: number): Variante {
  const fija = s.rendimientoFijaKwhKwp;
  const rendimiento: Record<Estructura, number> = {
    fija,
    un_eje: fija * (1 + pct(s.gananciaUnEjePct)),
    dos_ejes: fija * (1 + pct(s.gananciaUnEjePct)) * (1 + pct(s.gananciaDosEjesPct)),
  };
  // Costos acumulados sobre la estructura fija
  const sobrecosto: Record<Estructura, number> = { fija: 0, un_eje: s.sobrecostoUnEjeUsdWdc, dos_ejes: s.sobrecostoUnEjeUsdWdc + s.sobrecostoDosEjesUsdWdc };
  const om: Record<Estructura, number> = { fija: 0, un_eje: s.omExtraUnEjeUsdKwdc, dos_ejes: s.omExtraUnEjeUsdKwdc + s.omExtraDosEjesUsdKwdc };
  return {
    estructura,
    rendimientoKwhKwp: rendimiento[estructura],
    p50Mwh: rendimiento[estructura] * mwdc, // kWh/kWp × (MWdc × 1000 kWp) / 1000 = MWh
    capex: Math.round(capexBase + (sobrecosto[estructura] - sobrecosto[s.estructuraBase]) * mwdc * 1e6),
    omExtraAnual: (om[estructura] - om[s.estructuraBase]) * mwdc * 1000,
  };
}

// ---------------------------------------------------------------------------
// Operación (antes de deuda e impuestos)
// ---------------------------------------------------------------------------

export interface Operacion {
  energiaMwh: number;
  ingresos: number;
  costos: number;
  ebitda: number;
  /** Parte de los ingresos sin contrato (mercado y CELs), de 0 a 1. */
  pesoMercado: number;
  /** Desglose (para el reporte): ingresos = ingresosPpa + ingresosMercado; costos = opex + seguros + arrendamiento + omEstructura. */
  ingresosPpa: number;
  ingresosMercado: number;
  opex: number;
  seguros: number;
  arrendamiento: number;
  omEstructura: number;
}

/** Factor de producción por disponibilidad y curtailment; sin capturar, 1 (la producción no cambia). */
export function factorDisponibilidad(s: Pick<Supuestos, 'disponibilidadPct' | 'curtailmentPct'>): number {
  const disponibilidad = s.disponibilidadPct == null ? 1 : pct(s.disponibilidadPct);
  const curtailment = s.curtailmentPct == null ? 0 : pct(s.curtailmentPct);
  return disponibilidad * (1 - curtailment);
}

export function operaciones(s: Supuestos, v: Variante, factorEnergia: number): Operacion[] {
  const disponible = factorDisponibilidad(s);
  return Array.from({ length: s.vidaUtilAnos }, (_, i) => {
    const ano = i + 1;
    const energia = (disponible === 1 ? v.p50Mwh * factorEnergia : v.p50Mwh * factorEnergia * disponible) * (1 - pct(s.degradacionPct)) ** i;
    const conPpa = ano <= s.ppaPlazoAnos ? pct(s.ppaPorcentaje) : 0;
    const ingPpa = energia * conPpa * s.ppaPrecio * (1 + pct(s.ppaEscalamientoPct)) ** i;
    const ingMercado = energia * ((1 - conPpa) * s.mercadoPrecio * (1 + pct(s.mercadoEscalamientoPct)) ** i + s.celPrecio);
    const ingresos = ingPpa + ingMercado;
    const escalamiento = (1 + pct(s.opexEscalamientoPct)) ** i;
    const costos = (s.opexAnual + s.segurosAnual + s.arrendamientoAnual + v.omExtraAnual) * escalamiento;
    return {
      energiaMwh: energia, ingresos, costos, ebitda: ingresos - costos, pesoMercado: ingresos > 0 ? ingMercado / ingresos : 1,
      ingresosPpa: ingPpa, ingresosMercado: ingMercado,
      opex: s.opexAnual * escalamiento, seguros: s.segurosAnual * escalamiento,
      arrendamiento: s.arrendamientoAnual * escalamiento, omEstructura: v.omExtraAnual * escalamiento,
    };
  });
}

export interface Caja {
  intereses: number[];
  saldos: number[];   // saldo de la deuda al cierre de cada año
  isr: number[];
  cfads: number[];
  inicioIsr: number | null;
  perdidaCaducada: number;
  /** Para el reporte: base gravable antes de pérdidas, movimiento de pérdidas y pérdidas pendientes al cierre. */
  baseGravable: number[];
  perdidas: MovimientoPerdidas[];
  perdidasPendientes: number[];
}

/** ISR y CFADS con un calendario de servicio dado (los intereses son deducibles). */
export function caja(s: Supuestos, ops: Operacion[], dep: number[], deuda: number, servicio: number[], plazo: number, reservas: number[] = []): Caja {
  const r = pct(s.tasaInteresPct);
  const pendientes: [number, number][] = [];
  const caducado = { monto: 0 };
  let saldo = deuda;
  let inicioIsr: number | null = null;
  const c: Caja = { intereses: [], saldos: [], isr: [], cfads: [], inicioIsr: null, perdidaCaducada: 0, baseGravable: [], perdidas: [], perdidasPendientes: [] };
  ops.forEach((o, i) => {
    const ano = i + 1;
    const interes = ano <= plazo ? saldo * r : 0;
    saldo -= (servicio[i] ?? 0) - interes;
    const registro: MovimientoPerdidas = { generada: 0, usada: 0, caducada: 0 };
    const isr = isrConPerdidas(o.ebitda - dep[i] - interes, ano, pct(s.isrPct), pendientes, caducado, registro);
    c.baseGravable.push(o.ebitda - dep[i] - interes);
    c.perdidas.push(registro);
    c.perdidasPendientes.push(pendientes.reduce((a, [, m]) => a + m, 0));
    if (isr > 0 && inicioIsr === null) inicioIsr = ano;
    c.intereses.push(interes);
    c.saldos.push(saldo);
    c.isr.push(isr);
    // CFADS: después del ISR y de lo que se aparta a la reserva MMRA (o del reemplazo pagado con la caja del año)
    c.cfads.push(o.ebitda - isr - (reservas[i] ?? 0));
  });
  return { ...c, inicioIsr, perdidaCaducada: caducado.monto };
}

// ---------------------------------------------------------------------------
// Dimensionamiento de la deuda
// ---------------------------------------------------------------------------

export type CriterioDeuda = 'dscr_p50' | 'dscr_p90' | 'apalancamiento';

export const CRITERIOS_DEUDA: Record<CriterioDeuda, string> = {
  dscr_p50: 'DSCR con P50',
  dscr_p90: 'DSCR con P90',
  apalancamiento: 'Apalancamiento máximo',
};

export interface Usos {
  capex: number;
  idc: number;        // intereses durante la construcción
  comision: number;   // comisión de estructuración
  dsra: number;       // cuenta de reserva del servicio de la deuda
  /** Comisión por no disposición durante la construcción (0 si no se cobra). */
  noDisposicion: number;
  total: number;
}

export interface Dimensionamiento {
  deuda: number;
  equity: number;
  usos: Usos;
  servicio: number[];           // servicio de la deuda por año de operación (0 después del plazo)
  plazoAnos: number;
  criterio: CriterioDeuda;
  /** Deuda que admitiría cada criterio por separado (VP del servicio) y el tope de apalancamiento. */
  capacidad: { dscrP50: number; dscrP90: number; anoAAno: number; tope: number };
  iteraciones: number;
  /** false si el punto fijo de la deuda no llegó a la tolerancia (1 USD) en el máximo de iteraciones. */
  convergio: boolean;
}

/** Fracción del CAPEX que se paga en cada mes de construcción (mes 0 = NTP / cierre financiero). */
export interface PagoMensual { mes: number; fraccion: number }

/** Sin calendario capturado: el CAPEX se paga por partes iguales en los meses de construcción. */
export function calendarioUniforme(meses: number): PagoMensual[] {
  const n = Math.max(1, Math.round(meses));
  return Array.from({ length: n }, (_, mes) => ({ mes, fraccion: 1 / n }));
}

/**
 * Intereses durante la construcción con el calendario de desembolsos: cada mes se paga el CAPEX del calendario
 * (y la comisión en el mes 0); se usa primero el equity y después la deuda. Los intereses del mes son el saldo
 * de deuda dispuesto × tasa / 12 y se capitalizan (se pagan con más deuda) hasta la operación comercial (COD).
 * La DSRA se fondea en la COD y no genera intereses de construcción.
 */
export function interesesConstruccion(
  { capex, comision, equity, tasaAnual, meses, calendario }:
  { capex: number; comision: number; equity: number; tasaAnual: number; meses: number; calendario: PagoMensual[] },
): number {
  return costosConstruccion({ capex, comision, equity, tasaAnual, meses, calendario, deuda: 0, tasaNoDisposicion: 0 }).idc;
}

/**
 * Intereses durante la construcción y comisión por no disposición, con el mismo calendario mensual: la comisión del
 * mes es lo comprometido no dispuesto (deuda − saldo dispuesto al inicio del mes) × tasa anual / 12, del NTP (mes 0)
 * a la COD. Se fondea como los intereses (equity primero, después deuda). Con tasa 0, idc es el de siempre.
 */
export function costosConstruccion(
  { capex, comision, equity, tasaAnual, meses, calendario, deuda, tasaNoDisposicion }:
  { capex: number; comision: number; equity: number; tasaAnual: number; meses: number; calendario: PagoMensual[]; deuda: number; tasaNoDisposicion: number },
): { idc: number; noDisposicion: number } {
  const n = Math.max(1, Math.round(meses));
  const pagos = Array(n + 1).fill(0);
  for (const p of calendario) pagos[Math.min(n, Math.max(0, Math.round(p.mes)))] += capex * p.fraccion;
  pagos[0] += comision;
  let saldo = 0, equityUsado = 0, idc = 0, noDisposicion = 0;
  for (let m = 0; m <= n; m++) {
    const interes = (saldo * tasaAnual) / 12;
    const cargo = tasaNoDisposicion > 0 ? (Math.max(0, deuda - saldo) * tasaNoDisposicion) / 12 : 0;
    idc += interes;
    noDisposicion += cargo;
    const necesidad = pagos[m] + interes + cargo;
    const deEquity = Math.min(necesidad, Math.max(0, equity - equityUsado));
    equityUsado += deEquity;
    saldo += necesidad - deEquity;
  }
  return { idc, noDisposicion };
}

/** Servicio máximo de cada año: lo contratado al DSCR del criterio y lo no contratado al DSCR de mercado. */
function servicioPermitido(s: Supuestos, ops: Operacion[], cfads: number[], dscr: number, plazo: number): number[] {
  return ops.map((o, i) => {
    if (i >= plazo) return 0;
    const c = Math.max(0, cfads[i]);
    return (c * (1 - o.pesoMercado)) / dscr + (c * o.pesoMercado) / s.dscrMercado;
  });
}

/** Máximo de iteraciones del punto fijo de la deuda (tolerancia 1 USD: dos iteraciones seguidas a menos de 0.5). */
export const ITERACIONES_DEUDA = 200;

function dimensionarDeuda(
  s: Supuestos, capex: number, ops50: Operacion[], ops90: Operacion[], dep: number[], calendario: PagoMensual[], reservas: number[] = [],
): Dimensionamiento {
  const r = pct(s.tasaInteresPct);
  const plazo = Math.max(0, Math.min(Math.round(s.plazoDeudaAnos), s.vidaUtilAnos));
  const vp = (serie: number[]) => serie.reduce((a, x, i) => a + x / (1 + r) ** (i + 1), 0);
  const apal = Math.max(0, pct(s.apalancamientoMaxPct));

  // Usos para una deuda y un servicio dados. El equity (usos − deuda) depende de los intereses de construcción
  // y estos del equity (se usa primero): se resuelve con un punto fijo corto partiendo de los intereses anteriores.
  // Con comisión por no disposición, también depende de la deuda comprometida (y del equity, como los intereses).
  const fNoDisposicion = Math.max(0, pct(s.comisionNoDisposicionPct ?? 0));
  const calcularUsos = (deuda: number, servicio: number[], previo: { idc: number; noDisposicion: number }): Usos => {
    const comision = deuda * pct(s.comisionEstructuracionPct);
    const dsra = ((servicio[0] ?? 0) * s.dsraMeses) / 12;
    let { idc, noDisposicion } = previo;
    for (let i = 0; i < 50; i++) {
      const equity = capex + comision + dsra + idc + noDisposicion - deuda;
      const nuevo = deuda > 0
        ? costosConstruccion({ capex, comision, equity, tasaAnual: r, meses: s.mesesConstruccion, calendario, deuda, tasaNoDisposicion: fNoDisposicion })
        : { idc: 0, noDisposicion: 0 };
      const listo = Math.abs(nuevo.idc - idc) < 0.01 && Math.abs(nuevo.noDisposicion - noDisposicion) < 0.01;
      idc = nuevo.idc;
      noDisposicion = nuevo.noDisposicion;
      if (listo) break;
    }
    return { capex, idc, comision, dsra, noDisposicion, total: capex + idc + comision + dsra + noDisposicion };
  };

  let deuda = 0, servicio: number[] = [];
  let usos: Usos = { capex, idc: 0, comision: 0, dsra: 0, noDisposicion: 0, total: capex };
  let sa: number[] = [], sb: number[] = [], capAnoAAno = 0, iteraciones = 0, convergio = false;
  // Punto fijo: la deuda cambia los intereses, el ISR y la CFADS, y con ellos el servicio y los usos. Si manda el
  // apalancamiento, la comisión por no disposición sube los usos, eso la deuda permitida y eso la comisión: el mismo
  // punto fijo lo resuelve (tolerancia 1 USD; si no converge, Dimensionamiento.convergio = false y hay alerta).
  for (iteraciones = 1; iteraciones <= ITERACIONES_DEUDA; iteraciones++) {
    sa = servicioPermitido(s, ops50, caja(s, ops50, dep, deuda, servicio, plazo, reservas).cfads, s.dscrDimensionamientoP50, plazo);
    sb = servicioPermitido(s, ops90, caja(s, ops90, dep, deuda, servicio, plazo, reservas).cfads, s.dscrDimensionamientoP90, plazo);
    const minimo = sa.map((x, i) => Math.min(x, sb[i]));
    capAnoAAno = vp(minimo);
    usos = calcularUsos(deuda, servicio, usos);
    const nueva = Math.min(capAnoAAno, usos.total * apal);
    // Si manda el apalancamiento, el servicio se reduce en proporción y conserva su forma
    const escala = capAnoAAno > 0 ? nueva / capAnoAAno : 0;
    servicio = minimo.map((x) => x * escala);
    const listo = Math.abs(nueva - deuda) < 0.5;
    deuda = nueva;
    if (listo) { convergio = true; break; }
  }
  // Los usos deben corresponder a la deuda final
  usos = calcularUsos(deuda, servicio, usos);
  const tope = usos.total * apal;

  let criterio: CriterioDeuda = 'apalancamiento';
  if (capAnoAAno < tope - 0.5) {
    // Manda el DSCR que fija el servicio en más valor a lo largo del plazo
    const pesoP50 = sa.reduce((a, x, i) => a + (x <= sb[i] ? x : 0), 0);
    const pesoP90 = sb.reduce((a, x, i) => a + (x < sa[i] ? x : 0), 0);
    criterio = pesoP50 >= pesoP90 ? 'dscr_p50' : 'dscr_p90';
  }
  return {
    deuda, equity: usos.total - deuda, usos, servicio, plazoAnos: plazo, criterio,
    capacidad: { dscrP50: vp(sa), dscrP90: vp(sb), anoAAno: capAnoAAno, tope }, iteraciones: Math.min(iteraciones, ITERACIONES_DEUDA), convergio,
  };
}

// ---------------------------------------------------------------------------
// Flujos y rentabilidad
// ---------------------------------------------------------------------------

export interface AnoOperacion {
  ano: number;            // 1 = primer año de operación
  energiaMwh: number;
  ingresos: number;
  costos: number;         // OPEX + seguros + arrendamiento + O&M de la estructura
  ebitda: number;
  depreciacion: number;
  intereses: number;
  saldoDeuda: number;     // al cierre del año
  isrSinDeuda: number;
  isrConDeuda: number;
  servicioDeuda: number;
  cfads: number;          // flujo disponible para la deuda
  dscr: number | null;
  flujoProyecto: number;
  flujoEquity: number;    // incluye la liberación de la DSRA al final del plazo
  // Desglose para el reporte (exportar análisis financiero). Mismos cálculos; no cambian los totales de arriba.
  ingresosPpa: number;
  ingresosMercado: number; // mercado y CELs
  opex: number;
  seguros: number;
  arrendamiento: number;
  omEstructura: number;    // O&M adicional de la estructura (seguidores)
  energiaP90Mwh: number;
  cfadsP90: number;
  dscrP90: number | null;
  saldoInicialDeuda: number;
  amortizacion: number;    // servicio − intereses
  baseGravable: number;    // EBITDA − depreciación − intereses (antes de pérdidas)
  perdidaGenerada: number;
  perdidaUsada: number;
  perdidaCaducada: number;
  perdidasPendientes: number; // al cierre del año
}

export interface InfoIsr {
  /** Primer año de operación con ISR a pagar (null si no paga en la vida útil). */
  inicio: number | null;
  /** Pérdida fiscal que caduca sin usarse (10 años). */
  perdidaCaducada: number;
}

export interface Rentabilidad {
  estructura: Estructura;
  rendimientoKwhKwp: number;
  p50Mwh: number;
  p90Mwh: number;
  capex: number;
  usos: Usos;
  equity: number;
  deuda: number;
  /** Deuda ÷ usos. */
  deudaPct: number;
  criterioDeuda: CriterioDeuda;
  capacidadDeuda: Dimensionamiento['capacidad'];
  /** false si el dimensionamiento de la deuda no convergió (alerta; las cifras son las de la última iteración). */
  deudaConvergio: boolean;
  plazoDeudaAnos: number;
  ppaPlazoAnos: number;
  saldoFinalDeuda: number;
  tirProyecto: number | null;
  tirEquity: number | null;
  dscrMinP50: number | null;
  anoDscrMinP50: number | null;
  dscrMinP90: number | null;
  anoDscrMinP90: number | null;
  lcoe: number | null;
  isrConDeuda: InfoIsr;
  isrSinDeuda: InfoIsr;
  anos: AnoOperacion[]; // escenario P50
  /** Flujos de los años de construcción (negativos) con que se calculan las TIR: proyecto (CAPEX) y equity. Incluyen el IVA si está activo. */
  construccion: { proyecto: number[]; equity: number[] };
  /** IVA de construcción (null si está apagado o le faltan datos). */
  iva: ResultadoIva | null;
  /** Qué le falta al IVA activo para calcularse (con faltantes, TIR de proyecto y de equity en N/D). */
  problemasIva: string[];
}

const minimoDscr = (cfads: number[], servicio: number[]) =>
  cfads.reduce<{ dscr: number; ano: number } | null>((m, c, i) => {
    if (!(servicio[i] > 0)) return m;
    const dscr = c / servicio[i];
    return !m || dscr < m.dscr ? { dscr, ano: i + 1 } : m;
  }, null);

export function calcularRentabilidad(
  s: Supuestos, estructura: Estructura, capexBase: number, mwdc: number, calendario: PagoMensual[] = calendarioUniforme(s.mesesConstruccion),
  calIva?: CalendarioIva | null,
): Rentabilidad {
  const v = variantePorEstructura(s, estructura, capexBase, mwdc);
  const ops50 = operaciones(s, v, 1);
  const ops90 = operaciones(s, v, pct(s.p90Pct));
  const rep = reemplazoInversores(s, mwdc);
  const dep = sumarAnos(depreciacionPorAno(s, v.capex), rep?.depreciacion);
  const reservas = rep?.reservas ?? [];
  const d = dimensionarDeuda(s, v.capex, ops50, ops90, dep, calendario, reservas);

  const c50 = caja(s, ops50, dep, d.deuda, d.servicio, d.plazoAnos, reservas);
  const c90 = caja(s, ops90, dep, d.deuda, d.servicio, d.plazoAnos, reservas);
  const sinDeuda = caja(s, ops50, dep, 0, [], 0);
  const minP50 = minimoDscr(c50.cfads, d.servicio);
  const minP90 = minimoDscr(c90.cfads, d.servicio);

  const nConstruccion = Math.max(1, Math.ceil(s.mesesConstruccion / 12));
  const flujoProyecto: number[] = Array(nConstruccion).fill(-v.capex / nConstruccion);
  const flujoEquity: number[] = Array(nConstruccion).fill(-d.equity / nConstruccion);
  const anos: AnoOperacion[] = ops50.map((o, i) => {
    const servicio = d.servicio[i] ?? 0;
    // El proyecto paga el reemplazo de inversores en su año (la reserva MMRA es del financiamiento)
    const fp = o.ebitda - sinDeuda.isr[i] - (rep?.capex[i] ?? 0);
    const fe = c50.cfads[i] - servicio + (i + 1 === d.plazoAnos ? d.usos.dsra : 0);
    flujoProyecto.push(fp);
    flujoEquity.push(fe);
    return {
      ano: i + 1, energiaMwh: o.energiaMwh, ingresos: o.ingresos, costos: o.costos, ebitda: o.ebitda,
      depreciacion: dep[i], intereses: c50.intereses[i], saldoDeuda: Math.max(0, c50.saldos[i]),
      isrSinDeuda: sinDeuda.isr[i], isrConDeuda: c50.isr[i], servicioDeuda: servicio, cfads: c50.cfads[i],
      dscr: servicio > 0 ? c50.cfads[i] / servicio : null, flujoProyecto: fp, flujoEquity: fe,
      ingresosPpa: o.ingresosPpa, ingresosMercado: o.ingresosMercado,
      opex: o.opex, seguros: o.seguros, arrendamiento: o.arrendamiento, omEstructura: o.omEstructura,
      energiaP90Mwh: ops90[i].energiaMwh, cfadsP90: c90.cfads[i], dscrP90: servicio > 0 ? c90.cfads[i] / servicio : null,
      saldoInicialDeuda: Math.max(0, i === 0 ? d.deuda : c50.saldos[i - 1]),
      amortizacion: servicio - c50.intereses[i],
      baseGravable: c50.baseGravable[i], perdidaGenerada: c50.perdidas[i].generada, perdidaUsada: c50.perdidas[i].usada,
      perdidaCaducada: c50.perdidas[i].caducada, perdidasPendientes: c50.perdidasPendientes[i],
    };
  });

  // IVA de construcción: sus flujos mensuales entran en la TIR con su fecha exacta (descuento (1 + TIR)^(meses/12)
  // desde el periodo 0), junto con los flujos anuales (periodo k en t = k). No cambian los flujos anuales, la deuda
  // senior, los usos, el DSCR ni el ISR. Con datos faltantes, TIR en N/D.
  const faltaIva = problemasIva(s);
  let iva: ResultadoIva | null = null;
  if (s.ivaActivo && faltaIva.length === 0) {
    iva = calcularIva(s, v.capex, calIva ?? calendarioIvaDesdeFracciones(calendario), s.mesesConstruccion);
  }
  const construccion = { proyecto: flujoProyecto.slice(0, nConstruccion), equity: flujoEquity.slice(0, nConstruccion) };
  const sinTir = s.ivaActivo && faltaIva.length > 0;
  const fechados = iva ? flujosFechadosIva(iva) : null;
  const anualesFechados = (flujos: number[]) => flujos.map((monto, t) => ({ t, monto }));

  // LCOE: VP de (CAPEX + costos de operación) / VP de la energía (P50)
  const r = pct(s.tasaDescuentoPct);
  const costos = [...Array(nConstruccion).fill(v.capex / nConstruccion), ...ops50.map((o) => o.costos)];
  const energia = [...Array(nConstruccion).fill(0), ...ops50.map((o) => o.energiaMwh)];
  const vpEnergia = valorPresente(energia, r);

  return {
    estructura,
    rendimientoKwhKwp: v.rendimientoKwhKwp,
    p50Mwh: v.p50Mwh,
    p90Mwh: v.p50Mwh * pct(s.p90Pct),
    capex: v.capex,
    usos: d.usos,
    equity: d.equity,
    deuda: d.deuda,
    deudaPct: d.usos.total > 0 ? d.deuda / d.usos.total : 0,
    criterioDeuda: d.criterio,
    capacidadDeuda: d.capacidad,
    deudaConvergio: d.convergio,
    plazoDeudaAnos: d.plazoAnos,
    ppaPlazoAnos: s.ppaPlazoAnos,
    saldoFinalDeuda: d.plazoAnos > 0 ? c50.saldos[d.plazoAnos - 1] : 0,
    tirProyecto: sinTir ? null : fechados ? tirFechada([...anualesFechados(flujoProyecto), ...fechados.proyecto]) : tir(flujoProyecto),
    tirEquity: sinTir ? null : fechados ? tirFechada([...anualesFechados(flujoEquity), ...fechados.equity]) : tir(flujoEquity),
    dscrMinP50: minP50?.dscr ?? null,
    anoDscrMinP50: minP50?.ano ?? null,
    dscrMinP90: minP90?.dscr ?? null,
    anoDscrMinP90: minP90?.ano ?? null,
    lcoe: vpEnergia > 0 ? valorPresente(costos, r) / vpEnergia : null,
    isrConDeuda: { inicio: c50.inicioIsr, perdidaCaducada: c50.perdidaCaducada },
    isrSinDeuda: { inicio: sinDeuda.inicioIsr, perdidaCaducada: sinDeuda.perdidaCaducada },
    anos,
    construccion,
    iva,
    problemasIva: s.ivaActivo ? faltaIva : [],
  };
}

export function compararEstructuras(s: Supuestos, capexBase: number, mwdc: number, calendario?: PagoMensual[], calIva?: CalendarioIva | null): Rentabilidad[] {
  return (Object.keys(ESTRUCTURAS) as Estructura[]).map((e) => calcularRentabilidad(s, e, capexBase, mwdc, calendario, calIva));
}

export interface ComparacionDepreciacion {
  esquema: EsquemaDepreciacion | 'categorias';
  descripcion: string;
  rentabilidad: Rentabilidad;
}

// ---------------------------------------------------------------------------
// Sensibilidad: precio del PPA × CAPEX
// ---------------------------------------------------------------------------

export const PRECIOS_PPA_SENSIBILIDAD = [38, 42, 46, 50, 54];
export const CAPEX_WDC_SENSIBILIDAD = [0.65, 0.7, 0.74, 0.8];

export interface CeldaSensibilidad {
  tirEquity: number | null;
  deudaPct: number;
  criterioDeuda: CriterioDeuda;
}

export interface Sensibilidad {
  precios: number[];            // USD/MWh (filas)
  capexWdc: number[];           // USD/Wdc del CAPEX total de la estructura seleccionada (columnas)
  celdas: CeldaSensibilidad[][]; // [fila][columna]
  filaActual: number;
  columnaActual: number;
}

/**
 * Inserta el valor actual en la serie: si hay uno a menos de `tolerancia`, lo reemplaza (para que la celda
 * resaltada coincida con el tablero); si no, lo agrega en orden.
 */
function conValorActual(serie: number[], actual: number, tolerancia: number): { valores: number[]; indice: number } {
  const cercano = serie.findIndex((v) => Math.abs(v - actual) < tolerancia);
  const valores = cercano >= 0 ? serie.map((v, i) => (i === cercano ? actual : v)) : [...serie, actual].sort((a, b) => a - b);
  return { valores, indice: valores.indexOf(actual) };
}

/**
 * TIR de equity y % de deuda con la deuda vuelta a dimensionar en cada combinación de precio del PPA y CAPEX
 * (USD/Wdc de la estructura indicada). La combinación actual del proyecto siempre aparece en la tabla.
 */
export function calcularSensibilidad(
  s: Supuestos, estructura: Estructura, capexBase: number, mwdc: number, calendario?: PagoMensual[],
  precios = PRECIOS_PPA_SENSIBILIDAD, capexWdc = CAPEX_WDC_SENSIBILIDAD, calIva?: CalendarioIva | null,
): Sensibilidad {
  const w = mwdc * 1e6;
  // Diferencia de CAPEX de la estructura indicada frente a la base (sobrecostos de seguidores)
  const delta = variantePorEstructura(s, estructura, 0, mwdc).capex;
  const capexActual = (capexBase + delta) / w;
  const filas = conValorActual(precios, s.ppaPrecio, 1e-9);
  const columnas = conValorActual(capexWdc, capexActual, 0.01);
  const celdas = filas.valores.map((ppaPrecio) => columnas.valores.map((c) => {
    const r = calcularRentabilidad({ ...s, ppaPrecio }, estructura, c * w - delta, mwdc, calendario, calIva);
    return { tirEquity: r.tirEquity, deudaPct: r.deudaPct, criterioDeuda: r.criterioDeuda };
  }));
  return { precios: filas.valores, capexWdc: columnas.valores, celdas, filaActual: filas.indice, columnaActual: columnas.indice };
}

// ---------------------------------------------------------------------------
// Precio mínimo de PPA para una TIR de equity objetivo
// ---------------------------------------------------------------------------

/** Precio de PPA más alto que se busca (USD/MWh); si ni así se alcanza el objetivo, no hay precio mínimo. */
export const PRECIO_PPA_MAXIMO_BUSQUEDA = 300;

export interface PrecioMinimoPpa {
  tirObjetivo: number;                  // fracción (0.12 = 12 %)
  /** USD/MWh redondeado al centavo hacia arriba; null si no se alcanza dentro de la búsqueda. */
  precio: number | null;
  /** Resultado completo con ese precio (deuda redimensionada). */
  rentabilidad: Rentabilidad | null;
}

/**
 * Busca por bisección el precio del PPA con el que la TIR de equity alcanza el objetivo, con la deuda
 * redimensionada en cada iteración y el resto de los supuestos sin cambio.
 */
export function precioMinimoPpa(
  s: Supuestos, estructura: Estructura, capexBase: number, mwdc: number, tirObjetivo = s.tirEquityObjetivoPct != null ? pct(s.tirEquityObjetivoPct) : NaN,
  calendario?: PagoMensual[], calIva?: CalendarioIva | null,
): PrecioMinimoPpa {
  if (!Number.isFinite(tirObjetivo)) throw new Error('precioMinimoPpa necesita una TIR objetivo capturada');
  const con = (ppaPrecio: number) => calcularRentabilidad({ ...s, ppaPrecio }, estructura, capexBase, mwdc, calendario, calIva);
  const alcanza = (r: Rentabilidad) => r.tirEquity != null && r.tirEquity >= tirObjetivo;
  // Cota superior creciendo en pasos de 25 %: con precios muy altos la TIR pasaría del 100 % y tir() no la
  // encuentra (null), así que se detiene en el primer precio que alcanza el objetivo
  let lo = 0, hi = 5;
  if (alcanza(con(lo))) hi = lo;
  while (hi > 0 && !alcanza(con(hi))) {
    if (hi >= PRECIO_PPA_MAXIMO_BUSQUEDA) return { tirObjetivo, precio: null, rentabilidad: null };
    lo = hi;
    hi = Math.min(hi * 1.25, PRECIO_PPA_MAXIMO_BUSQUEDA);
  }
  while (hi - lo > 0.001) {
    const mid = (lo + hi) / 2;
    if (alcanza(con(mid))) hi = mid; else lo = mid;
  }
  // Al centavo hacia arriba, comprobando que ese precio sí alcanza el objetivo
  let precio = Math.ceil(hi * 100 - 1e-9) / 100;
  let r = con(precio);
  if (!alcanza(r)) { precio = Math.round((precio + 0.01) * 100) / 100; r = con(precio); }
  return { tirObjetivo, precio, rentabilidad: r };
}

/** Los dos esquemas de depreciación con la misma estructura: 100 % en el año 1 frente a la tasa anual. */
export function compararDepreciacion(s: Supuestos, estructura: Estructura, capexBase: number, mwdc: number, calendario?: PagoMensual[], calIva?: CalendarioIva | null): ComparacionDepreciacion[] {
  // Los dos esquemas simples (sin categorías) y, si está activa y completa, la depreciación por categorías
  const simple = { ...s, depreciacionPorCategorias: false };
  return [
    { esquema: 'ano1', descripcion: '100 % en el año 1', rentabilidad: calcularRentabilidad({ ...simple, depreciacionEsquema: 'ano1', depreciacionAno1Pct: 100 }, estructura, capexBase, mwdc, calendario, calIva) },
    { esquema: 'anual', descripcion: `${s.depreciacionTasaAnualPct} % anual`, rentabilidad: calcularRentabilidad({ ...simple, depreciacionEsquema: 'anual' }, estructura, capexBase, mwdc, calendario, calIva) },
    ...(s.depreciacionPorCategorias && problemasDepreciacion(s).length === 0
      ? [{ esquema: 'categorias' as const, descripcion: 'Por categorías de activo', rentabilidad: calcularRentabilidad(s, estructura, capexBase, mwdc, calendario, calIva) }]
      : []),
  ];
}
