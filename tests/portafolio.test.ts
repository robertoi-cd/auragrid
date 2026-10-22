// Navegación por módulos (fase 1): el tablero y las tarjetas de Inicio salen de la misma cadena de cálculo
// (analizarProyecto). Se comprueba que esa cadena da lo mismo que la que tenía App.jsx, que la tarjeta da las cifras
// del tablero y que "Datos incompletos" dice qué falta.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { tarjetaProyecto, porcentajeRtb, moduloDeAlerta, criticasPorModulo } from '../src/lib/portafolio';
import { validarProyecto, aplicarEntregablesAutomaticos, calcularCoberturaGarantias, calcularAvance, contarAlertas, MARGEN_GARANTIAS_DEFAULT, type Alerta, type Garantia } from '../src/lib/validaciones';
import { crearModeloFinanciero, calendarioPagos, fechasClave } from '../src/lib/modeloFinanciero';
import { compararEstructuras, problemasDepreciacion, ESTRUCTURAS, type Supuestos } from '../src/lib/rentabilidad';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { proyectoDeRuta, contextoAsistente } from '../src/lib/contextoAsistente';
import { datosParaAsesor } from '../src/lib/validaciones';
import fs from 'node:fs';
import { mensajeLimite, mensajeError } from '../src/lib/cupoAsistente';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31', rol: 'dueno' };
const GARANTIAS: Garantia[] = [
  { id: 'g1', tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
  { id: 'g2', tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'Afianzadora', concepto: 'Garantía de interconexión', monto: 1_250_000, vence: '2027-07-05', estado: 'vigente' },
  { id: 'g3', tipo: 'Fianza', beneficiario: 'Alpha I (SPV)', emisor: 'Afianzadora', concepto: 'Cumplimiento EPC', monto: 1_340_000, vence: '2027-12-31', estado: 'vigente' },
];
const SUPUESTOS = SUPUESTOS_ILUSTRATIVOS as Supuestos;

/** La cadena tal como estaba en App.jsx antes de separar módulos, sin useMemo. */
function cadenaAnterior(project: any, frentes: any[], garantias: any[], movimientos: any[], supuestos: Supuestos | null) {
  const cargaGarantias = { cargando: false, error: '' }, cargaSupuestos = { cargando: false, error: '' };
  const margenGarantias = project?.margenGarantiasDias ?? MARGEN_GARANTIAS_DEFAULT;
  const fechasProyecto = project ? fechasClave(crearModeloFinanciero(project, [], movimientos), project.fechaRtb, supuestos?.mesesConstruccion ?? 12) : null;
  const avisoGarantias = cargaGarantias.error;
  const garantiasDisponibles = !cargaGarantias.cargando && !avisoGarantias;
  const frentesEfectivos = aplicarEntregablesAutomaticos(frentes, calcularCoberturaGarantias(garantias, project.fechaRtb, margenGarantias, garantiasDisponibles, fechasProyecto ?? undefined));
  const avance = calcularAvance(frentesEfectivos, project.fechaRtb);
  const base = crearModeloFinanciero(project);
  const calendario = (m => calendarioPagos(m.pagos, supuestos?.mesesConstruccion ?? 12, m.fechaNtp))(crearModeloFinanciero(project, frentesEfectivos, movimientos));
  const problemasDep = supuestos ? problemasDepreciacion(supuestos) : [];
  const supuestosCalculables = problemasDep.length === 0 ? supuestos : null;
  const comparacion = supuestosCalculables && base ? compararEstructuras(supuestosCalculables, base.capex, base.mwdc, calendario) : null;
  const rentabilidad = comparacion?.find(r => r.estructura === supuestos?.estructuraSeleccionada) ?? null;
  const finanzas = crearModeloFinanciero(
    rentabilidad ? { ...project, capex: rentabilidad.capex } : project, frentesEfectivos, movimientos,
    rentabilidad ? { deuda: rentabilidad.deuda, idc: rentabilidad.usos.idc, comision: rentabilidad.usos.comision, dsra: rentabilidad.usos.dsra } : undefined
  );
  let resumenRentabilidad: any;
  if (cargaSupuestos.error) resumenRentabilidad = { estado: 'no_disponible' };
  else if (problemasDep.length) resumenRentabilidad = { estado: 'depreciacion_incompleta', problemas: problemasDep };
  else if (!rentabilidad) resumenRentabilidad = { estado: 'sin_supuestos' };
  else resumenRentabilidad = {
    estado: 'calculada',
    dscrMinP50: rentabilidad.dscrMinP50, anoDscrMinP50: rentabilidad.anoDscrMinP50,
    dscrMinP90: rentabilidad.dscrMinP90, anoDscrMinP90: rentabilidad.anoDscrMinP90,
    covenant: supuestos!.dscrCovenant,
    dscrDimensionamientoP50: supuestos!.dscrDimensionamientoP50, dscrDimensionamientoP90: supuestos!.dscrDimensionamientoP90,
    plazoDeudaAnos: rentabilidad.plazoDeudaAnos, ppaPlazoAnos: rentabilidad.ppaPlazoAnos,
    segurosAnual: supuestos!.segurosAnual,
    estructura: ESTRUCTURAS[rentabilidad.estructura],
  };
  const alertas = validarProyecto({ proyecto: project, frentes: frentesEfectivos, garantias, finanzas, garantiasDisponibles, rentabilidad: resumenRentabilidad, fechasClave: fechasProyecto ?? undefined });
  return { fechasProyecto, frentesEfectivos, avance, base, calendario, comparacion, rentabilidad, finanzas, resumenRentabilidad, alertas };
}

const CASOS: [string, any, any[], any[], Supuestos | null][] = [
  ['Alpha I completo', ALPHA, FRENTES_EJEMPLO, GARANTIAS, SUPUESTOS],
  ['Alpha I sin supuestos', ALPHA, FRENTES_EJEMPLO, GARANTIAS, null],
  ['Proyecto nuevo sin RTB ni datos', { ...ALPHA, id: 'nuevo', esEjemplo: false, fechaRtb: null }, [], [], null],
];

// Fase 2a: la cadena agrega la alerta de TIR contra el objetivo y, en el resumen de rentabilidad, los datos que usa.
// Fuera de eso debe ser idéntica a la anterior.
const NUEVOS_RESUMEN = ['tirEquity', 'tirObjetivo', 'ppaPrecio', 'ppaPorcentaje', 'precioMinimo'];
const sinNuevos = (k: string, v: any) =>
  k === 'alertas' ? v.filter((a: any) => a.id !== 'financiamiento-tir-objetivo')
    : k === 'resumenRentabilidad' && v ? Object.fromEntries(Object.entries(v).filter(([c]) => !NUEVOS_RESUMEN.includes(c)))
    : v;

describe('analizarProyecto = la cadena anterior de App.jsx (más la alerta de TIR)', () => {
  for (const [nombre, project, frentes, garantias, supuestos] of CASOS) {
    test(nombre, () => {
      const antes = cadenaAnterior(project, frentes, garantias, [], supuestos);
      const ahora = analizarProyecto({ project, frentes, garantias, movimientos: [], supuestos });
      for (const k of Object.keys(antes) as (keyof typeof antes)[]) assert.deepStrictEqual(sinNuevos(k, ahora[k]), antes[k], k);
    });
  }
});

describe('Tarjeta de Inicio = cifras del tablero', () => {
  const datos = { frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: SUPUESTOS, errores: {} };
  const t = tarjetaProyecto(ALPHA, datos, '2026-10-18');
  const tablero = cadenaAnterior(ALPHA, FRENTES_EJEMPLO, GARANTIAS, [], SUPUESTOS);

  test('alertas críticas, CAPEX, TIR de equity y DSCR mínimo', () => {
    assert.equal(t.criticas, contarAlertas(tablero.alertas).criticas);
    assert.equal(t.capex, tablero.finanzas.capex);
    assert.ok(tablero.rentabilidad);
    assert.equal(t.tirEquity, tablero.rentabilidad!.tirEquity);
    assert.equal(t.dscrMinimo, tablero.rentabilidad!.dscrMinP50);
  });
  test('preparación RTB con la regla de la barra de RTB (completos / total, redondeado)', () => {
    const items = tablero.frentesEfectivos.flatMap((f: any) => f.items);
    assert.equal(t.preparacionRtb, Math.round(items.filter((i: any) => i[1] === 'completo').length / items.length * 100));
  });
  test('RTB objetivo y días restantes', () => {
    assert.equal(t.fechaRtb, '2027-03-31');
    assert.equal(t.diasRtb, 164);
  });
  test('con todos los datos, la tarjeta está completa', () => {
    assert.deepEqual(t.faltantes, []);
    assert.equal(t.completo, true);
  });
  test('las críticas por módulo suman el total', () => {
    assert.equal(Object.values(t.criticasPorModulo as Record<string, number>).reduce((a, n) => a + n, 0), t.criticas);
  });
});

describe('Datos incompletos: dice qué falta', () => {
  test('proyecto nuevo sin datos', () => {
    const t = tarjetaProyecto({ ...ALPHA, id: 'nuevo', esEjemplo: false, fechaRtb: null }, { frentes: [], garantias: [], movimientos: [], supuestos: null, errores: {} }, '2026-10-18');
    assert.equal(t.completo, false);
    assert.equal(t.diasRtb, null);
    assert.equal(t.tirEquity, null);
    assert.equal(t.dscrMinimo, null);
    for (const f of ['RTB objetivo sin definir', 'Sin entregables registrados', 'Sin garantías registradas', 'Sin cronograma de caja', 'Sin supuestos financieros: TIR y DSCR en N/D'])
      assert.ok(t.faltantes.includes(f), f);
  });
  test('un error de carga aparece como faltante y no como "sin alertas"', () => {
    const t = tarjetaProyecto(ALPHA, { frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: SUPUESTOS, errores: { garantias: 'No se pudieron leer las garantías' } }, '2026-10-18');
    assert.equal(t.completo, false);
    assert.ok(t.faltantes.includes('No se pudieron leer las garantías'));
    assert.ok(!t.faltantes.includes('Sin garantías registradas'));
  });
  test('depreciación por categorías incompleta', () => {
    const s = { ...SUPUESTOS, depreciacionPorCategorias: true, depreciacionGeneracionPct: 50, depreciacionObraCivilPct: 10, depreciacionSubestacionPct: 10 } as any; // no suma 100 %
    assert.ok(problemasDepreciacion(s).length > 0);
    const t = tarjetaProyecto(ALPHA, { frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: s, errores: {} }, '2026-10-18');
    assert.ok(t.faltantes.includes('Depreciación por categorías incompleta: TIR y DSCR en N/D'));
    assert.equal(t.tirEquity, null);
    assert.equal(t.dscrMinimo, null);
  });
});

describe('Alertas por módulo', () => {
  const a = (x: Partial<Alerta>) => ({ sev: 'critico', titulo: 't', categoria: 'Proyecto', ...x }) as Alerta;
  test('cada alerta va al módulo donde se resuelve', () => {
    assert.equal(moduloDeAlerta(a({ categoria: 'Garantías' })), 'garantias');
    assert.equal(moduloDeAlerta(a({ ref: { tipo: 'proyecto', clave: 'evidencia' } } as any)), 'documentos');
    assert.equal(moduloDeAlerta(a({ categoria: 'Frentes de trabajo' })), 'permisos');
    assert.equal(moduloDeAlerta(a({ categoria: 'Financiamiento' })), 'finanzas');
    assert.equal(moduloDeAlerta(a({ categoria: 'Proyecto' })), 'resumen');
  });
  test('solo cuenta las críticas', () => {
    const r = criticasPorModulo([a({ categoria: 'Garantías' }), a({ categoria: 'Garantías', sev: 'advertencia' } as any), a({ categoria: 'Financiamiento' })]);
    assert.deepEqual(r, { porModulo: { garantias: 1, finanzas: 1 }, total: 2 });
  });
  test('porcentajeRtb sin entregables es 0', () => {
    assert.equal(porcentajeRtb([]), 0);
  });
});

describe('Asistente en Inicio: datos que recibe Gemini y cupo', () => {
  // Lista de proyectos del usuario tal como la devuelve Supabase (RLS: los suyos y los compartidos con él)
  const accesibles = [ALPHA, { ...ALPHA, id: 'beta-ii-100mw', name: 'Beta II', state: 'Zacatecas' }];
  const paraIA = (p: typeof ALPHA) => ({ ...p, cifras: [{ etiqueta: 'Capacidad', valor: '50 MWac' }] });
  /** Cuerpo que AiAssistantChat envía al proxy (sin la pregunta ni el historial). */
  const cuerpo = (c: ReturnType<typeof contextoAsistente>) => ({ projectId: c.projectId, ...datosParaAsesor(c.proyecto, c.alertas) });

  test('en Inicio no se envía ningún proyecto ni alerta (y projectId es null)', () => {
    const c = contextoAsistente({ project: null, proyectoParaIA: null, alertas: [], moduloActual: 'Inicio (portafolio de proyectos)' });
    assert.deepEqual(cuerpo(c), { projectId: null, proyecto: null, alertas: [] });
    const json = JSON.stringify(cuerpo(c));
    for (const p of accesibles) assert.ok(!json.includes(p.name) && !json.includes(p.id), p.name);
  });
  test('un proyecto al que no tiene acceso (o inexistente) no abre nada ni llega al asistente', () => {
    for (const id of ['prueba-aislamiento-300mw-a433cb', 'no-existe']) {
      const project = proyectoDeRuta(accesibles, id);
      assert.equal(project, null);
      assert.deepEqual(cuerpo(contextoAsistente({ project, proyectoParaIA: null, alertas: [], moduloActual: 'Resumen del proyecto' })), { projectId: null, proyecto: null, alertas: [] });
    }
  });
  test('con un proyecto abierto solo viaja ese proyecto (con el módulo actual)', () => {
    const project = proyectoDeRuta(accesibles, 'alpha-i-50mw')!;
    const c = contextoAsistente({ project, proyectoParaIA: paraIA(project), alertas: [], moduloActual: 'Resumen del proyecto' });
    const b = cuerpo(c);
    assert.equal(b.projectId, 'alpha-i-50mw');
    assert.equal(b.proyecto!.name, 'Alpha I');
    assert.deepEqual(b.proyecto!.cifras![1], { etiqueta: 'Módulo que está viendo el usuario', valor: 'Resumen del proyecto' });
    assert.ok(!JSON.stringify(b).includes('Beta II'));
  });
  test('la app usa estas funciones y el chat envía solo projectId + datosParaAsesor', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /setProject\(proyectoDeRuta\(projects, idRuta\)\)/);
    assert.match(app, /<AiAssistantChat\s+\{\.\.\.contextoAsistente\(\{ project, proyectoParaIA, alertas, moduloActual \}\)\}/);
    const chat = fs.readFileSync('src/AiAssistantChat.jsx', 'utf8');
    assert.match(chat, /body: JSON\.stringify\(\{\s*pregunta: userMessage,\s*historial,\s*projectId: pid,\s*\.\.\.datosParaAsesor\(proyecto, alertas\)\s*\}\)/);
  });
  test('cupo sin proyecto (Inicio): la base lo cobra como dueño solo si es dueño de algún proyecto; si no, sin_acceso', () => {
    const dir = 'supabase/migrations';
    const ultima = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => /function public\.cupo_asistente\(/i.test(fs.readFileSync(`${dir}/${f}`, 'utf8'))).at(-1)!;
    const sql = fs.readFileSync(`${dir}/${ultima}`, 'utf8');
    assert.match(sql, /when p_project_id is null then \(case when exists \(select 1 from public\.solar_projects where owner_id = auth\.uid\(\)\) then 'dueno' end\)/);
    assert.match(sql, /if v_rol is null then\s+return query select null::text, 0, 0, 0, 'sin_acceso'::text/);
  });
});

describe('Mensaje del asistente en Inicio sin acceso', () => {
  test('sin proyecto: explica que en Inicio solo pueden consultar los dueños', () => {
    const texto = 'En Inicio el asistente solo está disponible para dueños de proyectos. Abre un proyecto para consultarlo.';
    assert.equal(mensajeLimite('sin_acceso', null, new Date(), true), texto);
    assert.equal(mensajeError({ motivo: 'sin_acceso', error: 'No tienes acceso al asistente en este proyecto.' }, true), texto);
  });
  test('con proyecto abierto se mantiene el mensaje anterior', () => {
    assert.equal(mensajeLimite('sin_acceso'), 'No tienes acceso al asistente en este proyecto.');
    assert.equal(mensajeError({ motivo: 'sin_acceso' }), 'No tienes acceso al asistente en este proyecto.');
  });
});
