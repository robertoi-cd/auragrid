// Estados financieros v1 (motor): balance que cuadra todos los años, flujo de efectivo contra la caja del balance,
// ISR diferido, dividendos con reserva legal, lock-up, devolución de capital variable, liquidación y las tres TIR.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { estadosFinancieros, RESERVA_LEGAL_PCT, RESERVA_LEGAL_TOPE_PCT, NOTA_CAPITAL_VARIABLE, LIMITACIONES_ESTADOS, type EstadosFinancieros } from '../src/lib/estadosFinancieros';
import type { Supuestos } from '../src/lib/rentabilidad';
import type { Credito } from '../src/lib/creditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const credito = (orden: number, banco: string | null, p: number, r: number, c: number): Credito =>
  ({ orden, banco, participacionPct: p, tasaAnualPct: r, comisionEstructuracionPct: c, comisionNoDisposicionPct: null, estado: 'aprobado' });
const MIGRADO = credito(1, null, 100, 7, 1.5);
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;

function analizar(extra: Partial<Supuestos> = {}, creditos: Credito[] = [MIGRADO]) {
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...S, ...extra }, creditos, calcularPrecioMinimo: false });
  return { a, r: a.rentabilidad, e: a.estados! };
}
const cerca = (v: number, esperado: number, tol: number, que: string) => assert.ok(Math.abs(v - esperado) <= tol, `${que}: ${v} vs ${esperado}`);

const IVA: Partial<Supuestos> = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'local', ivaFinanciamiento: 'equity' };
const CASOS: [string, Partial<Supuestos>, Credito[]?][] = [
  ['Alpha I', {}],
  ['IVA con equity', IVA],
  ['IVA con línea (recuperación en 14 meses, cruza la COD)', { ...IVA, ivaRecuperacionMeses: 14, ivaFinanciamiento: 'linea', ivaLineaMonto: 3_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 1 }],
  ['dos bancos', {}, [credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 8.5, 1)]],
  ['reemplazo de inversores con MMRA', { reemplazoInversoresAno: 12, reemplazoInversoresUsdKwac: 40, mmraAnosFondeo: 4 }],
  ['reemplazo de inversores sin MMRA', { reemplazoInversoresAno: 12, reemplazoInversoresUsdKwac: 40 }],
  ['lock-up', { dscrLockup: 1.412 }],
  ['devolución de capital variable', { devolucionCapitalVariable: true }],
  ['devolución de capital con lock-up', { devolucionCapitalVariable: true, dscrLockup: 1.412 }],
  ['depreciación por categorías (obra civil sin terminar de deducir)', { depreciacionPorCategorias: true, depreciacionGeneracionPct: 70, depreciacionObraCivilPct: 30, depreciacionObraCivilTasaPct: 3 }],
  ['deuda a 30 años (pérdidas que caducan)', { plazoDeudaAnos: 30, ppaPlazoAnos: 30 }],
];

describe('Control: activo − pasivo − capital = 0 todos los años, y la caja del flujo de efectivo es la del balance', () => {
  for (const [nombre, extra, creditos] of CASOS) {
    test(nombre, () => {
      const { r, e } = analizar(extra, creditos);
      assert.equal(e.balance.length, r.anos.length + 1);
      for (const b of e.balance) assert.ok(Math.abs(b.control) < 1e-4, `año ${b.ano}: control ${b.control}`);
      assert.ok(e.controlMaximo < 1e-4);
      assert.equal(e.flujo[0].periodo, 'construccion');
      cerca(e.flujo[0].cajaFinal, e.balance[0].caja, 1e-4, 'caja en la COD');
      for (const f of e.flujo.slice(1)) cerca(f.cajaFinal, e.balance[f.periodo as number].caja, 1e-4, `caja año ${f.periodo}`);
      // Conservación: lo distribuido (neto de aportaciones) es lo que generó el flujo disponible
      const d = e.distribuciones;
      const distribuido = d.dividendos.reduce((x, y, i) => x + y + d.devolucionCapital[i] - d.aportaciones[i], 0);
      cerca(distribuido, r.anos.reduce((x: number, y: { flujoEquity: number }) => x + y.flujoEquity, 0), 1e-3, 'Σ distribuciones');
      // Nada negativo que no deba serlo
      for (const b of e.balance) for (const k of ['caja', 'dsra', 'mmra', 'ivaPorRecuperar', 'lineaIva', 'activoFijoNeto'] as const) assert.ok(b[k] > -1e-6, `año ${b.ano} ${k} = ${b[k]}`);
      assert.equal(e.balance.at(-1)!.caja, 0, 'la liquidación reparte toda la caja');
      // El modelo no cambia: la TIR de flujo disponible es la de siempre
      assert.equal(e.tir.flujoDisponible, r.tirEquity);
    });
  }
});

describe('Alpha I: cifras verificadas', () => {
  const { r, e } = analizar();
  test('pérdidas que caducan = hoja Impuestos (10,291,387)', () => {
    cerca(e.perdidasCaducadas, 10_291_386.68, 0.01, 'pérdidas caducadas');
    cerca(e.perdidasCaducadas, r.isrConDeuda.perdidaCaducada, 1e-6, 'contra el modelo');
  });
  test('año 1: UAI ≈ +1.26 M, ISR diferido neto ≈ 3.48 M, utilidad neta ≈ −2.22 M', () => {
    const y = e.resultados[0];
    cerca(y.utilidadAntesImpuestos, 1_261_730, 1, 'UAI');
    assert.equal(y.isrCorriente, 0);
    cerca(y.isrDiferido, 3_480_715, 1, 'ISR diferido');
    cerca(y.utilidadNeta, -2_218_985, 1, 'utilidad neta');
    // Pasivo diferido = 30 % × (valor contable del CAPEX − saldo fiscal 0) − 30 % × (pérdida pendiente − la que caducará)
    const pendiente = r.anos[0].perdidasPendientes;
    cerca(e.balance[1].isrDiferidoPasivo, 0.3 * (46_500_000 * 29 / 30) - 0.3 * (pendiente - 10_291_386.68), 1, 'pasivo diferido año 1');
  });
  test('balance de apertura (COD): activo fijo = CAPEX + IDC; deuda neta de la comisión; capital = equity', () => {
    const b = e.balance[0];
    cerca(b.activoFijoNeto, r.usos.capex + r.usos.idc + r.usos.noDisposicion, 1e-6, 'activo fijo');
    cerca(b.dsra, r.usos.dsra, 1e-6, 'DSRA');
    cerca(b.deuda, r.deuda - r.usos.comision, 1e-6, 'deuda neta');
    cerca(b.capitalAportado, r.equity, 1e-6, 'capital');
    assert.equal(b.isrDiferidoPasivo, 0);
  });
  test('depreciación contable en línea recta; ISR diferido en 0 al final; la DSRA se libera en el año 15', () => {
    for (const y of e.resultados) cerca(y.depreciacion, (r.usos.capex + r.usos.idc) / 30, 1e-6, `año ${y.ano}`);
    assert.ok(Math.abs(e.balance[30].isrDiferidoPasivo) < 1e-4 && Math.abs(e.balance[30].isrDiferidoActivo) < 1e-4);
    assert.equal(e.balance[14].dsra, r.usos.dsra);
    assert.equal(e.balance[15].dsra, 0);
    cerca(e.balance[15].deuda, 0, 1e-3, 'deuda pagada');
  });
  test('tres TIR: flujo disponible 8.15 %, dividendos y devolución ≈ flujo disponible, solo dividendos 6.31 %', () => {
    cerca(e.tir.flujoDisponible! * 100, 8.15, 0.005, 'flujo disponible');
    cerca(e.tir.soloDividendos! * 100, 6.31, 0.005, 'solo dividendos');
    cerca(e.tir.dividendosYDevolucion!, e.tir.flujoDisponible!, 0.0005, 'dividendos y devolución');
  });
  test('con la devolución de capital la caja atrapada baja', () => {
    const suma = (x: number[]) => x.reduce((a, b) => a + b, 0);
    assert.ok(suma(e.cajaAtrapada.conDevolucion) < suma(e.cajaAtrapada.soloDividendos) / 10);
    assert.ok(e.cajaAtrapada.soloDividendos.slice(0, 29).every((x) => x > 0));
  });
});

/** Reglas de dividendos en cada año del modo del estado. */
function revisarDividendos(e: EstadosFinancieros) {
  const n = e.resultados.length;
  for (let ano = 1; ano < n; ano++) {
    const antes = e.balance[ano - 1], b = e.balance[ano];
    const un = e.resultados[ano - 1].utilidadNeta;
    const separada = b.reservaLegal - antes.reservaLegal;
    assert.ok(separada <= Math.max(0, un) * RESERVA_LEGAL_PCT / 100 + 1e-6, `año ${ano}: reserva ${separada} > 5 % de ${un}`);
    // Tope: 20 % del capital social al separarla (antes de la devolución de capital del año)
    const capitalAlSeparar = antes.capitalAportado + e.distribuciones.aportaciones[ano - 1];
    if (separada > 0) assert.ok(b.reservaLegal <= capitalAlSeparar * RESERVA_LEGAL_TOPE_PCT / 100 + 1e-6, `año ${ano}: reserva sobre el tope`);
    // El dividendo nunca pasa de las utilidades disponibles: después de pagarlo, las utilidades acumuladas no son negativas
    if (e.distribuciones.dividendos[ano - 1] > 0) assert.ok(b.utilidadesAcumuladas > -1e-6, `año ${ano}: dividendo con utilidades ${b.utilidadesAcumuladas}`);
    if (e.distribuciones.bloqueado[ano - 1]) {
      assert.equal(e.distribuciones.dividendos[ano - 1], 0);
      assert.equal(e.distribuciones.devolucionCapital[ano - 1], 0);
    }
    if (!e.devolucionCapital) assert.equal(e.distribuciones.devolucionCapital[ano - 1], 0);
  }
}

describe('Dividendos (LGSM), lock-up y devolución de capital variable', () => {
  test('Alpha I solo dividendos: reserva del 5 % hasta el 20 %; sin dividendos mientras hay pérdidas acumuladas (años 1 a 3)', () => {
    const { e } = analizar();
    assert.equal(e.devolucionCapital, false);
    revisarDividendos(e);
    assert.deepEqual(e.distribuciones.dividendos.slice(0, 3), [0, 0, 0]);
    assert.ok(e.balance[3].utilidadesAcumuladas < 0);
    assert.ok(e.distribuciones.dividendos[3] > 0);
    assert.ok(e.balance[29].reservaLegal <= e.balance[29].capitalAportado * 0.2 + 1e-6);
  });
  test('lock-up: un año con DSCR bajo el de lock-up no distribuye nada, ni con devolución de capital', () => {
    for (const devolucionCapitalVariable of [false, true]) {
      const { r, e } = analizar({ dscrLockup: 1.412, devolucionCapitalVariable });
      const bloqueados = r.anos.filter((y: { dscr: number | null }) => y.dscr != null && y.dscr < 1.412).map((y: { ano: number }) => y.ano);
      assert.ok(bloqueados.length > 0);
      assert.deepEqual(e.distribuciones.bloqueado.flatMap((x, i) => (x ? [i + 1] : [])), bloqueados);
      revisarDividendos(e);
    }
  });
  test('devolución de capital: reduce el capital aportado, nunca por debajo de 0; la TIR queda cerca de la de flujo disponible', () => {
    const { e } = analizar({ devolucionCapitalVariable: true });
    assert.equal(e.devolucionCapital, true);
    revisarDividendos(e);
    assert.ok(e.balance[10].capitalAportado < e.balance[0].capitalAportado);
    for (const b of e.balance) assert.ok(b.capitalAportado > -1e-6);
    assert.ok(e.notas.includes(NOTA_CAPITAL_VARIABLE));
    assert.equal(NOTA_CAPITAL_VARIABLE, 'En una S.A.P.I. de C.V. el capital variable se reduce por acuerdo de asamblea; los reembolsos hasta el saldo de la CUCA no causan ISR (LISR art. 78). Validar con asesor.');
    cerca(e.tir.dividendosYDevolucion!, e.tir.flujoDisponible!, 0.0005, 'TIR');
  });
  test('el supuesto vacío es "no": mismas cifras que sin el campo', () => {
    const { e: sin } = analizar();
    const { e: vacio } = analizar({ devolucionCapitalVariable: null });
    assert.deepEqual(vacio.balance, sin.balance);
    assert.equal(vacio.devolucionCapital, false);
  });
  test('liquidación en el último año: reembolso del capital y dividendo de liquidación', () => {
    const { e } = analizar();
    const n = e.resultados.length;
    assert.ok(e.distribuciones.devolucionCapital[n - 1] > 0);
    cerca(e.balance[n].capitalTotal, 0, 1e-3, 'capital después de liquidar');
  });
});

describe('Las cifras actuales no cambian', () => {
  test('rentabilidad igual con o sin estados (calcularlos no modifica nada)', () => {
    const { a, r } = analizar();
    const copia = JSON.stringify(r);
    estadosFinancieros(a.supuestosCalculables!, r, a.base.mwdc);
    assert.equal(JSON.stringify(r), copia);
    cerca(r.tirEquity * 100, 8.15, 0.005, 'TIR de equity');
  });
  test('sin rentabilidad no hay estados', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: null, calcularPrecioMinimo: false });
    assert.equal(a.estados, null);
  });
  test('las limitaciones del modelo están documentadas', () => {
    assert.ok(LIMITACIONES_ESTADOS.length >= 8);
    assert.ok(LIMITACIONES_ESTADOS.some((l) => /CUFIN/.test(l)));
    assert.ok(LIMITACIONES_ESTADOS.includes('Con devolución de capital variable, el modelo puede reducir el capital casi a cero; en una S.A.P.I. de C.V. debe conservarse el capital fijo mínimo, cuya reducción requiere un proceso formal (LGSM art. 9). No modelado.'));
  });
});
