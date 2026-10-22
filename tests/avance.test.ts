// Pruebas del seguimiento de atraso contra plan: entregables vencidos, avance planeado vs real y RTB proyectado.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarProyecto, calcularAvance, situacionRtb, aplicarEntregablesAutomaticos, calcularCoberturaGarantias, DIAS_VENCIDO_CRITICO,
  type Frente, type Garantia, type EstadoEntregable,
} from '../src/lib/validaciones';
import { FRENTES_INICIALES, GARANTIAS } from '../src/lib/datosProyecto.js';

const HOY = '2026-10-12';
const RTB = '2027-03-31';
const frente = (...items: [string, EstadoEntregable, string | null][]): Frente[] =>
  [{ nombre: 'X', items: items.map(([t, e, f]) => [t, e, 'R', f]) }];
const alertas = (f: Frente[], fechaRtb: string | null = RTB) =>
  validarProyecto({ proyecto: { name: 'P', fechaRtb }, frentes: f, garantias: [], hoy: HOY }).filter((a) => a.categoria === 'Frentes de trabajo');

describe('Entregables vencidos', () => {
  test('en curso, vencido hace 10 días = advertencia', () => {
    const a = alertas(frente(['E', 'curso', '2026-10-02']));
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'advertencia');
    assert.equal(a[0].etiqueta, 'Vencido 10 d');
    assert.match(a[0].titulo, /^Vencido hace 10 días: E/);
    assert.match(a[0].detalle, /Sigue en curso/);
  });
  test('pendiente vencido también alerta (antes solo "atrasado sin iniciar")', () => {
    assert.equal(alertas(frente(['E', 'pendiente', '2026-10-01']))[0].sev, 'advertencia');
  });
  test(`exactamente ${DIAS_VENCIDO_CRITICO} días = advertencia; ${DIAS_VENCIDO_CRITICO + 1} días = crítica (en la ruta hacia RTB)`, () => {
    assert.equal(alertas(frente(['E', 'curso', '2026-09-12']))[0].sev, 'advertencia'); // 30 días
    const a = alertas(frente(['E', 'curso', '2026-09-11']))[0]; // 31 días
    assert.equal(a.sev, 'critico');
    assert.match(a.detalle, /ruta hacia el RTB/);
  });
  test('vence hoy = no está vencido', () => assert.equal(alertas(frente(['E', 'curso', HOY])).length, 0));
  test('completo con fecha pasada = sin alerta', () => assert.equal(alertas(frente(['E', 'completo', '2026-01-01'])).length, 0));
  test('sin fecha compromiso = no puede estar vencido', () => assert.equal(alertas(frente(['E', 'curso', null])).length, 0));
  test('bloqueado y vencido = una sola alerta crítica que menciona el vencimiento', () => {
    const a = alertas(frente(['E', 'bloqueado', '2026-09-01']));
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'critico');
    assert.equal(a[0].etiqueta, 'Bloqueado');
    assert.match(a[0].detalle, /venció hace 41 días/);
  });
  test('sin RTB definido: todos los entregables van hacia RTB (vencido > 30 días = crítica)', () => {
    assert.equal(alertas(frente(['E', 'curso', '2026-08-01']), null)[0].sev, 'critico');
  });
  test('si el RTB ya pasó y la fecha era posterior al RTB: crítica "Fuera de plazo" con la nota de vencido', () => {
    const a = alertas(frente(['E', 'curso', '2026-09-10']), '2026-09-01');
    assert.equal(a.length, 1);
    assert.equal(a[0].etiqueta, 'Después del RTB');
    assert.match(a[0].detalle, /venció hace 32 días/);
  });
  test('una alerta por cada vencido', () => {
    assert.equal(alertas(frente(['A', 'curso', '2026-10-01'], ['B', 'pendiente', '2026-08-01'], ['C', 'curso', '2026-12-01'])).length, 2);
  });
});

describe('Avance planeado vs real y RTB proyectado', () => {
  const f = frente(
    ['A', 'completo', '2026-05-01'],
    ['B', 'completo', '2026-11-01'],   // completo antes de lo planeado
    ['C', 'curso', '2026-09-01'],      // vencido 41 días
    ['D', 'pendiente', '2026-10-05'],  // vencido 7 días
    ['E', 'curso', '2027-02-15'],
    ['F', 'pendiente', null],          // sin fecha
  );
  const a = calcularAvance(f, RTB, HOY);
  test('real = completos / total; planeado = fecha compromiso ≤ hoy / total', () => {
    assert.deepEqual([a.total, a.completos, a.planeados], [6, 2, 3]);
    assert.equal(a.realPct, 2 / 6);
    assert.equal(a.planeadoPct, 3 / 6);
  });
  test('vencidos ordenados del más vencido al menos, con su severidad', () => {
    assert.deepEqual(a.vencidos.map((v) => [v.titulo, v.diasVencido, v.critico]), [['C', 41, true], ['D', 7, false]]);
  });
  test('cuenta los no completos sin fecha', () => assert.equal(a.sinFecha, 1));
  test('RTB proyectado = fecha del no completo más tardío; a tiempo si es anterior al objetivo', () => {
    assert.equal(a.rtbProyectado, '2027-02-15');
    assert.equal(a.entregableRtbProyectado, 'E');
    assert.equal(a.diasAtraso, 0);
  });
  test('si el más tardío es posterior al RTB objetivo, muestra los días de atraso', () => {
    const b = calcularAvance(frente(['X', 'curso', '2027-04-30']), RTB, HOY);
    assert.equal(b.rtbProyectado, '2027-04-30');
    assert.equal(b.diasAtraso, 30);
  });
  test('un vencido no puede cerrarse en el pasado: cuenta como hoy', () => {
    const b = calcularAvance(frente(['X', 'curso', '2026-08-01'], ['Y', 'completo', '2027-01-01']), RTB, HOY);
    assert.equal(b.rtbProyectado, HOY);
  });
  test('sin RTB objetivo no hay días de atraso; todo completo = sin proyección', () => {
    assert.equal(calcularAvance(f, null, HOY).diasAtraso, null);
    const c = calcularAvance(frente(['X', 'completo', '2026-01-01']), RTB, HOY);
    assert.equal(c.rtbProyectado, null);
    assert.equal(c.realPct, 1);
  });
  test('proyecto sin entregables: 0 % y sin división entre cero', () => {
    const c = calcularAvance([], RTB, HOY);
    assert.deepEqual([c.realPct, c.planeadoPct, c.vencidos.length], [0, 0, 0]);
  });
});

describe('RTB proyectado en riesgo por entregables bloqueados', () => {
  test('bloqueado con fecha ≤ RTB: no dice "a tiempo", dice "en riesgo" (ámbar si falta y no está vencido)', () => {
    const a = calcularAvance(frente(['X', 'bloqueado', '2027-01-15'], ['Y', 'curso', '2027-02-01']), RTB, HOY);
    assert.deepEqual(a.bloqueadosEnRiesgo, [{ titulo: 'X', fecha: '2027-01-15', vencido: false }]);
    assert.equal(a.diasAtraso, 0);
    assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'en_riesgo', bloqueados: 1, grave: false });
  });
  test('el día del RTB también cuenta (fecha = RTB)', () => {
    const a = calcularAvance(frente(['X', 'bloqueado', RTB]), RTB, HOY);
    assert.equal(a.bloqueadosEnRiesgo.length, 1);
  });
  test('rojo si el bloqueado ya venció', () => {
    const a = calcularAvance(frente(['X', 'bloqueado', '2026-09-01'], ['Y', 'curso', '2027-02-01']), RTB, HOY);
    assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'en_riesgo', bloqueados: 1, grave: true });
  });
  test(`rojo si faltan ${DIAS_VENCIDO_CRITICO} días o menos para el RTB`, () => {
    const a = calcularAvance(frente(['X', 'bloqueado', '2027-03-20']), RTB, '2027-03-05');
    assert.deepEqual(situacionRtb(a, RTB, '2027-03-05'), { tipo: 'en_riesgo', bloqueados: 1, grave: true });
  });
  test('bloqueado con fecha posterior al RTB no cuenta como "en riesgo" (ya es atraso)', () => {
    const a = calcularAvance(frente(['X', 'bloqueado', '2027-04-30']), RTB, HOY);
    assert.equal(a.bloqueadosEnRiesgo.length, 0);
    assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'atraso', dias: 30, bloqueados: 0 });
  });
  test('atraso y bloqueados a la vez: manda el atraso y se informan los bloqueados', () => {
    const a = calcularAvance(frente(['X', 'bloqueado', '2027-01-15'], ['Y', 'curso', '2027-04-30']), RTB, HOY);
    assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'atraso', dias: 30, bloqueados: 1 });
  });
  test('sin bloqueados y antes del objetivo = a tiempo; sin RTB = sin proyección', () => {
    const a = calcularAvance(frente(['Y', 'curso', '2027-02-01']), RTB, HOY);
    assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'a_tiempo' });
    assert.deepEqual(situacionRtb(calcularAvance(frente(['X', 'bloqueado', '2027-01-15']), null, HOY), null, HOY), { tipo: 'sin_proyeccion' });
  });
});

describe('Alpha I (12 oct 2026)', () => {
  const conCambios = (cambios: Record<string, EstadoEntregable>) => (FRENTES_INICIALES as unknown as Frente[]).map((f) => ({
    ...f,
    items: f.items.map((i): Frente['items'][number] => (i[0] in cambios ? [i[0], cambios[i[0]], i[2], i[3]] : i)),
  }));
  // Garantías actuales: la fianza CENACE ya se renovó (vence 5 jul 2027) y todas cubren RTB + 90 días
  const garantias: Garantia[] = (GARANTIAS as Garantia[]).map((g) => ({ ...g, estado: 'vigente', vence: g.beneficiario === 'CENACE' ? '2027-07-05' : g.vence }));
  const avance = (cambios: Record<string, EstadoEntregable>) =>
    calcularAvance(aplicarEntregablesAutomaticos(conCambios(cambios), calcularCoberturaGarantias(garantias, RTB, 90)), RTB, HOY);

  describe('con los cambios sin intención (topográfico en curso, MIA bloqueada)', () => {
    const a = avance({ 'Levantamiento topográfico y deslinde': 'curso', 'Resolutivo de MIA': 'bloqueado' });
    test('10 de 20 completos (real 50 %) y 10 con fecha ya pasada (planeado 50 %)', () => {
      assert.deepEqual([a.completos, a.total, a.planeados], [10, 20, 10]);
    });
    test('1 vencido: el levantamiento topográfico (157 días, crítico)', () => {
      assert.deepEqual(a.vencidos.map((v) => [v.titulo, v.diasVencido, v.critico]), [['Levantamiento topográfico y deslinde', 157, true]]);
    });
    test('RTB proyectado 28 feb 2027 pero EN RIESGO por la MIA bloqueada (no "a tiempo")', () => {
      assert.equal(a.rtbProyectado, '2027-02-28');
      assert.equal(a.diasAtraso, 0);
      assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'en_riesgo', bloqueados: 1, grave: false });
    });
  });

  describe('después de la corrección (topográfico completo, MIA en curso)', () => {
    const a = avance({});
    test('11 de 20 completos (real 55 %) frente a planeado 50 %, sin vencidos', () => {
      assert.deepEqual([a.completos, a.planeados, a.vencidos.length], [11, 10, 0]);
    });
    test('RTB proyectado 28 feb 2027 (contrato de interconexión): a tiempo', () => {
      assert.equal(a.entregableRtbProyectado, 'Contrato de interconexión');
      assert.deepEqual(situacionRtb(a, RTB, HOY), { tipo: 'a_tiempo' });
    });
  });
});
