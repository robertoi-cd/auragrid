// Respaldo (npm run respaldo): clave secreta solo local, todas las tablas, documentos con --con-archivos y rotación
// (8 más recientes, ninguno de más de 8 semanas, como promete el aviso de privacidad).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
// @ts-expect-error respaldo es JavaScript (sin declaración de tipos)
import { leerClave, nombreRespaldo, respaldosABorrar, tablasDeOpenApi, listarArchivos, descargarArchivos, CONSERVAR, MAX_DIAS, ARCHIVO_CLAVE } from '../scripts/respaldo.mjs';

const jwt = (rol: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: rol })).toString('base64url')}.firma`;

describe('Clave secreta', () => {
  test('de la variable de entorno o de .env.respaldo; la variable tiene prioridad', () => {
    assert.equal(leerClave({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc' }, ''), 'sb_secret_abc');
    assert.equal(leerClave({}, '# respaldo\nSUPABASE_SERVICE_ROLE_KEY="sb_secret_xyz"\n'), 'sb_secret_xyz');
    assert.equal(leerClave({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_env' }, 'SUPABASE_SERVICE_ROLE_KEY=sb_secret_archivo'), 'sb_secret_env');
    assert.equal(leerClave({}, `SUPABASE_SERVICE_ROLE_KEY=${jwt('service_role')}`), jwt('service_role'));
  });
  test('sin clave, con la publicable o con un JWT que no es service_role: error claro', () => {
    assert.throws(() => leerClave({}, ''), /Falta la clave secreta/);
    assert.throws(() => leerClave({ SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abc' }, ''), /clave publicable/);
    assert.throws(() => leerClave({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }, ''), /rol "anon"/);
  });
  test('nunca en el repositorio: .env.respaldo y respaldos/ ignorados; ninguna clave secreta en los archivos versionados', () => {
    assert.equal(ARCHIVO_CLAVE, '.env.respaldo');
    assert.match(fs.readFileSync('.gitignore', 'utf8'), /^\.env\.respaldo$/m);
    for (const f of ['.env.respaldo', 'respaldos/2026-01-01_0000/solar_projects.json']) assert.equal(execSync(`git check-ignore -q "${f}" && echo si || echo no`, { encoding: 'utf8' }).trim(), 'si', f);
    const versionados = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter((f) => f && fs.existsSync(f) && !/\.(png|xlsx|pdf|docx|lock)$/.test(f));
    for (const f of versionados) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /sb_secret_[A-Za-z0-9_-]{20,}/, f);
  });
  test('npm run respaldo', () => {
    assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).scripts.respaldo, 'node scripts/respaldo.mjs');
  });
});

describe('Tablas', () => {
  test('todas las de la API salvo las de PostGIS; sin funciones; con la llave primaria para paginar en orden', () => {
    const spec = {
      paths: { '/': {}, '/solar_projects': {}, '/project_loans': {}, '/rpc/puede_ver': {}, '/spatial_ref_sys': {}, '/geometry_columns': {}, '/geography_columns': {} },
      definitions: {
        solar_projects: { properties: { id: { description: 'Note:\nThis is a Primary Key.<pk/>' }, name: {} } },
        project_loans: { properties: { project_id: { description: '<pk/>' }, orden: { description: '<pk/>' }, banco: {} } },
      },
    };
    assert.deepEqual(tablasDeOpenApi(spec), [{ nombre: 'project_loans', llave: ['project_id', 'orden'] }, { nombre: 'solar_projects', llave: ['id'] }]);
  });
});

describe('Rotación', () => {
  const hoy = new Date(2026, 11, 20, 10, 0);
  test('nombre AAAA-MM-DD_HHmm', () => {
    assert.equal(nombreRespaldo(new Date(2026, 0, 5, 9, 7)), '2026-01-05_0907');
  });
  test('conserva los 8 más recientes', () => {
    assert.equal(CONSERVAR, 8);
    const nombres = Array.from({ length: 10 }, (_, i) => `2026-12-${String(10 + i).padStart(2, '0')}_0900`);
    assert.deepEqual(respaldosABorrar(nombres, hoy, '2026-12-19_0900').sort(), ['2026-12-10_0900', '2026-12-11_0900']);
  });
  test('borra los de más de 8 semanas aunque haya menos de 8 (si se respalda poco)', () => {
    assert.equal(MAX_DIAS, 56);
    assert.deepEqual(respaldosABorrar(['2026-10-24_0900', '2026-10-25_0900', '2026-12-20_1000'], hoy, '2026-12-20_1000'), ['2026-10-24_0900']);
  });
  test('incluye los manuales y los de pg_dump con fecha; no toca lo demás ni el respaldo recién creado', () => {
    const nombres = ['2026-10-19_antes_seguridad', '2026-10-01_completo.dump', '.2026-12-20_1000.parcial', 'notas.txt', '2026-12-20_1000'];
    assert.deepEqual(respaldosABorrar(nombres, hoy, '2026-12-20_1000').sort(), ['2026-10-01_completo.dump', '2026-10-19_antes_seguridad']);
    assert.deepEqual(respaldosABorrar(['2026-01-01_0000'], hoy, '2026-01-01_0000'), []);
  });
});

describe('Documentos del bucket (--con-archivos)', () => {
  // Bucket simulado: una carpeta por proyecto, con subcarpetas
  const contenido: Record<string, string> = { 'alpha/entregables/acta.pdf': 'PDF-1', 'alpha/garantias/fianza.pdf': 'PDF-2', 'beta/permiso.pdf': 'PDF-3' };
  const supabase = {
    storage: {
      from: () => ({
        list: async (prefijo: string) => {
          const hijos = new Map<string, boolean>();
          for (const r of Object.keys(contenido)) {
            if (prefijo && !r.startsWith(`${prefijo}/`)) continue;
            const resto = prefijo ? r.slice(prefijo.length + 1) : r;
            const [primero, ...mas] = resto.split('/');
            hijos.set(primero, mas.length > 0);
          }
          return { data: [...hijos].map(([name, carpeta]) => (carpeta ? { name, id: null } : { name, id: name, metadata: { size: 5, mimetype: 'application/pdf' }, updated_at: '2026-10-19' })), error: null };
        },
        download: async (ruta: string) => ({ data: new Blob([contenido[ruta]]), error: null }),
      }),
    },
  };
  test('recorre las carpetas y descarga cada archivo con su ruta', async () => {
    const archivos = await listarArchivos(supabase);
    assert.deepEqual(archivos.map((a: { ruta: string }) => a.ruta).sort(), Object.keys(contenido).sort());
    const destino = fs.mkdtempSync(path.join(os.tmpdir(), 'respaldo-'));
    try {
      await descargarArchivos(supabase, archivos, destino);
      for (const [r, texto] of Object.entries(contenido)) assert.equal(fs.readFileSync(path.join(destino, ...r.split('/')), 'utf8'), texto, r);
    } finally {
      fs.rmSync(destino, { recursive: true, force: true });
    }
  });
});
