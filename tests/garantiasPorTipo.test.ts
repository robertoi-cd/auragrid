// Garantías validadas según su tipo: interconexión (CENACE) → COD + margen; cumplimiento EPC → fin de
// construcción + margen; las demás → RTB + margen.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validarProyecto, calcularCoberturaGarantias, categoriaGarantia, referenciaGarantia, describirReferencia, vigenciaPorDefecto,
  aplicarEntregablesAutomaticos, calcularAvance, situacionRtb, contarAlertas, estadoGarantia,
  ENTREGABLE_GARANTIAS, ENTREGABLE_GARANTIAS_ANTERIOR,
  type Garantia, type FechasClave, type Frente,
} from '../src/lib/validaciones';
import { crearModeloFinanciero, fechasClave, sumarMeses, type Movimiento } from '../src/lib/modeloFinanciero';
import { FRENTES_INICIALES } from '../src/lib/datosProyecto.js';

const RTB = '2027-03-31';
const HOY = '2026-10-12';
const FECHAS: FechasClave = { rtb: RTB, cod: '2028-04-15', finConstruccion: '2028-04-15', estimadas: false };
// Garantías de Alpha I como están en la base
const ALPHA: Garantia[] = [
  { tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
  { tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'Afianzadora', concepto: 'Garantía de interconexión', monto: 1_250_000, vence: '2027-07-05', estado: 'vigente' },
  { tipo: 'Fianza', beneficiario: 'Alpha I (SPV)', emisor: 'Afianzadora', concepto: 'Cumplimiento EPC', monto: 1_340_000, vence: '2027-12-31', estado: 'vigente' },
];

describe('Categoría de cada garantía', () => {
  test('CENACE o "interconexión" → interconexión', () => {
    assert.equal(categoriaGarantia(ALPHA[1]), 'interconexion');
    assert.equal(categoriaGarantia({ tipo: 'Fianza', beneficiario: 'CFE', concepto: 'Obras de Interconexión' }), 'interconexion');
  });
  test('"EPC" o "cumplimiento" → cumplimiento EPC', () => assert.equal(categoriaGarantia(ALPHA[2]), 'cumplimiento_epc'));
  test('las demás (p. ej. pago de equipos) → otra', () => assert.equal(categoriaGarantia(ALPHA[0]), 'otra'));
});

describe('Fecha contra la que se valida cada una', () => {
  test('interconexión → COD + 90 días', () => {
    const r = referenciaGarantia(ALPHA[1], FECHAS, 90);
    assert.deepEqual([r.hito, r.fecha, r.limite], ['COD', '2028-04-15', '2028-07-14']);
    assert.equal(describirReferencia(r, 90), 'COD 15 abr 2028 + 90 días = 14 jul 2028');
  });
  test('cumplimiento EPC → fin de construcción + 90 días', () => {
    const r = referenciaGarantia(ALPHA[2], FECHAS, 90);
    assert.deepEqual([r.hito, r.limite], ['fin de construcción', '2028-07-14']);
  });
  test('las demás → RTB + 90 días', () => {
    assert.deepEqual([referenciaGarantia(ALPHA[0], FECHAS, 90).hito, referenciaGarantia(ALPHA[0], FECHAS, 90).limite], ['RTB', '2027-06-29']);
  });
  test('sin COD conocida, todas contra el RTB (comportamiento anterior)', () => {
    const r = referenciaGarantia(ALPHA[1], { rtb: RTB, cod: null, finConstruccion: null, estimadas: false }, 90);
    assert.deepEqual([r.hito, r.limite], ['RTB', '2027-06-29']);
  });
  test('fechas estimadas se marcan como tales', () => {
    assert.match(describirReferencia(referenciaGarantia(ALPHA[1], { ...FECHAS, estimadas: true }, 90), 90), /COD 15 abr 2028 \(estimada\)/);
  });
});

describe('Campo "Vigencia requerida hasta"', () => {
  const HITOS: FechasClave = { ...FECHAS, ntp: '2027-04-15', finInterconexion: '2027-10-31', finInterconexionEstimada: false };
  const cenace = ALPHA[1];
  const ref = (cambios: Partial<Garantia>) => referenciaGarantia({ ...cenace, ...cambios }, HITOS, 90);
  test('valores por defecto: interconexión → COD, cumplimiento EPC → fin de construcción, otras → RTB', () => {
    assert.deepEqual(ALPHA.map(vigenciaPorDefecto), ['rtb', 'cod', 'fin_construccion']);
    assert.equal(ref({}).porDefecto, true);
  });
  test('cada opción se valida contra su fecha', () => {
    assert.deepEqual([ref({ vigenciaRequerida: 'rtb' }).hito, ref({ vigenciaRequerida: 'rtb' }).fecha], ['RTB', RTB]);
    assert.deepEqual([ref({ vigenciaRequerida: 'ntp' }).hito, ref({ vigenciaRequerida: 'ntp' }).fecha], ['NTP', '2027-04-15']);
    assert.deepEqual([ref({ vigenciaRequerida: 'interconexion' }).hito, ref({ vigenciaRequerida: 'interconexion' }).fecha], ['conclusión de obras de interconexión', '2027-10-31']);
    assert.deepEqual([ref({ vigenciaRequerida: 'cod' }).hito, ref({ vigenciaRequerida: 'cod' }).fecha], ['COD', '2028-04-15']);
    assert.deepEqual([ref({ vigenciaRequerida: 'fin_construccion' }).hito, ref({ vigenciaRequerida: 'fin_construccion' }).fecha], ['fin de construcción', '2028-04-15']);
    const especifica = ref({ vigenciaRequerida: 'fecha', vigenciaFecha: '2028-01-15' });
    assert.deepEqual([especifica.hito, especifica.fecha, especifica.limite, especifica.porDefecto], ['fecha específica', '2028-01-15', '2028-04-14', false]);
  });
  test('el valor capturado manda sobre el del tipo', () => assert.equal(ref({ vigenciaRequerida: 'ntp' }).vigencia, 'ntp'));
  test('si el hito elegido no tiene fecha (sin cronograma ni RTB conocidos), se valida contra el RTB', () => {
    const r = referenciaGarantia({ ...cenace, vigenciaRequerida: 'interconexion' }, { rtb: RTB, cod: null, finConstruccion: null, estimadas: false }, 90);
    assert.deepEqual([r.hito, r.fecha], ['RTB', RTB]);
  });
  test('conclusión de interconexión estimada se marca como tal', () => {
    const r = referenciaGarantia({ ...cenace, vigenciaRequerida: 'interconexion' }, { ...HITOS, finInterconexionEstimada: true }, 90);
    assert.match(describirReferencia(r, 90), /conclusión de obras de interconexión 31 oct 2027 \(estimada\)/);
  });

  const alertas = (g: Garantia) =>
    validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: [g], fechasClave: HITOS, hoy: HOY }).filter((a) => a.categoria === 'Garantías');
  test('vence antes de su fecha requerida (conclusión de interconexión 31 oct 2027): requiere prórroga, con la nota del Manual', () => {
    const a = alertas({ ...cenace, vence: '2027-09-30', vigenciaRequerida: 'interconexion' });
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['info', 'Garantías: 1 requiere prórroga']]);
    assert.match(a[0].detalle, /31 días antes de la conclusión de obras de interconexión/);
    assert.match(a[0].detalle, /Manual de Interconexión \(cap\. 15 garantías financieras\)/i);
  });
  test('dentro del margen (NTP 15 abr 2027 + 90 días): requiere prórroga y el detalle dice cuántos días de margen cubre', () => {
    const a = alertas({ ...cenace, vence: '2027-06-01', vigenciaRequerida: 'ntp' });
    assert.match(a[0].detalle, /solo 47 de los 90 días de margen después del NTP/);
  });
  test('fecha específica: prórroga antes o dentro del margen, holgura corta justo después, sin alerta con 30 días o más', () => {
    const g = { ...ALPHA[0], vigenciaRequerida: 'fecha' as const, vigenciaFecha: '2027-12-01' };
    assert.match(alertas({ ...g, vence: '2027-11-30' })[0].detalle, /1 días antes de la fecha requerida/);
    assert.equal(alertas({ ...g, vence: '2028-01-15' })[0].titulo, 'Garantías: 1 requiere prórroga');
    assert.equal(alertas({ ...g, vence: '2028-03-15' })[0].etiqueta, 'Holgura de 15 d'); // límite 29 feb 2028
    assert.deepEqual(alertas({ ...g, vence: '2028-03-30' }), []);
  });
  test('la severidad depende de los días al vencimiento, no del hito: CENACE vence en 266 días → informativa', () => {
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB, margenGarantiasDias: 30 }, frentes: [], garantias: [cenace], fechasClave: HITOS, hoy: HOY });
    assert.equal(a.find((x) => x.categoria === 'Garantías')!.sev, 'info');
    const urgente = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: [cenace], fechasClave: HITOS, hoy: '2027-06-20' });
    assert.equal(urgente.find((x) => x.categoria === 'Garantías')!.sev, 'critico');
  });
});

describe('Alertas y entregable con las garantías de Alpha I', () => {
  const v = (fechas?: FechasClave) =>
    validarProyecto({ proyecto: { name: 'Alpha I', fechaRtb: RTB, margenGarantiasDias: 90 }, frentes: [], garantias: ALPHA, fechasClave: fechas, hoy: HOY })
      .filter((a) => a.categoria === 'Garantías');
  test('antes (todas contra el RTB): solo holgura corta (carta de crédito 1 día y CENACE 6 días sobre el 29 jun 2027)', () => {
    const a = v();
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['advertencia', 'Garantías: 2 con holgura menor a 30 días']]);
    assert.deepEqual(a[0].garantias?.map((e) => e.etiqueta), ['Holgura de 1 d', 'Holgura de 6 d']);
  });
  test('ahora: en UNA alerta (advertencia por la más grave): carta de crédito con 1 día de holgura; CENACE y EPC requieren prórroga (informativas)', () => {
    const a = v(FECHAS);
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['advertencia', 'Garantías: 2 requieren prórroga, 1 con holgura menor a 30 días']]);
    assert.match(a[0].detalle, /^1\) \[Advertencia\] Carta de crédito Proveedor de módulos .*1 día de holgura.* 2\) \[Informativa\] Fianza CENACE .*vence el 05 jul 2027, en 266 días.* 3\) \[Informativa\] Fianza Alpha I \(SPV\)/);
    assert.match(a[0].accion, /prórroga hasta después del 14 jul 2028 \(COD \+ 90 días\)/);
    assert.deepEqual(a[0].garantias?.map((e) => [e.indice, e.nivel]), [[0, 'advertencia'], [1, 'info'], [2, 'info']]);
  });
  test('una garantía de interconexión que vence dentro del margen de la COD = requiere prórroga', () => {
    const g = [{ ...ALPHA[1], vence: '2028-05-30' }];
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: g, fechasClave: FECHAS, hoy: HOY }).filter((x) => x.categoria === 'Garantías');
    assert.deepEqual(a.map((x) => [x.sev, x.titulo]), [['info', 'Garantías: 1 requiere prórroga']]);
    assert.match(a[0].detalle, /solo 45 de los 90 días de margen después de la COD/);
  });
  test('entregable de RTB: COMPLETO, porque las 3 siguen vigentes al RTB + 90 días; la continuidad a COD es seguimiento', () => {
    const c = calcularCoberturaGarantias(ALPHA, RTB, 90, true, FECHAS);
    assert.equal(c.estado, 'completo');
    assert.match(c.motivo, /siguen vigentes después del 29 jun 2027 \(RTB \+ 90 días = 29 jun 2027\)/);
    assert.match(c.motivo, /2 requieren prórroga .*no afecta el RTB/);
  });
  test('entregable de RTB: bloqueado si alguna no sigue vigente al RTB + margen, y la alerta lo dice', () => {
    const g = ALPHA.map((x, i) => (i === 1 ? { ...x, vence: '2027-05-15' } : x));
    const c = calcularCoberturaGarantias(g, RTB, 90, true, FECHAS);
    assert.deepEqual([c.estado, c.sinCobertura.map((x) => x.beneficiario)], ['bloqueado', ['CENACE']]);
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: g, fechasClave: FECHAS, hoy: HOY }).find((x) => x.id === 'garantias')!;
    assert.match(a.detalle, /Fianza CENACE .*bloquea el entregable/);
  });
  test('una garantía con vigencia requerida ANTERIOR al RTB solo necesita cubrir esa fecha + margen', () => {
    const g = [{ ...ALPHA[0], vigenciaRequerida: 'fecha' as const, vigenciaFecha: '2026-12-01', vence: '2027-03-15' }];
    assert.equal(calcularCoberturaGarantias(g, RTB, 90, true, FECHAS).estado, 'completo');
  });
  test('Alpha I al 12 oct 2026: el RTB ya no queda "En riesgo" por garantías y no hay críticas de garantías', () => {
    const frentes = aplicarEntregablesAutomaticos(FRENTES_INICIALES as unknown as Frente[], calcularCoberturaGarantias(ALPHA, RTB, 90, true, FECHAS));
    const avance = calcularAvance(frentes, RTB, HOY);
    assert.equal(avance.completos, 11);
    assert.deepEqual(avance.bloqueadosEnRiesgo, []);
    assert.notEqual(situacionRtb(avance, RTB, HOY).tipo, 'en_riesgo');
    const a = validarProyecto({ proyecto: { name: 'Alpha I', fechaRtb: RTB }, frentes, garantias: ALPHA, fechasClave: FECHAS, hoy: HOY });
    assert.deepEqual(contarAlertas(a.filter((x) => x.categoria === 'Garantías')), { criticas: 0, advertencias: 1, informativas: 0 });
    assert.deepEqual([0, 1, 2].map((i) => estadoGarantia(a, i).etiqueta), ['Holgura de 1 d', 'Requiere prórroga', 'Requiere prórroga']);
  });
  test('con las tres renovadas más allá de su fecha + margen: completo', () => {
    const renovadas = ALPHA.map((g, i) => (i === 0 ? g : { ...g, vence: '2028-08-31' }));
    assert.equal(calcularCoberturaGarantias(renovadas, RTB, 90, true, FECHAS).estado, 'completo');
  });
});

describe('Nombre del entregable de garantías', () => {
  test('el nombre anterior ("Garantías vigentes hasta RTB"), sin código, se reconoce por el catálogo, se calcula y conserva su nombre', () => {
    const frentes: Frente[] = [{ nombre: 'F', items: [[ENTREGABLE_GARANTIAS_ANTERIOR, 'completo', 'Afianzadora', '2026-12-31', { id: 'x' }]] }];
    const g = ALPHA.map((x, i) => (i === 1 ? { ...x, vence: '2027-05-15' } : x)); // CENACE no cubre el RTB + 90
    const [item] = aplicarEntregablesAutomaticos(frentes, calcularCoberturaGarantias(g, RTB, 90, true, FECHAS))[0].items;
    assert.equal(item[0], ENTREGABLE_GARANTIAS_ANTERIOR);
    assert.equal(item[4]?.codigo, 'garantias_vigencia');
    assert.equal(item[1], 'bloqueado');
    assert.equal(item[4]?.id, 'x'); // conserva el id para guardar cambios
  });
});

describe('Hitos del proyecto (NTP, conclusión de interconexión, COD, fin de construcción)', () => {
  test('cronograma de ejemplo: NTP 15 abr 2027, interconexión 31 oct 2027 (su pago), COD 15 abr 2028', () => {
    const m = crearModeloFinanciero({ id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000, esEjemplo: true }, FRENTES_INICIALES as unknown as Frente[]);
    assert.deepEqual(fechasClave(m, RTB, 12), {
      ...FECHAS, ntp: '2027-04-15', finInterconexion: '2027-10-31', finInterconexionEstimada: false,
    });
  });
  test('cronograma capturado: NTP = primer pago de obra (sin compromisos anticipados); sin pago de interconexión → COD estimada', () => {
    const pagos: Movimiento[] = [
      { tipo: 'pago', concepto: 'Reserva de módulos', fecha: '2027-01-10', monto: 1, estado: 'Programado', partida: 'equipos', esAnticipo: true, compromisoAnticipado: true },
      { tipo: 'pago', concepto: 'Obra', fecha: '2027-05-20', monto: 1, estado: 'Programado' },
    ];
    const m = { ...crearModeloFinanciero({ capacityMw: 10, capex: 10_000_000, esEjemplo: false }), pagos, origenCronograma: 'capturado' as const };
    assert.deepEqual(fechasClave(m, RTB, 12), {
      rtb: RTB, ntp: '2027-05-20', cod: '2028-05-20', finConstruccion: '2028-05-20', estimadas: false,
      finInterconexion: '2028-05-20', finInterconexionEstimada: true,
    });
  });
  test('sin cronograma: estimadas con NTP = RTB; sin RTB: desconocidas', () => {
    const m = crearModeloFinanciero({ capacityMw: 10, capex: 10_000_000, esEjemplo: false });
    assert.deepEqual(fechasClave(m, RTB, 12), {
      rtb: RTB, ntp: RTB, cod: '2028-03-31', finConstruccion: '2028-03-31', estimadas: true,
      finInterconexion: '2028-03-31', finInterconexionEstimada: true,
    });
    assert.equal(fechasClave(m, null, 12).cod, null);
  });
  test('sumar meses respeta el fin de mes', () => {
    assert.equal(sumarMeses('2027-01-31', 1), '2027-02-28');
    assert.equal(sumarMeses('2027-04-15', 12), '2028-04-15');
  });
});

describe('Alerta agrupada de garantías: un renglón por garantía con el detalle desplegable', () => {
  const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: ALPHA, fechasClave: FECHAS, hoy: HOY }).find((x) => x.id === 'garantias')!;
  test('un renglón por garantía con problema, en el orden de la alerta (severidad y vencimiento)', () => {
    assert.equal(a.garantias!.length, 3);
    assert.deepEqual(a.garantias!.map((g) => g.nombre), ['Carta de crédito Proveedor de módulos', 'Fianza CENACE', 'Fianza Alpha I (SPV)']);
    assert.deepEqual(a.garantias!.map((g) => g.vence), ['2027-06-30', '2027-07-05', '2027-12-31']);
    assert.deepEqual(a.garantias!.map((g) => g.nivel), ['advertencia', 'info', 'info']);
  });
  test('acción en pocas palabras (corta) y detalle completo intacto', () => {
    assert.deepEqual(a.garantias!.map((g) => g.accionCorta), [
      'Prórroga a 30+ días después del 29 jun 2027',
      'Prórroga hasta después del 14 jul 2028',
      'Prórroga hasta después del 14 jul 2028',
    ]);
    for (const g of a.garantias!) {
      assert.ok(g.accionCorta.length <= 60, g.accionCorta);
      assert.ok(a.detalle.includes(g.linea), 'la línea completa sigue en el detalle (el asistente recibe el mismo texto)');
      assert.ok(a.accion.includes(g.accion));
      assert.ok(g.linea.startsWith(g.nombre));
    }
  });
  test('vencida: "Emitir una nueva con <emisor>"', () => {
    const v = validarProyecto({ proyecto: { name: 'P', fechaRtb: RTB }, frentes: [], garantias: [{ ...ALPHA[0], vence: '2026-09-30' }], fechasClave: FECHAS, hoy: HOY })
      .find((x) => x.id === 'garantias')!;
    assert.equal(v.garantias![0].accionCorta, 'Emitir una nueva con Banco');
    assert.equal(v.garantias![0].nivel, 'critico');
  });
});
