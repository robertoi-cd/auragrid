// Respaldo de AuraGrid (solo lectura): exporta todas las tablas a JSON en respaldos/AAAA-MM-DD_HHmm/, con las cuentas
// de usuario y, con --con-archivos, los documentos del bucket aura-documentos. Conserva solo los 8 respaldos más
// recientes y borra los de más de 8 semanas (lo que promete el aviso de privacidad).
//
// Uso:    npm run respaldo                      (datos y cuentas)
//         npm run respaldo -- --con-archivos    (además, los PDF del bucket)
//
// Clave: la secreta de Supabase (Settings → API Keys → secret, o la service_role anterior). Se lee de la variable
// SUPABASE_SERVICE_ROLE_KEY o del archivo .env.respaldo de esta carpeta (una línea SUPABASE_SERVICE_ROLE_KEY=...).
// Nunca va en el repositorio: .env.respaldo y respaldos/ están en .gitignore. Da acceso total a la base: no la
// compartas ni la pongas en el código de la app.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SUPABASE_URL = 'https://vpsikmgnhubkydftahdl.supabase.co';
export const BUCKET = 'aura-documentos';
export const CONSERVAR = 8;
export const MAX_DIAS = 56; // 8 semanas
export const ARCHIVO_CLAVE = '.env.respaldo';
const POR_PAGINA = 1000;
// Tabla y vistas de PostGIS (sistema de coordenadas): no son de la app ni tienen datos de proyectos
const EXCLUIDAS = new Set(['spatial_ref_sys', 'geography_columns', 'geometry_columns']);
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** La clave secreta: de la variable de entorno o de .env.respaldo. Rechaza la publicable (no ve todos los datos). */
export function leerClave(env, textoArchivo) {
  let clave = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!clave && textoArchivo) clave = textoArchivo.match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*["']?([^"'\s]+)/m)?.[1];
  if (!clave) throw new Error(`Falta la clave secreta: define SUPABASE_SERVICE_ROLE_KEY o crea ${ARCHIVO_CLAVE} (ver README, "Respaldos").`);
  if (clave.startsWith('sb_publishable_')) throw new Error('Esa es la clave publicable; el respaldo necesita la secreta (sb_secret_… o service_role).');
  if (clave.startsWith('eyJ')) {
    let rol = null;
    try { rol = JSON.parse(Buffer.from(clave.split('.')[1], 'base64url').toString()).role; } catch { /* no es un JWT válido */ }
    if (rol !== 'service_role') throw new Error(`La clave es de rol "${rol ?? 'desconocido'}"; el respaldo necesita la service_role.`);
  }
  return clave;
}

/** Nombre de la carpeta del respaldo: AAAA-MM-DD_HHmm en hora local. */
export const nombreRespaldo = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

/**
 * Respaldos a borrar: todo lo que empieza con fecha (carpetas y archivos de pg_dump) salvo los `conservar` más
 * recientes, y también cualquiera de más de `maxDias` días. El que se acaba de crear nunca se borra.
 */
export function respaldosABorrar(nombres, hoy, actual, { conservar = CONSERVAR, maxDias = MAX_DIAS } = {}) {
  const fechados = nombres.filter((n) => /^\d{4}-\d{2}-\d{2}/.test(n)).sort().reverse();
  const limite = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - maxDias);
  return fechados.filter((n, i) => {
    if (n === actual) return false;
    const [a, m, d] = n.slice(0, 10).split('-').map(Number);
    return i >= conservar || new Date(a, m - 1, d) < limite;
  });
}

/** Tablas expuestas por la API (OpenAPI de PostgREST) con las columnas de su llave primaria, para paginar en orden. */
export function tablasDeOpenApi(spec) {
  return Object.keys(spec.paths ?? {})
    .filter((p) => p !== '/' && !p.startsWith('/rpc/'))
    .map((p) => p.slice(1))
    .filter((t) => !EXCLUIDAS.has(t))
    .sort()
    .map((t) => ({
      nombre: t,
      llave: Object.entries(spec.definitions?.[t]?.properties ?? {}).filter(([, c]) => c.description?.includes('<pk/>')).map(([n]) => n),
    }));
}

/** Todos los archivos del bucket (recorre las carpetas: cada proyecto tiene la suya). */
export async function listarArchivos(supabase, prefijo = '') {
  const archivos = [];
  for (let offset = 0; ; offset += POR_PAGINA) {
    const { data, error } = await supabase.storage.from(BUCKET).list(prefijo, { limit: POR_PAGINA, offset, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw new Error(`${BUCKET}/${prefijo}: ${error.message}`);
    for (const e of data) {
      const ruta = prefijo ? `${prefijo}/${e.name}` : e.name;
      if (e.id === null) archivos.push(...(await listarArchivos(supabase, ruta))); // carpeta
      else archivos.push({ ruta, bytes: e.metadata?.size ?? null, tipo: e.metadata?.mimetype ?? null, actualizado: e.updated_at });
    }
    if (data.length < POR_PAGINA) break;
  }
  return archivos;
}

/** Descarga cada archivo a destino/<ruta en el bucket>. */
export async function descargarArchivos(supabase, archivos, destino) {
  for (const a of archivos) {
    const { data, error } = await supabase.storage.from(BUCKET).download(a.ruta);
    if (error) throw new Error(`${BUCKET}/${a.ruta}: ${error.message}`);
    const archivo = path.join(destino, ...a.ruta.split('/'));
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, Buffer.from(await data.arrayBuffer()));
  }
}

async function main() {
  const conArchivos = process.argv.includes('--con-archivos');
  const rutaClave = path.join(RAIZ, ARCHIVO_CLAVE);
  const clave = leerClave(process.env, fs.existsSync(rutaClave) ? fs.readFileSync(rutaClave, 'utf8') : '');
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(SUPABASE_URL, clave, { auth: { persistSession: false, autoRefreshToken: false } });

  const destino = path.join(RAIZ, 'respaldos');
  const ahora = new Date();
  const nombre = nombreRespaldo(ahora);
  const final = path.join(destino, nombre);
  if (fs.existsSync(final)) throw new Error(`Ya existe ${final}; espera un minuto y vuelve a intentarlo.`);
  // Se escribe en una carpeta temporal y se renombra al final: un respaldo incompleto nunca cuenta como respaldo
  const carpeta = path.join(destino, `.${nombre}.parcial`);
  fs.mkdirSync(carpeta, { recursive: true });
  const escribir = (archivo, datos) => fs.writeFileSync(path.join(carpeta, archivo), JSON.stringify(datos, null, 1));

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/`, { headers: { apikey: clave, Authorization: `Bearer ${clave}`, Accept: 'application/openapi+json' } });
    if (!r.ok) throw new Error(`No se pudo leer la lista de tablas (HTTP ${r.status}). ¿La clave es la secreta de este proyecto?`);
    const tablas = tablasDeOpenApi(await r.json());

    const manifiesto = {
      fecha: ahora.toISOString(), proyecto: 'vpsikmgnhubkydftahdl',
      ultimaMigracionEnRepo: fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort().pop()?.slice(0, 14) ?? null,
      tablas: {}, usuarios: 0, archivos: null,
    };
    for (const { nombre: t, llave } of tablas) {
      const filas = [];
      for (let desde = 0; ; desde += POR_PAGINA) {
        let q = supabase.from(t).select('*');
        for (const c of llave) q = q.order(c, { ascending: true });
        const { data, error } = await q.range(desde, desde + POR_PAGINA - 1);
        if (error) throw new Error(`${t}: ${error.message}`);
        filas.push(...data);
        if (data.length < POR_PAGINA) break;
      }
      escribir(`${t}.json`, filas);
      manifiesto.tablas[t] = filas.length;
      console.log(`${t.padEnd(40)} ${String(filas.length).padStart(6)} filas`);
    }

    // Cuentas: para volver a invitar y reasignar owner_id / user_id si se restaura en otro proyecto
    const usuarios = [];
    for (let page = 1; ; page++) {
      const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: POR_PAGINA });
      if (error) throw new Error(`usuarios: ${error.message}`);
      usuarios.push(...data.users.map((u) => ({ id: u.id, email: u.email, creado: u.created_at, invitado: u.invited_at ?? null, ultimoAcceso: u.last_sign_in_at ?? null })));
      if (data.users.length < POR_PAGINA) break;
    }
    escribir('usuarios.json', usuarios);
    manifiesto.usuarios = usuarios.length;

    // Documentos: la lista siempre; los archivos, con --con-archivos
    const archivos = await listarArchivos(supabase);
    escribir('almacenamiento.json', archivos);
    manifiesto.archivos = { bucket: BUCKET, cantidad: archivos.length, descargados: conArchivos };
    if (conArchivos) await descargarArchivos(supabase, archivos, path.join(carpeta, 'archivos'));
    console.log(`${BUCKET}: ${archivos.length} archivos ${conArchivos ? 'descargados' : 'listados (para descargarlos: npm run respaldo -- --con-archivos)'}`);

    escribir('manifiesto.json', manifiesto);
    fs.renameSync(carpeta, final);
  } catch (e) {
    fs.rmSync(carpeta, { recursive: true, force: true });
    throw e;
  }

  // Conserva solo los 8 más recientes y ninguno de más de 8 semanas
  for (const n of respaldosABorrar(fs.readdirSync(destino), ahora, nombre)) {
    fs.rmSync(path.join(destino, n), { recursive: true, force: true });
    console.log(`Borrado el respaldo anterior ${n}`);
  }
  console.log(`Respaldo guardado en respaldos/${nombre}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`Error: ${e.message}`); process.exit(1); });
}
