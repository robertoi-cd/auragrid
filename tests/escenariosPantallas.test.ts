// Nivel bancario A, fase 3: tabla "Escenarios de estrés" en Finanzas, LLCR/PLCR y quiebre en los indicadores, detalle
// del COD +6 meses y, en el Excel, la hoja "Escenarios" con la convención y LLCR/PLCR en Resumen.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet } from 'exceljs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { crearLibroFinanciero, hojasDelLibro, anosBajoCovenant, HOJAS, type DatosAnalisis } from '../src/lib/exportarFinanzas';
import { mensajeCovenantDsra, NOTA_CONVENCION_ESCENARIOS, NOTA_COD6 } from '../src/lib/escenarios';
import { kpisResumen } from '../src/lib/modulos';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { Supuestos } from '../src/lib/rentabilidad';
import type { Credito } from '../src/lib/creditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const MIGRADO: Credito = { orden: 1, banco: null, participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, comisionNoDisposicionPct: null, estado: 'aprobado' };
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const analizar = (s: Partial<Supuestos> = {}) => analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...S, ...s } as Supuestos, creditos: [MIGRADO] });
function datos(a: ReturnType<typeof analizar>, conEscenarios = true): DatosAnalisis {
  const f = a.finanzas;
  return {
    proyecto: { nombre: ALPHA.name, estado: ALPHA.state, capacidad: '50 MWac / 62.5 MWdc', esEjemplo: true, fechaRtb: ALPHA.fechaRtb },
    supuestos: a.supuestosConCreditos!, rentabilidad: a.rentabilidad, cronograma: { pagos: f.pagos, fondos: f.fondos, origen: f.origenCronograma },
    sensibilidad: null, costoIva: a.costoIva,
    fuentesUsos: { capex: f.capex, idc: f.idc, comision: f.comision, dsra: f.dsra, usos: f.usos, deuda: f.deuda, equity: f.equity, noDisposicion: f.noDisposicion },
    creditos: { lista: [MIGRADO], porCredito: a.porCredito, condiciones: a.condicionesCreditos },
    ...(conEscenarios ? { escenarios: a.escenarios, quiebres: a.quiebres } : {}),
    generado: new Date('2026-10-13T16:45:00Z'), version: '1.0.0 (prueba)', exportadoPor: 'banco@prueba.example',
  };
}
async function releer(d: DatosAnalisis): Promise<Workbook> {
  const wb = await crearLibroFinanciero(ExcelJS, d);
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(await wb.xlsx.writeBuffer() as ArrayBuffer);
  return leido;
}
function fila(ws: Worksheet, etiqueta: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(etiqueta)) return r;
  throw new Error(`No hay fila «${etiqueta}» en ${ws.name}`);
}
/**
 * Huella de una hoja celda por celda: valor (y fórmula), formato de número, fuente, relleno, borde, alineación,
 * protección y celda combinada de cada celda; altos de fila, anchos de columna, combinadas, formato condicional, vistas,
 * protección de la hoja, configuración de página y propiedades. Criterio acordado con el usuario (19 oct 2026): las
 * hojas que no cambian deben ser idénticas celda por celda (los índices de las tablas comunes del libro sí se recorren).
 */
function huella(ws: Worksheet): string {
  const celdas: string[] = [];
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    celdas.push(`fila ${r} alto=${row.height ?? ''}`);
    row.eachCell({ includeEmpty: true }, (c) => celdas.push(JSON.stringify([c.address, c.value, c.numFmt, c.font, c.fill, c.border, c.alignment, c.protection, c.isMerged ? c.master.address : null])));
  });
  const cols = Array.from({ length: ws.columnCount }, (_, i) => ws.getColumn(i + 1).width);
  const extra = ws as unknown as { conditionalFormattings: unknown; sheetProtection: unknown };
  return JSON.stringify({
    celdas, cols, merges: (ws.model as { merges?: unknown }).merges, condicional: extra.conditionalFormattings,
    views: ws.views, proteccion: extra.sheetProtection, pageSetup: ws.pageSetup, props: ws.properties,
  });
}

describe('Mensaje cuando la DSRA cubre un año bajo el covenant', () => {
  test('texto pedido; con lock-up capturado y por debajo, sin distribuciones ese año', () => {
    assert.equal(mensajeCovenantDsra(0.7039, 1.15, null), 'DSCR 0.70x, bajo el covenant (1.15x). El pago se cubre con la DSRA, pero el incumplimiento del covenant requiere una dispensa (waiver) del banco.');
    assert.equal(mensajeCovenantDsra(0.7039, 1.15, 1.1), 'DSCR 0.70x, bajo el covenant (1.15x). El pago se cubre con la DSRA, pero el incumplimiento del covenant requiere una dispensa (waiver) del banco. Lock-up: sin distribuciones al equity ese año.');
  });
});

describe('Indicadores del Resumen: LLCR, PLCR y caída de ingresos tolerable', () => {
  const a = analizar();
  test('con escenarios: LLCR 1.414x, PLCR 1.804x y 15.8 % / 24.5 %', () => {
    const k = Object.fromEntries(kpisResumen({ finanzas: a.finanzas, rentabilidad: a.rentabilidad, supuestos: a.supuestosConCreditos, motivoNd: '', escenarios: a.escenarios, quiebres: a.quiebres }).map((x) => [x.clave, x]));
    assert.equal((k.llcr.valor as number).toFixed(3), '1.414');
    assert.equal((k.plcr.valor as number).toFixed(3), '1.804');
    assert.equal(k.quiebre.valor, '15.8 % / 24.5 %');
    assert.match(String(k.quiebre.contexto), /Hasta el covenant \(1\.15x\) \/ hasta DSCR 1\.00x · deuda fija, ISR recalculado/);
  });
  test('sin escenarios, la lista de indicadores es la de antes', () => {
    const claves = kpisResumen({ finanzas: a.finanzas, rentabilidad: a.rentabilidad, supuestos: a.supuestosConCreditos, motivoNd: '' }).map((x) => x.clave);
    assert.deepEqual(claves, ['tirEquity', 'tirProyecto', 'dscrP50', 'dscrP90', 'capex', 'deuda', 'lcoe', 'ppa']);
  });
});

describe('Pantalla: tabla de escenarios y detalle del COD +6', () => {
  const t = fs.readFileSync('src/TablaEscenarios.jsx', 'utf8');
  test('en rojo lo que baja del covenant (DSCR mínimo, promedio y años)', () => {
    assert.match(t, /const bajo = \(x\) => x != null && x < covenant;/);
    assert.match(t, /color: bajo\(e\.dscrMin\) \? ROJO/);
    assert.match(t, /color: e\.anosBajoCovenant\.length \? ROJO/);
  });
  test('detalle del COD +6: faltante, uso y reposición de la DSRA; mensaje de waiver o de incumplimiento', () => {
    for (const k of ['Faltante', 'DSRA disponible', 'Uso de la DSRA', 'Reposición de la DSRA', 'Intereses adicionales (equity)']) assert.ok(t.includes(`'${k}'`), k);
    assert.match(t, /mensajeCovenantDsra\(cod6\.dscrAno1, covenant, lockup\)/);
    assert.match(t, /Incumplimiento de pago en el año 1 con COD \+6 meses: la DSRA no alcanza/);
  });
  test('Finanzas y Resumen reciben los escenarios', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /escenarios=\{escenarios\}\n\s*quiebres=\{quiebres\}/);
    assert.match(app, /escenarios=\{escenarios\} quiebres=\{quiebres\}/);
    assert.match(fs.readFileSync('src/FinancialDashboard.jsx', 'utf8'), /<TablaEscenarios escenarios=\{escenarios\} quiebres=\{quiebres\} covenant=\{supuestos\.dscrCovenant\} lockup=\{supuestos\.dscrLockup \?\? null\} \/>/);
  });
});

describe('Excel: hoja "Escenarios" y LLCR/PLCR en Resumen', () => {
  const a = analizar();
  let wb: Workbook, sin: Workbook;
  before(async () => { wb = await releer(datos(a)); sin = await releer(datos(a, false)); });
  test('la hoja Escenarios va al final; sin escenarios, las de siempre', () => {
    assert.deepEqual(wb.worksheets.map((w) => w.name), [...HOJAS, 'Escenarios']);
    assert.deepEqual(hojasDelLibro({ supuestos: S }), [...HOJAS]);
    // La Portada la lista en su contenido (la numeración no cuenta la Portada)
    const portada = wb.getWorksheet('Portada')!;
    const enContenido = Array.from({ length: portada.rowCount }, (_, i) => portada.getCell(i + 1, 1).value);
    assert.ok(enContenido.includes('8. Sensibilidad') && enContenido.includes('9. Escenarios'));
  });
  test('tabla: una fila por escenario con sus métricas (3 decimales) y el formato condicional del covenant', () => {
    const ws = wb.getWorksheet('Escenarios')!;
    a.escenarios!.forEach((e, i) => {
      assert.equal(ws.getCell(6 + i, 1).value, e.nombre);
      assert.equal(ws.getCell(6 + i, 2).value, e.dscrMin);
      assert.equal(ws.getCell(6 + i, 5).value, e.llcr);
    });
    assert.equal(ws.getCell(6, 2).numFmt, '0.000"x"');
    assert.equal(ws.getCell(14, 9).value, '1 (año 1)', 'COD +6 meses: año 1 bajo el covenant');
    assert.equal(ws.getCell(6, 9).value, 'Ninguno');
    assert.deepEqual([[1], [1, 3], [2, 5, 9]].map(anosBajoCovenant), ['1 (año 1)', '2 (años 1 y 3)', '3 (años 2, 5 y 9)']);
    const cov = fila(ws, 'Covenant');
    assert.equal(ws.getCell(cov, 2).value, 1.15);
    assert.match(JSON.stringify((ws as unknown as { conditionalFormattings: unknown }).conditionalFormattings), new RegExp(`B6<\\$B\\$${cov}`));
    assert.equal(ws.getCell('A4').value, NOTA_CONVENCION_ESCENARIOS);
  });
  test('quiebres y detalle del COD +6 con el mensaje de waiver y la nota del PPA', () => {
    const ws = wb.getWorksheet('Escenarios')!;
    assert.equal((ws.getCell(fila(ws, 'Caída de ingresos hasta el covenant'), 2).value as number).toFixed(3), '0.158');
    assert.equal(Math.round(ws.getCell(fila(ws, 'Faltante'), 2).value as number), 1_024_946);
    assert.equal(ws.getCell(fila(ws, '¿La DSRA alcanza?'), 2).value, 'Sí');
    assert.equal(ws.getCell(fila(ws, 'Año en que se repone la DSRA'), 2).value, 2);
    assert.equal(ws.getCell(fila(ws, 'DSCR 0.70x, bajo el covenant'), 1).value, mensajeCovenantDsra(a.escenarios!.at(-1)!.cod6!.dscrAno1!, 1.15, null));
    assert.equal(ws.getCell(fila(ws, 'COD +6 meses: el calendario'), 1).value, NOTA_COD6);
  });
  test('con lock-up capturado: su fila y el mensaje del lock-up', async () => {
    const w = await releer(datos(analizar({ dscrLockup: 1.1 })));
    const ws = w.getWorksheet('Escenarios')!;
    assert.equal(ws.getCell(fila(ws, 'DSCR de lock-up'), 2).value, 1.1);
    assert.match(String(ws.getCell(fila(ws, 'DSCR 0.70x, bajo el covenant'), 1).value), /Lock-up: sin distribuciones al equity ese año\.$/);
  });
  test('Resumen: LLCR, PLCR y caídas tolerables al final de la tabla', () => {
    const ws = wb.getWorksheet('Resumen')!;
    assert.equal((ws.getCell(fila(ws, 'LLCR'), 2).value as number).toFixed(3), '1.414');
    assert.equal((ws.getCell(fila(ws, 'PLCR'), 2).value as number).toFixed(3), '1.804');
    assert.equal((ws.getCell(fila(ws, 'Caída de ingresos hasta DSCR 1.0x'), 2).value as number).toFixed(3), '0.245');
    assert.ok(fila(ws, 'LLCR') > fila(ws, 'Pérdida fiscal que caduca'));
  });
  test('las otras 7 hojas, idénticas celda por celda al libro sin escenarios (solo cambian Portada y Resumen)', () => {
    const otras = HOJAS.filter((h) => h !== 'Portada' && h !== 'Resumen');
    assert.deepEqual(otras, ['Supuestos', 'Fuentes y usos', 'Deuda', 'Flujo anual', 'Impuestos', 'Cronograma de caja', 'Sensibilidad']);
    for (const nombre of otras) assert.equal(huella(wb.getWorksheet(nombre)!), huella(sin.getWorksheet(nombre)!), nombre);
    assert.notEqual(huella(wb.getWorksheet('Resumen')!), huella(sin.getWorksheet('Resumen')!), 'Resumen sí cambia (LLCR, PLCR y quiebres)');
  });
  test('también con IVA activo y con varios créditos (hojas IVA y Deuda por banco)', async () => {
    const IVA = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'importacion', ivaFinanciamiento: 'equity' } as Partial<Supuestos>;
    const dos: Credito[] = [{ ...MIGRADO, banco: 'Banco Norte', participacionPct: 60 }, { ...MIGRADO, orden: 2, banco: 'Banco Sur', participacionPct: 40, tasaAnualPct: 6.5, comisionEstructuracionPct: 1 }];
    const b = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...S, ...IVA } as Supuestos, creditos: dos });
    const conDos = (con: boolean): DatosAnalisis => ({ ...datos(b, con), creditos: { lista: dos, porCredito: b.porCredito, condiciones: b.condicionesCreditos } });
    const [w1, w0] = [await releer(conDos(true)), await releer(conDos(false))];
    const otras = w0.worksheets.map((w) => w.name).filter((h) => h !== 'Portada' && h !== 'Resumen');
    assert.ok(otras.includes('IVA'));
    for (const nombre of otras) assert.equal(huella(w1.getWorksheet(nombre)!), huella(w0.getWorksheet(nombre)!), nombre);
  });
});
