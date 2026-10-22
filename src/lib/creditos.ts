// Financiamiento con varios bancos (v1): créditos de la deuda senior y reparto de los desembolsos.
// - Créditos: quién presta y con qué condiciones (banco, participación, tasa anual total, comisiones, estado).
// - Desembolsos: cuándo llega el dinero (Tramo 1, Tramo 2 o los fondos de deuda capturados); cada uno se reparte
//   entre los créditos por su participación.
// v1: mismo plazo y mismo perfil esculpido para todos; cada crédito recibe su % de cada desembolso y amortiza su %
// del principal. Entonces el saldo de cada crédito es siempre wᵢ × el total, y la deuda con varios créditos es
// exactamente la de un crédito a la tasa Σ wᵢ·rᵢ con comisiones Σ wᵢ·cᵢ: el motor calcula con esas condiciones
// ponderadas y aquí se reparten los resultados por crédito. Sin valores inventados: si falta una condición o las
// participaciones no suman 100 %, no se calcula (TIR, DSCR y deuda en N/D).
import type { Rentabilidad } from './rentabilidad';
import type { Movimiento } from './modeloFinanciero';

export type EstadoCredito = 'aprobado' | 'en_revision' | 'pendiente';
export const ESTADOS_CREDITO: Record<EstadoCredito, string> = { aprobado: 'Aprobado', en_revision: 'En revisión', pendiente: 'Pendiente' };

export interface Credito {
  id?: string;
  orden: number;
  banco: string | null;
  participacionPct: number | null;
  /** Tasa anual total (base + margen), capturada. */
  tasaAnualPct: number | null;
  comisionEstructuracionPct: number | null;
  /** Opcional: % anual sobre lo comprometido no dispuesto (null = no se cobra; 0 es válido). */
  comisionNoDisposicionPct: number | null;
  estado: EstadoCredito | null;
}

export const FALTAN_CREDITOS = 'No hay créditos capturados para la deuda senior.';
/** Nota junto a los tramos de deuda en el cronograma de caja (app y Excel). */
export const NOTA_TRAMOS = 'Fechas de disponibilidad de cada tramo; los intereses de construcción y la comisión por no disposición se calculan con la disposición según necesidad (primero el equity).';
const capturado = (v: unknown): boolean => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
/** Redondeo a 10 decimales: quita el ruido de punto flotante de Σ wᵢ·rᵢ (0.6 × 7 + 0.4 × 6.5 = 6.8, no 6.800000000000001). */
const limpio = (x: number) => Math.round(x * 1e10) / 1e10;
const formatoPct = (x: number) => `${Number(x.toFixed(4))} %`;

/** Nombre para mostrar: el banco o, si falta, "Crédito n (banco sin capturar)". */
export const nombreCredito = (c: Pick<Credito, 'banco'>, i: number): string => c.banco?.trim() || `Crédito ${i + 1} (banco sin capturar)`;

/** Lo que impide calcular: sin créditos, una condición sin capturar o participaciones que no suman 100 %. */
export function problemasCreditos(creditos: Credito[]): string[] {
  if (creditos.length === 0) return [FALTAN_CREDITOS];
  const problemas: string[] = [];
  creditos.forEach((c, i) => {
    const n = nombreCredito(c, i);
    if (!capturado(c.participacionPct)) problemas.push(`${n}: falta la participación.`);
    if (!capturado(c.tasaAnualPct)) problemas.push(`${n}: falta la tasa anual.`);
    if (!capturado(c.comisionEstructuracionPct)) problemas.push(`${n}: falta la comisión de estructuración.`);
  });
  if (creditos.every((c) => capturado(c.participacionPct))) {
    const suma = creditos.reduce((s, c) => s + Number(c.participacionPct), 0);
    if (Math.abs(suma - 100) > 1e-9) problemas.push(`Las participaciones de los créditos suman ${formatoPct(suma)}, no 100 %.`);
  }
  return problemas;
}

export const MENSAJE_INDICATIVO = 'Financiamiento indicativo: aún sin banco';
/** Banco "definido": capturado y distinto de "Por definir". */
export const bancoDefinido = (c: Pick<Credito, 'banco'>): boolean => Boolean(c.banco?.trim()) && !/^por definir$/i.test(c.banco!.trim());
/**
 * Financiamiento indicativo: hay créditos, pero todos están pendientes o sin banco definido (vacío o "Por definir").
 * Se avisa en el Resumen y en la tarjeta de Inicio; no cambia el cálculo.
 */
export const financiamientoIndicativo = (creditos: Credito[]): boolean =>
  creditos.length > 0 && creditos.every((c) => c.estado === 'pendiente' || !bancoDefinido(c));

/** Una línea con los créditos (para el asistente): banco, participación, tasa, comisiones, estado y tasa ponderada. */
export function descripcionCreditos(creditos: Credito[], cond: CondicionesPonderadas | null): string {
  if (creditos.length === 0) return 'Sin créditos capturados (la deuda no se calcula)';
  const v = (x: number | null, unidad = ' %') => (x == null ? 'sin capturar' : `${Number(x.toFixed(4))}${unidad}`);
  const lista = creditos.map((c, i) => `${nombreCredito(c, i)}: ${v(c.participacionPct)} de la deuda, tasa ${v(c.tasaAnualPct)} anual, comisión de estructuración ${v(c.comisionEstructuracionPct)}`
    + `${c.comisionNoDisposicionPct != null ? `, comisión por no disposición ${v(c.comisionNoDisposicionPct)} anual` : ''}, ${c.estado ? ESTADOS_CREDITO[c.estado].toLowerCase() : 'estado sin capturar'}`);
  return lista.join('; ') + (cond && creditos.length > 1 ? `; tasa ponderada ${v(cond.tasaPct)}, comisión ponderada ${v(cond.comisionEstructuracionPct)}` : '')
    + (cond ? '' : '; incompletos: la TIR y el DSCR no se calculan');
}

/** Avisos que no detienen el cálculo: banco o estado sin capturar. */
export function avisosCreditos(creditos: Credito[]): { bancoSinCapturar: string[]; estadoSinCapturar: string[] } {
  return {
    bancoSinCapturar: creditos.flatMap((c, i) => (c.banco?.trim() ? [] : [nombreCredito(c, i)])),
    estadoSinCapturar: creditos.flatMap((c, i) => (c.estado ? [] : [nombreCredito(c, i)])),
  };
}

export interface CondicionesPonderadas {
  /** Participaciones como fracción (suman 1). */
  pesos: number[];
  tasaPct: number;
  comisionEstructuracionPct: number;
  comisionNoDisposicionPct: number;
}

/** Condiciones ponderadas por participación (Σ wᵢ·xᵢ); null si hay problemas. */
export function condicionesPonderadas(creditos: Credito[]): CondicionesPonderadas | null {
  if (problemasCreditos(creditos).length > 0) return null;
  const pesos = creditos.map((c) => Number(c.participacionPct) / 100);
  const ponderar = (x: (c: Credito) => number) => limpio(creditos.reduce((s, c, i) => s + pesos[i] * x(c), 0));
  return {
    pesos,
    tasaPct: ponderar((c) => Number(c.tasaAnualPct)),
    comisionEstructuracionPct: ponderar((c) => Number(c.comisionEstructuracionPct)),
    comisionNoDisposicionPct: ponderar((c) => (capturado(c.comisionNoDisposicionPct) ? Number(c.comisionNoDisposicionPct) : 0)),
  };
}

/** Año de la deuda de un crédito (montos en USD). */
export interface AnoCredito { ano: number; saldoInicial: number; intereses: number; amortizacion: number; servicio: number; saldoFinal: number }

export interface ResultadoCredito {
  credito: Credito;
  nombre: string;
  /** Participación como fracción. */
  peso: number;
  /** Monto comprometido (su % de la deuda). */
  monto: number;
  comisionEstructuracion: number;
  comisionNoDisposicion: number;
  /** Intereses durante la construcción (wᵢ·rᵢ / Σ wⱼ·rⱼ del total). */
  idc: number;
  anos: AnoCredito[];
}

/**
 * Resultados por crédito a partir de los totales del motor: saldo y amortización wᵢ × total; intereses (de cada año
 * y de la construcción) en proporción a wᵢ·rᵢ; comisiones en proporción a wᵢ·cᵢ. Σ por crédito = total.
 */
export function resultadosPorCredito(r: Rentabilidad, creditos: Credito[]): ResultadoCredito[] | null {
  const cond = condicionesPonderadas(creditos);
  if (!cond) return null;
  const parte = (x: (c: Credito) => number) => {
    const pesos = creditos.map((c, i) => cond.pesos[i] * x(c));
    const suma = pesos.reduce((a, b) => a + b, 0);
    return pesos.map((p, i) => (suma > 0 ? p / suma : cond.pesos[i]));
  };
  const deInteres = parte((c) => Number(c.tasaAnualPct));
  const deComision = parte((c) => Number(c.comisionEstructuracionPct));
  const deNoDisposicion = parte((c) => (capturado(c.comisionNoDisposicionPct) ? Number(c.comisionNoDisposicionPct) : 0));
  const enPlazo = r.anos.filter((a) => a.ano <= r.plazoDeudaAnos);
  return creditos.map((c, i) => {
    const w = cond.pesos[i];
    return {
      credito: c, nombre: nombreCredito(c, i), peso: w, monto: w * r.deuda,
      comisionEstructuracion: deComision[i] * r.usos.comision,
      comisionNoDisposicion: deNoDisposicion[i] * r.usos.noDisposicion,
      idc: deInteres[i] * r.usos.idc,
      anos: enPlazo.map((a) => {
        const intereses = deInteres[i] * a.intereses;
        const amortizacion = w * a.amortizacion;
        return { ano: a.ano, saldoInicial: w * a.saldoInicialDeuda, intereses, amortizacion, servicio: intereses + amortizacion, saldoFinal: w * a.saldoDeuda };
      }),
    };
  });
}

/**
 * Reparte cada desembolso de deuda entre los créditos por su participación (al dólar; el último crédito se lleva el
 * redondeo). Una parte está confirmada solo si el desembolso lo está (su condición propia, p. ej. el Tramo 2 con su
 * aprobación completa) y el crédito está aprobado. Con un solo crédito el concepto no cambia.
 */
export function repartirDesembolsos(fondos: Movimiento[], creditos: Credito[]): Movimiento[] {
  const cond = condicionesPonderadas(creditos);
  if (!cond) return fondos;
  const estadoDe = (f: Movimiento, c: Credito) => (c.estado === 'aprobado' ? f.estado : c.estado ? ESTADOS_CREDITO[c.estado] : 'Crédito sin estado');
  return fondos.flatMap((f) => {
    if (f.fuente !== 'deuda') return [f];
    if (creditos.length === 1) {
      const c = creditos[0];
      return [{ ...f, estado: estadoDe(f, c), confirmado: Boolean(f.confirmado) && c.estado === 'aprobado' }];
    }
    let asignado = 0;
    return creditos.map((c, i) => {
      const monto = i === creditos.length - 1 ? f.monto - asignado : Math.round(f.monto * cond.pesos[i]);
      asignado += monto;
      return {
        ...f, monto, concepto: `${f.concepto} · ${nombreCredito(c, i)} (${formatoPct(Number(c.participacionPct))})`,
        estado: estadoDe(f, c), confirmado: Boolean(f.confirmado) && c.estado === 'aprobado',
      };
    });
  });
}
