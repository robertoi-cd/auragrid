// Nivel bancario A, fase 1: escenarios de estrés con la deuda fija del caso base y métricas bancarias (DSCR mínimo y
// promedio, LLCR, PLCR, TIR) y puntos de quiebre de ingresos. Cifras esperadas del usuario para Alpha I
// (tolerancia 0.001x en DSCR/LLCR/PLCR y 0.01 pp en las TIR).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { calcularEscenarios, puntosDeQuiebre, ESCENARIOS, NOTA_CONVENCION_ESCENARIOS, type ClaveEscenario } from '../src/lib/escenarios';
import type { Supuestos } from '../src/lib/rentabilidad';
import type { Credito } from '../src/lib/creditos';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const MIGRADO: Credito = { orden: 1, banco: null, participacionPct: 100, tasaAnualPct: 7, comisionEstructuracionPct: 1.5, comisionNoDisposicionPct: null, estado: 'aprobado' };
const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: SUPUESTOS_ILUSTRATIVOS as Supuestos, creditos: [MIGRADO] });
const s = a.supuestosCalculables!;
const esc = calcularEscenarios(s, a.rentabilidad, a.base.capex, a.base.mwdc);
const de = (c: ClaveEscenario) => esc.find((e) => e.clave === c)!;
const x3 = (v: number | null, esperado: number, que: string) => assert.ok(v != null && Math.abs(v - esperado) <= 0.0005 + 1e-12, `${que}: ${v} vs ${esperado}`);
const pp = (v: number | null, esperado: number, que: string) => assert.ok(v != null && Math.abs(v * 100 - esperado) <= 0.005 + 1e-12, `${que}: ${v == null ? v : (v * 100).toFixed(4)} % vs ${esperado} %`);

describe('Escenarios de estrés de Alpha I (deuda fija, ISR recalculado): cifras del usuario', () => {
  // [DSCR mínimo, DSCR promedio, LLCR, PLCR, TIR equity %, TIR proyecto %] (null = no dada)
  const esperado: Record<ClaveEscenario, (number | null)[]> = {
    base: [1.408, 1.416, 1.414, 1.804, 8.15, 8.04],
    p90Ano1: [1.277, 1.407, 1.400, null, 7.98, 7.95],
    p90: [1.277, 1.282, 1.281, null, 6.36, 7.04],
    capex10: [1.408, 1.416, 1.414, null, 6.54, 7.09],
    opex10: [1.385, 1.389, 1.388, null, 7.78, 7.84],
    tasa100: [1.300, 1.351, 1.335, null, 7.53, 8.04],
    mercado20: [1.345, 1.348, 1.347, null, 6.39, 7.01],
    p90Opex10: [1.254, null, null, null, 6.00, null],
    cod6: [0.704, null, null, null, null, null],
  };
  for (const [clave, nombre] of ESCENARIOS) {
    test(nombre, () => {
      const e = de(clave);
      const [mn, prom, llcr, plcr, tirE, tirP] = esperado[clave];
      if (mn != null) x3(e.dscrMin, mn, 'DSCR mínimo');
      if (prom != null) x3(e.dscrPromedio, prom, 'DSCR promedio');
      if (llcr != null) x3(e.llcr, llcr, 'LLCR');
      if (plcr != null) x3(e.plcr, plcr, 'PLCR');
      if (tirE != null) pp(e.tirEquity, tirE, 'TIR de equity');
      if (tirP != null) pp(e.tirProyecto, tirP, 'TIR de proyecto');
    });
  }
  test('9 escenarios en el orden acordado; solo COD +6 meses baja del covenant 1.15x (año 1)', () => {
    assert.deepEqual(esc.map((e) => e.clave), ['base', 'p90Ano1', 'p90', 'capex10', 'opex10', 'tasa100', 'mercado20', 'p90Opex10', 'cod6']);
    assert.ok(esc.filter((e) => e.clave !== 'cod6').every((e) => e.anosBajoCovenant.length === 0));
    assert.deepEqual(de('cod6').anosBajoCovenant, [1]);
  });
});

describe('Convención', () => {
  test('el caso base reproduce exactamente las cifras del motor (TIR, DSCR mínimo y su año)', () => {
    const b = de('base');
    assert.equal(b.tirEquity, a.rentabilidad.tirEquity);
    assert.equal(b.tirProyecto, a.rentabilidad.tirProyecto);
    assert.equal(b.dscrMin, a.rentabilidad.dscrMinP50);
    assert.equal(b.anoDscrMin, a.rentabilidad.anoDscrMinP50);
  });
  test('P90 todos los años = el DSCR P90 del motor (misma deuda)', () => {
    x3(de('p90').dscrMin, a.rentabilidad.dscrMinP90, 'DSCR mínimo P90');
  });
  test('CAPEX +10 %: el DSCR no cambia (deuda fija, sobrecosto con equity); la TIR de equity baja', () => {
    assert.equal(de('capex10').dscrMin!.toFixed(10), de('base').dscrMin!.toFixed(10));
    assert.ok(de('capex10').tirEquity! < de('base').tirEquity!);
  });
  test('tasa +100 pb: la TIR de proyecto no cambia (antes de deuda); el LLCR se descuenta a la tasa del escenario', () => {
    assert.equal(de('tasa100').tirProyecto, de('base').tirProyecto);
    assert.ok(de('tasa100').llcr! < de('base').llcr!);
  });
  test('LLCR ≈ DSCR ponderado del plazo; PLCR > LLCR (toda la vida útil)', () => {
    assert.ok(esc.every((e) => e.plcr! > e.llcr!));
  });
  test('nota de la convención', () => {
    assert.match(NOTA_CONVENCION_ESCENARIOS, /^Deuda fija \(la dimensionada en el caso base: mismo monto, calendario de amortización y DSRA\); ISR recalculado en cada escenario\./);
  });
});

describe('Puntos de quiebre de ingresos (ISR recalculado, deuda fija)', () => {
  const q = puntosDeQuiebre(s, a.rentabilidad, a.base.capex, a.base.mwdc);
  test('15.8 % hasta el covenant 1.15x y 24.5 % hasta 1.0x', () => {
    assert.equal((q.hastaCovenant! * 100).toFixed(1), '15.8');
    assert.equal((q.hastaUno! * 100).toFixed(1), '24.5');
  });
  test('en el quiebre, el DSCR mínimo es el objetivo (con la misma convención)', () => {
    assert.ok(q.hastaCovenant! < q.hastaUno!);
  });
  test('el ≈ 17 % con ISR fijo ya no aparece en la app ni en el ROADMAP', () => {
    const textos = [fs.readFileSync('ROADMAP.md', 'utf8'), ...['src/FinancialDashboard.jsx', 'src/paginas/Resumen.jsx', 'src/lib/validaciones.ts'].map((f) => fs.readFileSync(f, 'utf8'))];
    for (const t of textos) assert.doesNotMatch(t, /≈ ?17 ?%/);
    assert.match(textos[0], /15\.8 % hasta el covenant \(1\.15x\) y 24\.5 % hasta DSCR 1\.0x/);
  });
});
