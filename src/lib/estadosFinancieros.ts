// Estados financieros v1 (motor): estado de resultados, balance y flujo de efectivo del caso base P50, con dividendos
// según la ley mexicana y la caja atrapada. No cambia ninguna cifra del modelo: parte de calcularRentabilidad() y de
// sus flujos (la "TIR de equity (flujo disponible)" es la de siempre).
//
// Convención contable (NIF, simplificada; validar con el contador):
// - Periodos: balance de apertura en la COD (año 0) y al cierre de cada año de operación; la construcción es una sola
//   columna del flujo de efectivo. Solo el caso base P50.
// - Activo fijo: CAPEX + intereses de construcción + comisión por no disposición + intereses y comisión de la línea de
//   IVA de la construcción (costos de un activo en construcción, NIF D-6). Depreciación contable en línea recta en la
//   vida útil, sin valor residual (independiente de la fiscal). El reemplazo de inversores se capitaliza en su año y se
//   deprecia en línea recta en los años que quedan; no se da de baja el componente sustituido.
// - Deuda: neta de la comisión de estructuración por amortizar; la comisión se amortiza en línea recta en el plazo como
//   gasto financiero (simplificación del método de interés efectivo).
// - ISR corriente: el del modelo. ISR diferido (NIF D-4), neto: tasa × (valor contable − saldo fiscal por deducir) del
//   CAPEX y del reemplazo, menos tasa × las pérdidas fiscales pendientes que sí se usarán (las que caducarán no generan
//   activo). Los intereses de construcción, las comisiones y los costos de la línea de IVA no se deducen en el modelo:
//   son diferencias permanentes.
// - Dividendos (LGSM): reserva legal del 5 % de la utilidad neta positiva del año hasta el 20 % del capital social
//   (art. 20); dividendo hasta las utilidades acumuladas disponibles, contra las del mismo año (art. 19). Lo que no
//   puede salir queda como caja atrapada. Con devolución de capital variable, lo que no sale como dividendo se reembolsa
//   hasta el capital aportado pendiente. Un año en lock-up no distribuye nada. En el último año se liquida la sociedad:
//   se reparte toda la caja.
// - IVA de construcción: aportaciones de los socios para IVA (netas de lo que se les regresa) en el capital; no son
//   dividendos ni pasan por el lock-up (sus flujos fechados son los mismos en las tres TIR).
import {
  tir, tirFechada, reemplazoInversores, type Rentabilidad, type Supuestos, ANOS_AMORTIZACION_PERDIDAS,
} from './rentabilidad';
import { flujosFechadosIva } from './iva';
import { formatearTir, formatearNumero } from './formato';

export const NOTA_CAPITAL_VARIABLE = 'En una S.A.P.I. de C.V. el capital variable se reduce por acuerdo de asamblea; los reembolsos hasta el saldo de la CUCA no causan ISR (LISR art. 78). Validar con asesor.';
export const NOTA_COMISION_ESTRUCTURACION = 'La comisión de estructuración se presenta neta de la deuda y se amortiza en línea recta en el plazo (simplificación del método de interés efectivo).';
export const NOTA_DIVIDENDOS = 'Reserva legal: 5 % de la utilidad neta del año hasta el 20 % del capital social (LGSM art. 20). Dividendos solo hasta las utilidades acumuladas (LGSM art. 19), contra las del mismo año. En el último año se liquida la sociedad y se reparte toda la caja.';
export const NOTA_LOCKUP = 'Un año con DSCR por debajo del de lock-up no distribuye nada (ni dividendos ni devolución de capital).';
export const RESERVA_LEGAL_PCT = 5;
export const RESERVA_LEGAL_TOPE_PCT = 20;

/** Limitaciones del modelo de estados financieros (v1). */
export const LIMITACIONES_ESTADOS = [
  'Solo el caso base P50: los escenarios de estrés no tienen estados financieros.',
  'Sin préstamo de socios ni deuda subordinada.',
  'Con devolución de capital variable, el modelo puede reducir el capital casi a cero; en una S.A.P.I. de C.V. debe conservarse el capital fijo mínimo, cuya reducción requiere un proceso formal (LGSM art. 9). No modelado.',
  'Sin CUFIN, ISR por dividendos ni retenciones a los socios: las TIR son a nivel de la sociedad.',
  'Sin PTU: la sociedad de propósito específico no tiene empleados.',
  'Los intereses de construcción, las comisiones y los costos de la línea de IVA no se deducen del ISR (diferencia permanente, como en el resto del modelo).',
  'El reemplazo de inversores no da de baja el componente sustituido.',
  'Dividendos contra las utilidades del mismo año (en la práctica, la asamblea aprueba los estados del año anterior).',
  'El ISR diferido supone que las proyecciones del modelo se cumplen (las pérdidas que se usarán).',
  'Si la depreciación fiscal no termina en la vida útil, el saldo fiscal pendiente queda como ISR diferido activo al final (no se modela su deducción en la liquidación).',
  'La reserva legal se separa de la utilidad neta positiva de cada año, aunque haya pérdidas acumuladas de años anteriores.',
  NOTA_COMISION_ESTRUCTURACION,
  'Todo en USD, sin tipo de cambio.',
];

export interface ResultadosAno {
  ano: number;
  ingresos: number;
  ingresosPpa: number;
  ingresosMercado: number;
  opex: number;            // OPEX + seguros + arrendamiento + O&M de la estructura
  ebitda: number;
  depreciacion: number;    // contable
  utilidadOperacion: number;
  intereses: number;
  amortizacionComision: number;
  costosLineaIva: number;  // intereses y comisión de la línea de IVA después de la COD
  utilidadAntesImpuestos: number;
  isrCorriente: number;
  isrDiferido: number;     // gasto (+) o beneficio (−)
  utilidadNeta: number;
}

export interface BalanceAno {
  ano: number;             // 0 = COD
  activoFijoNeto: number;
  caja: number;
  dsra: number;
  mmra: number;
  ivaPorRecuperar: number;
  isrDiferidoActivo: number;
  activoTotal: number;
  deuda: number;           // neta de la comisión por amortizar
  lineaIva: number;
  isrDiferidoPasivo: number;
  pasivoTotal: number;
  capitalAportado: number;
  aportacionesIva: number;
  reservaLegal: number;
  utilidadesAcumuladas: number;
  capitalTotal: number;
  /** Activo − pasivo − capital (debe ser 0). */
  control: number;
}

export interface FlujoEfectivoPeriodo {
  periodo: 'construccion' | number;
  // Operación
  utilidadNeta: number;
  depreciacion: number;
  isrDiferido: number;
  amortizacionComision: number;
  operacion: number;
  // Inversión
  capex: number;           // negativo: CAPEX, intereses y comisiones capitalizados (construcción) o reemplazo de inversores
  ivaPagado: number;       // negativo
  ivaRecuperado: number;
  inversion: number;
  // Financiamiento
  aportacionesCapital: number;
  disposicionDeuda: number;
  comisionEstructuracion: number; // negativo (construcción)
  amortizacionDeuda: number;      // negativo
  reservas: number;               // fondeo (−) y liberación (+) de la DSRA y la MMRA
  lineaIva: number;               // disposición − repago
  aportacionesIva: number;        // netas de lo que regresa a los socios
  dividendos: number;             // negativo
  devolucionCapital: number;      // negativo (incluye la de la liquidación)
  financiamiento: number;
  cambioCaja: number;
  cajaInicial: number;
  cajaFinal: number;
}

export interface Distribuciones {
  dividendos: number[];
  devolucionCapital: number[];
  aportaciones: number[];  // aportaciones adicionales si la caja no alcanza
  /** Caja que queda en la sociedad al cierre de cada año (no se pudo distribuir). */
  cajaAtrapada: number[];
  bloqueado: boolean[];    // lock-up
  tirEquity: number | null;
}

export interface EstadosFinancieros {
  devolucionCapital: boolean;
  resultados: ResultadosAno[];
  balance: BalanceAno[];        // años 0..N
  flujo: FlujoEfectivoPeriodo[]; // construcción y años 1..N
  /** Mayor |activo − pasivo − capital| de todos los años. */
  controlMaximo: number;
  /** Caja atrapada por año en los dos modos (para comparar). */
  cajaAtrapada: { conDevolucion: number[]; soloDividendos: number[] };
  tir: { flujoDisponible: number | null; dividendosYDevolucion: number | null; soloDividendos: number | null };
  distribuciones: Distribuciones;
  /** Pérdidas fiscales que caducan sin usarse (concilia con la hoja Impuestos). */
  perdidasCaducadas: number;
  notas: string[];
}

const pct = (x: number) => x / 100;

/** Por qué difieren las tres TIR (con las cifras del proyecto). */
export function explicacionTir(e: EstadosFinancieros, lockup: number | null): string {
  const { flujoDisponible: fd, dividendosYDevolucion: dd, soloDividendos: sd } = e.tir;
  return [
    `La TIR de flujo disponible (${formatearTir(fd)}) supone que toda la caja después del servicio de la deuda llega a los socios cada año.`,
    `Por ley, la sociedad solo reparte dividendos hasta sus utilidades acumuladas, después de la reserva legal: la depreciación genera caja pero no utilidad, y el ISR diferido baja la utilidad de los primeros años. Esa caja queda atrapada y sale después o en la liquidación; por eso la TIR con solo dividendos es menor (${formatearTir(sd)}).`,
    `Con devolución de capital variable, la caja que no puede salir como dividendo se reembolsa como capital y la TIR se acerca a la de flujo disponible (${formatearTir(dd)}).`,
    ...(lockup != null ? [`Con el lock-up (DSCR menor a ${formatearNumero(lockup, 2)}x), esos años no se distribuye nada.`] : []),
  ].join(' ');
}


/** Pérdidas fiscales por año de origen (FIFO, 10 años, igual que isrConPerdidas): lo que queda y lo que caducará. */
function cosechasDePerdidas(bases: number[]) {
  const cosechas: { ano: number; restante: number[]; caduca: number }[] = [];
  const pendientes: { c: number; resto: number }[] = [];
  bases.forEach((base, i) => {
    const ano = i + 1;
    while (pendientes.length && ano - cosechas[pendientes[0].c].ano > ANOS_AMORTIZACION_PERDIDAS) {
      cosechas[pendientes[0].c].caduca += pendientes[0].resto;
      pendientes[0].resto = 0;
      pendientes.shift();
    }
    if (base < 0) {
      cosechas.push({ ano, restante: [], caduca: 0 });
      pendientes.push({ c: cosechas.length - 1, resto: -base });
    } else {
      let gravable = base;
      while (gravable > 0 && pendientes.length) {
        const usar = Math.min(gravable, pendientes[0].resto);
        gravable -= usar;
        pendientes[0].resto -= usar;
        if (pendientes[0].resto <= 0) pendientes.shift();
      }
    }
    // Saldo de cada cosecha al cierre del año
    const resto = new Map(pendientes.map((p) => [p.c, p.resto]));
    cosechas.forEach((c, j) => { c.restante[i] = resto.get(j) ?? 0; });
  });
  // Lo que sigue pendiente al final de la vida útil tampoco se usa
  for (const p of pendientes) cosechas[p.c].caduca += p.resto;
  return cosechas;
}

/**
 * Estados financieros del caso base. `mwdc` para el reemplazo de inversores. El modo (devolución de capital variable)
 * sale del supuesto; las tres TIR se calculan siempre.
 */
export function estadosFinancieros(s: Supuestos, r: Rentabilidad, mwdc: number): EstadosFinancieros {
  const n = r.anos.length;
  const tasaIsr = pct(s.isrPct);
  const u = r.usos;
  const plazo = r.plazoDeudaAnos;
  const rep = reemplazoInversores(s, mwdc);
  const repCapex = (i: number) => rep?.capex[i] ?? 0;
  const repReserva = (i: number) => rep?.reservas[i] ?? 0;

  // IVA por año: construcción (meses antes de la COD) y años de operación
  const iva = r.iva;
  const indiceCod = Math.max(0, Math.round(s.mesesConstruccion));
  const periodoDeMes = (m: number) => (m < indiceCod ? 0 : Math.floor((m - indiceCod) / 12) + 1);
  const porPeriodo = () => Array(n + 1).fill(0) as number[];
  const ivaPagado = porPeriodo(), ivaRecuperado = porPeriodo(), lineaNeta = porPeriodo(), costosLinea = porPeriodo(), aportIva = porPeriodo();
  for (const m of iva?.meses ?? []) {
    const p = Math.min(n, periodoDeMes(m.mesIndice));
    ivaPagado[p] += m.pagado;
    ivaRecuperado[p] += m.recuperado;
    if (m.linea) {
      lineaNeta[p] += m.linea.disposicion - m.linea.repago;
      costosLinea[p] += m.linea.intereses + m.linea.comision;
    }
    aportIva[p] += -m.flujoEquity;
  }
  const acumular = (serie: number[]) => serie.reduce<number[]>((a, x, i) => [...a, (a[i - 1] ?? 0) + x], []);
  const ivaPorRecuperar = acumular(ivaPagado.map((x, i) => x - ivaRecuperado[i]));
  const lineaSaldo = acumular(lineaNeta);
  const aportIvaSaldo = acumular(aportIva);

  // Activo fijo: componente con base fiscal (CAPEX, reemplazo) y sin base fiscal (costos financieros capitalizados)
  const capitalizadoSinBase = u.idc + u.noDisposicion + costosLinea[0];
  const depCapex = r.capex / n;
  const depSinBase = capitalizadoSinBase / n;
  const depRep = (i: number) => (rep && i + 1 >= rep.ano ? rep.costo / (n - rep.ano + 1) : 0);
  const amortComision = (ano: number) => (plazo > 0 && ano <= plazo ? u.comision / plazo : 0);

  // ISR diferido neto al cierre de cada año (0 en la COD)
  const cosechas = cosechasDePerdidas(r.anos.map((a) => a.baseGravable));
  const perdidasCaducadas = cosechas.reduce((a, c) => a + c.caduca, 0);
  const diferido: number[] = [0];
  let baseFiscal = r.capex, contableConBase = r.capex;
  for (let i = 0; i < n; i++) {
    baseFiscal += repCapex(i) - r.anos[i].depreciacion;
    contableConBase += repCapex(i) - depCapex - depRep(i);
    // Pérdidas pendientes al cierre que sí se usarán: lo que queda de cada cosecha menos lo que de ella caducará
    const usables = cosechas.reduce((a, c) => a + (c.ano <= i + 1 && (c.restante[i] ?? 0) > 0 ? Math.max(0, c.restante[i] - c.caduca) : 0), 0);
    diferido.push(tasaIsr * (contableConBase - baseFiscal) - tasaIsr * usables);
  }

  const resultados: ResultadosAno[] = r.anos.map((a, i) => {
    const depreciacion = depCapex + depSinBase + depRep(i);
    const utilidadOperacion = a.ebitda - depreciacion;
    const amortizacionComision = amortComision(a.ano);
    const costosLineaIva = costosLinea[a.ano];
    const utilidadAntesImpuestos = utilidadOperacion - a.intereses - amortizacionComision - costosLineaIva;
    const isrDiferido = diferido[a.ano] - diferido[a.ano - 1];
    return {
      ano: a.ano, ingresos: a.ingresos, ingresosPpa: a.ingresosPpa, ingresosMercado: a.ingresosMercado, opex: a.costos, ebitda: a.ebitda,
      depreciacion, utilidadOperacion, intereses: a.intereses, amortizacionComision, costosLineaIva, utilidadAntesImpuestos,
      isrCorriente: a.isrConDeuda, isrDiferido, utilidadNeta: utilidadAntesImpuestos - a.isrConDeuda - isrDiferido,
    };
  });

  // Distribuciones: dividendos (y devolución de capital, si aplica) con reserva legal, lock-up y liquidación final
  const lockup = s.dscrLockup ?? null;
  const distribuir = (conDevolucion: boolean) => {
    let caja = 0, capital = r.equity, reserva = 0, utilidades = 0;
    const d: Distribuciones = { dividendos: [], devolucionCapital: [], aportaciones: [], cajaAtrapada: [], bloqueado: [], tirEquity: null };
    const saldos: { capital: number; reserva: number; utilidades: number }[] = [{ capital, reserva, utilidades }];
    r.anos.forEach((a, i) => {
      const ano = a.ano;
      caja += a.flujoEquity;
      const aportacion = caja < 0 ? -caja : 0;
      caja += aportacion;
      capital += aportacion;
      const un = resultados[i].utilidadNeta;
      const separar = Math.min(Math.max(0, un) * pct(RESERVA_LEGAL_PCT), Math.max(0, capital * pct(RESERVA_LEGAL_TOPE_PCT) - reserva));
      reserva += separar;
      utilidades += un - separar;
      const bloqueado = ano < n && lockup != null && a.servicioDeuda > 0 && a.dscr != null && a.dscr < lockup;
      let dividendo = 0, devolucion = 0;
      if (ano === n) {
        // Liquidación: se reparte toda la caja; primero se reembolsa el capital, el resto es dividendo de liquidación
        devolucion = Math.min(caja, capital);
        dividendo = caja - devolucion;
        utilidades += reserva;
        reserva = 0;
      } else if (!bloqueado) {
        dividendo = Math.max(0, Math.min(caja, utilidades));
        if (conDevolucion) devolucion = Math.max(0, Math.min(caja - dividendo, capital));
      }
      caja -= dividendo + devolucion;
      utilidades -= dividendo;
      capital -= devolucion;
      d.dividendos.push(dividendo);
      d.devolucionCapital.push(devolucion);
      d.aportaciones.push(aportacion);
      d.cajaAtrapada.push(caja);
      d.bloqueado.push(bloqueado);
      saldos.push({ capital, reserva, utilidades });
    });
    // TIR con las distribuciones reales (los flujos de IVA, fechados, son los mismos que en la TIR de flujo disponible)
    const anuales = [...r.construccion.equity, ...d.dividendos.map((x, i) => x + d.devolucionCapital[i] - d.aportaciones[i])];
    if (r.tirEquity != null) {
      d.tirEquity = iva ? tirFechada([...anuales.map((monto, t) => ({ t, monto })), ...flujosFechadosIva(iva).equity]) : tir(anuales);
    }
    return { d, saldos };
  };
  const conDevolucion = s.devolucionCapitalVariable === true;
  const modoCon = distribuir(true);
  const modoSin = distribuir(false);
  const elegido = conDevolucion ? modoCon : modoSin;
  const dist = elegido.d;

  // Balance (años 0..N)
  let activoFijo = r.capex + capitalizadoSinBase, saldoDeuda = r.deuda, mmra = 0, caja = 0;
  const balance: BalanceAno[] = [];
  for (let ano = 0; ano <= n; ano++) {
    const i = ano - 1;
    if (ano > 0) {
      activoFijo += repCapex(i) - resultados[i].depreciacion;
      saldoDeuda -= r.anos[i].amortizacion;
      mmra += repReserva(i) - repCapex(i);
      caja = dist.cajaAtrapada[i];
    }
    const comisionPendiente = plazo > 0 ? u.comision * Math.max(0, 1 - ano / plazo) : 0;
    const dsra = ano < plazo ? u.dsra : 0;
    const dif = diferido[ano];
    const saldo = elegido.saldos[ano];
    const activoTotal = activoFijo + caja + dsra + mmra + ivaPorRecuperar[ano] + Math.max(0, -dif);
    const pasivoTotal = saldoDeuda - comisionPendiente + lineaSaldo[ano] + Math.max(0, dif);
    const capitalTotal = saldo.capital + aportIvaSaldo[ano] + saldo.reserva + saldo.utilidades;
    balance.push({
      ano, activoFijoNeto: activoFijo, caja, dsra, mmra, ivaPorRecuperar: ivaPorRecuperar[ano], isrDiferidoActivo: Math.max(0, -dif), activoTotal,
      deuda: saldoDeuda - comisionPendiente, lineaIva: lineaSaldo[ano], isrDiferidoPasivo: Math.max(0, dif), pasivoTotal,
      capitalAportado: saldo.capital, aportacionesIva: aportIvaSaldo[ano], reservaLegal: saldo.reserva, utilidadesAcumuladas: saldo.utilidades, capitalTotal,
      control: activoTotal - pasivoTotal - capitalTotal,
    });
  }

  // Flujo de efectivo: construcción y años de operación
  const vacioFlujo = (periodo: FlujoEfectivoPeriodo['periodo']): FlujoEfectivoPeriodo => ({
    periodo, utilidadNeta: 0, depreciacion: 0, isrDiferido: 0, amortizacionComision: 0, operacion: 0,
    capex: 0, ivaPagado: 0, ivaRecuperado: 0, inversion: 0,
    aportacionesCapital: 0, disposicionDeuda: 0, comisionEstructuracion: 0, amortizacionDeuda: 0, reservas: 0, lineaIva: 0, aportacionesIva: 0,
    dividendos: 0, devolucionCapital: 0, financiamiento: 0, cambioCaja: 0, cajaInicial: 0, cajaFinal: 0,
  });
  const cerrar = (f: FlujoEfectivoPeriodo, cajaInicial: number) => {
    f.operacion = f.utilidadNeta + f.depreciacion + f.isrDiferido + f.amortizacionComision;
    f.inversion = f.capex + f.ivaPagado + f.ivaRecuperado;
    f.financiamiento = f.aportacionesCapital + f.disposicionDeuda + f.comisionEstructuracion + f.amortizacionDeuda + f.reservas + f.lineaIva + f.aportacionesIva + f.dividendos + f.devolucionCapital;
    f.cambioCaja = f.operacion + f.inversion + f.financiamiento;
    f.cajaInicial = cajaInicial;
    f.cajaFinal = cajaInicial + f.cambioCaja;
    return f;
  };
  const construccion = vacioFlujo('construccion');
  construccion.capex = -(r.capex + capitalizadoSinBase);
  construccion.ivaPagado = -ivaPagado[0];
  construccion.ivaRecuperado = ivaRecuperado[0];
  construccion.aportacionesCapital = r.equity;
  construccion.disposicionDeuda = r.deuda;
  construccion.comisionEstructuracion = -u.comision;
  construccion.reservas = -u.dsra;
  construccion.lineaIva = lineaNeta[0];
  construccion.aportacionesIva = aportIva[0];
  const flujo: FlujoEfectivoPeriodo[] = [cerrar(construccion, 0)];
  r.anos.forEach((a, i) => {
    const f = vacioFlujo(a.ano);
    const res = resultados[i];
    f.utilidadNeta = res.utilidadNeta;
    f.depreciacion = res.depreciacion;
    f.isrDiferido = res.isrDiferido;
    f.amortizacionComision = res.amortizacionComision;
    f.capex = -repCapex(i);
    f.ivaPagado = -ivaPagado[a.ano];
    f.ivaRecuperado = ivaRecuperado[a.ano];
    f.aportacionesCapital = dist.aportaciones[i];
    f.amortizacionDeuda = -a.amortizacion;
    // DSRA: se libera en el último año del plazo; MMRA: se fondea y se usa en el reemplazo
    f.reservas = (a.ano === plazo ? u.dsra : 0) - (repReserva(i) - repCapex(i));
    f.lineaIva = lineaNeta[a.ano];
    f.aportacionesIva = aportIva[a.ano];
    f.dividendos = -dist.dividendos[i];
    f.devolucionCapital = -dist.devolucionCapital[i];
    flujo.push(cerrar(f, flujo[flujo.length - 1].cajaFinal));
  });

  return {
    devolucionCapital: conDevolucion,
    resultados, balance, flujo,
    controlMaximo: Math.max(...balance.map((b) => Math.abs(b.control))),
    cajaAtrapada: { conDevolucion: modoCon.d.cajaAtrapada, soloDividendos: modoSin.d.cajaAtrapada },
    tir: { flujoDisponible: r.tirEquity, dividendosYDevolucion: modoCon.d.tirEquity, soloDividendos: modoSin.d.tirEquity },
    distribuciones: dist,
    perdidasCaducadas,
    notas: [NOTA_DIVIDENDOS, ...(lockup != null ? [NOTA_LOCKUP] : []), ...(conDevolucion ? [NOTA_CAPITAL_VARIABLE] : []), NOTA_COMISION_ESTRUCTURACION],
  };
}
