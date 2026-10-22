// IVA de construcción, fase 2 (pantallas): la cadena de la app (analizarProyecto) con el calendario de IVA fechado,
// el costo financiero, el hueco de caja con IVA, una sola alerta por el mismo IVA, la lectura de las columnas nuevas
// y el editor. Con el IVA apagado, todo idéntico a antes.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { tarjetaProyecto } from '../src/lib/portafolio';
import { validarProyecto, type Garantia } from '../src/lib/validaciones';
import { calcularFlujoAcumulado, type ModeloFinanciero } from '../src/lib/modeloFinanciero';
import { movimientosIva, NOTA_TASA_LINEA_IVA, textoDescuentoCostoIva } from '../src/lib/iva';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { Supuestos } from '../src/lib/rentabilidad';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { aSupuestos, COLUMNAS } from '../src/lib/supuestosApi';
// @ts-expect-error CamposIva es JSX (sin declaración de tipos)
import { revisarIva, ivaDelBorrador, valorIva, descripcionIva } from '../src/CamposIva';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const GARANTIAS: Garantia[] = [
  { id: 'g1', tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
];
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const IVA: Partial<Supuestos> = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 4, ivaOrigenEquipo: 'importacion', ivaFinanciamiento: 'equity' };
const analizar = (s: Supuestos) => analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: s, calcularPrecioMinimo: true });
const tres = (x: number) => (x * 100).toFixed(3);

describe('Caso de verificación del usuario a través de la cadena de la app (importación, 80 %, 16 %, 4 meses, equity)', () => {
  const a = analizar({ ...S, ...IVA });
  const iva = a.rentabilidad.iva;
  test('IVA total 5,952,000; pico 4,864,000 en feb 2028; pendiente en la COD 1,216,000', () => {
    assert.equal(Math.round(iva.total), 5_952_000);
    assert.equal(Math.round(iva.pico), 4_864_000);
    assert.equal(iva.mesPico, '2028-02');
    assert.equal(Math.round(iva.ivaPendienteCod), 1_216_000);
  });
  test('TIR de equity 8.077 % y de proyecto 7.995 % (con el calendario de IVA fechado)', () => {
    assert.equal(tres(a.rentabilidad.tirEquity), '8.077');
    assert.equal(tres(a.rentabilidad.tirProyecto), '7.995');
    assert.ok(a.calIva && a.calIva.inicio === '2027-04', 'mes 0 = NTP (abr 2027)');
  });
  test('costo financiero: a la TIR objetivo de equity capturada (12 %) = 258,002; sin objetivo, a la TIR sin IVA = 183,117', () => {
    assert.equal(S.tirEquityObjetivoPct, 12);
    assert.equal(a.costoIva!.baseDescuento, 'objetivo');
    assert.equal(a.costoIva!.tasaDescuento, 0.12);
    assert.equal(Math.round(a.costoIva!.valorPresenteNtp!), 258_002);
    assert.equal(textoDescuentoCostoIva(a.costoIva), 'Flujos de IVA a cargo del equity descontados a la TIR objetivo de equity (12.00 %)');
    const sinObjetivo = analizar({ ...S, ...IVA, tirEquityObjetivoPct: null } as Supuestos);
    assert.equal(sinObjetivo.costoIva!.baseDescuento, 'sinIva');
    assert.equal(sinObjetivo.costoIva!.tasaDescuento, 0.08149473508380792);
    assert.equal(Math.round(sinObjetivo.costoIva!.valorPresenteNtp!), 183_117);
    assert.equal(textoDescuentoCostoIva(sinObjetivo.costoIva), 'Flujos de IVA a cargo del equity descontados a la TIR de equity sin IVA (8.15 %; no hay TIR objetivo capturada)');
    // El impacto en pp no depende de la tasa del costo
    assert.equal(sinObjetivo.costoIva!.impactoTirEquity, a.costoIva!.impactoTirEquity);
    assert.equal(a.costoIva!.tirEquitySinIva, 0.08149473508380792);
  });
  test('impacto en las TIR contra el mismo proyecto sin IVA', () => {
    assert.equal(a.costoIva!.nominalLinea, null);
    assert.equal(a.costoIva!.impactoTirEquity!.toFixed(5), (a.rentabilidad.tirEquity - 0.08149473508380792).toFixed(5));
    assert.ok(a.costoIva!.impactoTirProyecto! < 0);
  });
  test('la tarjeta de Inicio da la misma TIR (misma cadena)', () => {
    const t = tarjetaProyecto(ALPHA, { frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: { ...S, ...IVA } as Supuestos }, '2026-10-19');
    assert.equal(t.tirEquity, a.rentabilidad.tirEquity);
  });
  test('con línea: además intereses + comisión nominales; el VP usa la misma medida', () => {
    const l = analizar({ ...S, ...IVA, ivaFinanciamiento: 'linea', ivaLineaMonto: 5_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 1 });
    assert.equal(l.costoIva!.nominalLinea, l.rentabilidad.iva.interesesLinea + l.rentabilidad.iva.comisionLinea);
    assert.ok(l.costoIva!.valorPresenteNtp! > 0);
  });
});

describe('IVA apagado: todo idéntico a hoy', () => {
  test('mismas cifras, mismas alertas, sin movimientos de IVA en el modelo', () => {
    const hoy = analizar(S);
    const conCampos = analizar({ ...S, ...IVA, ivaActivo: false });
    assert.equal(hoy.rentabilidad.tirEquity, 0.08149473508380792);
    assert.equal(hoy.rentabilidad.tirProyecto, 0.08040882180057107);
    assert.deepEqual(conCampos.rentabilidad.tirEquity, hoy.rentabilidad.tirEquity);
    assert.deepEqual(conCampos.alertas, hoy.alertas);
    assert.deepEqual(conCampos.finanzas, hoy.finanzas);
    assert.equal(hoy.calIva, null);
    assert.equal(hoy.costoIva, null);
    assert.equal('iva' in hoy.finanzas, false);
  });
});

describe('Hueco de caja con IVA y una sola alerta por el mismo IVA', () => {
  test('los movimientos del IVA: pagos al inicio del mes y devoluciones al cierre; suman lo pagado y lo recuperado', () => {
    const iva = analizar({ ...S, ...IVA }).rentabilidad.iva;
    const m = movimientosIva(iva);
    assert.equal(Math.round(m.salidas.reduce((s, x) => s + x.monto, 0)), 5_952_000);
    assert.equal(Math.round(m.entradas.reduce((s, x) => s + x.monto, 0)), 5_952_000);
    assert.ok(m.salidas.every((x) => x.fecha.endsWith('-01')));
    assert.ok(m.entradas.find((x) => x.fecha.startsWith('2028-02'))!.fecha === '2028-02-29');
  });
  test('Alpha I con IVA: el hueco de caja lo incluye y la alerta lo dice', () => {
    const a = analizar({ ...S, ...IVA });
    const caja = a.alertas.find((x) => x.id === 'financiamiento-caja')!;
    assert.match(caja.detalle, /incluido el IVA de construcción/);
    const sinIva = calcularFlujoAcumulado({ pagos: a.finanzas.pagos, fondos: a.finanzas.fondos });
    const conIva = calcularFlujoAcumulado(a.finanzas);
    assert.ok(Math.max(...conIva.map((p) => p.hueco)) > Math.max(...sinIva.map((p) => p.hueco)));
  });
  const modelo = (iva: ModeloFinanciero['iva'], fondos = 100): ModeloFinanciero => ({
    pagos: [{ concepto: 'Obra', fecha: '2027-05-01', monto: 100, estado: 'Programado' }],
    fondos: [{ concepto: 'Equity', fecha: '2027-04-01', monto: fondos, estado: 'Confirmado', fuente: 'equity', confirmado: true }],
    equity: 100, deuda: 0, usos: 100, capex: 100, conCronograma: true, origenCronograma: 'capturado', iva,
  } as unknown as ModeloFinanciero);
  const ivaEquity = { problemas: [], compromisoMaximoEquity: 16, equityFuentesUsos: 100, equityComprometido: 100 };
  const movs = { salidas: [{ concepto: 'IVA pagado', fecha: '2027-05-01', monto: 16, estado: 'IVA', confirmado: true }], entradas: [{ concepto: 'Devolución de IVA', fecha: '2027-09-30', monto: 16, estado: 'IVA', confirmado: true }] };
  test('si el hueco se debe solo al IVA: una sola alerta (la de caja explica la causa)', () => {
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], finanzas: modelo(movs), hoy: '2026-10-19', iva: ivaEquity });
    assert.equal(a.filter((x) => x.id === 'financiamiento-iva-equity').length, 0);
    assert.match(a.find((x) => x.id === 'financiamiento-caja')!.detalle, /El hueco se debe al IVA de construcción: El IVA compromete hasta/);
  });
  test('si el hueco existe también sin IVA: las dos, y la de equity remite a la de caja', () => {
    const a = validarProyecto({ proyecto: { name: 'P', fechaRtb: null }, frentes: [], garantias: [], finanzas: modelo(movs, 90), hoy: '2026-10-19', iva: { ...ivaEquity, equityComprometido: 90 } });
    const eq = a.find((x) => x.id === 'financiamiento-iva-equity')!;
    assert.match(eq.detalle, /también agranda el hueco de caja \(ver la alerta "Hueco de caja desde/);
    assert.ok(a.find((x) => x.id === 'financiamiento-caja'));
  });
});

describe('Columnas nuevas y editor', () => {
  test('cada supuesto de IVA tiene su columna', () => {
    assert.deepEqual(
      ['ivaActivo', 'ivaTasaPct', 'ivaCapexSujetoPct', 'ivaRecuperacionMeses', 'ivaOrigenEquipo', 'ivaFinanciamiento', 'ivaLineaMonto', 'ivaLineaTasaPct', 'ivaLineaComisionPct'].map((c) => COLUMNAS[c]),
      ['iva_activo', 'iva_tasa_pct', 'iva_capex_sujeto_pct', 'iva_recuperacion_meses', 'iva_origen_equipo', 'iva_financiamiento', 'iva_linea_monto', 'iva_linea_tasa_pct', 'iva_linea_comision_pct']);
  });
  test('lectura: vacío se conserva vacío (nunca un valor supuesto); sin las columnas (antes de la migración), IVA apagado', () => {
    const s = aSupuestos({ iva_activo: true, iva_tasa_pct: 16, iva_capex_sujeto_pct: null, iva_origen_equipo: null, iva_financiamiento: 'linea', iva_linea_comision_pct: 0 });
    assert.deepEqual([s.ivaActivo, s.ivaTasaPct, s.ivaCapexSujetoPct, s.ivaOrigenEquipo, s.ivaFinanciamiento, s.ivaLineaComisionPct], [true, 16, null, null, 'linea', 0]);
    const antes = aSupuestos({});
    assert.deepEqual([antes.ivaActivo, antes.ivaTasaPct, antes.ivaOrigenEquipo, antes.ivaFinanciamiento], [false, 16, null, null]);
  });
  test('editor: la tasa es obligatoria; lo demás puede quedar vacío, pero en rango si se captura', () => {
    assert.match(revisarIva({ ivaTasaPct: '' }), /tasa de IVA es obligatoria/);
    assert.equal(revisarIva({ ivaTasaPct: 16, ivaCapexSujetoPct: '' }), '');
    assert.match(revisarIva({ ivaTasaPct: 16, ivaRecuperacionMeses: 2.5 }), /meses enteros/);
    assert.match(revisarIva({ ivaTasaPct: 16, ivaCapexSujetoPct: 120 }), /CAPEX sujeto a IVA/);
    assert.equal(revisarIva({ ivaTasaPct: 16, ivaLineaComisionPct: 0 }), '');
  });
  test('editor: lo vacío se guarda como null; los números como número; el resumen dice "Sin capturar"', () => {
    const b = ivaDelBorrador({ ivaActivo: true, ivaTasaPct: '16', ivaCapexSujetoPct: '', ivaOrigenEquipo: '', ivaFinanciamiento: 'equity', ivaRecuperacionMeses: '4' });
    assert.deepEqual([b.ivaActivo, b.ivaTasaPct, b.ivaCapexSujetoPct, b.ivaOrigenEquipo, b.ivaFinanciamiento, b.ivaRecuperacionMeses], [true, 16, null, null, 'equity', 4]);
    assert.equal(valorIva('ivaOrigenEquipo', null), 'Sin capturar');
    assert.match(descripcionIva({ ...S, ...IVA }), /16\.00 % sobre 80\.00 % del CAPEX · Importación directa · recuperación: 4 meses · financiamiento: Equity/);
  });
  test('Finanzas: la tarjeta y las filas de IVA solo con el IVA activo; el lector no edita', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /\{supuestos\?\.ivaActivo && \(\s*<section data-seccion="iva">/);
    const tarjeta = fs.readFileSync('src/TarjetaIva.jsx', 'utf8');
    assert.match(tarjeta, /Costo financiero del IVA \(valor presente al NTP\)/);
    assert.match(tarjeta, /costo de oportunidad, no es un gasto/);
    // Línea IVA: monto en equivalente USD y la nota de pesos / tipo de cambio, en el editor y en la tarjeta.
    const editor = fs.readFileSync('src/CamposIva.jsx', 'utf8');
    assert.ok(editor.includes("'Monto máximo (equivalente en USD)'"));
    assert.ok(editor.includes("numero('ivaLineaTasaPct', 0.1, '% anual', NOTA_TASA_LINEA_IVA)"));
    assert.ok(tarjeta.includes('Monto máximo de la línea (equivalente en USD)'));
    assert.ok(tarjeta.includes('{NOTA_TASA_LINEA_IVA}'));
    assert.equal(NOTA_TASA_LINEA_IVA, 'La línea IVA suele ser en pesos (TIIE + margen); el modelo está en USD y no considera tipo de cambio.');
    assert.match(fs.readFileSync('src/FinancialDashboard.jsx', 'utf8'), /\{projectId && <button type="button" style=\{boton\} onClick=\{abrir\}>Editar supuestos<\/button>\}/);
  });
  test('migración: fecha posterior a 20261021100000, solo agrega columnas, IVA apagado y tasa 16 por defecto', () => {
    const f = fs.readdirSync('supabase/migrations').find((x) => /_iva_supuestos\.sql$/.test(x))!;
    assert.ok(f.slice(0, 14) > '20261021100000');
    const sql = fs.readFileSync(`supabase/migrations/${f}`, 'utf8');
    assert.match(sql, /add column if not exists iva_activo boolean not null default false/);
    assert.match(sql, /add column if not exists iva_tasa_pct numeric not null default 16/);
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\bdrop\b|\bupdate\b|\bdelete\b/i);
  });
});
