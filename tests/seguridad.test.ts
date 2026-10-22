// Seguridad antes de publicar: acceso solo por invitación (sin registro en el login) y la migración de la auditoría
// (política abierta de solar_projects, vistas, funciones y spatial_ref_sys).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Acceso solo por invitación', () => {
  const login = fs.readFileSync('src/Login.jsx', 'utf8');
  test('el login no registra cuentas: sin signUp, sin "Regístrate"; dice que el acceso es por invitación', () => {
    assert.doesNotMatch(login, /signUp|isSignUp|Regístrate|registroAbierto/);
    assert.match(login, /export const NOTA_SOLO_INVITACION = 'El acceso es solo por invitación\. Si necesitas una cuenta, pide al dueño del proyecto que te invite\.'/);
    assert.match(login, /signInWithPassword/);
    assert.match(login, /resetPasswordForEmail/);
  });
  test('ninguna pantalla crea cuentas desde el navegador', () => {
    const archivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? archivos(`${dir}/${e.name}`) : /\.(jsx?|tsx?)$/.test(e.name) ? [`${dir}/${e.name}`] : []));
    for (const f of archivos('src')) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /auth\.signUp\(|auth\.admin\./, f);
  });
});

describe('Migración de seguridad (auditoría del 19 oct 2026)', () => {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => /_seguridad_antes_de_publicar\.sql$/.test(x))!;
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  test('fecha posterior a 20261024100000', () => assert.ok(archivo.slice(0, 14) > '20261024100000'));
  test('quita la política abierta de solar_projects', () => {
    assert.match(sql, /drop policy if exists "Permitir acceso total a usuarios autenticados" on public\.solar_projects;/);
  });
  test('quita el acceso a las vistas y funciones del prototipo y la escritura en spatial_ref_sys', () => {
    assert.match(sql, /revoke select on public\.vw_pending_client_alerts, public\.vw_project_commercial_financial_profile, public\.vw_regulatory_audit_summary\s+from anon, authenticated;/);
    for (const f of ['calculate_project_financials', 'evaluate_construction_cash_flows', 'evaluate_equity_cash_flow_gap', 'fn_get_project_financial_rules']) assert.ok(sql.includes(`public.${f}(uuid)`), f);
    assert.match(sql, /from public, anon, authenticated;/);
    assert.match(sql, /revoke insert, update, delete, truncate on public\.spatial_ref_sys from anon, authenticated/);
  });
  test('no cambia tablas ni datos', () => {
    assert.doesNotMatch(sql, /alter table|drop table|drop view|drop function|insert into|update public|delete from/i);
  });
});
