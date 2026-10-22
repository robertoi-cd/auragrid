// Depreciación por categorías de activo y ajustes al Excel del análisis financiero (revisión del 13 oct 2026):
// fondos pendientes de confirmar, Entidad federativa, limitación de moneda, CAPEX exacto en sensibilidad y (USD).
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet, CellValue } from 'exceljs';
import {
  calcularRentabilidad, compararEstructuras, compararDepreciacion, calcularSensibilidad, depreciacionPorAno, depreciacionPorCategoria,
  problemasDepreciacion, SUPUESTOS_DEFAULT, type Supuestos,
} from '../src/lib/rentabilidad';
import { crearModeloFinanciero, calendarioPagos } from '../src/lib/modeloFinanciero';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { detectarOportunidades } from '../src/lib/oportunidades';
import { validarProyecto } from '../src/lib/validaciones';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { aSupuestos, COLUMNAS } from '../src/lib/supuestosApi';
import { NOTA_MONEDA, NOTA_DEDUCCION_INMEDIATA, NOTA_EQUIPO_GENERACION, NOTA_INTERCONEXION, REFERENCIA_CONSTRUCCIONES } from '../src/lib/camposSupuestos';
import { crearLibroFinanciero, filasCronograma, type DatosAnalisis } from '../src/lib/exportarFinanzas';

const CAPEX = 46_500_000;
const MWDC = 62.5;
const conCategorias = (cambios: Partial<Supuestos>): Supuestos => ({ ...SUPUESTOS_ILUSTRATIVOS, depreciacionPorCategorias: true, ...cambios });
const REPARTO = { depreciacionGeneracionPct: 70, depreciacionObraCivilPct: 15, depreciacionSubestacionPct: 10, depreciacionInterconexionPct: 5 };
const TASAS = { depreciacionObraCivilTasaPct: 5, depreciacionSubestacionTasaPct: 10, depreciacionInterconexionTasaPct: 10 };

describe('Depreciación por categorías: por defecto no cambia nada', () => {
  test('valores por defecto: apagada; 100 % en equipo de generación al 100 %; otras tasas sin capturar', () => {
    assert.equal(SUPUESTOS_DEFAULT.depreciacionPorCategorias, false);
    assert.equal(SUPUESTOS_DEFAULT.depreciacionGeneracionPct, 100);
    assert.equal(SUPUESTOS_DEFAULT.depreciacionGeneracionTasaPct, 100);
    for (const c of ['depreciacionObraCivilTasaPct', 'depreciacionSubestacionTasaPct', 'depreciacionInterconexionTasaPct'] as const) assert.equal(SUPUESTOS_DEFAULT[c], null);
  });
  test('apagada: mismas cifras que el esquema actual (Alpha I)', () => {
    const antes = calcularRentabilidad({ ...SUPUESTOS_ILUSTRATIVOS }, 'un_eje', CAPEX, MWDC);
    const conCamposCapturados = calcularRentabilidad({ ...SUPUESTOS_ILUSTRATIVOS, ...REPARTO, ...TASAS, depreciacionPorCategorias: false }, 'un_eje', CAPEX, MWDC);
    assert.equal(conCamposCapturados.tirEquity, antes.tirEquity);
    assert.equal(conCamposCapturados.deuda, antes.deuda);
    assert.deepEqual(conCamposCapturados.anos.map((a) => a.isrConDeuda), antes.anos.map((a) => a.isrConDeuda));
  });
  test('encendida con el reparto por defecto (100 % generación al 100 %): mismo resultado que 100 % en el año 1', () => {
    const esquema = calcularRentabilidad({ ...SUPUESTOS_ILUSTRATIVOS, depreciacionEsquema: 'ano1', depreciacionAno1Pct: 100 }, 'un_eje', CAPEX, MWDC);
    const categorias = calcularRentabilidad(conCategorias({}), 'un_eje', CAPEX, MWDC);
    assert.deepEqual(categorias.anos.map((a) => a.depreciacion), esquema.anos.map((a) => a.depreciacion));
    assert.equal(categorias.tirEquity, esquema.tirEquity);
    assert.equal(categorias.isrConDeuda.perdidaCaducada, esquema.isrConDeuda.perdidaCaducada);
  });
});

describe('Depreciación por categorías: cálculo', () => {
  const s = conCategorias({ ...REPARTO, ...TASAS });
  test('cada categoría a su tasa; la suma deprecia el CAPEX completo', () => {
    const dep = depreciacionPorAno(s, CAPEX);
    assert.ok(Math.abs(dep[0] - (0.70 * CAPEX + 0.15 * CAPEX * 0.05 + 0.10 * CAPEX * 0.10 + 0.05 * CAPEX * 0.10)) < 1e-6);
    assert.ok(Math.abs(dep.reduce((a, x) => a + x, 0) - CAPEX) < 1e-6, 'obra civil al 5 % se termina en 20 años (vida útil 30)');
    const porCategoria = depreciacionPorCategoria(s, CAPEX);
    assert.deepEqual(porCategoria.map((c) => c.nombre), ['Equipo de generación', 'Obra civil', 'Subestación y línea', 'Interconexión']);
    assert.equal(porCategoria[1].montos.filter((m) => m > 0).length, 20);
  });
  test('recalcula ISR, pérdidas y TIR: menos depreciación temprana → paga ISR antes y cambia la TIR', () => {
    const todo = calcularRentabilidad(conCategorias({}), 'un_eje', CAPEX, MWDC);
    const repartido = calcularRentabilidad(s, 'un_eje', CAPEX, MWDC);
    assert.ok(repartido.anos[0].depreciacion < todo.anos[0].depreciacion);
    assert.notEqual(repartido.tirEquity, todo.tirEquity);
    assert.ok((repartido.isrConDeuda.inicio ?? 99) <= (todo.isrConDeuda.inicio ?? 99));
  });
  test('la comparación de la sección de depreciación incluye "Por categorías" (y las oportunidades no la proponen)', () => {
    const comp = compararDepreciacion(s, 'un_eje', CAPEX, MWDC);
    assert.deepEqual(comp.map((c) => c.esquema), ['ano1', 'anual', 'categorias']);
    assert.equal(comp[2].rentabilidad.tirEquity, calcularRentabilidad(s, 'un_eje', CAPEX, MWDC).tirEquity);
    // Los esquemas simples se calculan sin categorías
    assert.equal(comp[0].rentabilidad.tirEquity, calcularRentabilidad({ ...s, depreciacionPorCategorias: false, depreciacionEsquema: 'ano1', depreciacionAno1Pct: 100 }, 'un_eje', CAPEX, MWDC).tirEquity);
    const r = calcularRentabilidad(s, 'un_eje', CAPEX, MWDC);
    assert.ok(!detectarOportunidades({ supuestos: s, rentabilidad: r, comparacionDepreciacion: comp }).some((o) => o.id === 'depreciacion-categorias'));
    // Apagada: solo los dos esquemas
    assert.deepEqual(compararDepreciacion(SUPUESTOS_ILUSTRATIVOS, 'un_eje', CAPEX, MWDC).map((c) => c.esquema), ['ano1', 'anual']);
  });
});

describe('Depreciación por categorías: sin valores supuestos', () => {
  test('reparto > 0 % sin tasa: no se calcula y se dice qué falta', () => {
    const s = conCategorias({ ...REPARTO, depreciacionObraCivilTasaPct: 5 });
    const p = problemasDepreciacion(s);
    assert.deepEqual(p, [
      'Subestación y línea: tiene 10 % del CAPEX y falta su tasa de depreciación.',
      'Interconexión: tiene 5 % del CAPEX y falta su tasa de depreciación.',
    ]);
    assert.throws(() => depreciacionPorAno(s, CAPEX), /falta su tasa/);
    assert.throws(() => calcularRentabilidad(s, 'un_eje', CAPEX, MWDC), /falta su tasa/);
  });
  test('categoría con 0 % no necesita tasa; reparto que no suma 100 % sí es un problema', () => {
    assert.deepEqual(problemasDepreciacion(conCategorias({ depreciacionGeneracionPct: 90, depreciacionObraCivilPct: 10, depreciacionObraCivilTasaPct: 5 })), []);
    assert.match(problemasDepreciacion(conCategorias({ depreciacionGeneracionPct: 90 }))[0], /suma 90 % y debe sumar 100 %/);
    // Apagada: nunca hay problema, aunque falten tasas
    assert.deepEqual(problemasDepreciacion({ ...SUPUESTOS_ILUSTRATIVOS, ...REPARTO }), []);
  });
  test('alerta: "Depreciación por categorías incompleta" con lo que falta, y TIR/DSCR/LCOE en N/D', () => {
    const problemas = problemasDepreciacion(conCategorias({ ...REPARTO }));
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-13', rentabilidad: { estado: 'depreciacion_incompleta', problemas } })
      .find((x) => x.id === 'financiamiento-depreciacion');
    assert.ok(a);
    assert.match(a!.detalle, /Obra civil: tiene 15 % del CAPEX y falta su tasa/);
    assert.match(a!.detalle, /No se calcula con un valor supuesto/);
    assert.match(a!.accion, /captura la tasa de depreciación que falta/);
  });
  test('al leer de Supabase, una tasa vacía se conserva vacía (no se sustituye) y el interruptor es booleano', () => {
    const fila = Object.fromEntries(Object.entries(COLUMNAS).map(([campo, col]) => [col, (SUPUESTOS_ILUSTRATIVOS as unknown as Record<string, unknown>)[campo as string]]));
    const s = aSupuestos({ ...fila, depreciacion_por_categorias: true, depreciacion_obra_civil_tasa_pct: null, depreciacion_obra_civil_pct: '15', depreciacion_generacion_pct: '85' });
    assert.equal(s.depreciacionPorCategorias, true);
    assert.equal(s.depreciacionObraCivilTasaPct, null);
    assert.equal(s.depreciacionObraCivilPct, 15);
  });
  test('notas fiscales con el texto acordado', () => {
    assert.equal(NOTA_DEDUCCION_INMEDIATA, 'Validar con asesor fiscal qué activos califican para la deducción inmediata.');
    assert.match(NOTA_EQUIPO_GENERACION, /LISR art\. 34 fr\. XIII\).*opere al menos 5 años después del ejercicio de la deducción; si no, se paga el ISR de la diferencia\. Validar con asesor fiscal\./);
    assert.equal(NOTA_INTERCONEXION, 'Obras de interconexión transferidas a CFE pueden tener un tratamiento fiscal distinto; validar con asesor fiscal.');
    assert.equal(REFERENCIA_CONSTRUCCIONES, 'Referencia: construcciones 5 % anual (tasa general LISR).');
  });
  test('la migración: interruptor apagado por defecto, tasas opcionales sin valor y reparto que suma 100', () => {
    const sql = fs.readFileSync('supabase/migrations/20261020100000_depreciacion_categorias.sql', 'utf8');
    assert.match(sql, /depreciacion_por_categorias boolean not null default false/);
    assert.match(sql, /depreciacion_generacion_pct numeric not null default 100/);
    assert.match(sql, /depreciacion_generacion_tasa_pct numeric not null default 100/);
    for (const c of ['obra_civil', 'subestacion', 'interconexion']) assert.match(sql, new RegExp(`depreciacion_${c}_tasa_pct numeric check`), c);
    assert.match(sql, /abs\(depreciacion_generacion_pct \+ depreciacion_obra_civil_pct \+ depreciacion_subestacion_pct \+ depreciacion_interconexion_pct - 100\) <= 0\.01/);
  });
});

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------

const numero = (v: CellValue): number => (typeof v === 'number' ? v : v && typeof v === 'object' && 'result' in v ? Number(v.result ?? 0) : NaN);
const fila = (ws: Worksheet, inicio: string) => {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(inicio)) return r;
  throw new Error(`No hay «${inicio}» en ${ws.name}`);
};
const textoHoja = (ws: Worksheet) => ws.getSheetValues().flat().map((v) => (v && typeof v === 'object' && 'result' in v ? String(v.result) : String(v ?? ''))).join(' | ');

async function libro(supuestos: Supuestos): Promise<Workbook> {
  const project = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: CAPEX, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
  const base = crearModeloFinanciero(project);
  const cc = crearModeloFinanciero(project, [], []);
  const calendario = calendarioPagos(cc.pagos, supuestos.mesesConstruccion, cc.fechaNtp);
  const r = compararEstructuras(supuestos, base.capex, base.mwdc, calendario).find((x) => x.estructura === supuestos.estructuraSeleccionada)!;
  const f = crearModeloFinanciero({ ...project, capex: r.capex }, [], [], { deuda: r.deuda, idc: r.usos.idc, comision: r.usos.comision, dsra: r.usos.dsra });
  const d: DatosAnalisis = {
    proyecto: { nombre: 'Alpha I', estado: 'Sonora', capacidad: '50 MWac / 62.5 MWdc', esEjemplo: true, fechaRtb: '2027-03-31' },
    supuestos, rentabilidad: r, cronograma: { pagos: f.pagos, fondos: f.fondos, origen: f.origenCronograma },
    sensibilidad: calcularSensibilidad(supuestos, supuestos.estructuraSeleccionada, base.capex, base.mwdc, calendario),
    fuentesUsos: { capex: f.capex, idc: f.idc, comision: f.comision, dsra: f.dsra, usos: f.usos, deuda: f.deuda, equity: f.equity },
    generado: new Date('2026-10-13T16:45:00Z'), version: 'prueba', exportadoPor: 'banco@prueba.example',
  };
  const wb = await crearLibroFinanciero(ExcelJS, d);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await wb.xlsx.writeBuffer() as ArrayBuffer);
  return leido;
}

describe('Excel: cronograma con fondos confirmados y pendientes (Alpha I, tramo 2 en revisión)', () => {
  let wb: Workbook;
  before(async () => { wb = await libro({ ...SUPUESTOS_ILUSTRATIVOS }); });
  test('el tramo 2 aparece como deuda pendiente de confirmar en nov 2027, no como confirmada', () => {
    const ws = wb.getWorksheet('Cronograma de caja')!;
    const encabezado = fila(ws, 'Mes');
    const columna = (t: string) => { for (let c = 1; c <= 14; c++) if (ws.getCell(encabezado, c).value === t) return c; throw new Error(t); };
    const nov = fila(ws, '2027-11');
    assert.equal(numero(ws.getCell(nov, columna('Deuda pendiente de confirmar')).value), 8_731_461);
    assert.equal(numero(ws.getCell(nov, columna('Deuda confirmada')).value) || 0, 0);
  });
  test('"Fondos pendientes de confirmar" en ámbar con el tramo 2; fuentes − usos sigue en 0 y aclara que incluye pendientes', () => {
    const ws = wb.getWorksheet('Cronograma de caja')!;
    const r = fila(ws, 'Informativo: Fondos pendientes de confirmar');
    assert.equal(numero(ws.getCell(r, 2).value), 8_731_461);
    // Texto con fórmula (ámbar por formato condicional cuando no es 0) y el detalle en la columna siguiente
    const texto = ws.getCell(r, 3).value as { formula: string; result: string };
    assert.equal(texto.formula, `IF(B${r}=0,"Todos los fondos están confirmados.","Hay fondos sin confirmar (detalle a la derecha).")`);
    assert.equal(texto.result, 'Hay fondos sin confirmar (detalle a la derecha).');
    assert.match(String(ws.getCell(r, 4).value), /Tramo 2 · hito de avance de obra: USD 8,731,461, 2027-11-30 \(En revisión\)/);
    assert.equal((ws.getCell(fila(ws, 'Control: Σ fondos (confirmados y pendientes) − usos'), 3).value as { result: string }).result, 'Correcto (da 0)');
    assert.match(textoHoja(ws), /Incluye fondos sin confirmar/);
  });
  test('sin pendientes: el informativo da 0', () => {
    const filas = filasCronograma([{ concepto: 'Pago', fecha: '2027-01-15', monto: 10, estado: 'x' }], [{ concepto: 'Equity', fecha: '2027-01-01', monto: 10, estado: 'x', fuente: 'equity', confirmado: true }]);
    assert.equal(filas.reduce((a, f) => a + f.equityPendiente + f.deudaPendiente, 0), 0);
  });
  test('Portada: "Entidad federativa" y la limitación de moneda; Supuestos con la misma nota', () => {
    const p = wb.getWorksheet('Portada')!;
    assert.equal(p.getCell(fila(p, 'Entidad federativa'), 2).value, 'Sonora');
    assert.throws(() => fila(p, 'Estado'), /No hay/);
    assert.equal(p.getCell(fila(p, 'Limitación'), 2).value, NOTA_MONEDA);
    assert.equal(NOTA_MONEDA, 'Modelo en USD; el ISR se determina en pesos, por lo que el tipo de cambio puede modificar el escudo fiscal.');
    assert.equal(wb.getWorksheet('Supuestos')!.getCell('A4').value, NOTA_MONEDA);
  });
  test('Sensibilidad: el CAPEX actual con su valor exacto (0.744)', () => {
    const ws = wb.getWorksheet('Sensibilidad')!;
    const encabezado = fila(ws, 'TIR de equity') + 1;
    const titulos = Array.from({ length: 8 }, (_, i) => String(ws.getCell(encabezado, i + 1).value ?? ''));
    assert.ok(titulos.includes('0.744 (actual)'), titulos.join(' · '));
    assert.ok(titulos.includes('0.70') && titulos.includes('0.80'));
  });
  test('Flujo anual: todos los encabezados de montos con "(USD)"', () => {
    const ws = wb.getWorksheet('Flujo anual')!;
    const encabezado = fila(ws, 'Período');
    for (let c = 4; c <= 17; c++) assert.match(String(ws.getCell(encabezado, c).value), /\(USD\)$/, String(ws.getCell(encabezado, c).value));
  });
  test('Supuestos e Impuestos: nota de deducción inmediata; sin categorías, no hay tabla por categoría', () => {
    assert.match(textoHoja(wb.getWorksheet('Supuestos')!), /Validar con asesor fiscal qué activos califican para la deducción inmediata/);
    assert.match(textoHoja(wb.getWorksheet('Supuestos')!), /Referencia: construcciones 5 % anual/);
    const imp = wb.getWorksheet('Impuestos')!;
    assert.match(textoHoja(imp), /Validar con asesor fiscal qué activos califican para la deducción inmediata/);
    assert.doesNotMatch(textoHoja(imp), /Depreciación por categoría de activo/);
  });
});

describe('Excel: depreciación por categorías', () => {
  let wb: Workbook;
  const s = conCategorias({ ...REPARTO, ...TASAS });
  before(async () => { wb = await libro(s); });
  test('Supuestos muestra el reparto y las tasas capturadas', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const t = textoHoja(ws);
    assert.match(t, /Depreciación por categorías de activo \| Sí/);
    assert.match(t, /Obra civil: tasa \| 5 \| % anual/);
  });
  test('Impuestos: tabla por categoría, control Σ categorías − total = 0 y notas de generación e interconexión', () => {
    const ws = wb.getWorksheet('Impuestos')!;
    const t = textoHoja(ws);
    assert.match(t, /Depreciación por categoría de activo \(USD\)/);
    assert.match(t, /Equipo de generación \(32,550,000 USD a 100 % anual\)/);
    assert.match(t, /opere al menos 5 años/);
    assert.match(t, /transferidas a CFE/);
    const r = fila(ws, 'Control: Σ categorías − depreciación total');
    assert.equal((ws.getCell(r, 3).value as { result: string }).result, 'Correcto (da 0)');
    assert.equal((ws.getCell(fila(ws, 'Control: Σ depreciación − CAPEX depreciable'), 3).value as { result: string }).result, 'Correcto (da 0)');
  });
});
