// Nivel bancario A, fase 2: COD +6 meses (servicio fijo en fechas, DSRA), disponibilidad y curtailment, reemplazo de
// inversores con MMRA, alertas de lock-up y "Sin cola de PPA". Vacío = no aplica y ninguna cifra cambia.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { NOTA_COD6 } from '../src/lib/escenarios';
import { reemplazoInversores, factorDisponibilidad, type Supuestos } from '../src/lib/rentabilidad';
import { validarProyecto } from '../src/lib/validaciones';
import { CAMPOS_RIESGOS, GRUPOS } from '../src/lib/camposSupuestos';
import type { Credito } from '../src/lib/creditos';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { COLUMNAS, OPCIONALES, aSupuestos } from '../src/lib/supuestosApi';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const MIGRADO: Credito = { orden: 1, banco: null, participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, comisionNoDisposicionPct: null, estado: 'aprobado' };
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const analizar = (s: Partial<Supuestos> = {}) => analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...S, ...s } as Supuestos, creditos: [MIGRADO] });
const VACIOS: Partial<Supuestos> = Object.fromEntries(CAMPOS_RIESGOS.map(([c]) => [c, null]));
const cod6De = (a: ReturnType<typeof analizar>) => a.escenarios!.find((e) => e.clave === 'cod6')!;

describe('Riesgos vacíos: ninguna cifra cambia', () => {
  test('con los 8 campos en null, rentabilidad, finanzas y alertas iguales a sin ellos', () => {
    const sin = analizar(), con = analizar(VACIOS);
    assert.deepEqual(con.rentabilidad, sin.rentabilidad);
    assert.deepEqual(con.finanzas, sin.finanzas);
    assert.deepEqual(con.alertas, sin.alertas);
    assert.deepEqual(con.escenarios, sin.escenarios);
    assert.equal(factorDisponibilidad({}), 1);
  });
  test('Alpha I sigue en deuda 28,731,461 y TIR de equity 8.15 %', () => {
    const a = analizar(VACIOS);
    assert.equal(Math.round(a.rentabilidad.deuda), 28_731_461);
    assert.equal((a.rentabilidad.tirEquity * 100).toFixed(2), '8.15');
  });
});

describe('COD +6 meses en Alpha I (servicio fijo en fechas, PPA desde la COD, DSRA)', () => {
  const a = analizar();
  const e = cod6De(a);
  const c = e.cod6!;
  test('cifras del usuario: CFADS ≈ 2.44 M, servicio ≈ 3.46 M, DSCR ≈ 0.70x, faltante ≈ 1.02 M, DSRA 1.73 M', () => {
    assert.equal(Math.round(c.cfadsAno1), 2_436_100);
    assert.equal(Math.round(c.servicioAno1), 3_461_046);
    assert.equal(c.dscrAno1!.toFixed(3), '0.704');
    assert.equal(Math.round(c.faltante), 1_024_946);
    assert.equal(Math.round(c.dsra), 1_730_523);
  });
  test('la DSRA cubre el faltante y se repone en el año 2; sin alerta de incumplimiento', () => {
    assert.equal(c.usoDsra, c.faltante);
    assert.equal(c.alcanza, true);
    assert.equal(c.anoRepuesta, 2);
    assert.ok(!a.alertas.some((x) => x.id === 'financiamiento-cod6'));
  });
  test('6 meses de intereses adicionales sobre la deuda dispuesta, a la tasa de los créditos (≈ 1.0 M, con equity)', () => {
    assert.equal(c.interesesAdicionales, a.rentabilidad.deuda * 0.07 * 0.5);
    assert.equal(Math.round(c.interesesAdicionales), 1_005_601);
    assert.equal(c.penalizacionEpc, 0);
  });
  test('vida útil de 30 años desde la COD real: 31 años de calendario (el último con medio año)', () => {
    assert.equal(e.dscr.length, 31);
    assert.ok(e.anosBajoCovenant.includes(1));
    assert.ok(e.tirEquity! < a.rentabilidad.tirEquity);
  });
  test('nota del escenario: penalizaciones o terminación del PPA no modeladas', () => {
    assert.match(NOTA_COD6, /El retraso puede generar penalizaciones al comprador del PPA o la terminación si se pasa la fecha límite de inicio; no modelado\.$/);
    assert.match(fs.readFileSync('ROADMAP.md', 'utf8'), /COD con retraso y el PPA:\*\* el retraso puede generar penalizaciones al comprador del PPA o la terminación/);
  });
  test('penalización del EPC (USD/día × 182.5 hasta el tope) reduce el faltante; sin tope, no aplica', () => {
    const con = cod6De(analizar({ epcPenalizacionUsdDia: 5000, epcPenalizacionTopeUsd: 500_000 })).cod6!;
    assert.equal(con.penalizacionEpc, 500_000);
    assert.equal(Math.round(con.faltante), 1_024_946 - 500_000);
    assert.equal(cod6De(analizar({ epcPenalizacionUsdDia: 5000 })).cod6!.penalizacionEpc, 0);
  });
  test('si la DSRA no alcanza: alerta crítica "Incumplimiento de pago en el año 1 con COD +6 meses"', () => {
    const b = analizar({ dsraMeses: 3 });
    const d = cod6De(b).cod6!;
    assert.equal(d.alcanza, false);
    assert.ok(d.usoDsra < d.faltante);
    const alerta = b.alertas.find((x) => x.id === 'financiamiento-cod6')!;
    assert.equal(alerta.sev, 'critico');
    assert.equal(alerta.titulo, 'Incumplimiento de pago en el año 1 con COD +6 meses');
    assert.equal(Math.round(alerta.monto!), Math.round(d.faltante - d.usoDsra));
  });
});

describe('Disponibilidad y curtailment', () => {
  test('reducen la producción P50 (y P90): 98 % × (1 − 2 %)', () => {
    const base = analizar(), r = analizar({ disponibilidadPct: 98, curtailmentPct: 2 });
    assert.equal(factorDisponibilidad({ disponibilidadPct: 98, curtailmentPct: 2 }), 0.98 * 0.98);
    assert.ok(Math.abs(r.rentabilidad.anos[0].energiaMwh - base.rentabilidad.anos[0].energiaMwh * 0.9604) < 1e-6);
    assert.ok(Math.abs(r.rentabilidad.anos[0].energiaP90Mwh - base.rentabilidad.anos[0].energiaP90Mwh * 0.9604) < 1e-6);
    assert.ok(r.rentabilidad.deuda < base.rentabilidad.deuda, 'menos producción, menos deuda');
  });
});

describe('Reemplazo de inversores con reserva MMRA', () => {
  const s = { ...S, reemplazoInversoresAno: 12, reemplazoInversoresUsdKwac: 60, mmraAnosFondeo: 3 } as Supuestos;
  test('costo = USD/kWac × kWac (nominal); MMRA en los 3 años previos, en partes iguales', () => {
    const rep = reemplazoInversores(s, 62.5)!;
    assert.equal(rep.costo, 60 * 50_000);
    assert.deepEqual(rep.anosFondeo, [9, 10, 11]);
    assert.deepEqual(rep.reservas.slice(7, 12), [0, 1_000_000, 1_000_000, 1_000_000, 0]);
    assert.equal(rep.capex[11], 3_000_000);
    assert.equal(rep.depreciacion[11], 3_000_000, 'esquema de Alpha: 100 % en el año (tasa del equipo de generación)');
  });
  test('el CFADS de los años de fondeo baja en la aportación (afecta DSCR y flujo al equity); el proyecto paga en el año 12', () => {
    const r = analizar({ reemplazoInversoresAno: 12, reemplazoInversoresUsdKwac: 60, mmraAnosFondeo: 3 }).rentabilidad;
    const a9 = r.anos[8];
    assert.ok(Math.abs(a9.cfads - (a9.ebitda - a9.isrConDeuda - 1_000_000)) < 1e-6);
    const a12 = r.anos[11];
    assert.ok(Math.abs(a12.cfads - (a12.ebitda - a12.isrConDeuda)) < 1e-6, 'en el año 12 lo paga la reserva');
    assert.ok(Math.abs(a12.flujoProyecto - (a12.ebitda - a12.isrSinDeuda - 3_000_000)) < 1e-6);
  });
  test('sin años de fondeo, se paga con la caja del año del reemplazo', () => {
    const rep = reemplazoInversores({ ...s, mmraAnosFondeo: null }, 62.5)!;
    assert.equal(rep.reservas[11], 3_000_000);
    assert.deepEqual(rep.anosFondeo, []);
  });
  test('sin año o sin costo, no aplica', () => {
    assert.equal(reemplazoInversores({ ...S, reemplazoInversoresAno: 12 } as Supuestos, 62.5), null);
    assert.equal(reemplazoInversores({ ...S, reemplazoInversoresUsdKwac: 60 } as Supuestos, 62.5), null);
  });
});

describe('Alertas de lock-up y "Sin cola de PPA"', () => {
  test('lock-up 1.10x: solo COD +6 meses queda por debajo (año 1, 0.70x)', () => {
    const a = analizar({ dscrLockup: 1.1 });
    const l = a.alertas.find((x) => x.id === 'financiamiento-lockup')!;
    assert.equal(l.sev, 'advertencia');
    assert.equal(l.titulo, 'Lock-up: DSCR bajo 1.10x en 1 caso');
    assert.match(l.detalle, /COD \+6 meses \(año 1, mínimo 0\.70x\)/);
    assert.ok(!analizar().alertas.some((x) => x.id === 'financiamiento-lockup'), 'sin DSCR de lock-up capturado, no aplica');
  });
  test('sin cola de PPA: deuda igual al PPA o un año menos (informativa); más corta, nada; más larga, la advertencia de antes', () => {
    const v = (plazoDeudaAnos: number) => validarProyecto({
      proyecto: { id: 'x', name: 'X', fechaRtb: '2027-03-31' } as never, frentes: [], garantias: [],
      rentabilidad: { estado: 'calculada', dscrMinP50: 1.4, dscrMinP90: 1.3, covenant: 1.15, dscrDimensionamientoP50: 1.3, dscrDimensionamientoP90: 1.2, plazoDeudaAnos, ppaPlazoAnos: 15 },
    }).filter((a) => a.id === 'financiamiento-cola-ppa' || a.id === 'financiamiento-plazo');
    assert.deepEqual(v(15).map((a) => [a.id, a.sev]), [['financiamiento-cola-ppa', 'info']]);
    assert.match(v(15)[0].detalle, /iguala al del PPA \(15 años\); los bancos suelen pedir 1–3 años de cola/);
    assert.match(v(14)[0].detalle, /termina un año antes que el del PPA/);
    assert.deepEqual(v(13), []);
    assert.deepEqual(v(16).map((a) => a.id), ['financiamiento-plazo']);
  });
});

describe('Datos: columnas, editor y migración', () => {
  test('columnas mapeadas y opcionales (vacío = null, no un valor supuesto)', () => {
    assert.deepEqual(CAMPOS_RIESGOS.map(([c]) => COLUMNAS[c]), ['disponibilidad_pct', 'curtailment_pct', 'reemplazo_inversores_ano', 'reemplazo_inversores_usd_kwac', 'mmra_anos_fondeo', 'dscr_lockup', 'epc_penalizacion_usd_dia', 'epc_penalizacion_tope_usd']);
    assert.ok(CAMPOS_RIESGOS.every(([c]) => OPCIONALES.has(c)));
    const s = aSupuestos({});
    assert.ok(CAMPOS_RIESGOS.every(([c]) => s[c] === null));
  });
  test('no están en GRUPOS (el resumen y el Excel no cambian mientras estén vacíos); etiqueta del costo nominal', () => {
    const enGrupos = new Set(GRUPOS.flatMap(([, campos]) => campos.map(([c]) => c)));
    assert.ok(CAMPOS_RIESGOS.every(([c]) => !enGrupos.has(c)));
    assert.equal(CAMPOS_RIESGOS[3][1], 'Reemplazo de inversores: costo (USD nominales del año del reemplazo)');
    assert.match(fs.readFileSync('src/FinancialDashboard.jsx', 'utf8'), /Riesgos de operación y estrés \(opcional\)/);
  });
  test('migración: fecha posterior a 20261023100000, solo columnas opcionales con sus rangos', () => {
    const archivo = fs.readdirSync('supabase/migrations').find((x) => /_riesgos_operacion\.sql$/.test(x))!;
    assert.ok(archivo.slice(0, 14) > '20261023100000');
    const sql = fs.readFileSync(`supabase/migrations/${archivo}`, 'utf8').split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const col of ['disponibilidad_pct', 'curtailment_pct', 'reemplazo_inversores_ano', 'reemplazo_inversores_usd_kwac', 'mmra_anos_fondeo', 'dscr_lockup', 'epc_penalizacion_usd_dia', 'epc_penalizacion_tope_usd']) {
      assert.match(sql, new RegExp(`add column if not exists ${col} (numeric|integer) check`));
    }
    assert.doesNotMatch(sql, /default|not null|update |insert |drop /i);
  });
});
