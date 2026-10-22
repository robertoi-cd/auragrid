// Pruebas de las descargas del asistente: Markdown → PDF, Word y Excel, y plan de entregables → MS Project.
// Los archivos se generan de verdad con las mismas librerías que usa la app.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import * as docx from 'docx';
import ExcelJS from 'exceljs';
import type { Worksheet } from 'exceljs';

/** Filas de una hoja como texto (celdas vacías como ''), sin las filas vacías del final. */
const filasDe = (ws: Worksheet) => {
  const filas: (string | number)[][] = [];
  ws.eachRow((r) => { filas.push((r.values as (string | number | null)[]).slice(1).map((v) => v ?? '')); });
  return filas;
};
import JSZip from 'jszip';
import {
  bloquesMarkdown, segmentos, textoPlano, aWinAnsi, crearPdf, crearDocx, crearLibro, filasExcel, planMsProject,
  esCeldaNumerica, anchosColumnas, archivoMsProject, nombreArchivoMsProject, type Bloque,
} from '../src/lib/exportarRespuesta';
import { descargarBlob, type DocumentoDescarga } from '../src/lib/descargar';
import fs from 'node:fs';
import type { Frente } from '../src/lib/validaciones';
import { FRENTES_INICIALES } from '../src/lib/datosProyecto.js';

const RESPUESTA = `## Riesgos prioritarios

Hay **2 alertas críticas** activas. Revisa *primero* la \`fianza\` y el [portal](https://ejemplo.com).

1. **Resolutivo de MIA**: bloqueado.
2. Fianza CENACE → renovar.
   - Responsable: Afianzadora
- Viñeta suelta

| Concepto | Monto |
|---|---|
| CAPEX | USD 46,500,000 |
| Deuda | USD 28,731,461 |

---
Párrafo final
en dos líneas.`;

describe('Markdown → bloques', () => {
  const b = bloquesMarkdown(RESPUESTA);
  test('reconoce título, párrafo, listas, tabla y párrafo final', () => {
    assert.deepEqual(b.map((x) => x.tipo), ['titulo', 'parrafo', 'numerada', 'numerada', 'vineta', 'vineta', 'tabla', 'parrafo']);
  });
  test('título de nivel 2 sin los #', () => {
    assert.deepEqual(b[0], { tipo: 'titulo', nivel: 2, segmentos: [{ texto: 'Riesgos prioritarios', negrita: false }] });
  });
  test('negritas como tramos; cursiva, código y enlaces sin marcas', () => {
    const p = b[1] as Extract<typeof b[number], { tipo: 'parrafo' }>;
    assert.deepEqual(p.segmentos.filter((s) => s.negrita).map((s) => s.texto), ['2 alertas críticas']);
    assert.equal(textoPlano(p.segmentos), 'Hay 2 alertas críticas activas. Revisa primero la fianza y el portal (https://ejemplo.com).');
  });
  test('lista numerada conserva el número y la viñeta anidada su nivel', () => {
    assert.equal((b[2] as { numero: string }).numero, '1');
    assert.equal((b[4] as { nivel: number }).nivel, 1);
    assert.equal((b[5] as { nivel: number }).nivel, 0);
  });
  test('tabla sin la fila separadora', () => {
    assert.deepEqual((b[6] as { filas: string[][] }).filas, [['Concepto', 'Monto'], ['CAPEX', 'USD 46,500,000'], ['Deuda', 'USD 28,731,461']]);
  });
  test('líneas seguidas se unen en un párrafo; el separador --- no aparece', () => {
    assert.equal(textoPlano((b[7] as Extract<Bloque, { tipo: 'parrafo' }>).segmentos), 'Párrafo final en dos líneas.');
  });
  test('bloque de código se conserva línea por línea', () => {
    assert.deepEqual(bloquesMarkdown('```\nlinea 1\n  linea 2\n```'), [{ tipo: 'codigo', lineas: ['linea 1', '  linea 2'] }]);
  });
  test('texto sin Markdown = un párrafo', () => assert.deepEqual(segmentos('hola'), [{ texto: 'hola', negrita: false }]));
});

describe('PDF', () => {
  test('acentos y ñ se conservan; símbolos fuera de Latin-1 se sustituyen o se quitan', () => {
    assert.equal(aWinAnsi('Año → 2027 ≥ 1.20x ✅ 🌍 «ok» • –'), 'Año -> 2027 >= 1.20x [OK]  «ok» • –');
  });
  test('una respuesta larga ocupa varias páginas (antes se cortaba en la primera)', () => {
    const largo = Array.from({ length: 120 }, (_, i) => `- Punto ${i + 1}: **texto** de prueba con acentos (garantía, señal).`).join('\n');
    const doc = crearPdf(new jsPDF(), 'AuraGrid · Alpha I', bloquesMarkdown(largo));
    assert.ok(doc.getNumberOfPages() >= 3, `páginas: ${doc.getNumberOfPages()}`);
  });
  test('la respuesta de ejemplo se genera sin errores y sin los ** en el texto', () => {
    const doc = crearPdf(new jsPDF({ compress: false }), 'AuraGrid', bloquesMarkdown(RESPUESTA));
    const salida = doc.output();
    assert.ok(!salida.includes('**'));
    assert.ok(salida.includes('Resolutivo de MIA'));
  });
});

describe('Tablas con formato (anexo y tablas de la respuesta)', () => {
  const filas = [['Dato', 'Valor'], ['Deuda (57.8 % de los usos)', 'USD 28,731,461'], ['TIR de equity (calculada)', '8.0 %'], ['Estructura seleccionada', 'Seguidor a un eje']];
  test('celdas numéricas (USD, %, x, MWh, /MWh) se alinean a la derecha; el texto no', () => {
    for (const t of ['USD 28,731,461', '8.0 %', '1.28x', '135,750 MWh', 'USD 51.24/MWh', '+0.6 pp']) assert.ok(esCeldaNumerica(t), t);
    for (const t of ['Seguidor a un eje', 'al menos USD 51.24/MWh (PPA actual)', 'N/D']) assert.ok(!esCeldaNumerica(t), t);
  });
  test('anchos de columna proporcionales al contenido que suman el ancho disponible', () => {
    const a = anchosColumnas(filas, 180);
    assert.ok(Math.abs(a.reduce((x, y) => x + y, 0) - 180) < 1e-9);
    assert.ok(a[0] > a[1]);
  });
  test('PDF: la tabla se dibuja con celdas (rectángulos), sin separar con "|"', () => {
    const md = `| ${filas[0].join(' | ')} |\n|---|---|\n` + filas.slice(1).map((f) => `| ${f.join(' | ')} |`).join('\n');
    const salida = crearPdf(new jsPDF({ compress: false }), 'AuraGrid', bloquesMarkdown(md)).output();
    assert.ok(!salida.includes('   |   '));
    assert.ok((salida.match(/ re\n/g) ?? []).length >= 8, 'se esperaban rectángulos de celda');
    assert.ok(salida.includes('Seguidor a un eje'));
  });
  test('PDF: una tabla larga repite el encabezado en la página nueva', () => {
    const largas = [['Dato', 'Valor'], ...Array.from({ length: 120 }, (_, i) => [`Fila ${i + 1}`, `USD ${i + 1},000`])];
    const md = `| Dato | Valor |\n|---|---|\n` + largas.slice(1).map((f) => `| ${f[0]} | ${f[1]} |`).join('\n');
    const doc = crearPdf(new jsPDF({ compress: false }), 'AuraGrid', bloquesMarkdown(md));
    assert.ok(doc.getNumberOfPages() >= 2);
    assert.ok((doc.output().match(/\(Dato\) Tj/g) ?? []).length >= doc.getNumberOfPages());
  });
  test('Word: encabezado sombreado que se repite, anchos por columna y números a la derecha', async () => {
    const md = `| Dato | Valor |\n|---|---|\n| Deuda | USD 28,731,461 |`;
    const buffer = await docx.Packer.toBuffer(crearDocx(docx, 'AuraGrid', bloquesMarkdown(md)));
    const xmlDoc = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    assert.match(xmlDoc, /<w:tblHeader\/>/);
    assert.match(xmlDoc, /w:fill="E2E8F0"/);
    assert.match(xmlDoc, /<w:gridCol w:w="\d+"\/>/);
    assert.match(xmlDoc, /<w:jc w:val="(right|end)"\/>[\s\S]*?USD 28,731,461/);
  });
  test('Excel: la hoja de la tabla tiene anchos por columna y filtros', () => {
    const libro = crearLibro(ExcelJS, bloquesMarkdown(`| Dato | Valor |\n|---|---|\n| Deuda (57.8 % de los usos) | USD 28,731,461 |`));
    const hoja = libro.getWorksheet('Tabla 1')!;
    assert.deepEqual(hoja.columns.map((c) => c.width), [28, 16]);
    assert.deepEqual(hoja.autoFilter, { from: { row: 1, column: 1 }, to: { row: 2, column: 2 } });
    // Encabezado con estilo e inmovilizado; cifras a la derecha
    assert.equal(hoja.getCell('A1').font?.bold, true);
    assert.equal((hoja.views[0] as { state: string }).state, 'frozen');
    assert.equal(hoja.getCell('B2').alignment?.horizontal, 'right');
  });
});

describe('Word', () => {
  test('títulos, negritas, viñetas y tabla reales en el .docx', async () => {
    const buffer = await docx.Packer.toBuffer(crearDocx(docx, 'AuraGrid · Alpha I', bloquesMarkdown(RESPUESTA)));
    const xmlDoc = await (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
    assert.match(xmlDoc, /w:pStyle w:val="Heading2"/);
    assert.match(xmlDoc, /<w:b\/>[\s\S]*?2 alertas críticas/);
    assert.match(xmlDoc, /<w:numPr>/); // viñetas
    assert.match(xmlDoc, /<w:tbl>/);
    assert.ok(!xmlDoc.includes('**'));
    // Párrafos separados (antes todo iba en uno solo)
    assert.ok((xmlDoc.match(/<w:p>|<w:p /g) ?? []).length >= 8);
  });
});

describe('Excel', () => {
  test('una fila por línea y cada tabla en su hoja', async () => {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(await crearLibro(ExcelJS, bloquesMarkdown(RESPUESTA)).xlsx.writeBuffer() as ArrayBuffer);
    assert.deepEqual(libro.worksheets.map((w) => w.name), ['Respuesta', 'Tabla 1']);
    const filas = filasDe(libro.getWorksheet('Respuesta')!);
    assert.deepEqual(filas[0], ['Tipo', 'Nivel', 'Texto']);
    assert.equal(filas.length, 9);
    const tabla = filasDe(libro.getWorksheet('Tabla 1')!);
    assert.deepEqual(tabla[1], ['CAPEX', 'USD 46,500,000']);
  });
  test('la lista numerada lleva su número', () => {
    assert.deepEqual(filasExcel(bloquesMarkdown('1. Uno'))[1], ['Lista', 1, '1. Uno']);
  });
});

describe('MS Project: plan de entregables', () => {
  const frentes = FRENTES_INICIALES as unknown as Frente[];
  const plan = planMsProject({ nombre: 'Alpha I', fechaRtb: '2027-03-31' }, frentes);
  test('7 frentes (resumen) + 20 entregables (hitos) + hito RTB = 28 tareas', () => {
    assert.equal(plan.tareas, 28);
    assert.equal((plan.xml.match(/<Task>/g) ?? []).length, 28);
    assert.deepEqual(plan.sinFecha, []);
  });
  test('cada entregable es un hito en su fecha compromiso (orden de elementos del esquema MSPDI), con estado y responsable en las notas', () => {
    assert.match(plan.xml, /<Name>Resolutivo de MIA<\/Name><OutlineNumber>2\.2<\/OutlineNumber><OutlineLevel>2<\/OutlineLevel><Start>2026-12-15T08:00:00<\/Start><Finish>2026-12-15T08:00:00<\/Finish><Duration>PT0H0M0S<\/Duration><DurationFormat>7<\/DurationFormat><Milestone>1<\/Milestone><Summary>0<\/Summary><PercentComplete>0<\/PercentComplete><ConstraintType>2<\/ConstraintType><ConstraintDate>2026-12-15T08:00:00<\/ConstraintDate><Notes>/);
    assert.match(plan.xml, /Estado: En curso\. Responsable: SEMARNAT\./);
  });
  test('fechas fijas: cada hito "Debe comenzar el" su fecha compromiso (MS Project no lo mueve al inicio)', () => {
    const hitos = plan.xml.match(/<Task>(?:(?!<\/Task>).)*<Milestone>1<\/Milestone>(?:(?!<\/Task>).)*<\/Task>/g) ?? [];
    assert.equal(hitos.length, 21); // 20 entregables + RTB
    for (const h of hitos) {
      const inicio = h.match(/<Start>([^<]+)<\/Start>/)![1];
      assert.ok(h.includes(`<ConstraintType>2</ConstraintType><ConstraintDate>${inicio}</ConstraintDate>`), h.slice(0, 120));
    }
    // Las tareas resumen no llevan restricción: MS Project las calcula con sus hitos
    assert.doesNotMatch(plan.xml, /<Summary>1<\/Summary>(?:(?!<\/Task>).)*<ConstraintType>/);
  });
  test('responsables como recursos asignados a sus entregables', () => {
    const recursos = [...plan.xml.matchAll(/<Resource><UID>(\d+)<\/UID><ID>\d+<\/ID><Name>([^<]+)<\/Name><Type>1<\/Type><\/Resource>/g)];
    const nombres = recursos.map((r) => r[2]);
    assert.ok(nombres.includes('SEMARNAT'));
    assert.equal(new Set(nombres).size, nombres.length, 'un recurso por responsable');
    const semarnat = recursos.find((r) => r[2] === 'SEMARNAT')![1];
    const mia = plan.xml.match(/<Task><UID>(\d+)<\/UID><ID>\d+<\/ID><Name>Resolutivo de MIA<\/Name>/)![1];
    assert.match(plan.xml, new RegExp(`<Assignment><UID>\\d+</UID><TaskUID>${mia}</TaskUID><ResourceUID>${semarnat}</ResourceUID></Assignment>`));
    // Sin responsable: sin asignación
    const p = planMsProject({ nombre: 'P', fechaRtb: null }, [{ nombre: 'F', items: [['X', 'curso', '', '2027-01-01']] }]);
    assert.match(p.xml, /<Resources><\/Resources>\n<Assignments><\/Assignments>/);
  });
  test('estructura del proyecto en el orden del esquema: Name, Title, ScheduleFromStart, StartDate, Tasks, Resources, Assignments', () => {
    const orden = ['<Name>', '<Title>', '<ScheduleFromStart>', '<StartDate>', '<Tasks>', '<Resources>', '<Assignments>'].map((e) => plan.xml.indexOf(e));
    assert.deepEqual([...orden].sort((a, b) => a - b), orden);
    assert.ok(orden.every((i) => i > 0));
  });
  test('numeración de esquema consecutiva aunque un frente no tenga fechas', () => {
    const p = planMsProject({ nombre: 'P', fechaRtb: '2027-06-01' }, [
      { nombre: 'Vacío', items: [['Sin fecha', 'pendiente', 'R', null]] },
      { nombre: 'Con fecha', items: [['Uno', 'curso', 'R', '2027-01-01']] },
    ]);
    assert.deepEqual([...p.xml.matchAll(/<OutlineNumber>([^<]+)<\/OutlineNumber>/g)].map((m) => m[1]), ['1', '1.1', '2']);
  });
  test('sin dependencias: la app no las guarda todavía, así que el XML no inventa ninguna', () => {
    assert.doesNotMatch(plan.xml, /<PredecessorLink>/);
  });
  test('% completado: 100 si está completo; el frente promedia sus entregables', () => {
    assert.match(plan.xml, /<Name>Contrato de arrendamiento a 30 años<\/Name>[\s\S]*?<PercentComplete>100<\/PercentComplete>/);
    assert.match(plan.xml, /<Name>Terreno<\/Name>[\s\S]*?<PercentComplete>100<\/PercentComplete>/);
  });
  test('hito "RTB objetivo" al final y el proyecto empieza en la fecha más temprana', () => {
    assert.match(plan.xml, /<Name>RTB objetivo<\/Name>[\s\S]*?<Start>2027-03-31T08:00:00<\/Start>/);
    assert.match(plan.xml, /<StartDate>2026-02-15T08:00:00<\/StartDate>/);
  });
  test('entregables sin fecha no se inventan: se omiten y se informan', () => {
    const p = planMsProject({ nombre: 'P', fechaRtb: null }, [{ nombre: 'F', items: [['Con fecha', 'curso', 'R', '2027-01-01'], ['Sin fecha', 'pendiente', 'R', null]] }]);
    assert.deepEqual(p.sinFecha, ['Sin fecha']);
    assert.equal(p.tareas, 2); // resumen + 1 hito
  });
  test('caracteres especiales escapados (XML válido)', () => {
    const p = planMsProject({ nombre: 'A & B <x>', fechaRtb: null }, [{ nombre: 'O&M', items: [['Contrato "EPC" <v2>', 'curso', 'R&D', '2027-01-01']] }]);
    assert.ok(p.xml.includes('<Name>A &amp; B &lt;x&gt;</Name>'));
    assert.ok(p.xml.includes('Contrato &quot;EPC&quot; &lt;v2&gt;'));
    assert.ok(!/&(?!amp;|lt;|gt;|quot;)/.test(p.xml));
  });
  test('sin entregables con fecha = 0 tareas', () => {
    assert.equal(planMsProject({ nombre: 'P', fechaRtb: null }, [{ nombre: 'F', items: [['X', 'pendiente', 'R', null]] }]).tareas, 0);
  });
});

describe('Descarga del archivo de MS Project (no debe salir como .html)', () => {
  const frentes = FRENTES_INICIALES as unknown as Frente[];
  const plan = planMsProject({ nombre: 'Alpha I', fechaRtb: '2027-03-31' }, frentes);
  const { nombre, blob } = archivoMsProject('Alpha I', plan);
  test('tipo application/xml, nunca text/html', () => {
    assert.equal(blob.type, 'application/xml;charset=utf-8');
    assert.doesNotMatch(blob.type, /html/);
  });
  test('nombre "<proyecto>_cronograma.xml"', () => {
    assert.equal(nombre, 'Alpha_I_cronograma.xml');
    assert.equal(nombreArchivoMsProject('Planta Ñandú / Fase 2'), 'Planta_Ñandú_Fase_2_cronograma.xml');
    assert.equal(nombreArchivoMsProject(''), 'Proyecto_cronograma.xml');
  });
  test('el contenido empieza con <?xml y contiene <Project', async () => {
    const texto = await blob.text();
    assert.ok(texto.startsWith('<?xml'), texto.slice(0, 40));
    assert.match(texto, /<Project xmlns="http:\/\/schemas\.microsoft\.com\/project">/);
    assert.doesNotMatch(texto, /<html|<!doctype/i);
  });
  test('la descarga se hace en el navegador: enlace con download y URL blob:, no una ruta del servidor', () => {
    const enlaces: Record<string, unknown>[] = [];
    const doc: DocumentoDescarga = {
      createElement: () => {
        const a = { href: '', download: '', rel: '', style: { display: '' }, clicks: 0, click() { this.clicks += 1; }, remove() {} };
        enlaces.push(a);
        return a;
      },
      body: { appendChild: () => null },
    };
    descargarBlob(blob, nombre, doc);
    assert.equal(enlaces.length, 1);
    assert.equal(enlaces[0].download, 'Alpha_I_cronograma.xml');
    assert.match(String(enlaces[0].href), /^blob:/);
    assert.equal(enlaces[0].clicks, 1);
  });
  test('rechaza un nombre sin extensión o un Blob sin tipo', () => {
    assert.throws(() => descargarBlob(blob, 'cronograma'), /extensión/);
    assert.throws(() => descargarBlob(new Blob(['x']), 'a.xml'), /tipo/);
  });
  test('ninguna descarga de la app usa file-saver ni rutas del servidor', () => {
    for (const archivo of ['src/WorkstreamsPanel.jsx', 'src/ExportarMsProject.jsx', 'src/AiAssistantChat.jsx']) {
      const codigo = fs.readFileSync(archivo, 'utf8');
      assert.doesNotMatch(codigo, /file-saver|saveAs\(/, archivo);
      assert.doesNotMatch(codigo, /href=["'`]\/[^"'`]*\.(xml|pdf|docx|xlsx)/, archivo);
    }
  });
});
