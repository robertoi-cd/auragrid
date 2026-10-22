// Escenarios de estrés y métricas bancarias (Nivel bancario, bloque A).
// Convención: la deuda queda FIJA (la dimensionada en el caso base: mismo monto, mismo calendario de amortización y la
// misma DSRA); cada escenario cambia la operación y se recalculan el ISR, el CFADS, el DSCR y las TIR.
// - CAPEX +10 %: el sobrecosto lo pone el equity y también se deprecia.
// - Tasa +100 pb: la misma deuda, sin cobertura y con el mismo calendario de amortización (sube el interés).
// - P90 año 1: solo el primer año de operación con P90; P90 todos los años: toda la vida útil.
// - OPEX +10 %: OPEX, seguros y arrendamiento. Mercado −20 %: precio de mercado (los CELs no cambian).
// - COD +6 meses: el calendario del servicio de la deuda queda fijo en fechas; la operación (y el PPA, que empieza en
//   la COD) se recorre medio año, con 30 años de vida desde la COD real. El año 1 tiene medio año de operación y el
//   servicio completo: el faltante se paga con la DSRA (hasta su saldo), que se repone con el flujo de los años
//   siguientes antes de distribuir al equity. Los 6 meses de intereses adicionales de construcción (sobre la deuda
//   dispuesta, a la tasa de los créditos) los pone el equity; la penalización del EPC, si se captura, entra al año 1.
// Métricas: DSCR mínimo (y su año), DSCR promedio, LLCR = VP del CFADS en el plazo de la deuda a la tasa de la deuda del
// escenario ÷ deuda al inicio del año 1, PLCR = lo mismo en toda la vida útil, TIR de equity y de proyecto y los años con
// DSCR bajo el covenant. Puntos de quiebre: caída de los ingresos hasta que el DSCR mínimo llega al covenant y a 1.0x.
// Con reemplazo de inversores capturado, todos los escenarios apartan la reserva MMRA del CFADS y lo deprecian.
import {
  caja, operaciones, variantePorEstructura, depreciacionPorAno, reemplazoInversores, tir, tirFechada,
  type Supuestos, type Rentabilidad, type Operacion,
} from './rentabilidad';
import { flujosFechadosIva } from './iva';

export type ClaveEscenario = 'base' | 'p90Ano1' | 'p90' | 'capex10' | 'opex10' | 'tasa100' | 'mercado20' | 'p90Opex10' | 'cod6';
export const ESCENARIOS: [ClaveEscenario, string][] = [
  ['base', 'Caso base (P50)'],
  ['p90Ano1', 'P90 solo el año 1'],
  ['p90', 'P90 todos los años'],
  ['capex10', 'CAPEX +10 %'],
  ['opex10', 'OPEX +10 %'],
  ['tasa100', 'Tasa +100 pb'],
  ['mercado20', 'Precio de mercado −20 %'],
  ['p90Opex10', 'P90 todos los años + OPEX +10 %'],
  ['cod6', 'COD +6 meses'],
];
/** Los escenarios usan la TIR de flujo disponible (los estados financieros muestran dividendos y devolución de capital). */
export const NOTA_TIR_ESCENARIOS = 'Los escenarios usan el flujo disponible; ver Estados financieros para el efecto de dividendos y devolución de capital.';
export const NOTA_CONVENCION_ESCENARIOS = 'Deuda fija (la dimensionada en el caso base: mismo monto, calendario de amortización y DSRA); ISR recalculado en cada escenario. CAPEX +10 %: el sobrecosto lo pone el equity y se deprecia. Tasa +100 pb: la misma deuda sin cobertura, con el mismo calendario de amortización. LLCR y PLCR: VP del CFADS a la tasa de la deuda ÷ deuda al inicio del año 1.';
export const NOTA_COD6 = 'COD +6 meses: el calendario del servicio de la deuda queda fijo en fechas y el PPA empieza en la COD; el faltante del año 1 se paga con la DSRA, que se repone antes de distribuir al equity. El retraso puede generar penalizaciones al comprador del PPA o la terminación si se pasa la fecha límite de inicio; no modelado.';

export interface DetalleCod6 {
  cfadsAno1: number;
  servicioAno1: number;
  dscrAno1: number | null;
  /** Servicio del año 1 que el CFADS no cubre. */
  faltante: number;
  /** Saldo de la DSRA antes del retraso (la del caso base). */
  dsra: number;
  /** Lo que se toma de la DSRA (hasta su saldo). */
  usoDsra: number;
  /** ¿La DSRA cubre todo el faltante? Si no: incumplimiento de pago en el año 1. */
  alcanza: boolean;
  /** Año de operación en que la DSRA vuelve a su saldo (null si no se usó o no se repone en el plazo). */
  anoRepuesta: number | null;
  /** 6 meses de intereses adicionales de construcción sobre la deuda dispuesta (los pone el equity). */
  interesesAdicionales: number;
  /** Penalización del EPC (USD/día × 182.5 días, hasta el tope); 0 si no se capturó. */
  penalizacionEpc: number;
}

export interface MetricasEscenario {
  clave: ClaveEscenario;
  nombre: string;
  dscrMin: number | null;
  anoDscrMin: number | null;
  dscrPromedio: number | null;
  llcr: number | null;
  plcr: number | null;
  tirEquity: number | null;
  tirProyecto: number | null;
  /** Años de operación con DSCR por debajo del covenant. */
  anosBajoCovenant: number[];
  /** DSCR de cada año del plazo (null fuera del plazo). */
  dscr: (number | null)[];
  /** Solo COD +6 meses. */
  cod6?: DetalleCod6;
}

export interface PuntosQuiebre {
  /** Caída de los ingresos (fracción) con la que el DSCR mínimo llega al covenant; null si no se alcanza. */
  hastaCovenant: number | null;
  /** Caída de los ingresos (fracción) con la que el DSCR mínimo llega a 1.0x. */
  hastaUno: number | null;
}

/** Operación con los ingresos multiplicados por un factor (los costos no cambian). */
const conIngresos = (ops: Operacion[], factor: number): Operacion[] => ops.map((o) => ({
  ...o, ingresos: o.ingresos * factor, ingresosPpa: o.ingresosPpa * factor, ingresosMercado: o.ingresosMercado * factor,
  ebitda: o.ingresos * factor - o.costos,
}));

interface Contexto { s: Supuestos; base: Rentabilidad; capexBase: number; mwdc: number }

/** Depreciación (con la del reemplazo de inversores), reservas MMRA e inversión del reemplazo por año de operación. */
function conReemplazo(s: Supuestos, capex: number, mwdc: number) {
  const rep = reemplazoInversores(s, mwdc);
  const dep = depreciacionPorAno(s, capex);
  return {
    dep: rep ? dep.map((x, i) => x + rep.depreciacion[i]) : dep,
    reservas: rep?.reservas ?? [],
    capexReemplazo: rep?.capex ?? [],
  };
}

/** Métricas de un escenario a partir de su CFADS, servicio y flujos (comunes a todos los escenarios). */
function metricas(ctx: Contexto, clave: ClaveEscenario, nombre: string, cfads: number[], servicio: number[], r: number,
  flujoProyecto: number[], flujoEquity: number[]): MetricasEscenario {
  const { base } = ctx;
  const dscr = cfads.map((cf, i) => (servicio[i] > 0 ? cf / servicio[i] : null));
  const enPlazo = dscr.flatMap((x, i) => (x == null ? [] : [{ x, ano: i + 1 }]));
  const minimo = enPlazo.reduce<{ x: number; ano: number } | null>((m, d) => (!m || d.x < m.x ? d : m), null);
  const vp = (hasta: number) => cfads.slice(0, hasta).reduce((s, cf, i) => s + cf / (1 + r) ** (i + 1), 0);
  const fechados = base.iva ? flujosFechadosIva(base.iva) : null;
  const anuales = (f: number[]) => f.map((monto, t) => ({ t, monto }));
  return {
    clave, nombre,
    dscrMin: minimo?.x ?? null,
    anoDscrMin: minimo?.ano ?? null,
    dscrPromedio: enPlazo.length ? enPlazo.reduce((s, d) => s + d.x, 0) / enPlazo.length : null,
    llcr: base.deuda > 0 ? vp(base.plazoDeudaAnos) / base.deuda : null,
    plcr: base.deuda > 0 ? vp(cfads.length) / base.deuda : null,
    tirEquity: fechados ? tirFechada([...anuales(flujoEquity), ...fechados.equity]) : tir(flujoEquity),
    tirProyecto: fechados ? tirFechada([...anuales(flujoProyecto), ...fechados.proyecto]) : tir(flujoProyecto),
    anosBajoCovenant: enPlazo.filter((d) => d.x < ctx.s.dscrCovenant).map((d) => d.ano),
    dscr,
  };
}

/** Evalúa un escenario con la deuda fija del caso base. */
function evaluar(ctx: Contexto, clave: ClaveEscenario, nombre: string, e: { s: Supuestos; ops: Operacion[]; capexFactor?: number; tasaPct?: number }): MetricasEscenario {
  const { base } = ctx;
  const plazo = base.plazoDeudaAnos;
  const tasaPct = e.tasaPct ?? ctx.s.tasaInteresPct;
  const r = tasaPct / 100;
  const capex = base.capex * (e.capexFactor ?? 1);
  const { dep, reservas, capexReemplazo } = conReemplazo(e.s, capex, ctx.mwdc);
  // Mismo calendario de amortización; con otra tasa, el interés cambia sobre el mismo saldo
  const servicio = base.anos.map((a, i) => (i >= plazo ? 0 : tasaPct === ctx.s.tasaInteresPct ? a.servicioDeuda : a.amortizacion + a.saldoInicialDeuda * r));
  const c = caja({ ...e.s, tasaInteresPct: tasaPct }, e.ops, dep, base.deuda, servicio, plazo, reservas);
  const sinDeuda = caja(e.s, e.ops, dep, 0, [], 0);
  // Flujos para las TIR: construcción (CAPEX y equity, con el sobrecosto a cargo del equity) y operación
  const nConstruccion = Math.max(1, Math.ceil(ctx.s.mesesConstruccion / 12));
  const equityConstruccion = base.equity + (capex - base.capex);
  const flujoProyecto = [...Array(nConstruccion).fill(-capex / nConstruccion), ...e.ops.map((o, i) => o.ebitda - sinDeuda.isr[i] - (capexReemplazo[i] ?? 0))];
  const flujoEquity = [...Array(nConstruccion).fill(-equityConstruccion / nConstruccion),
    ...e.ops.map((_, i) => c.cfads[i] - servicio[i] + (i + 1 === plazo ? base.usos.dsra : 0))];
  return metricas(ctx, clave, nombre, c.cfads, servicio, r, flujoProyecto, flujoEquity);
}

/** Mezcla medio año de un año de operación de la planta con medio del siguiente (la operación recorrida 6 meses). */
function recorrerMedioAno<T extends Record<string, number>>(planta: T[]): T[] {
  const claves = Object.keys(planta[0] ?? {}) as (keyof T)[];
  return Array.from({ length: planta.length + 1 }, (_, j) => Object.fromEntries(claves.map((k) => [k,
    0.5 * (j > 0 ? Number(planta[j - 1][k]) : 0) + 0.5 * (j < planta.length ? Number(planta[j][k]) : 0)])) as T);
}

/**
 * COD +6 meses: servicio fijo en fechas; operación, PPA, reservas e inversión del reemplazo recorridos medio año (30
 * años desde la COD real, así que hay un año 31 con medio año); DSRA que cubre el faltante y se repone antes del equity.
 */
function evaluarCod6(ctx: Contexto, ops50: Operacion[]): MetricasEscenario {
  const { base, s } = ctx;
  const plazo = base.plazoDeudaAnos;
  const r = s.tasaInteresPct / 100;
  const { dep, reservas, capexReemplazo } = conReemplazo(s, base.capex, ctx.mwdc);
  const n = ops50.length;
  // Calendario de 31 años: mitades de la operación de la planta
  const opsCal = recorrerMedioAno(ops50 as unknown as Record<string, number>[]) as unknown as Operacion[];
  const reservasCal = recorrerMedioAno(Array.from({ length: n }, (_, i) => ({ x: reservas[i] ?? 0 }))).map((o) => o.x);
  const capexCal = recorrerMedioAno(Array.from({ length: n }, (_, i) => ({ x: capexReemplazo[i] ?? 0 }))).map((o) => o.x);
  const depCal = [...dep, 0];
  const servicio = [...base.anos.map((a, i) => (i >= plazo ? 0 : a.servicioDeuda)), 0];
  const c = caja(s, opsCal, depCal, base.deuda, servicio, plazo, reservasCal);
  const sinDeuda = caja(s, opsCal, depCal, 0, [], 0);

  // Penalización del EPC: solo con USD/día y tope capturados (182.5 días de retraso)
  const penalizacionEpc = s.epcPenalizacionUsdDia != null && s.epcPenalizacionTopeUsd != null
    ? Math.min(s.epcPenalizacionUsdDia * 182.5, s.epcPenalizacionTopeUsd) : 0;
  const interesesAdicionales = base.deuda * r * 0.5;

  // DSRA: cubre el faltante (hasta su saldo) y se repone con el flujo de los años siguientes antes del equity
  const dsra = base.usos.dsra;
  let saldo = dsra, usoAno1 = 0, faltanteNoCubierto = 0, anoRepuesta: number | null = null, usada = false;
  const aEquity = c.cfads.map((cf, i) => {
    const ano = i + 1;
    if (ano > plazo) return cf;
    const neto = cf - servicio[i] + (ano === 1 ? penalizacionEpc : 0);
    let alEquity: number;
    if (neto < 0) {
      const uso = Math.min(-neto, saldo);
      saldo -= uso; usada = true;
      if (ano === 1) usoAno1 = uso;
      faltanteNoCubierto += -neto - uso;
      alEquity = 0;
    } else {
      const reposicion = Math.min(neto, dsra - saldo);
      saldo += reposicion;
      if (usada && anoRepuesta == null && saldo >= dsra - 0.005) anoRepuesta = ano;
      alEquity = neto - reposicion;
    }
    // Al final del plazo se libera lo que quede en la DSRA
    return alEquity + (ano === plazo ? saldo : 0);
  });

  const nConstruccion = Math.max(1, Math.ceil(s.mesesConstruccion / 12));
  const construccionEquity = Array(nConstruccion).fill(-base.equity / nConstruccion);
  construccionEquity[nConstruccion - 1] -= interesesAdicionales;
  const flujoProyecto = [...Array(nConstruccion).fill(-base.capex / nConstruccion),
    ...opsCal.map((o, i) => o.ebitda - sinDeuda.isr[i] - capexCal[i] + (i === 0 ? penalizacionEpc : 0))];
  const flujoEquity = [...construccionEquity, ...aEquity];
  const m = metricas(ctx, 'cod6', 'COD +6 meses', c.cfads, servicio, r, flujoProyecto, flujoEquity);
  const faltante = Math.max(0, servicio[0] - c.cfads[0] - penalizacionEpc);
  return {
    ...m,
    cod6: {
      cfadsAno1: c.cfads[0], servicioAno1: servicio[0], dscrAno1: m.dscr[0], faltante, dsra, usoDsra: usoAno1,
      alcanza: faltanteNoCubierto <= 0.005, anoRepuesta, interesesAdicionales, penalizacionEpc,
    },
  };
}

/** Supuestos con OPEX, seguros y arrendamiento +10 %. */
const conOpex = (s: Supuestos, factor: number): Supuestos => ({ ...s, opexAnual: s.opexAnual * factor, segurosAnual: s.segurosAnual * factor, arrendamientoAnual: s.arrendamientoAnual * factor });

/**
 * Los escenarios con la deuda fija del caso base. s: los supuestos con que se calculó base (con la tasa ponderada de
 * los créditos); base: la rentabilidad de la estructura seleccionada.
 */
export function calcularEscenarios(s: Supuestos, base: Rentabilidad, capexBase: number, mwdc: number): MetricasEscenario[] {
  const ctx: Contexto = { s, base, capexBase, mwdc };
  const v = variantePorEstructura(s, base.estructura, capexBase, mwdc);
  const p90 = s.p90Pct / 100;
  const ops50 = operaciones(s, v, 1);
  const ops90 = operaciones(s, v, p90);
  const sOpex = conOpex(s, 1.1);
  const sMercado = { ...s, mercadoPrecio: s.mercadoPrecio * 0.8 };
  const definicion: Record<Exclude<ClaveEscenario, 'cod6'>, { s: Supuestos; ops: Operacion[]; capexFactor?: number; tasaPct?: number }> = {
    base: { s, ops: ops50 },
    p90Ano1: { s, ops: [ops90[0], ...ops50.slice(1)] },
    p90: { s, ops: ops90 },
    capex10: { s, ops: ops50, capexFactor: 1.1 },
    opex10: { s: sOpex, ops: operaciones(sOpex, v, 1) },
    tasa100: { s, ops: ops50, tasaPct: s.tasaInteresPct + 1 },
    mercado20: { s: sMercado, ops: operaciones(sMercado, v, 1) },
    p90Opex10: { s: sOpex, ops: operaciones(sOpex, v, p90) },
  };
  return ESCENARIOS.map(([clave, nombre]) => (clave === 'cod6' ? evaluarCod6(ctx, ops50) : evaluar(ctx, clave, nombre, definicion[clave])));
}

/**
 * Caída de los ingresos (todos: PPA, mercado y CELs) hasta que el DSCR mínimo del caso P50 llega al covenant y a 1.0x,
 * con la deuda fija y el ISR recalculado. Bisección sobre la caída (0 a 100 %).
 */
export function puntosDeQuiebre(s: Supuestos, base: Rentabilidad, capexBase: number, mwdc: number): PuntosQuiebre {
  const ctx: Contexto = { s, base, capexBase, mwdc };
  const v = variantePorEstructura(s, base.estructura, capexBase, mwdc);
  const ops50 = operaciones(s, v, 1);
  const dscrMin = (caida: number) => evaluar(ctx, 'base', '', { s, ops: conIngresos(ops50, 1 - caida) }).dscrMin ?? 0;
  const caidaHasta = (objetivo: number): number | null => {
    if (dscrMin(0) <= objetivo) return 0;
    if (dscrMin(1) > objetivo) return null;
    let lo = 0, hi = 1;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (dscrMin(mid) > objetivo) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  return { hastaCovenant: caidaHasta(s.dscrCovenant), hastaUno: caidaHasta(1) };
}

/**
 * Año con DSCR bajo el covenant cuyo pago cubre la DSRA (COD +6 meses): el pago se hace, pero el covenant se incumple.
 * Con DSCR de lock-up capturado y por debajo, además no hay distribuciones al equity ese año.
 */
export function mensajeCovenantDsra(dscr: number, covenant: number, lockup: number | null | undefined): string {
  return `DSCR ${dscr.toFixed(2)}x, bajo el covenant (${covenant.toFixed(2)}x). El pago se cubre con la DSRA, pero el incumplimiento del covenant requiere una dispensa (waiver) del banco.`
    + (lockup != null && dscr < lockup ? ' Lock-up: sin distribuciones al equity ese año.' : '');
}

/** Años bajo el covenant: cuántos y cuáles ("1 (año 1)", "2 (años 1 y 3)"), o "Ninguno" (app y Excel). */
export function anosBajoCovenant(anos: number[]): string {
  if (anos.length === 0) return 'Ninguno';
  const lista = anos.length === 1 ? `año ${anos[0]}` : `años ${anos.slice(0, -1).join(', ')} y ${anos.at(-1)}`;
  return `${anos.length} (${lista})`;
}
