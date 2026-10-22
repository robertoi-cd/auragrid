// Pruebas de las oportunidades de optimización (separadas de las alertas).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { detectarOportunidades, UMBRAL_MEJORA_TIR_PP } from '../src/lib/oportunidades';
import { calcularRentabilidad, compararDepreciacion, type Supuestos } from '../src/lib/rentabilidad';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { crearModeloFinanciero, calendarioPagos } from '../src/lib/modeloFinanciero';

// Calendario de pagos del cronograma de ejemplo (el que usa la app)
const modelo = crearModeloFinanciero({ id: 'alpha-i-50mw', capacityMw: 50, capex: 46_500_000, esEjemplo: true });
const calendario = calendarioPagos(modelo.pagos, 12, modelo.fechaNtp);
const datos = (s: Supuestos) => ({
  supuestos: s,
  rentabilidad: calcularRentabilidad(s, 'un_eje', 46_500_000, 62.5, calendario),
  comparacionDepreciacion: compararDepreciacion(s, 'un_eje', 46_500_000, 62.5, calendario),
});

describe('Depreciación con mejor TIR de equity', () => {
  test('Alpha I (100 % en el año 1): propone el 10 % anual con el formato pedido', () => {
    const o = detectarOportunidades(datos(SUPUESTOS_ILUSTRATIVOS));
    assert.equal(o.length, 1);
    // Con los intereses de construcción mes a mes, la TIR de equity actual es 8.1 % y con 10 % anual 8.7 %
    assert.equal(o[0].texto, 'Depreciación al 10 % anual: TIR de equity 8.72 % (+0.57 pp), sin pérdida fiscal caducada');
    assert.equal(o[0].nota, 'Validar con asesor fiscal');
  });
  test('si ya usa la tasa anual, no propone volver al 100 % en el año 1 (es peor)', () => {
    assert.deepEqual(detectarOportunidades(datos({ ...SUPUESTOS_ILUSTRATIVOS, depreciacionEsquema: 'anual' })), []);
  });
  test(`mejora de ${UMBRAL_MEJORA_TIR_PP} pp o menos: no se propone`, () => {
    const d = datos(SUPUESTOS_ILUSTRATIVOS);
    const anual = d.comparacionDepreciacion.find((c) => c.esquema === 'anual')!;
    // TIR actual ficticia apenas por debajo del umbral
    const casi = { ...d, rentabilidad: { ...d.rentabilidad, tirEquity: anual.rentabilidad.tirEquity! - UMBRAL_MEJORA_TIR_PP / 100 } };
    assert.deepEqual(detectarOportunidades(casi), []);
    const justo = { ...d, rentabilidad: { ...d.rentabilidad, tirEquity: anual.rentabilidad.tirEquity! - 0.0026 } };
    assert.equal(detectarOportunidades(justo).length, 1);
  });
  test('con un esquema intermedio (70 % año 1), compara ambos contra el actual', () => {
    const o = detectarOportunidades(datos({ ...SUPUESTOS_ILUSTRATIVOS, depreciacionAno1Pct: 70 }));
    assert.ok(o.every((x) => x.texto.startsWith('Depreciación ')));
  });
  test('si la alternativa deja pérdida caducada, lo dice con el monto', () => {
    const d = datos(SUPUESTOS_ILUSTRATIVOS);
    const anual = d.comparacionDepreciacion.find((c) => c.esquema === 'anual')!;
    const conCaducada = { ...d, comparacionDepreciacion: [{ ...anual, rentabilidad: { ...anual.rentabilidad, isrConDeuda: { inicio: 14, perdidaCaducada: 1_234_000 } } }] };
    assert.match(detectarOportunidades(conCaducada)[0].texto, /pérdida fiscal caducada USD.1,234,000$/);
  });
  test('sin supuestos o sin rentabilidad: ninguna', () => {
    assert.deepEqual(detectarOportunidades({ supuestos: null, rentabilidad: null, comparacionDepreciacion: null }), []);
  });
});
