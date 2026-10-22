// Estados financieros v1, fase 3 (Excel): hojas "Estado de resultados", "Balance" y "Flujo de efectivo" con el control
// del balance y el de la caja con fórmula en cada año; las tres TIR en Resumen; la caja atrapada en los dos modos; el
// alcance y las limitaciones en Supuestos; y las hojas existentes idénticas celda por celda a las de la versión anterior
// (salvo las etiquetas renombradas y lo que se agrega al final de Resumen, Supuestos y Escenarios).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';
import { crearLibroFinanciero, hojasDelLibro, HOJAS_ESTADOS } from '../src/lib/exportarFinanzas';
import { LIMITACIONES_ESTADOS, NOTA_CAPITAL_VARIABLE } from '../src/lib/estadosFinancieros';
import { NOTA_TIR_ESCENARIOS } from '../src/lib/escenarios';
import { CASOS_EXCEL, analizarCaso, datosExcel, huellaHoja, MIGRADO, type HuellaHoja } from './excelReferencia';

const REFERENCIA = JSON.parse(fs.readFileSync('tests/fixtures/excel_antes_estados.json', 'utf8')) as { casos: Record<string, Record<string, HuellaHoja>> };
const RENOMBRES = { 'TIR de equity (flujo disponible)': 'TIR de equity' };
/** Hojas a las que se agrega algo al final (sus filas anteriores no cambian). */
const CON_AGREGADO = new Set(['Resumen', 'Supuestos', 'Escenarios']);

async function libro(extra = {}, creditos = [MIGRADO]): Promise<Workbook> {
  const wb = await crearLibroFinanciero(ExcelJS, datosExcel(analizarCaso(extra, creditos), creditos));
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await wb.xlsx.writeBuffer() as ArrayBuffer);
  return leido;
}
function fila(ws: Worksheet, etiqueta: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(etiqueta)) return r;
  throw new Error(`No hay fila «${etiqueta}» en ${ws.name}`);
}

describe('Hojas existentes: idénticas celda por celda a las de la versión anterior', () => {
  for (const [caso, extra, creditos] of CASOS_EXCEL) {
    test(caso, async () => {
      const wb = await libro(extra, creditos);
      const antes = REFERENCIA.casos[caso];
      for (const [nombre, ref] of Object.entries(antes)) {
        const ws = wb.getWorksheet(nombre)!;
        assert.ok(ws, nombre);
        const h = huellaHoja(ws, RENOMBRES);
        // La Portada lista las 3 hojas nuevas en "Contenido": desde ahí, sus filas bajan 3
        const desplazamiento = nombre === 'Portada' ? 3 : 0;
        const desde = nombre === 'Portada' ? Number(Object.keys(ref.filas).find((r) => /^Aviso legal$/.test(String(ws.getCell(Number(r) + 3, 1).value ?? ''))) ?? 1e9) - 2 : 1e9;
        for (const [r, hashFila] of Object.entries(ref.filas)) {
          const n = Number(r) >= desde ? Number(r) + desplazamiento : Number(r);
          assert.equal(h.filas[n], hashFila, `${caso} · ${nombre} · fila ${r}`);
        }
        if (nombre === 'Portada') {
          for (let i = 0; i < 3; i++) assert.match(String(ws.getCell(desde + i, 1).value), new RegExp(`\\. ${HOJAS_ESTADOS[i]}$`));
        } else if (!CON_AGREGADO.has(nombre)) {
          assert.equal(h.ultimaFila, ref.ultimaFila, `${nombre}: no se agregan filas`);
        }
        assert.deepEqual(h.cols, ref.cols, `${nombre}: anchos`);
        assert.equal(h.resto, ref.resto, `${nombre}: vistas, protección, página y propiedades`);
        // Combinadas y formato condicional: las de antes siguen (las agregadas están después)
        const mover = (m: string) => (desplazamiento ? m.replace(/([A-Z]+)(\d+)/g, (_, c, f) => `${c}${Number(f) >= desde ? Number(f) + desplazamiento : f}`) : m);
        for (const m of ref.merges) assert.ok(h.merges.includes(mover(m)), `${nombre}: combinada ${m}`);
        for (const c of ref.condicional) assert.ok(h.condicional.includes(c), `${nombre}: formato condicional`);
        if (!CON_AGREGADO.has(nombre) && nombre !== 'Portada') {
          assert.deepEqual(h.merges, ref.merges);
          assert.deepEqual(h.condicional, ref.condicional);
        }
      }
    });
  }
  test('sin estados financieros el libro tiene las hojas de antes', () => {
    const d = datosExcel(analizarCaso({}, [MIGRADO]), [MIGRADO]);
    assert.deepEqual(hojasDelLibro({ ...d, estados: null }), Object.keys(REFERENCIA.casos.alpha));
    assert.deepEqual(hojasDelLibro(d), [...Object.keys(REFERENCIA.casos.alpha), ...HOJAS_ESTADOS]);
  });
});

/** Evaluador de las fórmulas de las hojas nuevas: referencias (también a otra hoja), + y −, SUM, ROUND y SUMPRODUCT(ABS()). */
function evaluar(wb: Workbook, ws: Worksheet, f: string): number {
  const valor = (hoja: Worksheet, ref: string): number => {
    const v = hoja.getCell(ref).value as unknown;
    // Una fórmula que da 0 se relee sin resultado (Excel la recalcula al abrir)
    if (v && typeof v === 'object' && 'formula' in (v as object)) return Number((v as { result?: number }).result ?? 0);
    return Number(v ?? 0);
  };
  const rango = (hoja: Worksheet, a: string, b: string): number[] => {
    const ca = hoja.getCell(a), cb = hoja.getCell(b);
    const out: number[] = [];
    for (let r = Number(ca.row); r <= Number(cb.row); r++) for (let c = Number(ca.col); c <= Number(cb.col); c++) out.push(valor(hoja, hoja.getCell(r, c).address));
    return out;
  };
  let e = f;
  e = e.replace(/SUMPRODUCT\(ABS\(([A-Z]+\d+):([A-Z]+\d+)\)\)/g, (_, a, b) => String(rango(ws, a, b).reduce((s, x) => s + Math.abs(x), 0)));
  e = e.replace(/SUM\(([A-Z]+\d+):([A-Z]+\d+)\)/g, (_, a, b) => String(rango(ws, a, b).reduce((s, x) => s + x, 0)));
  e = e.replace(/([A-Za-z ]+)!([A-Z]+\d+)/g, (_, h, ref) => `(${valor(wb.getWorksheet(h.trim())!, ref)})`);
  e = e.replace(/\b([A-Z]+\d+)\b/g, (_, ref) => `(${valor(ws, ref)})`);
  e = e.replace(/ROUND\(/g, 'redondear(');
  // eslint-disable-next-line no-new-func
  return Function('redondear', `return ${e};`)((x: number, d: number) => Math.round(x * 10 ** d) / 10 ** d);
}
function formulasDe(ws: Worksheet) {
  const out: { celda: string; formula: string; resultado: number }[] = [];
  ws.eachRow((row) => row.eachCell((c) => {
    const v = c.value as unknown;
    if (v && typeof v === 'object' && 'formula' in (v as object) && ['number', 'undefined'].includes(typeof (v as { result: unknown }).result)) {
      out.push({ celda: c.address, formula: (v as { formula: string }).formula, resultado: (v as { result?: number }).result ?? 0 });
    }
  }));
  return out;
}

describe('Hojas de estados financieros (Alpha I)', () => {
  let wb: Workbook;
  before(async () => { wb = await libro(); });
  test('las tres hojas al final, después de Escenarios', () => {
    assert.deepEqual(wb.worksheets.slice(-4).map((w) => w.name), ['Escenarios', ...HOJAS_ESTADOS]);
  });
  test('cada fórmula da lo que dice su resultado (recalculada con las celdas)', () => {
    for (const nombre of HOJAS_ESTADOS) {
      const ws = wb.getWorksheet(nombre)!;
      const fs_ = formulasDe(ws);
      assert.ok(fs_.length > 50, `${nombre}: ${fs_.length} fórmulas`);
      for (const { celda, formula, resultado } of fs_) {
        const x = evaluar(wb, ws, formula);
        assert.ok(Math.abs(x - resultado) < 0.02, `${nombre}!${celda}: ${formula} = ${x} y dice ${resultado}`);
      }
    }
  });
  test('Balance: control activo − pasivo − capital con fórmula en cada año (31 columnas) y en total', () => {
    const ws = wb.getWorksheet('Balance')!;
    const fc = fila(ws, 'Control: activo − pasivo − capital');
    const fa = fila(ws, 'Activo total'), fp = fila(ws, 'Pasivo total'), fk = fila(ws, 'Capital contable');
    for (let j = 0; j < 31; j++) {
      const c = ws.getCell(fc, 2 + j).value as { formula: string; result: number };
      const l = ws.getCell(fc, 2 + j).address.replace(/\d+/, '');
      assert.equal(c.formula, `ROUND(${l}${fa}-${l}${fp}-${l}${fk},2)`);
      assert.equal(c.result ?? 0, 0);
    }
    const total = fila(ws, 'Control: activo − pasivo − capital = 0 en todos los años');
    assert.equal((ws.getCell(total, 3).value as { result: string }).result, 'Correcto (da 0)');
    assert.equal((ws.getCell(fa, 2).value as { formula: string }).formula, `B${fa - 6}+B${fa - 5}+B${fa - 4}+B${fa - 3}+B${fa - 2}+B${fa - 1}`);
    // Cifras de Alpha I verificadas en la fase 1
    assert.equal(Math.round(ws.getCell(fila(ws, 'Activo fijo neto'), 2).value as number), 47_116_080);
    assert.equal(Math.round(ws.getCell(fila(ws, 'Caja (incluye'), 3).value as number), 1_411_154);
    assert.equal(Math.round(ws.getCell(fila(ws, 'ISR diferido pasivo'), 3).value as number), 3_480_715);
  });
  test('Flujo de efectivo: caja final − caja del balance = 0 con fórmula a la hoja Balance en cada periodo', () => {
    const ws = wb.getWorksheet('Flujo de efectivo')!;
    const fc = fila(ws, 'Control: caja final − caja del balance');
    const ff = fila(ws, 'Caja final');
    for (let j = 0; j < 31; j++) {
      const l = ws.getCell(fc, 2 + j).address.replace(/\d+/, '');
      const c = ws.getCell(fc, 2 + j).value as { formula: string; result: number };
      assert.equal(c.formula, `ROUND(${l}${ff}-Balance!${l}7,2)`);
      assert.equal(c.result ?? 0, 0);
    }
    assert.equal(wb.getWorksheet('Balance')!.getCell('A7').value, 'Caja (incluye la caja atrapada)');
    const total = fila(ws, 'Control: caja del flujo de efectivo = caja del balance');
    assert.equal((ws.getCell(total, 3).value as { result: string }).result, 'Correcto (da 0)');
    // La caja inicial de cada año es la final del anterior
    const fi = fila(ws, 'Caja inicial');
    assert.equal((ws.getCell(fi, 3).value as { formula: string }).formula, `B${ff}`);
  });
  test('Estado de resultados: año 1 de Alpha I', () => {
    const ws = wb.getWorksheet('Estado de resultados')!;
    assert.equal(Math.round((ws.getCell(fila(ws, 'Utilidad antes de impuestos'), 2).value as { result: number }).result), 1_261_730);
    assert.equal(Math.round(ws.getCell(fila(ws, 'ISR diferido'), 2).value as number), -3_480_715);
    assert.equal(Math.round((ws.getCell(fila(ws, 'Utilidad neta'), 2).value as { result: number }).result), -2_218_985);
  });
  test('caja atrapada por año en los dos modos', () => {
    const ws = wb.getWorksheet('Balance')!;
    const sd = fila(ws, 'Solo dividendos'), cd = fila(ws, 'Con devolución de capital variable');
    assert.match(String(ws.getCell(sd, 1).value), /\(supuesto\)$/);
    assert.equal(Math.round(ws.getCell(sd, 3).value as number), 1_411_154);
    assert.equal(Math.round(ws.getCell(sd, 31).value as number), 21_990_479);
    assert.equal(ws.getCell(cd, 3).value, 0);
    assert.equal(Math.round(ws.getCell(cd, 31).value as number), 558_638);
  });
  test('Resumen: las tres TIR, el modo y la explicación', () => {
    const ws = wb.getWorksheet('Resumen')!;
    const v = (t: string) => ws.getCell(fila(ws, t), 2).value as number;
    assert.equal(ws.getCell(fila(ws, 'TIR de equity (flujo disponible)'), 2).value, v('TIR de equity (flujo disponible)'));
    assert.equal(v('TIR de equity (dividendos y devolución de capital)').toFixed(4), '0.0815');
    assert.equal(v('TIR de equity (solo dividendos)').toFixed(4), '0.0631');
    assert.equal(ws.getCell(fila(ws, 'Distribuciones del proyecto'), 2).value, 'Solo dividendos');
    assert.ok(String(ws.getCell(fila(ws, 'La TIR de flujo disponible'), 1).value).includes('6.31 %'));
  });
  test('Supuestos: alcance y limitaciones del modelo; Escenarios: la nota del flujo disponible', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const f = fila(ws, 'Alcance y limitaciones del modelo');
    const textos = Array.from({ length: 30 }, (_, i) => String(ws.getCell(f + 1 + i, 1).value ?? ''));
    for (const l of LIMITACIONES_ESTADOS) assert.ok(textos.includes(`• ${l}`), l);
    assert.equal(ws.getCell(fila(ws, 'Estados financieros') + 1, 3).value, 'Sin capturar (no)');
    const esc = wb.getWorksheet('Escenarios')!;
    assert.ok(fila(esc, NOTA_TIR_ESCENARIOS) > 0);
  });
});

describe('Con devolución de capital variable', () => {
  test('el modo, la nota de la S.A.P.I. y la caja atrapada del supuesto', async () => {
    const wb = await libro({ devolucionCapitalVariable: true });
    const res = wb.getWorksheet('Resumen')!;
    assert.equal(res.getCell(fila(res, 'Distribuciones del proyecto'), 2).value, 'Dividendos y devolución de capital variable');
    const bal = wb.getWorksheet('Balance')!;
    assert.match(String(bal.getCell(fila(bal, 'Con devolución de capital variable'), 1).value), /\(supuesto\)$/);
    assert.ok(fila(bal, NOTA_CAPITAL_VARIABLE) > 0);
    assert.equal(bal.getCell(fila(bal, 'Caja (incluye'), 3).value, 0);
    const sup = wb.getWorksheet('Supuestos')!;
    assert.equal(sup.getCell(fila(sup, 'Estados financieros') + 1, 3).value, 'Sí');
  });
});
