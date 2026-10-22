// Documentos de las garantías como evidencia del entregable automático "Garantías con la vigencia requerida".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  evidenciaGarantias, garantiasRespaldadas, textoEvidenciaGarantias, resumenEvidencia, textoEvidencia,
} from '../src/lib/evidencia';
import { rutaDocumentoGarantia, TIPOS_MIME_PERMITIDOS } from '../src/lib/archivos';
import { validarProyecto, aplicarEntregablesAutomaticos, type Frente } from '../src/lib/validaciones';
import { describirCambio } from '../src/lib/historialCambios';

const docs = (...fechas: string[]) => fechas.map((subidoEn) => ({ subidoEn }));
const G = [
  { id: 'g1', estado: 'vigente', renovaciones: [] },
  { id: 'g2', estado: 'vigente', renovaciones: [{ renovado_en: '2026-10-10T12:00:00Z' }] },
  { id: 'g3', estado: 'en_renovacion', renovaciones: [] },
  { id: 'g4', estado: 'liberada', renovaciones: [] },
];

describe('Documento vigente de cada garantía', () => {
  test('cuenta solo las activas (no liberadas) y las que tienen documento vigente', () => {
    const e = evidenciaGarantias(G, new Map([['g1', docs('2026-10-01T00:00:00Z')], ['g2', docs('2026-10-11T00:00:00Z')]]));
    assert.equal(e.activas, 3);
    assert.equal(e.conDocumento, 2);
    assert.equal(textoEvidenciaGarantias(e), 'Evidencia: tabla de garantías (2 de 3 con documento)');
    assert.equal(garantiasRespaldadas(e), false);
  });
  test('una renovación posterior al documento lo deja sin documento vigente ("anterior a la renovación")', () => {
    const e = evidenciaGarantias(G, new Map([['g2', docs('2026-10-01T00:00:00Z')]]));
    assert.deepEqual(e.porGarantia.get('g2'), { vigente: false, anteriorARenovacion: true, documentos: 1 });
    // Al subir el endoso después de la renovación, vuelve a estar vigente
    const e2 = evidenciaGarantias(G, new Map([['g2', docs('2026-10-01T00:00:00Z', '2026-10-12T09:00:00Z')]]));
    assert.deepEqual(e2.porGarantia.get('g2'), { vigente: true, anteriorARenovacion: false, documentos: 2 });
  });
  test('con la última renovación (si hay varias)', () => {
    const e = evidenciaGarantias([{ id: 'g', estado: 'vigente', renovaciones: [{ renovado_en: '2026-12-01T00:00:00Z' }, { renovado_en: '2026-06-01T00:00:00Z' }] }],
      new Map([['g', docs('2026-07-01T00:00:00Z')]]));
    assert.equal(e.porGarantia.get('g')!.vigente, false);
  });
  test('todas las activas con documento vigente: respaldadas; sin activas: nunca', () => {
    const e = evidenciaGarantias(G, new Map([['g1', docs('2026-10-01T00:00:00Z')], ['g2', docs('2026-10-11T00:00:00Z')], ['g3', docs('2026-09-01T00:00:00Z')]]));
    assert.equal(garantiasRespaldadas(e), true);
    assert.equal(textoEvidenciaGarantias(e), 'Evidencia: tabla de garantías (3 de 3 con documento)');
    const sinActivas = evidenciaGarantias([G[3]], new Map());
    assert.equal(garantiasRespaldadas(sinActivas), false);
    assert.equal(textoEvidenciaGarantias(sinActivas), 'Evidencia: tabla de garantías (sin garantías activas)');
  });
});

describe('Entregable automático: "con evidencia" solo si todas las garantías activas tienen documento', () => {
  const frentes: Frente[] = [{ nombre: 'Financiamiento', items: [
    ['Garantías con la vigencia requerida', 'pendiente', '', null, { id: 'auto1', codigo: 'garantias_vigencia' }],
    ['Term sheet firmado', 'completo', 'Banco', '2026-07-01', { id: 'e1', codigo: 'financiamiento_term_sheet' }],
  ] }];
  const completo = aplicarEntregablesAutomaticos(frentes, { estado: 'completo', motivo: 'Todas cubren RTB + margen' } as never);
  test('el entregable automático lleva meta.auto y no usa documentos propios', () => {
    assert.equal(completo[0].items[0][4]?.auto, true);
    // Un documento subido al propio entregable automático no cuenta
    const r = resumenEvidencia(completo, { auto1: 3 }, { activas: 3, conDocumento: 2 });
    assert.equal(r.conEvidencia, 0);
  });
  test('2 de 3: sin evidencia, y el nombre lo explica', () => {
    const r = resumenEvidencia(completo, {}, { activas: 3, conDocumento: 2 });
    assert.equal(textoEvidencia(r), '0 de 2 completos con documento');
    assert.deepEqual(r.sinEvidencia.map((x) => x.titulo), [
      'Garantías con la vigencia requerida (2 de 3 garantías con documento)', 'Term sheet firmado']);
  });
  test('3 de 3: cuenta como con evidencia', () => {
    const r = resumenEvidencia(completo, { e1: 1 }, { activas: 3, conDocumento: 3 });
    assert.equal(textoEvidencia(r), '2 de 2 completos con documento');
    assert.deepEqual(r.sinEvidencia, []);
  });
  test('sin datos de las garantías (no se pudieron leer): no se afirma que tenga evidencia', () => {
    assert.equal(resumenEvidencia(completo, {}).conEvidencia, 0);
  });
  test('la alerta informativa lo incluye con "N de M garantías con documento"', () => {
    const garantias = [
      { id: 'g1', tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'A', concepto: 'Interconexión', monto: 1, vence: '2030-01-01', estado: 'vigente' as const },
    ];
    const alertas = validarProyecto({
      proyecto: { name: 'P', fechaRtb: '2027-03-31' }, frentes, garantias, hoy: '2026-10-13',
      documentos: {}, evidenciaGarantias: { activas: 1, conDocumento: 0 },
    });
    const a = alertas.find((x) => x.id === 'evidencia');
    assert.ok(a, 'hay alerta de evidencia');
    assert.match(a!.detalle, /Garantías con la vigencia requerida \(0 de 1 garantías con documento\)/);
    assert.match(a!.accion, /tabla de garantías/);
  });
});

describe('Archivos y base de datos', () => {
  test('ruta <project_id>/garantias/<guarantee_id>/<marca>-<nombre seguro>', () => {
    assert.equal(rutaDocumentoGarantia('alpha-i-50mw', 'abc-123', 'Póliza CENACE.pdf', 42), 'alpha-i-50mw/garantias/abc-123/42-Poliza_CENACE.pdf');
    assert.throws(() => rutaDocumentoGarantia('alpha/x', 'g', 'a.pdf'), /inválidos/);
    assert.throws(() => rutaDocumentoGarantia('p', '', 'a.pdf'), /inválidos/);
  });
  const sql = fs.readFileSync('supabase/migrations/20261018100000_evidencia_garantias.sql', 'utf8');
  test('la tabla acepta los mismos 9 tipos que el bucket y la app', () => {
    const lista = [...sql.match(/tipo_mime\s+text not null check \(tipo_mime = any \(array\[([^\]]+)\]/)![1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(lista, TIPOS_MIME_PERMITIDOS);
  });
  test('mismas reglas: lector lee, editor sube, eliminar con motivo, sin update; política de Storage solo para garantías del proyecto', () => {
    assert.match(sql, /guarantee_evidence_select" on public\.guarantee_evidence for select to authenticated using \(public\.puede_ver\(project_id\)\)/);
    assert.match(sql, /guarantee_evidence_insert"[\s\S]*public\.puede_editar\(project_id\) and subido_por = \(select auth\.uid\(\)\)/);
    assert.match(sql, /revoke update, delete on public\.guarantee_evidence from anon, authenticated/);
    assert.match(sql, /motivo_obligatorio/);
    assert.match(sql, /array_length\(storage\.foldername\(name\), 1\) = 3[\s\S]*= 'garantias'[\s\S]*g\.project_id = \(storage\.foldername\(name\)\)\[1\]/);
  });
  test('una garantía con documentos no se elimina sola (no action), pero el proyecto sí en cascada', () => {
    assert.match(sql, /guarantee_id\s+uuid not null references public\.project_guarantees \(id\) on delete no action/);
    assert.match(sql, /project_id\s+text not null references public\.solar_projects \(id\) on delete cascade/);
    assert.match(fs.readFileSync('src/lib/garantiasApi.js', 'utf8'), /error\.code === '23503'[\s\S]*elimínalos primero/);
  });
});

describe('Historial: documentos y equipo con texto legible', () => {
  const r = (campo: string, valorAnterior: string | null, valorNuevo: string | null) => describirCambio({ campo: campo as never, valorAnterior, valorNuevo });
  test('documentos de garantías y de entregables', () => {
    assert.equal(r('garantia_doc_alta', null, 'Póliza.pdf'), 'Evidencia agregada: Póliza.pdf');
    assert.equal(r('garantia_doc_baja', 'Póliza.pdf', null), 'Evidencia eliminada: Póliza.pdf');
    assert.equal(r('evidencia_alta', null, 'archivo.pdf'), 'Evidencia agregada: archivo.pdf');
    assert.equal(r('evidencia_baja', 'archivo.pdf', null), 'Evidencia eliminada: archivo.pdf');
    assert.doesNotMatch(r('evidencia_alta', null, 'archivo.pdf'), /undefined|—/);
  });
  test('cambios de equipo (antes salían como "undefined")', () => {
    assert.equal(r('miembro_alta', null, 'lector (2 consultas/día)'), 'Acceso otorgado como lector (2 consultas/día)');
    assert.equal(r('miembro_rol', 'lector', 'editor'), 'Rol: lector → editor');
    assert.equal(r('miembro_baja', 'editor', null), 'Acceso retirado (era editor)');
    assert.equal(r('miembro_limite', 'predeterminado', '30'), 'Límite del asistente: predeterminado → 30 consultas/día');
    for (const campo of ['miembro_alta', 'miembro_rol', 'miembro_baja', 'miembro_limite', 'evidencia_baja']) {
      assert.doesNotMatch(r(campo, 'a', 'b'), /undefined/);
    }
  });
});
