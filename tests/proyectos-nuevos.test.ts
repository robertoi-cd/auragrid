// Proyectos nuevos: sin datos heredados, sin garantías y sin RTB. Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PLANTILLA_FRENTES, FRENTES_EJEMPLO, filasEntregables } from '../src/lib/datosProyecto.js';
import { crearModeloFinanciero } from '../src/lib/modeloFinanciero';
import {
  capexReferencia, interconexionReferencia, opexReferencia, arrendamientoReferencia, FUENTES_PROYECTO_NUEVO, PERFILES_INTERCONEXION,
} from '../src/lib/fuentesSupuestos';
import {
  validarProyecto, contarAlertas, calcularCoberturaGarantias, aplicarEntregablesAutomaticos, ENTREGABLE_GARANTIAS,
  type Frente, type Garantia,
} from '../src/lib/validaciones';

const HOY = '2026-10-11';
const plantilla = PLANTILLA_FRENTES as unknown as Frente[];
const nuevo = { name: 'PRUEBA AISLAMIENTO', state: 'Zacatecas', fechaRtb: '2028-06-30' as string | null };
const entregables = (f: Frente[]) => f.flatMap((x) => x.items);
const garantia = (cambios: Partial<Garantia> = {}): Garantia => ({
  tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'Afianzadora', concepto: '', monto: 1_000_000, vence: '2029-01-31', estado: 'vigente', ...cambios,
});

describe('Un proyecto nuevo no hereda datos de Alpha I', () => {
  test('la plantilla tiene los 20 entregables, todos en "pendiente" y sin fechas', () => {
    const items = entregables(plantilla);
    assert.equal(items.length, 20);
    assert.ok(items.every((i) => i[1] === 'pendiente'));
    assert.ok(items.every((i) => i[3] === null));
  });
  test('ningún responsable menciona Sonora ni otro dato de Alpha I', () => {
    assert.ok(!entregables(plantilla).some((i) => /Sonora|Alpha/i.test(i[2])));
  });
  test('las filas a guardar coinciden: plantilla vacía o ejemplo explícito', () => {
    const vacias = filasEntregables(false);
    assert.ok(vacias.every((f) => f.estado === 'pendiente' && f.fecha === null));
    const ejemplo = filasEntregables(true);
    assert.equal(ejemplo.filter((f) => f.estado === 'completo').length, 10);
    assert.deepEqual(ejemplo.map((f) => f.titulo), vacias.map((f) => f.titulo));
    assert.equal(entregables(FRENTES_EJEMPLO as unknown as Frente[]).length, 20);
  });
  test('sin ejemplo no hay pagos, tramos ni fechas inventados (solo equity/deuda sobre su CAPEX)', () => {
    const f = crearModeloFinanciero({ capacityMw: 300, capex: 'USD 284,550,000', esEjemplo: false });
    assert.equal(f.conCronograma, false);
    assert.deepEqual([f.pagos.length, f.fondos.length, f.contratoEquipos], [0, 0, 0]);
    assert.equal(f.equity + f.deuda, f.capex);
  });
  test('con ejemplo sí se genera el cronograma ilustrativo', () => {
    const f = crearModeloFinanciero({ capacityMw: 50, capex: '$46,500,000 USD', esEjemplo: true });
    assert.equal(f.conCronograma, true);
    assert.ok(f.pagos.length > 0 && f.fondos.length > 0);
  });
  test('un proyecto nuevo sin cronograma da una advertencia, no un falso descuadre ni hueco de caja', () => {
    const finanzas = crearModeloFinanciero({ capacityMw: 300, capex: 'USD 284,550,000', esEjemplo: false });
    const a = validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: [garantia()], finanzas, hoy: HOY })
      .filter((x) => x.categoria === 'Financiamiento');
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['advertencia', 'Sin cronograma de pagos ni fuentes de fondeo']]);
  });
  test('entregables pendientes sin fecha no generan alertas de plazo', () => {
    const a = validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: [garantia()], hoy: HOY })
      .filter((x) => x.categoria === 'Frentes de trabajo');
    assert.equal(a.length, 0);
  });
  test('un entregable bloqueado sin fecha sigue siendo crítico', () => {
    const f = [{ nombre: 'X', items: [['E', 'bloqueado', 'R', null]] }] as unknown as Frente[];
    const a = validarProyecto({ proyecto: nuevo, frentes: f, garantias: [garantia()], hoy: HOY }).filter((x) => x.categoria === 'Frentes de trabajo');
    assert.equal(a[0]?.sev, 'critico');
    assert.match(a[0].detalle, /sin fecha compromiso/);
  });
});

describe('Proyecto sin garantías registradas', () => {
  const alertas = () => validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: [], hoy: HOY });
  test('genera la alerta crítica "No hay garantías registradas"', () => {
    const a = alertas().find((x) => x.titulo === 'No hay garantías registradas');
    assert.equal(a?.sev, 'critico');
  });
  test('el entregable "Garantías con la vigencia requerida" no queda completo', () => {
    const c = calcularCoberturaGarantias([], nuevo.fechaRtb, 90);
    assert.notEqual(c.estado, 'completo');
    const item = entregables(aplicarEntregablesAutomaticos(plantilla, c)).find((i) => i[0] === ENTREGABLE_GARANTIAS)!;
    assert.notEqual(item[1], 'completo');
    assert.match(item[4]!.motivo!, /No hay garantías registradas/);
  });
  test('aunque alguien lo marque "completo" a mano, se recalcula', () => {
    const manual = plantilla.map((f) => ({ ...f, items: f.items.map((i) => (i[0] === ENTREGABLE_GARANTIAS ? [i[0], 'completo', i[2], i[3]] : i)) })) as Frente[];
    const item = entregables(aplicarEntregablesAutomaticos(manual, calcularCoberturaGarantias([], nuevo.fechaRtb, 90))).find((i) => i[0] === ENTREGABLE_GARANTIAS)!;
    assert.equal(item[1], 'pendiente');
  });
  test('si todas las garantías están liberadas también es crítica', () => {
    const a = validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: [garantia({ estado: 'liberada' })], hoy: HOY });
    assert.ok(a.some((x) => x.sev === 'critico' && x.titulo === 'No hay garantías activas (todas liberadas)'));
  });
  test('con una garantía que cubre RTB + margen desaparece la alerta y el entregable se completa', () => {
    const g = [garantia({ vence: '2029-01-31' })]; // RTB 30 jun 2028 + 90 días = 28 sep 2028
    const a = validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: g, hoy: HOY });
    assert.ok(!a.some((x) => x.titulo.startsWith('No hay garantías')));
    assert.equal(calcularCoberturaGarantias(g, nuevo.fechaRtb, 90).estado, 'completo');
  });
  test('si no se pudieron leer las garantías no se afirma que no existan', () => {
    const a = validarProyecto({ proyecto: nuevo, frentes: plantilla, garantias: [], garantiasDisponibles: false, hoy: HOY });
    assert.ok(!a.some((x) => x.titulo.startsWith('No hay garantías')));
  });
});

describe('Valores sugeridos del formulario de proyecto nuevo (lib/fuentesSupuestos)', () => {
  test('CAPEX de 100 MW con interconexión estándar: USD 97,400,000 (PRUEBA B se creó con 96,450,000 por el multiplicador 0.99 de Zacatecas, que no tenía fuente)', () => {
    assert.equal(interconexionReferencia('standard'), 2_400_000);
    assert.equal(capexReferencia(100, 'Zacatecas', interconexionReferencia('standard')), 97_400_000);
  });
  test('cualquier estado (incluso uno desconocido) da el mismo CAPEX; capacidad vacía usa 50 MW', () => {
    assert.equal(capexReferencia(10, 'Atlántida', 0), capexReferencia(10, 'Sonora', 0));
    assert.deepEqual([opexReferencia(''), arrendamientoReferencia('')], [600_000, 125_000]);
  });
  test('OPEX y arrendamiento proporcionales a la capacidad', () => {
    assert.deepEqual([opexReferencia(100), arrendamientoReferencia(100)], [1_200_000, 250_000]);
  });
  test('cada grupo de valores sugeridos tiene su fuente', () => {
    for (const t of Object.values(FUENTES_PROYECTO_NUEVO)) assert.ok(t.length > 20);
    assert.ok(Object.values(PERFILES_INTERCONEXION).every((p) => p.km > 0 && p.baseCost > 0));
  });
});

describe('Proyecto sin RTB objetivo', () => {
  const sinRtb = { ...nuevo, fechaRtb: null };
  test('genera la advertencia "Falta la fecha RTB objetivo"', () => {
    const a = validarProyecto({ proyecto: sinRtb, frentes: plantilla, garantias: [garantia()], hoy: HOY });
    assert.ok(a.some((x) => x.sev === 'advertencia' && x.titulo === 'Falta la fecha RTB objetivo'));
  });
  test('el entregable de garantías queda pendiente (no se puede comprobar sin RTB)', () => {
    const c = calcularCoberturaGarantias([garantia()], null, 90);
    assert.equal(c.estado, 'pendiente');
    assert.equal(c.limite, null);
  });
  test('una garantía vencida sigue siendo crítica aunque no haya RTB', () => {
    const a = validarProyecto({ proyecto: sinRtb, frentes: [], garantias: [garantia({ vence: '2026-01-01' })], hoy: HOY });
    assert.ok(a.some((x) => x.sev === 'critico' && x.etiqueta === 'Vencida'));
  });
  test('el conteo no se rompe con datos vacíos', () => {
    const a = validarProyecto({ proyecto: sinRtb, frentes: [], garantias: [], hoy: HOY });
    assert.deepEqual(contarAlertas(a), { criticas: 1, advertencias: 1, informativas: 0 });
  });
});
