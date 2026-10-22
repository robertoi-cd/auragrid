// Renombrar entregables y garantías no rompe ninguna regla: las reglas usan el código del entregable y la
// categoría de la garantía, no el nombre ni el texto. Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarProyecto, calcularCoberturaGarantias, aplicarEntregablesAutomaticos, categoriaGarantia, vigenciaPorDefecto,
  referenciaGarantia, esEntregableGarantias, estadoGarantia,
  type Frente, type Entregable, type Garantia, type FechasClave,
} from '../src/lib/validaciones';
import { codigoEntregable, CODIGO_GARANTIAS, CODIGO_TRAMO_2, CODIGOS_PERMISOS_OBRA, REGLA_POR_CODIGO } from '../src/lib/codigosEntregables';
import { crearModeloFinanciero, type Movimiento } from '../src/lib/modeloFinanciero';
import { FRENTES_INICIALES, filasEntregables, CODIGOS_CATALOGO } from '../src/lib/datosProyecto.js';
import { describirCambio, type RegistroCambio } from '../src/lib/historialCambios';

const RTB = '2027-03-31';
const HOY = '2026-10-12';
const FECHAS: FechasClave = { rtb: RTB, cod: '2028-04-15', finConstruccion: '2028-04-15', estimadas: false };
const items = (f: Frente[]) => f.flatMap((x) => x.items);

/** Cambia el nombre de los entregables con esos códigos (como lo haría el usuario en "Editar"). */
const renombrar = (frentes: Frente[], nombres: Record<string, string>): Frente[] =>
  frentes.map((f) => ({ ...f, items: f.items.map((i): Entregable => (nombres[codigoEntregable(i)] ? [nombres[codigoEntregable(i)], i[1], i[2], i[3], i[4]] : i)) }));

describe('Códigos del catálogo', () => {
  test('los 20 entregables del catálogo tienen código distinto; ninguno es "otro"', () => {
    const codigos = items(FRENTES_INICIALES).map(codigoEntregable);
    assert.equal(new Set(codigos).size, 20);
    assert.ok(!codigos.includes('otro'));
    assert.deepEqual(filasEntregables(false).map((f) => f.codigo), codigos);
  });
  test('los mismos códigos que llena la migración 20261013100000 (incluido el nombre anterior del de garantías)', () => {
    assert.equal(CODIGOS_CATALOGO['Garantías vigentes hasta RTB'], CODIGO_GARANTIAS);
    assert.equal(CODIGOS_CATALOGO['Licencia de construcción'], 'permisos_licencia_construccion');
  });
  test('el código guardado manda sobre el nombre; un entregable desconocido sin código es "otro"', () => {
    assert.equal(codigoEntregable(['Licencia de construcción', 'curso', 'R', null, { codigo: 'otro' }]), 'otro');
    assert.equal(codigoEntregable(['Mi tarea', 'curso', 'R', null]), 'otro');
    assert.equal(codigoEntregable(['Licencia municipal', 'curso', 'R', null, { codigo: 'permisos_licencia_construccion' }]), 'permisos_licencia_construccion');
  });
  test('el aviso al eliminar sale del código (los 3 permisos y el tramo 2)', () => {
    assert.deepEqual(Object.keys(REGLA_POR_CODIGO).sort(), [...CODIGOS_PERMISOS_OBRA, CODIGO_TRAMO_2].sort());
  });
});

describe('Obra antes de permiso con permisos renombrados', () => {
  const pago = (fecha: string): Movimiento => ({ tipo: 'pago', concepto: 'Montaje', fecha, monto: 1_000_000, estado: 'Programado' });
  const alertas = (frentes: Frente[]) => {
    const f = { ...crearModeloFinanciero({ capacityMw: 10, capex: 10_000_000, esEjemplo: false }), pagos: [pago('2027-02-01')], fondos: [], origenCronograma: 'capturado' as const };
    return validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes, garantias: [], finanzas: f, hoy: HOY }).filter((a) => a.id === 'financiamiento-obra-permisos');
  };
  test('renombrar la licencia de construcción no apaga la regla y el detalle usa el nombre nuevo', () => {
    const antes = alertas(FRENTES_INICIALES);
    const despues = alertas(renombrar(FRENTES_INICIALES, { permisos_licencia_construccion: 'Licencia municipal de obra' }));
    assert.equal(antes.length, 1);
    assert.equal(despues.length, 1);
    assert.match(despues[0].detalle, /Licencia municipal de obra \(fecha compromiso 10 feb 2027\)/);
  });
  test('un entregable personalizado llamado "Licencia de construcción" (código otro) no activa la regla', () => {
    const sinPermiso = FRENTES_INICIALES.map((f) => ({ ...f, items: f.items.filter((i) => !CODIGOS_PERMISOS_OBRA.includes(codigoEntregable(i))) }));
    const conCopia: Frente[] = [...sinPermiso, { nombre: 'Otros', items: [['Licencia de construcción', 'pendiente', 'R', '2027-03-01', { codigo: 'otro' }]] }];
    assert.equal(alertas(conCopia).length, 0);
  });
});

describe('Entregable automático de garantías renombrado', () => {
  const ALPHA: Garantia[] = [
    { tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'A', concepto: 'Garantía de interconexión', categoria: 'interconexion', monto: 1, vence: '2027-05-15', estado: 'vigente' },
  ];
  const renombrados = renombrar(FRENTES_INICIALES, { [CODIGO_GARANTIAS]: 'Fianzas y cartas de crédito en regla' });
  test('se sigue calculando solo y conserva el nombre nuevo', () => {
    const c = calcularCoberturaGarantias(ALPHA, RTB, 90, true, FECHAS);
    const item = items(aplicarEntregablesAutomaticos(renombrados, c)).find(esEntregableGarantias)!;
    assert.deepEqual([item[0], item[1], item[4]?.auto], ['Fianzas y cartas de crédito en regla', 'bloqueado', true]);
  });
  test('un "completo" manual en el entregable renombrado se sustituye por el calculado', () => {
    const manual = renombrados.map((f) => ({ ...f, items: f.items.map((i): Entregable => (esEntregableGarantias(i) ? [i[0], 'completo', i[2], i[3], i[4]] : i)) }));
    const item = items(aplicarEntregablesAutomaticos(manual, calcularCoberturaGarantias(ALPHA, RTB, 90, true, FECHAS))).find(esEntregableGarantias)!;
    assert.equal(item[1], 'bloqueado');
  });
  test('un entregable personalizado con el nombre de catálogo no se vuelve automático', () => {
    const copia: Entregable = ['Garantías con la vigencia requerida', 'completo', 'R', null, { codigo: 'otro' }];
    assert.equal(esEntregableGarantias(copia), false);
  });
});

describe('Tramo 2 del cronograma de ejemplo con el entregable renombrado', () => {
  const alpha = { id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000, esEjemplo: true };
  const conTramo2 = (frentes: Frente[], estado: string) =>
    frentes.map((f) => ({ ...f, items: f.items.map((i): Entregable => (codigoEntregable(i) === CODIGO_TRAMO_2 ? [i[0], estado as Entregable[1], i[2], i[3], i[4]] : i)) }));
  const tramo2 = (frentes: Frente[]) => crearModeloFinanciero(alpha, frentes).fondos.find((f) => f.concepto.startsWith('Tramo 2'))!;
  test('renombrado y completo: el tramo 2 queda confirmado', () => {
    const frentes = conTramo2(renombrar(FRENTES_INICIALES, { [CODIGO_TRAMO_2]: 'Comité aprueba segundo desembolso' }), 'completo');
    assert.equal(tramo2(frentes).confirmado, true);
  });
  test('en curso: sigue sin confirmar', () => {
    assert.equal(tramo2(renombrar(FRENTES_INICIALES, { [CODIGO_TRAMO_2]: 'Comité aprueba segundo desembolso' })).confirmado, false);
  });
});

describe('Garantías renombradas: la vigencia sugerida sale de la categoría, no del texto', () => {
  const cenace: Garantia = { tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'A', concepto: 'Garantía de interconexión', categoria: 'interconexion', monto: 1_250_000, vence: '2027-07-05', estado: 'vigente' };
  const renombrada: Garantia = { ...cenace, beneficiario: 'Centro Nacional de Control de Energía', concepto: 'Fianza de la solicitud', tipo: 'Fianza de cumplimiento' };
  test('con su categoría guardada, la renombrada se sigue validando contra la COD', () => {
    assert.equal(vigenciaPorDefecto(renombrada), 'cod');
    assert.equal(referenciaGarantia(renombrada, FECHAS, 90).hito, 'COD');
  });
  test('las alertas no cambian al renombrarla', () => {
    const v = (g: Garantia) => validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: [g], fechasClave: FECHAS, hoy: HOY });
    assert.deepEqual(v(renombrada).map((a) => [a.sev, a.titulo]), v(cenace).map((a) => [a.sev, a.titulo]));
    assert.equal(estadoGarantia(v(renombrada), 0).etiqueta, estadoGarantia(v(cenace), 0).etiqueta);
  });
  test('sin categoría guardada, ese mismo texto ya no se reconocería como interconexión (por eso se guarda)', () => {
    assert.equal(categoriaGarantia({ ...renombrada, categoria: null }), 'cumplimiento_epc'); // "cumplimiento" en el tipo
  });
  test('la categoría guardada manda sobre el texto', () => {
    assert.equal(categoriaGarantia({ ...cenace, categoria: 'otra' }), 'otra');
    assert.equal(vigenciaPorDefecto({ ...cenace, categoria: 'otra' }), 'rtb');
  });
});

describe('Historial de cambios de nombre', () => {
  const r = (campo: RegistroCambio['campo'], a: string, b: string) =>
    describirCambio({ campo, valorAnterior: a, valorNuevo: b });
  test('entregable: "Nombre: anterior → nuevo"', () => {
    assert.equal(r('titulo', 'Licencia de construcción', 'Licencia municipal de obra'), 'Nombre: Licencia de construcción → Licencia municipal de obra');
  });
  test('garantía: nombre, tipo, beneficiario y qué garantiza', () => {
    assert.equal(r('garantia_concepto', 'Garantía de interconexión', 'Fianza de interconexión'), 'Nombre: Garantía de interconexión → Fianza de interconexión');
    assert.equal(r('garantia_tipo', 'Fianza', 'Carta de crédito'), 'Tipo: Fianza → Carta de crédito');
    assert.equal(r('garantia_beneficiario', 'CENACE', 'Centro Nacional de Control de Energía'), 'Beneficiario: CENACE → Centro Nacional de Control de Energía');
    assert.equal(r('garantia_categoria', 'interconexion', 'otra'), 'Qué garantiza: Interconexión → Otra');
  });
});
