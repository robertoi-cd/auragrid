// IVA de construcción, fase 3 (Excel): hoja "IVA" mensual, columnas de IVA en "Cronograma de caja", necesidad temporal
// de IVA en "Fuentes y usos" y supuestos con "Sin capturar", con las mismas cifras que la app (analizarProyecto).
// Con el IVA apagado, el libro es idéntico al de antes (mismas hojas y mismo contenido aunque haya datos de IVA guardados).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet, CellValue } from 'exceljs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { calcularFlujoAcumulado } from '../src/lib/modeloFinanciero';
import { crearLibroFinanciero, hojasDelLibro, HOJAS, filasCronograma, filasFlujo, type DatosAnalisis } from '../src/lib/exportarFinanzas';
import { tir, tirFechada, valorPresenteFechado } from '../src/lib/rentabilidad';
import { movimientosIva, flujosFechadosIva, type ResultadoIva, NOTA_IVA, NOTA_TASA_IVA, NOTA_TASA_LINEA_IVA } from '../src/lib/iva';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { Supuestos } from '../src/lib/rentabilidad';
import type { Garantia } from '../src/lib/validaciones';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const GARANTIAS: Garantia[] = [
  { id: 'g1', tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
];
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const IVA: Partial<Supuestos> = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'importacion', ivaFinanciamiento: 'equity' };
const LINEA: Partial<Supuestos> = { ...IVA, ivaFinanciamiento: 'linea', ivaLineaMonto: 4_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 1 };

/** Mismo camino que App.jsx: analizarProyecto → datos del Excel (con el costo del IVA). */
function datos(supuestos: Supuestos) {
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos, calcularPrecioMinimo: false });
  const f = a.finanzas;
  const d: DatosAnalisis = {
    proyecto: { nombre: ALPHA.name, estado: ALPHA.state, capacidad: '50 MWac / 62.5 MWdc', esEjemplo: true, fechaRtb: ALPHA.fechaRtb },
    supuestos, rentabilidad: a.rentabilidad, cronograma: { pagos: f.pagos, fondos: f.fondos, origen: f.origenCronograma },
    sensibilidad: null, costoIva: a.costoIva,
    fuentesUsos: { capex: f.capex, idc: f.idc, comision: f.comision, dsra: f.dsra, usos: f.usos, deuda: f.deuda, equity: f.equity },
    generado: new Date('2026-10-13T16:45:00Z'), version: '1.0.0 (prueba)', exportadoPor: 'banco@prueba.example',
  };
  return { a, d };
}

async function releer(d: DatosAnalisis): Promise<Workbook> {
  const wb = await crearLibroFinanciero(ExcelJS, d);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await wb.xlsx.writeBuffer() as ArrayBuffer);
  return leido;
}

const numero = (v: CellValue): number => (typeof v === 'number' ? v : v && typeof v === 'object' && 'result' in v ? Number(v.result ?? 0) : NaN);
function fila(ws: Worksheet, etiqueta: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(etiqueta)) return r;
  throw new Error(`No hay fila «${etiqueta}» en ${ws.name}`);
}
const valorDe = (ws: Worksheet, etiqueta: string, c = 2) => ws.getCell(fila(ws, etiqueta), c).value;
const columna = (ws: Worksheet, filaEnc: number, titulo: string) => {
  for (let c = 1; c <= ws.columnCount; c++) if (String(ws.getCell(filaEnc, c).value ?? '').startsWith(titulo)) return c;
  throw new Error(`No hay columna «${titulo}» en ${ws.name}`);
};

/** Controles: ROUND(<suma y resta de celdas>,2) evaluado con los valores del libro (los SUM, sumando su rango). */
function evaluar(ws: Worksheet, f: string): number {
  const m = f.match(/^ROUND\((.+),2\)$/);
  assert.ok(m, `control con forma ROUND(…,2): ${f}`);
  let total = 0;
  for (const [, signo, ref] of m![1].matchAll(/([+-]?)([A-Z]+\d+)/g)) {
    const v = ws.getCell(ref).value;
    let n = numero(v);
    const s = v && typeof v === 'object' && 'formula' in v ? String(v.formula).match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/) : null;
    if (s) { n = 0; for (let r = Number(s[2]); r <= Number(s[4]); r++) n += numero(ws.getCell(`${s[1]}${r}`).value) || 0; }
    total += signo === '-' ? -n : n;
  }
  return Math.round(total * 100) / 100 || 0;
}
function controles(ws: Worksheet) {
  const lista: { descripcion: string; valor: number }[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = String(ws.getCell(r, 1).value ?? '');
    if (a.startsWith('Control:')) lista.push({ descripcion: a, valor: evaluar(ws, (ws.getCell(r, 2).value as { formula: string }).formula) });
  }
  return lista;
}
/** Todo el texto de una hoja (para buscar notas). */
const textoHoja = (ws: Worksheet) => { const t: string[] = []; ws.eachRow((r) => r.eachCell((c) => { t.push(String(typeof c.value === 'object' && c.value && 'result' in c.value ? c.value.result : c.value)); })); return t.join('\n'); };

describe('IVA apagado: el libro idéntico a hoy', () => {
  test('las mismas 9 hojas; la hoja "IVA" solo con el IVA activo', () => {
    assert.deepEqual(hojasDelLibro({ supuestos: S }), [...HOJAS]);
    assert.deepEqual(hojasDelLibro({ supuestos: { ...S, ...IVA } as Supuestos }), ['Portada', 'Resumen', 'Supuestos', 'Fuentes y usos', 'Deuda', 'Flujo anual', 'Impuestos', 'Cronograma de caja', 'IVA', 'Sensibilidad']);
  });
  test('con datos de IVA guardados pero apagado: el mismo XML que sin ellos (salvo la hora de escritura)', async () => {
    const xml = async (s: Supuestos) => {
      const wb = await crearLibroFinanciero(ExcelJS, datos(s).d);
      const zip = await (await import('jszip')).default.loadAsync(await wb.xlsx.writeBuffer());
      const partes: string[] = [];
      for (const n of Object.keys(zip.files).sort()) if (!zip.files[n].dir && n !== 'docProps/core.xml') partes.push(n, await zip.files[n].async('string'));
      return partes.join('\n');
    };
    assert.equal(await xml({ ...S, ...LINEA, ivaActivo: false } as Supuestos), await xml(S));
  });
  test('sin IVA: ni la hoja, ni columnas, ni filas de IVA; el cronograma sin cambios', async () => {
    const wb = await releer(datos(S).d);
    assert.deepEqual(wb.worksheets.map((w) => w.name), [...HOJAS]);
    for (const ws of wb.worksheets) assert.doesNotMatch(textoHoja(ws), /IVA/, ws.name);
    assert.equal(wb.getWorksheet('Cronograma de caja')!.getRow(5).cellCount, 12);
    const { d } = datos(S);
    assert.deepEqual(filasCronograma(d.cronograma.pagos, d.cronograma.fondos, null), filasCronograma(d.cronograma.pagos, d.cronograma.fondos));
    assert.ok(filasCronograma(d.cronograma.pagos, d.cronograma.fondos).every((f) => !('iva' in f)));
  });
});

describe('IVA con equity (caso de verificación): las cifras de la app', () => {
  const { a, d } = datos({ ...S, ...IVA } as Supuestos);
  const iva: ResultadoIva = a.rentabilidad.iva!;
  let wb: Workbook;
  before(async () => { wb = await releer(d); });

  test('hoja IVA: mensual, totales 5,952,000 pagado y recuperado; saldo de feb 2028 al cierre 4,288,000', () => {
    const ws = wb.getWorksheet('IVA')!;
    assert.equal(ws.getCell(5, 1).value, 'Mes');
    const meses = iva.meses.map((m) => m.mes);
    assert.deepEqual(meses.map((_, i) => ws.getCell(6 + i, 1).value), meses);
    const total = fila(ws, 'Total');
    assert.equal(numero(ws.getCell(total, 2).value), 5_952_000);
    assert.equal(numero(ws.getCell(total, 3).value), 5_952_000);
    const feb = 6 + meses.indexOf('2028-02');
    assert.equal(ws.getCell(feb, 2).value, 1_216_000);
    assert.equal(ws.getCell(feb, 4).value, 4_864_000); // pico: saldo al inicio del mes
    assert.equal(ws.getCell(feb, 5).value, 4_288_000);
    assert.equal(ws.getCell(6 + meses.indexOf('2027-06'), 2).value, 1_088_000);
    assert.equal(ws.getCell(6 + meses.length - 1, 5).value, 0);
  });
  test('controles de la hoja IVA: pagado − recuperado − saldo final = 0 y suma de flujos = 0', () => {
    const c = controles(wb.getWorksheet('IVA')!);
    assert.deepEqual(c.map((x) => x.descripcion), [
      'Control: IVA pagado − recuperado − saldo final', 'Control: Suma de los flujos del IVA (proyecto)', 'Control: Σ IVA pagado − IVA total',
      'Control: Valor presente de los flujos al equity a la TIR con IVA', 'Control: Valor presente de los flujos del proyecto a la TIR con IVA',
    ]);
    assert.ok(c.every((x) => x.valor === 0), JSON.stringify(c));
  });
  test('Fuentes y usos: necesidad temporal de IVA fuera de los usos; pico, COD, costo a la TIR objetivo (258,002) y TIR en pp', () => {
    const ws = wb.getWorksheet('Fuentes y usos')!;
    assert.equal(numero(ws.getCell(10, 2).value), d.fuentesUsos.usos, 'los usos no cambian');
    assert.equal(controles(ws)[0].valor, 0, 'Fuentes − Usos sigue en 0');
    assert.ok(fila(ws, 'Necesidad temporal de IVA') > 19);
    assert.equal(valorDe(ws, 'IVA pagado durante la construcción'), 5_952_000);
    assert.equal(valorDe(ws, 'Pico de necesidad'), 4_864_000);
    assert.equal(valorDe(ws, 'Pico de necesidad', 3), 'feb 2028 · saldo por recuperar al inicio del mes');
    assert.equal(valorDe(ws, 'IVA pendiente de recuperar en la COD'), 1_216_000);
    assert.equal(valorDe(ws, 'IVA pendiente de recuperar en la COD', 3), 'COD: abr 2028');
    assert.equal(valorDe(ws, 'Compromiso máximo de equity por IVA'), iva.compromisoMaximoEquity);
    assert.equal(Math.round(Number(valorDe(ws, 'Costo financiero del IVA (valor presente al NTP)'))), 258_002);
    assert.equal(valorDe(ws, 'Costo financiero del IVA (valor presente al NTP)', 3), 'Flujos de IVA a cargo del equity descontados a la TIR objetivo de equity (12.00 %) · costo de oportunidad, no es un gasto');
    assert.equal((Number(valorDe(ws, 'Impacto en la TIR de equity'))).toFixed(2), '-0.07');
    assert.equal((Number(valorDe(ws, 'Impacto en la TIR de proyecto'))).toFixed(2), '-0.05');
    assert.equal(ws.getCell(fila(ws, 'Impacto en la TIR de equity'), 2).numFmt, '+0.00" pp";-0.00" pp";0.00" pp"');
    assert.throws(() => fila(ws, 'Monto máximo de la línea'), 'sin línea: no hay filas de la línea');
  });
  test('Cronograma de caja: columnas de IVA y el hueco incluye el IVA (9,947,461 en la COD, el máximo de la app)', () => {
    const ws = wb.getWorksheet('Cronograma de caja')!;
    const cPagado = columna(ws, 5, 'IVA pagado'), cDev = columna(ws, 5, 'Devolución de IVA'), cHueco = columna(ws, 5, 'Hueco de caja al cierre del mes');
    assert.deepEqual([cPagado, cDev], [10, 11], 'después de los fondos del mes: los controles de antes no se mueven');
    const total = fila(ws, 'Total');
    assert.equal(numero(ws.getCell(total, cPagado).value), 5_952_000);
    assert.equal(numero(ws.getCell(total, cDev).value), 5_952_000);
    assert.equal(ws.getCell(fila(ws, '2028-04'), cHueco).value, 9_947_461);
    assert.equal(ws.getCell(fila(ws, '2028-06'), cHueco).value, 8_731_461, 'recuperado el IVA, queda el Tramo 2 pendiente');
    assert.equal(valorDe(ws, 'Hueco de caja máximo por fecha'), 9_947_461);
    const c = controles(ws);
    assert.ok(c.some((x) => x.descripcion === 'Control: Σ IVA pagado − IVA total'));
    assert.ok(c.every((x) => x.valor === 0), JSON.stringify(c));
  });
  test('Supuestos: filas de IVA con su fuente y la nota del asesor fiscal; la línea "No aplica" con equity', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const r = fila(ws, 'IVA de construcción');
    const filas = Array.from({ length: 9 }, (_, i) => [ws.getCell(r + i, 2).value, ws.getCell(r + i, 3).value]);
    assert.deepEqual(filas, [
      ['IVA de construcción', 'Activo'], ['Tasa de IVA', 16], ['CAPEX sujeto a IVA', 80], ['Origen del equipo', 'Importación directa'],
      ['Meses de recuperación del IVA', 4], ['Financiamiento del IVA', 'Equity'],
      ['Línea IVA: monto máximo (equivalente en USD)', 'No aplica (IVA financiado con equity)'], ['Línea IVA: tasa anual', 'No aplica (IVA financiado con equity)'], ['Línea IVA: comisión', 'No aplica (IVA financiado con equity)'],
    ]);
    assert.equal(ws.getCell(r + 1, 5).value, `LIVA art. 1. ${NOTA_TASA_IVA}`);
    const texto = textoHoja(ws);
    assert.ok(texto.includes(`IVA de construcción: ${NOTA_IVA}`));
    assert.ok(!texto.includes(NOTA_TASA_LINEA_IVA), 'la nota de la línea solo con línea');
  });
  test('Portada: la hoja IVA en el contenido', () => {
    assert.ok(textoHoja(wb.getWorksheet('Portada')!).includes('8. IVA\n9. Sensibilidad'));
  });
});

describe('IVA con línea de crédito', () => {
  const { a, d } = datos({ ...S, ...LINEA } as Supuestos);
  let wb: Workbook;
  before(async () => { wb = await releer(d); });
  test('hoja IVA: columnas de la línea, intereses + comisión = nominal de la app (294,400), controles en 0', () => {
    const ws = wb.getWorksheet('IVA')!;
    const total = fila(ws, 'Total');
    const intereses = numero(ws.getCell(total, columna(ws, 5, 'Línea IVA: intereses')).value);
    const comision = numero(ws.getCell(total, columna(ws, 5, 'Línea IVA: comisión')).value);
    assert.equal(intereses + comision, a.costoIva!.nominalLinea);
    assert.equal(a.costoIva!.nominalLinea, 294_400);
    const c = controles(ws);
    assert.ok(c.some((x) => x.descripcion === 'Control: Línea IVA: Σ disposición − Σ repago − saldo final'));
    assert.ok(c.every((x) => x.valor === 0), JSON.stringify(c));
  });
  test('control mensual con línea: disposición + IVA que pone el equity = IVA pagado, mes por mes (fórmula por fila)', () => {
    const ws = wb.getWorksheet('IVA')!;
    const cMes = columna(ws, 5, 'Control del mes');
    const [cDisp, cEq] = [columna(ws, 5, 'Línea IVA: disposición'), columna(ws, 5, 'IVA que pone el equity')];
    const meses = a.rentabilidad.iva!.meses;
    meses.forEach((m: { pagado: number }, i: number) => {
      const r = 6 + i;
      const v = ws.getCell(r, cMes).value as { formula: string };
      assert.equal(v.formula, `ABS(ROUND(${String.fromCharCode(64 + cDisp)}${r}+${String.fromCharCode(64 + cEq)}${r}-B${r},2))`);
      // Recalculado con los valores de la hoja, no con el resultado guardado
      assert.equal(Math.round((numero(ws.getCell(r, cDisp).value) + numero(ws.getCell(r, cEq).value) - numero(ws.getCell(r, 2).value)) * 100) / 100 || 0, 0);
      assert.equal(numero(ws.getCell(r, 2).value), m.pagado);
    });
    const feb = 6 + meses.findIndex((m: { mes: string }) => m.mes === '2028-02');
    assert.deepEqual([ws.getCell(feb, cDisp).value, ws.getCell(feb, cEq).value, ws.getCell(feb, 2).value], [352_000, 864_000, 1_216_000]);
    const c = controles(ws).find((x) => x.descripcion === 'Control: Cada mes, disposición + IVA con equity = IVA pagado');
    assert.equal(c?.valor, 0);
  });
  test('Fuentes y usos y Supuestos: monto (equivalente en USD), nominal y la nota de pesos / tipo de cambio', () => {
    const fu = wb.getWorksheet('Fuentes y usos')!;
    assert.equal(valorDe(fu, 'Monto máximo de la línea (equivalente en USD)'), 4_000_000);
    assert.equal(valorDe(fu, 'Monto máximo de la línea (equivalente en USD)', 3), NOTA_TASA_LINEA_IVA);
    assert.equal(valorDe(fu, 'Intereses + comisión de la línea (nominal)'), 294_400);
    assert.doesNotMatch(String(valorDe(fu, 'Costo financiero del IVA (valor presente al NTP)', 3)), /costo de oportunidad/);
    const su = wb.getWorksheet('Supuestos')!;
    assert.equal(su.getCell(fila(su, 'IVA de construcción') + 6, 3).value, 4_000_000);
    assert.ok(textoHoja(su).includes(NOTA_TASA_LINEA_IVA));
  });
  test('Cronograma de caja: columnas de la línea y su control', () => {
    const ws = wb.getWorksheet('Cronograma de caja')!;
    assert.equal(columna(ws, 5, 'Línea IVA: disposición'), 12);
    assert.equal(columna(ws, 5, 'Línea IVA: repago'), 13);
    assert.ok(controles(ws).every((x) => x.valor === 0));
    // El mismo hueco máximo que la gráfica y la alerta de la app (finanzas con los movimientos del IVA)
    const app = Math.max(...calcularFlujoAcumulado(a.finanzas).map((p) => p.hueco));
    assert.equal(valorDe(ws, 'Hueco de caja máximo por fecha'), Math.round(app));
    // Al cierre de cada mes, el hueco nunca pasa del máximo por fecha
    const filas = filasCronograma(d.cronograma.pagos, d.cronograma.fondos, movimientosIva(a.rentabilidad.iva!));
    assert.ok(filas.every((f) => f.hueco <= app + 0.01));
  });
});

describe('IVA activo con datos incompletos: "Sin capturar" y lo que falta, sin cifras supuestas', () => {
  const s = { ...S, ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: null, ivaOrigenEquipo: null, ivaFinanciamiento: 'linea', ivaLineaMonto: null, ivaLineaTasaPct: 12, ivaLineaComisionPct: null } as unknown as Supuestos;
  const { d } = datos(s);
  let wb: Workbook;
  before(async () => { wb = await releer(d); });
  test('Supuestos: los vacíos dicen "Sin capturar"', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const r = fila(ws, 'IVA de construcción');
    const valor = (etiqueta: string) => { for (let i = 0; i < 9; i++) if (ws.getCell(r + i, 2).value === etiqueta) return ws.getCell(r + i, 3).value; return undefined; };
    assert.equal(valor('Meses de recuperación del IVA'), 'Sin capturar');
    assert.equal(valor('Origen del equipo'), 'Sin capturar');
    assert.equal(valor('Línea IVA: monto máximo (equivalente en USD)'), 'Sin capturar');
    assert.equal(valor('Línea IVA: comisión'), 'Sin capturar');
    assert.equal(valor('Línea IVA: tasa anual'), 12);
  });
  test('hoja IVA y Fuentes y usos: lo que falta; ningún monto de IVA; el cronograma sin columnas de IVA', () => {
    for (const nombre of ['IVA', 'Fuentes y usos']) {
      const t = textoHoja(wb.getWorksheet(nombre)!);
      assert.ok(t.includes('Faltan datos del IVA: no se calcula con valores supuestos y la TIR queda en N/D.'), nombre);
      assert.ok(t.includes('• Falta plazo de recuperación de IVA.'), nombre);
      assert.ok(t.includes('• Falta la comisión de la línea de crédito IVA (0 % es válido).'), nombre);
    }
    assert.throws(() => fila(wb.getWorksheet('Fuentes y usos')!, 'Pico de necesidad'));
    assert.equal(wb.getWorksheet('Cronograma de caja')!.getRow(5).cellCount, 12);
  });
});

// Reconciliación de la TIR: con la hoja se reproduce la TIR del Resumen (y la de "Flujo anual" es la TIR sin IVA)
for (const [caso, s, tirEquity] of [['equity', { ...S, ...IVA }, '8.0767'], ['línea', { ...S, ...LINEA }, '8.0278']] as const) {
  describe(`Reconciliación de la TIR en la hoja IVA (${caso})`, () => {
    const { a, d } = datos(s as Supuestos);
    let wb: Workbook;
    before(async () => { wb = await releer(d); });
    const filaDe = (ws: Worksheet, etiqueta: string) => fila(ws, etiqueta);
    test('TIR sin IVA = IRR de "Flujo anual" (la misma columna), efecto en pp y TIR con IVA = Resumen', () => {
      const ws = wb.getWorksheet('IVA')!;
      const fa = wb.getWorksheet('Flujo anual')!;
      const rSin = filaDe(ws, 'TIR sin IVA'), rEf = filaDe(ws, 'Efecto del IVA'), rCon = filaDe(ws, 'TIR con IVA');
      for (const [c, columnaFlujo, con, sin] of [
        [2, 'Q', a.rentabilidad.tirEquity, a.costoIva!.tirEquitySinIva], [3, 'P', a.rentabilidad.tirProyecto, a.costoIva!.tirProyectoSinIva],
      ] as const) {
        const v = ws.getCell(rSin, c).value as { formula: string; result: number };
        const m = v.formula.match(/^IRR\('Flujo anual'!([A-Z])(\d+):([A-Z])(\d+)\)$/)!;
        assert.equal(m[1], columnaFlujo);
        // La columna referida es la del flujo correcto y su TIR es la TIR sin IVA de la app
        const flujos = Array.from({ length: Number(m[4]) - Number(m[2]) + 1 }, (_, i) => numero(fa.getCell(`${m[1]}${Number(m[2]) + i}`).value));
        assert.match(String(fa.getCell(5, c === 2 ? 17 : 16).value), c === 2 ? /Flujo al equity/ : /Flujo del proyecto/);
        assert.equal(fa.getCell(Number(m[4]) + 1, 1).value, 'Total', 'el rango cubre todos los años');
        assert.ok(Math.abs(tir(flujos)! - sin!) < 1e-9);
        assert.ok(Math.abs(v.result - sin!) < 1e-9);
        assert.equal(ws.getCell(rCon, c).value, con);
        assert.equal((ws.getCell(rEf, c).value as { formula: string }).formula, `(${String.fromCharCode(64 + c)}${rCon}-${String.fromCharCode(64 + c)}${rSin})*100`);
      }
      assert.equal((Number(ws.getCell(rCon, 2).value) * 100).toFixed(4), tirEquity);
      assert.equal(numero(wb.getWorksheet('Resumen')!.getCell(fila(wb.getWorksheet('Resumen')!, 'TIR de equity'), 2).value), a.rentabilidad.tirEquity);
    });
    test('tablas de flujos: anuales en t = k, IVA en meses/12; su TIR es la del Resumen y el VP a esa TIR da 0', () => {
      const ws = wb.getWorksheet('IVA')!;
      for (const [titulo, con, nIva] of [
        ['Flujos al equity a la TIR con IVA', a.rentabilidad.tirEquity, flujosFechadosIva(a.rentabilidad.iva!).equity.length],
        ['Flujos del proyecto a la TIR con IVA', a.rentabilidad.tirProyecto, flujosFechadosIva(a.rentabilidad.iva!).proyecto.length],
      ] as const) {
        const enc = filaDe(ws, titulo) + 1;
        const flujos: { t: number; monto: number; origen: string }[] = [];
        for (let r = enc + 1; ws.getCell(r, 1).value !== 'Total'; r++) {
          flujos.push({ origen: String(ws.getCell(r, 1).value), t: Number(ws.getCell(r, 3).value), monto: Number(ws.getCell(r, 4).value) });
          assert.match((ws.getCell(r, 5).value as { formula: string }).formula, /^1\/\(1\+\$[BC]\$\d+\)\^C\d+$/);
          assert.equal((ws.getCell(r, 6).value as { formula: string }).formula, `D${r}*E${r}`);
        }
        const anuales = flujos.filter((f) => f.origen === 'Flujo anual');
        assert.equal(anuales.length, filasFlujo(a.rentabilidad).length);
        assert.ok(anuales.every((f, k) => f.t === k), 'periodo k en t = k');
        const deIva = flujos.filter((f) => f.origen === 'IVA');
        assert.equal(deIva.length, nIva);
        assert.ok(deIva.every((f) => Math.abs(f.t * 12 - Math.round(f.t * 12)) < 1e-12), 'IVA en meses/12');
        // Con solo la tabla de la hoja se reproduce la TIR con IVA
        assert.ok(Math.abs(tirFechada(flujos)! - con!) < 1e-9);
        assert.ok(Math.abs(valorPresenteFechado(flujos, con!)) < 0.01);
        const c = controles(ws).find((x) => x.descripcion === `Control: Valor presente de los f${titulo.slice(1)}`);
        assert.equal(c?.valor, 0);
      }
    });
  });
}

describe('Costo del IVA sin TIR objetivo capturada: a la TIR sin IVA, y la etiqueta lo dice', () => {
  test('183,117 a la TIR de equity sin IVA (8.15 %)', async () => {
    const wb = await releer(datos({ ...S, ...IVA, tirEquityObjetivoPct: null } as Supuestos).d);
    const ws = wb.getWorksheet('Fuentes y usos')!;
    assert.equal(Math.round(Number(valorDe(ws, 'Costo financiero del IVA (valor presente al NTP)'))), 183_117);
    assert.equal(valorDe(ws, 'Costo financiero del IVA (valor presente al NTP)', 3), 'Flujos de IVA a cargo del equity descontados a la TIR de equity sin IVA (8.15 %; no hay TIR objetivo capturada) · costo de oportunidad, no es un gasto');
    assert.equal((Number(valorDe(ws, 'Impacto en la TIR de equity'))).toFixed(2), '-0.07');
  });
});

test('App pasa el costo del IVA al Excel', () => {
  // Dentro de los datos de archivoAnalisisFinanciero (después de fuentesUsos y los créditos)
  assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /archivoAnalisisFinanciero\(ExcelJS, \{[^]*?\n\s*costoIva,\n\s*generado: new Date\(\),/);
});
