// IVA de construcción v1 (motor). Supuesto simplificado; validar con asesor fiscal.
// - IVA = monto de cada pago de obra y equipos × % del CAPEX sujeto a IVA × tasa (no aplica a costos financieros).
// - Equipo de importación directa: el IVA se causa en la importación; en v1 se fecha en el hito de entrega del equipo
//   (aproximación). Compra local: en cada pago de equipos, incluido el anticipo.
// - Convención dentro del mes: los pagos al inicio y las devoluciones al final. El pico se mide al inicio del mes
//   (después de pagar y antes de recuperar); también se reporta el saldo neto de fin de mes.
// - Recuperación (devolución del SAT): N meses después del mes en que se causa.
// - Financiamiento: equity, o una línea de IVA (monto máximo y tasa obligatorios; comisión opcional). Los intereses
//   se pagan cada mes con equity (no se capitalizan); el IVA que no cubre la línea lo pone el equity.
// - Fuera de alcance: IVA de operación y aduanas. Los intereses y la comisión de la línea no se deducen del ISR.
import type { Supuestos } from './rentabilidad';

export type OrigenEquipo = 'importacion' | 'local';
export type FinanciamientoIva = 'equity' | 'linea';

export const ORIGENES_EQUIPO: Record<OrigenEquipo, string> = { importacion: 'Importación directa', local: 'Compra local' };
export const FINANCIAMIENTOS_IVA: Record<FinanciamientoIva, string> = { equity: 'Equity', linea: 'Línea de crédito IVA' };

export const NOTA_IVA = 'Supuesto simplificado; validar con asesor fiscal.';
export const LIMITACION_IVA_IMPORTACION = 'IVA del equipo importado fechado en el hito de entrega como aproximación a la fecha de importación; la fecha real del pedimento puede adelantar o atrasar el requerimiento de IVA.';
export const LIMITACION_IVA_INTERESES = 'Los intereses y la comisión de la línea de IVA no se deducen del ISR en esta versión.';
export const FALTA_PLAZO_IVA = 'Falta plazo de recuperación de IVA.';
export const FALTA_SUJETO_IVA = 'Falta % del CAPEX sujeto a IVA.';
export const FALTA_ORIGEN_IVA = 'Falta el origen del equipo (importación directa o compra local).';
export const FALTA_FINANCIAMIENTO_IVA = 'Falta la forma de financiamiento del IVA (equity o línea de crédito IVA).';
/** La tasa de IVA es un dato de ley, no un supuesto: viene prellenada con su fuente. */
export const FUENTE_TASA_IVA = 'LIVA art. 1';
export const NOTA_TASA_IVA = 'En la región fronteriza norte puede aplicar 8 % en ciertas operaciones; confirmar con asesor fiscal.';
/** Nota de la tasa de la línea IVA: el modelo está en USD y no considera tipo de cambio. */
export const NOTA_TASA_LINEA_IVA = 'La línea IVA suele ser en pesos (TIIE + margen); el modelo está en USD y no considera tipo de cambio.';

/**
 * Costo financiero del IVA (analizarProyecto): valor presente al NTP de los flujos de IVA a cargo del equity, a la TIR
 * objetivo de equity si está capturada y, si no, a la TIR de equity sin IVA (baseDescuento dice cuál se usó). El
 * impacto en las TIR (pp) es contra el mismo proyecto sin IVA.
 */
export interface CostoIva {
  valorPresenteNtp: number | null;
  tasaDescuento: number | null;
  baseDescuento: 'objetivo' | 'sinIva';
  tirEquitySinIva: number | null;
  tirProyectoSinIva: number | null;
  impactoTirEquity: number | null;
  impactoTirProyecto: number | null;
  nominalLinea: number | null;
}

/** Qué tasa se usó para el costo financiero del IVA (la misma frase en la app y en el Excel). */
export function textoDescuentoCostoIva(c: Pick<CostoIva, 'tasaDescuento' | 'baseDescuento'> | null): string {
  const tasa = c?.tasaDescuento != null ? `${(c.tasaDescuento * 100).toFixed(2)} %` : 'N/D';
  return c?.baseDescuento === 'objetivo'
    ? `Flujos de IVA a cargo del equity descontados a la TIR objetivo de equity (${tasa})`
    : `Flujos de IVA a cargo del equity descontados a la TIR de equity sin IVA (${tasa}; no hay TIR objetivo capturada)`;
}

/** Momento en que se causa el IVA de un pago: mes (índice desde el mes del NTP) y fracción del CAPEX de obra. */
export interface EventoIva { mesIndice: number; mes: string; fraccion: number; concepto: string }
export interface CalendarioIva {
  /** Mes 0 (AAAA-MM). */
  inicio: string;
  eventos: EventoIva[];
  /** Importación directa sin un pago de equipos de "entrega": el IVA del equipo se fecha en sus pagos (más pronto). */
  sinHitoEntrega: boolean;
}

export interface LineaMes { disposicion: number; repago: number; intereses: number; comision: number; saldoInicio: number; saldoFin: number }
export interface MesIva {
  mesIndice: number;
  mes: string;
  pagado: number;
  recuperado: number;
  /** Saldo por recuperar al inicio del mes, después de pagar (pico del mes). */
  saldoInicio: number;
  /** Saldo neto al final del mes, después de recuperar. */
  saldoFin: number;
  linea: LineaMes | null;
  /** IVA que pone el equity este mes (todo, con equity; lo que no cubre la línea, con línea). */
  ivaConEquity: number;
  /** Flujo al equity: negativo = aportación (IVA, intereses, comisión); positivo = devolución que le regresa. */
  flujoEquity: number;
  /** Flujo del proyecto antes de financiamiento: −IVA pagado + IVA recuperado. */
  flujoProyecto: number;
  /** Los mismos flujos separados por momento: inicio del mes (pagos, disposición, comisión) y fin (devoluciones, intereses). */
  flujoEquityInicio: number;
  flujoEquityFin: number;
  flujoProyectoInicio: number;
  flujoProyectoFin: number;
  /** Equity acumulado por IVA después de los flujos del inicio del mes (lo que el equity tiene comprometido). */
  equityAcumulado: number;
}

export interface ResultadoIva {
  total: number;
  pico: number;
  mesPico: string;
  /** Saldo neto de fin de mes del mes del pico. */
  saldoFinMesPico: number;
  /** Primer mes, después del pico, en que el saldo por recuperar llega a 0 (null si no llega en el horizonte). */
  mesSaldoCero: string | null;
  financiamiento: FinanciamientoIva;
  lineaMonto: number | null;
  /** El pico supera la línea de IVA: el excedente lo cubre el equity. */
  lineaInsuficiente: boolean;
  interesesLinea: number;
  comisionLinea: number;
  /**
   * Compromiso máximo de equity por IVA: el pico de la necesidad que cubre el equity (todo el IVA, con equity; con
   * línea, el IVA no cubierto más intereses y comisión, neto de las devoluciones que le regresan). Contra esta cifra
   * se comparan los fondos de equity comprometidos.
   */
  compromisoMaximoEquity: number;
  mesCompromisoMaximo: string | null;
  /** Mes de la COD (mes 0 + meses de construcción). */
  mesCod: string;
  /** IVA pendiente de recuperar en la COD (saldo al cierre del mes anterior a la COD). */
  ivaPendienteCod: number;
  /** Equity neto por IVA a la COD (lo aportado menos lo que le regresó hasta el cierre del mes anterior a la COD). */
  equityNetoCod: number;
  sinHitoEntrega: boolean;
  meses: MesIva[];
  notas: string[];
}

const capturado = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Qué falta para calcular el IVA (lista vacía = se puede, o el IVA está apagado). No se supone ningún valor. */
export function problemasIva(s: Partial<Supuestos>): string[] {
  if (!s.ivaActivo) return [];
  const p: string[] = [];
  if (!capturado(s.ivaTasaPct) || Number(s.ivaTasaPct) <= 0 || Number(s.ivaTasaPct) > 100) p.push('Falta la tasa de IVA (mayor a 0 y hasta 100 %).');
  if (!capturado(s.ivaCapexSujetoPct) || Number(s.ivaCapexSujetoPct) < 0 || Number(s.ivaCapexSujetoPct) > 100) p.push(FALTA_SUJETO_IVA);
  if (!capturado(s.ivaRecuperacionMeses) || Number(s.ivaRecuperacionMeses) < 0 || !Number.isInteger(Number(s.ivaRecuperacionMeses))) p.push(FALTA_PLAZO_IVA);
  if (s.ivaOrigenEquipo !== 'importacion' && s.ivaOrigenEquipo !== 'local') p.push(FALTA_ORIGEN_IVA);
  if (s.ivaFinanciamiento !== 'equity' && s.ivaFinanciamiento !== 'linea') p.push(FALTA_FINANCIAMIENTO_IVA);
  if (s.ivaFinanciamiento === 'linea') {
    if (!capturado(s.ivaLineaMonto) || Number(s.ivaLineaMonto) <= 0) p.push('Falta el monto de la línea de crédito IVA.');
    if (!capturado(s.ivaLineaTasaPct) || Number(s.ivaLineaTasaPct) < 0) p.push('Falta la tasa anual de la línea de crédito IVA.');
    if (!capturado(s.ivaLineaComisionPct) || Number(s.ivaLineaComisionPct) < 0) p.push('Falta la comisión de la línea de crédito IVA (0 % es válido).');
  }
  return p;
}

/** "AAAA-MM" + n meses. */
export function sumarMesesIva(mes: string, n: number): string {
  const [a, m] = mes.split('-').map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Calendario de respaldo sin fechas (sin cronograma): los meses del calendario de pagos del modelo. */
export function calendarioIvaDesdeFracciones(calendario: { mes: number; fraccion: number }[], inicio = '0000-01'): CalendarioIva {
  return {
    inicio,
    eventos: calendario.map((p) => ({ mesIndice: p.mes, mes: sumarMesesIva(inicio, p.mes), fraccion: p.fraccion, concepto: `Mes ${p.mes} de construcción` })),
    sinHitoEntrega: false,
  };
}

/**
 * IVA mes a mes. capex: CAPEX de la estructura evaluada (el IVA de cada pago es su fracción del CAPEX de obra).
 * mesesConstruccion: para separar el equity adicional de la construcción (años completos de construcción del modelo).
 */
export function calcularIva(s: Supuestos, capex: number, cal: CalendarioIva, mesesConstruccion: number): ResultadoIva {
  const problemas = problemasIva(s);
  if (problemas.length) throw new Error(problemas.join(' '));
  const factor = (Number(s.ivaCapexSujetoPct) / 100) * (Number(s.ivaTasaPct) / 100);
  const n = Number(s.ivaRecuperacionMeses);
  const conLinea = s.ivaFinanciamiento === 'linea';
  const limite = conLinea ? Number(s.ivaLineaMonto) : 0;
  const tasaMes = conLinea ? Number(s.ivaLineaTasaPct) / 100 / 12 : 0;
  const comisionPct = conLinea && capturado(s.ivaLineaComisionPct) ? Number(s.ivaLineaComisionPct) / 100 : 0;

  const pagadoPorMes = new Map<number, number>();
  for (const e of cal.eventos) pagadoPorMes.set(e.mesIndice, (pagadoPorMes.get(e.mesIndice) ?? 0) + e.fraccion * capex * factor);
  const indices = [...pagadoPorMes.keys()];
  const primero = indices.length ? Math.min(...indices) : 0;
  const ultimo = indices.length ? Math.max(...indices) + n : 0;
  const indiceCod = Math.max(0, Math.round(mesesConstruccion)); // mes 0 + meses de construcción

  const meses: MesIva[] = [];
  let saldo = 0, saldoLinea = 0, comisionCobrada = false;
  let total = 0, interesesLinea = 0, comisionLinea = 0;
  let pico = 0, mesPico = '', saldoFinMesPico = 0, indicePico = -1;
  let acumulado = 0, compromisoMaximo = 0, mesCompromisoMaximo: string | null = null;
  for (let m = primero; m <= ultimo; m++) {
    const pagado = pagadoPorMes.get(m) ?? 0;
    const recuperado = pagadoPorMes.get(m - n) ?? 0;
    total += pagado;
    // Inicio del mes: se paga el IVA (y se dispone de la línea)
    const saldoInicio = saldo + pagado;
    let linea: LineaMes | null = null;
    let ivaConEquity = pagado;
    let equityInicio = -pagado;
    let equityFin = recuperado;
    if (conLinea) {
      const lineaInicio = saldoLinea;
      const disposicion = Math.min(pagado, Math.max(0, limite - saldoLinea));
      saldoLinea += disposicion;
      ivaConEquity = pagado - disposicion;
      const comision = disposicion > 0 && !comisionCobrada ? limite * comisionPct : 0;
      if (disposicion > 0) comisionCobrada = true;
      const intereses = saldoLinea * tasaMes; // saldo del mes (después de disponer al inicio)
      // Final del mes: la devolución repaga primero la línea; el resto regresa al equity
      const repago = Math.min(recuperado, saldoLinea);
      saldoLinea -= repago;
      linea = { disposicion, repago, intereses, comision, saldoInicio: lineaInicio, saldoFin: saldoLinea };
      equityInicio = -ivaConEquity - comision;
      equityFin = -intereses + (recuperado - repago);
      interesesLinea += intereses;
      comisionLinea += comision;
    }
    saldo = saldoInicio - recuperado;
    if (Math.abs(saldo) < 1e-6) saldo = 0;
    const mes = sumarMesesIva(cal.inicio, m);
    if (saldoInicio > pico + 1e-9) { pico = saldoInicio; mesPico = mes; saldoFinMesPico = saldo; indicePico = m; }
    // Compromiso del equity: después de los flujos del inicio del mes (antes de las devoluciones del cierre)
    acumulado -= equityInicio;
    const equityAcumulado = acumulado;
    if (acumulado > compromisoMaximo + 1e-9) { compromisoMaximo = acumulado; mesCompromisoMaximo = mes; }
    acumulado -= equityFin;
    // Al cierre también puede crecer (intereses de la línea pagados con equity)
    if (acumulado > compromisoMaximo + 1e-9) { compromisoMaximo = acumulado; mesCompromisoMaximo = mes; }
    meses.push({
      mesIndice: m, mes, pagado, recuperado, saldoInicio, saldoFin: saldo, linea, ivaConEquity,
      flujoEquity: equityInicio + equityFin, flujoProyecto: -pagado + recuperado,
      flujoEquityInicio: equityInicio, flujoEquityFin: equityFin, flujoProyectoInicio: -pagado, flujoProyectoFin: recuperado,
      equityAcumulado,
    });
  }
  const mesSaldoCero = meses.find((x) => x.mesIndice >= indicePico && x.saldoFin === 0)?.mes ?? null;
  // En la COD: lo que queda al cierre del mes anterior
  const antesCod = meses.filter((x) => x.mesIndice < indiceCod);
  const ivaPendienteCod = antesCod.at(-1)?.saldoFin ?? 0;
  const equityNetoCod = -antesCod.reduce((a, x) => a + x.flujoEquity, 0);

  return {
    total, pico, mesPico, saldoFinMesPico, mesSaldoCero,
    financiamiento: conLinea ? 'linea' : 'equity', lineaMonto: conLinea ? limite : null,
    lineaInsuficiente: conLinea && pico > limite + 1e-6,
    interesesLinea, comisionLinea,
    compromisoMaximoEquity: compromisoMaximo, mesCompromisoMaximo, mesCod: sumarMesesIva(cal.inicio, indiceCod), ivaPendienteCod, equityNetoCod,
    sinHitoEntrega: cal.sinHitoEntrega,
    meses,
    notas: [
      NOTA_IVA,
      ...(s.ivaOrigenEquipo !== 'local' ? [LIMITACION_IVA_IMPORTACION] : []),
      ...(conLinea ? [LIMITACION_IVA_INTERESES] : []),
    ],
  };
}

/** Flujo con su momento en años desde el periodo 0 del modelo (mes 0 = NTP): t = meses / 12. */
export interface FlujoFechado { t: number; monto: number; mes: string; momento: 'inicio' | 'fin' }

/**
 * Flujos de IVA con su fecha exacta, para la TIR: los del inicio del mes m en t = m/12 y los del cierre en
 * t = (m + 1)/12. Se descuentan con (1 + TIR)^t junto con los flujos anuales del modelo (periodo k en t = k).
 */
export function flujosFechadosIva(iva: ResultadoIva): { proyecto: FlujoFechado[]; equity: FlujoFechado[] } {
  const proyecto: FlujoFechado[] = [];
  const equity: FlujoFechado[] = [];
  for (const m of iva.meses) {
    const ti = m.mesIndice / 12, tf = (m.mesIndice + 1) / 12;
    if (m.flujoProyectoInicio) proyecto.push({ t: ti, monto: m.flujoProyectoInicio, mes: m.mes, momento: 'inicio' });
    if (m.flujoProyectoFin) proyecto.push({ t: tf, monto: m.flujoProyectoFin, mes: m.mes, momento: 'fin' });
    if (m.flujoEquityInicio) equity.push({ t: ti, monto: m.flujoEquityInicio, mes: m.mes, momento: 'inicio' });
    if (m.flujoEquityFin) equity.push({ t: tf, monto: m.flujoEquityFin, mes: m.mes, momento: 'fin' });
  }
  return { proyecto, equity };
}

/** Último día del mes "AAAA-MM" (ISO). */
const finDeMes = (mes: string): string => {
  const [a, m] = mes.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/** Movimiento de caja del IVA (misma forma que los pagos y fondos del cronograma). */
export interface MovimientoIva { concepto: string; fecha: string; monto: number; estado: string; confirmado: boolean }

/**
 * Movimientos de caja del IVA para el hueco de caja, con la misma convención del motor: al inicio del mes el IVA
 * pagado, la disposición de la línea y su comisión; al cierre, la devolución, los intereses y el repago de la línea.
 * Salidas: IVA pagado, comisión, intereses y repago. Entradas: devolución del SAT y disposición de la línea. El IVA que
 * pone el equity no se agrega: solo cuentan las aportaciones de equity capturadas en el cronograma.
 */
export function movimientosIva(iva: ResultadoIva): { salidas: MovimientoIva[]; entradas: MovimientoIva[] } {
  const salidas: MovimientoIva[] = [];
  const entradas: MovimientoIva[] = [];
  const mov = (concepto: string, fecha: string, monto: number): MovimientoIva => ({ concepto, fecha, monto, estado: 'IVA de construcción', confirmado: true });
  for (const m of iva.meses) {
    const ini = `${m.mes}-01`, fin = finDeMes(m.mes);
    if (m.pagado > 0) salidas.push(mov('IVA pagado', ini, m.pagado));
    if (m.recuperado > 0) entradas.push(mov('Devolución de IVA', fin, m.recuperado));
    if (m.linea) {
      if (m.linea.disposicion > 0) entradas.push(mov('Disposición de la línea de IVA', ini, m.linea.disposicion));
      if (m.linea.comision > 0) salidas.push(mov('Comisión de la línea de IVA', ini, m.linea.comision));
      if (m.linea.intereses > 0) salidas.push(mov('Intereses de la línea de IVA', fin, m.linea.intereses));
      if (m.linea.repago > 0) salidas.push(mov('Repago de la línea de IVA', fin, m.linea.repago));
    }
  }
  return { salidas, entradas };
}
