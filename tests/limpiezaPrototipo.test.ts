// Limpieza de los objetos heredados del prototipo (migraciones 20261028100000 y 20261028110000): qué se borra y qué no.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/** La migración sin comentarios. */
function leerMigracion(sufijo: string) {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => x.endsWith(sufijo))!;
  assert.ok(archivo, sufijo);
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  return { archivo, sql };
}
/** Nombres (sin esquema) de una lista "drop <objeto> ... ;". */
const lista = (sql: string, patron: RegExp) => (sql.match(patron)?.[1] ?? '').split(',').map((s) => s.trim().replace(/^public\./, '')).filter(Boolean);

// Lo que usa la app (todo lo demás de public es del prototipo)
const TABLAS_DE_LA_APP = ['solar_projects', 'project_deliverables', 'project_guarantees', 'project_guarantee_renewals', 'project_cash_movements', 'project_financial_assumptions', 'project_change_log', 'assistant_messages', 'project_members', 'project_loans', 'deliverable_evidence', 'guarantee_evidence', 'project_access_log', 'project_export_log', 'asistente_uso', 'configuracion_asistente'];

describe('Migración A: limpiar_prototipo', () => {
  const { archivo, sql } = leerMigracion('_limpiar_prototipo.sql');
  const tablas = lista(sql, /drop table\s+([^;]+);/);
  test('posterior a 20261027100000; sin CASCADE, para que falle si algo depende de lo que se borra', () => {
    assert.ok(archivo.slice(0, 14) > '20261027100000');
    assert.doesNotMatch(sql, /cascade/i);
  });
  test('borra 37 tablas distintas y ninguna de las 16 de la app', () => {
    assert.equal(tablas.length, 37);
    assert.equal(new Set(tablas).size, 37);
    for (const t of TABLAS_DE_LA_APP) assert.ok(!tablas.includes(t), `no debe borrar ${t}`);
  });
  test('incluye las tablas de data room del prototipo (vacías; el módulo nuevo se diseñará con el modelo de permisos actual)', () => {
    for (const t of ['data_rooms', 'data_room_access_logs', 'data_room_documents', 'data_room_modules']) assert.ok(tablas.includes(t), t);
  });
  test('orden: tarea de cron, vistas, tablas y, al final, las 8 funciones (las de triggers solo después de las tablas)', () => {
    const iCron = sql.indexOf('cron.unschedule'), iVistas = sql.indexOf('drop view'), iTablas = sql.indexOf('drop table'), iFunciones = sql.indexOf('drop function');
    assert.ok(0 <= iCron && iCron < iVistas && iVistas < iTablas && iTablas < iFunciones);
    assert.equal(lista(sql, /drop view if exists\s+([^;]+);/).length, 3);
    const funciones = lista(sql, /drop function if exists\s+([^;]+);/);
    assert.equal(funciones.length, 8);
    for (const f of ['fn_enforce_report_immutability()', 'fn_evaluate_grid_node_telemetry()', 'fn_log_report_evolution()', 'calculate_project_financials(uuid)']) assert.ok(funciones.includes(f), f);
  });
  test('desprograma solo la tarea del prototipo; delete-unverified-users se conserva', () => {
    assert.equal((sql.match(/cron\.unschedule\('([^']+)'\)/g) ?? []).length, 1);
    assert.match(sql, /jobname = 'refresh-regulatory-audit-view'/);
    assert.doesNotMatch(sql, /delete-unverified-users/);
  });
  test('no toca ninguna función ni política de la app', () => {
    assert.doesNotMatch(sql, /puede_ver|puede_editar|es_dueno|rol_en_proyecto|drop policy|alter table/i);
  });
});

describe('Migración B: retirar_postgis', () => {
  const { archivo, sql } = leerMigracion('_retirar_postgis.sql');
  test('posterior a la A; solo borra la extensión PostGIS, sin CASCADE', () => {
    assert.ok(archivo.slice(0, 14) > '20261028100000');
    assert.equal(sql.trim(), 'drop extension if exists postgis;');
  });
});
