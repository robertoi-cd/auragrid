// Financiamiento con varios bancos, fase 2 (pantallas): tabla de créditos, datos de project_loans, historial, Inicio y
// la regla de que ninguna pantalla, exportación ni el asistente lee ni escribe las columnas en desuso de los supuestos
// (tasa_interes_pct y comision_estructuracion_pct).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { tarjetaProyecto } from '../src/lib/portafolio';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { describirCambio } from '../src/lib/historialCambios';
import { descripcionCreditos, condicionesPonderadas, financiamientoIndicativo, MENSAJE_INDICATIVO, type Credito } from '../src/lib/creditos';
import type { Supuestos } from '../src/lib/rentabilidad';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { COLUMNAS, COLUMNAS_SUPUESTOS, aSupuestos } from '../src/lib/supuestosApi';
// @ts-expect-error creditosApi es JavaScript (sin declaración de tipos)
import { aCredito, aFilaCredito, COLUMNAS_CREDITOS, ETIQUETAS_HISTORIAL_CREDITOS } from '../src/lib/creditosApi';
// @ts-expect-error TablaCreditos es JSX (sin declaración de tipos)
import { revisarCreditos, creditosDelBorrador, resumenCambiosCreditos } from '../src/TablaCreditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const credito = (orden: number, banco: string | null, p: number | null, r: number | null, c: number | null, estado: Credito['estado'] = 'aprobado', id?: string): Credito =>
  ({ id, orden, banco, participacionPct: p, tasaAnualPct: r, comisionEstructuracionPct: c, comisionNoDisposicionPct: null, estado });
const MIGRADO = credito(1, null, 100, 7, 1.5, 'aprobado', 'c1');

/** Todos los archivos de código de la app y de las funciones de Supabase (pantallas, exportaciones, asistente). */
function archivosDeCodigo(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return archivosDeCodigo(p);
    return /\.(jsx?|tsx?|mjs)$/.test(e.name) ? [p] : [];
  });
}

describe('Columnas en desuso: ninguna pantalla, exportación ni el asistente las lee ni las escribe', () => {
  const archivos = [...archivosDeCodigo('src'), ...archivosDeCodigo('supabase/functions')];
  test('tasa_interes_pct solo aparece como etiqueta de registros anteriores del historial', () => {
    const con = archivos.filter((f) => fs.readFileSync(f, 'utf8').includes('tasa_interes_pct'));
    assert.deepEqual(con.map((f) => f.replace(/\\/g, '/')), ['src/lib/creditosApi.js']);
    const texto = fs.readFileSync('src/lib/creditosApi.js', 'utf8');
    const lineas = texto.split('\n').filter((l) => l.includes('tasa_interes_pct'));
    assert.deepEqual(lineas.map((l) => l.trim()), ["tasa_interes_pct: 'Tasa de interés (%) (antes de los créditos)',"]);
    assert.ok(texto.indexOf('export const ETIQUETAS_HISTORIAL_CREDITOS') < texto.indexOf('tasa_interes_pct'));
  });
  test('comision_estructuracion_pct solo como columna de project_loans (creditosApi.js)', () => {
    const con = archivos.filter((f) => fs.readFileSync(f, 'utf8').includes('comision_estructuracion_pct'));
    assert.deepEqual(con.map((f) => f.replace(/\\/g, '/')), ['src/lib/creditosApi.js']);
  });
  test('supuestosApi: sin esas columnas en el mapeo ni en las consultas; sin select("*") de los supuestos', () => {
    assert.equal(COLUMNAS.tasaInteresPct, undefined);
    assert.equal(COLUMNAS.comisionEstructuracionPct, undefined);
    assert.doesNotMatch(COLUMNAS_SUPUESTOS, /tasa_interes_pct|comision_estructuracion_pct/);
    for (const f of archivos) {
      const t = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(t, /from\('project_financial_assumptions'\)\s*\.select\('\*'\)/, f);
    }
    // Aunque la fila trajera las columnas, no entran al modelo
    const s = aSupuestos({ tasa_interes_pct: 9, comision_estructuracion_pct: 2, ppa_precio_usd_mwh: 42 });
    assert.equal('tasaInteresPct' in s, false);
    assert.equal('comisionEstructuracionPct' in s, false);
  });
  test('"Editar supuestos" no edita la tasa ni la comisión (van en los créditos)', () => {
    const tablero = fs.readFileSync('src/FinancialDashboard.jsx', 'utf8');
    assert.match(tablero, /export const DE_CREDITOS = new Set\(\['tasaInteresPct', 'comisionEstructuracionPct'\]\)/);
    assert.match(tablero, /campos\.filter\(\(\[c\]\) => !DE_CREDITOS\.has\(c\)\)\.map\(\(\[c, texto, unidad, paso\]\)/);
    assert.match(tablero, /GRUPOS\.flatMap\(\(\[, campos\]\) => campos\.filter\(\(\[c\]\) => !DE_CREDITOS\.has\(c\)\)/);
  });
  test('el Excel y el asistente usan la tasa y las comisiones de los créditos', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /supuestos: supuestosConCreditos, rentabilidad,/);
    assert.match(app, /\{ etiqueta: 'Créditos de la deuda', valor: descripcionCreditos\(creditos, condicionesCreditos\) \}/);
    assert.match(app, /analizarProyecto\(\{ project, frentes, garantias, movimientos, supuestos, creditos,/);
    assert.match(app, /supuestos=\{supuestosConCreditos\}/);
  });
});

describe('Datos de project_loans', () => {
  test('fila ↔ crédito: vacío se conserva vacío (sin valores supuestos)', () => {
    const fila = { id: 'x', project_id: 'p', orden: 2, banco: null, participacion_pct: '40', tasa_anual_pct: '6.5', comision_estructuracion_pct: '1', comision_no_disposicion_pct: null, estado: null };
    const c = aCredito(fila);
    assert.deepEqual(c, { id: 'x', orden: 2, banco: null, participacionPct: 40, tasaAnualPct: 6.5, comisionEstructuracionPct: 1, comisionNoDisposicionPct: null, estado: null });
    assert.deepEqual(aFilaCredito({ ...c, banco: '  Banco Sur ', comisionNoDisposicionPct: 0 }),
      { banco: 'Banco Sur', participacion_pct: 40, tasa_anual_pct: 6.5, comision_estructuracion_pct: 1, comision_no_disposicion_pct: 0, estado: null });
    assert.equal(COLUMNAS_CREDITOS, 'id, project_id, orden, banco, participacion_pct, tasa_anual_pct, comision_estructuracion_pct, comision_no_disposicion_pct, estado, updated_at');
  });
  test('Inicio lee project_loans con las demás tablas (una consulta para todos los proyectos)', () => {
    const t = fs.readFileSync('src/lib/portafolioApi.js', 'utf8');
    assert.match(t, /supabase\.from\('project_loans'\)\.select\(COLUMNAS_CREDITOS\)\.in\('project_id', ids\)\.order\('orden'/);
    assert.match(t, /creditos: \(c\.get\(id\) \?\? \[\]\)\.map\(aCredito\),/);
  });
});

describe('Tabla de créditos: reglas al guardar', () => {
  const borrador = (cs: Partial<Credito>[]) => creditosDelBorrador(cs.map((c) => ({ banco: '', estado: '', participacionPct: '', tasaAnualPct: '', comisionEstructuracionPct: '', comisionNoDisposicionPct: '', ...c })));
  test('banco y estado obligatorios en un crédito nuevo', () => {
    assert.equal(revisarCreditos(borrador([{ participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, estado: 'aprobado' }]), []), 'Crédito 1 (banco sin capturar): captura el banco.');
    assert.equal(revisarCreditos(borrador([{ banco: 'Banco A', participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5 }]), []), 'Banco A: elige el estado.');
    assert.equal(revisarCreditos(borrador([{ banco: 'Banco A', participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, estado: 'aprobado' }]), []), '');
  });
  test('el crédito migrado sin banco se puede guardar sin él; un banco capturado no se puede borrar', () => {
    assert.equal(revisarCreditos(borrador([{ ...MIGRADO, banco: '', tasaAnualPct: 7.25 } as never]), [MIGRADO]), '');
    const conBanco = { ...MIGRADO, banco: 'Banco A' };
    assert.equal(revisarCreditos(borrador([{ ...conBanco, banco: '' } as never]), [conBanco]), 'Crédito 1 (banco sin capturar): captura el banco.');
  });
  test('rangos de la base de datos; 0 % válido en las comisiones; al menos un crédito', () => {
    const base = { banco: 'Banco A', participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, estado: 'aprobado' as const };
    assert.equal(revisarCreditos(borrador([{ ...base, participacionPct: 0 }]), []), 'Banco A: revisa "Participación" (mayor a 0 y hasta 100 %).');
    assert.equal(revisarCreditos(borrador([{ ...base, tasaAnualPct: 101 }]), []), 'Banco A: revisa "Tasa anual total" (0 a 100 %).');
    assert.equal(revisarCreditos(borrador([{ ...base, comisionEstructuracionPct: 0, comisionNoDisposicionPct: 0 }]), []), '');
    assert.equal(revisarCreditos([], [MIGRADO]), 'Debe haber al menos un crédito (la deuda senior necesita un prestamista).');
    // Participaciones que no suman 100 o una condición vacía se pueden guardar (el aviso dice que la TIR queda en N/D)
    assert.equal(revisarCreditos(borrador([{ ...base, participacionPct: 60 }, { ...base, banco: 'Banco B', participacionPct: 35 }]), []), '');
  });
  test('resumen de cambios antes de guardar', () => {
    const nuevos = creditosDelBorrador([
      { ...MIGRADO, banco: 'Banco Norte', participacionPct: '60' },
      { banco: 'Banco Sur', estado: 'en_revision', participacionPct: '40', tasaAnualPct: '6.5', comisionEstructuracionPct: '1', comisionNoDisposicionPct: '' },
    ]);
    assert.deepEqual(resumenCambiosCreditos(nuevos, [MIGRADO]), [
      'Crédito 1 (banco sin capturar): banco sin capturar → Banco Norte',
      'Banco Norte: participación 100.00 % → 60.00 %',
      'Alta: Banco Sur',
    ]);
    assert.deepEqual(resumenCambiosCreditos([], [MIGRADO]), ['Baja: Crédito 1 (banco sin capturar)']);
  });
  test('el lector solo ve la tabla (sin "Editar créditos")', () => {
    const t = fs.readFileSync('src/TablaCreditos.jsx', 'utf8');
    // Sin créditos no hay "Editar créditos" (abriría una tabla vacía): se usa "Agregar crédito indicativo"
    assert.match(t, /\{puedeEditar && projectId && !borrador && creditos\.length > 0 && <button type="button" style=\{boton\} onClick=\{editar\}>Editar créditos<\/button>\}/);
    assert.match(fs.readFileSync('src/FinancialDashboard.jsx', 'utf8'), /projectId=\{projectId\} puedeEditar=\{puedeEditar\} onGuardados=\{onCreditosGuardados\}/);
  });
});

describe('Historial de créditos', () => {
  const d = (va: string | null, vn: string) => describirCambio({ campo: 'supuesto', valorAnterior: va, valorNuevo: vn }, ETIQUETAS_HISTORIAL_CREDITOS);
  test('alta, baja y cambios con nombre legible', () => {
    assert.equal(d(null, 'credito=alta'), 'Crédito agregado');
    assert.equal(d('credito=alta', 'credito=baja'), 'Crédito eliminado');
    assert.equal(d('tasa_anual_pct=7', 'tasa_anual_pct=6.5'), 'Tasa anual total (%): 7 → 6.5');
    assert.equal(d('estado=en_revision', 'estado=aprobado'), 'Estado: En revisión → Aprobado');
    assert.equal(d('banco=', 'banco=Banco Norte'), 'Banco: — → Banco Norte');
    // Registros anteriores a los créditos (tasa en los supuestos)
    assert.equal(d('tasa_interes_pct=8', 'tasa_interes_pct=7'), 'Tasa de interés (%) (antes de los créditos): 8 → 7');
  });
});

describe('Inicio (tarjeta) y asistente con créditos', () => {
  const datos = (creditos?: Credito[]) => ({ frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: S, creditos, errores: {} });
  test('con el crédito migrado, la tarjeta da la misma TIR y DSCR que el tablero', () => {
    const t = tarjetaProyecto(ALPHA, datos([MIGRADO]), '2026-10-19');
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: S, creditos: [MIGRADO] });
    assert.equal(t.tirEquity, a.rentabilidad.tirEquity);
    assert.equal((t.tirEquity! * 100).toFixed(2), '8.15');
  });
  test('participaciones al 95 %: TIR en N/D y la tarjeta lo dice', () => {
    const t = tarjetaProyecto(ALPHA, datos([credito(1, 'A', 60, 7, 1.5), credito(2, 'B', 35, 7, 1.5)]), '2026-10-19');
    assert.equal(t.tirEquity, null);
    assert.ok(t.faltantes.includes('Créditos de la deuda incompletos: TIR y DSCR en N/D'));
  });
  test('sin créditos (proyecto nuevo): no se calcula con valores supuestos', () => {
    const t = tarjetaProyecto(ALPHA, datos([]), '2026-10-19');
    assert.equal(t.tirEquity, null);
  });
  test('texto para el asistente: créditos, tasa ponderada y estado', () => {
    const cs = [credito(1, 'Banco Norte', 60, 7, 1.5), credito(2, 'Banco Sur', 40, 6.5, 1, 'en_revision')];
    assert.equal(descripcionCreditos(cs, condicionesPonderadas(cs)),
      'Banco Norte: 60 % de la deuda, tasa 7 % anual, comisión de estructuración 1.5 %, aprobado; Banco Sur: 40 % de la deuda, tasa 6.5 % anual, comisión de estructuración 1 %, en revisión; tasa ponderada 6.8 %, comisión ponderada 1.3 %');
    assert.equal(descripcionCreditos([], null), 'Sin créditos capturados (la deuda no se calcula)');
  });
});

describe('Proyecto sin créditos y financiamiento indicativo', () => {
  test('sin créditos: el mensaje pedido y "Agregar crédito indicativo" (solo dueño y editor)', () => {
    const t = fs.readFileSync('src/TablaCreditos.jsx', 'utf8');
    assert.match(t, /export const SIN_CREDITOS = 'Agrega un crédito para calcular la deuda y la TIR \(puede ser indicativo\)\.';/);
    assert.match(t, /\{puedeEditar && projectId && <button type="button" style=\{botonPrimario\} onClick=\{agregarIndicativo\}>Agregar crédito indicativo<\/button>\}/);
  });
  test('"Por definir" y pendiente solo en el crédito indicativo; "+ Agregar crédito" llega vacío', () => {
    const t = fs.readFileSync('src/TablaCreditos.jsx', 'utf8');
    assert.equal(t.split("banco: 'Por definir'").length, 2, 'una sola vez: en agregarIndicativo');
    assert.match(t, /const agregarIndicativo = \(\) => \{\s*setBorrador\(\[\{ banco: 'Por definir', estado: 'pendiente',/);
    assert.match(t, /setBorrador\(\[\.\.\.borrador, \{ banco: '', estado: '', \.\.\./);
    // Se puede guardar con "Por definir" (es el banco que escribió el usuario)
    assert.equal(revisarCreditos(creditosDelBorrador([{ banco: 'Por definir', estado: 'pendiente', participacionPct: '100', tasaAnualPct: '8', comisionEstructuracionPct: '1.5', comisionNoDisposicionPct: '' }]), []), '');
  });
  test('indicativo: todos los créditos pendientes o sin banco definido', () => {
    assert.equal(financiamientoIndicativo([MIGRADO]), true, 'sin banco');
    assert.equal(financiamientoIndicativo([credito(1, 'Por definir', 100, 7, 1.5, 'aprobado')]), true);
    assert.equal(financiamientoIndicativo([credito(1, 'Banco Norte', 100, 7, 1.5, 'pendiente')]), true);
    assert.equal(financiamientoIndicativo([credito(1, 'Banco Norte', 60, 7, 1.5, 'aprobado'), credito(2, 'Por definir', 40, 7, 1.5, 'pendiente')]), false);
    assert.equal(financiamientoIndicativo([credito(1, 'Banco Norte', 100, 7, 1.5, 'en_revision')]), false);
    assert.equal(financiamientoIndicativo([]), false, 'sin créditos el aviso es otro');
    assert.equal(MENSAJE_INDICATIVO, 'Financiamiento indicativo: aún sin banco');
  });
  test('el aviso aparece en la tarjeta de Inicio y en el Resumen; no cambia las cifras', () => {
    const d = (cs: Credito[]) => ({ frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: S, creditos: cs, errores: {} });
    const ind = tarjetaProyecto(ALPHA, d([MIGRADO]), '2026-10-19');
    const def = tarjetaProyecto(ALPHA, d([{ ...MIGRADO, banco: 'Banco Norte' }]), '2026-10-19');
    assert.equal(ind.financiamientoIndicativo, true);
    assert.equal(def.financiamientoIndicativo, false);
    assert.equal(ind.tirEquity, def.tirEquity);
    assert.match(fs.readFileSync('src/paginas/Inicio.jsx', 'utf8'), /\{t\.financiamientoIndicativo && \(\s*<span data-indicativo="" [^>]*>\{MENSAJE_INDICATIVO\}<\/span>/);
    assert.match(fs.readFileSync('src/paginas/Resumen.jsx', 'utf8'), /\{indicativo && <span role="status" data-indicativo="" [^>]*>\{MENSAJE_INDICATIVO\}<\/span>\}/);
    assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /financiamientoIndicativo=\{financiamientoIndicativo\(creditos\)\}/);
  });
  test('ROADMAP: confidencialidad de los créditos en el asistente', () => {
    const r = fs.readFileSync('ROADMAP.md', 'utf8');
    const antes = r.indexOf('## Antes de clientes reales');
    assert.ok(antes > 0 && r.indexOf('El asistente recibe bancos, tasas y estados de los créditos: información comercial confidencial; requiere el plan pagado de Gemini antes de datos reales.') > antes);
  });
});
