// Botón "+ Nuevo Parque Solar" según los roles del usuario y textos de Equipo.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { puedeCrearProyectos, limiteCambio } from '../src/lib/permisos';

describe('"+ Nuevo Parque Solar"', () => {
  test('oculto si solo tiene proyectos compartidos (lector o editor)', () => {
    assert.equal(puedeCrearProyectos(['lector']), false);
    assert.equal(puedeCrearProyectos(['lector', 'editor']), false);
  });
  test('visible si es dueño de alguno (aunque tenga otros compartidos)', () => {
    assert.equal(puedeCrearProyectos(['dueno']), true);
    assert.equal(puedeCrearProyectos(['lector', 'dueno']), true);
  });
  test('visible para una cuenta sin ningún proyecto (crea el primero)', () => {
    assert.equal(puedeCrearProyectos([]), true);
  });
  test('la app oculta el botón (en Inicio) y el modal con esta regla', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /puedeCrearProyectos\(\[\.\.\.projects, \.\.\.archivedProjects\]\.map\(p => p\.rol\)\)/);
    assert.match(app, /<Inicio [^>]*puedeCrear=\{puedeCrear\}/);
    assert.match(fs.readFileSync('src/paginas/Inicio.jsx', 'utf8'), /\{puedeCrear && \(\s*<button onClick=\{onNuevo\}/);
    assert.match(app, /isOpen=\{isModalOpen && puedeCrear\}/);
  });
});

describe('Texto de "Equipo de…"', () => {
  test('crear la cuenta en Supabase (Add user) o invitar con la app publicada', () => {
    for (const archivo of ['src/EquipoModal.jsx', 'src/lib/equipoApi.js']) {
      const t = fs.readFileSync(archivo, 'utf8');
      assert.match(t, /créala en Supabase \(Authentication → Users → Add user\) o invítala cuando la app esté publicada/i, archivo);
      assert.doesNotMatch(t, /invítala primero desde/i, archivo);
    }
  });
});

describe('"Guardar" del límite en Equipo solo si cambió', () => {
  const lector4 = { limite: 4, limitePropio: true };
  const lectorPredeterminado = { limite: 5, limitePropio: false };
  const editorSinLimite = { limite: null, limitePropio: false };
  test('mismo valor: desactivado (no registra "4 → 4")', () => {
    assert.equal(limiteCambio('4', lector4), false);
    assert.equal(limiteCambio(' 4 ', lector4), false);
    assert.equal(limiteCambio('04', lector4), false);
    assert.equal(limiteCambio('', lectorPredeterminado), false);
    assert.equal(limiteCambio('', editorSinLimite), false);
  });
  test('valor distinto: activado', () => {
    assert.equal(limiteCambio('5', lector4), true);
    assert.equal(limiteCambio('', lector4), true); // volver al predeterminado
    assert.equal(limiteCambio('5', lectorPredeterminado), true); // fijar 5 como propio, aunque sea el predeterminado
    assert.equal(limiteCambio('3', editorSinLimite), true);
  });
  test('el botón de la pantalla usa esta regla', () => {
    assert.match(fs.readFileSync('src/EquipoModal.jsx', 'utf8'), /!limiteCambio\(limites\[m\.userId\] \?\? '', m\)/);
  });
});
