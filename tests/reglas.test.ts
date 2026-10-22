// Pruebas de reglas del motor de validaciones y del modelo financiero. Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarProyecto, contarAlertas, estadoGarantia, calcularCoberturaGarantias, aplicarEntregablesAutomaticos,
  sumarDias, severidadPorPlazo, ENTREGABLE_GARANTIAS, MARGEN_GARANTIAS_DEFAULT,
  type Frente, type Garantia, type Proyecto,
} from '../src/lib/validaciones';
import { crearModeloFinanciero, calcularFlujoAcumulado } from '../src/lib/modeloFinanciero';
import { FRENTES_INICIALES, GARANTIAS, FECHA_RTB_OBJETIVO } from '../src/lib/datosProyecto.js';

const HOY = '2026-10-11';
const RTB = FECHA_RTB_OBJETIVO; // 2027-03-31
const frentesBase = FRENTES_INICIALES as unknown as Frente[];
const garantiasBase: Garantia[] = GARANTIAS.map((g) => ({ ...g, estado: 'vigente' as const }));
const proyecto = (margen?: number): Proyecto => ({ id: 'alpha-i-50mw', name: 'Alpha I', fechaRtb: RTB, margenGarantiasDias: margen });
const alpha = { id: 'alpha-i-50mw', capacityMw: 50, capex: '$46,500,000 USD', tir: '16.1%' };

const validar = (opc: { garantias?: Garantia[]; frentes?: Frente[]; margen?: number; disponibles?: boolean } = {}) =>
  validarProyecto({
    proyecto: proyecto(opc.margen), frentes: opc.frentes ?? frentesBase, garantias: opc.garantias ?? garantiasBase,
    garantiasDisponibles: opc.disponibles, hoy: HOY,
  });
const conVence = (i: number, vence: string, extra: Partial<Garantia> = {}) =>
  garantiasBase.map((g, j) => (j === i ? { ...g, vence, ...extra } : g));
const entregable = (frentes: Frente[]) => frentes.flatMap((f) => f.items).find((i) => i[0] === ENTREGABLE_GARANTIAS)!;
const frenteCon = (estado: string, fecha: string) => [{ nombre: 'X', items: [['E', estado, 'R', fecha]] }] as unknown as Frente[];

describe('Datos actuales', () => {
  test('la fianza CENACE (vence 31 ene 2027, antes del RTB) sale una sola vez: en la alerta de garantías, y bloquea el entregable', () => {
    const alertas = validar();
    const deGarantias = alertas.filter((a) => a.categoria === 'Garantías');
    // CENACE requiere prórroga (informativa: faltan 112 días) y la carta de crédito cubre RTB + 90 con 1 día de holgura (advertencia)
    assert.deepEqual(deGarantias.map((a) => a.titulo), ['Garantías: 1 requiere prórroga, 1 con holgura menor a 30 días']);
    assert.equal(deGarantias[0].sev, 'advertencia');
    // En el orden de la alerta: primero la más severa
    assert.deepEqual(deGarantias[0].garantias?.map((e) => [e.indice, e.nivel]), [[1, 'advertencia'], [0, 'info']]);
    assert.match(deGarantias[0].detalle, /Fianza CENACE .*bloquea el entregable/);
    // El entregable automático no genera una alerta propia (no se cuenta dos veces)
    assert.ok(!alertas.some((a) => a.titulo.includes(ENTREGABLE_GARANTIAS) && a.categoria === 'Frentes de trabajo'));
    assert.equal(calcularCoberturaGarantias(garantiasBase, RTB, 90).estado, 'bloqueado');
  });
});

describe('Severidad por plazo al vencimiento (garantía que necesita prórroga)', () => {
  test('más de 90 días: informativa; de 30 a 90: advertencia; menos de 30: crítica', () => {
    assert.deepEqual([120, 91, 90, 30, 29, 0, -1].map(severidadPorPlazo), ['info', 'info', 'advertencia', 'advertencia', 'critico', 'critico', 'critico']);
  });
  const nivel = (vence: string) => estadoGarantia(validar({ garantias: conVence(1, vence) }), 1);
  test('con HOY = 11 oct 2026: vence en 100 días → informativa "Requiere prórroga"', () => {
    assert.deepEqual(nivel(sumarDias(HOY, 100)), { nivel: 'info', etiqueta: 'Requiere prórroga' });
  });
  test('vence en 60 días → advertencia "Prórroga pendiente (60 d)"', () => {
    assert.deepEqual(nivel(sumarDias(HOY, 60)), { nivel: 'advertencia', etiqueta: 'Prórroga pendiente (60 d)' });
  });
  test('vence en 10 días → crítica; vencida → crítica "Vencida"', () => {
    assert.deepEqual(nivel(sumarDias(HOY, 10)), { nivel: 'critico', etiqueta: 'Vence en 10 d' });
    assert.deepEqual(nivel(sumarDias(HOY, -1)), { nivel: 'critico', etiqueta: 'Vencida' });
  });
});

describe('Alerta agrupada de garantías', () => {
  test('varias garantías con problema = una sola alerta, con la severidad más alta y el detalle de cada una', () => {
    const g = garantiasBase.map((x, i) => (i === 0 ? { ...x, vence: sumarDias(HOY, 10) } : i === 1 ? { ...x, vence: sumarDias(HOY, 60) } : x));
    const a = validar({ garantias: g }).filter((x) => x.categoria === 'Garantías');
    assert.equal(a.length, 1);
    assert.equal(a[0].sev, 'critico');
    assert.equal(a[0].titulo, 'Garantías: 2 requieren prórroga');
    assert.match(a[0].detalle, /^1\) \[Crítica\] Fianza CENACE .* 2\) \[Advertencia\] Carta de crédito Proveedor de módulos/);
    assert.deepEqual(a[0].garantias?.map((e) => [e.indice, e.nivel]), [[0, 'critico'], [1, 'advertencia']]);
    assert.equal(a[0].fecha, sumarDias(HOY, 10));
  });
  test('"No hay garantías registradas" sigue siendo una alerta aparte', () => {
    const a = validar({ garantias: [] }).filter((x) => x.categoria === 'Garantías');
    assert.deepEqual(a.map((x) => x.titulo), ['No hay garantías registradas']);
  });
  test('vencida y por vencer se cuentan en el título', () => {
    const g = garantiasBase.map((x, i) => (i === 0 ? { ...x, vence: '2026-10-01' } : i === 2 ? { ...x, vence: sumarDias(HOY, 30), vigenciaRequerida: 'fecha' as const, vigenciaFecha: '2026-06-01' } : x));
    const a = validar({ garantias: g }).find((x) => x.categoria === 'Garantías')!;
    assert.equal(a.titulo, 'Garantías: 1 vencida, 1 con holgura menor a 30 días, 1 por vencer');
  });
});

describe('Frentes de trabajo', () => {
  // Solo alertas de frentes (sin garantías también saldría "No hay garantías registradas", que se prueba aparte)
  const v = (f: Frente[]) => validarProyecto({ proyecto: proyecto(), frentes: f, garantias: [], hoy: HOY }).filter((a) => a.categoria === 'Frentes de trabajo');
  test('no completo con fecha posterior al RTB = crítico', () => assert.equal(v(frenteCon('curso', '2027-04-15'))[0]?.sev, 'critico'));
  test('completo con fecha posterior al RTB no alerta', () => assert.equal(v(frenteCon('completo', '2027-04-15')).length, 0));
  test('pendiente a 40 días = advertencia', () => assert.equal(v(frenteCon('pendiente', '2026-11-20'))[0]?.sev, 'advertencia'));
  test('pendiente a 50 días no alerta', () => assert.equal(v(frenteCon('pendiente', '2026-11-30')).length, 0));
  test('pendiente atrasado = advertencia', () => assert.equal(v(frenteCon('pendiente', '2026-10-01'))[0]?.sev, 'advertencia'));
  test('bloqueado y después del RTB = una sola alerta', () => assert.equal(v(frenteCon('bloqueado', '2027-06-01')).length, 1));
});

describe('Garantías con margen después del RTB (por defecto 90 días)', () => {
  const limite = sumarDias(RTB, MARGEN_GARANTIAS_DEFAULT); // 2027-06-29
  const alertaDe = (alertas: ReturnType<typeof validar>, i: number) => estadoGarantia(alertas, i);

  test('el límite por defecto es RTB + 90 días', () => assert.equal(limite, '2027-06-29'));
  test('vence antes del RTB = requiere prórroga (a 170 días: informativa) y bloquea el entregable', () => {
    const a = validar({ garantias: conVence(1, '2027-03-30') });
    assert.deepEqual(alertaDe(a, 1), { nivel: 'info', etiqueta: 'Requiere prórroga' });
    assert.equal(calcularCoberturaGarantias(conVence(1, '2027-03-30'), RTB, 90).estado, 'bloqueado');
  });
  test('vence el mismo día del RTB = requiere prórroga (dentro del margen)', () => {
    assert.equal(alertaDe(validar({ garantias: conVence(1, RTB) }), 1).etiqueta, 'Requiere prórroga');
  });
  test('vence justo en RTB + margen = requiere prórroga y el detalle lo explica', () => {
    const a = validar({ garantias: conVence(1, limite) });
    assert.equal(alertaDe(a, 1).etiqueta, 'Requiere prórroga');
    assert.match(a.find((x) => x.categoria === 'Garantías')!.detalle, /solo 90 de los 90 días de margen después del RTB/);
  });
  test('cubre RTB + margen con menos de 30 días de holgura = advertencia "Holgura de N d"', () => {
    assert.deepEqual(alertaDe(validar({ garantias: conVence(1, sumarDias(limite, 1)) }), 1), { nivel: 'advertencia', etiqueta: 'Holgura de 1 d' });
    assert.deepEqual(alertaDe(validar({ garantias: conVence(1, sumarDias(limite, 29)) }), 1), { nivel: 'advertencia', etiqueta: 'Holgura de 29 d' });
    const a = validar({ garantias: conVence(1, sumarDias(limite, 1)) }).find((x) => x.id === 'garantias')!;
    assert.match(a.detalle, /cubre RTB 31 mar 2027 \+ 90 días = 29 jun 2027 con solo 1 día de holgura \(mínimo recomendado: 30\)/);
    assert.match(a.accion, /al menos 30 días después del 29 jun 2027; un retraso del RTB de más de 1 día la dejaría sin cubrir/);
  });
  test('con 30 días o más de holgura = sin alerta', () => {
    assert.equal(alertaDe(validar({ garantias: conVence(1, sumarDias(limite, 30)) }), 1).etiqueta, 'Sin alerta');
  });
  test('la holgura corta no bloquea el entregable de RTB (sí lo cubre)', () => {
    assert.equal(calcularCoberturaGarantias(conVence(0, '2027-08-15'), RTB, 90).estado, 'completo'); // CENACE ok; carta con 1 día
  });
  test('el margen es configurable por proyecto: la carta de crédito (30 jun 2027) tiene 1 día de holgura con 90 y requiere prórroga con 91', () => {
    assert.equal(alertaDe(validar({ margen: 90 }), 1).etiqueta, 'Holgura de 1 d');
    assert.equal(alertaDe(validar({ margen: 91 }), 1).etiqueta, 'Requiere prórroga');
  });
  test('con margen 0 solo cuenta el RTB: vencer 1 día después del RTB lo cubre (con holgura corta)', () => {
    assert.equal(alertaDe(validar({ margen: 0, garantias: conVence(1, sumarDias(RTB, 1)) }), 1).etiqueta, 'Holgura de 1 d');
    assert.equal(alertaDe(validar({ margen: 0, garantias: conVence(1, sumarDias(RTB, 30)) }), 1).etiqueta, 'Sin alerta');
  });
  test('una garantía liberada no genera alertas', () => {
    assert.equal(alertaDe(validar({ garantias: conVence(0, '2027-01-31', { estado: 'liberada' }) }), 0).etiqueta, 'Sin alerta');
  });
  test('una garantía en renovación sigue alertando', () => {
    assert.equal(alertaDe(validar({ garantias: conVence(0, '2027-01-31', { estado: 'en_renovacion' }) }), 0).nivel, 'info');
    assert.equal(alertaDe(validar({ garantias: conVence(0, sumarDias(HOY, 20), { estado: 'en_renovacion' }) }), 0).nivel, 'critico');
  });
});

describe('Entregable automático "Garantías con la vigencia requerida"', () => {
  test('bloqueado si alguna garantía activa no cubre RTB + margen, y lo dice', () => {
    const c = calcularCoberturaGarantias(garantiasBase, RTB, 90);
    assert.equal(c.estado, 'bloqueado');
    assert.deepEqual(c.sinCobertura.map((g) => g.beneficiario), ['CENACE']);
    assert.match(c.motivo, /CENACE/);
  });
  test('completo si todas vencen después de RTB + margen', () => {
    assert.equal(calcularCoberturaGarantias(conVence(0, '2027-07-15'), RTB, 90).estado, 'completo');
  });
  test('una garantía dentro del margen (no antes del RTB) también lo bloquea', () => {
    assert.equal(calcularCoberturaGarantias(conVence(0, '2027-05-01'), RTB, 90).estado, 'bloqueado');
  });
  test('las garantías liberadas no cuentan', () => {
    assert.equal(calcularCoberturaGarantias(conVence(0, '2027-01-31', { estado: 'liberada' }), RTB, 90).estado, 'completo');
  });
  test('sin garantías activas queda pendiente (no completo)', () => {
    assert.equal(calcularCoberturaGarantias([], RTB, 90).estado, 'pendiente');
  });
  test('si no se pudieron leer las garantías queda pendiente (no completo)', () => {
    assert.equal(calcularCoberturaGarantias(garantiasBase, RTB, 90, false).estado, 'pendiente');
  });
  test('no se puede cambiar a mano: un "completo" manual se sustituye por el calculado', () => {
    const manual = frentesBase.map((f) => ({ ...f, items: f.items.map((i) => (i[0] === ENTREGABLE_GARANTIAS ? [i[0], 'completo', i[2], i[3]] : i)) })) as Frente[];
    const efectivos = aplicarEntregablesAutomaticos(manual, calcularCoberturaGarantias(garantiasBase, RTB, 90));
    assert.equal(entregable(efectivos)[1], 'bloqueado');
    assert.equal(entregable(efectivos)[4]?.auto, true);
    // validarProyecto aplica el cálculo aunque reciba el estado manual: la garantía sigue en la alerta agrupada
    const a = validar({ frentes: manual });
    assert.ok(a.some((x) => x.id === 'garantias'));
    assert.ok(!a.some((x) => x.titulo === `Bloqueado: ${ENTREGABLE_GARANTIAS}`));
  });
  test('es idempotente', () => {
    const c = calcularCoberturaGarantias(garantiasBase, RTB, 90);
    const una = aplicarEntregablesAutomaticos(frentesBase, c);
    assert.deepEqual(aplicarEntregablesAutomaticos(una, c), una);
  });
  test('renovar CENACE después de RTB + margen quita la alerta de garantías y completa el entregable al instante', () => {
    assert.ok(validar().some((a) => a.id === 'garantias'));
    const despues = validar({ garantias: conVence(0, '2027-08-15') });
    // CENACE ya no aparece; solo queda la carta de crédito con holgura corta
    assert.deepEqual(despues.find((a) => a.id === 'garantias')?.garantias?.map((e) => e.indice), [1]);
    assert.equal(calcularCoberturaGarantias(conVence(0, '2027-08-15'), RTB, 90).estado, 'completo');
  });
  test('sin datos de garantías el entregable no da crítica falsa de "completo" ni de "bloqueado"', () => {
    const a = validar({ garantias: [], disponibles: false });
    assert.ok(!a.some((x) => x.titulo === `Bloqueado: ${ENTREGABLE_GARANTIAS}`));
  });
});

describe('Modelo financiero (Alpha I)', () => {
  const f = crearModeloFinanciero(alpha, frentesBase);
  const suma = (l: { monto: number }[]) => l.reduce((s, x) => s + x.monto, 0);
  const tramos = f.fondos.filter((x) => x.fuente === 'deuda');
  test('CAPEX 46,500,000 = equity 13,950,000 + deuda 32,550,000', () => {
    assert.deepEqual([f.capex, f.equity, f.deuda], [46_500_000, 13_950_000, 32_550_000]);
  });
  test('tramo 1 20,000,000 + tramo 2 12,550,000', () => assert.deepEqual(tramos.map((t) => t.monto), [20_000_000, 12_550_000]));
  test('anticipo de equipos 20 % = 4,800,000', () => assert.deepEqual([f.anticipoEquipos, f.anticipoPct], [4_800_000, 0.2]));
  test('fuentes = usos = pagos', () => { assert.equal(suma(f.fondos), f.capex); assert.equal(suma(f.pagos), f.capex); });
  test('50 MWac / 62.5 MWdc', () => assert.deepEqual([f.mwac, f.mwdc], [50, 62.5]));
  test('hay hueco de caja mientras el tramo 2 no esté aprobado', () => assert.ok(calcularFlujoAcumulado(f).some((p) => p.hueco > 0)));
  test('con el tramo 2 aprobado el hueco desaparece', () => {
    const aprobado = frentesBase.map((x) => ({ ...x, items: x.items.map((i) => (i[0] === 'Aprobación de crédito tramo 2' ? [i[0], 'completo', i[2], i[3]] : i)) })) as Frente[];
    assert.ok(!calcularFlujoAcumulado(crearModeloFinanciero(alpha, aprobado)).some((p) => p.hueco > 0));
  });
  test('Beta II escalado sigue cuadrando', () => {
    const b = crearModeloFinanciero({ id: 'beta-ii-100mw', capacityMw: 100, capex: '$89,300,000 USD' }, frentesBase);
    assert.equal(b.equity + b.deuda, b.capex);
    assert.equal(suma(b.pagos), b.capex);
  });
});
