// Corrección del historial de créditos al borrar un proyecto en cascada (migración 20261025110000).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Corrección: borrar un proyecto con créditos (historial en cascada)', () => {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => /_historial_creditos_cascada\.sql$/.test(x))!;
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8');
  test('fecha posterior a 20261025100000; con la guarda del proyecto borrado en la baja; search_path y permisos', () => {
    assert.ok(archivo.slice(0, 14) > '20261025100000');
    const baja = sql.slice(sql.indexOf("elsif tg_op = 'DELETE' then"), sql.indexOf("'credito=baja'"));
    assert.match(baja, /if not exists \(select 1 from public\.solar_projects where id = old\.project_id\) then\s+return old;/);
    assert.match(sql, /security definer\nset search_path = public, pg_temp/);
    assert.match(sql, /revoke execute on function public\.registrar_cambio_credito\(\) from public, anon, authenticated;/);
  });
});
