// Descargas: la respuesta del asistente (Markdown) a PDF, Word y Excel, y el plan de entregables a MS Project
// (este último se exporta desde el panel "Frentes de trabajo").
// Las librerías (jspdf, docx, exceljs) se reciben como parámetro para cargarlas solo al descargar y poder probar
// la generación sin navegador.

import type { Frente } from './validaciones';
import type ExcelJSNS from 'exceljs';
import type { Workbook, Row } from 'exceljs';

// ---------------------------------------------------------------------------
// Markdown → bloques
// ---------------------------------------------------------------------------

export interface Segmento { texto: string; negrita: boolean }

export type Bloque =
  | { tipo: 'titulo'; nivel: number; segmentos: Segmento[] }
  | { tipo: 'parrafo'; segmentos: Segmento[] }
  | { tipo: 'vineta'; nivel: number; segmentos: Segmento[] }
  | { tipo: 'numerada'; nivel: number; numero: string; segmentos: Segmento[] }
  | { tipo: 'tabla'; filas: string[][] }
  | { tipo: 'codigo'; lineas: string[] };

/** Quita las marcas en línea que no son negrita: `código`, *cursiva*, [texto](url). */
function limpiarEnLinea(t: string): string {
  return t
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2');
}

/** Divide en tramos normales y en negrita (**texto** o __texto__). */
export function segmentos(texto: string): Segmento[] {
  const partes: Segmento[] = [];
  const re = /(\*\*|__)(.+?)\1/g;
  let ultimo = 0;
  for (const m of texto.matchAll(re)) {
    if (m.index! > ultimo) partes.push({ texto: limpiarEnLinea(texto.slice(ultimo, m.index)), negrita: false });
    partes.push({ texto: limpiarEnLinea(m[2]), negrita: true });
    ultimo = m.index! + m[0].length;
  }
  if (ultimo < texto.length) partes.push({ texto: limpiarEnLinea(texto.slice(ultimo)), negrita: false });
  return partes.filter((p) => p.texto.length > 0);
}

export const textoPlano = (s: Segmento[]): string => s.map((p) => p.texto).join('');

const celdas = (linea: string) => linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => textoPlano(segmentos(c.trim())));
const esSeparadorTabla = (linea: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(linea);

export function bloquesMarkdown(texto: string): Bloque[] {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n');
  const bloques: Bloque[] = [];
  let parrafo: string[] = [];
  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: 'parrafo', segmentos: segmentos(parrafo.join(' ')) });
    parrafo = [];
  };

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const sangria = (linea.match(/^\s*/)?.[0].replace(/\t/g, '  ').length ?? 0);
    const nivel = Math.min(3, Math.floor(sangria / 2));
    let m: RegExpMatchArray | null;

    if (/^\s*```/.test(linea)) {
      cerrarParrafo();
      const codigo: string[] = [];
      for (i++; i < lineas.length && !/^\s*```/.test(lineas[i]); i++) codigo.push(lineas[i]);
      bloques.push({ tipo: 'codigo', lineas: codigo });
    } else if (!linea.trim() || /^\s*(?:[-*_]\s*){3,}$/.test(linea)) {
      cerrarParrafo(); // línea vacía o separador horizontal
    } else if ((m = linea.match(/^\s*(#{1,6})\s+(.*)$/))) {
      cerrarParrafo();
      bloques.push({ tipo: 'titulo', nivel: m[1].length, segmentos: segmentos(m[2].replace(/\s*#+\s*$/, '')) });
    } else if (/^\s*\|/.test(linea)) {
      cerrarParrafo();
      const filas: string[][] = [];
      for (; i < lineas.length && /^\s*\|/.test(lineas[i]); i++) if (!esSeparadorTabla(lineas[i])) filas.push(celdas(lineas[i]));
      i--;
      bloques.push({ tipo: 'tabla', filas });
    } else if ((m = linea.match(/^\s*[-*+]\s+(.*)$/))) {
      cerrarParrafo();
      bloques.push({ tipo: 'vineta', nivel, segmentos: segmentos(m[1]) });
    } else if ((m = linea.match(/^\s*(\d+)[.)]\s+(.*)$/))) {
      cerrarParrafo();
      bloques.push({ tipo: 'numerada', nivel, numero: m[1], segmentos: segmentos(m[2]) });
    } else {
      parrafo.push(linea.trim());
    }
  }
  cerrarParrafo();
  return bloques;
}

// ---------------------------------------------------------------------------
// PDF (jsPDF): con saltos de página y negritas en títulos
// ---------------------------------------------------------------------------

// Las fuentes estándar de PDF solo cubren Latin-1 (WinAnsi): se sustituyen los símbolos que no lo están
const SUSTITUTOS: Record<string, string> = {
  '→': '->', '←': '<-', '≈': '~', '≥': '>=', '≤': '<=', '−': '-', '‑': '-', '✅': '[OK]', '❌': '[X]', '⚠': '(!)',
  ' ': ' ', ' ': ' ',
};
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function aWinAnsi(t: string): string {
  return [...t].map((c) => {
    if (c in SUSTITUTOS) return SUSTITUTOS[c];
    const code = c.codePointAt(0)!;
    return code < 256 || WINANSI_EXTRA.has(c) ? c : '';
  }).join('');
}

interface DocPdf {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  setFont(f: string, s: string): unknown;
  setFontSize(n: number): unknown;
  splitTextToSize(t: string, w: number): string[];
  text(t: string | string[], x: number, y: number, opciones?: { align?: 'left' | 'right' }): unknown;
  rect(x: number, y: number, w: number, h: number, estilo?: string): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(w: number): unknown;
  addPage(): unknown;
  getNumberOfPages(): number;
}

/** Celda numérica (monto, %, x, MWh): se alinea a la derecha. */
export const esCeldaNumerica = (t: string) =>
  /^[\s\-–+]*(?:USD|US\$|\$)?\s?\d[\d.,]*\s?(?:%|x|MWh|M|pp)?(?:\s?\/\s?MWh)?$/i.test(t.replace(/[  ]/g, ' ').trim());

/**
 * Anchos de columna proporcionales al texto más largo de cada una (con mínimo y máximo), que suman `ancho`.
 */
export function anchosColumnas(filas: string[][], ancho: number): number[] {
  const columnas = Math.max(...filas.map((f) => f.length));
  const largos = Array.from({ length: columnas }, (_, j) => Math.min(60, Math.max(4, ...filas.map((f) => (f[j] ?? '').length))));
  const total = largos.reduce((a, b) => a + b, 0);
  return largos.map((l) => (ancho * l) / total);
}

export function crearPdf<D extends DocPdf>(doc: D, titulo: string, bloques: Bloque[]): D {
  const margen = 15;
  const ancho = doc.internal.pageSize.getWidth() - 2 * margen;
  const alto = doc.internal.pageSize.getHeight();
  let y = margen + 5;

  const escribir = (texto: string, { tamano = 10.5, negrita = false, sangria = 0, antes = 0 } = {}) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal');
    doc.setFontSize(tamano);
    const interlineado = tamano * 0.45;
    y += antes;
    for (const renglon of doc.splitTextToSize(aWinAnsi(texto), ancho - sangria)) {
      if (y + interlineado > alto - margen) { doc.addPage(); y = margen + 5; }
      doc.text(renglon, margen + sangria, y);
      y += interlineado;
    }
  };

  // Tabla con bordes, encabezado sombreado (se repite en cada página) y números alineados a la derecha
  const tabla = (filas: string[][]) => {
    if (filas.length === 0) return;
    const anchos = anchosColumnas(filas, ancho);
    const tamano = 8.5, interlineado = tamano * 0.42, relleno = 1.5;
    const fila = (celdas: string[], encabezado: boolean) => {
      doc.setFont('helvetica', encabezado ? 'bold' : 'normal');
      doc.setFontSize(tamano);
      const lineas = anchos.map((w, j) => doc.splitTextToSize(aWinAnsi(celdas[j] ?? ''), w - 2 * relleno));
      const alto_ = Math.max(...lineas.map((l) => l.length)) * interlineado + 2 * relleno;
      return { lineas, alto: alto_, encabezado, celdas };
    };
    const dibujar = (f: ReturnType<typeof fila>) => {
      let x = margen;
      doc.setDrawColor(170, 178, 189);
      doc.setLineWidth(0.2);
      if (f.encabezado) { doc.setFillColor(226, 232, 240); doc.rect(margen, y, ancho, f.alto, 'F'); }
      doc.setFont('helvetica', f.encabezado ? 'bold' : 'normal');
      anchos.forEach((w, j) => {
        doc.rect(x, y, w, f.alto, 'S');
        const derecha = !f.encabezado && esCeldaNumerica(f.celdas[j] ?? '');
        doc.text(f.lineas[j], derecha ? x + w - relleno : x + relleno, y + relleno + interlineado * 0.8, { align: derecha ? 'right' : 'left' });
        x += w;
      });
      y += f.alto;
    };
    const encabezado = fila(filas[0], true);
    y += 2;
    if (y + encabezado.alto > alto - margen) { doc.addPage(); y = margen + 5; }
    dibujar(encabezado);
    for (const celdas of filas.slice(1)) {
      const f = fila(celdas, false);
      if (y + f.alto > alto - margen) { doc.addPage(); y = margen + 5; dibujar(fila(filas[0], true)); }
      dibujar(f);
    }
    y += 3;
  };

  escribir(titulo, { tamano: 14, negrita: true });
  y += 3;
  for (const b of bloques) {
    if (b.tipo === 'titulo') escribir(textoPlano(b.segmentos), { tamano: b.nivel <= 2 ? 13 : 11.5, negrita: true, antes: 3 });
    else if (b.tipo === 'parrafo') escribir(textoPlano(b.segmentos), { antes: 1.5 });
    else if (b.tipo === 'vineta') escribir(`•  ${textoPlano(b.segmentos)}`, { sangria: 4 + b.nivel * 5, antes: 0.5 });
    else if (b.tipo === 'numerada') escribir(`${b.numero}.  ${textoPlano(b.segmentos)}`, { sangria: 4 + b.nivel * 5, antes: 0.5 });
    else if (b.tipo === 'tabla') tabla(b.filas);
    else escribir(b.lineas.join('\n'), { tamano: 9, antes: 1.5 });
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Word (docx): títulos, párrafos, viñetas y negritas reales
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any */
export function crearDocx(docx: any, titulo: string, bloques: Bloque[]): any {
  const { Document, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, AlignmentType, ShadingType } = docx;
  const corridas = (s: Segmento[]) => s.map((p) => new TextRun({ text: p.texto, bold: p.negrita }));
  const niveles = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
  const hijos: any[] = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(titulo)] })];

  for (const b of bloques) {
    if (b.tipo === 'titulo') hijos.push(new Paragraph({ heading: niveles[Math.min(b.nivel, 4) - 1], children: corridas(b.segmentos) }));
    else if (b.tipo === 'parrafo') hijos.push(new Paragraph({ children: corridas(b.segmentos), spacing: { after: 120 } }));
    else if (b.tipo === 'vineta') hijos.push(new Paragraph({ bullet: { level: b.nivel }, children: corridas(b.segmentos) }));
    else if (b.tipo === 'numerada') hijos.push(new Paragraph({ indent: { left: 360 * (b.nivel + 1), hanging: 360 }, children: [new TextRun(`${b.numero}. `), ...corridas(b.segmentos)] }));
    else if (b.tipo === 'tabla') {
      // Anchos proporcionales al contenido (en twips, 9,000 ≈ ancho útil de la página), encabezado sombreado
      // y números alineados a la derecha
      const anchos = anchosColumnas(b.filas, 9000).map(Math.round);
      hijos.push(new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: anchos,
        rows: b.filas.map((f, i) => new TableRow({
          tableHeader: i === 0,
          children: anchos.map((w, j) => new TableCell({
            width: { size: w, type: WidthType.DXA },
            ...(i === 0 ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'E2E8F0' } } : {}),
            children: [new Paragraph({
              alignment: i > 0 && esCeldaNumerica(f[j] ?? '') ? AlignmentType.RIGHT : AlignmentType.LEFT,
              children: [new TextRun({ text: f[j] ?? '', bold: i === 0, size: 18 })],
            })],
          })),
        })),
      }));
      hijos.push(new Paragraph({ children: [] }));
    } else hijos.push(...b.lineas.map((l) => new Paragraph({ children: [new TextRun({ text: l, font: 'Consolas', size: 18 })] })));
  }
  return new Document({ sections: [{ children: hijos }] });
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Excel (xlsx): una fila por línea de la respuesta y cada tabla en su propia hoja
// ---------------------------------------------------------------------------

const NOMBRE_TIPO: Record<Bloque['tipo'], string> = { titulo: 'Título', parrafo: 'Párrafo', vineta: 'Viñeta', numerada: 'Lista', tabla: 'Tabla', codigo: 'Código' };

export function filasExcel(bloques: Bloque[]): (string | number)[][] {
  const filas: (string | number)[][] = [['Tipo', 'Nivel', 'Texto']];
  let tablas = 0;
  for (const b of bloques) {
    if (b.tipo === 'tabla') filas.push([NOMBRE_TIPO.tabla, '', `Ver hoja "Tabla ${++tablas}"`]);
    else if (b.tipo === 'codigo') b.lineas.forEach((l) => filas.push([NOMBRE_TIPO.codigo, '', l]));
    else if (b.tipo === 'numerada') filas.push([NOMBRE_TIPO.numerada, b.nivel + 1, `${b.numero}. ${textoPlano(b.segmentos)}`]);
    else filas.push([NOMBRE_TIPO[b.tipo], b.tipo === 'parrafo' ? '' : b.nivel + (b.tipo === 'vineta' ? 1 : 0), textoPlano(b.segmentos)]);
  }
  return filas;
}

/** Encabezado de hoja: negritas, fondo y texto blanco (mismo estilo que el análisis financiero). */
function estiloEncabezado(fila: Row) {
  fila.eachCell((c) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    c.alignment = { vertical: 'middle' };
  });
}

/**
 * Libro de la respuesta con ExcelJS: hoja "Respuesta" (una fila por línea) y una hoja por tabla, con el encabezado
 * con estilo e inmovilizado, columnas al ancho del texto (máx. 80 caracteres), filtros y cifras alineadas a la derecha.
 * Los valores se dejan como texto, tal como los escribió el asistente (con su unidad: "USD 28,731,461").
 */
export function crearLibro(excel: typeof ExcelJSNS, bloques: Bloque[]): Workbook {
  const libro = new excel.Workbook();
  libro.creator = 'AuraGrid';
  const hoja = libro.addWorksheet('Respuesta', { views: [{ state: 'frozen', ySplit: 1 }] });
  filasExcel(bloques).forEach((f) => hoja.addRow(f.map((v) => (v === '' ? null : v))));
  hoja.columns = [{ width: 10 }, { width: 6 }, { width: 110 }];
  hoja.getColumn(3).alignment = { wrapText: true, vertical: 'top' };
  estiloEncabezado(hoja.getRow(1));
  bloques.filter((b): b is Extract<Bloque, { tipo: 'tabla' }> => b.tipo === 'tabla').forEach((t, i) => {
    const hojaTabla = libro.addWorksheet(`Tabla ${i + 1}`, { views: [{ state: 'frozen', ySplit: 1 }] });
    t.filas.forEach((f) => hojaTabla.addRow(f));
    const columnas = Math.max(...t.filas.map((f) => f.length));
    hojaTabla.columns = Array.from({ length: columnas }, (_, j) => ({ width: Math.min(80, Math.max(8, ...t.filas.map((f) => (f[j] ?? '').length + 2))) }));
    hojaTabla.autoFilter = { from: { row: 1, column: 1 }, to: { row: t.filas.length, column: columnas } };
    estiloEncabezado(hojaTabla.getRow(1));
    t.filas.slice(1).forEach((f, k) => f.forEach((v, j) => {
      if (esCeldaNumerica(v ?? '')) hojaTabla.getCell(k + 2, j + 1).alignment = { horizontal: 'right' };
    }));
  });
  return libro;
}

// ---------------------------------------------------------------------------
// MS Project (XML de MS Project, MSPDI): plan de entregables del proyecto
// ---------------------------------------------------------------------------

const ESTADOS: Record<string, string> = { pendiente: 'Pendiente', curso: 'En curso', completo: 'Completo', bloqueado: 'Bloqueado' };
const xml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export interface PlanMsProject {
  xml: string;
  tareas: number;
  /** Entregables sin fecha compromiso: no se pueden programar y no se incluyen. */
  sinFecha: string[];
}

/**
 * Cada frente es una tarea resumen y cada entregable un hito en su fecha compromiso (la app no guarda fechas
 * de inicio ni duraciones). % completado: 100 si está completo, 0 en otro caso. Al final, el hito "RTB objetivo".
 * - Fechas: cada hito lleva la restricción "Debe comenzar el" (ConstraintType 2) en su fecha; sin ella, MS Project
 *   programa automáticamente los hitos al inicio del proyecto y se perderían las fechas compromiso.
 * - Responsables: cada responsable distinto es un recurso, asignado a sus entregables; también va en las notas.
 * - Dependencias: la app aún no las guarda (ROADMAP, "Dependencias entre entregables"), así que no se exportan.
 * Los elementos siguen el orden del esquema MSPDI (MS Project rechaza o ignora los que van fuera de orden).
 */
export function planMsProject(proyecto: { nombre: string; fechaRtb: string | null }, frentes: Frente[]): PlanMsProject {
  const sinFecha: string[] = [];
  const tareas: string[] = [];
  const recursos = new Map<string, number>(); // responsable → UID del recurso
  const asignaciones: string[] = [];
  let uid = 0;
  let nivel1 = 0;
  const fechas: string[] = [];
  const momento = (d: string) => `${d}T08:00:00`;
  const etiquetas = (campos: Record<string, string | number | undefined>) =>
    Object.entries(campos).filter(([, v]) => v !== undefined).map(([k, v]) => `<${k}>${typeof v === 'string' ? xml(v) : v}</${k}>`).join('');
  // Orden del esquema MSPDI para <Task>
  const tarea = (c: {
    Name: string; OutlineNumber: string; OutlineLevel: number; Start: string; Finish: string; Milestone: 0 | 1; Summary: 0 | 1;
    PercentComplete: number; ConstraintDate?: string; Notes?: string;
  }) => {
    uid += 1;
    const hito = c.Milestone === 1;
    tareas.push(`<Task>${etiquetas({
      UID: uid, ID: uid, Name: c.Name, OutlineNumber: c.OutlineNumber, OutlineLevel: c.OutlineLevel,
      Start: c.Start, Finish: c.Finish, Duration: hito ? 'PT0H0M0S' : undefined, DurationFormat: hito ? 7 : undefined,
      Milestone: c.Milestone, Summary: c.Summary, PercentComplete: c.PercentComplete,
      ConstraintType: c.ConstraintDate ? 2 : undefined, ConstraintDate: c.ConstraintDate, Notes: c.Notes,
    })}</Task>`);
    return uid;
  };

  frentes.forEach((f) => {
    const conFecha = f.items.filter((i) => {
      if (!i[3]) sinFecha.push(i[0]);
      return Boolean(i[3]);
    });
    if (conFecha.length === 0) return;
    nivel1 += 1;
    const ordenadas = conFecha.map((i) => i[3]!).sort();
    fechas.push(...ordenadas);
    const completos = conFecha.filter((i) => i[1] === 'completo').length;
    tarea({
      Name: f.nombre, OutlineNumber: `${nivel1}`, OutlineLevel: 1, Milestone: 0, Summary: 1,
      Start: momento(ordenadas[0]), Finish: momento(ordenadas[ordenadas.length - 1]),
      PercentComplete: Math.round((completos / conFecha.length) * 100),
    });
    conFecha.forEach((i, j) => {
      const responsable = (i[2] ?? '').trim();
      const id = tarea({
        Name: i[0], OutlineNumber: `${nivel1}.${j + 1}`, OutlineLevel: 2, Milestone: 1, Summary: 0,
        Start: momento(i[3]!), Finish: momento(i[3]!), PercentComplete: i[1] === 'completo' ? 100 : 0,
        ConstraintDate: momento(i[3]!),
        Notes: `Estado: ${ESTADOS[i[1]] ?? i[1]}. Responsable: ${responsable || 'sin responsable'}. Fecha compromiso de AuraGrid.`,
      });
      if (responsable) {
        if (!recursos.has(responsable)) recursos.set(responsable, recursos.size + 1);
        asignaciones.push(`<Assignment>${etiquetas({ UID: asignaciones.length + 1, TaskUID: id, ResourceUID: recursos.get(responsable) })}</Assignment>`);
      }
    });
  });
  if (proyecto.fechaRtb) {
    fechas.push(proyecto.fechaRtb);
    tarea({
      Name: 'RTB objetivo', OutlineNumber: `${nivel1 + 1}`, OutlineLevel: 1, Milestone: 1, Summary: 0,
      Start: momento(proyecto.fechaRtb), Finish: momento(proyecto.fechaRtb), PercentComplete: 0, ConstraintDate: momento(proyecto.fechaRtb),
    });
  }
  const inicio = fechas.length ? [...fechas].sort()[0] : null;
  const contenido = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Project xmlns="http://schemas.microsoft.com/project">',
    `<Name>${xml(proyecto.nombre)}</Name>`,
    `<Title>${xml(`${proyecto.nombre} - entregables hacia RTB (AuraGrid)`)}</Title>`,
    '<ScheduleFromStart>1</ScheduleFromStart>',
    ...(inicio ? [`<StartDate>${momento(inicio)}</StartDate>`] : []),
    `<Tasks>${tareas.join('')}</Tasks>`,
    `<Resources>${[...recursos].map(([nombre, id]) => `<Resource>${etiquetas({ UID: id, ID: id, Name: nombre, Type: 1 })}</Resource>`).join('')}</Resources>`,
    `<Assignments>${asignaciones.join('')}</Assignments>`,
    '</Project>',
  ].join('\n');
  return { xml: contenido, tareas: uid, sinFecha };
}

/** Nombre de archivo seguro: "<proyecto>_cronograma.xml" (solo letras, números y guiones bajos). */
export function nombreArchivoMsProject(nombreProyecto: string): string {
  const base = (nombreProyecto || 'Proyecto').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '') || 'Proyecto';
  return `${base}_cronograma.xml`;
}

/** Archivo de MS Project listo para descargar: Blob de tipo application/xml con su nombre .xml. */
export function archivoMsProject(nombreProyecto: string, plan: PlanMsProject): { nombre: string; blob: Blob } {
  return { nombre: nombreArchivoMsProject(nombreProyecto), blob: new Blob([plan.xml], { type: 'application/xml;charset=utf-8' }) };
}
