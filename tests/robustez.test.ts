// Robustez antes de publicar: página 404, pantalla de error en lugar de una página en blanco, favicon y título de
// la pestaña según la pantalla.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
// @ts-expect-error react-dom sin declaración de tipos en el proyecto
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
// @ts-expect-error titulos es JavaScript (sin declaración de tipos)
import { tituloPestana, rutaConocida, NOMBRE_APP } from '../src/lib/titulos';
// @ts-expect-error LimiteDeError es JSX (sin declaración de tipos)
import LimiteDeError, { PantallaError, MENSAJE_ERROR } from '../src/LimiteDeError';
// @ts-expect-error NoEncontrada es JSX (sin declaración de tipos)
import NoEncontrada from '../src/paginas/NoEncontrada';

const app = fs.readFileSync('src/App.jsx', 'utf8');

describe('Página 404', () => {
  test('rutas conocidas: Inicio, proyectos (con o sin módulo) y páginas legales; lo demás no', () => {
    for (const r of ['/', '/proyectos', '/proyectos/', '/proyectos/alpha-i-50mw', '/proyectos/alpha-i-50mw/finanzas', '/proyectos/alpha-i-50mw/no-existe', '/privacidad', '/terminos']) assert.ok(rutaConocida(r), r);
    for (const r of ['/no-existe', '/proyectoss', '/admin', '/privacidad/otra']) assert.ok(!rutaConocida(r), r);
  });
  test('la ruta comodín muestra la 404 (antes llevaba a Inicio sin avisar)', () => {
    assert.match(app, /<Route path="\*" element=\{<NoEncontrada \/>\} \/>/);
    assert.doesNotMatch(app, /<Route path="\*" element=\{<Navigate/);
  });
  test('dice que la dirección no existe, la muestra y enlaza a Inicio', () => {
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: ['/no-existe/x'] }, React.createElement(NoEncontrada)));
    assert.match(html, /Página no encontrada/);
    assert.match(html, /\/no-existe\/x/);
    assert.match(html, /href="\/proyectos"[^>]*>Ir a Inicio/);
  });
});

describe('Pantalla de error', () => {
  test('mensaje amable, recargar, ir a Inicio y detalle técnico plegado', () => {
    const html = renderToStaticMarkup(React.createElement(PantallaError, { detalle: 'x is undefined' }));
    assert.match(html, /Algo salió mal/);
    assert.ok(html.includes(MENSAJE_ERROR));
    assert.match(html, /Recargar la página/);
    assert.match(html, /href="\/proyectos"[^>]*>Ir a Inicio/);
    assert.match(html, /<details[\s\S]*Detalle técnico[\s\S]*x is undefined/);
  });
  test('completa: con el banner de la versión de prueba', () => {
    const html = renderToStaticMarkup(React.createElement(PantallaError, { completa: true }));
    assert.match(html, /data-banner-prueba/);
    assert.doesNotMatch(html, /Detalle técnico/);
  });
  test('atrapa el error al dibujar y se recupera al cambiar de ruta', () => {
    assert.equal(typeof LimiteDeError.getDerivedStateFromError, 'function');
    assert.deepEqual(Object.keys(LimiteDeError.getDerivedStateFromError(new Error('x'))), ['error']);
    assert.match(fs.readFileSync('src/LimiteDeError.jsx', 'utf8'), /anteriores\.clave !== this\.props\.clave\) this\.setState\(\{ error: null \}\)/);
  });
  test('dos niveles: toda la app (main.jsx) y las páginas del tablero (el menú sigue funcionando)', () => {
    assert.match(fs.readFileSync('src/main.jsx', 'utf8'), /<LimiteDeError completa>\s*<App \/>\s*<\/LimiteDeError>/);
    assert.match(app, /<LimiteDeError clave=\{ubicacion\.pathname\}>\s*<Routes>[\s\S]*<\/Routes>\s*<\/LimiteDeError>/);
  });
});

describe('Favicon y título', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  test('favicon SVG en public/ y enlazado', () => {
    assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon\.svg" \/>/);
    assert.match(fs.readFileSync('public/favicon.svg', 'utf8'), /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 64 64">/);
  });
  test('título inicial "AuraGrid" y aviso sin JavaScript', () => {
    assert.match(html, /<title>AuraGrid<\/title>/);
    assert.match(html, /<noscript>AuraGrid necesita JavaScript/);
  });
  test('título de la pestaña según la pantalla', () => {
    assert.equal(NOMBRE_APP, 'AuraGrid');
    const t = (o: object) => tituloPestana({ ruta: '/proyectos', conSesion: true, ...o });
    assert.equal(t({ conSesion: false }), 'Iniciar sesión · AuraGrid');
    assert.equal(t({ ruta: '/privacidad', conSesion: false }), 'Aviso de privacidad · AuraGrid');
    assert.equal(t({ ruta: '/terminos' }), 'Términos de uso · AuraGrid');
    assert.equal(t({ definirContrasena: 'invite' }), 'Definir contraseña · AuraGrid');
    assert.equal(t({}), 'Inicio · AuraGrid');
    assert.equal(t({ ruta: '/no-existe' }), 'Página no encontrada · AuraGrid');
    assert.equal(t({ ruta: '/proyectos/alpha-i-50mw/finanzas', proyecto: 'Alpha I', modulo: 'finanzas' }), 'Finanzas · Alpha I · AuraGrid');
    assert.equal(t({ ruta: '/proyectos/alpha-i-50mw/permisos', proyecto: 'Alpha I', modulo: 'permisos' }), 'Permisos y frentes · Alpha I · AuraGrid');
    assert.equal(t({ ruta: '/proyectos/x/resumen', proyecto: null, modulo: 'resumen' }), 'Proyecto · AuraGrid');
  });
  test('App actualiza document.title antes de los return anticipados (es un hook)', () => {
    const efecto = app.indexOf('useEffect(() => { document.title = tituloActual; }, [tituloActual]);');
    assert.ok(efecto > 0);
    assert.ok(efecto < app.indexOf('if (documentoLegal) return'));
  });
});
