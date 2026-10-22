// Excel del análisis financiero: las cifras deben ser las del tablero (mismo motor y mismo camino que App.jsx),
// las celdas de control deben dar 0 y el libro debe tener el formato acordado.
import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { Workbook, Worksheet, CellValue } from 'exceljs';
import { crearModeloFinanciero, calendarioPagos } from '../src/lib/modeloFinanciero';
import { compararEstructuras, calcularSensibilidad, tir, type Supuestos } from '../src/lib/rentabilidad';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { crearLibroFinanciero, archivoAnalisisFinanciero, nombreArchivoAnalisis, filasFlujo, HOJAS, MIME_XLSX, type DatosAnalisis } from '../src/lib/exportarFinanzas';

/** Mismo camino que App.jsx: modelo base → calendario → estructuras → la seleccionada → modelo con la deuda → sensibilidad. */
function tablero(project: { id: string; name: string; capacityMw: number; capex: number; state: string; esEjemplo: boolean; fechaRtb: string | null }, supuestos: Supuestos) {
  const base = crearModeloFinanciero(project);
  const conCronograma = crearModeloFinanciero(project, [], []);
  const calendario = calendarioPagos(conCronograma.pagos, supuestos.mesesConstruccion ?? 12, conCronograma.fechaNtp);
  const rentabilidad = compararEstructuras(supuestos, base.capex, base.mwdc, calendario).find((r) => r.estructura === supuestos.estructuraSeleccionada)!;
  const finanzas = crearModeloFinanciero({ ...project, capex: rentabilidad.capex }, [], [],
    { deuda: rentabilidad.deuda, idc: rentabilidad.usos.idc, comision: rentabilidad.usos.comision, dsra: rentabilidad.usos.dsra });
  const sensibilidad = calcularSensibilidad(supuestos, supuestos.estructuraSeleccionada, base.capex, base.mwdc, calendario);
  return { rentabilidad, finanzas, sensibilidad };
}

const GENERADO = new Date('2026-10-13T16:45:00Z'); // 10:45 en el centro de México
function datos(project: Parameters<typeof tablero>[0], supuestos: Supuestos): { d: DatosAnalisis; t: ReturnType<typeof tablero> } {
  const t = tablero(project, supuestos);
  return {
    t,
    d: {
      proyecto: { nombre: project.name, estado: project.state, capacidad: '50 MWac / 62.5 MWdc', esEjemplo: project.esEjemplo, fechaRtb: project.fechaRtb },
      supuestos, rentabilidad: t.rentabilidad,
      cronograma: { pagos: t.finanzas.pagos, fondos: t.finanzas.fondos, origen: t.finanzas.origenCronograma },
      sensibilidad: t.sensibilidad, generado: GENERADO,
      fuentesUsos: { capex: t.finanzas.capex, idc: t.finanzas.idc, comision: t.finanzas.comision, dsra: t.finanzas.dsra, usos: t.finanzas.usos, deuda: t.finanzas.deuda, equity: t.finanzas.equity }, version: '1.0.0 (prueba)', exportadoPor: 'banco@prueba.example',
    },
  };
}

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const REAL = { id: 'real-sin-cronograma', name: 'Planta Real', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: false, fechaRtb: null };

/** Valor numérico de una celda (valor o resultado de fórmula). */
const numero = (v: CellValue): number => (typeof v === 'number' ? v : v && typeof v === 'object' && 'result' in v ? Number(v.result ?? 0) : NaN);

/** Fila cuyo texto de la columna A empieza con `etiqueta`. */
function fila(ws: Worksheet, etiqueta: string): number {
  for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 1).value ?? '').startsWith(etiqueta)) return r;
  throw new Error(`No hay fila «${etiqueta}» en ${ws.name}`);
}
const valorDe = (ws: Worksheet, etiqueta: string) => numero(ws.getCell(fila(ws, etiqueta), 2).value);

/**
 * Evalúa una celda de control: ROUND(<suma y resta de celdas>,2). Las referencias apuntan a valores o a totales
 * (SUM) con su resultado guardado; ExcelJS no guarda el resultado 0, así que se calcula aquí.
 */
function evaluar(ws: Worksheet, f: string): number {
  const m = f.match(/^ROUND\((.+),2\)$/);
  assert.ok(m, `control con forma ROUND(…,2): ${f}`);
  let total = 0;
  for (const [, signo, ref] of m![1].matchAll(/([+-]?)([A-Z]+\d+)/g)) {
    const v = ws.getCell(ref).value;
    const n = typeof v === 'object' && v && 'formula' in v ? sumaDe(ws, String(v.formula), v) : numero(v);
    total += signo === '-' ? -n : n;
  }
  return Math.round(total * 100) / 100 || 0; // sin -0
}
function sumaDe(ws: Worksheet, f: string, v: { result?: unknown }): number {
  const s = f.match(/^SUM\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/);
  if (!s) return Number(v.result ?? 0);
  let t = 0;
  for (let r = Number(s[2]); r <= Number(s[4]); r++) t += numero(ws.getCell(`${s[1]}${r}`).value) || 0;
  return t;
}
function controles(wb: Workbook) {
  const lista: { hoja: string; descripcion: string; formula: string; valor: number }[] = [];
  wb.eachSheet((ws) => {
    for (let r = 1; r <= ws.rowCount; r++) {
      const a = String(ws.getCell(r, 1).value ?? '');
      if (!a.startsWith('Control:')) continue;
      const v = ws.getCell(r, 2).value as { formula: string };
      lista.push({ hoja: ws.name, descripcion: a, formula: v.formula, valor: evaluar(ws, v.formula) });
    }
  });
  return lista;
}

async function releer(d: DatosAnalisis): Promise<Workbook> {
  const wb = await crearLibroFinanciero(ExcelJS, d);
  const buffer = await wb.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buffer as ArrayBuffer);
  return leido;
}

describe('Excel del análisis financiero: Alpha I (ejemplo)', () => {
  const { d, t } = datos(ALPHA, { ...SUPUESTOS_ILUSTRATIVOS });
  const r = t.rentabilidad;
  let wb: Workbook;
  before(async () => { wb = await releer(d); });

  test('9 hojas en el orden acordado', () => {
    assert.deepEqual(wb.worksheets.map((w) => w.name), [...HOJAS]);
  });
  test('Cronograma de caja: la columna A cabe "Control: Σ fondos (confirmados y pendientes) − usos" sin cortarse', () => {
    assert.equal(wb.getWorksheet('Cronograma de caja')!.getColumn(1).width, 48);
  });
  test('Resumen = tablero: TIR, deuda, equity, DSCR mínimo y usos', () => {
    const ws = wb.getWorksheet('Resumen')!;
    assert.equal(valorDe(ws, 'TIR de proyecto'), r.tirProyecto);
    assert.equal(valorDe(ws, 'TIR de equity'), r.tirEquity);
    assert.equal(valorDe(ws, 'DSCR mínimo con P50'), r.dscrMinP50);
    assert.equal(valorDe(ws, 'DSCR mínimo con P90'), r.dscrMinP90);
    // Deuda, equity y usos: exactamente los que muestra el tablero (redondeados a dólares)
    assert.equal(valorDe(ws, 'Deuda (USD)'), t.finanzas.deuda);
    assert.equal(valorDe(ws, 'Equity (USD)'), t.finanzas.equity);
    assert.equal(valorDe(ws, 'Usos totales (USD)'), t.finanzas.usos);
    // …y son el cálculo del motor redondeado (no otro cálculo)
    assert.ok(Math.abs(t.finanzas.deuda - r.deuda) <= 0.5);
    assert.ok(Math.abs(t.finanzas.usos - r.usos.total) <= 2);
  });
  test('Fuentes y usos = tablero', () => {
    const ws = wb.getWorksheet('Fuentes y usos')!;
    assert.equal(valorDe(ws, 'CAPEX'), t.finanzas.capex);
    assert.equal(valorDe(ws, 'Intereses durante la construcción'), t.finanzas.idc);
    assert.equal(valorDe(ws, 'Equity'), t.finanzas.equity);
    assert.equal(valorDe(ws, 'Deuda'), t.finanzas.deuda);
  });
  test('todas las celdas de control dan 0', () => {
    const c = controles(wb);
    assert.ok(c.length >= 10, `${c.length} controles`);
    for (const x of c) assert.equal(x.valor, 0, `${x.hoja} · ${x.descripcion} (${x.formula}) = ${x.valor}`);
    // Su texto dice "Correcto" (resultado de la fórmula)
    for (const x of c) {
      const ws = wb.getWorksheet(x.hoja)!;
      assert.equal((ws.getCell(fila(ws, x.descripcion), 3).value as { result?: string }).result, 'Correcto (da 0)');
    }
  });
  test('en todas las hojas, el texto del control es una fórmula IF y el color es formato condicional (verde = 0, rojo ≠ 0)', async () => {
    // El formato condicional se revisa en el libro generado (ExcelJS no lo vuelve a leer)
    const generado = await crearLibroFinanciero(ExcelJS, d);
    let revisados = 0;
    generado.eachSheet((ws) => {
      const reglas = (ws as unknown as { conditionalFormattings: { ref: string; rules: { formulae: string[]; style: { fill: { bgColor: { argb: string } } } }[] }[] }).conditionalFormattings;
      for (let r = 1; r <= ws.rowCount; r++) {
        const a = String(ws.getCell(r, 1).value ?? '');
        if (!a.startsWith('Control:')) continue;
        revisados++;
        const texto = ws.getCell(r, 3).value as { formula: string; result: string };
        assert.equal(texto.formula.startsWith(`IF(B${r}=0,"Correcto (da 0)","Revisar: debe dar 0.`), true, `${ws.name} fila ${r}: ${texto.formula}`);
        // Sin colores fijos: los pone el formato condicional
        assert.equal(ws.getCell(r, 2).fill, undefined, `${ws.name} fila ${r} sin relleno fijo`);
        const cf = reglas.find((x) => x.ref === `A${r}:C${r}`);
        assert.ok(cf, `${ws.name} fila ${r}: formato condicional`);
        assert.deepEqual(cf!.rules.map((x) => x.formulae[0]), [`$B$${r}=0`, `$B$${r}<>0`]);
        assert.deepEqual(cf!.rules.map((x) => x.style.fill.bgColor.argb), ['FFE3F4E8', 'FFFDE2E1']);
      }
    });
    assert.ok(revisados >= 10, `${revisados} controles`);
    // Y la fórmula se conserva al guardar y abrir el archivo
    const ws = wb.getWorksheet('Fuentes y usos')!;
    assert.match(String((ws.getCell(fila(ws, 'Control: Fuentes − Usos'), 3).value as { formula: string }).formula), /^IF\(B17=0,"Correcto \(da 0\)","Revisar: debe dar 0\."\)$/);
  });
  test('Flujo anual: construcción + 30 años; la TIR del archivo es la del tablero', () => {
    const ws = wb.getWorksheet('Flujo anual')!;
    const inicio = fila(ws, 'Período') + 1;
    const fin = fila(ws, 'Total') - 1;
    assert.equal(fin - inicio + 1, r.construccion.proyecto.length + 30);
    const columna = (titulo: string) => {
      for (let c = 1; c <= 20; c++) if (ws.getCell(inicio - 1, c).value === titulo) return c;
      throw new Error(titulo);
    };
    const serie = (c: number) => Array.from({ length: fin - inicio + 1 }, (_, i) => numero(ws.getCell(inicio + i, c).value));
    assert.ok(Math.abs(tir(serie(columna('Flujo del proyecto (USD)')))! - r.tirProyecto!) < 1e-9);
    assert.ok(Math.abs(tir(serie(columna('Flujo al equity (USD)')))! - r.tirEquity!) < 1e-9);
    assert.equal(numero(ws.getCell(inicio + r.construccion.proyecto.length, columna('CFADS (USD)')).value), r.anos[0].cfads);
  });
  test('Deuda: DSCR por año igual al del motor y saldo final en 0', () => {
    const ws = wb.getWorksheet('Deuda')!;
    const inicio = fila(ws, 'Año de operación') + 1;
    for (let i = 0; i < r.plazoDeudaAnos; i++) {
      assert.equal(numero(ws.getCell(inicio + i, 8).value), r.anos[i].dscr);
      assert.equal(numero(ws.getCell(inicio + i, 10).value), r.anos[i].dscrP90);
    }
    assert.ok(Math.abs(r.anos[r.plazoDeudaAnos - 1].saldoDeuda) < 1);
  });
  test('formato: montos con separador de miles, porcentajes, paneles inmovilizados y hojas protegidas', () => {
    const resumen = wb.getWorksheet('Resumen')!;
    assert.equal(resumen.getCell(fila(resumen, 'TIR de proyecto'), 2).numFmt, '0.00%'); // TIR con 2 decimales, como en la app
    assert.match(resumen.getCell(fila(resumen, 'Deuda (USD)'), 2).numFmt, /^#,##0/);
    assert.equal(resumen.getCell(fila(resumen, 'DSCR mínimo con P50'), 2).numFmt, '0.00"x"');
    for (const nombre of ['Deuda', 'Flujo anual', 'Impuestos', 'Cronograma de caja']) {
      const v = wb.getWorksheet(nombre)!.views[0] as { state: string; xSplit?: number; ySplit?: number };
      assert.equal(v.state, 'frozen', nombre);
      assert.equal(v.ySplit, 5, nombre);
      assert.equal(v.xSplit, 1, nombre);
    }
    const encabezado = wb.getWorksheet('Flujo anual')!.getCell(5, 2);
    assert.equal(encabezado.font?.bold, true);
    // Protección (sin contraseña): la hoja tiene sheetProtection
    for (const ws of wb.worksheets) assert.ok((ws as unknown as { sheetProtection?: object }).sheetProtection, `${ws.name} protegida`);
  });
  test('"Ilustrativo" en la portada y en el encabezado de cada hoja; escenario y fecha en cada hoja', () => {
    assert.match(String(wb.getWorksheet('Portada')!.getCell(fila(wb.getWorksheet('Portada')!, 'Tipo de datos'), 2).value), /Ilustrativo/);
    for (const ws of wb.worksheets.slice(1)) {
      assert.match(String(ws.getCell('A3').value), /Ilustrativo/, ws.name);
      assert.match(String(ws.getCell('A2').value), /^Alpha I · estructura .+ · 13 oct 2026, 10:45/, ws.name);
    }
  });
  test('portada: versión, quién exportó, nota de uso y aviso legal', () => {
    const ws = wb.getWorksheet('Portada')!;
    assert.equal(ws.getCell(fila(ws, 'Versión de AuraGrid'), 2).value, '1.0.0 (prueba)');
    assert.equal(ws.getCell(fila(ws, 'Exportado por'), 2).value, 'banco@prueba.example');
    const texto = ws.getSheetValues().flat().map(String).join(' ');
    assert.match(texto, /Para cambiar supuestos, hazlo en la app y vuelve a exportar/);
    assert.match(texto, /no constituyen asesoría financiera/);
  });
  test('supuestos con su fuente', () => {
    const ws = wb.getWorksheet('Supuestos')!;
    const f = fila(ws, 'Producción') ;
    assert.equal(ws.getCell(f, 2).value, 'Rendimiento con estructura fija');
    assert.match(String(ws.getCell(f, 5).value), /PVGIS/);
    assert.match(String(ws.getCell(fila(ws, 'Ingresos'), 5).value), /PPA/);
  });
  test('sensibilidad con el caso actual resaltado', () => {
    const ws = wb.getWorksheet('Sensibilidad')!;
    const s = t.sensibilidad;
    const filaTir = fila(ws, 'TIR de equity') + 2 + s.filaActual;
    const celda = ws.getCell(filaTir, s.columnaActual + 2);
    assert.equal(numero(celda.value), s.celdas[s.filaActual][s.columnaActual].tirEquity);
    assert.ok(Math.abs(numero(celda.value) - r.tirEquity!) < 1e-9, 'el caso actual de la sensibilidad es la TIR del tablero');
  });
});

describe('Excel del análisis financiero: proyecto real sin cronograma', () => {
  const { d } = datos(REAL, { ...SUPUESTOS_ILUSTRATIVOS });
  let wb: Workbook;
  before(async () => { wb = await releer(d); });
  test('sin etiqueta "Ilustrativo"; el cronograma lo explica; los controles dan 0', () => {
    for (const ws of wb.worksheets.slice(1)) assert.doesNotMatch(String(ws.getCell('A3').value ?? ''), /Ilustrativo/, ws.name);
    assert.match(String(wb.getWorksheet('Cronograma de caja')!.getCell('A5').value), /no tiene pagos ni fuentes/);
    for (const x of controles(wb)) assert.equal(x.valor, 0, `${x.hoja} · ${x.descripcion}`);
    assert.match(String(wb.getWorksheet('Supuestos')!.getCell(fila(wb.getWorksheet('Supuestos')!, 'Costos'), 5).value), /Dato del usuario/);
  });
});

describe('Archivo descargable', () => {
  test('nombre "<proyecto>_analisis_financiero_AAAA-MM-DD.xlsx" (fecha del centro de México) y tipo xlsx', async () => {
    assert.equal(nombreArchivoAnalisis('Alpha I', GENERADO), 'Alpha_I_analisis_financiero_2026-10-13.xlsx');
    assert.equal(nombreArchivoAnalisis('Alpha I', new Date('2026-10-14T03:00:00Z')), 'Alpha_I_analisis_financiero_2026-10-13.xlsx');
    const { d } = datos(ALPHA, { ...SUPUESTOS_ILUSTRATIVOS });
    const { nombre, blob } = await archivoAnalisisFinanciero(ExcelJS, d);
    assert.equal(nombre, 'Alpha_I_analisis_financiero_2026-10-13.xlsx');
    assert.equal(blob.type, MIME_XLSX);
    const inicio = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
    assert.deepEqual([...inicio], [0x50, 0x4b]); // "PK": un .xlsx es un zip
  });
});

describe('Detalle del motor: suma exactamente los totales del tablero', () => {
  const r = tablero(ALPHA, { ...SUPUESTOS_ILUSTRATIVOS }).rentabilidad;
  test('ingresos, costos, amortización y base gravable por año', () => {
    for (const a of r.anos) {
      assert.ok(Math.abs(a.ingresosPpa + a.ingresosMercado - a.ingresos) < 1e-6, `ingresos año ${a.ano}`);
      assert.ok(Math.abs(a.opex + a.seguros + a.arrendamiento + a.omEstructura - a.costos) < 1e-6, `costos año ${a.ano}`);
      assert.ok(Math.abs(a.amortizacion + a.intereses - a.servicioDeuda) < 1e-6, `servicio año ${a.ano}`);
      assert.ok(Math.abs(a.baseGravable - (a.ebitda - a.depreciacion - a.intereses)) < 1e-6, `base año ${a.ano}`);
      assert.ok(a.energiaP90Mwh < a.energiaMwh);
    }
  });
  test('flujos del archivo = flujos con que el motor calcula la TIR', () => {
    const f = filasFlujo(r);
    assert.equal(tir(f.map((x) => x.flujoProyecto)), r.tirProyecto);
    assert.equal(tir(f.map((x) => x.flujoEquity)), r.tirEquity);
  });
});

describe('Excel: TIR objetivo sin capturar', () => {
  /** Valor de la columna C de la fila de Supuestos cuya columna B empieza con `etiqueta`. */
  const supuesto = (wb: Workbook, etiqueta: string) => {
    const ws = wb.getWorksheet('Supuestos')!;
    for (let r = 1; r <= ws.rowCount; r++) if (String(ws.getCell(r, 2).value ?? '').startsWith(etiqueta)) return ws.getCell(r, 3);
    throw new Error(`No hay supuesto «${etiqueta}»`);
  };
  test('vacía (null): "Sin capturar", no 0.00 %', async () => {
    const { d } = datos(REAL, { ...SUPUESTOS_ILUSTRATIVOS, tirEquityObjetivoPct: null });
    const celda = supuesto(await releer(d), 'TIR de equity objetivo');
    assert.equal(celda.value, 'Sin capturar');
    assert.notEqual(celda.value, 0);
  });
  test('capturada: su valor numérico', async () => {
    const { d } = datos(REAL, { ...SUPUESTOS_ILUSTRATIVOS, tirEquityObjetivoPct: 12 });
    assert.equal(supuesto(await releer(d), 'TIR de equity objetivo').value, 12);
  });
});
