// CORS de gemini-proxy: lista blanca desde el secreto ORIGENES_PERMITIDOS, sin comodines, con Vary: Origin.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { origenesPermitidos, cabecerasCors, ORIGEN_LOCAL } from '../supabase/functions/_shared/cors';

const PROD = 'https://auragrid.example.com';

describe('Lista blanca de orígenes', () => {
  test('del secreto: sin espacios ni "/" final, sin repetidos', () => {
    assert.deepEqual(origenesPermitidos(` ${PROD}/ , http://localhost:5173,${PROD}`), [PROD, ORIGEN_LOCAL]);
  });
  test('sin secreto (o vacío), solo la app local', () => {
    assert.deepEqual(origenesPermitidos(undefined), [ORIGEN_LOCAL]);
    assert.deepEqual(origenesPermitidos(' , '), [ORIGEN_LOCAL]);
  });
  test('descarta comodines y valores que no son un origen http(s)', () => {
    assert.deepEqual(origenesPermitidos(`*, https://*.vercel.app, ${PROD}/ruta, ftp://x.mx, ${PROD}`), [PROD]);
    assert.deepEqual(origenesPermitidos('*'), [ORIGEN_LOCAL]);
  });
});

describe('Cabeceras por petición', () => {
  const lista = [PROD, ORIGEN_LOCAL];
  test('origen permitido: lo devuelve (no "*") con Vary: Origin', () => {
    const c = cabecerasCors(PROD, lista);
    assert.equal(c['Access-Control-Allow-Origin'], PROD);
    assert.equal(c.Vary, 'Origin');
    assert.equal(c['Access-Control-Allow-Headers'], 'authorization, x-client-info, apikey, content-type');
  });
  test('origen no permitido, vista previa de Vercel o sin Origin: sin Access-Control-Allow-Origin', () => {
    for (const o of ['https://malicioso.example', 'https://auragrid-optimization-abc123-equipo.vercel.app', `${PROD}.evil.com`, null]) {
      const c = cabecerasCors(o, lista);
      assert.equal('Access-Control-Allow-Origin' in c, false, String(o));
      assert.equal(c.Vary, 'Origin');
    }
  });
});

describe('gemini-proxy usa la lista blanca', () => {
  const proxy = fs.readFileSync('supabase/functions/gemini-proxy/index.ts', 'utf8');
  test('sin "*": cabeceras de cabecerasCors en todas las respuestas; preflight de otro origen con 403', () => {
    assert.doesNotMatch(proxy, /'Access-Control-Allow-Origin': '\*'/);
    assert.doesNotMatch(proxy, /corsHeaders/);
    assert.match(proxy, /cabecerasCors\(req\.headers\.get\('Origin'\), origenesPermitidos\(Deno\.env\.get\('ORIGENES_PERMITIDOS'\)\)\)/);
    assert.match(proxy, /status: permitido \? 200 : 403/);
    assert.match(proxy, /const respuesta = await atender\(req\)\r?\n\s+for \(const \[clave, valor\] of Object\.entries\(cors\)\) respuesta\.headers\.set\(clave, valor\)/);
  });
});
