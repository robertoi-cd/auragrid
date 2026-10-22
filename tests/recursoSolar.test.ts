// Recurso solar por estado (formulario de proyecto nuevo): 32 entidades, GHI y producción específica de Global Solar
// Atlas, multiplicador de costo por confirmar y producción capturada por el usuario. Ejecutar: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  ESTADOS_MEXICO, recursoSolar, produccionEspecifica, origenProduccion, capexReferencia, interconexionReferencia,
  FUENTE_RECURSO_SOLAR, FUENTE_MULTIPLICADOR_COSTO, MULTIPLICADOR_COSTO_ESTADO, ETIQUETA_PROMEDIO_ESTATAL, ETIQUETA_DATO_USUARIO,
  FUENTES_PROYECTO_NUEVO,
} from '../src/lib/fuentesSupuestos';
import { SUPUESTOS_DEFAULT } from '../src/lib/rentabilidad';

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

describe('Catálogo de entidades federativas', () => {
  test('32 entidades (31 estados y Ciudad de México), sin "Otro Estado"', () => {
    assert.equal(ESTADOS_MEXICO.length, 32);
    assert.ok(ESTADOS_MEXICO.includes('Ciudad de México'));
    assert.ok(!ESTADOS_MEXICO.some((e) => /otro/i.test(e)));
    assert.equal(new Set(ESTADOS_MEXICO).size, 32);
  });
  test('en orden alfabético (sin distinguir acentos)', () => {
    const ordenados = [...ESTADOS_MEXICO].sort((a, b) => sinAcentos(a).localeCompare(sinAcentos(b)));
    assert.deepEqual(ESTADOS_MEXICO, ordenados);
    assert.equal(ESTADOS_MEXICO[0], 'Aguascalientes');
    assert.equal(ESTADOS_MEXICO[31], 'Zacatecas');
  });
  test('incluye los 8 estados que ya existían (los proyectos guardados siguen encontrando su estado)', () => {
    for (const e of ['Sonora', 'Chihuahua', 'Coahuila', 'Nuevo León', 'Jalisco', 'Zacatecas', 'Yucatán', 'Baja California']) {
      assert.ok(ESTADOS_MEXICO.includes(e), e);
    }
  });
});

describe('GHI y producción específica por estado (Global Solar Atlas)', () => {
  test('cada estado tiene dato con al menos 5 puntos, o queda "por confirmar" (null) sin valores a medias', () => {
    for (const e of ESTADOS_MEXICO) {
      const r = recursoSolar(e)!;
      if (r.ghi == null) assert.deepEqual([r.ghiMin, r.ghiMax, r.pvout], [null, null, null], e);
      else assert.ok(r.puntos >= 5, e);
    }
  });
  test('valores físicamente plausibles para México: GHI 4–7 kWh/m²/día y PVOUT 1,300–2,100 kWh/kWp', () => {
    for (const e of ESTADOS_MEXICO) {
      const r = recursoSolar(e)!;
      if (r.ghi == null) continue;
      assert.ok(r.ghi >= 4 && r.ghi <= 7, `${e} GHI ${r.ghi}`);
      assert.ok(r.pvout! >= 1300 && r.pvout! <= 2100, `${e} PVOUT ${r.pvout}`);
      assert.ok(r.ghiMin! <= r.ghi && r.ghi <= r.ghiMax!, `${e} rango`);
    }
  });
  test('el noroeste tiene más recurso que el sureste (Sonora > Tabasco), como en los mapas de Global Solar Atlas', () => {
    assert.ok(recursoSolar('Sonora')!.ghi! > recursoSolar('Tabasco')!.ghi!);
    assert.ok(recursoSolar('Sonora')!.pvout! > recursoSolar('Tabasco')!.pvout!);
  });
  test('la fuente dice de dónde salen y cómo se calcularon', () => {
    assert.match(FUENTE_RECURSO_SOLAR, /Global Solar Atlas \(Banco Mundial \/ Solargis\), datos v[\d.]+ actualizados \d{4}-\d{2}-\d{2}/);
    assert.match(FUENTE_RECURSO_SOLAR, /promedio de 9 a 16 puntos/);
    assert.match(FUENTES_PROYECTO_NUEVO.ghi, /ilustrativo: promedio estatal/i);
    assert.match(FUENTES_PROYECTO_NUEVO.ghi, /módulo de Sitios se obtendrá por coordenada del terreno/);
  });
  test('estado desconocido (p. ej. el antiguo "Otro Estado"): sin dato', () => {
    assert.equal(recursoSolar('Otro Estado'), null);
  });
});

describe('Multiplicador de costo por estado: por confirmar', () => {
  test('1.00 en todos los estados (sin ajuste regional), con la razón', () => {
    assert.equal(MULTIPLICADOR_COSTO_ESTADO, 1);
    assert.match(FUENTE_MULTIPLICADOR_COSTO, /^Por confirmar/);
    assert.match(FUENTES_PROYECTO_NUEVO.capex, /por confirmar/);
  });
  test('el CAPEX de referencia ya no cambia por estado: 100 MW = 95 M de generación + interconexión', () => {
    const capex = ESTADOS_MEXICO.map((e) => capexReferencia(100, e, interconexionReferencia('standard')));
    assert.ok(capex.every((c) => c === 97_400_000));
  });
});

describe('Producción específica de un proyecto nuevo', () => {
  test('sin captura: promedio estatal de Global Solar Atlas', () => {
    const p = produccionEspecifica('Sonora');
    assert.deepEqual([p.valor, p.origen], [recursoSolar('Sonora')!.pvout, 'promedio_estatal']);
    assert.match(p.etiqueta, new RegExp(`^${ETIQUETA_PROMEDIO_ESTATAL}`));
  });
  test('capturada (estudio de recurso o PVsyst): reemplaza al promedio y se marca como dato del usuario', () => {
    assert.deepEqual(produccionEspecifica('Sonora', '1950.4'), { valor: 1950, origen: 'usuario', etiqueta: ETIQUETA_DATO_USUARIO });
    assert.deepEqual(produccionEspecifica('Sonora', 1700), { valor: 1700, origen: 'usuario', etiqueta: ETIQUETA_DATO_USUARIO });
  });
  test('vacía, cero o texto no cuentan como captura', () => {
    for (const v of ['', null, undefined, 0, 'abc']) assert.equal(produccionEspecifica('Jalisco', v).origen, 'promedio_estatal');
  });
  test('estado sin dato: valor por defecto (PVGIS 1,810), marcado por confirmar', () => {
    const p = produccionEspecifica('Otro Estado');
    assert.deepEqual([p.valor, p.origen], [SUPUESTOS_DEFAULT.rendimientoFijaKwhKwp, 'por_defecto']);
    assert.match(p.etiqueta, /^Por confirmar/);
  });
});

describe('Origen de la producción guardada (tablero y asistente)', () => {
  test('igual al promedio de su estado → promedio estatal, con la fuente', () => {
    assert.match(origenProduccion(recursoSolar('Zacatecas')!.pvout!, 'Zacatecas'), /^Ilustrativo: promedio estatal: Global Solar Atlas/);
  });
  test('igual al valor por defecto → por defecto (proyectos creados antes de este cambio)', () => {
    assert.match(origenProduccion(1810, 'Zacatecas'), /^Valor por defecto \(PVGIS/);
  });
  test('cualquier otro valor → dato del usuario', () => {
    assert.match(origenProduccion(1777, 'Zacatecas'), /^Dato del usuario/);
  });
});
