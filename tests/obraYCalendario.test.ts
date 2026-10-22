// Pruebas de la revisión final del núcleo:
//  1. Obra antes de permisos (crítica) y antes del RTB (advertencia); cronograma de ejemplo coherente con el RTB.
//  2. Intereses durante la construcción con el calendario de desembolsos y el equity primero.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { interesesConstruccion, calendarioUniforme, calcularRentabilidad } from '../src/lib/rentabilidad';
import {
  crearModeloFinanciero, calendarioPagos, FECHA_NTP_EJEMPLO, FECHA_COD_EJEMPLO, type Movimiento,
} from '../src/lib/modeloFinanciero';
import { validarProyecto, diasEntre, PERMISOS_PARA_OBRA, type Frente, type EstadoEntregable } from '../src/lib/validaciones';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_INICIALES } from '../src/lib/datosProyecto.js';

const cerca = (real: number | null | undefined, esperado: number, tol = 1e-6) =>
  assert.ok(real != null && Math.abs(real - esperado) <= tol, `esperado ${esperado}, obtenido ${real}`);
const suma = (l: { monto: number }[]) => l.reduce((s, x) => s + x.monto, 0);
const RTB = '2027-03-31';
const ALPHA = { id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000, esEjemplo: true };

// ---------------------------------------------------------------------------
// 2. Intereses durante la construcción
// ---------------------------------------------------------------------------

describe('Intereses durante la construcción: saldo dispuesto mes a mes, primero el equity', () => {
  // CAPEX 1,200 en 12 pagos de 100 (meses 0-11), equity 600, tasa 12 % (1 % mensual), COD en el mes 12.
  // Meses 0-5 paga el equity; la deuda dispone 100 en los meses 6-11 y capitaliza los intereses:
  // 1 + 2.01 + 3.0301 + 4.060401 + 5.10100501 + 6.1520150601 = 21.3535211
  const base = { capex: 1200, comision: 0, tasaAnual: 0.12, meses: 12, calendario: calendarioUniforme(12) };
  test('caso a mano: 21.3535211', () => cerca(interesesConstruccion({ ...base, equity: 600 }), 21.3535211, 1e-6));
  test('menos intereses que el 50 % promedio sobre la deuda (600 × 12 % × 50 % = 36)', () => {
    assert.ok(interesesConstruccion({ ...base, equity: 600 }) < 600 * 0.12 * 0.5);
  });
  test('sin equity, la deuda paga todo desde el mes 0 (más intereses)', () => {
    assert.ok(interesesConstruccion({ ...base, equity: 0 }) > interesesConstruccion({ ...base, equity: 600 }));
  });
  test('si el equity cubre todo el CAPEX, no hay intereses', () => assert.equal(interesesConstruccion({ ...base, equity: 1200 }), 0));
  test('la comisión se paga en el mes 0 y consume equity primero', () => {
    assert.ok(interesesConstruccion({ ...base, equity: 600, comision: 100 }) > interesesConstruccion({ ...base, equity: 600 }));
  });
  test('pagos concentrados al final generan menos intereses que al inicio', () => {
    const alInicio = interesesConstruccion({ ...base, equity: 0, calendario: [{ mes: 0, fraccion: 1 }] });
    const alFinal = interesesConstruccion({ ...base, equity: 0, calendario: [{ mes: 11, fraccion: 1 }] });
    assert.ok(alFinal < alInicio);
    cerca(alFinal, 1200 * 0.01, 1e-9); // un mes de intereses
  });
});

describe('Calendario de pagos', () => {
  const ejemplo = crearModeloFinanciero(ALPHA, FRENTES_INICIALES as unknown as Frente[]);
  const cal = calendarioPagos(ejemplo.pagos, 12, ejemplo.fechaNtp);
  test('ejemplo de Alpha I: mes 0 = NTP y la puesta en marcha en el mes 12 (COD)', () => {
    assert.deepEqual(cal.map((c) => c.mes), [0, 2, 4, 6, 7, 10, 12]);
    cerca(cal.reduce((s, c) => s + c.fraccion, 0), 1, 1e-12);
    cerca(cal[0].fraccion, 4_800_000 / 46_500_000, 1e-12); // anticipo de equipos
  });
  test('los costos financieros (comisión, intereses, DSRA) no son parte del calendario de obra', () => {
    const conCostos = crearModeloFinanciero(ALPHA, [], [], { deuda: 28_000_000, idc: 600_000, comision: 420_000, dsra: 1_700_000 });
    assert.deepEqual(calendarioPagos(conCostos.pagos, 12, conCostos.fechaNtp), cal);
  });
  test('cronograma capturado sin NTP: mes 0 = primer pago de obra; los posteriores a la COD cuentan en la COD', () => {
    const pagos: Movimiento[] = [
      { tipo: 'pago', concepto: 'A', fecha: '2027-05-01', monto: 50, estado: 'Programado' },
      { tipo: 'pago', concepto: 'B', fecha: '2029-01-01', monto: 50, estado: 'Programado' },
    ];
    assert.deepEqual(calendarioPagos(pagos, 12), [{ mes: 0, fraccion: 0.5 }, { mes: 12, fraccion: 0.5 }]);
  });
  test('sin pagos: uniforme en los meses de construcción', () => {
    assert.deepEqual(calendarioPagos([], 4), calendarioUniforme(4));
  });
});

describe('Alpha I con los intereses de construcción mes a mes', () => {
  const ejemplo = crearModeloFinanciero(ALPHA, FRENTES_INICIALES as unknown as Frente[]);
  const cal = calendarioPagos(ejemplo.pagos, 12, ejemplo.fechaNtp);
  const r = calcularRentabilidad(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5, cal);
  test('la deuda no cambia (la fija el DSCR con P90): USD 28.73 M', () => cerca(r.deuda, 28_731_461, 1));
  test('IDC ≈ USD 616 mil (antes USD 1.006 M con el 50 % promedio)', () => {
    cerca(r.usos.idc, 616_080, 1_000);
    assert.ok(r.usos.idc < r.deuda * 0.07 * 0.5);
  });
  test('intereses consistentes con el equity final (la iteración convergió)', () => {
    cerca(r.usos.idc, interesesConstruccion({ capex: 46_500_000, comision: r.usos.comision, equity: r.equity, tasaAnual: 0.07, meses: 12, calendario: cal }), 0.05);
  });
  test('equity = usos − deuda y fuentes = usos = pagos en el cronograma dimensionado', () => {
    const f = crearModeloFinanciero(ALPHA, [], [], { deuda: r.deuda, idc: r.usos.idc, comision: r.usos.comision, dsra: r.usos.dsra });
    assert.equal(f.equity + f.deuda, f.usos);
    assert.equal(suma(f.fondos), f.usos);
    assert.equal(suma(f.pagos), f.usos);
  });
});

// ---------------------------------------------------------------------------
// 1. Obra antes de permisos y antes del RTB
// ---------------------------------------------------------------------------

describe('Cronograma de ejemplo coherente con el RTB', () => {
  const f = crearModeloFinanciero(ALPHA, FRENTES_INICIALES as unknown as Frente[]);
  test('cierre financiero y NTP en o después del RTB (31 mar 2027)', () => {
    assert.ok(FECHA_NTP_EJEMPLO >= RTB);
    assert.equal(f.fondos[0].fecha, FECHA_NTP_EJEMPLO);
    assert.ok(f.pagos.every((p) => p.fecha >= FECHA_NTP_EJEMPLO));
  });
  test('12 meses de construcción y COD en el segundo trimestre de 2028', () => {
    assert.ok(Math.abs(diasEntre(FECHA_NTP_EJEMPLO, FECHA_COD_EJEMPLO) - 365.25) < 2);
    assert.ok(FECHA_COD_EJEMPLO >= '2028-04-01' && FECHA_COD_EJEMPLO <= '2028-06-30');
    assert.equal(f.pagos[f.pagos.length - 1].fecha, FECHA_COD_EJEMPLO);
  });
  test('primero el equity, después la deuda', () => {
    assert.deepEqual(f.fondos.map((x) => x.fuente), ['equity', 'equity', 'deuda', 'deuda']);
    assert.deepEqual(f.fondos.map((x) => x.fecha), [...f.fondos.map((x) => x.fecha)].sort());
  });
  test('mismas cifras: CAPEX 46.5 M, contrato de equipos 24 M, anticipo 20 %; fuentes = usos = pagos', () => {
    assert.equal(suma(f.pagos), 46_500_000);
    assert.equal(suma(f.fondos), 46_500_000);
    assert.deepEqual([f.contratoEquipos, f.anticipoEquipos], [24_000_000, 4_800_000]);
  });
  test('sin alertas de obra antes de permisos ni antes del RTB', () => {
    const a = validarProyecto({ proyecto: { name: 'Alpha I', fechaRtb: RTB }, frentes: FRENTES_INICIALES as unknown as Frente[], garantias: [], finanzas: f, hoy: '2026-10-12' });
    assert.ok(!a.some((x) => x.id.startsWith('financiamiento-obra')));
  });
});

const TITULOS_PERMISOS = ['Resolutivo de MIA', 'Estudio técnico justificativo (cambio de uso de suelo)', 'Licencia de construcción'];

describe('Obra programada antes de permiso (crítica) y antes del RTB (advertencia)', () => {
  const permisos = (estado: EstadoEntregable = 'curso', fechas = ['2026-12-15', '2027-01-20', '2027-02-10']): Frente[] =>
    [{ nombre: 'Permisos', items: PERMISOS_PARA_OBRA.map((codigo, i) => [TITULOS_PERMISOS[i], estado, 'R', fechas[i] ?? null, { codigo }]) }];
  const pago = (fecha: string, extra: Partial<Movimiento> = {}): Movimiento => ({ tipo: 'pago', concepto: `Pago ${fecha}`, fecha, monto: 1_000_000, estado: 'Programado', ...extra });
  const alertas = (pagos: Movimiento[], frentes = permisos(), fechaRtb: string | null = RTB) => {
    const f = { ...crearModeloFinanciero({ capacityMw: 10, capex: 10_000_000, esEjemplo: false }), pagos, fondos: [], origenCronograma: 'capturado' as const };
    return validarProyecto({ proyecto: { name: 'P', fechaRtb }, frentes, garantias: [], finanzas: f, hoy: '2026-10-12' })
      .filter((a) => a.id.startsWith('financiamiento-obra'));
  };

  test('pago de obra antes del resolutivo de MIA = crítica "Obra programada antes de permiso"', () => {
    const a = alertas([pago('2026-12-01')]);
    const critica = a.find((x) => x.sev === 'critico')!;
    assert.equal(critica.titulo, 'Obra programada antes de permiso');
    assert.match(critica.detalle, /Resolutivo de MIA/);
  });
  test('también cuenta un pago de equipos antes de la licencia de construcción', () => {
    const a = alertas([pago('2027-02-01', { partida: 'equipos' })]);
    assert.match(a.find((x) => x.sev === 'critico')!.detalle, /Licencia de construcción/);
    assert.doesNotMatch(a.find((x) => x.sev === 'critico')!.detalle, /Resolutivo de MIA \(/);
  });
  test('después de todos los permisos y del RTB: sin alertas', () => assert.deepEqual(alertas([pago('2027-04-15')]), []));
  test('permisos completos: no hay crítica aunque el pago sea antes de su fecha', () => {
    assert.ok(!alertas([pago('2026-11-01')], permisos('completo')).some((x) => x.sev === 'critico'));
  });
  test('permiso sin fecha y no completo: crítica (no se sabe cuándo se obtendrá)', () => {
    const a = alertas([pago('2027-06-01')], permisos('pendiente', ['2026-12-15', '', '2027-02-10'].map((x) => x || null) as string[]));
    assert.match(a.find((x) => x.sev === 'critico')!.detalle, /sin fecha compromiso/);
  });
  test('los costos financieros (comisión) no cuentan como obra', () => {
    assert.deepEqual(alertas([pago('2026-11-01', { partida: 'financiero' })]), []);
  });
  test('pago de construcción antes del RTB (con permisos ya completos) = advertencia', () => {
    const a = alertas([pago('2027-03-01')], permisos('completo'));
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['advertencia', 'Pagos de construcción antes del RTB']]);
  });
  test('anticipo de equipos marcado como "compromiso anticipado": sin advertencia de RTB', () => {
    assert.deepEqual(alertas([pago('2027-03-01', { partida: 'equipos', esAnticipo: true, compromisoAnticipado: true })], permisos('completo')), []);
  });
  test('anticipo sin la marca, o la marca en un pago que no es anticipo: sí advierte', () => {
    assert.equal(alertas([pago('2027-03-01', { partida: 'equipos', esAnticipo: true })], permisos('completo')).length, 1);
    assert.equal(alertas([pago('2027-03-01', { partida: 'equipos', compromisoAnticipado: true })], permisos('completo')).length, 1);
  });
  test('el compromiso anticipado no exime de la regla de permisos', () => {
    const a = alertas([pago('2026-12-01', { partida: 'equipos', esAnticipo: true, compromisoAnticipado: true })]);
    assert.ok(a.some((x) => x.sev === 'critico'));
  });
});
