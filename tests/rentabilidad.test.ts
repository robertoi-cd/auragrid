// Pruebas del cálculo de rentabilidad (TIR, DSCR, LCOE, ISR, deuda esculpida, estructuras). Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  tir, valorPresente, isrConPerdidas, depreciacionPorAno, variantePorEstructura, calcularRentabilidad, compararEstructuras,
  compararDepreciacion, calcularSensibilidad, precioMinimoPpa, segurosEstimados, interesesConstruccion, calendarioUniforme,
  SUPUESTOS_DEFAULT, type Supuestos,
} from '../src/lib/rentabilidad';
import { crearModeloFinanciero as crearModelo, calendarioPagos as calendarioDe } from '../src/lib/modeloFinanciero';

// Calendario de pagos del cronograma de ejemplo de Alpha I (el que usa la app para los intereses de construcción)
const MODELO_ALPHA = crearModelo({ id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000, esEjemplo: true });
const CALENDARIO_ALPHA = calendarioDe(MODELO_ALPHA.pagos, 12, MODELO_ALPHA.fechaNtp);
import { SUPUESTOS_ILUSTRATIVOS, FUENTES, fuenteDe } from '../src/lib/fuentesSupuestos';
import { validarProyecto, type ResumenRentabilidad } from '../src/lib/validaciones';
import { crearModeloFinanciero, calcularFlujoAcumulado } from '../src/lib/modeloFinanciero';

const cerca = (real: number | null | undefined, esperado: number, tolerancia = 1e-6) => {
  assert.ok(real != null, 'el valor no debe ser null');
  assert.ok(Math.abs((real as number) - esperado) <= tolerancia, `esperado ${esperado}, obtenido ${real}`);
};

// Supuestos simples para casos calculables a mano: sin ISR, sin degradación, sin escalamientos, 100 % PPA.
// 1 MWdc × 2,000 kWh/kWp = 2,000 MWh/año; 50 USD/MWh = 100,000 USD/año de CFADS (P90: 92,000).
const simple = (cambios: Partial<Supuestos> = {}): Supuestos => ({
  ...SUPUESTOS_DEFAULT,
  estructuraBase: 'fija', estructuraSeleccionada: 'fija',
  rendimientoFijaKwhKwp: 2000, degradacionPct: 0, vidaUtilAnos: 10, mesesConstruccion: 12,
  ppaPrecio: 50, ppaPorcentaje: 100, ppaPlazoAnos: 10, ppaEscalamientoPct: 0,
  mercadoPrecio: 50, mercadoEscalamientoPct: 0, celPrecio: 0,
  opexAnual: 0, arrendamientoAnual: 0, opexEscalamientoPct: 0,
  tasaInteresPct: 10, plazoDeudaAnos: 5, isrPct: 0, depreciacionEsquema: 'ano1', depreciacionAno1Pct: 100, tasaDescuentoPct: 0,
  ...cambios,
});
const calcular = (s: Supuestos, capex = 1_000_000) => calcularRentabilidad(s, 'fija', capex, 1);
/** VP de una anualidad de `pago` durante `n` años a la tasa `r`. */
const vpAnualidad = (pago: number, r: number, n: number) => (pago * (1 - (1 + r) ** -n)) / r;

describe('Finanzas básicas', () => {
  test('TIR de [-100, 110] = 10 %', () => cerca(tir([-100, 110]), 0.1));
  test('TIR de [-100, 0, 121] = 10 %', () => cerca(tir([-100, 0, 121]), 0.1));
  test('TIR sin cambio de signo = null', () => assert.equal(tir([100, 50]), null));
  test('valor presente de [0, 110] al 10 % = 100', () => cerca(valorPresente([0, 110], 0.1), 100));
});

describe('ISR con pérdidas fiscales (10 años, las más antiguas primero)', () => {
  test('la pérdida se consume antes de pagar ISR', () => {
    const p: [number, number][] = [];
    assert.equal(isrConPerdidas(-100, 1, 0.3, p), 0);
    assert.equal(isrConPerdidas(30, 2, 0.3, p), 0);
    assert.equal(isrConPerdidas(30, 3, 0.3, p), 0);
    assert.equal(isrConPerdidas(30, 4, 0.3, p), 0);
    cerca(isrConPerdidas(30, 5, 0.3, p), 6); // quedaban 10 de pérdida: grava 20 × 30 %
  });
  test('la pérdida no usada caduca a los 10 años y se registra lo que caducó', () => {
    const p: [number, number][] = [];
    const caducado = { monto: 0 };
    isrConPerdidas(-100, 1, 0.3, p, caducado);
    for (let ano = 2; ano <= 11; ano++) assert.equal(isrConPerdidas(5, ano, 0.3, p, caducado), 0); // usa 50 de 100
    cerca(isrConPerdidas(10, 12, 0.3, p, caducado), 3); // los 50 restantes caducaron
    cerca(caducado.monto, 50);
  });
});

describe('Depreciación configurable', () => {
  const dep = (c: Partial<Supuestos>) => depreciacionPorAno(simple({ vidaUtilAnos: 12, ...c }), 1000);
  test('100 % en el año 1 (por defecto)', () => assert.deepEqual(dep({}), [1000, ...Array(11).fill(0)]));
  test('tasa anual del 10 %: 100 por año durante 10 años', () => assert.deepEqual(dep({ depreciacionEsquema: 'anual' }), [...Array(10).fill(100), 0, 0]));
  test('70 % en el año 1 y el resto al 10 % anual', () => assert.deepEqual(dep({ depreciacionAno1Pct: 70 }), [700, 100, 100, 100, ...Array(8).fill(0)]));
  test('nunca se deprecia más que la inversión', () => assert.equal(dep({ depreciacionEsquema: 'anual', depreciacionTasaAnualPct: 30 }).reduce((a, b) => a + b, 0), 1000));
});

describe('Variantes por estructura (base: un eje, CAPEX 46.5 M, 62.5 MWdc)', () => {
  const s = { ...SUPUESTOS_DEFAULT };
  const v = (e: 'fija' | 'un_eje' | 'dos_ejes') => variantePorEstructura(s, e, 46_500_000, 62.5);
  test('rendimientos: 1,810 / 2,172 / 2,345.8 kWh/kWp', () => {
    cerca(v('fija').rendimientoKwhKwp, 1810);
    cerca(v('un_eje').rendimientoKwhKwp, 2172);
    cerca(v('dos_ejes').rendimientoKwhKwp, 2345.76, 1e-6);
  });
  test('P50 = rendimiento × MWdc', () => cerca(v('un_eje').p50Mwh, 135_750));
  test('CAPEX: fija 42.125 M, un eje 46.5 M (registrado), dos ejes 55.875 M', () => {
    assert.equal(v('fija').capex, 42_125_000);
    assert.equal(v('un_eje').capex, 46_500_000);
    assert.equal(v('dos_ejes').capex, 55_875_000);
  });
  test('O&M extra relativo a la base: fija -125,000; dos ejes +312,500', () => {
    cerca(v('fija').omExtraAnual, -125_000);
    cerca(v('un_eje').omExtraAnual, 0);
    cerca(v('dos_ejes').omExtraAnual, 312_500);
  });
});

describe('Flujos de operación', () => {
  test('degradación compuesta desde el año 2', () => {
    const r = calcular(simple({ degradacionPct: 1 }));
    cerca(r.anos[0].energiaMwh, 2000);
    cerca(r.anos[1].energiaMwh, 1980);
    cerca(r.anos[2].energiaMwh, 1960.2);
  });
  test('al terminar el PPA la energía se vende a precio de mercado', () => {
    const r = calcular(simple({ ppaPlazoAnos: 3, ppaPrecio: 40, mercadoPrecio: 60 }));
    cerca(r.anos[2].ingresos, 2000 * 40);
    cerca(r.anos[3].ingresos, 2000 * 60);
  });
  test('reparto PPA / mercado y CELs', () => {
    const r = calcular(simple({ ppaPorcentaje: 80, ppaPrecio: 40, mercadoPrecio: 60, celPrecio: 5 }));
    cerca(r.anos[0].ingresos, 2000 * (0.8 * 40 + 0.2 * 60 + 5));
  });
  test('TIR de proyecto = TIR de [-CAPEX, flujo × 10 años] (no depende de la deuda)', () => {
    const r = calcular(simple());
    cerca(r.tirProyecto, tir([-1_000_000, ...Array(10).fill(100_000)])!, 1e-9);
  });
  test('LCOE = CAPEX / energía con descuento 0', () => {
    const r = calcular(simple({ vidaUtilAnos: 1, plazoDeudaAnos: 1 }), 100_000);
    cerca(r.lcoe, 100_000 / 2000, 1e-9);
  });
  test('construcción de 2 años reparte el CAPEX en 2 flujos (y baja la TIR si es positiva)', () => {
    const r1 = calcular(simple({ mesesConstruccion: 12, ppaPrecio: 80 }));
    const r2 = calcular(simple({ mesesConstruccion: 24, ppaPrecio: 80 }));
    cerca(r1.tirProyecto, tir([-1_000_000, ...Array(10).fill(160_000)])!, 1e-9);
    cerca(r2.tirProyecto, tir([-500_000, -500_000, ...Array(10).fill(160_000)])!, 1e-9);
    assert.ok((r2.tirProyecto as number) < (r1.tirProyecto as number));
  });
});

describe('Deuda esculpida: manda el DSCR', () => {
  // CFADS P50 100,000 ÷ 1.30 = 76,923; CFADS P90 92,000 ÷ 1.20 = 76,667 → manda P90 todos los años
  const r = calcular(simple());
  const servicio = 92_000 / 1.2;
  const deuda = vpAnualidad(servicio, 0.1, 5);
  test('manda el DSCR con P90', () => assert.equal(r.criterioDeuda, 'dscr_p90'));
  test('servicio = CFADS P90 ÷ 1.20 en cada año del plazo y 0 después', () => {
    r.anos.slice(0, 5).forEach((a) => cerca(a.servicioDeuda, servicio, 1e-6));
    r.anos.slice(5).forEach((a) => assert.equal(a.servicioDeuda, 0));
    assert.equal(r.anos[5].dscr, null);
  });
  test('deuda = VP del servicio a la tasa de la deuda', () => cerca(r.deuda, deuda, 1e-3));
  test('DSCR mínimo P90 = 1.20x exacto y P50 = 100,000 ÷ servicio', () => {
    cerca(r.dscrMinP90, 1.2, 1e-9);
    cerca(r.dscrMinP50, 100_000 / servicio, 1e-9);
  });
  test('usos = CAPEX + intereses en construcción + comisión 1.5 % + DSRA 6 meses', () => {
    // Intereses con el calendario (uniforme sin cronograma), primero el equity: consistentes con el equity final
    cerca(r.usos.idc, interesesConstruccion({ capex: 1_000_000, comision: r.usos.comision, equity: r.equity, tasaAnual: 0.1, meses: 12, calendario: calendarioUniforme(12) }), 1e-3);
    assert.ok(r.usos.idc < deuda * 0.1 * 0.5, 'equity primero: menos intereses que el 50 % promedio');
    cerca(r.usos.comision, deuda * 0.015, 1e-3);
    cerca(r.usos.dsra, servicio / 2, 1e-6);
    cerca(r.usos.total, 1_000_000 + r.usos.idc + r.usos.comision + r.usos.dsra, 1e-6);
  });
  test('equity = usos − deuda y la deuda queda bajo el tope del 70 %', () => {
    cerca(r.equity, r.usos.total - r.deuda, 1e-6);
    assert.ok(r.deudaPct < 0.7);
    cerca(r.deudaPct, r.deuda / r.usos.total, 1e-12);
  });
  test('la deuda se paga completa al final del plazo', () => cerca(r.saldoFinalDeuda, 0, 1e-3));
  test('la DSRA se libera al equity en el último año del plazo', () => {
    cerca(r.anos[4].flujoEquity, 100_000 - servicio + r.usos.dsra, 1e-6);
    cerca(r.anos[3].flujoEquity, 100_000 - servicio, 1e-6);
  });
  test('si P90 = P50 manda el DSCR con P50 (1.30x)', () => {
    const p50 = calcular(simple({ p90Pct: 100 }));
    assert.equal(p50.criterioDeuda, 'dscr_p50');
    cerca(p50.dscrMinP50, 1.3, 1e-9);
  });
});

describe('Deuda esculpida: manda el apalancamiento', () => {
  // A 500 USD/MWh la CFADS (1 M/año) admitiría más deuda que el 70 % de los usos
  const r = calcular(simple({ ppaPrecio: 500, mercadoPrecio: 500 }));
  test('manda el apalancamiento y la deuda = 70 % de los usos', () => {
    assert.equal(r.criterioDeuda, 'apalancamiento');
    cerca(r.deudaPct, 0.7, 1e-5);
    assert.ok(r.capacidadDeuda.anoAAno > r.capacidadDeuda.tope);
  });
  test('el DSCR queda por encima de los de dimensionamiento', () => {
    assert.ok(r.dscrMinP90! > 1.2 && r.dscrMinP50! > 1.3);
  });
  test('equity = usos − deuda y saldo final 0', () => {
    cerca(r.equity, r.usos.total - r.deuda, 1e-6);
    cerca(r.saldoFinalDeuda, 0, 1e-3);
  });
  test('apalancamiento máximo 0 % = sin deuda: TIR de equity = TIR de proyecto', () => {
    const sin = calcular(simple({ apalancamientoMaxPct: 0 }));
    assert.equal(sin.deuda, 0);
    cerca(sin.tirEquity, sin.tirProyecto!, 1e-9);
  });
});

describe('Deuda esculpida: ingresos sin contrato al DSCR de mercado (1.75x)', () => {
  test('dentro del PPA, el 20 % sin contrato se dimensiona a 1.75x', () => {
    // Mismo precio PPA y mercado: 20 % de la CFADS es de mercado. P90: 92,000 × (0.8/1.20 + 0.2/1.75)
    const r = calcular(simple({ ppaPorcentaje: 80 }));
    const servicio = 92_000 * (0.8 / 1.2 + 0.2 / 1.75);
    cerca(r.anos[0].servicioDeuda, servicio, 1e-6);
    cerca(r.dscrMinP90, 1 / (0.8 / 1.2 + 0.2 / 1.75), 1e-9);
  });
  test('después del PPA todo el servicio se dimensiona a 1.75x', () => {
    const r = calcular(simple({ ppaPlazoAnos: 3 }));
    cerca(r.anos[2].servicioDeuda, 92_000 / 1.2, 1e-6);
    cerca(r.anos[3].servicioDeuda, 92_000 / 1.75, 1e-6);
    cerca(r.anos[4].servicioDeuda, 92_000 / 1.75, 1e-6);
    assert.equal(r.plazoDeudaAnos, 5);
    assert.equal(r.ppaPlazoAnos, 3);
  });
});

describe('ISR: inicio y pérdida que caduca', () => {
  // Sin deuda, CFADS 50,000/año y 1 M depreciado en el año 1: pérdida de 950,000.
  // Años 2-11 usan 500,000; en el año 12 caducan 450,000 y empieza el ISR.
  const r = calcular(simple({ isrPct: 30, ppaPrecio: 25, mercadoPrecio: 25, vidaUtilAnos: 15, ppaPlazoAnos: 15, apalancamientoMaxPct: 0 }));
  test('el ISR empieza en el año 12', () => {
    assert.equal(r.isrSinDeuda.inicio, 12);
    assert.equal(r.isrConDeuda.inicio, 12);
  });
  test('caducan 450,000 de pérdida sin usarse', () => cerca(r.isrSinDeuda.perdidaCaducada, 450_000, 1e-6));
  test('año 12: ISR = 50,000 × 30 %', () => cerca(r.anos[11].isrSinDeuda, 15_000, 1e-6));
});

describe('Alpha I con los supuestos iniciales', () => {
  const comparacion = compararEstructuras(SUPUESTOS_DEFAULT, 46_500_000, 62.5);
  const unEje = comparacion.find((r) => r.estructura === 'un_eje')!;
  test('TIR de proyecto con un eje entre 7 % y 10 %', () => assert.ok(unEje.tirProyecto! > 0.07 && unEje.tirProyecto! < 0.1));
  test('manda el DSCR con P90 y la deuda queda entre 50 % y 60 % de los usos', () => {
    assert.equal(unEje.criterioDeuda, 'dscr_p90');
    assert.ok(unEje.deudaPct > 0.5 && unEje.deudaPct < 0.6, `deuda ${unEje.deudaPct}`);
  });
  test('plazo de 15 años = PPA', () => assert.equal(unEje.plazoDeudaAnos, unEje.ppaPlazoAnos));
  test('DSCR mínimo: P90 ≥ 1.20x y P50 ≥ 1.30x (los de dimensionamiento)', () => {
    assert.ok(unEje.dscrMinP90! >= 1.2 - 1e-9 && unEje.dscrMinP50! >= 1.3 - 1e-9);
  });
  test('el DSCR con P90 queda por debajo del de P50 en el peor año', () => assert.ok(unEje.dscrMinP90! < unEje.dscrMinP50!));
  test('con deuda el ISR empieza en el año 12 y caducan entre 11 y 12 M de pérdida; sin deuda, año 10 y nada caduca', () => {
    assert.equal(unEje.isrConDeuda.inicio, 12);
    assert.ok(unEje.isrConDeuda.perdidaCaducada > 11e6 && unEje.isrConDeuda.perdidaCaducada < 12e6);
    assert.equal(unEje.isrSinDeuda.inicio, 10);
    assert.equal(unEje.isrSinDeuda.perdidaCaducada, 0);
  });
  test('con estos supuestos, un eje tiene la mejor TIR de proyecto de las 3 estructuras', () => {
    assert.equal([...comparacion].sort((a, b) => b.tirProyecto! - a.tirProyecto!)[0].estructura, 'un_eje');
  });
  test('comparación de depreciación: con tasa anual no caduca pérdida y la TIR de equity sube', () => {
    const [inmediata, anual] = compararDepreciacion(SUPUESTOS_DEFAULT, 'un_eje', 46_500_000, 62.5);
    assert.equal(inmediata.esquema, 'ano1');
    assert.equal(anual.esquema, 'anual');
    cerca(inmediata.rentabilidad.tirEquity, unEje.tirEquity!, 1e-12); // el esquema por defecto es el inmediato
    assert.ok(inmediata.rentabilidad.isrConDeuda.perdidaCaducada > 0);
    assert.equal(anual.rentabilidad.isrConDeuda.perdidaCaducada, 0);
    assert.ok(anual.rentabilidad.tirEquity! > inmediata.rentabilidad.tirEquity!);
  });
});

describe('Seguros separados del OPEX', () => {
  test('los seguros se suman a los costos con el mismo escalamiento', () => {
    const r = calcular(simple({ opexAnual: 1000, segurosAnual: 500, opexEscalamientoPct: 2 }));
    cerca(r.anos[0].costos, 1500, 1e-9);
    cerca(r.anos[1].costos, 1500 * 1.02, 1e-9);
  });
  test('Alpha I ilustrativo (7 %, OPEX 520k + seguros 130k, calendario del ejemplo): TIR de equity ≈ 8.15 % y deuda ≈ 58.3 % de los usos', () => {
    const r = calcularRentabilidad(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5, CALENDARIO_ALPHA);
    cerca(r.anos[0].costos, 520_000 + 130_000 + 125_000, 1e-6);
    cerca(r.tirEquity, 0.0815, 0.001);
    cerca(r.deudaPct, 0.583, 0.002);
    assert.equal(r.criterioDeuda, 'dscr_p90');
  });
});

describe('Seguros estimados para proyectos nuevos y aviso de seguros en cero', () => {
  test('0.28 % del CAPEX, a miles: Alpha I (46.5 M) → 130,000 (su valor ilustrativo)', () => {
    assert.equal(segurosEstimados(46_500_000), 130_000);
    assert.equal(segurosEstimados(96_450_000), 270_000);
  });
  test('CAPEX inválido o cero → 0', () => {
    assert.equal(segurosEstimados(0), 0);
    assert.equal(segurosEstimados(Number.NaN), 0);
  });
  const v = (segurosAnual?: number) => validarProyecto({
    proyecto: { name: 'P', fechaRtb: '2027-03-31' }, frentes: [], garantias: [], hoy: '2026-10-12',
    rentabilidad: { estado: 'calculada', dscrMinP50: 1.4, dscrMinP90: 1.28, covenant: 1.15, dscrDimensionamientoP50: 1.3, dscrDimensionamientoP90: 1.2, plazoDeudaAnos: 15, ppaPlazoAnos: 15, segurosAnual },
  }).filter((a) => a.id === 'financiamiento-seguros');
  test('seguros en 0 = advertencia "Seguros sin capturar"', () => {
    const a = v(0);
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'advertencia');
    assert.equal(a[0].titulo, 'Seguros sin capturar');
  });
  test('con seguros capturados (o sin el dato) no hay aviso', () => {
    assert.equal(v(130_000).length, 0);
    assert.equal(v(undefined).length, 0);
  });
});

describe('Sensibilidad PPA × CAPEX', () => {
  const s = SUPUESTOS_ILUSTRATIVOS;
  const t = calcularSensibilidad(s, 'un_eje', 46_500_000, 62.5);
  const actual = calcularRentabilidad(s, 'un_eje', 46_500_000, 62.5);
  test('filas 38-54 y columnas 0.65, 0.70, 0.744 (actual, reemplaza a 0.74) y 0.80', () => {
    assert.deepEqual(t.precios, [38, 42, 46, 50, 54]);
    assert.equal(t.capexWdc.length, 4);
    cerca(t.capexWdc[2], 46_500_000 / 62.5e6, 1e-12);
    assert.deepEqual([t.filaActual, t.columnaActual], [1, 2]);
  });
  test('la celda actual coincide con el tablero', () => {
    const c = t.celdas[t.filaActual][t.columnaActual];
    cerca(c.tirEquity, actual.tirEquity!, 1e-12);
    cerca(c.deudaPct, actual.deudaPct, 1e-12);
  });
  test('cada celda = cálculo directo con ese PPA y CAPEX', () => {
    const r = calcularRentabilidad({ ...s, ppaPrecio: 50 }, 'un_eje', 0.7 * 62.5e6, 62.5);
    cerca(t.celdas[3][1].tirEquity, r.tirEquity!, 1e-12);
    cerca(t.celdas[3][1].deudaPct, r.deudaPct, 1e-12);
  });
  test('más precio o menos CAPEX = más TIR de equity', () => {
    assert.ok(t.celdas[4][2].tirEquity! > t.celdas[0][2].tirEquity!);
    assert.ok(t.celdas[1][0].tirEquity! > t.celdas[1][3].tirEquity!);
  });
  test('con PPA alto y CAPEX bajo manda el apalancamiento (70 %)', () => {
    assert.equal(t.celdas[4][0].criterioDeuda, 'apalancamiento');
    cerca(t.celdas[4][0].deudaPct, 0.7, 1e-4);
  });
  test('con otra estructura el CAPEX por Wdc es el de esa estructura', () => {
    const fija = calcularSensibilidad(s, 'fija', 46_500_000, 62.5);
    cerca(fija.capexWdc[fija.columnaActual], 42_125_000 / 62.5e6, 1e-12);
    const r = calcularRentabilidad(s, 'fija', 46_500_000, 62.5);
    cerca(fija.celdas[fija.filaActual][fija.columnaActual].tirEquity, r.tirEquity!, 1e-12);
  });
  test('si el valor actual no está cerca de la serie se agrega en orden', () => {
    const otra = calcularSensibilidad({ ...s, ppaPrecio: 44 }, 'un_eje', 56_250_000, 62.5); // 0.90 USD/Wdc
    assert.deepEqual(otra.precios, [38, 42, 44, 46, 50, 54]);
    assert.equal(otra.filaActual, 2);
    assert.equal(otra.capexWdc.length, 5);
    assert.equal(otra.columnaActual, 4);
  });
});

describe('Precio mínimo de PPA para una TIR de equity objetivo', () => {
  test('caso a mano: sin deuda ni ISR, TIR 10 % a 10 años → flujo 162,745.39/año → PPA 81.38 (al centavo hacia arriba)', () => {
    const s = simple({ apalancamientoMaxPct: 0 });
    const p = precioMinimoPpa(s, 'fija', 1_000_000, 1, 0.1);
    const exacto = (1_000_000 * 0.1) / (1 - 1.1 ** -10) / 2000; // 81.3727
    assert.equal(p.precio, Math.ceil(exacto * 100) / 100);
    assert.ok(p.rentabilidad!.tirEquity! >= 0.1);
  });
  test('Alpha I ilustrativo: TIR 12 % → PPA ≈ USD 50.8/MWh, y un centavo menos no alcanza', () => {
    const p = precioMinimoPpa(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5, undefined, CALENDARIO_ALPHA);
    assert.equal(p.tirObjetivo, 0.12); // objetivo por defecto de los supuestos
    cerca(p.precio, 50.81, 0.05);
    assert.ok(p.rentabilidad!.tirEquity! >= 0.12);
    const menos = calcularRentabilidad({ ...SUPUESTOS_ILUSTRATIVOS, ppaPrecio: p.precio! - 0.01 }, 'un_eje', 46_500_000, 62.5, CALENDARIO_ALPHA);
    assert.ok(menos.tirEquity! < 0.12);
  });
  test('la deuda se redimensiona con el precio encontrado', () => {
    const p = precioMinimoPpa(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5);
    const directo = calcularRentabilidad({ ...SUPUESTOS_ILUSTRATIVOS, ppaPrecio: p.precio! }, 'un_eje', 46_500_000, 62.5);
    cerca(p.rentabilidad!.deuda, directo.deuda, 1e-6);
    assert.ok(p.rentabilidad!.deuda > calcularRentabilidad(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5).deuda);
  });
  test('coherente con la tabla de sensibilidad: entre las filas de USD 50 y 54 en la columna actual', () => {
    const t = calcularSensibilidad(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5);
    assert.ok(t.celdas[3][t.columnaActual].tirEquity! < 0.12 && t.celdas[4][t.columnaActual].tirEquity! > 0.12);
  });
  test('si el PPA actual ya alcanza el objetivo, el precio mínimo queda por debajo', () => {
    const p = precioMinimoPpa(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5, 0.05);
    assert.ok(p.precio! < SUPUESTOS_ILUSTRATIVOS.ppaPrecio);
  });
  test('objetivo inalcanzable → sin precio', () => {
    const p = precioMinimoPpa(simple({ apalancamientoMaxPct: 0 }), 'fija', 10_000_000, 1, 0.5);
    assert.equal(p.precio, null);
    assert.equal(p.rentabilidad, null);
  });
  test('objetivos altos (TIR que pasaría de 100 % con precios extremos) sí se encuentran', () => {
    const p = precioMinimoPpa(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5, 0.4);
    assert.ok(p.precio != null && p.rentabilidad!.tirEquity! >= 0.4);
  });
});

describe('Puente de la deuda de Alpha I (cambios de supuestos con el motor actual)', () => {
  const deuda = (s: Partial<Supuestos>) => calcularRentabilidad({ ...SUPUESTOS_DEFAULT, ...s }, 'un_eje', 46_500_000, 62.5).deuda;
  const inicio = deuda({}); // 8 %, OPEX 600k, DSCR de mercado siempre
  const tasa = deuda({ tasaInteresPct: 7 }) - inicio;
  const seguros = deuda({ tasaInteresPct: 7, opexAnual: 520_000, segurosAnual: 130_000 }) - deuda({ tasaInteresPct: 7 });
  test('tasa 8 % → 7 %: +USD 1.62 M de deuda', () => cerca(tasa, 1.62e6, 0.01e6));
  test('seguros separados (+50,000/año): −USD 0.38 M', () => cerca(seguros, -0.378e6, 0.01e6));
  test('inicio + efectos = deuda actual de Alpha I (USD 28.73 M)', () => {
    const actual = calcularRentabilidad(SUPUESTOS_ILUSTRATIVOS, 'un_eje', 46_500_000, 62.5).deuda;
    cerca(inicio + tasa + seguros, actual, 1e-6);
    cerca(actual, 28.73e6, 0.01e6);
  });
});

describe('Fuentes de los supuestos ilustrativos', () => {
  test('con el valor ilustrativo se muestra su fuente', () => {
    assert.match(fuenteDe(['segurosAnual'], SUPUESTOS_ILUSTRATIVOS), /0\.28 % del CAPEX/);
    assert.match(fuenteDe(['rendimientoFijaKwhKwp', 'gananciaUnEjePct'], SUPUESTOS_ILUSTRATIVOS), /PVGIS/);
  });
  test('si el usuario cambia el valor, la fuente ya no aplica', () => {
    assert.equal(fuenteDe(['tasaInteresPct', 'plazoDeudaAnos'], { ...SUPUESTOS_ILUSTRATIVOS, tasaInteresPct: 9 }), 'Modificado por el usuario.');
  });
  test('todos los campos editables tienen fuente', () => {
    const conFuente = new Set(FUENTES.flatMap(([c]) => c));
    const sinFuente = (Object.keys(SUPUESTOS_ILUSTRATIVOS) as (keyof Supuestos)[]).filter((c) => !conFuente.has(c));
    // Solo las opciones de estructura (no son valores numéricos con fuente)
    assert.deepEqual(sinFuente.sort(), ['estructuraBase', 'estructuraSeleccionada']);
  });
});

describe('Modelo financiero con la deuda dimensionada', () => {
  const r = calcularRentabilidad(SUPUESTOS_DEFAULT, 'un_eje', 46_500_000, 62.5);
  const dimension = { deuda: r.deuda, idc: r.usos.idc, comision: r.usos.comision, dsra: r.usos.dsra };
  const f = crearModeloFinanciero({ id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000 }, [], [], dimension);
  const suma = (l: { monto: number }[]) => l.reduce((s, x) => s + x.monto, 0);
  test('fuentes = usos = pagos (al dólar)', () => {
    assert.equal(f.equity + f.deuda, f.usos);
    assert.equal(suma(f.fondos), f.usos);
    assert.equal(suma(f.pagos), f.usos);
    assert.equal(f.usos, f.capex + f.idc + f.comision + f.dsra);
  });
  test('deuda y costos financieros del dimensionamiento', () => {
    assert.equal(f.deuda, Math.round(r.deuda));
    assert.ok(f.deudaDimensionada);
    cerca(f.equityPct, f.equity / f.usos, 1e-12);
  });
  test('tramo 1 = 20 M y tramo 2 = el resto de la deuda', () => {
    assert.deepEqual(f.fondos.filter((x) => x.fuente === 'deuda').map((t) => t.monto), [20_000_000, f.deuda - 20_000_000]);
  });
  test('los costos financieros aparecen como pagos del cronograma de ejemplo', () => {
    assert.ok(f.pagos.some((p) => p.concepto.includes('Comisión') && p.monto === f.comision));
    assert.ok(f.pagos.some((p) => p.concepto.includes('Intereses') && p.monto === f.idc));
    assert.ok(f.pagos.some((p) => p.concepto.includes('DSRA') && p.monto === f.dsra));
  });
  test('sin descuadres en las alertas', () => {
    const alertas = validarProyecto({ proyecto: { name: 'Alpha I', fechaRtb: '2027-03-31' }, frentes: [], garantias: [], finanzas: f, hoy: '2026-10-11' });
    assert.ok(!alertas.some((a) => a.id === 'financiamiento-estructura'));
  });
  test('con el tramo 2 confirmado no hay hueco de caja', () => {
    const conTramo2 = { ...f, fondos: f.fondos.map((x) => ({ ...x, confirmado: true })) };
    assert.ok(!calcularFlujoAcumulado(conTramo2).some((p) => p.hueco > 0));
  });
  test('proyecto real sin cronograma: equity + deuda = usos, sin crítica de estructura', () => {
    const real = crearModeloFinanciero({ id: 'x', capacityMw: 50, capex: 46_500_000, esEjemplo: false }, [], [], dimension);
    assert.equal(real.equity + real.deuda, real.usos);
    const alertas = validarProyecto({ proyecto: { name: 'X', fechaRtb: '2027-03-31' }, frentes: [], garantias: [], finanzas: real, hoy: '2026-10-11' });
    assert.ok(!alertas.some((a) => a.id === 'financiamiento-estructura'));
  });
});

describe('Alertas de rentabilidad en validarProyecto()', () => {
  const proyecto = { name: 'Alpha I', fechaRtb: '2027-03-31' };
  const v = (rentabilidad: ResumenRentabilidad) =>
    // Reglas del DSCR y del plazo ("Sin cola de PPA" tiene sus propias pruebas en escenarios.test.ts)
    validarProyecto({ proyecto, frentes: [], garantias: [], rentabilidad, hoy: '2026-10-11' }).filter((a) => a.categoria === 'Financiamiento' && a.id !== 'financiamiento-cola-ppa');
  const base: ResumenRentabilidad = {
    estado: 'calculada', dscrMinP50: 1.4, anoDscrMinP50: 1, dscrMinP90: 1.28, anoDscrMinP90: 1, covenant: 1.15,
    dscrDimensionamientoP50: 1.3, dscrDimensionamientoP90: 1.2, plazoDeudaAnos: 15, ppaPlazoAnos: 15, estructura: 'Seguidor a un eje',
  };
  test('DSCR en o sobre los de dimensionamiento = sin alerta', () => assert.equal(v(base).length, 0));
  test('DSCR exactamente en el de dimensionamiento = sin alerta', () => assert.equal(v({ ...base, dscrMinP50: 1.3, dscrMinP90: 1.2 }).length, 0));
  test('DSCR P50 bajo el covenant = crítica', () => {
    const a = v({ ...base, dscrMinP50: 1.1, dscrMinP90: 1.0 });
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'critico');
    assert.match(a[0].titulo, /P50 de 1\.10x.*1\.15x/);
  });
  test('solo el DSCR P90 bajo el covenant = advertencia', () => {
    const a = v({ ...base, dscrMinP50: 1.25, dscrMinP90: 1.1 });
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'advertencia');
    assert.match(a[0].titulo, /P90 de 1\.10x.*1\.15x/);
  });
  test('DSCR entre el covenant y el de dimensionamiento = advertencia de holgura', () => {
    const a = v({ ...base, dscrMinP50: 1.22, dscrMinP90: 1.18 });
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'advertencia');
    assert.equal(a[0].etiqueta, 'DSCR sin holgura');
    assert.match(a[0].detalle, /P50 1\.22x.*P90 1\.18x/);
  });
  test('plazo de la deuda mayor al PPA = advertencia', () => {
    const a = v({ ...base, plazoDeudaAnos: 18 });
    assert.equal(a.length, 1);
    assert.equal(a[0].id, 'financiamiento-plazo');
    assert.equal(a[0].sev, 'advertencia');
    assert.match(a[0].detalle, /3 años/);
  });
  test('Alpha I con plazo de 18 años: advertencia de plazo y ninguna de DSCR', () => {
    const s = { ...SUPUESTOS_DEFAULT, plazoDeudaAnos: 18 };
    const r = calcularRentabilidad(s, 'un_eje', 46_500_000, 62.5);
    const a = v({
      estado: 'calculada', dscrMinP50: r.dscrMinP50, anoDscrMinP50: r.anoDscrMinP50, dscrMinP90: r.dscrMinP90, anoDscrMinP90: r.anoDscrMinP90,
      covenant: s.dscrCovenant, dscrDimensionamientoP50: s.dscrDimensionamientoP50, dscrDimensionamientoP90: s.dscrDimensionamientoP90,
      plazoDeudaAnos: r.plazoDeudaAnos, ppaPlazoAnos: r.ppaPlazoAnos,
    });
    assert.deepEqual(a.map((x) => x.id), ['financiamiento-plazo']);
  });
  test('sin supuestos = advertencia (y la TIR se muestra N/D)', () => {
    const a = v({ estado: 'sin_supuestos' });
    assert.equal(a[0].sev, 'advertencia');
    assert.match(a[0].titulo, /Faltan los supuestos/);
  });
});
