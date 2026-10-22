// Pruebas de la verificación de cifras de las respuestas del asistente contra el tablero.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parsearNumero, extraerCifras, verificarCifras, anexoCifras, fuentesVerificacion, ameritaDescarga, LARGO_ANALISIS } from '../src/lib/verificarCifras';
import { bloquesMarkdown } from '../src/lib/exportarRespuesta';
import { formatearMoneda, formatearPorcentaje, formatearDscr, formatearNumero } from '../src/lib/formato';

// Cifras como las arma App.jsx (mismos formateadores que el tablero; formatearMoneda usa espacio duro)
const TABLERO = [
  { etiqueta: `Deuda (${formatearPorcentaje(0.578)} de los usos)`, valor: formatearMoneda(28_731_461) },
  { etiqueta: 'TIR de equity (calculada)', valor: formatearPorcentaje(0.08) },
  { etiqueta: 'DSCR mínimo con P50 / P90 (calculado)', valor: `${formatearDscr(1.406)} / ${formatearDscr(1.277)} (covenant ${formatearDscr(1.15)})` },
  { etiqueta: 'Producción P50 / P90 (año 1)', valor: `${formatearNumero(135_750)} / ${formatearNumero(124_890)} MWh` },
  { etiqueta: 'Precio mínimo de PPA para una TIR de equity de 12.0 % (calculado)', valor: `al menos ${formatearMoneda(51.24, 2)}/MWh (PPA actual ${formatearMoneda(42, 2)}/MWh)` },
];

describe('Lectura de números', () => {
  test('miles con coma, decimales con punto o coma', () => {
    assert.deepEqual(parsearNumero('28,731,461'), { valor: 28_731_461, decimales: 0 });
    assert.deepEqual(parsearNumero('28.73'), { valor: 28.73, decimales: 2 });
    assert.deepEqual(parsearNumero('28,73'), { valor: 28.73, decimales: 2 });
    assert.deepEqual(parsearNumero('1,200.5'), { valor: 1200.5, decimales: 1 });
    assert.equal(parsearNumero('abc'), null);
  });
  test('extrae USD (con millones), %, x y MWh', () => {
    const c = extraerCifras('Deuda de USD 28.73 M, TIR 8.0 %, DSCR 1.28x y 135,750 MWh; PPA USD 42/MWh.');
    assert.deepEqual(c.map((x) => [x.unidad, x.valor]), [['usd', 28_730_000], ['usd', 42], ['pct', 8], ['x', 1.28], ['mwh', 135_750]]);
  });
});

describe('Verificación contra el tablero', () => {
  test('respuesta que copia las cifras = todo coincide', () => {
    const v = verificarCifras('La deuda es USD 28,731,461 (57.8 % de los usos), la TIR de equity 8.0 % y el DSCR mínimo con P90 1.28x.', TABLERO);
    assert.deepEqual(v, { revisadas: 4, noCoinciden: [] });
  });
  test('redondeos válidos coinciden: USD 28.73 M, 1.28x, 135,750 MWh, USD 51.24/MWh', () => {
    assert.deepEqual(verificarCifras('Deuda USD 28.73 M; P50 135,750 MWh; PPA mínimo USD 51.24/MWh.', TABLERO).noCoinciden, []);
  });
  test('cifras inventadas o mal copiadas se marcan', () => {
    const v = verificarCifras('La TIR de equity sería 12.5 %, la deuda USD 30 M y el DSCR 1.35x.', TABLERO);
    assert.deepEqual(v.noCoinciden, ['USD 30 M', '12.5 %', '1.35x']);
  });
  test('una diferencia calculada por el modelo (no está en el tablero) se marca', () => {
    assert.deepEqual(verificarCifras('Necesitas USD 9.24/MWh más.', TABLERO).noCoinciden, ['USD 9.24']);
  });
  test('respuesta sin cifras = nada que revisar', () => assert.deepEqual(verificarCifras('Prioriza la fianza CENACE.', TABLERO), { revisadas: 0, noCoinciden: [] }));
});

describe('Cifras de las alertas (falso positivo corregido)', () => {
  const ALERTAS = [{
    sev: 'critico' as const, titulo: 'Hueco de caja desde el 31 may 2027',
    detalle: `Los pagos acumulados superan a los fondos confirmados por ${formatearMoneda(3_595_337)} en esa fecha; el hueco máximo es de ${formatearMoneda(15_127_677)} el 31 jul 2027.`,
    accion: `Confirmar antes del 31 may 2027: Tramo 2 (${formatearMoneda(15_127_677)}, en revisión).`,
  }];
  test('antes: USD 3,595,337 solo estaba en la alerta y salía como "no coincide"', () => {
    assert.deepEqual(verificarCifras('El hueco de caja es de USD 3,595,337.', TABLERO).noCoinciden, ['USD 3,595,337']);
  });
  test('ahora: con los mensajes de las alertas en el conjunto verificado, coincide', () => {
    assert.deepEqual(verificarCifras('El hueco de caja es de USD 3,595,337 y el máximo USD 15,127,677.', fuentesVerificacion(TABLERO, ALERTAS)).noCoinciden, []);
  });
  test('el anexo incluye la tabla de alertas activas', () => {
    const md = anexoCifras(TABLERO, { revisadas: 1, noCoinciden: [] }, 'hoy', ALERTAS);
    const tablas = bloquesMarkdown(md).filter((b) => b.tipo === 'tabla') as { filas: string[][] }[];
    assert.equal(tablas.length, 2);
    assert.deepEqual(tablas[1].filas[0], ['Severidad', 'Alerta', 'Detalle']);
    assert.equal(tablas[1].filas[1][0], 'Crítica');
  });
});

describe('Botones de descarga solo en respuestas con análisis o cifras', () => {
  test('respuestas informativas cortas: sin botones', () => {
    for (const t of [
      'Sí, el RTB objetivo es el 31 mar 2027.',
      'Hola, ¿en qué te ayudo con el proyecto?',
      'La MIA la tramita SEMARNAT; el responsable es el equipo ambiental.',
      '- Primero la fianza\n- Después el tramo 2', // lista de solo 2 puntos
    ]) assert.equal(ameritaDescarga(t), false, t);
  });
  test('con cifras: con botones aunque sea corta', () => {
    assert.equal(ameritaDescarga('La TIR de equity es 8.0 %.'), true);
    assert.equal(ameritaDescarga('La deuda es USD 28,731,461.'), true);
    assert.equal(ameritaDescarga('El DSCR mínimo con P90 es 1.28x.'), true);
  });
  test('con estructura de análisis: títulos, tabla o lista de 3 o más puntos', () => {
    assert.equal(ameritaDescarga('## Riesgos\n\nRevisar la fianza.'), true);
    assert.equal(ameritaDescarga('| Entregable | Estado |\n|---|---|\n| MIA | En curso |'), true);
    assert.equal(ameritaDescarga('1. Fianza CENACE\n2. Tramo 2\n3. Licencia de construcción'), true);
  });
  test(`texto largo (${LARGO_ANALISIS}+ caracteres) sin cifras: con botones`, () => {
    assert.equal(ameritaDescarga('Análisis cualitativo del avance. '.repeat(20)), true);
    assert.equal(ameritaDescarga('Corto.'), false);
  });
});

describe('Anexo de las descargas', () => {
  test('tabla con todas las cifras del tablero y el resultado de la verificación', () => {
    const v = verificarCifras('La TIR es 12.5 %.', TABLERO);
    const md = anexoCifras(TABLERO, v, '12 oct 2026, 10:30');
    assert.match(md, /## Cifras del tablero \(AuraGrid\)/);
    assert.match(md, /ATENCIÓN: 1 cifra\(s\) de la respuesta no coinciden con el tablero: 12\.5 %/);
    const tabla = bloquesMarkdown(md).find((b) => b.tipo === 'tabla') as { filas: string[][] };
    assert.equal(tabla.filas.length, TABLERO.length + 1);
    assert.deepEqual(tabla.filas[1], ['Deuda (57.8 % de los usos)', 'USD 28,731,461']);
  });
  test('si todo coincide lo dice; los "|" de los valores no rompen la tabla', () => {
    const md = anexoCifras([{ etiqueta: 'A | B', valor: '1 | 2' }], { revisadas: 3, noCoinciden: [] }, 'hoy');
    assert.match(md, /Las 3 cifras de la respuesta coinciden con el tablero\./);
    assert.match(md, /\| A \/ B \| 1 \/ 2 \|/);
  });
});
