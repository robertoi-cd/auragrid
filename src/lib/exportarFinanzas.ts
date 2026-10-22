// Excel del análisis financiero ("Exportar análisis financiero"): un reporte de las cifras que calcula la app.
// - Todos los valores salen del motor (rentabilidad.ts y modeloFinanciero.ts); Excel no recalcula nada.
// - Solo hay fórmulas en los totales y en las celdas de control (deben dar 0), con su resultado ya calculado.
// - Hojas protegidas sin contraseña: evitan cambiar un número por accidente y hacer circular una cifra que la app
//   nunca calculó. Para cambiar supuestos se usa la app y se vuelve a exportar.
// Recibe ExcelJS como parámetro (en el navegador se carga solo al exportar; en las pruebas, desde Node).
import type ExcelJSNS from 'exceljs';
import type { Workbook, Worksheet, Cell } from 'exceljs';
import {
  ESTRUCTURAS, CRITERIOS_DEUDA, ESQUEMAS_DEPRECIACION, ANOS_AMORTIZACION_PERDIDAS, depreciacionPorCategoria, tir, valorPresenteFechado,
  type Supuestos, type Rentabilidad, type Sensibilidad,
} from './rentabilidad';
import { esPagoDeObra, calcularFlujoAcumulado, type Movimiento } from './modeloFinanciero';
import {
  GRUPOS, CAMPOS_DEPRECIACION_CATEGORIAS, CAMPOS_IVA, NOTA_DEDUCCION_INMEDIATA, NOTA_EQUIPO_GENERACION, NOTA_INTERCONEXION, REFERENCIA_CONSTRUCCIONES, NOTA_MONEDA,
} from './camposSupuestos';
import {
  movimientosIva, flujosFechadosIva, ORIGENES_EQUIPO, FINANCIAMIENTOS_IVA, NOTA_IVA, NOTA_TASA_IVA, NOTA_TASA_LINEA_IVA, FUENTE_TASA_IVA,
  LIMITACION_IVA_IMPORTACION, LIMITACION_IVA_INTERESES, textoDescuentoCostoIva, type MovimientoIva, type MesIva, type CostoIva,
} from './iva';
import { fuenteDe, origenProduccion, ETIQUETA_ILUSTRATIVO, ETIQUETA_DATO_USUARIO } from './fuentesSupuestos';
import { AVISO_LEGAL } from './avisoLegal';
import { NOTA_CONVENCION_ESCENARIOS, NOTA_COD6, mensajeCovenantDsra, anosBajoCovenant, type MetricasEscenario, type PuntosQuiebre } from './escenarios';
import { ESTADOS_CREDITO, NOTA_TRAMOS, type Credito, type CondicionesPonderadas, type ResultadoCredito } from './creditos';
import {
  explicacionTir, LIMITACIONES_ESTADOS, NOTA_DIVIDENDOS, NOTA_LOCKUP, NOTA_CAPITAL_VARIABLE, NOTA_COMISION_ESTRUCTURACION, type EstadosFinancieros,
} from './estadosFinancieros';
import { NOTA_TIR_ESCENARIOS } from './escenarios';

type ExcelJS = typeof ExcelJSNS;

export interface DatosAnalisis {
  proyecto: { nombre: string; estado: string; capacidad: string; esEjemplo: boolean; fechaRtb: string | null };
  supuestos: Supuestos;
  rentabilidad: Rentabilidad;
  /** Cronograma de caja del tablero (crearModeloFinanciero). */
  cronograma: { pagos: Movimiento[]; fondos: Movimiento[]; origen: 'capturado' | 'ejemplo' | 'ninguno' };
  sensibilidad: Sensibilidad | null;
  /**
   * Fuentes y usos tal como los muestra el tablero (crearModeloFinanciero: cada partida redondeada a dólares y
   * equity = usos − deuda). Se usan en Resumen y en Fuentes y usos para que el archivo diga lo mismo que la pantalla.
   */
  fuentesUsos: { capex: number; idc: number; comision: number; dsra: number; usos: number; deuda: number; equity: number; noDisposicion?: number };
  /**
   * Créditos de la deuda (analizarProyecto). Con más de un crédito, la hoja Deuda agrega una sección por banco y una de
   * totales con sus controles; con uno solo (al 100 %), el libro queda como antes.
   */
  creditos?: { lista: Credito[]; porCredito: ResultadoCredito[] | null; condiciones: CondicionesPonderadas | null } | null;
  /** Escenarios de estrés y puntos de quiebre (analizarProyecto). Con ellos: hoja "Escenarios" y LLCR/PLCR en Resumen. */
  escenarios?: MetricasEscenario[] | null;
  quiebres?: PuntosQuiebre | null;
  /** Costo financiero del IVA (analizarProyecto), solo con el IVA activo. */
  costoIva?: CostoIva | null;
  /** Estados financieros (analizarProyecto). Con ellos: hojas "Estado de resultados", "Balance" y "Flujo de efectivo" al final, las tres TIR en Resumen y el alcance del modelo en Supuestos. */
  estados?: EstadosFinancieros | null;
  generado: Date;
  version: string;
  exportadoPor: string | null;
}

export const HOJAS = ['Portada', 'Resumen', 'Supuestos', 'Fuentes y usos', 'Deuda', 'Flujo anual', 'Impuestos', 'Cronograma de caja', 'Sensibilidad'] as const;
type Hoja = (typeof HOJAS)[number] | 'IVA' | 'Escenarios' | 'Estado de resultados' | 'Balance' | 'Flujo de efectivo';

/** Hojas de los estados financieros (al final del libro: las de siempre conservan su número). */
export const HOJAS_ESTADOS = ['Estado de resultados', 'Balance', 'Flujo de efectivo'] as const;

/** Hojas del libro: con el IVA activo, la hoja "IVA" después del cronograma de caja; apagado, las mismas 9 de siempre. */
export function hojasDelLibro(d: Pick<DatosAnalisis, 'supuestos'> & Partial<Pick<DatosAnalisis, 'escenarios' | 'estados'>>): Hoja[] {
  const i = HOJAS.indexOf('Cronograma de caja') + 1;
  const base: Hoja[] = d.supuestos.ivaActivo ? [...HOJAS.slice(0, i), 'IVA', ...HOJAS.slice(i)] : [...HOJAS];
  // Escenarios al final: las hojas de siempre conservan su número
  const conEscenarios: Hoja[] = d.escenarios?.length ? [...base, 'Escenarios'] : base;
  return d.estados ? [...conEscenarios, ...HOJAS_ESTADOS] : conEscenarios;
}

export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const ZONA = 'America/Mexico_City';

// Formatos de número
const USD = '#,##0;[Red]-#,##0';
const MWH = '#,##0';
const PCT = '0.0%';
/** TIR con 2 decimales, igual que en la app. */
const PCT_TIR = '0.00%';
/** DSCR, LLCR y PLCR con 3 decimales (escenarios). */
const DSCR3 = '0.000"x"';
const DSCR = '0.00"x"';
const NUM = '#,##0.##';

const COLOR = { encabezado: 'FF1F3A5F', texto: 'FFFFFFFF', banda: 'FFF2F5F9', ok: 'FFE3F4E8', error: 'FFFDE2E1', aviso: 'FFFFF4D6', total: 'FFE8ECF2' };
const fecha = (d: Date) => new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: ZONA }).format(d).replace(/[\u00a0\u202f]/g, ' ');
const pct = (x: number) => x / 100;
/** Diferencia de TIR en puntos porcentuales (−0.0007 → −0.07 pp). */
const PP = '+0.00" pp";-0.00" pp";0.00" pp"';
const MES = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "2028-02" → "feb 2028" (como en la app). */
const mesLegible = (mes: string | null) => (mes ? MES.format(new Date(`${mes}-01T00:00:00Z`)).replace('.', '') : '—');

/** "<Proyecto>_analisis_financiero_AAAA-MM-DD.xlsx" (fecha del centro de México). */
export function nombreArchivoAnalisis(nombreProyecto: string, generado: Date): string {
  const base = (nombreProyecto || 'Proyecto').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Proyecto';
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(generado); // AAAA-MM-DD
  return `${base}_analisis_financiero_${dia}.xlsx`;
}

/** ¿Las cifras son ilustrativas? Proyecto de ejemplo. */
const esIlustrativo = (d: DatosAnalisis) => d.proyecto.esEjemplo;

// ---------------------------------------------------------------------------
// Utilidades de hoja
// ---------------------------------------------------------------------------

/** Título de la hoja (fila 1) y, debajo, proyecto · estructura · fecha y la etiqueta "Ilustrativo" si aplica. */
function encabezadoHoja(ws: Worksheet, titulo: string, d: DatosAnalisis, columnas: number) {
  ws.getCell('A1').value = titulo;
  ws.getCell('A1').font = { bold: true, size: 14, color: { argb: COLOR.encabezado } };
  ws.getCell('A2').value = `${d.proyecto.nombre} · estructura ${ESTRUCTURAS[d.rentabilidad.estructura].toLowerCase()} · ${fecha(d.generado)}`;
  ws.getCell('A2').font = { size: 10, color: { argb: 'FF555F6D' } };
  if (esIlustrativo(d)) {
    ws.getCell('A3').value = `⚠ ${ETIQUETA_ILUSTRATIVO}`;
    ws.getCell('A3').font = { bold: true, color: { argb: 'FF9A6700' } };
    ws.getCell('A3').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.aviso } };
    ws.mergeCells(3, 1, 3, Math.max(2, columnas));
  }
}

/** Fila de encabezados de una tabla. */
function encabezados(ws: Worksheet, fila: number, titulos: string[]) {
  const r = ws.getRow(fila);
  titulos.forEach((t, i) => {
    const c = r.getCell(i + 1);
    c.value = t;
    c.font = { bold: true, color: { argb: COLOR.texto } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.encabezado } };
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true };
  });
  r.height = 32;
}

const formato = (c: Cell, numFmt?: string) => { if (numFmt) c.numFmt = numFmt; };

/** Fórmula con su resultado ya calculado (Excel la recalcula al abrir). */
const formula = (c: Cell, f: string, resultado: number, numFmt?: string) => {
  c.value = { formula: f, result: resultado };
  formato(c, numFmt);
};

/**
 * Celda de control: fórmula ROUND(…, 2) que debe dar 0. Verde si da 0, rojo si no (con la nota).
 * Devuelve el resultado calculado para las pruebas.
 */
/** Texto para una fórmula de Excel: comillas duplicadas y máximo 255 caracteres (límite de Excel). */
const textoFormula = (t: string) => `"${t.slice(0, 250).replace(/"/g, '""')}"`;

/**
 * Colores con formato condicional de Excel (no fijos): si alguien cambia una cifra, el color se actualiza solo.
 * Fila A:C de la celda de control: verde si la columna B da 0; si no, rojo (control) o ámbar (informativo).
 */
function colorPorValor(ws: Worksheet, fila: number, distinto: 'error' | 'aviso') {
  const estilo = (relleno: string, letra: string) => ({
    fill: { type: 'pattern' as const, pattern: 'solid' as const, bgColor: { argb: relleno } },
    font: { bold: true, color: { argb: letra } },
  });
  ws.addConditionalFormatting({
    ref: `A${fila}:C${fila}`,
    rules: [
      { type: 'expression', priority: 1, formulae: [`$B$${fila}=0`], style: estilo(COLOR.ok, 'FF1E7B34') },
      { type: 'expression', priority: 2, formulae: [`$B$${fila}<>0`], style: distinto === 'error' ? estilo(COLOR.error, 'FFB42318') : estilo(COLOR.aviso, 'FF9A6700') },
    ],
  });
}

function control(ws: Worksheet, fila: number, descripcion: string, f: string, resultado: number, notaSiFalla = '') {
  const valor = Math.round(resultado * 100) / 100;
  ws.getCell(fila, 1).value = `Control: ${descripcion}`;
  ws.getCell(fila, 1).font = { bold: true };
  formula(ws.getCell(fila, 2), f, valor, '#,##0.00');
  // Texto con fórmula: se actualiza si cambia el resultado
  const correcto = 'Correcto (da 0)';
  const revisar = `Revisar: debe dar 0. ${notaSiFalla}`.trim();
  const c = ws.getCell(fila, 3);
  c.value = { formula: `IF(B${fila}=0,${textoFormula(correcto)},${textoFormula(revisar)})`, result: valor === 0 ? correcto : revisar };
  c.alignment = { wrapText: true };
  colorPorValor(ws, fila, 'error');
}

/**
 * Celda informativa (no tiene por qué dar 0, p. ej. fondos pendientes de confirmar): ámbar si hay monto, verde si es 0.
 * Empieza con "Informativo:" para distinguirla de los controles que deben dar 0.
 */
function informativo(ws: Worksheet, fila: number, descripcion: string, f: string, resultado: number, siCero: string, siNoCero: string, detalle: string) {
  const valor = Math.round(resultado * 100) / 100;
  ws.getCell(fila, 1).value = `Informativo: ${descripcion}`;
  ws.getCell(fila, 1).font = { bold: true };
  formula(ws.getCell(fila, 2), f, valor, USD);
  const c = ws.getCell(fila, 3);
  c.value = { formula: `IF(B${fila}=0,${textoFormula(siCero)},${textoFormula(siNoCero)})`, result: valor === 0 ? siCero : siNoCero };
  c.alignment = { wrapText: true };
  // El detalle puede pasar de 255 caracteres (límite de un texto en una fórmula): va en la columna siguiente
  if (detalle) {
    ws.getCell(fila, 4).value = detalle;
    ws.getCell(fila, 4).alignment = { wrapText: true, vertical: 'top' };
    ws.mergeCells(fila, 4, fila, 10);
    ws.getRow(fila).height = Math.max(30, Math.ceil(detalle.length / 120) * 15);
  }
  colorPorValor(ws, fila, 'aviso');
}

function anchos(ws: Worksheet, valores: number[]) {
  valores.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

/** Columnas como letra (1 → A). */
const col = (n: number): string => (n <= 26 ? String.fromCharCode(64 + n) : col(Math.floor((n - 1) / 26)) + String.fromCharCode(65 + ((n - 1) % 26)));

/** Tabla por año con fila de totales (fórmulas SUM). columnas: [título, valor por fila, formato, ¿suma?]. */
function tablaAnual<T>(
  ws: Worksheet, filaInicio: number, filas: T[], columnas: [string, (x: T) => string | number | null, string | undefined, boolean][],
) {
  encabezados(ws, filaInicio, columnas.map(([t]) => t));
  filas.forEach((x, i) => {
    const r = ws.getRow(filaInicio + 1 + i);
    columnas.forEach(([, valor, fmt], j) => {
      const c = r.getCell(j + 1);
      const v = valor(x);
      c.value = v == null ? null : v;
      formato(c, fmt);
    });
    if (i % 2 === 1) r.eachCell({ includeEmpty: true }, (c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } }; });
  });
  const filaTotal = filaInicio + filas.length + 1;
  const primera = filaInicio + 1;
  const ultima = filaInicio + filas.length;
  const totales: Record<number, number> = {};
  const rt = ws.getRow(filaTotal);
  rt.getCell(1).value = 'Total';
  columnas.forEach(([, valor, fmt, suma], j) => {
    const c = rt.getCell(j + 1);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } };
    c.font = { bold: true };
    if (!suma) return;
    const total = filas.reduce((a, x) => a + (Number(valor(x)) || 0), 0);
    totales[j + 1] = total;
    formula(c, `SUM(${col(j + 1)}${primera}:${col(j + 1)}${ultima})`, total, fmt);
  });
  return { filaTotal, primera, ultima, totales };
}

// ---------------------------------------------------------------------------
// Hojas
// ---------------------------------------------------------------------------

function hojaPortada(ws: Worksheet, d: DatosAnalisis) {
  const r = d.rentabilidad;
  ws.getCell('A1').value = 'Análisis financiero';
  ws.getCell('A1').font = { bold: true, size: 18, color: { argb: COLOR.encabezado } };
  ws.getCell('A2').value = d.proyecto.nombre;
  ws.getCell('A2').font = { bold: true, size: 14 };
  const filas: [string, string][] = [
    ['Proyecto', d.proyecto.nombre],
    ['Entidad federativa', d.proyecto.estado],
    ['Capacidad', d.proyecto.capacidad],
    ['Estructura evaluada', ESTRUCTURAS[r.estructura]],
    ['RTB objetivo', d.proyecto.fechaRtb ?? 'Sin definir'],
    ['Generado', `${fecha(d.generado)} (hora del centro de México)`],
    ['Exportado por', d.exportadoPor ?? 'Usuario de AuraGrid'],
    ['Versión de AuraGrid', d.version],
    ['Tipo de datos', esIlustrativo(d) ? ETIQUETA_ILUSTRATIVO : 'Datos capturados del proyecto'],
    ['Moneda', 'USD (dólares de Estados Unidos); producción en MWh'],
    ['Limitación', NOTA_MONEDA],
  ];
  filas.forEach(([k, v], i) => {
    ws.getCell(4 + i, 1).value = k;
    ws.getCell(4 + i, 1).font = { bold: true };
    ws.getCell(4 + i, 2).value = v;
  });
  if (esIlustrativo(d)) {
    for (const c of [1, 2]) ws.getCell(12, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.aviso } };
    ws.getCell(12, 2).font = { bold: true, color: { argb: 'FF9A6700' } };
  }
  ws.getCell(14, 2).alignment = { wrapText: true };
  ws.getCell(14, 2).font = { color: { argb: 'FF9A6700' } };
  const nota = 16;
  ws.getCell(nota, 1).value = 'Cómo usar este archivo';
  ws.getCell(nota, 1).font = { bold: true };
  ws.getCell(nota + 1, 1).value = 'Reporte generado por AuraGrid con su motor de cálculo: las cifras no se recalculan en Excel y las hojas están protegidas (sin contraseña) para evitar cambios accidentales. Para cambiar supuestos, hazlo en la app y vuelve a exportar. Las celdas de control comprueban que las cifras cuadran: deben dar 0 (verde y "Correcto"); si no, se ven en rojo y dicen "Revisar". Su texto y su color se calculan con fórmula y formato condicional.';
  ws.mergeCells(nota + 1, 1, nota + 1, 2);
  ws.getCell(nota + 1, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(nota + 1).height = 60;
  ws.getCell(nota + 3, 1).value = 'Contenido';
  ws.getCell(nota + 3, 1).font = { bold: true };
  const hojas = hojasDelLibro(d);
  hojas.slice(1).forEach((h, i) => { ws.getCell(nota + 4 + i, 1).value = `${i + 1}. ${h}`; });
  const aviso = nota + 5 + hojas.length;
  ws.getCell(aviso, 1).value = 'Aviso legal';
  ws.getCell(aviso, 1).font = { bold: true };
  ws.getCell(aviso + 1, 1).value = AVISO_LEGAL;
  ws.mergeCells(aviso + 1, 1, aviso + 1, 2);
  ws.getCell(aviso + 1, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getRow(aviso + 1).height = 48;
  anchos(ws, [26, 90]);
}

function hojaResumen(ws: Worksheet, d: DatosAnalisis) {
  const r = d.rentabilidad;
  encabezadoHoja(ws, 'Resumen', d, 3);
  encabezados(ws, 5, ['Indicador', 'Valor', 'Nota']);
  const filas: [string, number | string | null, string | undefined, string][] = [
    ['TIR de proyecto', r.tirProyecto, PCT_TIR, 'Antes de deuda, con ISR sin deuda'],
    ['TIR de equity (flujo disponible)', r.tirEquity, PCT_TIR, 'Flujo al equity después del servicio de la deuda'],
    ['LCOE (USD/MWh)', r.lcoe, '#,##0.00', `Tasa de descuento ${d.supuestos.tasaDescuentoPct} %`],
    ['DSCR mínimo con P50', r.dscrMinP50, DSCR, r.anoDscrMinP50 ? `Año ${r.anoDscrMinP50} de operación` : ''],
    ['DSCR mínimo con P90', r.dscrMinP90, DSCR, r.anoDscrMinP90 ? `Año ${r.anoDscrMinP90} de operación` : ''],
    ['Covenant (DSCR mínimo del crédito)', d.supuestos.dscrCovenant, DSCR, ''],
    ['Usos totales (USD)', d.fuentesUsos.usos, USD, 'CAPEX + intereses de construcción + comisión + DSRA'],
    ['Deuda (USD)', d.fuentesUsos.deuda, USD, `Plazo ${r.plazoDeudaAnos} años, esculpida`],
    ['Equity (USD)', d.fuentesUsos.equity, USD, ''],
    ['Deuda / usos', r.deudaPct, PCT, ''],
    ['Límite que manda la deuda', CRITERIOS_DEUDA[r.criterioDeuda], undefined, 'El menor de los criterios'],
    ['Capacidad con DSCR P50 (USD)', r.capacidadDeuda.dscrP50, USD, `DSCR ${d.supuestos.dscrDimensionamientoP50}`],
    ['Capacidad con DSCR P90 (USD)', r.capacidadDeuda.dscrP90, USD, `DSCR ${d.supuestos.dscrDimensionamientoP90}`],
    ['Capacidad año a año (USD)', r.capacidadDeuda.anoAAno, USD, 'Menor servicio permitido de cada año'],
    ['Tope por apalancamiento (USD)', r.capacidadDeuda.tope, USD, `${d.supuestos.apalancamientoMaxPct} % de los usos`],
    ['Producción P50 año 1 (MWh)', r.p50Mwh, MWH, `${Math.round(r.rendimientoKwhKwp).toLocaleString('es-MX')} kWh/kWp`],
    ['Producción P90 año 1 (MWh)', r.p90Mwh, MWH, `${d.supuestos.p90Pct} % del P50`],
    ['Primer año con ISR (con deuda)', r.isrConDeuda.inicio ?? 'No paga en la vida útil', undefined, ''],
    ['Pérdida fiscal que caduca sin usarse (USD)', r.isrConDeuda.perdidaCaducada, USD, `Las pérdidas se amortizan en ${ANOS_AMORTIZACION_PERDIDAS} años`],
    // Con escenarios: métricas bancarias del caso base y puntos de quiebre (detalle en la hoja Escenarios)
    ...(d.escenarios?.length ? (() => {
      const base = d.escenarios.find((e) => e.clave === 'base');
      const q = d.quiebres;
      return [
        ['LLCR', base?.llcr ?? null, DSCR3, 'VP del CFADS en el plazo de la deuda ÷ deuda (caso P50)'],
        ['PLCR', base?.plcr ?? null, DSCR3, 'VP del CFADS en toda la vida útil ÷ deuda (caso P50)'],
        ['Caída de ingresos hasta el covenant', q?.hastaCovenant ?? null, PCT, `DSCR mínimo = ${d.supuestos.dscrCovenant}x; deuda fija, ISR recalculado`],
        ['Caída de ingresos hasta DSCR 1.0x', q?.hastaUno ?? null, PCT, 'Deuda fija, ISR recalculado (ver hoja Escenarios)'],
      ] as [string, number | null, string, string][];
    })() : []),
  ];
  filas.forEach(([k, v, fmt, n], i) => {
    const fila = 6 + i;
    ws.getCell(fila, 1).value = k;
    const c = ws.getCell(fila, 2);
    c.value = v ?? 'N/D';
    formato(c, typeof v === 'number' ? fmt : undefined);
    ws.getCell(fila, 3).value = n;
    if (i % 2 === 1) for (const cc of [1, 2, 3]) ws.getCell(fila, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  if (d.estados) resumenEstados(ws, 6 + filas.length + 1, d.estados, d.supuestos);
  anchos(ws, [42, 22, 52]);
  ws.views = [{ state: 'frozen', ySplit: 5 }];
}

function hojaSupuestos(ws: Worksheet, d: DatosAnalisis) {
  const s = d.supuestos;
  encabezadoHoja(ws, 'Supuestos', d, 5);
  ws.getCell('A4').value = NOTA_MONEDA;
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF555F6D' } };
  encabezados(ws, 5, ['Grupo', 'Supuesto', 'Valor', 'Unidad', 'Fuente']);
  // Con varios créditos, la tasa y la comisión de la deuda son las ponderadas (con uno solo, la fuente de siempre)
  const variosCreditos = (d.creditos?.porCredito?.length ?? 0) > 1;
  const ponderadaDeCreditos = (campo: keyof Supuestos) => (variosCreditos && (campo === 'tasaInteresPct' || campo === 'comisionEstructuracionPct')
    ? 'Ponderada por participación de los créditos (ver hoja Deuda).' : null);
  const fuente = (campo: keyof Supuestos) => (d.proyecto.esEjemplo
    ? fuenteDe([campo], s)
    : campo === 'rendimientoFijaKwhKwp' ? origenProduccion(s.rendimientoFijaKwhKwp, d.proyecto.estado) : ETIQUETA_DATO_USUARIO);
  const filas: [string, string, string | number, string, string][] = [
    ['Estructura', 'Estructura del CAPEX registrado', ESTRUCTURAS[s.estructuraBase], '', d.proyecto.esEjemplo ? '' : ETIQUETA_DATO_USUARIO],
    ['Estructura', 'Estructura evaluada', ESTRUCTURAS[d.rentabilidad.estructura], '', ''],
    ...GRUPOS.flatMap(([grupo, campos]) => campos.map(([campo, etiqueta, unidad]) =>
      [grupo, etiqueta, s[campo] == null ? 'Sin capturar' : s[campo] as number, unidad, ponderadaDeCreditos(campo) ?? fuente(campo)] as [string, string, string | number, string, string])),
    ['Impuestos y descuento', 'Esquema de depreciación', s.depreciacionPorCategorias ? 'Por categorías de activo (ver abajo)' : ESQUEMAS_DEPRECIACION[s.depreciacionEsquema], '', fuente('depreciacionEsquema')],
    // Depreciación por categorías: valores capturados; una tasa sin capturar se indica (no se supone)
    ...CAMPOS_DEPRECIACION_CATEGORIAS.map(([campo, etiqueta, unidad]): [string, string, string | number, string, string] => {
      const v = s[campo];
      const valor = campo === 'depreciacionPorCategorias' ? (v ? 'Sí' : 'No (se usa el esquema de depreciación)') : v == null ? 'Sin capturar' : Number(v);
      return ['Depreciación por categorías', etiqueta, valor, campo === 'depreciacionPorCategorias' ? '' : unidad, fuente(campo)];
    }),
    // IVA de construcción (solo activo): lo capturado; un dato vacío dice "Sin capturar" (no se supone)
    ...(s.ivaActivo ? CAMPOS_IVA.map(([campo, etiqueta, unidad]): [string, string, string | number, string, string] => {
      const v = s[campo];
      const deLinea = campo === 'ivaLineaMonto' || campo === 'ivaLineaTasaPct' || campo === 'ivaLineaComisionPct';
      const valor = campo === 'ivaActivo' ? 'Activo'
        : deLinea && s.ivaFinanciamiento === 'equity' ? 'No aplica (IVA financiado con equity)'
          : v == null || (v as unknown) === '' ? 'Sin capturar'
            : campo === 'ivaOrigenEquipo' ? ORIGENES_EQUIPO[v as keyof typeof ORIGENES_EQUIPO] ?? String(v)
              : campo === 'ivaFinanciamiento' ? FINANCIAMIENTOS_IVA[v as keyof typeof FINANCIAMIENTOS_IVA] ?? String(v) : Number(v);
      const fuenteIva = campo === 'ivaTasaPct' ? `${FUENTE_TASA_IVA}. ${NOTA_TASA_IVA}` : typeof valor === 'string' && valor.startsWith('No aplica') ? '' : fuente(campo);
      return ['IVA de construcción', etiqueta, valor, typeof valor === 'number' ? unidad : '', fuenteIva];
    }) : []),
  ];
  filas.forEach(([g, e, v, u, f], i) => {
    const fila = 6 + i;
    [g, e, v, u, f].forEach((x, j) => { ws.getCell(fila, j + 1).value = x; });
    if (typeof v === 'number') formato(ws.getCell(fila, 3), NUM);
    ws.getCell(fila, 5).alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1) for (let cc = 1; cc <= 5; cc++) ws.getCell(fila, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  const notasFila = 6 + filas.length + 1;
  ws.getCell(notasFila, 1).value = 'Notas fiscales';
  ws.getCell(notasFila, 1).font = { bold: true };
  [NOTA_DEDUCCION_INMEDIATA, `Equipo de generación: ${NOTA_EQUIPO_GENERACION}`, REFERENCIA_CONSTRUCCIONES, NOTA_INTERCONEXION, ...notasIva(s)].forEach((t, i) => {
    ws.getCell(notasFila + 1 + i, 1).value = t;
    ws.mergeCells(notasFila + 1 + i, 1, notasFila + 1 + i, 5);
    ws.getCell(notasFila + 1 + i, 1).alignment = { wrapText: true };
  });
  if (d.estados) alcanceDelModelo(ws, notasFila + 1 + 4 + notasIva(s).length + 1, d);
  // Con el IVA, la columna de valores más ancha para "Importación directa" y "No aplica…" (sin IVA, la de siempre)
  anchos(ws, [22, 44, s.ivaActivo ? 34 : 14, 18, 70]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 2 }];
}

/** Notas del IVA de construcción (solo activo): validar con asesor fiscal, tasa, y las limitaciones que aplican. */
function notasIva(s: Supuestos): string[] {
  if (!s.ivaActivo) return [];
  return [
    `IVA de construcción: ${NOTA_IVA}`,
    `Tasa de IVA (${FUENTE_TASA_IVA}): ${NOTA_TASA_IVA}`,
    ...(s.ivaOrigenEquipo === 'local' ? [] : [LIMITACION_IVA_IMPORTACION]),
    ...(s.ivaFinanciamiento === 'linea' ? [NOTA_TASA_LINEA_IVA, LIMITACION_IVA_INTERESES] : []),
  ];
}

/** Faltan datos del IVA: la lista de lo que falta (no se calcula con valores supuestos). */
function faltanDatosIva(ws: Worksheet, fila: number, d: DatosAnalisis) {
  ws.getCell(fila, 1).value = 'Faltan datos del IVA: no se calcula con valores supuestos y la TIR queda en N/D.';
  ws.getCell(fila, 1).font = { bold: true, color: { argb: 'FF9A6700' } };
  const problemas = d.rentabilidad.problemasIva?.length ? d.rentabilidad.problemasIva : ['Faltan los supuestos financieros del proyecto.'];
  problemas.forEach((p, i) => { ws.getCell(fila + 1 + i, 1).value = `• ${p}`; });
  return fila + 1 + problemas.length;
}

/**
 * Necesidad temporal de IVA (Fuentes y usos): se recupera del SAT, así que no suma a los usos permanentes ni cambia
 * el control Fuentes − Usos. Solo con el IVA activo.
 */
function necesidadTemporalIva(ws: Worksheet, fila: number, d: DatosAnalisis) {
  ws.getCell(fila, 1).value = 'Necesidad temporal de IVA';
  ws.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
  ws.getCell(fila + 1, 1).value = 'Se recupera del SAT: no es un uso permanente y no suma a los usos ni a las fuentes de arriba.';
  ws.getCell(fila + 1, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  const iva = d.rentabilidad.iva;
  if (!iva) { faltanDatosIva(ws, fila + 3, d); return; }
  const c = d.costoIva ?? null;
  const conLinea = iva.financiamiento === 'linea';
  encabezados(ws, fila + 3, ['Concepto', 'USD', 'Nota']);
  const filas: [string, number | string | null, string | undefined, string][] = [
    ['IVA pagado durante la construcción', iva.total, USD, iva.mesSaldoCero ? `Se recupera por completo en ${mesLegible(iva.mesSaldoCero)}` : 'No se recupera por completo en el horizonte'],
    ['Pico de necesidad', iva.pico, USD, `${mesLegible(iva.mesPico)} · saldo por recuperar al inicio del mes`],
    ['IVA pendiente de recuperar en la COD', iva.ivaPendienteCod, USD, `COD: ${mesLegible(iva.mesCod)}`],
    ['Financiamiento del IVA', FINANCIAMIENTOS_IVA[iva.financiamiento], undefined, ''],
    ...(conLinea ? [['Monto máximo de la línea (equivalente en USD)', iva.lineaMonto, USD, NOTA_TASA_LINEA_IVA] as [string, number | null, string, string]] : []),
    ['Compromiso máximo de equity por IVA', iva.compromisoMaximoEquity, USD, `${mesLegible(iva.mesCompromisoMaximo)} · adicional al equity de fuentes y usos`],
    ['Costo financiero del IVA (valor presente al NTP)', c?.valorPresenteNtp ?? null, USD,
      `${textoDescuentoCostoIva(c)}${conLinea ? '' : ' · costo de oportunidad, no es un gasto'}`],
    ...(conLinea ? [['Intereses + comisión de la línea (nominal)', c?.nominalLinea ?? iva.interesesLinea + iva.comisionLinea, USD, ''] as [string, number, string, string]] : []),
    ['Impacto en la TIR de equity', c?.impactoTirEquity != null ? c.impactoTirEquity * 100 : null, PP, 'Contra el mismo proyecto sin IVA'],
    ['Impacto en la TIR de proyecto', c?.impactoTirProyecto != null ? c.impactoTirProyecto * 100 : null, PP, 'Contra el mismo proyecto sin IVA'],
  ];
  filas.forEach(([k, v, fmt, n], i) => {
    const r = fila + 4 + i;
    ws.getCell(r, 1).value = k;
    ws.getCell(r, 2).value = v ?? 'N/D';
    formato(ws.getCell(r, 2), typeof v === 'number' ? fmt : undefined);
    ws.getCell(r, 3).value = n;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1) for (const cc of [1, 2, 3]) ws.getCell(r, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  ws.getCell(fila + 5 + filas.length, 1).value = `Detalle mensual en la hoja "IVA". ${NOTA_IVA}`;
  ws.getCell(fila + 5 + filas.length, 1).font = { bold: true, color: { argb: 'FF9A6700' } };
}

function hojaFuentesUsos(ws: Worksheet, d: DatosAnalisis) {
  const fu = d.fuentesUsos;
  const noDisposicion = fu.noDisposicion ?? 0;
  encabezadoHoja(ws, 'Fuentes y usos', d, 3);
  encabezados(ws, 5, ['Usos', 'USD', '% de los usos']);
  // La comisión por no disposición solo aparece si se cobra; sin ella, las filas quedan donde siempre (6 a 9)
  const usos: [string, number][] = [
    ['CAPEX', fu.capex], ['Intereses durante la construcción', fu.idc], ['Comisión de estructuración', fu.comision],
    ...(noDisposicion > 0 ? [['Comisión por no disposición', noDisposicion] as [string, number]] : []),
    ['Cuenta de reserva (DSRA)', fu.dsra],
  ];
  const totalUsos = 6 + usos.length;
  const totalUsosMonto = usos.reduce((s, [, v]) => s + v, 0);
  usos.forEach(([k, v], i) => {
    ws.getCell(6 + i, 1).value = k;
    ws.getCell(6 + i, 2).value = v; formato(ws.getCell(6 + i, 2), USD);
    formula(ws.getCell(6 + i, 3), `IF($B$${totalUsos}=0,0,B${6 + i}/$B$${totalUsos})`, fu.usos ? v / fu.usos : 0, PCT);
  });
  ws.getCell(totalUsos, 1).value = 'Total usos';
  ws.getCell(totalUsos, 1).font = { bold: true };
  formula(ws.getCell(totalUsos, 2), `SUM(B6:B${totalUsos - 1})`, totalUsosMonto, USD);
  ws.getCell(totalUsos, 2).font = { bold: true };

  const encFuentes = totalUsos + 2;
  encabezados(ws, encFuentes, ['Fuentes', 'USD', '% de los usos']);
  const fuentes: [string, number][] = [['Equity', fu.equity], ['Deuda', fu.deuda]];
  fuentes.forEach(([k, v], i) => {
    ws.getCell(encFuentes + 1 + i, 1).value = k;
    ws.getCell(encFuentes + 1 + i, 2).value = v; formato(ws.getCell(encFuentes + 1 + i, 2), USD);
    formula(ws.getCell(encFuentes + 1 + i, 3), `IF($B$${totalUsos}=0,0,B${encFuentes + 1 + i}/$B$${totalUsos})`, fu.usos ? v / fu.usos : 0, PCT);
  });
  const totalFuentes = encFuentes + 3;
  ws.getCell(totalFuentes, 1).value = 'Total fuentes';
  ws.getCell(totalFuentes, 1).font = { bold: true };
  formula(ws.getCell(totalFuentes, 2), `SUM(B${encFuentes + 1}:B${encFuentes + 2})`, fu.equity + fu.deuda, USD);
  ws.getCell(totalFuentes, 2).font = { bold: true };
  control(ws, totalFuentes + 2, 'Fuentes − Usos', `ROUND(B${totalFuentes}-B${totalUsos},2)`, fu.equity + fu.deuda - totalUsosMonto);
  ws.getCell(totalFuentes + 4, 1).value = 'Cifras redondeadas a dólares, como en el tablero. Las hojas por año usan el cálculo sin redondear.';
  ws.getCell(totalFuentes + 4, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  if (d.supuestos.ivaActivo) necesidadTemporalIva(ws, totalFuentes + 6, d);
  anchos(ws, [40, 20, 60]);
}

function hojaDeuda(ws: Worksheet, d: DatosAnalisis) {
  const r = d.rentabilidad;
  encabezadoHoja(ws, 'Deuda (servicio esculpido)', d, 10);
  const enPlazo = r.anos.filter((a) => a.ano <= Math.max(r.plazoDeudaAnos, 1));
  const t = tablaAnual(ws, 5, enPlazo, [
    ['Año de operación', (a) => a.ano, undefined, false],
    ['Saldo inicial', (a) => a.saldoInicialDeuda, USD, false],
    ['Servicio de la deuda', (a) => a.servicioDeuda, USD, true],
    ['Intereses', (a) => a.intereses, USD, true],
    ['Amortización', (a) => a.amortizacion, USD, true],
    ['Saldo final', (a) => a.saldoDeuda, USD, false],
    ['CFADS P50', (a) => a.cfads, USD, true],
    ['DSCR P50', (a) => a.dscr, DSCR, false],
    ['CFADS P90', (a) => a.cfadsP90, USD, true],
    ['DSCR P90', (a) => a.dscrP90, DSCR, false],
  ]);
  const amortizado = t.totales[5] ?? 0;
  const filaDeuda = t.filaTotal + 2;
  ws.getCell(filaDeuda, 1).value = 'Deuda inicial (sin redondear)';
  ws.getCell(filaDeuda, 2).value = r.deuda; formato(ws.getCell(filaDeuda, 2), USD);
  control(ws, filaDeuda + 1, 'Σ amortización − deuda + saldo final', `ROUND(E${t.filaTotal}-B${filaDeuda}+F${t.ultima},2)`,
    amortizado - r.deuda + (enPlazo.at(-1)?.saldoDeuda ?? 0));
  control(ws, filaDeuda + 2, 'Σ servicio − (Σ intereses + Σ amortización)', `ROUND(C${t.filaTotal}-D${t.filaTotal}-E${t.filaTotal},2)`,
    (t.totales[3] ?? 0) - (t.totales[4] ?? 0) - amortizado);
  ws.getCell(filaDeuda + 4, 1).value = `Covenant: DSCR mínimo ${d.supuestos.dscrCovenant}x. La deuda se dimensiona con DSCR ${d.supuestos.dscrDimensionamientoP50}x sobre P50 y ${d.supuestos.dscrDimensionamientoP90}x sobre P90; los ingresos sin contrato, con ${d.supuestos.dscrMercado}x.`;
  const variosCreditos = (d.creditos?.porCredito?.length ?? 0) > 1;
  if (variosCreditos) seccionesPorBanco(ws, filaDeuda + 6, d, t, filaDeuda);
  // Con varios créditos, la columna A más ancha para las etiquetas de sus controles (con uno, el ancho de siempre)
  anchos(ws, [variosCreditos ? 56 : 44, 16, 16, 16, 16, 16, 16, 11, 16, 11]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

/**
 * Hoja Deuda con varios créditos: la tabla de créditos (Σ participaciones = 100 %), una sección por banco (monto,
 * comisiones, intereses de construcción y su tabla anual de saldo, intereses y amortización) y los totales: Σ por banco
 * contra el total del modelo, con un control con fórmula por concepto. t = tabla anual de la deuda total (B saldo
 * inicial, D intereses, E amortización, F saldo final).
 */
function seccionesPorBanco(ws: Worksheet, fila: number, d: DatosAnalisis, t: ReturnType<typeof tablaAnual>, filaDeuda: number) {
  const r = d.rentabilidad;
  const { lista, porCredito, condiciones } = d.creditos!;
  const bancos = porCredito!;
  const PCT2 = '0.00" %"';
  const titulo = (f: number, texto: string) => { ws.getCell(f, 1).value = texto; ws.getCell(f, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } }; };

  // Créditos
  titulo(fila, 'Créditos de la deuda (financiamiento con varios bancos)');
  encabezados(ws, fila + 1, ['Banco', 'Participación (%)', 'Tasa anual total (%)', 'Comisión de estructuración (%)', 'Comisión por no disposición (% anual)', 'Estado']);
  const primera = fila + 2;
  lista.forEach((c, i) => {
    const f = primera + i;
    ws.getCell(f, 1).value = bancos[i].nombre;
    [c.participacionPct, c.tasaAnualPct, c.comisionEstructuracionPct].forEach((v, j) => { ws.getCell(f, 2 + j).value = v; formato(ws.getCell(f, 2 + j), PCT2); });
    ws.getCell(f, 5).value = c.comisionNoDisposicionPct ?? 'No se cobra'; formato(ws.getCell(f, 5), c.comisionNoDisposicionPct == null ? undefined : PCT2);
    ws.getCell(f, 6).value = c.estado ? ESTADOS_CREDITO[c.estado] : 'Sin capturar';
  });
  const ultima = primera + lista.length - 1;
  const fTotal = ultima + 1;
  ws.getCell(fTotal, 1).value = 'Total / ponderado por participación';
  ws.getCell(fTotal, 1).font = { bold: true };
  formula(ws.getCell(fTotal, 2), `SUM(B${primera}:B${ultima})`, lista.reduce((s, c) => s + Number(c.participacionPct), 0), PCT2);
  const ponderadas = [condiciones!.tasaPct, condiciones!.comisionEstructuracionPct, condiciones!.comisionNoDisposicionPct];
  ['C', 'D', 'E'].forEach((L, j) => formula(ws.getCell(fTotal, 3 + j), `SUMPRODUCT($B$${primera}:$B$${ultima},${L}${primera}:${L}${ultima})/100`, ponderadas[j], PCT2));
  for (let c = 1; c <= 6; c++) ws.getCell(fTotal, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } };
  ws.getCell(fTotal + 1, 1).value = 'Participación requerida (%)';
  ws.getCell(fTotal + 1, 2).value = 100; formato(ws.getCell(fTotal + 1, 2), PCT2);
  control(ws, fTotal + 2, 'Σ participaciones − 100 %', `ROUND(B${fTotal}-B${fTotal + 1},2)`, lista.reduce((s, c) => s + Number(c.participacionPct), 0) - 100);
  ws.getCell(fTotal + 3, 1).value = 'Mismo plazo y perfil esculpido para todos: cada crédito recibe su participación de cada desembolso y amortiza su participación del principal; los intereses van en proporción a participación × tasa y las comisiones a participación × comisión.';
  ws.getCell(fTotal + 3, 1).font = { italic: true, color: { argb: 'FF555F6D' } };

  // Una sección por banco
  let f = fTotal + 5;
  const refs: { monto: string; comision: string; noDisposicion: string; idc: string; saldoInicial: string; intereses: string; amortizacion: string; saldoFinal: string }[] = [];
  for (const b of bancos) {
    titulo(f, `${b.nombre} · ${formatoNumero(b.peso * 100)} % de la deuda`);
    const lineas: [string, number][] = [
      ['Monto comprometido', b.monto], ['Comisión de estructuración', b.comisionEstructuracion],
      ['Comisión por no disposición', b.comisionNoDisposicion], ['Intereses durante la construcción', b.idc],
    ];
    lineas.forEach(([k, v], i) => { ws.getCell(f + 1 + i, 1).value = k; ws.getCell(f + 1 + i, 2).value = v; formato(ws.getCell(f + 1 + i, 2), USD); });
    const tb = tablaAnual(ws, f + 6, b.anos, [
      ['Año de operación', (a) => a.ano, undefined, false],
      ['Saldo inicial', (a) => a.saldoInicial, USD, false],
      ['Intereses', (a) => a.intereses, USD, true],
      ['Amortización', (a) => a.amortizacion, USD, true],
      ['Servicio', (a) => a.servicio, USD, true],
      ['Saldo final', (a) => a.saldoFinal, USD, false],
    ]);
    refs.push({
      monto: `B${f + 1}`, comision: `B${f + 2}`, noDisposicion: `B${f + 3}`, idc: `B${f + 4}`,
      saldoInicial: `B${tb.primera}`, intereses: `C${tb.filaTotal}`, amortizacion: `D${tb.filaTotal}`, saldoFinal: `F${tb.ultima}`,
    });
    f = tb.filaTotal + 2;
  }

  // Totales: Σ por banco contra el total del modelo
  titulo(f, 'Totales: Σ por banco contra el total del modelo');
  encabezados(ws, f + 1, ['Concepto', 'Σ por banco', 'Total del modelo']);
  const enPlazo = r.anos.filter((a) => a.ano <= Math.max(r.plazoDeudaAnos, 1));
  const suma = (x: (b: ResultadoCredito) => number) => bancos.reduce((s, b) => s + x(b), 0);
  const conceptos: [string, keyof (typeof refs)[number], number, string, number][] = [
    ['Monto comprometido (deuda inicial)', 'monto', suma((b) => b.monto), `B${filaDeuda}`, r.deuda],
    ['Saldo inicial del año 1', 'saldoInicial', suma((b) => b.anos[0]?.saldoInicial ?? 0), `B${t.primera}`, enPlazo[0]?.saldoInicialDeuda ?? 0],
    ['Intereses (Σ del plazo)', 'intereses', suma((b) => b.anos.reduce((s, a) => s + a.intereses, 0)), `D${t.filaTotal}`, t.totales[4] ?? 0],
    ['Amortización (Σ del plazo)', 'amortizacion', suma((b) => b.anos.reduce((s, a) => s + a.amortizacion, 0)), `E${t.filaTotal}`, t.totales[5] ?? 0],
    ['Saldo final del último año', 'saldoFinal', suma((b) => b.anos.at(-1)?.saldoFinal ?? 0), `F${t.ultima}`, enPlazo.at(-1)?.saldoDeuda ?? 0],
    ['Intereses durante la construcción', 'idc', suma((b) => b.idc), '', r.usos.idc],
    ['Comisión de estructuración', 'comision', suma((b) => b.comisionEstructuracion), '', r.usos.comision],
    ['Comisión por no disposición', 'noDisposicion', suma((b) => b.comisionNoDisposicion), '', r.usos.noDisposicion],
  ];
  conceptos.forEach(([k, clave, sumaBancos, refTotal, total], i) => {
    const x = f + 2 + i;
    ws.getCell(x, 1).value = k;
    formula(ws.getCell(x, 2), refs.map((rf) => rf[clave]).join('+'), sumaBancos, USD);
    if (refTotal) formula(ws.getCell(x, 3), refTotal, total, USD);
    else { ws.getCell(x, 3).value = total; formato(ws.getCell(x, 3), USD); }
  });
  const fc = f + 2 + conceptos.length + 1;
  conceptos.forEach(([k, , sumaBancos, , total], i) => {
    const x = f + 2 + i;
    control(ws, fc + i, `Σ por banco − total: ${k[0].toLowerCase()}${k.slice(1)}`, `ROUND(B${x}-C${x},2)`, sumaBancos - total);
  });
}

const formatoNumero = (x: number) => Number(x.toFixed(4)).toString();

/** Filas del flujo anual: años de construcción (negativos) y de operación. */
export interface FilaFlujo {
  periodo: string; p50: number | null; p90: number | null; ingPpa: number | null; ingMercado: number | null; ingresos: number | null;
  opex: number | null; seguros: number | null; arrendamiento: number | null; om: number | null; costos: number | null; ebitda: number | null;
  isr: number | null; cfads: number | null; servicio: number | null; flujoProyecto: number; flujoEquity: number;
}

export function filasFlujo(r: Rentabilidad): FilaFlujo[] {
  const vacio = { p50: null, p90: null, ingPpa: null, ingMercado: null, ingresos: null, opex: null, seguros: null, arrendamiento: null, om: null, costos: null, ebitda: null, isr: null, cfads: null, servicio: null };
  return [
    ...r.construccion.proyecto.map((fp, i) => ({ periodo: `Construcción ${i + 1}`, ...vacio, flujoProyecto: fp, flujoEquity: r.construccion.equity[i] })),
    ...r.anos.map((a) => ({
      periodo: `Operación ${a.ano}`, p50: a.energiaMwh, p90: a.energiaP90Mwh, ingPpa: a.ingresosPpa, ingMercado: a.ingresosMercado, ingresos: a.ingresos,
      opex: a.opex, seguros: a.seguros, arrendamiento: a.arrendamiento, om: a.omEstructura, costos: a.costos, ebitda: a.ebitda,
      isr: a.isrConDeuda, cfads: a.cfads, servicio: a.servicioDeuda, flujoProyecto: a.flujoProyecto, flujoEquity: a.flujoEquity,
    })),
  ];
}

function hojaFlujo(ws: Worksheet, d: DatosAnalisis) {
  encabezadoHoja(ws, 'Flujo anual (escenario P50; producción P90 como referencia)', d, 18);
  const t = tablaAnual(ws, 5, filasFlujo(d.rentabilidad), [
    ['Período', (f) => f.periodo, undefined, false],
    ['Producción P50 (MWh)', (f) => f.p50, MWH, true],
    ['Producción P90 (MWh)', (f) => f.p90, MWH, true],
    ['Ingresos PPA (USD)', (f) => f.ingPpa, USD, true],
    ['Ingresos mercado y CELs (USD)', (f) => f.ingMercado, USD, true],
    ['Ingresos totales (USD)', (f) => f.ingresos, USD, true],
    ['OPEX (USD)', (f) => f.opex, USD, true],
    ['Seguros (USD)', (f) => f.seguros, USD, true],
    ['Arrendamiento (USD)', (f) => f.arrendamiento, USD, true],
    ['O&M de la estructura (USD)', (f) => f.om, USD, true],
    ['Costos totales (USD)', (f) => f.costos, USD, true],
    ['EBITDA (USD)', (f) => f.ebitda, USD, true],
    ['ISR con deuda (USD)', (f) => f.isr, USD, true],
    ['CFADS (USD)', (f) => f.cfads, USD, true],
    ['Servicio de la deuda (USD)', (f) => f.servicio, USD, true],
    ['Flujo del proyecto (USD)', (f) => f.flujoProyecto, USD, true],
    ['Flujo al equity (USD)', (f) => f.flujoEquity, USD, true],
  ]);
  const tt = (j: number) => t.totales[j] ?? 0;
  const f0 = t.filaTotal + 2;
  control(ws, f0, 'Ingresos totales − (PPA + mercado)', `ROUND(F${t.filaTotal}-D${t.filaTotal}-E${t.filaTotal},2)`, tt(6) - tt(4) - tt(5));
  control(ws, f0 + 1, 'Costos totales − suma de sus partes', `ROUND(K${t.filaTotal}-G${t.filaTotal}-H${t.filaTotal}-I${t.filaTotal}-J${t.filaTotal},2)`, tt(11) - tt(7) - tt(8) - tt(9) - tt(10));
  control(ws, f0 + 2, 'CFADS − (EBITDA − ISR)', `ROUND(N${t.filaTotal}-L${t.filaTotal}+M${t.filaTotal},2)`, tt(14) - tt(12) + tt(13));
  ws.getCell(f0 + 4, 1).value = 'El flujo al equity incluye la liberación de la DSRA al final del plazo de la deuda. La TIR de proyecto usa el ISR sin deuda; la de equity, el ISR con deuda.';
  anchos(ws, [16, 14, 14, 15, 15, 15, 13, 12, 13, 13, 14, 15, 13, 15, 15, 16, 16]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

function hojaImpuestos(ws: Worksheet, d: DatosAnalisis) {
  const r = d.rentabilidad;
  encabezadoHoja(ws, 'Impuestos (ISR con deuda)', d, 10);
  const t = tablaAnual(ws, 5, r.anos, [
    ['Año de operación', (a) => a.ano, undefined, false],
    ['EBITDA', (a) => a.ebitda, USD, true],
    ['Depreciación', (a) => a.depreciacion, USD, true],
    ['Intereses', (a) => a.intereses, USD, true],
    ['Base gravable antes de pérdidas', (a) => a.baseGravable, USD, true],
    ['Pérdida generada', (a) => a.perdidaGenerada, USD, true],
    ['Pérdida usada', (a) => a.perdidaUsada, USD, true],
    ['Pérdida que caduca', (a) => a.perdidaCaducada, USD, true],
    ['Pérdidas pendientes al cierre', (a) => a.perdidasPendientes, USD, false],
    ['ISR', (a) => a.isrConDeuda, USD, true],
  ]);
  const f0 = t.filaTotal + 2;
  const tt = (j: number) => t.totales[j] ?? 0;
  ws.getCell(f0, 1).value = 'CAPEX depreciable';
  ws.getCell(f0, 2).value = r.capex; formato(ws.getCell(f0, 2), USD);
  control(ws, f0 + 1, 'Σ depreciación − CAPEX depreciable', `ROUND(C${t.filaTotal}-B${f0},2)`, tt(3) - r.capex,
    'La vida útil no alcanza para depreciar todo el CAPEX con el esquema elegido.');
  control(ws, f0 + 2, 'Base gravable − (EBITDA − depreciación − intereses)', `ROUND(E${t.filaTotal}-B${t.filaTotal}+C${t.filaTotal}+D${t.filaTotal},2)`, tt(5) - tt(2) + tt(3) + tt(4));
  control(ws, f0 + 3, 'Pérdidas: generadas − usadas − caducadas − pendientes', `ROUND(F${t.filaTotal}-G${t.filaTotal}-H${t.filaTotal}-I${t.ultima},2)`,
    tt(6) - tt(7) - tt(8) - (r.anos.at(-1)?.perdidasPendientes ?? 0));
  ws.getCell(f0 + 5, 1).value = `ISR ${d.supuestos.isrPct} %. Depreciación: ${d.supuestos.depreciacionPorCategorias ? 'por categorías de activo (tabla de abajo)' : ESQUEMAS_DEPRECIACION[d.supuestos.depreciacionEsquema]}. Las pérdidas fiscales se amortizan en los ${ANOS_AMORTIZACION_PERDIDAS} años siguientes (la más antigua primero); la que no se usa en ese plazo caduca. Validar con asesor fiscal.`;
  const notas = [NOTA_DEDUCCION_INMEDIATA, NOTA_MONEDA, ...(d.supuestos.depreciacionPorCategorias ? [`Equipo de generación: ${NOTA_EQUIPO_GENERACION}`, NOTA_INTERCONEXION] : [])];
  notas.forEach((t, i) => {
    ws.getCell(f0 + 6 + i, 1).value = t;
    ws.getCell(f0 + 6 + i, 1).font = { color: { argb: i === 0 ? 'FF9A6700' : 'FF555F6D' }, bold: i === 0 };
  });
  if (d.supuestos.depreciacionPorCategorias) {
    const categorias = depreciacionPorCategoria(d.supuestos, r.capex);
    const inicio = f0 + 8 + notas.length;
    ws.getCell(inicio, 1).value = 'Depreciación por categoría de activo (USD)';
    ws.getCell(inicio, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
    const tc = tablaAnual(ws, inicio + 1, r.anos, [
      ['Año de operación', (a) => a.ano, undefined, false],
      ...categorias.map((c): [string, (a: (typeof r.anos)[number]) => number, string, boolean] =>
        [`${c.nombre} (${Math.round(c.base).toLocaleString('es-MX')} USD a ${c.tasaPct} % anual)`, (a) => c.montos[a.ano - 1], USD, true]),
      ['Total (USD)', (a) => a.depreciacion, USD, true],
    ]);
    const ultimaCategoria = col(categorias.length + 1);
    const total = col(categorias.length + 2);
    control(ws, tc.filaTotal + 2, 'Σ categorías − depreciación total', `ROUND(SUM(B${tc.filaTotal}:${ultimaCategoria}${tc.filaTotal})-${total}${tc.filaTotal},2)`,
      categorias.reduce((a, c) => a + c.montos.reduce((x, y) => x + y, 0), 0) - (tc.totales[categorias.length + 2] ?? 0));
  }
  anchos(ws, [40, 16, 16, 15, 18, 15, 15, 15, 17, 15]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

/** Cronograma mensual: pagos y fondos del mes, acumulados y hueco de caja (como el tablero). */
export interface FilaMes {
  mes: string; pagosObra: number; costosFinancieros: number; pagos: number;
  equityConfirmado: number; equityPendiente: number; deudaConfirmada: number; deudaPendiente: number;
  fondosConfirmados: number; pagosAcumulados: number; fondosConfirmadosAcumulados: number; hueco: number;
  /** Solo con el IVA activo: movimientos del IVA del mes y su neto acumulado (salidas − entradas); el hueco lo incluye. */
  iva?: { pagado: number; devolucion: number; lineaDisposicion: number; lineaRepago: number; lineaCostos: number; netoAcumulado: number };
}

/**
 * Meses del cronograma con los pagos y fondos del mes, los acumulados y el hueco de caja al cierre del mes. Con los
 * movimientos del IVA (movimientosIva), el hueco los incluye, como en el tablero.
 */
export function filasCronograma(pagos: Movimiento[], fondos: Movimiento[], iva: { salidas: MovimientoIva[]; entradas: MovimientoIva[] } | null = null): FilaMes[] {
  const todos = [...pagos, ...fondos, ...(iva ? [...iva.salidas, ...iva.entradas] : [])];
  if (todos.length === 0) return [];
  const meses: string[] = [];
  const primero = todos.map((m) => m.fecha.slice(0, 7)).sort()[0];
  const ultimo = todos.map((m) => m.fecha.slice(0, 7)).sort().at(-1)!;
  for (let [a, m] = primero.split('-').map(Number); `${a}-${String(m).padStart(2, '0')}` <= ultimo; m === 12 ? (a++, m = 1) : m++) {
    meses.push(`${a}-${String(m).padStart(2, '0')}`);
  }
  let pagosAcumulados = 0, confirmadosAcumulados = 0, ivaNetoAcumulado = 0;
  return meses.map((mes) => {
    const delMes = <T extends { fecha: string }>(l: T[]) => l.filter((x) => x.fecha.slice(0, 7) === mes);
    const suma = (l: { monto: number }[]) => l.reduce((s, x) => s + x.monto, 0);
    const p = delMes(pagos), f = delMes(fondos);
    const pagosMes = suma(p);
    const confirmados = suma(f.filter((x) => x.confirmado));
    pagosAcumulados += pagosMes;
    confirmadosAcumulados += confirmados;
    const fila: FilaMes = {
      mes, pagosObra: suma(p.filter(esPagoDeObra)), costosFinancieros: suma(p.filter((x) => !esPagoDeObra(x))), pagos: pagosMes,
      equityConfirmado: suma(f.filter((x) => x.fuente === 'equity' && x.confirmado)),
      equityPendiente: suma(f.filter((x) => x.fuente === 'equity' && !x.confirmado)),
      deudaConfirmada: suma(f.filter((x) => x.fuente !== 'equity' && x.confirmado)),
      deudaPendiente: suma(f.filter((x) => x.fuente !== 'equity' && !x.confirmado)),
      fondosConfirmados: confirmados, pagosAcumulados, fondosConfirmadosAcumulados: confirmadosAcumulados,
      hueco: Math.max(0, pagosAcumulados - confirmadosAcumulados),
    };
    if (!iva) return fila;
    const sal = delMes(iva.salidas), ent = delMes(iva.entradas);
    const de = (l: MovimientoIva[], concepto: string) => suma(l.filter((x) => x.concepto === concepto));
    ivaNetoAcumulado += suma(sal) - suma(ent);
    fila.iva = {
      pagado: de(sal, 'IVA pagado'), devolucion: de(ent, 'Devolución de IVA'),
      lineaDisposicion: de(ent, 'Disposición de la línea de IVA'), lineaRepago: de(sal, 'Repago de la línea de IVA'),
      lineaCostos: de(sal, 'Comisión de la línea de IVA') + de(sal, 'Intereses de la línea de IVA'),
      netoAcumulado: ivaNetoAcumulado,
    };
    fila.hueco = Math.max(0, pagosAcumulados + ivaNetoAcumulado - confirmadosAcumulados);
    return fila;
  });
}

function hojaCronograma(ws: Worksheet, d: DatosAnalisis) {
  encabezadoHoja(ws, 'Cronograma de caja mensual', d, 10);
  const movIva = d.supuestos.ivaActivo && d.rentabilidad.iva ? movimientosIva(d.rentabilidad.iva) : null;
  const conLinea = d.rentabilidad.iva?.financiamiento === 'linea';
  const filas = filasCronograma(d.cronograma.pagos, d.cronograma.fondos, movIva);
  if (filas.length === 0) {
    ws.getCell('A5').value = 'El proyecto no tiene pagos ni fuentes capturados en el cronograma de caja.';
    anchos(ws, [80]);
    return;
  }
  if (d.cronograma.origen === 'ejemplo') {
    ws.getCell('A4').value = 'Cronograma de ejemplo (ilustrativo), el mismo que muestra el tablero.';
    ws.getCell('A4').font = { italic: true, color: { argb: 'FF9A6700' } };
  }
  type Columna = [string, (f: FilaMes) => string | number | null, string | undefined, boolean];
  // Con el IVA activo: sus movimientos del mes después de los fondos (columna J en adelante), su neto acumulado y el
  // hueco que lo incluye. Las columnas B-I y sus controles no se mueven; las de acumulados y el hueco se recorren a la
  // derecha (sin IVA, quedan en J-L como siempre).
  const columnasIva: Columna[] = movIva ? [
    ['IVA pagado (inicio del mes)', (f) => f.iva!.pagado, USD, true],
    ['Devolución de IVA (cierre del mes)', (f) => f.iva!.devolucion, USD, true],
    ...(conLinea ? [
      ['Línea IVA: disposición', (f) => f.iva!.lineaDisposicion, USD, true],
      ['Línea IVA: repago', (f) => f.iva!.lineaRepago, USD, true],
      ['Línea IVA: intereses y comisión', (f) => f.iva!.lineaCostos, USD, true],
    ] as Columna[] : []),
  ] : [];
  const t = tablaAnual(ws, 5, filas, [
    ['Mes', (f) => f.mes, undefined, false],
    ['Pagos de obra y equipos', (f) => f.pagosObra, USD, true],
    ['Costos financieros', (f) => f.costosFinancieros, USD, true],
    ['Pagos totales', (f) => f.pagos, USD, true],
    ['Equity confirmado', (f) => f.equityConfirmado, USD, true],
    ['Equity pendiente de confirmar', (f) => f.equityPendiente, USD, true],
    ['Deuda confirmada', (f) => f.deudaConfirmada, USD, true],
    ['Deuda pendiente de confirmar', (f) => f.deudaPendiente, USD, true],
    ['Fondos confirmados del mes', (f) => f.fondosConfirmados, USD, true],
    ...columnasIva,
    ['Pagos acumulados', (f) => f.pagosAcumulados, USD, false],
    ['Fondos confirmados acumulados', (f) => f.fondosConfirmadosAcumulados, USD, false],
    ...(movIva ? [['IVA neto acumulado (salidas − entradas)', (f) => f.iva!.netoAcumulado, USD, false] as Columna] : []),
    [movIva ? 'Hueco de caja al cierre del mes (contra fondos confirmados, incluido el IVA)' : 'Hueco de caja (contra fondos confirmados)', (f) => f.hueco, USD, false],
  ]);
  const f0 = t.filaTotal + 2;
  const r = d.rentabilidad;
  ws.getCell(f0, 1).value = 'Usos totales (Fuentes y usos)';
  ws.getCell(f0, 2).value = d.fuentesUsos.usos; formato(ws.getCell(f0, 2), USD);
  control(ws, f0 + 1, 'Σ pagos − usos', `ROUND(D${t.filaTotal}-B${f0},2)`, (t.totales[4] ?? 0) - d.fuentesUsos.usos,
    'El cronograma capturado no cubre todos los usos (CAPEX, intereses, comisión y DSRA) o los excede: revisa los pagos.');
  const tt = (j: number) => t.totales[j] ?? 0;
  control(ws, f0 + 2, 'Σ fondos (confirmados y pendientes) − usos', `ROUND(E${t.filaTotal}+F${t.filaTotal}+G${t.filaTotal}+H${t.filaTotal}-B${f0},2)`,
    tt(5) + tt(6) + tt(7) + tt(8) - d.fuentesUsos.usos, 'Las fuentes capturadas no suman los usos: revisa los montos de equity y deuda.');
  ws.getCell(f0 + 3, 1).value = 'Incluye fondos sin confirmar: mientras haya pendientes, las fuentes de los usos no están aseguradas.';
  ws.getCell(f0 + 3, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  const pendientes = d.cronograma.fondos.filter((x) => !x.confirmado);
  informativo(ws, f0 + 4, 'Fondos pendientes de confirmar', `ROUND(F${t.filaTotal}+H${t.filaTotal},2)`, tt(6) + tt(8),
    'Todos los fondos están confirmados.', 'Hay fondos sin confirmar (detalle a la derecha).',
    pendientes.map((x) => `${x.concepto}: USD ${Math.round(x.monto).toLocaleString('en-US')}, ${x.fecha} (${x.estado})`).join('; '));
  // Junto a los tramos de deuda: son fechas de disponibilidad; la disposición real es según necesidad
  if (d.cronograma.fondos.some((x) => x.fuente === 'deuda')) {
    ws.getCell(f0 + 5, 1).value = NOTA_TRAMOS;
    ws.getCell(f0 + 5, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  }
  if (movIva && d.rentabilidad.iva) ivaEnCronograma(ws, f0 + 6, d, t, conLinea, movIva);
  // Columna A ancha para que las etiquetas de los controles no se corten (la más larga mide ≈ 46 en Calibri 11 negrita)
  anchos(ws, [48, 18, 16, 16, 16, 18, 16, 18, 18, 18, 20, 18, ...(movIva ? [18, 18, 18, 18, 20] : [])]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

/**
 * IVA en el cronograma de caja: controles de sus columnas (J = IVA pagado, K = devolución y, con línea, L-N) y el
 * hueco máximo por fecha, que es el que muestra la app (los pagos caen al inicio del mes y las devoluciones al cierre,
 * así que dentro del mes puede ser mayor que el de cierre).
 */
function ivaEnCronograma(ws: Worksheet, fila: number, d: DatosAnalisis, t: ReturnType<typeof tablaAnual>, conLinea: boolean,
  movIva: { salidas: MovimientoIva[]; entradas: MovimientoIva[] }) {
  const iva = d.rentabilidad.iva!;
  const tt = (j: number) => t.totales[j] ?? 0;
  ws.getCell(fila, 1).value = 'IVA de construcción';
  ws.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
  ws.getCell(fila + 1, 1).value = 'IVA total (hoja IVA)';
  ws.getCell(fila + 1, 2).value = iva.total; formato(ws.getCell(fila + 1, 2), USD);
  control(ws, fila + 2, 'Σ IVA pagado − IVA total', `ROUND(J${t.filaTotal}-B${fila + 1},2)`, tt(10) - iva.total);
  control(ws, fila + 3, 'Σ IVA pagado − Σ devolución − saldo final', `ROUND(J${t.filaTotal}-K${t.filaTotal}-B${fila + 4},2)`,
    tt(10) - tt(11) - (iva.meses.at(-1)?.saldoFin ?? 0), 'Queda IVA por recuperar al final del horizonte.');
  ws.getCell(fila + 4, 1).value = 'IVA por recuperar al final del horizonte';
  ws.getCell(fila + 4, 2).value = iva.meses.at(-1)?.saldoFin ?? 0; formato(ws.getCell(fila + 4, 2), USD);
  let r = fila + 5;
  if (conLinea) {
    ws.getCell(r, 1).value = 'Saldo de la línea IVA al final del horizonte';
    ws.getCell(r, 2).value = iva.meses.at(-1)?.linea?.saldoFin ?? 0; formato(ws.getCell(r, 2), USD);
    control(ws, r + 1, 'Línea IVA: Σ disposición − Σ repago − saldo final', `ROUND(L${t.filaTotal}-M${t.filaTotal}-B${r},2)`,
      tt(12) - tt(13) - (iva.meses.at(-1)?.linea?.saldoFin ?? 0));
    r += 2;
  }
  const puntos = calcularFlujoAcumulado({ pagos: d.cronograma.pagos, fondos: d.cronograma.fondos, iva: movIva });
  const maximo = puntos.reduce((m, p) => (p.hueco > m.hueco ? p : m), { fecha: '', hueco: 0 } as { fecha: string; hueco: number });
  ws.getCell(r, 1).value = 'Hueco de caja máximo por fecha (como en la app)';
  ws.getCell(r, 2).value = Math.round(maximo.hueco); formato(ws.getCell(r, 2), USD);
  ws.getCell(r, 3).value = maximo.hueco > 0 ? `El ${maximo.fecha}, incluido el IVA` : 'Sin hueco';
  ws.getCell(r + 1, 1).value = 'El IVA se paga al inicio del mes y se recupera al cierre: el hueco dentro del mes puede ser mayor que el de cierre (columna del hueco). El IVA que pone el equity no aparece aquí: solo cuentan las aportaciones de equity capturadas.';
  ws.getCell(r + 1, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
}

/**
 * IVA de construcción por mes (solo con el IVA activo): pagos al inicio del mes y devoluciones al cierre, como el motor.
 * Controles: pagado − recuperado − saldo final = 0 y la suma de los flujos del IVA (proyecto) = 0; con línea, cada mes
 * disposición + IVA con equity = IVA pagado. Al final, la reconciliación de la TIR.
 */
function hojaIva(ws: Worksheet, d: DatosAnalisis) {
  const s = d.supuestos;
  const iva = d.rentabilidad.iva;
  encabezadoHoja(ws, 'IVA de construcción (mensual)', d, 10);
  if (!iva) {
    faltanDatosIva(ws, 5, d);
    anchos(ws, [90]);
    return;
  }
  const conLinea = iva.financiamiento === 'linea';
  ws.getCell('A4').value = [
    `IVA ${s.ivaTasaPct} % (${FUENTE_TASA_IVA}) sobre ${s.ivaCapexSujetoPct} % del CAPEX`,
    s.ivaOrigenEquipo ? ORIGENES_EQUIPO[s.ivaOrigenEquipo] : '',
    `recuperación: ${s.ivaRecuperacionMeses} meses`,
    `financiamiento: ${FINANCIAMIENTOS_IVA[iva.financiamiento]}`,
    ...(conLinea ? [`línea: monto máximo USD ${Math.round(iva.lineaMonto ?? 0).toLocaleString('en-US')} (equivalente en USD), ${s.ivaLineaTasaPct} % anual, comisión ${s.ivaLineaComisionPct} %`] : []),
    `COD: ${mesLegible(iva.mesCod)}`,
  ].filter(Boolean).join(' · ');
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF555F6D' } };
  type Columna = [string, (m: MesIva) => string | number | null, string | undefined, boolean];
  const columnas: Columna[] = [
    ['Mes', (m) => m.mes, undefined, false],
    ['IVA pagado (inicio del mes)', (m) => m.pagado, USD, true],
    ['IVA recuperado (cierre del mes)', (m) => m.recuperado, USD, true],
    ['Saldo por recuperar al inicio del mes', (m) => m.saldoInicio, USD, false],
    ['Saldo por recuperar al cierre del mes', (m) => m.saldoFin, USD, false],
    ...(conLinea ? [
      ['Línea IVA: disposición', (m) => m.linea?.disposicion ?? 0, USD, true],
      ['Línea IVA: comisión', (m) => m.linea?.comision ?? 0, USD, true],
      ['Línea IVA: intereses', (m) => m.linea?.intereses ?? 0, USD, true],
      ['Línea IVA: repago', (m) => m.linea?.repago ?? 0, USD, true],
      ['Línea IVA: saldo al cierre', (m) => m.linea?.saldoFin ?? 0, USD, false],
    ] as Columna[] : []),
    ['IVA que pone el equity', (m) => m.ivaConEquity, USD, true],
    ['Flujo al equity por IVA', (m) => m.flujoEquity, USD, true],
    ['Flujo del proyecto por IVA (−pagado + recuperado)', (m) => m.flujoProyecto, USD, true],
    // Con línea: cada mes, disposición + IVA que pone el equity = IVA pagado (fórmula; 0 si cuadra)
    ...(conLinea ? [['Control del mes: |disposición + IVA con equity − IVA pagado|', () => 0, '#,##0.00', true] as Columna] : []),
  ];
  const t = tablaAnual(ws, 5, iva.meses, columnas);
  const tt = (j: number) => t.totales[j] ?? 0;
  const ultimo = iva.meses.at(-1);
  const indice = (titulo: string) => columnas.findIndex(([c]) => c.startsWith(titulo)) + 1;
  const colProyecto = col(indice('Flujo del proyecto por IVA'));
  const colControlMes = conLinea ? indice('Control del mes') : 0;
  if (conLinea) {
    const [disp, eq] = [col(indice('Línea IVA: disposición')), col(indice('IVA que pone el equity'))];
    iva.meses.forEach((m, i) => {
      const fila = t.primera + i;
      const dif = Math.abs(Math.round(((m.linea?.disposicion ?? 0) + m.ivaConEquity - m.pagado) * 100) / 100);
      formula(ws.getCell(fila, colControlMes), `ABS(ROUND(${disp}${fila}+${eq}${fila}-B${fila},2))`, dif, '#,##0.00');
    });
  }
  const f0 = t.filaTotal + 2;
  ws.getCell(f0, 1).value = 'IVA total';
  ws.getCell(f0, 2).value = iva.total; formato(ws.getCell(f0, 2), USD);
  control(ws, f0 + 1, 'IVA pagado − recuperado − saldo final', `ROUND(B${t.filaTotal}-C${t.filaTotal}-E${t.ultima},2)`,
    tt(2) - tt(3) - (ultimo?.saldoFin ?? 0));
  control(ws, f0 + 2, 'Suma de los flujos del IVA (proyecto)', `ROUND(${colProyecto}${t.filaTotal},2)`, tt(indice('Flujo del proyecto por IVA')),
    'Queda IVA por recuperar al final del horizonte.');
  control(ws, f0 + 3, 'Σ IVA pagado − IVA total', `ROUND(B${t.filaTotal}-B${f0},2)`, tt(2) - iva.total);
  let r = f0 + 4;
  if (conLinea) {
    control(ws, r, 'Línea IVA: Σ disposición − Σ repago − saldo final', `ROUND(F${t.filaTotal}-I${t.filaTotal}-J${t.ultima},2)`,
      tt(6) - tt(9) - (ultimo?.linea?.saldoFin ?? 0));
    control(ws, r + 1, 'Cada mes, disposición + IVA con equity = IVA pagado', `ROUND(${col(colControlMes)}${t.filaTotal},2)`, tt(colControlMes),
      'Algún mes no cuadra (columna "Control del mes").');
    r += 2;
  }
  r = reconciliacionTir(ws, r + 1, d, iva);
  const notas = [
    'Pagos de IVA, disposición y comisión de la línea al inicio del mes; devoluciones, intereses y repago al cierre (como el motor).',
    'Necesidad temporal: el IVA se recupera del SAT; no es un uso permanente (ver "Fuentes y usos").',
    ...notasIva(s),
  ];
  notas.forEach((n, i) => {
    ws.getCell(r + 1 + i, 1).value = n;
    ws.getCell(r + 1 + i, 1).font = n.endsWith(NOTA_IVA) ? { bold: true, color: { argb: 'FF9A6700' } } : { color: { argb: 'FF555F6D' } };
  });
  // B también lleva el período de la reconciliación ("2027-06 (inicio del mes)")
  anchos(ws, [48, 24, ...columnas.slice(2).map(() => 18)]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

/**
 * Reconciliación de la TIR (hoja IVA): la TIR del Resumen no sale de "Flujo anual" con el IVA activo, porque el motor
 * descuenta juntos los flujos anuales (periodo k en t = k años) y los del IVA con su fecha (t = meses/12 desde el NTP,
 * al inicio o al cierre del mes), con (1 + TIR)^t. Aquí: TIR sin IVA (IRR de "Flujo anual"), efecto del IVA en pp, TIR
 * con IVA, y una tabla por flujo (equity y proyecto) cuyo valor presente a la TIR con IVA debe dar 0.
 * Devuelve la fila siguiente libre.
 */
function reconciliacionTir(ws: Worksheet, fila: number, d: DatosAnalisis, iva: NonNullable<Rentabilidad['iva']>): number {
  const r = d.rentabilidad;
  const anuales = filasFlujo(r);
  const fechados = flujosFechadosIva(iva);
  // "Flujo anual": encabezado en la fila 5, datos desde la 6; flujo del proyecto en P y al equity en Q
  const rango = (c: string) => `'Flujo anual'!${c}6:${c}${5 + anuales.length}`;
  const sinIva = { equity: tir(anuales.map((a) => a.flujoEquity)), proyecto: tir(anuales.map((a) => a.flujoProyecto)) };
  ws.getCell(fila, 1).value = 'Reconciliación de la TIR';
  ws.getCell(fila, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
  ws.getCell(fila + 1, 1).value = 'La TIR con IVA descuenta juntos los flujos anuales de "Flujo anual" (periodo k en t = k años) y los flujos mensuales del IVA (t = meses/12 desde el NTP; al inicio o al cierre del mes), con (1 + TIR)^t.';
  ws.getCell(fila + 1, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  encabezados(ws, fila + 2, ['Concepto', 'Equity', 'Proyecto']);
  const fSin = fila + 3, fEfecto = fila + 4, fCon = fila + 5;
  ws.getCell(fSin, 1).value = 'TIR sin IVA (IRR de "Flujo anual")';
  formula(ws.getCell(fSin, 2), `IRR(${rango('Q')})`, sinIva.equity ?? 0, PCT_TIR);
  formula(ws.getCell(fSin, 3), `IRR(${rango('P')})`, sinIva.proyecto ?? 0, PCT_TIR);
  ws.getCell(fEfecto, 1).value = 'Efecto del IVA (pp)';
  ws.getCell(fCon, 1).value = 'TIR con IVA (la del Resumen)';
  ws.getCell(fCon, 2).value = r.tirEquity ?? 'N/D'; formato(ws.getCell(fCon, 2), PCT_TIR);
  ws.getCell(fCon, 3).value = r.tirProyecto ?? 'N/D'; formato(ws.getCell(fCon, 3), PCT_TIR);
  for (const [c, con, sin] of [[2, r.tirEquity, sinIva.equity], [3, r.tirProyecto, sinIva.proyecto]] as const) {
    const L = col(c);
    formula(ws.getCell(fEfecto, c), `(${L}${fCon}-${L}${fSin})*100`, con != null && sin != null ? (con - sin) * 100 : 0, PP);
  }
  // Una tabla por flujo: todos los flujos con su momento, factor de descuento y valor presente a la TIR con IVA
  let fin = fCon + 2;
  for (const [nombre, celdaTir, tasa, anual, delIva] of [
    ['equity', `$B$${fCon}`, r.tirEquity, (a: FilaFlujo) => a.flujoEquity, fechados.equity],
    ['proyecto', `$C$${fCon}`, r.tirProyecto, (a: FilaFlujo) => a.flujoProyecto, fechados.proyecto],
  ] as const) {
    if (tasa == null) continue;
    const flujos = [
      ...anuales.map((a, k) => ({ origen: 'Flujo anual', periodo: a.periodo, t: k, monto: anual(a) })),
      ...delIva.map((f) => ({ origen: 'IVA', periodo: `${f.mes} (${f.momento === 'inicio' ? 'inicio' : 'cierre'} del mes)`, t: f.t, monto: f.monto })),
    ].sort((a, b) => a.t - b.t);
    ws.getCell(fin, 1).value = `Flujos ${nombre === 'equity' ? 'al equity' : 'del proyecto'} a la TIR con IVA`;
    ws.getCell(fin, 1).font = { bold: true };
    const tabla = tablaAnual(ws, fin + 1, flujos, [
      ['Origen', (f) => f.origen, undefined, false],
      ['Período', (f) => f.periodo, undefined, false],
      ['t (años desde el NTP)', (f) => f.t, '0.0000', false],
      ['Flujo (USD)', (f) => f.monto, USD, true],
      ['Factor de descuento', (f) => 1 / (1 + tasa) ** f.t, '0.000000', false],
      ['Valor presente (USD)', (f) => f.monto / (1 + tasa) ** f.t, USD, true],
    ]);
    flujos.forEach((f, i) => {
      const x = tabla.primera + i;
      formula(ws.getCell(x, 5), `1/(1+${celdaTir})^C${x}`, 1 / (1 + tasa) ** f.t, '0.000000');
      formula(ws.getCell(x, 6), `D${x}*E${x}`, f.monto / (1 + tasa) ** f.t, USD);
    });
    const vp = valorPresenteFechado(flujos, tasa);
    control(ws, tabla.filaTotal + 1, `Valor presente de los flujos ${nombre === 'equity' ? 'al equity' : 'del proyecto'} a la TIR con IVA`,
      `ROUND(F${tabla.filaTotal},2)`, vp);
    fin = tabla.filaTotal + 3;
  }
  return fin;
}

/**
 * Escenarios de estrés: una fila por escenario con la deuda fija del caso base (DSCR mínimo y su año, promedio, LLCR,
 * PLCR, TIR y años bajo el covenant; en rojo, con formato condicional, lo que baja del covenant), los puntos de quiebre,
 * el detalle del COD +6 meses (faltante y DSRA) y la nota de la convención.
 */
export { anosBajoCovenant };

function hojaEscenarios(ws: Worksheet, d: DatosAnalisis) {
  const esc = d.escenarios!;
  const covenant = d.supuestos.dscrCovenant;
  encabezadoHoja(ws, 'Escenarios de estrés (deuda fija)', d, 9);
  ws.getCell('A4').value = NOTA_CONVENCION_ESCENARIOS;
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF555F6D' } };
  encabezados(ws, 5, ['Escenario', 'DSCR mínimo', 'Año del DSCR mínimo', 'DSCR promedio', 'LLCR', 'PLCR', 'TIR de equity (flujo disponible)', 'TIR de proyecto', 'Años bajo el covenant']);
  esc.forEach((e, i) => {
    const r = 6 + i;
    const valores: [number | string | null, string | undefined][] = [
      [e.nombre, undefined], [e.dscrMin, DSCR3], [e.anoDscrMin, undefined], [e.dscrPromedio, DSCR3], [e.llcr, DSCR3], [e.plcr, DSCR3],
      [e.tirEquity, PCT_TIR], [e.tirProyecto, PCT_TIR], [anosBajoCovenant(e.anosBajoCovenant), undefined],
    ];
    valores.forEach(([v, fmt], j) => { const c = ws.getCell(r, j + 1); c.value = v ?? 'N/D'; formato(c, typeof v === 'number' ? fmt : undefined); });
    if (e.clave === 'base') ws.getCell(r, 1).font = { bold: true };
    if (i % 2 === 1) for (let c = 1; c <= 9; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  const ultima = 5 + esc.length;
  const fCov = ultima + 2;
  ws.getCell(fCov, 1).value = 'Covenant (DSCR mínimo del crédito)';
  ws.getCell(fCov, 2).value = covenant; formato(ws.getCell(fCov, 2), DSCR);
  if (d.supuestos.dscrLockup != null) {
    ws.getCell(fCov + 1, 1).value = 'DSCR de lock-up (bloqueo de dividendos)';
    ws.getCell(fCov + 1, 2).value = d.supuestos.dscrLockup; formato(ws.getCell(fCov + 1, 2), DSCR);
  }
  // En rojo lo que baja del covenant (si alguien cambia el covenant, el color se actualiza)
  ws.addConditionalFormatting({
    ref: `B6:B${ultima} D6:D${ultima}`,
    rules: [{ type: 'expression', priority: 1, formulae: [`AND(ISNUMBER(B6),B6<$B$${fCov})`], style: { font: { bold: true, color: { argb: 'FFB42318' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } } } }],
  });

  // Puntos de quiebre
  let f = fCov + 3;
  if (d.quiebres) {
    ws.getCell(f, 1).value = 'Puntos de quiebre de ingresos';
    ws.getCell(f, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
    const filasQ: [string, number | null][] = [['Caída de ingresos hasta el covenant', d.quiebres.hastaCovenant], ['Caída de ingresos hasta DSCR 1.0x', d.quiebres.hastaUno]];
    filasQ.forEach(([k, v], i) => { ws.getCell(f + 1 + i, 1).value = k; ws.getCell(f + 1 + i, 2).value = v ?? 'No se alcanza'; formato(ws.getCell(f + 1 + i, 2), v == null ? undefined : PCT); });
    ws.getCell(f + 3, 1).value = 'Todos los ingresos (PPA, mercado y CELs), con la deuda fija y el ISR recalculado.';
    ws.getCell(f + 3, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
    f += 5;
  }

  // COD +6 meses: año 1 y DSRA
  const cod6 = esc.find((e) => e.clave === 'cod6')?.cod6;
  if (cod6) {
    ws.getCell(f, 1).value = 'COD +6 meses: año 1 y DSRA';
    ws.getCell(f, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
    const filasC: [string, number | string | null, string | undefined][] = [
      ['CFADS del año 1', cod6.cfadsAno1, USD], ['Servicio del año 1 (fijo en fechas)', cod6.servicioAno1, USD], ['DSCR del año 1', cod6.dscrAno1, DSCR3],
      ['Faltante', cod6.faltante, USD], ['DSRA disponible', cod6.dsra, USD], ['Uso de la DSRA', cod6.usoDsra, USD],
      ['¿La DSRA alcanza?', cod6.alcanza ? 'Sí' : 'No: incumplimiento de pago en el año 1', undefined],
      ['Año en que se repone la DSRA', cod6.usoDsra > 0 ? (cod6.anoRepuesta ?? 'No se repone en el plazo') : 'No se usó', undefined],
      ['Intereses adicionales de construcción (equity)', cod6.interesesAdicionales, USD],
      ['Penalización del EPC', cod6.penalizacionEpc > 0 ? cod6.penalizacionEpc : 'No capturada', USD],
    ];
    filasC.forEach(([k, v, fmt], i) => { ws.getCell(f + 1 + i, 1).value = k; ws.getCell(f + 1 + i, 2).value = v ?? 'N/D'; formato(ws.getCell(f + 1 + i, 2), typeof v === 'number' ? fmt : undefined); });
    let n = f + 1 + filasC.length;
    if (cod6.alcanza && cod6.dscrAno1 != null && cod6.dscrAno1 < covenant) {
      ws.getCell(n, 1).value = mensajeCovenantDsra(cod6.dscrAno1, covenant, d.supuestos.dscrLockup);
      ws.getCell(n, 1).font = { bold: true, color: { argb: 'FF9A6700' } };
      n += 1;
    }
    ws.getCell(n, 1).value = NOTA_COD6;
    ws.getCell(n, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  }
  if (d.estados) {
    const n = ws.rowCount + 2;
    ws.getCell(n, 1).value = NOTA_TIR_ESCENARIOS;
    ws.getCell(n, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  }
  anchos(ws, [46, 14, 12, 14, 12, 12, 14, 14, 18]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

function hojaSensibilidad(ws: Worksheet, d: DatosAnalisis) {
  encabezadoHoja(ws, 'Sensibilidad: precio de PPA contra CAPEX', d, 8);
  const s = d.sensibilidad;
  if (!s) {
    ws.getCell('A5').value = 'Sin sensibilidad: el proyecto no tiene supuestos de ingresos y producción.';
    return;
  }
  const tabla = (fila: number, titulo: string, valor: (i: number, j: number) => number | null, fmt = PCT) => {
    ws.getCell(fila, 1).value = titulo;
    ws.getCell(fila, 1).font = { bold: true };
    // El CAPEX actual con su valor exacto (p. ej. 0.744); los demás puntos de la tabla, con 2 decimales
    encabezados(ws, fila + 1, ['PPA (USD/MWh) \\ CAPEX (USD/Wdc)', ...s.capexWdc.map((c, j) => (j === s.columnaActual ? `${Number(c.toFixed(3))} (actual)` : c.toFixed(2)))]);
    s.precios.forEach((p, i) => {
      const r = fila + 2 + i;
      ws.getCell(r, 1).value = p; formato(ws.getCell(r, 1), '#,##0.00');
      ws.getCell(r, 1).font = { bold: true };
      s.capexWdc.forEach((_, j) => {
        const c = ws.getCell(r, j + 2);
        const v = valor(i, j);
        c.value = v ?? 'N/D';
        formato(c, fmt);
        if (i === s.filaActual && j === s.columnaActual) {
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.aviso } };
          c.font = { bold: true };
          c.note = 'Caso actual';
        }
      });
    });
    return fila + 2 + s.precios.length;
  };
  const fin = tabla(5, 'TIR de equity (flujo disponible)', (i, j) => s.celdas[i][j].tirEquity, PCT_TIR);
  const fin2 = tabla(fin + 1, 'Deuda / usos', (i, j) => s.celdas[i][j].deudaPct);
  ws.getCell(fin2 + 1, 1).value = 'Caso actual resaltado. Cada celda recalcula la deuda, el equity y la TIR con el mismo motor; el resto de los supuestos no cambia.';
  anchos(ws, [32, 13, 13, 13, 13, 13, 13]);
}

// ---------------------------------------------------------------------------
// Estados financieros (estado de resultados, balance y flujo de efectivo; caso base P50)
// ---------------------------------------------------------------------------

const MODO_DISTRIBUCION = (e: EstadosFinancieros) => (e.devolucionCapital ? 'Dividendos y devolución de capital variable' : 'Solo dividendos');

/** Resumen: las tres TIR de equity, el modo de distribución y por qué difieren (al final de la hoja). */
function resumenEstados(ws: Worksheet, fila: number, e: EstadosFinancieros, s: Supuestos) {
  encabezados(ws, fila, ['Estados financieros', 'Valor', 'Nota']);
  const maxAtrapada = (serie: number[]) => serie.reduce((m, x, i) => (x > m.monto ? { monto: x, ano: i + 1 } : m), { monto: 0, ano: 0 });
  const sd = maxAtrapada(e.cajaAtrapada.soloDividendos), cd = maxAtrapada(e.cajaAtrapada.conDevolucion);
  const filas: [string, number | string | null, string | undefined, string][] = [
    ['TIR de equity (flujo disponible)', e.tir.flujoDisponible, PCT_TIR, 'Toda la caja después de la deuda, cada año (la de arriba)'],
    ['TIR de equity (dividendos y devolución de capital)', e.tir.dividendosYDevolucion, PCT_TIR, 'Dividendos permitidos y reembolso de capital variable'],
    ['TIR de equity (solo dividendos)', e.tir.soloDividendos, PCT_TIR, 'Dividendos permitidos; el resto, en la liquidación'],
    ['Distribuciones del proyecto (supuesto)', MODO_DISTRIBUCION(e), undefined, 'Devolución de capital variable: ' + (s.devolucionCapitalVariable === true ? 'sí' : s.devolucionCapitalVariable === false ? 'no' : 'sin capturar (no)')],
    ['Caja atrapada máxima, solo dividendos (USD)', sd.monto, USD, sd.ano ? `Al cierre del año ${sd.ano} (ver hoja Balance)` : 'No hay caja atrapada'],
    ['Caja atrapada máxima, con devolución de capital (USD)', cd.monto, USD, cd.ano ? `Al cierre del año ${cd.ano} (ver hoja Balance)` : 'No hay caja atrapada'],
  ];
  filas.forEach(([k, v, fmt, n], i) => {
    const r = fila + 1 + i;
    ws.getCell(r, 1).value = k;
    const c = ws.getCell(r, 2);
    c.value = v ?? 'N/D';
    formato(c, typeof v === 'number' ? fmt : undefined);
    ws.getCell(r, 3).value = n;
    ws.getCell(r, 3).alignment = { wrapText: true, vertical: 'top' };
    if (i % 2 === 1) for (const cc of [1, 2, 3]) ws.getCell(r, cc).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  const nota = fila + 1 + filas.length;
  ws.getCell(nota, 1).value = explicacionTir(e, s.dscrLockup ?? null);
  ws.mergeCells(nota, 1, nota, 3);
  ws.getCell(nota, 1).alignment = { wrapText: true, vertical: 'top' };
  ws.getCell(nota, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
  ws.getRow(nota).height = 75;
}

/** Supuestos: el supuesto de distribuciones y la sección "Alcance y limitaciones del modelo" (al final de la hoja). */
function alcanceDelModelo(ws: Worksheet, fila: number, d: DatosAnalisis) {
  const s = d.supuestos;
  ws.getCell(fila, 1).value = 'Estados financieros';
  ws.getCell(fila, 1).font = { bold: true };
  const valores = ['Estados financieros', 'Devolución de capital variable', s.devolucionCapitalVariable === true ? 'Sí' : s.devolucionCapitalVariable === false ? 'No' : 'Sin capturar (no)', '', s.devolucionCapitalVariable === true ? NOTA_CAPITAL_VARIABLE : 'Vacío = no: la caja que no puede salir como dividendo queda atrapada.'];
  valores.forEach((x, j) => { ws.getCell(fila + 1, j + 1).value = x; });
  ws.getCell(fila + 1, 5).alignment = { wrapText: true, vertical: 'top' };
  const titulo = fila + 3;
  ws.getCell(titulo, 1).value = 'Alcance y limitaciones del modelo';
  ws.getCell(titulo, 1).font = { bold: true };
  ws.mergeCells(titulo, 1, titulo, 5);
  const limitaciones = [
    'Modelo anual simplificado: CAPEX y aportaciones repartidos en los años de construcción; deuda esculpida desde el primer año de operación; intereses de construcción sobre el saldo dispuesto mes a mes (se usa primero el equity).',
    `ISR con pérdidas amortizables ${ANOS_AMORTIZACION_PERDIDAS} años (LISR art. 57) y depreciación fiscal según supuestos (validar con asesor fiscal).`,
    'Los escenarios de estrés usan el flujo disponible (deuda fija, ISR recalculado).',
    NOTA_DIVIDENDOS,
    ...LIMITACIONES_ESTADOS,
  ];
  limitaciones.forEach((l, i) => {
    const r = titulo + 1 + i;
    ws.getCell(r, 1).value = `• ${l}`;
    ws.mergeCells(r, 1, r, 5);
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
    ws.getRow(r).height = Math.max(15, Math.ceil(l.length / 150) * 15);
  });
}

/** Fila de un estado: concepto, valores por periodo (o fórmula por columna) y estilo. */
interface FilaEstado {
  clave: string;
  concepto: string;
  valores: number[];
  /** Fórmula de la columna (letra) a partir de las filas ya escritas (clave → número de fila). */
  formula?: (columna: string, filas: Record<string, number>, j: number) => string;
  total?: boolean;
  /** Suma de los periodos en la columna "Total" (flujos; no saldos). */
  sumar?: boolean;
}

/**
 * Tabla de un estado financiero: conceptos en filas, periodos en columnas (B…), y una columna "Total" si alguna fila
 * suma. Los subtotales son fórmulas (con su resultado del motor). Devuelve la fila de cada clave y la última columna.
 */
function tablaEstado(ws: Worksheet, filaInicio: number, periodos: string[], filas: FilaEstado[]) {
  const conTotal = filas.some((f) => f.sumar);
  encabezados(ws, filaInicio, ['Concepto (USD)', ...periodos, ...(conTotal ? ['Total'] : [])]);
  const posicion: Record<string, number> = {};
  const ultimaCol = col(1 + periodos.length);
  filas.forEach((f, i) => {
    const r = filaInicio + 1 + i;
    posicion[f.clave] = r;
    ws.getCell(r, 1).value = f.concepto;
    // Residuos de punto flotante (p. ej. −0.000000001 de deuda ya pagada) como 0: no se ven como "-0" en rojo
    f.valores.map((x) => (Math.abs(x) < 0.005 ? 0 : x)).forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      if (f.formula) formula(c, f.formula(col(2 + j), posicion, j), v, USD);
      else { c.value = v; formato(c, USD); }
    });
    if (conTotal && f.sumar) formula(ws.getCell(r, 2 + periodos.length), `SUM(B${r}:${ultimaCol}${r})`, f.valores.reduce((a, x) => a + x, 0), USD);
    const ancho = 1 + periodos.length + (conTotal ? 1 : 0);
    if (f.total) for (let c = 1; c <= ancho; c++) { ws.getCell(r, c).font = { bold: true }; ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.total } }; }
    else if (i % 2 === 1) for (let c = 1; c <= ancho; c++) ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR.banda } };
  });
  return { posicion, ultima: filaInicio + filas.length, ultimaCol };
}

/** Suma de filas de la misma columna: "B7+B8+B9". */
const sumaDe = (columna: string, filas: Record<string, number>, claves: string[]) => claves.map((k) => `${columna}${filas[k]}`).join('+');

/** Fila de control por periodo: ROUND(…, 2) = 0 en cada columna, verde si da 0 y rojo si no (formato condicional). */
function filaControl(ws: Worksheet, fila: number, concepto: string, periodos: number, f: (columna: string) => string, resultados: number[]) {
  ws.getCell(fila, 1).value = concepto;
  ws.getCell(fila, 1).font = { bold: true };
  resultados.forEach((v, j) => formula(ws.getCell(fila, 2 + j), `ROUND(${f(col(2 + j))},2)`, Math.round(v * 100) / 100, '#,##0.00'));
  const rango = `B${fila}:${col(1 + periodos)}${fila}`;
  ws.addConditionalFormatting({
    ref: rango,
    rules: [
      { type: 'expression', priority: 1, formulae: [`B${fila}=0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.ok } }, font: { bold: true, color: { argb: 'FF1E7B34' } } } },
      { type: 'expression', priority: 2, formulae: [`B${fila}<>0`], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: COLOR.error } }, font: { bold: true, color: { argb: 'FFB42318' } } } },
    ],
  });
  return rango;
}

function notasAlPie(ws: Worksheet, fila: number, notas: string[], columnas: number) {
  notas.forEach((t, i) => {
    ws.getCell(fila + i, 1).value = t;
    ws.mergeCells(fila + i, 1, fila + i, Math.min(columnas, 12));
    ws.getCell(fila + i, 1).alignment = { wrapText: true, vertical: 'top' };
    ws.getCell(fila + i, 1).font = { italic: true, color: { argb: 'FF555F6D' } };
    ws.getRow(fila + i).height = Math.max(15, Math.ceil(t.length / 160) * 15);
  });
}

const anosDe = (e: EstadosFinancieros) => e.resultados.map((r) => `Año ${r.ano}`);

/** Nota de la fila 4 de una hoja de estados, combinada a lo ancho para que se lea completa. */
function notaFila4(ws: Worksheet, texto: string) {
  ws.getCell('A4').value = texto;
  ws.getCell('A4').font = { italic: true, color: { argb: 'FF555F6D' } };
  ws.mergeCells(4, 1, 4, 10);
}

function hojaResultados(ws: Worksheet, d: DatosAnalisis) {
  const e = d.estados!;
  const R = e.resultados;
  encabezadoHoja(ws, 'Estado de resultados (caso base P50)', d, 8);
  notaFila4(ws, `Distribuciones: ${MODO_DISTRIBUCION(e).toLowerCase()}. Gastos en negativo; los subtotales son fórmulas.`);
  const v = (campo: keyof (typeof R)[number], signo = 1) => R.map((x) => signo * (x[campo] as number));
  const t = tablaEstado(ws, 5, anosDe(e), [
    { clave: 'ing', concepto: 'Ingresos', valores: v('ingresos'), sumar: true },
    { clave: 'opex', concepto: 'OPEX, seguros y arrendamiento', valores: v('opex', -1), sumar: true },
    { clave: 'ebitda', concepto: 'EBITDA', valores: v('ebitda'), formula: (c, p) => sumaDe(c, p, ['ing', 'opex']), total: true, sumar: true },
    { clave: 'dep', concepto: 'Depreciación contable (línea recta)', valores: v('depreciacion', -1), sumar: true },
    { clave: 'uop', concepto: 'Utilidad de operación', valores: v('utilidadOperacion'), formula: (c, p) => sumaDe(c, p, ['ebitda', 'dep']), total: true, sumar: true },
    { clave: 'int', concepto: 'Intereses de la deuda', valores: v('intereses', -1), sumar: true },
    { clave: 'com', concepto: 'Amortización de la comisión de estructuración', valores: v('amortizacionComision', -1), sumar: true },
    { clave: 'liva', concepto: 'Intereses y comisión de la línea de IVA', valores: v('costosLineaIva', -1), sumar: true },
    { clave: 'uai', concepto: 'Utilidad antes de impuestos', valores: v('utilidadAntesImpuestos'), formula: (c, p) => sumaDe(c, p, ['uop', 'int', 'com', 'liva']), total: true, sumar: true },
    { clave: 'isrc', concepto: 'ISR corriente', valores: v('isrCorriente', -1), sumar: true },
    { clave: 'isrd', concepto: 'ISR diferido', valores: v('isrDiferido', -1), sumar: true },
    { clave: 'un', concepto: 'Utilidad neta', valores: v('utilidadNeta'), formula: (c, p) => sumaDe(c, p, ['uai', 'isrc', 'isrd']), total: true, sumar: true },
  ]);
  notasAlPie(ws, t.ultima + 2, [
    'ISR diferido (NIF D-4), neto: tasa × (valor contable − saldo fiscal por deducir) del CAPEX y del reemplazo de inversores, menos tasa × las pérdidas fiscales pendientes que sí se usarán.',
    `Pérdidas fiscales que caducan sin usarse: ${Math.round(e.perdidasCaducadas).toLocaleString('en-US')} USD (no generan ISR diferido activo; ver hoja Impuestos).`,
    NOTA_COMISION_ESTRUCTURACION,
  ], R.length + 2);
  anchos(ws, [44, ...R.map(() => 13), 15]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

/** Fila de la caja en la hoja Balance (para el control del flujo de efectivo). */
const FILA_CAJA_BALANCE = 7;

function hojaBalance(ws: Worksheet, d: DatosAnalisis) {
  const e = d.estados!;
  const B = e.balance;
  const n = e.resultados.length;
  encabezadoHoja(ws, 'Balance (caso base P50, al cierre de cada año)', d, 8);
  notaFila4(ws, `COD = balance de apertura en la operación comercial. Distribuciones: ${MODO_DISTRIBUCION(e).toLowerCase()}.`);
  const v = (campo: keyof (typeof B)[number]) => B.map((x) => x[campo] as number);
  const t = tablaEstado(ws, 5, ['COD', ...anosDe(e)], [
    { clave: 'af', concepto: 'Activo fijo neto', valores: v('activoFijoNeto') },
    { clave: 'caja', concepto: 'Caja (incluye la caja atrapada)', valores: v('caja') },
    { clave: 'dsra', concepto: 'DSRA', valores: v('dsra') },
    { clave: 'mmra', concepto: 'MMRA', valores: v('mmra') },
    { clave: 'iva', concepto: 'IVA por recuperar', valores: v('ivaPorRecuperar') },
    { clave: 'difa', concepto: 'ISR diferido activo', valores: v('isrDiferidoActivo') },
    { clave: 'activo', concepto: 'Activo total', valores: v('activoTotal'), formula: (c, p) => sumaDe(c, p, ['af', 'caja', 'dsra', 'mmra', 'iva', 'difa']), total: true },
    { clave: 'deuda', concepto: 'Deuda senior (neta de la comisión por amortizar)', valores: v('deuda') },
    { clave: 'linea', concepto: 'Línea de IVA', valores: v('lineaIva') },
    { clave: 'difp', concepto: 'ISR diferido pasivo', valores: v('isrDiferidoPasivo') },
    { clave: 'pasivo', concepto: 'Pasivo total', valores: v('pasivoTotal'), formula: (c, p) => sumaDe(c, p, ['deuda', 'linea', 'difp']), total: true },
    { clave: 'cap', concepto: 'Capital aportado', valores: v('capitalAportado') },
    { clave: 'apiva', concepto: 'Aportaciones para IVA', valores: v('aportacionesIva') },
    { clave: 'res', concepto: 'Reserva legal', valores: v('reservaLegal') },
    { clave: 'ua', concepto: 'Utilidades acumuladas', valores: v('utilidadesAcumuladas') },
    { clave: 'capital', concepto: 'Capital contable', valores: v('capitalTotal'), formula: (c, p) => sumaDe(c, p, ['cap', 'apiva', 'res', 'ua']), total: true },
    { clave: 'pmc', concepto: 'Pasivo + capital', valores: B.map((b) => b.pasivoTotal + b.capitalTotal), formula: (c, p) => sumaDe(c, p, ['pasivo', 'capital']), total: true },
  ]);
  const p = t.posicion;
  if (p.caja !== FILA_CAJA_BALANCE) throw new Error('La caja del balance debe estar en la fila ' + FILA_CAJA_BALANCE);
  const fc = t.ultima + 1;
  filaControl(ws, fc, 'Control: activo − pasivo − capital', B.length, (c) => `${c}${p.activo}-${c}${p.pasivo}-${c}${p.capital}`, B.map((b) => b.control));
  control(ws, fc + 2, 'activo − pasivo − capital = 0 en todos los años', `ROUND(SUMPRODUCT(ABS(B${fc}:${t.ultimaCol}${fc})),2)`, B.reduce((a, b) => a + Math.abs(Math.round(b.control * 100) / 100), 0));

  // Caja atrapada al cierre de cada año, en los dos modos
  const fa = fc + 4;
  ws.getCell(fa, 1).value = 'Caja atrapada al cierre de cada año (USD)';
  ws.getCell(fa, 1).font = { bold: true, size: 12, color: { argb: COLOR.encabezado } };
  encabezados(ws, fa + 1, ['Modo', 'COD', ...anosDe(e)]);
  const modos: [string, number[], boolean][] = [
    ['Solo dividendos', e.cajaAtrapada.soloDividendos, !e.devolucionCapital],
    ['Con devolución de capital variable', e.cajaAtrapada.conDevolucion, e.devolucionCapital],
  ];
  modos.forEach(([nombre, serie, elegido], i) => {
    const r = fa + 2 + i;
    ws.getCell(r, 1).value = nombre + (elegido ? ' (supuesto)' : '');
    if (elegido) ws.getCell(r, 1).font = { bold: true };
    ws.getCell(r, 2).value = 0; formato(ws.getCell(r, 2), USD);
    serie.forEach((x, j) => { ws.getCell(r, 3 + j).value = x; formato(ws.getCell(r, 3 + j), USD); });
  });
  const bloqueados = e.distribuciones.bloqueado;
  let fn = fa + 4;
  if (bloqueados.some(Boolean)) {
    ws.getCell(fn, 1).value = 'Lock-up (sin distribuciones)';
    bloqueados.forEach((x, j) => { if (x) ws.getCell(fn, 3 + j).value = 'Sí'; });
    fn += 1;
  }
  notasAlPie(ws, fn + 1, [
    NOTA_DIVIDENDOS,
    ...(d.supuestos.dscrLockup != null ? [NOTA_LOCKUP] : []),
    ...(e.devolucionCapital ? [NOTA_CAPITAL_VARIABLE] : []),
    NOTA_COMISION_ESTRUCTURACION,
  ], n + 2);
  anchos(ws, [46, ...B.map(() => 13)]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

function hojaFlujoEfectivo(ws: Worksheet, d: DatosAnalisis) {
  const e = d.estados!;
  const F = e.flujo;
  encabezadoHoja(ws, 'Flujo de efectivo (método indirecto, caso base P50)', d, 8);
  notaFila4(ws, 'Construcción = del NTP a la COD. La caja final de cada periodo se compara con la caja del balance (control con fórmula).');
  const v = (campo: keyof (typeof F)[number]) => F.map((x) => x[campo] as number);
  const t = tablaEstado(ws, 5, ['Construcción', ...anosDe(e)], [
    { clave: 'un', concepto: 'Utilidad neta', valores: v('utilidadNeta'), sumar: true },
    { clave: 'dep', concepto: 'Depreciación contable', valores: v('depreciacion'), sumar: true },
    { clave: 'dif', concepto: 'ISR diferido', valores: v('isrDiferido'), sumar: true },
    { clave: 'com', concepto: 'Amortización de la comisión', valores: v('amortizacionComision'), sumar: true },
    { clave: 'op', concepto: 'Flujo de operación', valores: v('operacion'), formula: (c, p) => sumaDe(c, p, ['un', 'dep', 'dif', 'com']), total: true, sumar: true },
    { clave: 'capex', concepto: 'CAPEX, costos capitalizados y reemplazo de inversores', valores: v('capex'), sumar: true },
    { clave: 'ivap', concepto: 'IVA pagado', valores: v('ivaPagado'), sumar: true },
    { clave: 'ivar', concepto: 'IVA recuperado', valores: v('ivaRecuperado'), sumar: true },
    { clave: 'inv', concepto: 'Flujo de inversión', valores: v('inversion'), formula: (c, p) => sumaDe(c, p, ['capex', 'ivap', 'ivar']), total: true, sumar: true },
    { clave: 'apc', concepto: 'Aportaciones de capital', valores: v('aportacionesCapital'), sumar: true },
    { clave: 'disp', concepto: 'Disposición de la deuda', valores: v('disposicionDeuda'), sumar: true },
    { clave: 'cest', concepto: 'Comisión de estructuración', valores: v('comisionEstructuracion'), sumar: true },
    { clave: 'amort', concepto: 'Amortización de la deuda', valores: v('amortizacionDeuda'), sumar: true },
    { clave: 'resv', concepto: 'Reservas (DSRA y MMRA)', valores: v('reservas'), sumar: true },
    { clave: 'linea', concepto: 'Línea de IVA (disposición − repago)', valores: v('lineaIva'), sumar: true },
    { clave: 'apiva', concepto: 'Aportaciones para IVA (netas)', valores: v('aportacionesIva'), sumar: true },
    { clave: 'div', concepto: 'Dividendos', valores: v('dividendos'), sumar: true },
    { clave: 'dev', concepto: 'Devolución de capital (incluye la liquidación)', valores: v('devolucionCapital'), sumar: true },
    { clave: 'fin', concepto: 'Flujo de financiamiento', valores: v('financiamiento'), formula: (c, p) => sumaDe(c, p, ['apc', 'disp', 'cest', 'amort', 'resv', 'linea', 'apiva', 'div', 'dev']), total: true, sumar: true },
    { clave: 'cambio', concepto: 'Cambio en la caja', valores: v('cambioCaja'), formula: (c, p) => sumaDe(c, p, ['op', 'inv', 'fin']), sumar: true },
    { clave: 'ini', concepto: 'Caja inicial', valores: v('cajaInicial'), formula: (c, p, j) => (j === 0 ? '0' : `${col(1 + j)}${p.ini + 1}`) },
    { clave: 'final', concepto: 'Caja final', valores: v('cajaFinal'), formula: (c, p) => sumaDe(c, p, ['ini', 'cambio']), total: true },
  ]);
  const p = t.posicion;
  const fc = t.ultima + 1;
  const cajaBalance = e.balance.map((b) => b.caja);
  filaControl(ws, fc, 'Control: caja final − caja del balance', F.length, (c) => `${c}${p.final}-Balance!${c}${FILA_CAJA_BALANCE}`, F.map((f, j) => f.cajaFinal - cajaBalance[j]));
  control(ws, fc + 2, 'caja del flujo de efectivo = caja del balance en todos los años', `ROUND(SUMPRODUCT(ABS(B${fc}:${col(1 + F.length)}${fc})),2)`,
    F.reduce((a, f, j) => a + Math.abs(Math.round((f.cajaFinal - cajaBalance[j]) * 100) / 100), 0));
  notasAlPie(ws, fc + 4, [
    'Los dividendos y la devolución de capital se limitan por ley (utilidades acumuladas y reserva legal) y por el lock-up; lo que no sale queda en caja (caja atrapada, hoja Balance). En el último año se liquida la sociedad.',
    'La DSRA se fondea en la COD y se libera en el último año del plazo de la deuda; la MMRA se fondea desde el CFADS y se usa en el reemplazo de inversores.',
  ], F.length + 2);
  anchos(ws, [50, ...F.map(() => 13), 15]);
  ws.views = [{ state: 'frozen', ySplit: 5, xSplit: 1 }];
}

// ---------------------------------------------------------------------------

/** Libro completo con las 9 hojas (10 con la hoja "IVA"), en el orden de lectura de un analista (resumen y deuda primero). */
export async function crearLibroFinanciero(excel: ExcelJS, d: DatosAnalisis): Promise<Workbook> {
  const wb = new excel.Workbook();
  wb.creator = 'AuraGrid';
  wb.created = d.generado;
  wb.title = `Análisis financiero · ${d.proyecto.nombre}`;
  // Excel recalcula las fórmulas (totales y controles) al abrir
  wb.calcProperties = { fullCalcOnLoad: true };
  const hojas: Record<Hoja, (ws: Worksheet, d: DatosAnalisis) => void> = {
    Portada: hojaPortada, Resumen: hojaResumen, Supuestos: hojaSupuestos, 'Fuentes y usos': hojaFuentesUsos,
    Deuda: hojaDeuda, 'Flujo anual': hojaFlujo, Impuestos: hojaImpuestos, 'Cronograma de caja': hojaCronograma, IVA: hojaIva, Sensibilidad: hojaSensibilidad, Escenarios: hojaEscenarios,
    'Estado de resultados': hojaResultados, Balance: hojaBalance, 'Flujo de efectivo': hojaFlujoEfectivo,
  };
  for (const nombre of hojasDelLibro(d)) {
    const ws = wb.addWorksheet(nombre, { properties: { tabColor: { argb: nombre === 'Portada' ? 'FFF0A535' : COLOR.encabezado } } });
    hojas[nombre](ws, d);
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    // Protegida sin contraseña: se puede consultar, copiar y filtrar, pero no cambiar cifras por accidente
    await ws.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true, sort: true, autoFilter: true });
  }
  return wb;
}

/** Archivo listo para descargar (Blob de tipo xlsx) y su nombre. */
export async function archivoAnalisisFinanciero(excel: ExcelJS, d: DatosAnalisis): Promise<{ nombre: string; blob: Blob }> {
  const wb = await crearLibroFinanciero(excel, d);
  const buffer = await wb.xlsx.writeBuffer();
  return { nombre: nombreArchivoAnalisis(d.proyecto.nombre, d.generado), blob: new Blob([buffer], { type: MIME_XLSX }) };
}
