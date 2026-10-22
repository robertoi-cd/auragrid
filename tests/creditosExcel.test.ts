// Financiamiento con varios bancos, fase 3 (Excel): hoja Deuda con una sección por banco y una de totales (controles
// con fórmula: Σ por banco = total en saldo, intereses, amortización, IDC y comisiones; Σ participaciones = 100 %) y la
// fila de comisión por no disposición en Fuentes y usos cuando es mayor a 0. Con un crédito al 100 %, el libro es
// idéntico byte por byte al de antes.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import type { Workbook, Worksheet, CellValue } from 'exceljs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { crearLibroFinanciero, type DatosAnalisis } from '../src/lib/exportarFinanzas';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { Supuestos } from '../src/lib/rentabilidad';
import { NOTA_TRAMOS, type Credito } from '../src/lib/creditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const credito = (orden: number, banco: string | null, p: number, r: number, c: number, nd: number | null = null): Credito =>
  ({ orden, banco, participacionPct: p, tasaAnualPct: r, comisionEstructuracionPct: c, comisionNoDisposicionPct: nd, estado: 'aprobado' });
const DOS = [credito(1, 'Banco Norte', 60, 7.0, 1.5), credito(2, 'Banco Sur', 40, 6.5, 1.0)];
const ND = [credito(1, 'Banco Norte', 60, 7.0, 1.5, 0.5), credito(2, 'Banco Sur', 40, 6.5, 1.0, 0.3)];

/** Mismo camino que App.jsx: analizarProyecto con créditos → datos del Excel (supuestos con créditos, créditos, no disposición). */
function datos(creditos: Credito[] | undefined, s: Supuestos = S) {
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: s, creditos, calcularPrecioMinimo: false });
  const f = a.finanzas;
  const d: DatosAnalisis = {
    proyecto: { nombre: ALPHA.name, estado: ALPHA.state, capacidad: '50 MWac / 62.5 MWdc', esEjemplo: true, fechaRtb: ALPHA.fechaRtb },
    supuestos: creditos ? a.supuestosConCreditos! : s, rentabilidad: a.rentabilidad, cronograma: { pagos: f.pagos, fondos: f.fondos, origen: f.origenCronograma },
    sensibilidad: null, costoIva: a.costoIva,
    fuentesUsos: { capex: f.capex, idc: f.idc, comision: f.comision, dsra: f.dsra, usos: f.usos, deuda: f.deuda, equity: f.equity, ...(creditos ? { noDisposicion: f.noDisposicion } : {}) },
    ...(creditos ? { creditos: { lista: creditos, porCredito: a.porCredito, condiciones: a.condicionesCreditos } } : {}),
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
async function xml(d: DatosAnalisis): Promise<string> {
  const zip = await JSZip.loadAsync(await (await crearLibroFinanciero(ExcelJS, d)).xlsx.writeBuffer());
  const partes: string[] = [];
  for (const n of Object.keys(zip.files).sort()) if (!zip.files[n].dir && n !== 'docProps/core.xml') partes.push(n, await zip.files[n].async('string'));
  return partes.join('\n');
}

const numero = (v: CellValue): number => (typeof v === 'number' ? v : v && typeof v === 'object' && 'result' in v ? Number(v.result ?? 0) : NaN);
function fila(ws: Worksheet, etiqueta: string, desde = 1): number {
  for (let r = desde; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(etiqueta)) return r;
  throw new Error(`No hay fila «${etiqueta}» en ${ws.name}`);
}
/** Valor de una celda recalculado con el libro: SUM de su rango, suma de referencias (A1+B2) o valor guardado. */
function valor(ws: Worksheet, ref: string): number {
  const v = ws.getCell(ref).value;
  const f = v && typeof v === 'object' && 'formula' in v ? String(v.formula) : null;
  const s = f?.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
  if (s) { let t = 0; for (let r = Number(s[2]); r <= Number(s[4]); r++) t += numero(ws.getCell(`${s[1]}${r}`).value) || 0; return t; }
  if (f && /^[A-Z]+\d+(\+[A-Z]+\d+)*$/.test(f)) return f.split('+').reduce((t, x) => t + valor(ws, x), 0);
  return numero(v) || 0;
}
function controles(ws: Worksheet) {
  const lista: { descripcion: string; valor: number }[] = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const a = String(ws.getCell(r, 1).value ?? '');
    if (!a.startsWith('Control:')) continue;
    const m = (ws.getCell(r, 2).value as { formula: string }).formula.match(/^ROUND\((.+),2\)$/)!;
    let t = 0;
    for (const [, signo, ref] of m[1].matchAll(/([+-]?)([A-Z]+\d+)/g)) t += (signo === '-' ? -1 : 1) * valor(ws, ref);
    lista.push({ descripcion: a, valor: Math.round(t * 100) / 100 || 0 });
  }
  return lista;
}

describe('Un crédito al 100 %: el libro idéntico byte por byte', () => {
  test('crédito migrado (sin banco) y crédito con banco = libro sin créditos', async () => {
    const antes = await xml(datos(undefined).d);
    assert.equal(await xml(datos([credito(1, null, 100, 7, 1.5)]).d), antes);
    assert.equal(await xml(datos([credito(1, 'Banco Norte', 100, 7, 1.5)]).d), antes);
  });
});

describe('Dos bancos 60/40 (7.0 % / 6.5 %, comisiones 1.5 % / 1.0 %)', () => {
  const { a, d } = datos(DOS);
  let wb: Workbook;
  before(async () => { wb = await releer(d); });
  test('tabla de créditos con total y ponderado; Σ participaciones = 100 %', () => {
    const ws = wb.getWorksheet('Deuda')!;
    const r = fila(ws, 'Créditos de la deuda') + 2;
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((c) => ws.getCell(r, c).value), ['Banco Norte', 60, 7, 1.5, 'No se cobra', 'Aprobado']);
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((c) => ws.getCell(r + 1, c).value), ['Banco Sur', 40, 6.5, 1, 'No se cobra', 'Aprobado']);
    const total = fila(ws, 'Total / ponderado');
    assert.equal((ws.getCell(total, 2).value as { formula: string }).formula, `SUM(B${r}:B${r + 1})`);
    assert.equal((ws.getCell(total, 3).value as { formula: string }).formula, `SUMPRODUCT($B$${r}:$B$${r + 1},C${r}:C${r + 1})/100`);
    assert.equal(numero(ws.getCell(total, 3).value), 6.8);
    assert.equal(numero(ws.getCell(total, 4).value), 1.3);
    const c = controles(ws).find((x) => x.descripcion === 'Control: Σ participaciones − 100 %')!;
    assert.equal(c.valor, 0);
  });
  test('una sección por banco: monto, comisiones, IDC y tabla anual', () => {
    const ws = wb.getWorksheet('Deuda')!;
    const norte = fila(ws, 'Banco Norte · 60 % de la deuda');
    const sur = fila(ws, 'Banco Sur · 40 % de la deuda');
    assert.equal(Number(ws.getCell(norte + 1, 2).value).toFixed(2), '17441145.68');
    assert.equal(Number(ws.getCell(sur + 1, 2).value).toFixed(2), '11627430.45');
    assert.equal(Number(ws.getCell(norte + 2, 2).value).toFixed(2), '261617.19');
    assert.equal(Number(ws.getCell(sur + 2, 2).value).toFixed(2), '116274.30');
    assert.equal(ws.getCell(norte + 3, 2).value, 0, 'sin comisión por no disposición');
    const [A, B] = a.porCredito!;
    assert.equal(ws.getCell(norte + 4, 2).value, A.idc);
    assert.equal(ws.getCell(sur + 4, 2).value, B.idc);
    // Tabla anual: encabezado, un año por fila del plazo y los totales
    assert.deepEqual([1, 2, 3, 4, 5, 6].map((c) => ws.getCell(norte + 6, c).value), ['Año de operación', 'Saldo inicial', 'Intereses', 'Amortización', 'Servicio', 'Saldo final']);
    A.anos.forEach((x, i) => {
      assert.equal(ws.getCell(norte + 7 + i, 3).value, x.intereses);
      assert.equal(ws.getCell(norte + 7 + i, 4).value, x.amortizacion);
    });
  });
  test('totales: Σ por banco = total del modelo con fórmula, y todos los controles en 0', () => {
    const ws = wb.getWorksheet('Deuda')!;
    const c = controles(ws);
    assert.deepEqual(c.map((x) => x.descripcion), [
      'Control: Σ amortización − deuda + saldo final', 'Control: Σ servicio − (Σ intereses + Σ amortización)', 'Control: Σ participaciones − 100 %',
      'Control: Σ por banco − total: monto comprometido (deuda inicial)', 'Control: Σ por banco − total: saldo inicial del año 1',
      'Control: Σ por banco − total: intereses (Σ del plazo)', 'Control: Σ por banco − total: amortización (Σ del plazo)',
      'Control: Σ por banco − total: saldo final del último año', 'Control: Σ por banco − total: intereses durante la construcción',
      'Control: Σ por banco − total: comisión de estructuración', 'Control: Σ por banco − total: comisión por no disposición',
    ]);
    assert.ok(c.every((x) => x.valor === 0), JSON.stringify(c));
    // La columna "Σ por banco" es una fórmula que suma las celdas de cada banco; "Total del modelo" apunta a la tabla total
    const r = fila(ws, 'Intereses (Σ del plazo)');
    assert.match((ws.getCell(r, 2).value as { formula: string }).formula, /^C\d+\+C\d+$/);
    assert.equal((ws.getCell(r, 3).value as { formula: string }).formula, `D${fila(ws, 'Total')}`);
    assert.equal(Math.round(valor(ws, `B${r}`)), Math.round(a.porCredito!.reduce((s, x) => s + x.anos.reduce((t, y) => t + y.intereses, 0), 0)));
  });
  test('todos los controles del libro dan 0; Fuentes y usos sin la fila de no disposición (sigue en las mismas filas)', () => {
    for (const ws of wb.worksheets) assert.ok(controles(ws).every((x) => x.valor === 0), ws.name);
    const fu = wb.getWorksheet('Fuentes y usos')!;
    assert.equal(fu.getCell(10, 1).value, 'Total usos');
    assert.throws(() => fila(fu, 'Comisión por no disposición'));
  });
  test('Supuestos: la tasa y la comisión dicen que son las ponderadas', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const tasa = fila(ws, 'Deuda (esculpida)');
    let r = tasa;
    while (ws.getCell(r, 2).value !== 'Tasa de interés') r++;
    assert.equal(ws.getCell(r, 3).value, 6.8);
    assert.equal(ws.getCell(r, 5).value, 'Ponderada por participación de los créditos (ver hoja Deuda).');
  });
});

describe('Con comisión por no disposición 0.5 % / 0.3 %', () => {
  const { a, d } = datos(ND);
  let wb: Workbook;
  before(async () => { wb = await releer(d); });
  test('Fuentes y usos: fila "Comisión por no disposición" después de la de estructuración; fuentes = usos', () => {
    const ws = wb.getWorksheet('Fuentes y usos')!;
    assert.deepEqual([6, 7, 8, 9, 10, 11].map((r) => ws.getCell(r, 1).value),
      ['CAPEX', 'Intereses durante la construcción', 'Comisión de estructuración', 'Comisión por no disposición', 'Cuenta de reserva (DSRA)', 'Total usos']);
    assert.equal(ws.getCell(9, 2).value, Math.round(a.rentabilidad.usos.noDisposicion));
    assert.equal(ws.getCell(9, 2).value, 94_392);
    assert.equal((ws.getCell(11, 2).value as { formula: string }).formula, 'SUM(B6:B10)');
    assert.equal((ws.getCell(6, 3).value as { formula: string }).formula, 'IF($B$11=0,0,B6/$B$11)');
    assert.ok(controles(ws).every((x) => x.valor === 0));
    assert.equal(fila(ws, 'Control: Fuentes − Usos'), 18);
  });
  test('Deuda: no disposición por banco (wᵢ·nᵢ) y su control', () => {
    const ws = wb.getWorksheet('Deuda')!;
    assert.equal(Number(ws.getCell(fila(ws, 'Banco Norte · 60 %') + 3, 2).value).toFixed(2), '67422.99');
    assert.equal(Number(ws.getCell(fila(ws, 'Banco Sur · 40 %') + 3, 2).value).toFixed(2), '26969.20');
    assert.equal(numero(ws.getCell(fila(ws, 'Total / ponderado'), 5).value), 0.42);
    for (const w of wb.worksheets) assert.ok(controles(w).every((x) => x.valor === 0), w.name);
  });
  test('con IVA activo, el bloque de necesidad temporal baja una fila (todo cuadra igual)', async () => {
    const IVA = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'importacion', ivaFinanciamiento: 'equity' };
    const w = await releer(datos(ND, { ...S, ...IVA } as Supuestos).d);
    const fu = w.getWorksheet('Fuentes y usos')!;
    assert.equal(fila(fu, 'Necesidad temporal de IVA'), 22);
    for (const ws of w.worksheets) assert.ok(controles(ws).every((x) => x.valor === 0), ws.name);
  });
});

test('App pasa al Excel los créditos y la comisión por no disposición', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  assert.match(app, /equity: finanzas\.equity, noDisposicion: finanzas\.noDisposicion \},\n\s*creditos: \{ lista: creditos, porCredito, condiciones: condicionesCreditos \},/);
});

describe('Nota de los tramos de deuda en el cronograma de caja', () => {
  test('Excel: debajo de los fondos pendientes, solo si hay tramos de deuda', async () => {
    const wb = await releer(datos(DOS).d);
    const ws = wb.getWorksheet('Cronograma de caja')!;
    const r = fila(ws, 'Fechas de disponibilidad de cada tramo');
    assert.equal(ws.getCell(r, 1).value, NOTA_TRAMOS);
    assert.equal(r, fila(ws, 'Informativo: Fondos pendientes de confirmar') + 1);
  });
  test('app: en la columna de entradas, junto a los tramos', () => {
    assert.equal(NOTA_TRAMOS, 'Fechas de disponibilidad de cada tramo; los intereses de construcción y la comisión por no disposición se calculan con la disposición según necesidad (primero el equity).');
    assert.match(fs.readFileSync('src/ConstructionTimeline.jsx', 'utf8'), /\{tipo === 'fondo' && items\.some\(\(i\) => i\.fuente === 'deuda'\) && <span data-nota-tramos="" [^>]*>\{NOTA_TRAMOS\}<\/span>\}/);
  });
});
