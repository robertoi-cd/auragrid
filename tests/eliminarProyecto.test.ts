// Eliminar definitivamente un proyecto archivado: solo archivados y solo el dueño; confirmación con el nombre; primero
// los archivos del bucket (todas sus carpetas) y después el proyecto (cascada); si fallan los archivos, no se borra nada.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
// @ts-expect-error react-dom sin declaración de tipos en el proyecto
import { renderToStaticMarkup } from 'react-dom/server';
// @ts-expect-error eliminarProyecto es JavaScript (sin declaración de tipos)
import { eliminarProyectoDefinitivo, archivosDelProyecto, nombreCoincide, AVISO_ELIMINAR } from '../src/lib/eliminarProyecto.js';
// @ts-expect-error EliminarArchivado es JSX (sin declaración de tipos)
import EliminarArchivado from '../src/EliminarArchivado';

/** Supabase simulado: bucket con carpetas y un proyecto (archivado o no). Registra lo que se borra. */
function simulado({ archivado = true, archivos = ['p1/ent-1/acta.pdf', 'p1/ent-1/plano.pdf', 'p1/gar-1/fianza.pdf', 'otro/x.pdf'], falloBorrarArchivos = false, filasBorradas = 1 } = {}) {
  const bucket = new Set(archivos);
  const log: string[] = [];
  const supabase = {
    storage: {
      from: () => ({
        list: async (prefijo: string, { offset }: { offset: number }) => {
          const hijos = new Map<string, boolean>();
          for (const r of bucket) {
            if (!r.startsWith(`${prefijo}/`)) continue;
            const [primero, ...mas] = r.slice(prefijo.length + 1).split('/');
            hijos.set(primero, mas.length > 0);
          }
          const data = [...hijos].map(([name, carpeta]) => (carpeta ? { name, id: null } : { name, id: name })).slice(offset);
          return { data, error: null };
        },
        remove: async (rutas: string[]) => {
          if (falloBorrarArchivos) return { data: null, error: { message: 'fallo' } };
          for (const r of rutas) bucket.delete(r);
          log.push(`archivos:${rutas.length}`);
          return { data: rutas, error: null };
        },
      }),
    },
    from: (tabla: string) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'p1', is_archived: archivado }, error: null }) }) }),
      delete: () => ({ eq: (_c: string, id: string) => ({ eq: (c2: string, v2: boolean) => ({ select: async () => { log.push(`delete ${tabla} ${id} ${c2}=${v2}`); return { data: Array(filasBorradas).fill({ id }), error: null }; } }) }) }),
    }),
  };
  return { supabase, bucket, log };
}

describe('Eliminar un proyecto archivado', () => {
  test('lista todas las carpetas del proyecto (y solo las suyas)', async () => {
    const { supabase } = simulado();
    assert.deepEqual((await archivosDelProyecto(supabase, 'p1')).sort(), ['p1/ent-1/acta.pdf', 'p1/ent-1/plano.pdf', 'p1/gar-1/fianza.pdf']);
  });
  test('borra primero sus archivos y después el proyecto (solo si sigue archivado)', async () => {
    const { supabase, bucket, log } = simulado();
    assert.deepEqual(await eliminarProyectoDefinitivo(supabase, 'p1'), { archivos: 3 });
    assert.deepEqual([...bucket], ['otro/x.pdf']);
    assert.deepEqual(log, ['archivos:3', 'delete solar_projects p1 is_archived=true']);
  });
  test('un proyecto activo no se borra', async () => {
    const { supabase, log } = simulado({ archivado: false });
    await assert.rejects(eliminarProyectoDefinitivo(supabase, 'p1'), /Solo se pueden eliminar proyectos archivados/);
    assert.deepEqual(log, []);
  });
  test('si fallan los archivos, el proyecto no se borra', async () => {
    const { supabase, log } = simulado({ falloBorrarArchivos: true });
    await assert.rejects(eliminarProyectoDefinitivo(supabase, 'p1'), /El proyecto no se eliminó/);
    assert.ok(!log.some((l) => l.startsWith('delete')));
  });
  test('si RLS no deja borrar (no es el dueño), lo dice', async () => {
    const { supabase } = simulado({ filasBorradas: 0 });
    await assert.rejects(eliminarProyectoDefinitivo(supabase, 'p1'), /solo el dueño puede hacerlo/);
  });
});

describe('Confirmación', () => {
  test('acepta el nombre sin distinguir mayúsculas, acentos ni espacios a los lados o repetidos', () => {
    const aceptados: [string, string][] = [
      ['PRUEBA B', 'PRUEBA B'],
      ['prueba b', 'PRUEBA B'],
      ['Prueba B', 'PRUEBA  B'],          // el nombre guardado con dos espacios (se ve con uno)
      ['  prueba   b  ', 'PRUEBA B'],     // espacios a los lados y repetidos
      ['prueba\tb', 'PRUEBA B'],          // un tabulador cuenta como espacio
      ['bajio', 'Bajío'],
      ['BAJIO', 'Bajío'],
      ['bajío', 'Bajio'],                 // también al revés
      ['Parque Solar Bajío Norte', 'parque solar bajio  norte'],
      ['penasco', 'Peñasco'],             // la ñ cuenta como n
      ['Ünion', 'union'],
    ];
    for (const [escrito, nombre] of aceptados) assert.ok(nombreCoincide(escrito, nombre), `«${escrito}» debe aceptar «${nombre}»`);
  });
  test('exige el nombre completo', () => {
    const rechazados: [string, string][] = [
      ['prueba', 'PRUEBA B'],             // una parte no basta
      ['PRUEBA', 'PRUEBA A'],
      ['prueba a', 'PRUEBA B'],           // otro proyecto
      ['pruebab', 'PRUEBA B'],            // sin el espacio son otras palabras
      ['prueba b c', 'PRUEBA B'],         // de más
      ['bajio sur', 'Bajío'],
      ['', 'PRUEBA B'],
      ['   ', 'PRUEBA B'],
      ['', ''],                           // nunca con un nombre vacío
    ];
    for (const [escrito, nombre] of rechazados) assert.ok(!nombreCoincide(escrito, nombre), `«${escrito}» no debe aceptar «${nombre}»`);
  });
  test('el botón de eliminar queda desactivado hasta que el nombre coincida', () => {
    const pintar = (escrito: string) => renderToStaticMarkup(React.createElement(EliminarArchivado, {
      proyecto: { id: 'p1', name: 'PRUEBA  B' }, onEliminar: async () => {}, abiertoInicial: true, escritoInicial: escrito,
    }));
    const botonFinal = (html: string) => html.match(/<button[^>]*>Eliminar definitivamente<\/button>/)![0];
    for (const escrito of ['', 'prueba', 'PRUEBA A']) assert.match(botonFinal(pintar(escrito)), /disabled=""/, `«${escrito}»`);
    for (const escrito of ['prueba b', ' PRUEBA   B ']) assert.doesNotMatch(botonFinal(pintar(escrito)), /disabled/, `«${escrito}»`);
    // La confirmación abierta muestra el aviso y pide el nombre
    const html = pintar('');
    assert.match(html, /role="alertdialog"/);
    assert.ok(html.includes(AVISO_ELIMINAR));
  });
  test('aviso exacto', () => {
    assert.equal(AVISO_ELIMINAR, 'Se borrarán todos sus entregables, garantías, documentos, supuestos, créditos e historial. No se puede deshacer.');
  });
  test('cerrado: solo el botón "Eliminar definitivamente"', () => {
    const html = renderToStaticMarkup(React.createElement(EliminarArchivado, { proyecto: { id: 'p1', name: 'PRUEBA A' }, onEliminar: async () => {} }));
    assert.match(html, /<button[^>]*>Eliminar definitivamente<\/button>/);
    assert.doesNotMatch(html, /alertdialog/);
  });
  test('solo en archivados y solo para el dueño', () => {
    const inicio = fs.readFileSync('src/paginas/Inicio.jsx', 'utf8');
    const archivados = inicio.slice(inicio.indexOf('archivados.map((a) =>'));
    assert.match(archivados, /\{a\.rol === 'dueno' && \([\s\S]*?<EliminarArchivado proyecto=\{a\} onEliminar=\{onEliminar\} \/>/);
    assert.equal((inicio.match(/<EliminarArchivado/g) ?? []).length, 1);
    assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /archivados=\{archivedProjects\} puedeCrear=\{puedeCrear\} onEliminar=\{handleEliminarArchivado\}/);
  });
});

describe('Migración: solo se borran proyectos archivados (también en el servidor)', () => {
  const archivo = fs.readdirSync('supabase/migrations').find((x) => /_borrar_solo_archivados\.sql$/.test(x))!;
  const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  test('posterior a 20261026100000; la política de borrado exige dueño y archivado; no toca nada más', () => {
    assert.ok(archivo.slice(0, 14) > '20261026100000');
    assert.match(sql, /drop policy if exists solar_projects_delete_dueno on public\.solar_projects;/);
    assert.match(sql, /create policy solar_projects_delete_dueno on public\.solar_projects\s+for delete to authenticated\s+using \(owner_id = \(select auth\.uid\(\)\) and is_archived\);/);
    assert.doesNotMatch(sql, /alter table|insert |update |grant |security definer|for (select|insert|update|all)/i);
  });
});
