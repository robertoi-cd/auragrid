// Modelo financiero de demostración: fuentes, usos y cronograma de caja (el de ejemplo: NTP 15 abr 2027, COD 15 abr 2028).
// Con supuestos, equity y deuda salen del dimensionamiento esculpido (rentabilidad.ts) y los usos incluyen
// intereses durante la construcción, comisión y DSRA. Sin supuestos: equity 30 % y deuda 70 % del CAPEX.
// Caso base Alpha I sin supuestos: CAPEX USD 46,500,000 = equity 13,950,000 + deuda 32,550,000 (tramo 1 20,000,000 + tramo 2).
// Otros proyectos escalan el caso base en proporción a su CAPEX.

import { aNumero } from './formato';
import { calendarioUniforme, RELACION_DC_AC, type PagoMensual } from './rentabilidad';
import type { CalendarioIva, OrigenEquipo } from './iva';
import type { Frente, FechasClave } from './validaciones';
import { codigoEntregable, CODIGO_TRAMO_2 } from './codigosEntregables';
import { repartirDesembolsos, type Credito } from './creditos';

// Días entre dos fechas ISO (sin zona horaria). Local para no importar validaciones (que importa este módulo).
const diasEntre = (desde: string, hasta: string) => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

export interface Movimiento {
  /** id en project_cash_movements (solo movimientos capturados por el usuario). */
  id?: string;
  tipo?: 'pago' | 'fondo';
  /** Solo pagos de equipos: anticipo (para la regla de anticipo máximo). */
  esAnticipo?: boolean;
  concepto: string;
  fecha: string;
  monto: number;
  estado: string;
  /** Solo entradas: origen de los fondos. */
  fuente?: 'equity' | 'deuda';
  /** Solo entradas: fondos con compromiso firme (aprobados o comprometidos). */
  confirmado?: boolean;
  fondeo?: string;
  /** Solo pagos: contrato de equipos mayores, costo financiero (comisión, intereses, DSRA) o, si falta, construcción. */
  partida?: 'equipos' | 'financiero';
  /** Solo anticipos de equipos: compromiso aprobado para pagarse antes del RTB (p. ej. reserva de módulos). */
  compromisoAnticipado?: boolean;
}

/** Pago de obra o de equipos (todo lo que no es costo financiero). */
export const esPagoDeObra = (p: Movimiento) => p.tipo !== 'fondo' && p.partida !== 'financiero';

export interface ModeloFinanciero {
  mwac: number;
  mwdc: number;
  capex: number;
  /** Costos financieros que se fondean con las fuentes (0 si la deuda no está dimensionada). */
  idc: number;
  comision: number;
  dsra: number;
  /** Comisión por no disposición de los créditos (0 si no se cobra). */
  noDisposicion: number;
  /** Usos = CAPEX + intereses durante la construcción + comisiones + DSRA = equity + deuda. */
  usos: number;
  /** true si equity y deuda vienen del dimensionamiento con supuestos (rentabilidad.ts); false = 30 % / 70 % del CAPEX. */
  deudaDimensionada: boolean;
  /** Equity ÷ usos. */
  equityPct: number;
  equity: number;
  deuda: number;
  contratoEquipos: number;
  anticipoEquipos: number;
  anticipoPct: number;
  pagos: Movimiento[];
  fondos: Movimiento[];
  /** false si el proyecto no tiene cronograma (proyecto real sin pagos ni fuentes capturados). */
  conCronograma: boolean;
  /** De dónde salen pagos y fondos: capturados por el usuario, ejemplo ilustrativo o ninguno. */
  origenCronograma: 'capturado' | 'ejemplo' | 'ninguno';
  /** IVA de construcción (si está activo y calculado): sus movimientos cuentan en el hueco de caja. */
  iva?: { salidas: Movimiento[]; entradas: Movimiento[] } | null;
  /** Cierre financiero / NTP (solo el cronograma de ejemplo; en uno capturado, el primer pago de obra). */
  fechaNtp?: string;
  // TIR, LCOE y DSCR ya no viven aquí: se calculan con supuestos en rentabilidad.ts
}

const CAPEX_BASE = 46_500_000;
const MWAC_BASE = 50;
// MWdc = MWac × RELACION_DC_AC (definida en rentabilidad.ts)
const EQUITY_PCT = 0.3;
const TRAMO_1_BASE = 20_000_000;
const CONTRATO_EQUIPOS_BASE = 24_000_000;
const ANTICIPO_PCT = 0.2;

/** Hitos del cronograma de ejemplo: cierre financiero / NTP después del RTB objetivo y COD 12 meses después. */
export const FECHA_NTP_EJEMPLO = '2027-04-15';
export const FECHA_COD_EJEMPLO = '2028-04-15';

const redondear = (n: number) => Math.round(n / 10_000) * 10_000;

interface ProyectoFinanciero {
  id?: string;
  capacityMw?: number;
  capex?: number | string | null;
  tir?: string | null;
  /** false = proyecto real: sin cronograma inventado. Solo los proyectos de ejemplo reciben el del caso Alpha I. */
  esEjemplo?: boolean;
}

/** Deuda dimensionada y costos financieros calculados en rentabilidad.ts (sin redondear). */
export interface DeudaDimensionada {
  deuda: number;
  idc: number;
  comision: number;
  dsra: number;
  /** Comisión por no disposición (0 o ausente si no se cobra). */
  noDisposicion?: number;
}

/**
 * @param movimientos pagos y fondos capturados (project_cash_movements). Si hay, se usan tal cual y tienen prioridad.
 * @param dimension deuda dimensionada con los supuestos; sin ella, equity 30 % y deuda 70 % del CAPEX (supuesto).
 * @param creditos créditos de la deuda: cada desembolso de deuda se reparte entre ellos (creditos.ts). Sin ellos, igual que antes.
 */
export function crearModeloFinanciero(
  proyecto: ProyectoFinanciero, frentes: Frente[] = [], movimientos: Movimiento[] = [], dimension?: DeudaDimensionada, creditos?: Credito[],
): ModeloFinanciero {
  const modelo = modeloSinCreditos(proyecto, frentes, movimientos, dimension);
  return creditos ? { ...modelo, fondos: repartirDesembolsos(modelo.fondos, creditos) } : modelo;
}

function modeloSinCreditos(
  proyecto: ProyectoFinanciero, frentes: Frente[], movimientos: Movimiento[], dimension?: DeudaDimensionada,
): ModeloFinanciero {
  const mwac = Number(proyecto.capacityMw) || MWAC_BASE;
  const capex = aNumero(proyecto.capex) ?? CAPEX_BASE * (mwac / MWAC_BASE);
  const escala = capex / CAPEX_BASE;

  // Cifras al dólar para que fuentes, usos y pagos cuadren exactamente
  const idc = dimension ? Math.round(dimension.idc) : 0;
  const comision = dimension ? Math.round(dimension.comision) : 0;
  const dsra = dimension ? Math.round(dimension.dsra) : 0;
  const noDisposicion = dimension ? Math.round(dimension.noDisposicion ?? 0) : 0;
  const usos = capex + idc + comision + dsra + noDisposicion;
  const deuda = dimension ? Math.round(dimension.deuda) : capex - Math.round(capex * EQUITY_PCT);
  const equity = usos - deuda;
  const comun = {
    mwac, mwdc: mwac * RELACION_DC_AC, capex, idc, comision, dsra, noDisposicion, usos, deudaDimensionada: !!dimension,
    equityPct: usos > 0 ? equity / usos : 0, equity, deuda,
  };

  // Cronograma capturado por el usuario: se usa tal cual, ordenado por fecha
  if (movimientos.length > 0) {
    const porFecha = (a: Movimiento, b: Movimiento) => a.fecha.localeCompare(b.fecha);
    const pagos = movimientos.filter((m) => m.tipo === 'pago').sort(porFecha);
    const fondos = movimientos.filter((m) => m.tipo === 'fondo').sort(porFecha);
    const deEquipos = pagos.filter((p) => p.partida === 'equipos');
    const contratoEquipos = deEquipos.reduce((s, p) => s + p.monto, 0);
    const anticipoEquipos = deEquipos.filter((p) => p.esAnticipo).reduce((s, p) => s + p.monto, 0);
    // Mientras solo esté capturado el anticipo, el contrato aún no se conoce: no se evalúa el porcentaje
    const contratoConocido = deEquipos.some((p) => !p.esAnticipo);
    return {
      ...comun, contratoEquipos, anticipoEquipos, anticipoPct: contratoConocido ? anticipoEquipos / contratoEquipos : 0,
      pagos, fondos, conCronograma: true, origenCronograma: 'capturado',
    };
  }

  // Proyecto real sin captura: estructura de fuentes (equity/deuda) sí, pero sin pagos, tramos ni fechas inventados
  if (proyecto.esEjemplo === false) {
    return { ...comun, contratoEquipos: 0, anticipoEquipos: 0, anticipoPct: 0, pagos: [], fondos: [], conCronograma: false, origenCronograma: 'ninguno' };
  }
  const tramo1 = Math.min(redondear(TRAMO_1_BASE * escala), deuda);
  const tramo2 = deuda - tramo1;

  // El tramo 2 solo cuenta como confirmado cuando su aprobación está completa en los frentes de trabajo
  const aprobacionTramo2 = frentes.flatMap((f) => f.items).find((i) => codigoEntregable(i) === CODIGO_TRAMO_2);
  const tramo2Confirmado = aprobacionTramo2?.[1] === 'completo';

  // Cronograma del ejemplo, coherente con el RTB objetivo (31 mar 2027): cierre financiero y NTP el 15 abr 2027,
  // 12 meses de construcción y COD el 15 abr 2028. Se usa primero el equity y después la deuda.
  const aporte1 = redondear(equity / 2);
  const fondos: Movimiento[] = [
    { concepto: 'Aportación de equity 1 · cierre financiero y NTP', fecha: FECHA_NTP_EJEMPLO, monto: aporte1, estado: 'Comprometido', fuente: 'equity', confirmado: true },
    { concepto: 'Aportación de equity 2', fecha: '2027-06-30', monto: equity - aporte1, estado: 'Comprometido', fuente: 'equity', confirmado: true },
    { concepto: 'Tramo 1 · primer desembolso (agotado el equity)', fecha: '2027-08-31', monto: tramo1, estado: 'Aprobado', fuente: 'deuda', confirmado: true },
    { concepto: 'Tramo 2 · hito de avance de obra', fecha: '2027-11-30', monto: tramo2, estado: tramo2Confirmado ? 'Aprobado' : 'En revisión', fuente: 'deuda', confirmado: tramo2Confirmado },
  ];

  // Equipos: 20 % de anticipo y el resto por hitos (embarque 40 %, entrega en sitio 30 %, puesta en marcha 10 %)
  const contratoEquipos = redondear(CONTRATO_EQUIPOS_BASE * escala);
  const equipo = (pct: number) => Math.round(contratoEquipos * pct);
  const anticipoEquipos = equipo(ANTICIPO_PCT);
  const obraCivil = redondear(8_500_000 * escala);
  const interconexion = redondear(4_500_000 * escala);
  const montaje = capex - contratoEquipos - obraCivil - interconexion;

  const pagos: Movimiento[] = [
    { concepto: `Equipos mayores · anticipo ${ANTICIPO_PCT * 100} %`, fecha: '2027-04-30', monto: anticipoEquipos, estado: 'Programado', fondeo: 'Equity', partida: 'equipos', esAnticipo: true },
    { concepto: 'Obras civiles fase 1', fecha: '2027-06-30', monto: obraCivil, estado: 'Programado', fondeo: 'Equity' },
    { concepto: 'Equipos mayores · embarque 40 %', fecha: '2027-08-31', monto: equipo(0.4), estado: 'Programado', fondeo: 'Equity y deuda', partida: 'equipos' },
    { concepto: 'Interconexión y subestación', fecha: '2027-10-31', monto: interconexion, estado: 'Programado', fondeo: 'Deuda' },
    { concepto: 'Equipos mayores · entrega en sitio 30 %', fecha: '2027-11-30', monto: equipo(0.3), estado: 'Programado', fondeo: 'Deuda', partida: 'equipos' },
    { concepto: 'Montaje electromecánico (EPC)', fecha: '2028-02-29', monto: montaje, estado: 'Programado', fondeo: 'Deuda' },
    { concepto: 'Equipos mayores · puesta en marcha 10 % (COD)', fecha: FECHA_COD_EJEMPLO, monto: contratoEquipos - anticipoEquipos - equipo(0.4) - equipo(0.3), estado: 'Programado', fondeo: 'Deuda', partida: 'equipos' },
    // Costos financieros (solo con deuda dimensionada): comisión al cierre financiero; intereses y DSRA en la COD
    ...(comision > 0 ? [{ concepto: 'Comisión de estructuración de la deuda', fecha: FECHA_NTP_EJEMPLO, monto: comision, estado: 'Programado', fondeo: 'Equity', partida: 'financiero' as const }] : []),
    ...(idc > 0 ? [{ concepto: 'Intereses durante la construcción', fecha: FECHA_COD_EJEMPLO, monto: idc, estado: 'Programado', fondeo: 'Deuda', partida: 'financiero' as const }] : []),
    ...(noDisposicion > 0 ? [{ concepto: 'Comisión por no disposición', fecha: FECHA_COD_EJEMPLO, monto: noDisposicion, estado: 'Programado', fondeo: 'Deuda', partida: 'financiero' as const }] : []),
    ...(dsra > 0 ? [{ concepto: 'Fondeo de la cuenta de reserva (DSRA)', fecha: FECHA_COD_EJEMPLO, monto: dsra, estado: 'Programado', fondeo: 'Deuda', partida: 'financiero' as const }] : []),
  ];

  return {
    ...comun,
    contratoEquipos,
    anticipoEquipos,
    anticipoPct: anticipoEquipos / contratoEquipos,
    pagos: pagos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    fondos,
    conCronograma: true,
    origenCronograma: 'ejemplo',
    fechaNtp: FECHA_NTP_EJEMPLO,
  };
}

const DIAS_POR_MES = 365.25 / 12;

/**
 * Calendario de pagos para los intereses de construcción: fracción del CAPEX por mes desde el primer pago de
 * obra (mes 0 = NTP). Solo pagos de obra y equipos (no costos financieros); los posteriores a la COD cuentan en
 * la COD. Sin pagos: uniforme en los meses de construcción.
 */
export function calendarioPagos(pagos: Movimiento[], mesesConstruccion: number, fechaNtp?: string): PagoMensual[] {
  const deObra = pagos.filter(esPagoDeObra).filter((p) => p.monto > 0);
  const total = deObra.reduce((s, p) => s + p.monto, 0);
  if (total <= 0) return calendarioUniforme(mesesConstruccion);
  // Mes 0 = NTP si se conoce (cronograma de ejemplo); si no, el primer pago de obra
  const primero = deObra.map((p) => p.fecha).sort()[0];
  const inicio = fechaNtp && fechaNtp < primero ? fechaNtp : primero;
  const n = Math.max(1, Math.round(mesesConstruccion));
  const porMes = new Map<number, number>();
  for (const p of deObra) {
    const mes = Math.min(n, Math.floor(diasEntre(inicio, p.fecha) / DIAS_POR_MES));
    porMes.set(mes, (porMes.get(mes) ?? 0) + p.monto / total);
  }
  return [...porMes.entries()].sort((a, b) => a[0] - b[0]).map(([mes, fraccion]) => ({ mes, fraccion }));
}

/**
 * Mes en que se causa el IVA de cada pago de obra y equipos (IVA de construcción v1). Mes 0 = mes del NTP (o del
 * primer pago de obra), como en calendarioPagos. Equipo (partida "equipos"):
 * - importación directa: el IVA se causa en la importación; se fecha en el pago de equipos cuyo concepto dice
 *   "entrega" (aproximación). Si no hay ese hito, se fecha en sus pagos (más pronto) y se avisa (sinHitoEntrega);
 * - compra local: en cada pago de equipos, incluido el anticipo.
 */
export function calendarioIva(pagos: Movimiento[], origenEquipo: OrigenEquipo | null = 'importacion', fechaNtp?: string): CalendarioIva | null {
  const deObra = pagos.filter(esPagoDeObra).filter((p) => p.monto > 0);
  const total = deObra.reduce((s, p) => s + p.monto, 0);
  if (total <= 0) return null;
  const primero = deObra.map((p) => p.fecha).sort()[0];
  const fechaInicio = fechaNtp && fechaNtp < primero ? fechaNtp : primero;
  const inicio = fechaInicio.slice(0, 7);
  const [ai, mi] = inicio.split('-').map(Number);
  const indice = (fecha: string) => { const [a, m] = fecha.slice(0, 7).split('-').map(Number); return (a - ai) * 12 + (m - mi); };
  const importacion = origenEquipo !== 'local';
  const entrega = deObra.find((p) => p.partida === 'equipos' && /entrega/i.test(p.concepto));
  const hayEquipos = deObra.some((p) => p.partida === 'equipos');
  const eventos = deObra.map((p) => {
    const fecha = importacion && p.partida === 'equipos' && entrega ? entrega.fecha : p.fecha;
    return { mesIndice: indice(fecha), mes: fecha.slice(0, 7), fraccion: p.monto / total, concepto: p.concepto };
  });
  return { inicio, eventos, sinHitoEntrega: importacion && hayEquipos && !entrega };
}

/** Suma meses a una fecha ISO (si el día no existe en el mes destino, usa el último día). */
export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const destino = new Date(Date.UTC(y, m - 1 + Math.round(meses), 1));
  const ultimoDia = new Date(Date.UTC(destino.getUTCFullYear(), destino.getUTCMonth() + 1, 0)).getUTCDate();
  destino.setUTCDate(Math.min(d, ultimoDia));
  return destino.toISOString().slice(0, 10);
}

/**
 * Hitos para validar la vigencia de las garantías (NTP, conclusión de interconexión, COD, fin de construcción).
 * Cronograma de ejemplo: sus fechas. Cronograma capturado: NTP = primer pago de obra (sin contar compromisos
 * anticipados) y COD = NTP + meses de construcción. Sin cronograma: se estiman con NTP = RTB objetivo.
 * El fin de construcción coincide con la COD.
 */
export function fechasClave(m: Pick<ModeloFinanciero, 'pagos' | 'origenCronograma' | 'fechaNtp'>, fechaRtb: string | null, mesesConstruccion: number): FechasClave {
  const deObra = m.pagos.filter(esPagoDeObra).filter((p) => !(p.esAnticipo && p.compromisoAnticipado));
  // Conclusión de obras de interconexión: el último pago de interconexión del cronograma; si no hay, la COD (estimada)
  const conInterconexion = (ntp: string, cod: string, estimadas: boolean): FechasClave => {
    const ultimo = deObra.filter((p) => /interconexi/i.test(p.concepto)).map((p) => p.fecha).sort().pop();
    return {
      rtb: fechaRtb, ntp, cod, finConstruccion: cod, estimadas,
      finInterconexion: ultimo ?? cod, finInterconexionEstimada: !ultimo,
    };
  };
  if (m.origenCronograma === 'ejemplo' && m.fechaNtp) {
    return conInterconexion(m.fechaNtp, sumarMeses(m.fechaNtp, mesesConstruccion), false);
  }
  if (m.origenCronograma === 'capturado' && deObra.length > 0) {
    const ntp = deObra.map((p) => p.fecha).sort()[0];
    return conInterconexion(ntp, sumarMeses(ntp, mesesConstruccion), false);
  }
  if (!fechaRtb) return { rtb: null, ntp: null, finInterconexion: null, cod: null, finConstruccion: null, estimadas: true, finInterconexionEstimada: true };
  return conInterconexion(fechaRtb, sumarMeses(fechaRtb, mesesConstruccion), true);
}

export interface PuntoFlujo {
  fecha: string;
  pagosAcumulados: number;
  fondosConfirmados: number;
  /** Pagos acumulados no cubiertos por fondos confirmados (0 si no hay hueco). */
  hueco: number;
}

/**
 * Pagos acumulados frente a fondos confirmados acumulados, en cada fecha con movimiento. Con IVA de construcción
 * (modelo.iva), sus salidas se suman a los pagos y sus entradas (devoluciones, línea de IVA) a los fondos.
 */
export function calcularFlujoAcumulado(modelo: Pick<ModeloFinanciero, 'pagos' | 'fondos'> & { iva?: { salidas: { fecha: string; monto: number }[]; entradas: { fecha: string; monto: number }[] } | null }): PuntoFlujo[] {
  const salidas = [...modelo.pagos, ...(modelo.iva?.salidas ?? [])];
  const entradas = [...modelo.fondos.filter((f) => f.confirmado), ...(modelo.iva?.entradas ?? [])];
  const fechas = [...new Set([...salidas, ...modelo.fondos, ...(modelo.iva?.entradas ?? [])].map((m) => m.fecha))].sort();
  return fechas.map((fecha) => {
    const pagosAcumulados = salidas.filter((p) => p.fecha <= fecha).reduce((s, p) => s + p.monto, 0);
    const fondosConfirmados = entradas.filter((f) => f.fecha <= fecha).reduce((s, f) => s + f.monto, 0);
    return { fecha, pagosAcumulados, fondosConfirmados, hueco: Math.max(0, pagosAcumulados - fondosConfirmados) };
  });
}
