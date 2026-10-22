// Estados financieros v1, fase 2 (pantallas): columna "devolución de capital variable", pestaña "Estados financieros"
// en Finanzas (tres estados, control del balance, caja atrapada y tres TIR con su explicación) y la TIR actual con su
// nombre nuevo, "flujo disponible".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
// @ts-expect-error react-dom sin declaración de tipos en el proyecto
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { Supuestos } from '../src/lib/rentabilidad';
import type { Credito } from '../src/lib/creditos';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { COLUMNAS, OPCIONALES, aSupuestos } from '../src/lib/supuestosApi';
// @ts-expect-error EstadosFinancieros es JSX (sin declaración de tipos)
import EstadosFinancieros, { explicacionTir, miles } from '../src/EstadosFinancieros';
// @ts-expect-error PestanasFinanzas es JSX (sin declaración de tipos)
import PestanasFinanzas, { vistaFinanzas } from '../src/PestanasFinanzas';
import { CAMPOS_ESTADOS } from '../src/lib/camposSupuestos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const MIGRADO: Credito = { orden: 1, banco: null, participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, comisionNoDisposicionPct: null, estado: 'aprobado' };
const analizar = (extra: Partial<Supuestos> = {}) =>
  analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...(SUPUESTOS_ILUSTRATIVOS as Supuestos), ...extra }, creditos: [MIGRADO], calcularPrecioMinimo: false });
const pintar = (props: object) => renderToStaticMarkup(React.createElement(EstadosFinancieros, props));

describe('Columna devolucion_capital_variable', () => {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => /_devolucion_capital_variable\.sql$/.test(x))!;
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  test('migración posterior a 20261025110000: una columna booleana opcional, sin valor por defecto ni datos', () => {
    assert.ok(archivo.slice(0, 14) > '20261025110000');
    assert.match(sql, /alter table public\.project_financial_assumptions\s+add column if not exists devolucion_capital_variable boolean;/);
    assert.doesNotMatch(sql, /default|not null|update |insert |drop |create table|security definer/i);
  });
  test('supuestosApi: vacío = null (no), sí = true; en el historial con su etiqueta', () => {
    assert.equal(COLUMNAS.devolucionCapitalVariable, 'devolucion_capital_variable');
    assert.ok(OPCIONALES.has('devolucionCapitalVariable'));
    assert.equal(aSupuestos({}).devolucionCapitalVariable, null);
    assert.equal(aSupuestos({ devolucion_capital_variable: null }).devolucionCapitalVariable, null);
    assert.equal(aSupuestos({ devolucion_capital_variable: true }).devolucionCapitalVariable, true);
    assert.equal(aSupuestos({ devolucion_capital_variable: false }).devolucionCapitalVariable, false);
    assert.deepEqual(CAMPOS_ESTADOS, [['devolucionCapitalVariable', 'Devolución de capital variable', 'sí/no']]);
    assert.match(fs.readFileSync('src/HistorialCambios.jsx', 'utf8'), /\.\.\.CAMPOS_RIESGOS, \.\.\.CAMPOS_ESTADOS\]/);
  });
  test('editor de supuestos: sí / no / sin capturar (no)', () => {
    const fd = fs.readFileSync('src/FinancialDashboard.jsx', 'utf8');
    assert.match(fd, /Estados financieros \(opcional\)/);
    assert.match(fd, /<option value="">Sin capturar \(no\)<\/option>/);
    assert.match(fd, /if \(ETIQUETA_ESTADOS\[c\]\) return \[c, borrador\[c\] \?\? null\];/);
  });
});

describe('Pestaña "Estados financieros"', () => {
  const a = analizar();
  const html = pintar({ estados: a.estados, supuestos: a.supuestosConCreditos });
  test('las tres TIR con su nombre y la explicación de por qué difieren', () => {
    for (const t of ['TIR de equity (flujo disponible)', 'TIR de equity (dividendos y devolución de capital)', 'TIR de equity (solo dividendos)']) assert.ok(html.includes(t), t);
    assert.ok(html.includes('8.15 %') && html.includes('6.31 %'));
    const texto = explicacionTir(a.estados, null);
    assert.match(texto, /^La TIR de flujo disponible \(8\.15 %\) supone que toda la caja/);
    assert.match(texto, /solo dividendos es menor \(6\.31 %\)/);
    assert.match(texto, /devolución de capital variable/);
    assert.doesNotMatch(texto, /lock-up/);
    assert.match(explicacionTir(a.estados, 1.412), /Con el lock-up \(DSCR menor a 1\.41x\), esos años no se distribuye nada\./);
  });
  test('control del balance, caja atrapada y los tres estados', () => {
    assert.match(html, /Activo − pasivo − capital = 0 en los 31 cierres \(COD y años 1 a 30\)/);
    for (const s of ['caja-atrapada', 'estado-resultados', 'balance', 'flujo-efectivo', 'tres-tir', 'control-balance']) assert.ok(html.includes(`data-seccion="${s}"`), s);
    assert.ok(html.includes('Solo dividendos (supuesto)'));
    assert.ok(html.includes('Con devolución de capital'));
    // Balance de Alpha I en miles: activo total en la COD 48,847; activo fijo año 1 45,546
    assert.ok(html.includes('48,847') && html.includes('45,546'));
    // Las filas que no aplican (MMRA, IVA) no se muestran
    assert.doesNotMatch(html, /data-fila="MMRA"|data-fila="IVA por recuperar"|data-fila="Línea de IVA"/);
    assert.ok(html.includes('Alcance y limitaciones del modelo'));
  });
  test('con devolución de capital: el supuesto se marca y aparece la nota de la S.A.P.I.', () => {
    const b = analizar({ devolucionCapitalVariable: true });
    const h = pintar({ estados: b.estados, supuestos: b.supuestosConCreditos });
    assert.ok(h.includes('Con devolución de capital (supuesto)'));
    assert.ok(h.includes('S.A.P.I. de C.V.'));
  });
  test('lock-up: fila de años bloqueados', () => {
    const b = analizar({ dscrLockup: 1.412 });
    const h = pintar({ estados: b.estados, supuestos: b.supuestosConCreditos });
    assert.ok(h.includes('Lock-up (sin distribuciones)'));
  });
  test('solo lectura (sin botones: el lector ve lo mismo); sin rentabilidad, N/D con el motivo', () => {
    assert.doesNotMatch(html, /<button|<input|<select/);
    assert.match(pintar({ estados: null, motivo: 'Faltan supuestos de ingresos' }), /N\/D · Faltan supuestos de ingresos/);
  });
  test('miles de USD; los ceros como "–"', () => {
    assert.equal(miles(48_846_603), '48,847');
    assert.equal(miles(-2_218_985), '-2,219');
    assert.equal(miles(0.2), '–');
  });
});

describe('Pestañas de Finanzas y el nombre nuevo de la TIR', () => {
  test('?vista=estados abre la pestaña; lo demás, el modelo de siempre', () => {
    assert.equal(vistaFinanzas('?vista=estados'), 'estados');
    assert.equal(vistaFinanzas(''), 'modelo');
    assert.equal(vistaFinanzas('?vista=otra'), 'modelo');
    const h = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/proyectos/x/finanzas'] }, React.createElement(PestanasFinanzas, { vista: 'estados' })));
    assert.match(h, /<a aria-current="page"[^>]*href="\/proyectos\/x\/finanzas\?vista=estados"/);
    assert.match(h, /href="\/proyectos\/x\/finanzas"[^>]*>Modelo y financiamiento/);
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /finanzas: vistaFinanzas\(ubicacion\.search\) === 'estados'/);
    assert.match(app, /<EstadosFinancieros estados=\{estados\}/);
  });
  test('la TIR actual se llama "TIR de equity (flujo disponible)" en Finanzas, Resumen y escenarios; en las tarjetas de Inicio, etiqueta corta con el nombre completo en title y aria-label', () => {
    assert.match(fs.readFileSync('src/FinancialDashboard.jsx', 'utf8'), /<Kpi titulo="TIR de equity \(flujo disponible\)"/);
    assert.match(fs.readFileSync('src/lib/modulos.js', 'utf8'), /titulo: 'TIR de equity \(flujo disponible\)'/);
    assert.match(fs.readFileSync('src/TablaEscenarios.jsx', 'utf8'), /'TIR de equity \(flujo disponible\)'/);
    const inicio = fs.readFileSync('src/paginas/Inicio.jsx', 'utf8');
    assert.match(inicio, /<Indicador titulo="TIR de equity" nombreCompleto="TIR de equity \(flujo disponible\)" valor=/);
    assert.match(inicio, /title=\{nombreCompleto\} role=\{nombreCompleto \? 'group' : undefined\} aria-label=\{nombreCompleto\}>/);
    assert.doesNotMatch(inicio, /titulo="TIR de equity \(flujo disponible\)"/);
  });
});

describe('Tabla de escenarios (app): TIR de flujo disponible y nota', () => {
  test('encabezado y nota', () => {
    const t = fs.readFileSync('src/TablaEscenarios.jsx', 'utf8');
    assert.match(t, /'TIR de equity \(flujo disponible\)'/);
    assert.match(t, /\{NOTA_CONVENCION_ESCENARIOS\} \{NOTA_TIR_ESCENARIOS\}/);
    assert.match(fs.readFileSync('src/lib/escenarios.ts', 'utf8'), /NOTA_TIR_ESCENARIOS = 'Los escenarios usan el flujo disponible; ver Estados financieros para el efecto de dividendos y devolución de capital\.'/);
  });
});
