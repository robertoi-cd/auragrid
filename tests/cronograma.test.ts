// Cronograma de caja capturado por el usuario. Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearModeloFinanciero, calcularFlujoAcumulado, type Movimiento } from '../src/lib/modeloFinanciero';
import { validarProyecto, type Garantia } from '../src/lib/validaciones';

// CAPEX 10 M → equity 3 M (30 %) + deuda 7 M
const proyecto = { capacityMw: 10, capex: 10_000_000, esEjemplo: false };
const pago = (concepto: string, fecha: string, monto: number, extra: Partial<Movimiento> = {}): Movimiento =>
  ({ id: concepto, tipo: 'pago', concepto, fecha, monto, estado: 'Programado', ...extra });
const fondo = (concepto: string, fecha: string, monto: number, fuente: 'equity' | 'deuda', confirmado = true): Movimiento =>
  ({ id: concepto, tipo: 'fondo', concepto, fecha, monto, estado: confirmado ? 'Aprobado' : 'En revisión', fuente, confirmado });

const completo = [
  fondo('Equity', '2027-01-01', 3_000_000, 'equity'),
  fondo('Tramo 1', '2027-01-15', 7_000_000, 'deuda'),
  pago('Anticipo equipos', '2027-02-01', 1_000_000, { partida: 'equipos', esAnticipo: true }),
  pago('Equipos resto', '2027-03-01', 4_000_000, { partida: 'equipos' }),
  pago('Obra civil', '2027-04-01', 5_000_000),
];
const garantia: Garantia = { tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'A', concepto: '', monto: 1, vence: '2030-01-01', estado: 'vigente' };
const financiamiento = (movs: Movimiento[], esEjemplo = false) =>
  validarProyecto({
    // RTB antes de los pagos de prueba (feb-abr 2027): estas pruebas son de cuadre, no de obra antes del RTB
    proyecto: { name: 'X', fechaRtb: '2027-01-31' }, frentes: [], garantias: [garantia],
    finanzas: crearModeloFinanciero({ ...proyecto, esEjemplo }, [], movs), hoy: '2026-10-11',
  }).filter((a) => a.categoria === 'Financiamiento');

describe('Modelo con cronograma capturado', () => {
  test('los movimientos capturados tienen prioridad, incluso en un proyecto de ejemplo', () => {
    const f = crearModeloFinanciero({ ...proyecto, esEjemplo: true }, [], completo);
    assert.equal(f.origenCronograma, 'capturado');
    assert.equal(f.pagos.length, 3);
    assert.equal(f.fondos.length, 2);
  });
  test('se ordenan por fecha y se separan pagos y fondos', () => {
    const f = crearModeloFinanciero(proyecto, [], [...completo].reverse());
    assert.deepEqual(f.pagos.map((p) => p.concepto), ['Anticipo equipos', 'Equipos resto', 'Obra civil']);
  });
  test('contrato de equipos y anticipo salen de los pagos marcados', () => {
    const f = crearModeloFinanciero(proyecto, [], completo);
    assert.deepEqual([f.contratoEquipos, f.anticipoEquipos, f.anticipoPct], [5_000_000, 1_000_000, 0.2]);
  });
  test('sin movimientos: proyecto real sin cronograma, ejemplo con el ilustrativo', () => {
    assert.equal(crearModeloFinanciero(proyecto, [], []).origenCronograma, 'ninguno');
    assert.equal(crearModeloFinanciero({ ...proyecto, esEjemplo: true }, [], []).origenCronograma, 'ejemplo');
  });
});

describe('Convertir el ejemplo en editable (Alpha I)', () => {
  const alpha = { capacityMw: 50, capex: '$46,500,000 USD', esEjemplo: true };
  const ejemplo = crearModeloFinanciero(alpha);
  // Lo que hace copiarCronogramaEjemplo: los mismos movimientos, con tipo e id
  const copiados: Movimiento[] = [
    ...ejemplo.pagos.map((p, i) => ({ ...p, tipo: 'pago' as const, id: `p${i}` })),
    ...ejemplo.fondos.map((f, i) => ({ ...f, tipo: 'fondo' as const, id: `f${i}` })),
  ];
  const copia = crearModeloFinanciero(alpha, [], copiados);
  test('pasa a cronograma capturado con los mismos 11 movimientos', () => {
    assert.equal(ejemplo.origenCronograma, 'ejemplo');
    assert.equal(copia.origenCronograma, 'capturado');
    assert.equal(copia.pagos.length + copia.fondos.length, 11);
  });
  test('mismos totales, contrato y anticipo del 20 %', () => {
    const suma = (l: Movimiento[]) => l.reduce((s, x) => s + x.monto, 0);
    assert.equal(suma(copia.pagos), suma(ejemplo.pagos));
    assert.equal(suma(copia.fondos), suma(ejemplo.fondos));
    assert.deepEqual([copia.contratoEquipos, copia.anticipoEquipos, copia.anticipoPct], [ejemplo.contratoEquipos, ejemplo.anticipoEquipos, 0.2]);
  });
  test('mismo flujo de caja (y mismo hueco) que el ejemplo', () => {
    assert.deepEqual(calcularFlujoAcumulado(copia), calcularFlujoAcumulado(ejemplo));
  });
  test('cuadra: sin alertas de cronograma incompleto ni de montos de más', () => {
    const a = validarProyecto({ proyecto: { name: 'Alpha I', fechaRtb: '2027-03-31' }, frentes: [], garantias: [garantia], finanzas: copia, hoy: '2026-10-11' });
    assert.ok(!a.some((x) => x.titulo === 'Cronograma de caja incompleto' || x.titulo === 'Cronograma de caja con montos de más'));
  });
});

describe('Alertas con cronograma capturado', () => {
  test('cronograma completo y cubierto: sin alertas de financiamiento', () => {
    assert.deepEqual(financiamiento(completo), []);
  });
  test('cronograma a medias: advertencia "incompleto" (no crítica de descuadre)', () => {
    const a = financiamiento(completo.slice(0, 3));
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['advertencia', 'Cronograma de caja incompleto']]);
    assert.match(a[0].detalle, /pagos programados USD\s9,000,000/); // \s: es-MX usa espacio no separable
  });
  test('programar de más es crítico', () => {
    const a = financiamiento([...completo, pago('Extra', '2027-05-01', 500_000)]);
    assert.ok(a.some((x) => x.sev === 'critico' && x.titulo === 'Cronograma de caja con montos de más'));
  });
  test('un fondo no confirmado no cubre pagos: hueco de caja (advertencia a más de 90 días, crítico a 90 o menos)', () => {
    const movs = completo.map((m) => (m.concepto === 'Tramo 1' ? fondo('Tramo 1', '2027-01-15', 7_000_000, 'deuda', false) : m));
    const f = crearModeloFinanciero(proyecto, [], movs);
    assert.ok(calcularFlujoAcumulado(f).some((p) => p.hueco > 0));
    // El hueco empieza el 1 mar 2027 (Equipos resto supera al equity confirmado): a 141 días del 11 oct 2026
    const lejos = financiamiento(movs).find((x) => x.titulo.startsWith('Hueco de caja'))!;
    assert.equal(lejos.sev, 'advertencia');
    assert.match(lejos.detalle, /empieza en 141 días \(pasa a crítico a 90 días o menos\)/);
    // La acción pide confirmar el fondo antes de su desembolso programado, no en la fecha del hueco
    assert.match(lejos.accion, /^Confirmar a más tardar en su fecha de desembolso programada: Tramo 1 .*desembolso 15 ene 2027/);
    const cerca = validarProyecto({ proyecto: { name: 'P', fechaRtb: '2027-03-31' }, frentes: [], garantias: [], finanzas: f, hoy: '2026-12-15' })
      .find((x) => x.titulo.startsWith('Hueco de caja'))!;
    assert.equal(cerca.sev, 'critico');
  });
  test('fondeo justo a tiempo: un fondo que llega el mismo día (o menos de 5 días antes) del pago que cubre = advertencia', () => {
    const justo = [
      fondo('Equity', '2027-01-01', 3_000_000, 'equity'),
      fondo('Tramo 1', '2027-02-28', 7_000_000, 'deuda'),
      pago('Anticipo equipos', '2027-02-01', 1_000_000, { partida: 'equipos', esAnticipo: true }),
      pago('Equipos resto', '2027-03-01', 4_000_000, { partida: 'equipos' }),
      pago('Obra civil', '2027-04-01', 5_000_000),
    ];
    const a = financiamiento(justo).find((x) => x.id === 'financiamiento-fondeo-justo')!;
    assert.equal(a.sev, 'advertencia');
    assert.match(a.detalle, /Equipos resto \(01 mar 2027, USD\s4,000,000\) depende de Tramo 1, que llega 1 días antes/);
    // Con 5 días o más de holgura no hay alerta
    const holgado = justo.map((m) => (m.concepto === 'Tramo 1' ? { ...m, fecha: '2027-02-24' } : m));
    assert.ok(!financiamiento(holgado).some((x) => x.id === 'financiamiento-fondeo-justo'));
  });
  test('fondeo justo: los pagos financieros (comisión, intereses, DSRA) no cuentan', () => {
    const movs = [
      fondo('Equity', '2027-01-01', 3_000_000, 'equity'),
      fondo('Tramo 1', '2027-01-15', 7_000_000, 'deuda'),
      pago('Comisión', '2027-01-01', 100_000, { partida: 'financiero' }),
    ];
    assert.ok(!financiamiento(movs).some((x) => x.id === 'financiamiento-fondeo-justo'));
  });
  test('con solo el anticipo capturado no se marca "anticipo excesivo" (el contrato aún no se conoce)', () => {
    const f = crearModeloFinanciero(proyecto, [], [completo[2]]);
    assert.equal(f.anticipoPct, 0);
    assert.ok(!financiamiento([completo[2]]).some((x) => x.titulo.startsWith('Anticipo de equipos')));
  });
  test('anticipo de equipos mayor al 30 % del contrato capturado es crítico', () => {
    const movs = completo.map((m) => (m.concepto === 'Anticipo equipos' ? { ...m, monto: 2_000_000 } : m.concepto === 'Equipos resto' ? { ...m, monto: 3_000_000 } : m));
    assert.ok(financiamiento(movs).some((x) => x.sev === 'critico' && x.titulo.startsWith('Anticipo de equipos del 40 %')));
  });
});
