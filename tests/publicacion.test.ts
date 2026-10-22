// Versión de prueba antes de publicar: banner en toda pantalla, aviso de privacidad y términos de uso (borradores
// pendientes de revisión legal), noindex y cabeceras de seguridad de Vercel.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// @ts-expect-error textosLegales es JavaScript (sin declaración de tipos)
import { AVISO_VERSION_PRUEBA, PENDIENTE_REVISION_LEGAL, CONTACTO_LINKEDIN, AVISO_PRIVACIDAD, TERMINOS_USO, DOCUMENTOS_LEGALES } from '../src/lib/textosLegales.js';

const texto = (d: { introduccion: string; secciones: [string, string[]][] }) => [d.introduccion, ...d.secciones.flatMap(([t, p]) => [t, ...p])].join('\n');

describe('Banner de la versión de prueba', () => {
  test('texto exacto', () => {
    assert.equal(AVISO_VERSION_PRUEBA, 'Versión de prueba: usa datos ficticios. No captures información confidencial de proyectos reales.');
  });
  test('aparece en la app, el login, la invitación y las páginas legales', () => {
    for (const f of ['src/App.jsx', 'src/Login.jsx', 'src/DefinirContrasena.jsx']) assert.match(fs.readFileSync(f, 'utf8'), /<BannerPrueba \/>/, f);
    assert.match(fs.readFileSync('src/VersionPrueba.jsx', 'utf8'), /function PaginaLegal[\s\S]*<BannerPrueba \/>/);
  });
});

describe('Aviso de privacidad', () => {
  const t = texto(AVISO_PRIVACIDAD);
  test('ruta y marca de borrador', () => {
    assert.equal(AVISO_PRIVACIDAD.ruta, '/privacidad');
    assert.equal(PENDIENTE_REVISION_LEGAL, 'Pendiente de revisión legal');
    assert.match(fs.readFileSync('src/VersionPrueba.jsx', 'utf8'), /\{PENDIENTE_REVISION_LEGAL\}/);
  });
  test('contacto: el perfil de LinkedIn (sin correo por capturar)', () => {
    assert.equal(CONTACTO_LINKEDIN, 'https://www.linkedin.com/in/robertoimb');
    assert.ok(t.includes('envía un mensaje por LinkedIn a https://www.linkedin.com/in/robertoimb.'));
    assert.ok(t.includes('Envía un mensaje por LinkedIn a https://www.linkedin.com/in/robertoimb indicando tu correo de acceso'));
    assert.ok(texto(TERMINOS_USO).includes('envía un mensaje por LinkedIn a https://www.linkedin.com/in/robertoimb.'));
    assert.doesNotMatch(t + texto(TERMINOS_USO), /CORREO DE CONTACTO/);
  });
  test('región de Supabase, Gemini fuera de México y plazo de conservación', () => {
    assert.match(t, /us-east-2/);
    assert.match(t, /Google Gemini procesa esos datos fuera de México/);
    assert.match(t, /Cuánto tiempo los conservamos/);
    assert.match(t, /30 días/);
  });
  test('responsable de los datos: "Responsable: Roberto Imbers (contacto por LinkedIn).", sin domicilio, marcada para revisión legal', () => {
    const s = AVISO_PRIVACIDAD.secciones.find(([t]: [string]) => t === 'Responsable de los datos');
    assert.ok(s);
    assert.deepEqual(s[1], ['Responsable: Roberto Imbers (contacto por LinkedIn).']);
    assert.doesNotMatch(texto(AVISO_PRIVACIDAD), /domicilio/i);
    assert.equal(s[2]?.revisionLegal, true);
    assert.ok(fs.readFileSync('src/VersionPrueba.jsx', 'utf8').includes('opciones?.revisionLegal'));
  });
  test('plazos confirmados: 30 días, 8 semanas y 20 días hábiles', () => {
    assert.match(t, /máximo de 30 días/);
    assert.match(t, /máximo de 8 semanas/);
    assert.match(t, /máximo de 20 días hábiles/);
  });
  test('derechos de acceso, rectificación, cancelación y oposición', () => {
    for (const d of ['acceso', 'corrección', 'borrado', 'oponerte']) assert.ok(t.includes(d), d);
  });
});

describe('Términos de uso', () => {
  test('ruta, sin asesoría y datos ficticios', () => {
    const t = texto(TERMINOS_USO);
    assert.equal(TERMINOS_USO.ruta, '/terminos');
    assert.match(t, /no constituyen asesoría/);
    assert.match(t, /Usa datos ficticios/);
  });
});

describe('Rutas y enlaces', () => {
  const app = fs.readFileSync('src/App.jsx', 'utf8');
  test('las páginas legales se ven sin sesión (antes de la pantalla de carga y del login)', () => {
    assert.deepEqual(DOCUMENTOS_LEGALES.map((d: { ruta: string }) => d.ruta), ['/privacidad', '/terminos']);
    const legal = app.indexOf('if (documentoLegal) return <PaginaLegal');
    assert.ok(legal > 0);
    assert.ok(legal < app.indexOf('<Login'), 'antes del login');
  });
  test('enlaces en el pie de la app, el login y la invitación', () => {
    for (const f of ['src/App.jsx', 'src/Login.jsx', 'src/DefinirContrasena.jsx']) assert.match(fs.readFileSync(f, 'utf8'), /<EnlacesLegales \/>/, f);
  });
});

describe('Sin indexación y cabeceras de seguridad', () => {
  test('meta robots noindex en index.html', () => {
    assert.match(fs.readFileSync('index.html', 'utf8'), /<meta name="robots" content="noindex, nofollow" \/>/);
  });
  const cabeceras = Object.fromEntries(JSON.parse(fs.readFileSync('vercel.json', 'utf8')).headers.find((h: { source: string }) => h.source === '/(.*)').headers.map((h: { key: string; value: string }) => [h.key, h.value]));
  test('X-Robots-Tag, X-Frame-Options, nosniff, Referrer-Policy y Permissions-Policy', () => {
    assert.equal(cabeceras['X-Robots-Tag'], 'noindex, nofollow');
    assert.equal(cabeceras['X-Frame-Options'], 'DENY');
    assert.equal(cabeceras['X-Content-Type-Options'], 'nosniff');
    assert.equal(cabeceras['Referrer-Policy'], 'strict-origin-when-cross-origin');
    for (const p of ['camera=()', 'microphone=()', 'geolocation=()']) assert.ok(cabeceras['Permissions-Policy'].includes(p), p);
  });
  test('CSP solo en modo de reporte, con Supabase permitido', () => {
    assert.equal(cabeceras['Content-Security-Policy'], undefined);
    const csp = cabeceras['Content-Security-Policy-Report-Only'];
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /connect-src 'self' https:\/\/vpsikmgnhubkydftahdl\.supabase\.co wss:\/\/vpsikmgnhubkydftahdl\.supabase\.co/);
    assert.match(csp, /frame-ancestors 'none'/);
  });
});

describe('Enlace de contacto en las páginas legales', () => {
  test('la dirección de LinkedIn se pinta como enlace, sin el punto final', async () => {
    const React = (await import('react')).default;
    // @ts-expect-error react-dom sin declaración de tipos en el proyecto
    const { renderToStaticMarkup } = await import('react-dom/server');
    // @ts-expect-error VersionPrueba es JSX (sin declaración de tipos)
    const { conEnlaces } = await import('../src/VersionPrueba.jsx');
    const html = renderToStaticMarkup(React.createElement('li', null, conEnlaces('Para cualquier duda, envía un mensaje por LinkedIn a https://www.linkedin.com/in/robertoimb.')));
    assert.match(html, /<a href="https:\/\/www\.linkedin\.com\/in\/robertoimb" target="_blank" rel="noopener noreferrer"[^>]*>https:\/\/www\.linkedin\.com\/in\/robertoimb<\/a>\.<\/li>/);
  });
});

describe('Vercel Web Analytics', () => {
  test('<Analytics /> en la app, fuera del límite de error', () => {
    const main = fs.readFileSync('src/main.jsx', 'utf8');
    assert.match(main, /import \{ Analytics \} from '@vercel\/analytics\/react'/);
    assert.match(main, /<\/BrowserRouter>[\s\S]*<Analytics \/>[\s\S]*<\/React\.StrictMode>/);
    assert.ok(JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['@vercel/analytics']);
  });
  test('la CSP no se abre: el script y el envío de producción son del mismo dominio (/_vercel/insights)', () => {
    const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    const csp = v.headers[0].headers.find((h: { key: string }) => h.key === 'Content-Security-Policy-Report-Only').value as string;
    assert.match(csp, /script-src 'self';/);
    assert.match(csp, /connect-src 'self' /);
    assert.doesNotMatch(csp, /vercel-scripts|vercel-insights|\*/);
    const lib = fs.readFileSync('node_modules/@vercel/analytics/dist/react/index.mjs', 'utf8');
    assert.match(lib, /return "\/_vercel\/insights\/script\.js";/);
  });
  test('aviso de privacidad: visitas anónimas, sin cookies y sin identificar a las personas', () => {
    const t = AVISO_PRIVACIDAD.secciones.flatMap(([, p]: [string, string[]]) => p).join(' ');
    assert.ok(t.includes('La app mide visitas de forma anónima con Vercel Web Analytics (páginas vistas, país y tipo de dispositivo), sin cookies y sin identificar a las personas.'));
  });
});
