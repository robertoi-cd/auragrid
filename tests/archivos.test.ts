// Documentos de evidencia: tamaño, tipos, rutas por proyecto y entregable, y que nada use URLs públicas.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  BUCKET_DOCUMENTOS, TAMANO_MAXIMO, SEGUNDOS_ENLACE, EXTENSIONES_PERMITIDAS, TIPOS_MIME_PERMITIDOS,
  tipoDeArchivo, problemaArchivo, nombreSeguro, rutaDocumento, esRutaDe, formatearTamano,
} from '../src/lib/archivos';

const archivo = (name: string, size = 1000, type = '') => ({ name, size, type });

describe('Configuración del bucket', () => {
  test('bucket "aura-documentos", 50 MB, enlaces de 10 minutos, PDF/DOCX/XLSX/XML/MPP/XER/JPG/PNG', () => {
    assert.equal(BUCKET_DOCUMENTOS, 'aura-documentos');
    assert.equal(TAMANO_MAXIMO, 52_428_800);
    assert.equal(SEGUNDOS_ENLACE, 600);
    assert.deepEqual(EXTENSIONES_PERMITIDAS, ['pdf', 'docx', 'xlsx', 'xml', 'mpp', 'xer', 'jpg', 'jpeg', 'png']);
  });
  test('la lista de tipos es exactamente la del bucket configurado en Supabase (13 oct 2026)', () => {
    assert.equal(TIPOS_MIME_PERMITIDOS.join(','),
      'application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/xml,text/xml,application/vnd.ms-project,application/x-primavera-xer,image/jpeg,image/png');
  });
  test('la migración pone la misma lista en el bucket y en la tabla deliverable_evidence', () => {
    const sql = readFileSync('supabase/migrations/20261017100000_documentos_mas_tipos.sql', 'utf8');
    const listas = [...sql.matchAll(/array\[([^\]]+)\]/g)].map((m) => [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
    assert.equal(listas.length, 2, 'una lista para el bucket y otra para la tabla');
    for (const l of listas) assert.deepEqual(l, TIPOS_MIME_PERMITIDOS);
    assert.match(sql, /deliverable_evidence_tipo_mime_check/);
  });
});

describe('Validación de archivos', () => {
  test('acepta PDF, DOCX, XLSX y XML (también si el navegador no informa el tipo)', () => {
    assert.equal(problemaArchivo(archivo('Resolutivo MIA.pdf', 1000, 'application/pdf')), null);
    assert.equal(problemaArchivo(archivo('contrato.DOCX')), null);
    assert.equal(problemaArchivo(archivo('cronograma.xlsx')), null);
    assert.equal(problemaArchivo(archivo('cfdi.xml', 1000, 'text/xml')), null);
    assert.equal(tipoDeArchivo('cfdi.xml'), 'application/xml');
  });
  test('acepta MPP, XER, JPG y PNG, y declara el tipo de la extensión cuando el navegador no lo reconoce', () => {
    assert.equal(tipoDeArchivo('Programa obra.mpp', 'application/vnd.ms-project'), 'application/vnd.ms-project');
    assert.equal(tipoDeArchivo('Programa obra.mpp', ''), 'application/vnd.ms-project');
    assert.equal(tipoDeArchivo('Programa obra.mpp', 'application/octet-stream'), 'application/vnd.ms-project');
    assert.equal(tipoDeArchivo('Programa obra.mpp', 'application/x-msproject'), 'application/vnd.ms-project');
    assert.equal(tipoDeArchivo('P6 baseline.XER', ''), 'application/x-primavera-xer');
    assert.equal(tipoDeArchivo('P6 baseline.xer', 'application/octet-stream'), 'application/x-primavera-xer');
    assert.equal(tipoDeArchivo('foto predio.jpg', 'image/jpeg'), 'image/jpeg');
    assert.equal(tipoDeArchivo('foto predio.JPEG', 'image/pjpeg'), 'image/jpeg');
    assert.equal(tipoDeArchivo('plano.png', 'image/png'), 'image/png');
    for (const n of ['a.mpp', 'a.xer', 'a.jpg', 'a.jpeg', 'a.png']) assert.equal(problemaArchivo(archivo(n)), null, n);
    // Un PNG que dice ser JPEG (o al revés) no pasa
    assert.equal(tipoDeArchivo('foto.png', 'image/jpeg'), null);
  });
  test('rechaza otros tipos, aunque se disfracen con la extensión', () => {
    assert.match(problemaArchivo(archivo('foto.gif', 1000, 'image/gif'))!, /Solo se aceptan archivos PDF, DOCX, XLSX, XML, MPP, XER, JPG, JPEG, PNG/);
    assert.match(problemaArchivo(archivo('foto.jpg', 1000, 'image/gif'))!, /Solo se aceptan/);
    assert.match(problemaArchivo(archivo('plan.xer', 1000, 'text/html'))!, /Solo se aceptan/);
    assert.match(problemaArchivo(archivo('script.exe'))!, /Solo se aceptan/);
    assert.match(problemaArchivo(archivo('sin_extension'))!, /Solo se aceptan/);
    assert.match(problemaArchivo(archivo('falso.pdf', 1000, 'application/x-msdownload'))!, /Solo se aceptan/);
  });
  test('máximo 50 MB; vacío no', () => {
    assert.equal(problemaArchivo(archivo('a.pdf', TAMANO_MAXIMO)), null);
    assert.match(problemaArchivo(archivo('a.pdf', TAMANO_MAXIMO + 1))!, /máximo es 50 MB/);
    assert.match(problemaArchivo(archivo('a.pdf', 0))!, /vacío/);
  });
});

describe('Rutas por proyecto y entregable', () => {
  const p = 'alpha-i-50mw';
  const d = '6f1c2a9e-1111-4c4c-9e9e-123456789abc';
  test('<project_id>/<deliverable_id>/<marca>-<nombre seguro>', () => {
    assert.equal(rutaDocumento(p, d, 'Licencia de construcción (firmada).pdf', 1760000000000),
      'alpha-i-50mw/6f1c2a9e-1111-4c4c-9e9e-123456789abc/1760000000000-Licencia_de_construccion_firmada.pdf');
  });
  test('el nombre seguro no deja salir de la carpeta ni usa caracteres raros', () => {
    assert.equal(nombreSeguro('../../otro proyecto/x.pdf'), 'otro_proyecto_x.pdf');
    assert.equal(nombreSeguro('Ñandú año 2027.XLSX'), 'Nandu_ano_2027.xlsx');
    assert.equal(nombreSeguro('???.pdf'), 'archivo.pdf');
  });
  test('proyecto o entregable con "/" o vacío: error', () => {
    assert.throws(() => rutaDocumento('a/b', d, 'x.pdf'));
    assert.throws(() => rutaDocumento(p, '', 'x.pdf'));
  });
  test('esRutaDe comprueba proyecto y entregable', () => {
    const ruta = rutaDocumento(p, d, 'x.pdf', 1);
    assert.equal(esRutaDe(ruta, p, d), true);
    assert.equal(esRutaDe(ruta, 'beta-ii-100mw', d), false);
    assert.equal(esRutaDe(`${p}/${d}/sub/x.pdf`, p, d), false);
  });
  test('tamaño legible', () => {
    assert.equal(formatearTamano(350 * 1024), '350 KB');
    assert.equal(formatearTamano(1.25 * 1024 * 1024), '1.3 MB');
  });
});

describe('Sin URLs públicas', () => {
  const archivos = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? archivos(r) : /\.(js|jsx|ts|tsx)$/.test(n) ? [r] : [];
  });
  test('ningún archivo de src usa getPublicUrl ni el bucket público anterior', () => {
    for (const f of archivos('src')) {
      const t = readFileSync(f, 'utf8');
      assert.ok(!t.includes('getPublicUrl'), `${f} usa getPublicUrl`);
      assert.ok(!t.includes('aura-reports'), `${f} usa aura-reports`);
    }
  });
  test('las descargas usan createSignedUrl con la caducidad de 10 minutos', () => {
    const api = readFileSync('src/lib/archivosApi.js', 'utf8');
    assert.match(api, /createSignedUrl\(evidencia\.ruta, SEGUNDOS_ENLACE/);
    assert.match(api, /upsert: false/);
  });
});
