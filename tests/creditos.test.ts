// Financiamiento con varios bancos v1 (fase 1, motor): créditos con participación, tasa y comisiones propias; mismo
// plazo y perfil esculpido. Casos del usuario A–E, la comisión por no disposición cuando manda el apalancamiento, los
// intereses de construcción por crédito y la migración.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { calendarioUniforme, ITERACIONES_DEUDA, type Supuestos } from '../src/lib/rentabilidad';
import { validarProyecto, type Garantia } from '../src/lib/validaciones';
import { problemasCreditos, condicionesPonderadas, repartirDesembolsos, type Credito, type EstadoCredito } from '../src/lib/creditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const GARANTIAS: Garantia[] = [
  { id: 'g1', tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
];
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const credito = (orden: number, banco: string | null, participacionPct: number | null, tasaAnualPct: number | null, comisionEstructuracionPct: number | null,
  estado: EstadoCredito | null = 'aprobado', comisionNoDisposicionPct: number | null = null): Credito =>
  ({ orden, banco, participacionPct, tasaAnualPct, comisionEstructuracionPct, comisionNoDisposicionPct, estado });
const analizar = (creditos: Credito[] | undefined, s: Supuestos = S) =>
  analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: s, creditos, calcularPrecioMinimo: true });
const cerca = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const hoy = analizar(undefined);

describe('A. Un banco al 100 %, 7 %, comisión 1.5 %: todo idéntico a hoy', () => {
  const a = analizar([credito(1, 'Banco A', 100, 7, 1.5)]);
  test('cifras del usuario: deuda 28,731,461; usos 49,277,575; TIR de equity 8.15 %; DSCR mínimo 1.408x', () => {
    assert.equal(Math.round(a.rentabilidad.deuda), 28_731_461);
    assert.equal(Math.round(a.rentabilidad.usos.total), 49_277_575);
    assert.equal((a.rentabilidad.tirEquity * 100).toFixed(2), '8.15');
    assert.equal(a.rentabilidad.dscrMinP50.toFixed(3), '1.408');
    assert.equal(a.rentabilidad.usos.noDisposicion, 0);
  });
  test('rentabilidad, comparación, precio mínimo, finanzas y alertas: exactamente iguales a hoy', () => {
    assert.deepEqual(a.rentabilidad, hoy.rentabilidad);
    assert.deepEqual(a.comparacion, hoy.comparacion);
    assert.deepEqual(a.precioMinimo, hoy.precioMinimo);
    assert.deepEqual(a.finanzas, { ...hoy.finanzas });
    assert.deepEqual(a.resumenRentabilidad, hoy.resumenRentabilidad);
    assert.deepEqual(a.alertas, hoy.alertas);
  });
  test('el crédito migrado (sin banco, aprobado): mismas cifras; solo la alerta informativa "Banco sin capturar"', () => {
    const m = analizar([credito(1, null, 100, 7, 1.5)]);
    assert.deepEqual(m.rentabilidad, hoy.rentabilidad);
    assert.deepEqual(m.finanzas, hoy.finanzas);
    const nueva = m.alertas.filter((x) => !hoy.alertas.some((h) => h.id === x.id));
    assert.deepEqual(nueva.map((x) => [x.id, x.sev, x.titulo]), [['financiamiento-creditos-datos', 'info', 'Banco sin capturar']]);
    assert.match(nueva[0].detalle, /Falta el banco de: Crédito 1 \(banco sin capturar\)\. No cambia la deuda, la TIR ni el DSCR\./);
  });
});

describe('B. Dos bancos 60/40, ambos al 7 % y 1.5 %', () => {
  const b = analizar([credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 7, 1.5)]);
  const a = analizar([credito(1, 'Banco A', 100, 7, 1.5)]);
  test('totales idénticos a A', () => {
    assert.deepEqual(b.rentabilidad, a.rentabilidad);
    assert.deepEqual(b.comparacion, a.comparacion);
  });
  test('cada año, saldo, intereses y amortización de cada banco = exactamente 60 % y 40 % del total', () => {
    const [A, B] = b.porCredito!;
    const anos = b.rentabilidad.anos.filter((x: { ano: number }) => x.ano <= b.rentabilidad.plazoDeudaAnos);
    assert.equal(A.anos.length, anos.length);
    anos.forEach((t: { saldoInicialDeuda: number; saldoDeuda: number; intereses: number; amortizacion: number }, i: number) => {
      for (const [r, w] of [[A, 0.6], [B, 0.4]] as const) {
        cerca(r.anos[i].saldoInicial, w * t.saldoInicialDeuda, 1e-6, 'saldo inicial');
        cerca(r.anos[i].saldoFinal, w * t.saldoDeuda, 1e-6, 'saldo final');
        cerca(r.anos[i].intereses, w * t.intereses, 1e-6, 'intereses');
        cerca(r.anos[i].amortizacion, w * t.amortizacion, 1e-6, 'amortización');
      }
    });
    cerca(A.monto, 0.6 * b.rentabilidad.deuda, 1e-6);
    cerca(A.comisionEstructuracion, 0.6 * b.rentabilidad.usos.comision, 1e-6);
    cerca(A.idc, 0.6 * b.rentabilidad.usos.idc, 1e-6);
  });
});

describe('C. Dos bancos 60/40 al 7.0 % y 6.5 %, comisiones 1.5 % y 1.0 % = un banco al 6.80 % con 1.30 %', () => {
  const c = analizar([credito(1, 'Banco A', 60, 7.0, 1.5), credito(2, 'Banco B', 40, 6.5, 1.0)]);
  const uno = analizar([credito(1, 'Banco único', 100, 6.8, 1.3)]);
  test('tasa ponderada 6.80 % y comisión ponderada 1.30 % (sin ruido de punto flotante)', () => {
    assert.equal(c.condicionesCreditos!.tasaPct, 6.8);
    assert.equal(c.condicionesCreditos!.comisionEstructuracionPct, 1.3);
    assert.equal(c.condicionesCreditos!.comisionNoDisposicionPct, 0);
  });
  test('resultados idénticos: deuda, servicio, DSCR, IDC, DSRA, ISR y TIR (todo el objeto)', () => {
    assert.deepEqual(c.rentabilidad, uno.rentabilidad);
    assert.deepEqual(c.comparacion, uno.comparacion);
    assert.deepEqual(c.precioMinimo, uno.precioMinimo);
  });
  test('cifras exactas: deuda 29,068,576.13; comisión 377,891.49; Banco A 17,441,145.68; Banco B 11,627,430.45', () => {
    const r = c.rentabilidad;
    assert.equal(r.deuda.toFixed(2), '29068576.13');
    assert.equal(r.usos.comision.toFixed(2), '377891.49');
    assert.equal(r.usos.idc.toFixed(2), '613947.88');
    assert.equal(r.usos.dsra.toFixed(2), '1730523.13');
    assert.equal(r.usos.total.toFixed(2), '49222362.51');
    const [A, B] = c.porCredito!;
    assert.equal(A.monto.toFixed(2), '17441145.68');
    assert.equal(B.monto.toFixed(2), '11627430.45');
    assert.equal(A.comisionEstructuracion.toFixed(2), '261617.19');
    assert.equal(B.comisionEstructuracion.toFixed(2), '116274.30');
  });
  test('por crédito: intereses wᵢ·rᵢ × saldo; Σ por crédito = total (intereses de cada año, IDC y comisión)', () => {
    const [A, B] = c.porCredito!;
    const anos = c.rentabilidad.anos.filter((x: { ano: number }) => x.ano <= c.rentabilidad.plazoDeudaAnos);
    anos.forEach((t: { saldoInicialDeuda: number; intereses: number; amortizacion: number; saldoDeuda: number }, i: number) => {
      cerca(A.anos[i].intereses, 0.6 * 0.07 * t.saldoInicialDeuda, 0.01, `año ${i + 1} banco A`);
      cerca(B.anos[i].intereses, 0.4 * 0.065 * t.saldoInicialDeuda, 0.01, `año ${i + 1} banco B`);
      cerca(A.anos[i].intereses + B.anos[i].intereses, t.intereses, 1e-6);
      cerca(A.anos[i].amortizacion + B.anos[i].amortizacion, t.amortizacion, 1e-6);
      cerca(A.anos[i].saldoFinal + B.anos[i].saldoFinal, t.saldoDeuda, 1e-6);
    });
    // Intereses durante la construcción por crédito (wᵢ·rᵢ / Σ wⱼ·rⱼ): Σ = IDC total
    cerca(A.idc, c.rentabilidad.usos.idc * (0.6 * 7) / 6.8, 1e-6);
    cerca(A.idc + B.idc, c.rentabilidad.usos.idc, 1e-6);
    cerca(A.comisionEstructuracion + B.comisionEstructuracion, c.rentabilidad.usos.comision, 1e-6);
  });
});

describe('D. Participaciones 60/35 (95 %): alerta y TIR/DSCR en N/D', () => {
  const d = analizar([credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 35, 7, 1.5)]);
  test('no se calcula: sin rentabilidad, estado creditos_incompletos, sin deuda dimensionada', () => {
    assert.equal(d.rentabilidad, null);
    assert.equal(d.comparacion, null);
    assert.equal(d.porCredito, null);
    assert.deepEqual(d.problemasCreditos, ['Las participaciones de los créditos suman 95 %, no 100 %.']);
    assert.deepEqual(d.resumenRentabilidad, { estado: 'creditos_incompletos', problemas: ['Las participaciones de los créditos suman 95 %, no 100 %.'] });
    assert.equal(d.finanzas.deudaDimensionada, false);
  });
  test('alerta de créditos incompletos con TIR, DSCR y deuda en N/D', () => {
    const a = d.alertas.find((x) => x.id === 'financiamiento-creditos')!;
    assert.equal(a.sev, 'advertencia');
    assert.equal(a.titulo, 'Créditos de la deuda incompletos: no se calcularon la TIR, el DSCR ni el LCOE');
    assert.match(a.detalle, /^Las participaciones de los créditos suman 95 %, no 100 %\. No se calcula con un valor supuesto: TIR, DSCR, LCOE, deuda dimensionada e ISR se muestran como N\/D\.$/);
    assert.ok(!d.alertas.some((x) => /DSCR/.test(x.etiqueta) && x.id !== 'financiamiento-creditos'));
  });
  test('también sin calcular si falta una condición (sin valores inventados); la no disposición es opcional', () => {
    assert.deepEqual(problemasCreditos([credito(1, 'Banco A', 100, null, 1.5)]), ['Banco A: falta la tasa anual.']);
    assert.deepEqual(problemasCreditos([credito(1, 'Banco A', 100, 7, null)]), ['Banco A: falta la comisión de estructuración.']);
    assert.deepEqual(problemasCreditos([credito(1, null, null, 7, 1.5)]), ['Crédito 1 (banco sin capturar): falta la participación.']);
    assert.deepEqual(problemasCreditos([]), ['No hay créditos capturados para la deuda senior.']);
    assert.deepEqual(problemasCreditos([credito(1, 'Banco A', 100, 7, 1.5, 'aprobado', null)]), []);
    assert.deepEqual(problemasCreditos([credito(1, 'Banco A', 100, 7, 1.5, null, 0)]), [], 'el estado no detiene el cálculo');
    assert.equal(analizar([]).resumenRentabilidad.estado, 'creditos_incompletos');
  });
});

describe('E. Crédito B "en revisión": su parte de cada desembolso no está confirmada', () => {
  const e = analizar([credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 7, 1.5, 'en_revision')]);
  const deuda = e.finanzas.fondos.filter((f: { fuente?: string }) => f.fuente === 'deuda');
  test('cada tramo se reparte 60/40 con el banco en el concepto; Σ partes = tramo', () => {
    const tramosHoy = hoy.finanzas.fondos.filter((f: { fuente?: string }) => f.fuente === 'deuda');
    assert.deepEqual(deuda.map((f: { concepto: string }) => f.concepto), [
      'Tramo 1 · primer desembolso (agotado el equity) · Banco A (60 %)', 'Tramo 1 · primer desembolso (agotado el equity) · Banco B (40 %)',
      'Tramo 2 · hito de avance de obra · Banco A (60 %)', 'Tramo 2 · hito de avance de obra · Banco B (40 %)',
    ]);
    assert.equal(deuda[0].monto + deuda[1].monto, tramosHoy[0].monto);
    assert.equal(deuda[2].monto + deuda[3].monto, tramosHoy[1].monto);
    assert.deepEqual(deuda.map((f: { monto: number }) => f.monto), [12_000_000, 8_000_000, 5_238_877, 3_492_584]);
  });
  test('confirmado = condición del desembolso Y crédito aprobado', () => {
    assert.deepEqual(deuda.map((f: { estado: string; confirmado: boolean }) => [f.estado, f.confirmado]), [
      ['Aprobado', true], // Tramo 1, Banco A aprobado
      ['En revisión', false], // Tramo 1, Banco B en revisión
      ['En revisión', false], // Tramo 2: su aprobación (entregable) sigue pendiente
      ['En revisión', false],
    ]);
  });
  test('alerta de caja: el hueco empieza antes (30 nov 2027, no 29 feb 2028) y pide confirmar la parte del Banco B', () => {
    const caja = e.alertas.find((x) => x.id === 'financiamiento-caja')!;
    const cajaHoy = hoy.alertas.find((x) => x.id === 'financiamiento-caja')!;
    assert.equal(cajaHoy.titulo, 'Hueco de caja desde el 29 feb 2028');
    assert.equal(caja.titulo, 'Hueco de caja desde el 30 nov 2027');
    assert.equal(caja.monto, 16_731_461);
    // Las fechas y montos formateados pueden traer espacios no separables
    const accion = caja.accion.replace(/[  ]/g, ' ');
    assert.ok(accion.includes('Tramo 1 · primer desembolso (agotado el equity) · Banco B (40 %) (USD 8,000,000, en revisión, desembolso 31 ago 2027)'), accion);
    assert.deepEqual(e.rentabilidad, hoy.rentabilidad, 'el estado del crédito no cambia la deuda ni la TIR');
  });
  test('con un solo crédito aprobado, los tramos quedan como hoy; en revisión, el Tramo 1 deja de estar confirmado', () => {
    assert.deepEqual(repartirDesembolsos(hoy.finanzas.fondos, [credito(1, null, 100, 7, 1.5)]), hoy.finanzas.fondos);
    const r = repartirDesembolsos(hoy.finanzas.fondos, [credito(1, 'Banco A', 100, 7, 1.5, 'en_revision')]);
    const t1 = r.find((f) => f.concepto.startsWith('Tramo 1'))!;
    assert.equal(t1.concepto, 'Tramo 1 · primer desembolso (agotado el equity)', 'con un crédito, el concepto no cambia');
    assert.deepEqual([t1.estado, t1.confirmado], ['En revisión', false]);
    assert.ok(r.filter((f) => f.fuente === 'equity').every((f) => f.confirmado), 'el equity no cambia');
  });
});

describe('Comisión por no disposición cuando manda el apalancamiento (circularidad resuelta)', () => {
  const Sap = { ...S, apalancamientoMaxPct: 50 } as Supuestos;
  const creditos = [credito(1, 'Banco A', 60, 7, 1.5, 'aprobado', 0.5), credito(2, 'Banco B', 40, 6.5, 1.0, 'aprobado', 0.3)];
  const l = analizar(creditos, Sap);
  const r = l.rentabilidad;
  test('manda el apalancamiento; deuda = 50 % de los usos (con la comisión) a menos de 1 USD; convergió', () => {
    assert.equal(r.criterioDeuda, 'apalancamiento');
    assert.equal(r.deudaConvergio, true);
    cerca(r.deuda, 0.5 * r.usos.total, 1, 'deuda contra 50 % de los usos');
    assert.ok(r.usos.noDisposicion > 0);
    cerca(r.usos.total, r.usos.capex + r.usos.idc + r.usos.comision + r.usos.dsra + r.usos.noDisposicion, 1e-6);
    // Sin la comisión, la deuda es menor: la comisión sube los usos y con ellos la deuda permitida
    const sin = analizar([credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 6.5, 1.0)], Sap).rentabilidad;
    assert.ok(r.deuda > sin.deuda);
  });
  test('la comisión por no disposición, recalculada a mano mes a mes con la deuda final, coincide', () => {
    // Mismo calendario uniforme del motor (12 meses, Alpha sin cronograma capturado → el del ejemplo); se rehace la
    // cascada: equity primero, después deuda; cargo del mes = (deuda − dispuesto) × tasa / 12 desde el NTP a la COD.
    const cal = l.calendario ?? calendarioUniforme(12);
    const n = 12, pagos = Array(n + 1).fill(0);
    for (const p of cal) pagos[Math.min(n, Math.max(0, Math.round(p.mes)))] += r.usos.capex * p.fraccion;
    pagos[0] += r.usos.comision;
    const tasa = 0.6 * 0.07 + 0.4 * 0.065, nd = 0.6 * 0.005 + 0.4 * 0.003;
    let saldo = 0, usado = 0, cargoTotal = 0;
    for (let m = 0; m <= n; m++) {
      const interes = (saldo * tasa) / 12, cargo = (Math.max(0, r.deuda - saldo) * nd) / 12;
      cargoTotal += cargo;
      const necesidad = pagos[m] + interes + cargo;
      const deEquity = Math.min(necesidad, Math.max(0, r.equity - usado));
      usado += deEquity;
      saldo += necesidad - deEquity;
    }
    cerca(cargoTotal, r.usos.noDisposicion, 1);
    assert.equal(l.condicionesCreditos!.comisionNoDisposicionPct, 0.42);
    // Por crédito, en proporción a wᵢ·fᵢ; Σ = total
    const [A, B] = l.porCredito!;
    cerca(A.comisionNoDisposicion, r.usos.noDisposicion * 0.3 / 0.42, 1e-6);
    cerca(A.comisionNoDisposicion + B.comisionNoDisposicion, r.usos.noDisposicion, 1e-6);
  });
  test('en el cronograma de ejemplo: un pago "Comisión por no disposición" en la COD; fuentes = usos', () => {
    const pago = l.finanzas.pagos.find((p: { concepto: string }) => p.concepto === 'Comisión por no disposición');
    assert.equal(pago.monto, Math.round(r.usos.noDisposicion));
    assert.equal(pago.fecha, '2028-04-15');
    assert.equal(l.finanzas.usos, l.finanzas.equity + l.finanzas.deuda);
    assert.equal(l.finanzas.usos, suma(l.finanzas.pagos.map((p: { monto: number }) => p.monto)));
  });
  test('si no converge: alerta "El dimensionamiento de la deuda no convergió" (máximo de 200 iteraciones)', () => {
    assert.equal(ITERACIONES_DEUDA, 200);
    const alertas = validarProyecto({
      proyecto: { id: 'x', name: 'X', fechaRtb: '2027-03-31' } as never, frentes: [], garantias: [],
      rentabilidad: { estado: 'calculada', deudaConvergio: false, dscrMinP50: 1.4, dscrMinP90: 1.3, covenant: 1.15 },
    });
    const a = alertas.find((x) => x.id === 'financiamiento-convergencia')!;
    assert.equal(a.titulo, 'El dimensionamiento de la deuda no convergió');
    assert.match(a.detalle, /menos de 1 USD en 200 iteraciones/);
    assert.ok(!validarProyecto({ proyecto: { id: 'x', name: 'X', fechaRtb: '2027-03-31' } as never, frentes: [], garantias: [],
      rentabilidad: { estado: 'calculada', dscrMinP50: 1.4, dscrMinP90: 1.3, covenant: 1.15 } }).some((x) => x.id === 'financiamiento-convergencia'));
  });
  test('con DSCR mandando, la comisión por no disposición no cambia la deuda (solo los usos y el equity)', () => {
    const conDscr = analizar(creditos).rentabilidad;
    const sinNd = analizar([credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 6.5, 1.0)]).rentabilidad;
    assert.equal(conDscr.criterioDeuda, 'dscr_p90');
    assert.equal(conDscr.deuda, sinNd.deuda);
    assert.ok(conDscr.usos.total > sinNd.usos.total && conDscr.equity > sinNd.equity);
  });
});

describe('Condiciones ponderadas', () => {
  test('Σ wᵢ·xᵢ; null con problemas', () => {
    assert.deepEqual(condicionesPonderadas([credito(1, 'A', 60, 7, 1.5), credito(2, 'B', 40, 6.5, 1)]),
      { pesos: [0.6, 0.4], tasaPct: 6.8, comisionEstructuracionPct: 1.3, comisionNoDisposicionPct: 0 });
    assert.equal(condicionesPonderadas([credito(1, 'A', 60, 7, 1.5)]), null);
  });
});

describe('Migración 20261023100000_creditos_deuda', () => {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => /_creditos_deuda\.sql$/.test(x))!;
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8');
  const sinComentarios = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  test('fecha posterior a 20261022100000', () => assert.ok(archivo.slice(0, 14) > '20261022100000'));
  test('tabla project_loans con unique (project_id, orden), checks y RLS de equipo', () => {
    assert.match(sinComentarios, /create table if not exists public\.project_loans/);
    assert.match(sinComentarios, /constraint project_loans_orden_unico unique \(project_id, orden\)/);
    assert.match(sinComentarios, /participacion_pct\s+numeric check \(participacion_pct > 0 and participacion_pct <= 100\)/);
    assert.match(sinComentarios, /estado\s+text check \(estado in \('aprobado', 'en_revision', 'pendiente'\)\)/);
    assert.match(sinComentarios, /alter table public\.project_loans enable row level security/);
    for (const op of ['select', 'insert', 'update', 'delete']) assert.match(sinComentarios, new RegExp(`project_loans_${op}_equipo on public\\.project_loans for ${op}`));
    assert.match(sinComentarios, /for select to authenticated using \(public\.puede_ver\(project_id\)\)/);
  });
  test('proyectos existentes: un crédito al 100 % con su tasa y comisión, aprobado, sin banco inventado', () => {
    assert.match(sinComentarios, /select a\.project_id, 1, null, 100, a\.tasa_interes_pct, a\.comision_estructuracion_pct, null, 'aprobado'/);
    assert.match(sinComentarios, /where a\.tasa_interes_pct is not null\s+and a\.comision_estructuracion_pct is not null/);
    // El alta de la migración va antes del trigger del historial (no cuenta como cambio del usuario)
    assert.ok(sinComentarios.indexOf('insert into public.project_loans') < sinComentarios.indexOf('create trigger project_loans_historial'));
  });
  test('columnas en desuso: solo un comentario (no se borran ni se cambian)', () => {
    for (const c of ['tasa_interes_pct', 'comision_estructuracion_pct']) {
      assert.match(sinComentarios, new RegExp(`comment on column public\\.project_financial_assumptions\\.${c} is 'En desuso desde 20261023: ver project_loans';`));
    }
    assert.doesNotMatch(sinComentarios, /drop column|alter table public\.project_financial_assumptions|alter table public\.project_change_log/i);
  });
  test('historial con el campo ya permitido ("supuesto"); la función no se puede ejecutar desde fuera', () => {
    assert.match(sinComentarios, /after insert or update or delete on public\.project_loans/);
    assert.ok(!/'credito'/.test(sinComentarios.replace(/'credito=(alta|baja)'/g, '')), 'no usa un campo nuevo en project_change_log');
    assert.match(sinComentarios, /revoke execute on function public\.registrar_cambio_credito\(\) from public, anon, authenticated/);
  });
});
