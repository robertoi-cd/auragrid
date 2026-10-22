// IVA de construcción v1 (fase 1: motor). Caso del usuario: Alpha I, importación directa, 80 % del CAPEX sujeto a
// IVA, tasa 16 %, recuperación a 4 meses, contrato de equipos 24,000,000.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { crearModeloFinanciero, calendarioPagos, calendarioIva, type Movimiento } from '../src/lib/modeloFinanciero';
import { calcularRentabilidad, compararEstructuras, valorPresenteFechado, type Supuestos } from '../src/lib/rentabilidad';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { calcularIva, problemasIva, flujosFechadosIva, FALTA_PLAZO_IVA, FALTA_SUJETO_IVA, FALTA_ORIGEN_IVA, FALTA_FINANCIAMIENTO_IVA, FUENTE_TASA_IVA, NOTA_TASA_IVA, NOTA_IVA, LIMITACION_IVA_IMPORTACION } from '../src/lib/iva';
import { validarProyecto } from '../src/lib/validaciones';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const CAPEX = 46_500_000;

/** Mismo camino que el tablero: cronograma de ejemplo con la deuda dimensionada. */
function caso(cambios: Partial<Supuestos>) {
  const s: Supuestos = { ...SUPUESTOS_ILUSTRATIVOS, ...cambios };
  const base = crearModeloFinanciero(ALPHA);
  const cc = crearModeloFinanciero(ALPHA, [], []);
  const calendario = calendarioPagos(cc.pagos, s.mesesConstruccion, cc.fechaNtp);
  const sinIva = compararEstructuras({ ...s, ivaActivo: false }, base.capex, base.mwdc, calendario).find((x) => x.estructura === s.estructuraSeleccionada)!;
  const f = crearModeloFinanciero({ ...ALPHA, capex: sinIva.capex }, [], [], { deuda: sinIva.deuda, idc: sinIva.usos.idc, comision: sinIva.usos.comision, dsra: sinIva.usos.dsra });
  const calIva = calendarioIva(f.pagos, s.ivaOrigenEquipo, f.fechaNtp);
  const r = calcularRentabilidad(s, s.estructuraSeleccionada, base.capex, base.mwdc, calendario, calIva);
  return { s, r, f, calIva, calendario, base };
}
const IVA_ALPHA: Partial<Supuestos> = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'importacion', ivaFinanciamiento: 'equity' };

describe('IVA de construcción: caso de Alpha I (importación directa, 80 %, 16 %, 4 meses)', () => {
  const { r, f } = caso(IVA_ALPHA);
  const iva = r.iva!;
  test('el contrato de equipos del ejemplo es de 24,000,000', () => assert.equal(f.contratoEquipos, 24_000_000));
  test('IVA total 5,952,000 (80 % × 46,500,000 × 16 %)', () => assert.equal(Math.round(iva.total), 5_952_000));
  test('pico 4,864,000 en feb 2028; saldo neto de fin de mes 4,288,000; saldo 0 en jun 2028', () => {
    assert.equal(Math.round(iva.pico), 4_864_000);
    assert.equal(iva.mesPico, '2028-02');
    assert.equal(Math.round(iva.saldoFinMesPico), 4_288_000);
    assert.equal(iva.mesSaldoCero, '2028-06');
  });
  test('tabla mensual: pagos al inicio, devoluciones al final, recuperación a los 4 meses', () => {
    const fila = (mes: string) => iva.meses.find((m) => m.mes === mes)!;
    const r0 = (x: number) => Math.round(x);
    // jun 2027 obra civil; oct interconexión (recupera jun); nov equipo completo en el hito de entrega; feb montaje
    assert.deepEqual([r0(fila('2027-06').pagado), r0(fila('2027-10').pagado), r0(fila('2027-11').pagado), r0(fila('2028-02').pagado)], [1_088_000, 576_000, 3_072_000, 1_216_000]);
    assert.deepEqual([r0(fila('2027-10').recuperado), r0(fila('2028-02').recuperado), r0(fila('2028-03').recuperado), r0(fila('2028-06').recuperado)], [1_088_000, 576_000, 3_072_000, 1_216_000]);
    assert.equal(r0(fila('2027-10').saldoInicio), 1_664_000);
    assert.equal(r0(fila('2027-10').saldoFin), 576_000);
    assert.equal(r0(fila('2028-03').saldoFin), 1_216_000);
    // Sin IVA en meses sin pagos de obra (anticipo de equipos: importación directa, se causa en la entrega)
    assert.equal(iva.meses[0].mes, '2027-06', 'la tabla empieza en el primer mes con IVA (el anticipo de abr 2027 no lo causa)');
    assert.equal(r0(iva.meses.reduce((a, m) => a + m.pagado, 0)), r0(iva.meses.reduce((a, m) => a + m.recuperado, 0)));
  });
  test('notas: supuesto simplificado y la limitación de la fecha de importación', () => {
    assert.ok(iva.notas.includes(NOTA_IVA));
    assert.equal(NOTA_IVA, 'Supuesto simplificado; validar con asesor fiscal.');
    assert.ok(iva.notas.includes(LIMITACION_IVA_IMPORTACION));
  });
  test('con equity: el IVA entra en el flujo de equity y baja la TIR por el tiempo; no cambia deuda, usos, DSCR ni ISR', () => {
    const sin = caso({}).r;
    assert.ok(r.tirEquity! < sin.tirEquity!);
    assert.ok(r.tirProyecto! < sin.tirProyecto!);
    assert.equal(r.deuda, sin.deuda);
    assert.equal(r.usos.total, sin.usos.total);
    assert.equal(r.dscrMinP50, sin.dscrMinP50);
    assert.deepEqual(r.anos.map((a) => a.isrConDeuda), sin.anos.map((a) => a.isrConDeuda));
  });
  test('compromiso máximo de equity por IVA 4,864,000 en feb 2028; IVA pendiente de recuperar en la COD 1,216,000', () => {
    assert.equal(Math.round(iva.compromisoMaximoEquity), 4_864_000);
    assert.equal(iva.mesCompromisoMaximo, '2028-02');
    assert.equal(iva.mesCod, '2028-04');
    assert.equal(Math.round(iva.ivaPendienteCod), 1_216_000);
  });
  test('cuadre de equity: fuentes y usos sin cambio; IVA aportado − devuelto hasta la COD = IVA pendiente en la COD', () => {
    // Los flujos anuales de construcción siguen siendo el equity de fuentes y usos (el IVA va aparte, con su fecha)
    assert.ok(Math.abs(-r.construccion.equity.reduce((a, x) => a + x, 0) - r.equity) < 0.01);
    assert.equal(Math.round(iva.equityNetoCod), Math.round(iva.ivaPendienteCod));
    // Compromiso máximo − devoluciones entre el pico y la COD (576,000 + 3,072,000) = pendiente en la COD
    assert.equal(Math.round(iva.compromisoMaximoEquity - 576_000 - 3_072_000), Math.round(iva.ivaPendienteCod));
    // Todo lo aportado regresa: la suma de los flujos de IVA al equity es 0
    assert.ok(Math.abs(iva.meses.reduce((a, m) => a + m.flujoEquity, 0)) < 0.01);
  });
  test('TIR con descuento mensual exacto: el VP de los flujos (anuales en t = k, IVA en t = meses/12) a la TIR reportada es 0', () => {
    const f = flujosFechadosIva(iva);
    const anuales = (xs: number[]) => xs.map((monto, t) => ({ t, monto }));
    const flujoEquity = [...r.construccion.equity, ...r.anos.map((a) => a.flujoEquity)];
    const flujoProyecto = [...r.construccion.proyecto, ...r.anos.map((a) => a.flujoProyecto)];
    assert.ok(Math.abs(valorPresenteFechado([...anuales(flujoEquity), ...f.equity], r.tirEquity!)) < 1);
    assert.ok(Math.abs(valorPresenteFechado([...anuales(flujoProyecto), ...f.proyecto], r.tirProyecto!)) < 1);
    // Pagos al inicio del mes (t = m/12) y devoluciones al cierre (t = (m+1)/12): jun 2027 = mes 2; feb 2028 = mes 10
    assert.deepEqual(f.equity.filter((x) => x.mes === '2028-02').map((x) => [x.momento, x.t, Math.round(x.monto)]), [['inicio', 10 / 12, -1_216_000], ['fin', 11 / 12, 576_000]]);
  });
  test('alerta: fondos de equity comprometidos contra el compromiso máximo (no contra el saldo en la COD)', () => {
    const { f: modelo } = caso(IVA_ALPHA);
    const comprometido = modelo.fondos.filter((x) => x.fuente === 'equity' && x.confirmado).reduce((a, x) => a + x.monto, 0);
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18',
      iva: { problemas: [], compromisoMaximoEquity: iva.compromisoMaximoEquity, mesCompromisoMaximo: iva.mesCompromisoMaximo, equityFuentesUsos: modelo.equity, equityComprometido: comprometido } })
      .find((x) => x.id === 'financiamiento-iva-equity');
    assert.ok(a);
    assert.match(a!.titulo, /faltan USD\s4,864,000/);
    // Con 1,216,000 adicionales (el saldo en la COD) no alcanza: sigue la alerta, por 3,648,000
    const corto = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18',
      iva: { problemas: [], compromisoMaximoEquity: iva.compromisoMaximoEquity, equityFuentesUsos: modelo.equity, equityComprometido: comprometido + 1_216_000 } })
      .find((x) => x.id === 'financiamiento-iva-equity');
    assert.match(corto!.titulo, /faltan USD\s3,648,000/);
    const suficiente = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18',
      iva: { problemas: [], compromisoMaximoEquity: iva.compromisoMaximoEquity, equityFuentesUsos: modelo.equity, equityComprometido: comprometido + 4_864_000 } })
      .find((x) => x.id === 'financiamiento-iva-equity');
    assert.equal(suficiente, undefined);
  });
});

describe('IVA: compra local', () => {
  const { r } = caso({ ...IVA_ALPHA, ivaOrigenEquipo: 'local' });
  test('el IVA del equipo se causa en cada pago de equipos, incluido el anticipo', () => {
    const fila = (mes: string) => r.iva!.meses.find((m) => m.mes === mes)!;
    assert.equal(Math.round(fila('2027-04').pagado), 614_400); // anticipo 4,800,000 × 12.8 %
    assert.equal(Math.round(fila('2027-08').pagado), 1_228_800); // embarque 9,600,000
    assert.equal(Math.round(r.iva!.total), 5_952_000);
    assert.ok(!r.iva!.notas.includes(LIMITACION_IVA_IMPORTACION));
  });
});

describe('IVA: línea de crédito', () => {
  test('línea suficiente: dispone con cada pago, repaga con la devolución, cobra intereses y comisión', () => {
    const { r } = caso({ ...IVA_ALPHA, ivaFinanciamiento: 'linea', ivaLineaMonto: 5_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 1 });
    const iva = r.iva!;
    assert.equal(iva.lineaInsuficiente, false);
    assert.equal(iva.comisionLinea, 50_000); // 1 % de 5,000,000 en la primera disposición
    assert.ok(iva.interesesLinea > 0);
    const nov = iva.meses.find((m) => m.mes === '2027-11')!;
    assert.equal(Math.round(nov.linea!.saldoInicio), 576_000);
    assert.equal(Math.round(nov.linea!.disposicion), 3_072_000);
    assert.equal(Math.round(nov.linea!.intereses), Math.round(3_648_000 * 0.12 / 12));
    assert.equal(Math.round(iva.meses.at(-1)!.linea!.saldoFin), 0);
    // El equity solo paga intereses y comisión: su compromiso máximo es la suma de ambos
    assert.ok(Math.abs(iva.meses.reduce((a, m) => a + m.ivaConEquity, 0)) < 0.01);
    assert.ok(Math.abs(iva.compromisoMaximoEquity - (iva.interesesLinea + iva.comisionLinea)) < 0.01);
  });
  test('línea menor al pico: el excedente lo pone el equity y hay alerta', () => {
    const { r } = caso({ ...IVA_ALPHA, ivaFinanciamiento: 'linea', ivaLineaMonto: 4_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 0 });
    const iva = r.iva!;
    assert.equal(iva.lineaInsuficiente, true);
    const feb = iva.meses.find((m) => m.mes === '2028-02')!;
    assert.equal(Math.round(feb.linea!.disposicion), 352_000);
    assert.equal(Math.round(feb.ivaConEquity), 864_000);
    assert.equal(iva.comisionLinea, 0, 'comisión capturada en 0 % = sin comisión');
    // El compromiso de equity incluye los 864,000 que no cubre la línea
    assert.ok(iva.compromisoMaximoEquity > 864_000);
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18',
      iva: { problemas: [], pico: iva.pico, mesPico: iva.mesPico, financiamiento: 'linea', lineaMonto: 4_000_000 } }).find((x) => x.id === 'financiamiento-iva-linea');
    assert.ok(a);
    assert.match(a!.titulo, /Línea de IVA menor al pico de IVA \(USD\s4,864,000 en 2028-02\)/);
    assert.match(a!.detalle, /excedente de hasta USD\s864,000 lo cubre el equity/);
  });
});

describe('IVA: datos faltantes (sin valores inventados)', () => {
  test('falta el plazo de recuperación: solo la TIR queda en N/D; el DSCR se sigue mostrando', () => {
    const { r } = caso({ ...IVA_ALPHA, ivaRecuperacionMeses: null });
    assert.deepEqual(r.problemasIva, [FALTA_PLAZO_IVA]);
    assert.equal(FALTA_PLAZO_IVA, 'Falta plazo de recuperación de IVA.');
    assert.equal(r.tirProyecto, null);
    assert.equal(r.tirEquity, null);
    assert.equal(r.iva, null);
    assert.ok(r.dscrMinP50! > 1);
    assert.equal(r.deuda, caso({}).r.deuda);
  });
  test('falta el % sujeto y los datos de la línea (también la comisión); con el IVA apagado nunca falta nada', () => {
    assert.deepEqual(problemasIva({ ...SUPUESTOS_ILUSTRATIVOS, ...IVA_ALPHA, ivaCapexSujetoPct: null, ivaFinanciamiento: 'linea' }),
      [FALTA_SUJETO_IVA, 'Falta el monto de la línea de crédito IVA.', 'Falta la tasa anual de la línea de crédito IVA.', 'Falta la comisión de la línea de crédito IVA (0 % es válido).']);
    assert.deepEqual(problemasIva({ ...SUPUESTOS_ILUSTRATIVOS }), []);
    assert.throws(() => calcularIva({ ...SUPUESTOS_ILUSTRATIVOS, ...IVA_ALPHA, ivaCapexSujetoPct: null }, CAPEX, { inicio: '2027-04', eventos: [], sinHitoEntrega: false }, 12), /Falta % del CAPEX/);
  });
  test('alerta de datos faltantes', () => {
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18', iva: { problemas: [FALTA_PLAZO_IVA] } })
      .find((x) => x.id === 'financiamiento-iva-datos');
    assert.ok(a);
    assert.match(a!.detalle, /Falta plazo de recuperación de IVA\./);
    assert.match(a!.detalle, /el DSCR no depende del IVA y se sigue mostrando/);
  });
  test('cronograma capturado sin hito de entrega: IVA del equipo en sus pagos y alerta informativa', () => {
    const pagos: Movimiento[] = [
      { tipo: 'pago', concepto: 'Módulos FV', fecha: '2027-05-10', monto: 10_000_000, estado: 'Programado', partida: 'equipos' },
      { tipo: 'pago', concepto: 'Obra civil', fecha: '2027-07-10', monto: 5_000_000, estado: 'Programado' },
    ];
    const cal = calendarioIva(pagos, 'importacion')!;
    assert.equal(cal.sinHitoEntrega, true);
    assert.deepEqual(cal.eventos.map((e) => e.mes), ['2027-05', '2027-07']);
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], hoy: '2026-10-18', iva: { problemas: [], sinHitoEntrega: true } })
      .find((x) => x.id === 'financiamiento-iva-entrega');
    assert.equal(a?.sev, 'info');
  });
});

describe('Regresión: con el IVA apagado, todas las cifras quedan exactamente iguales', () => {
  const { r, f } = caso({});
  test('usos 49,277,575; TIR de equity 8.15 %; DSCR mínimo 1.408x (valores de antes del IVA)', () => {
    assert.equal(f.usos, 49_277_575);
    assert.equal(r.tirEquity, 0.08149473508380792);
    assert.equal(r.tirProyecto, 0.08040882180057107);
    assert.equal(r.dscrMinP50, 1.4077246094770113);
    assert.equal(r.deuda, 28731460.58011552);
    assert.equal(r.equity, 20546114.74276445);
    assert.equal(r.iva, null);
    assert.deepEqual(r.problemasIva, []);
  });
  test('pasar el calendario de IVA con el IVA apagado no cambia nada', () => {
    const { s, base, calendario, calIva } = caso({});
    const con = calcularRentabilidad(s, s.estructuraSeleccionada, base.capex, base.mwdc, calendario, calIva);
    const sinParametro = calcularRentabilidad(s, s.estructuraSeleccionada, base.capex, base.mwdc, calendario);
    assert.deepEqual(con, sinParametro);
  });
});

describe('IVA: al activarlo, todo vacío salvo la tasa de ley', () => {
  test('sin origen del equipo ni forma de financiamiento por defecto: son obligatorios', () => {
    assert.equal(SUPUESTOS_ILUSTRATIVOS.ivaOrigenEquipo, null);
    assert.equal(SUPUESTOS_ILUSTRATIVOS.ivaFinanciamiento, null);
    assert.deepEqual(problemasIva({ ...SUPUESTOS_ILUSTRATIVOS, ivaActivo: true }), [FALTA_SUJETO_IVA, FALTA_PLAZO_IVA, FALTA_ORIGEN_IVA, FALTA_FINANCIAMIENTO_IVA]);
  });
  test('la tasa viene prellenada en 16 % con su fuente (LIVA art. 1) y la nota de la región fronteriza', () => {
    assert.equal(SUPUESTOS_ILUSTRATIVOS.ivaTasaPct, 16);
    assert.equal(FUENTE_TASA_IVA, 'LIVA art. 1');
    assert.match(NOTA_TASA_IVA, /región fronteriza norte puede aplicar 8 %/);
  });
  test('con línea, la comisión de 0 % es válida', () => {
    assert.deepEqual(problemasIva({ ...SUPUESTOS_ILUSTRATIVOS, ...IVA_ALPHA, ivaFinanciamiento: 'linea', ivaLineaMonto: 5_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 0 }), []);
  });
});
