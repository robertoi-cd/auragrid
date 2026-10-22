// Fase 2a de la navegación por módulos: Resumen (estado del RTB, indicadores, hitos), historial filtrado por módulo
// y los datos monto/responsable de las alertas. Nada de esto calcula cifras nuevas: se comprueba contra la cadena.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { estadoPreparacionRtb, hitosProyecto, kpisResumen, moduloDeCambio, cambiosDelModulo, MODULOS, moduloDisponible, modulosVisibles } from '../src/lib/modulos';
import { claseEntregable, filasFrentes, filasGarantias, rangoLineaTiempo, posicion, marcasTrimestre, etiquetaTrimestre, ICONO_CLASE, iconoGarantia } from '../src/lib/lineaTiempo';
import { indiceDocumentos, filtrarDocumentos, completosSinDocumento, autorVisible } from '../src/lib/documentos';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { validarProyecto, datosParaAsesor, type Frente, type Garantia } from '../src/lib/validaciones';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import { FECHA_NTP_EJEMPLO, FECHA_COD_EJEMPLO } from '../src/lib/modeloFinanciero';
import { SUPUESTOS_DEFAULT, type Supuestos } from '../src/lib/rentabilidad';
import { formatearPorcentaje, formatearNumero, formatearMoneda } from '../src/lib/formato';
import { moduloDeAlerta } from '../src/lib/portafolio';
// @ts-expect-error supuestosApi es JavaScript (sin declaración de tipos)
import { aSupuestos } from '../src/lib/supuestosApi';
import { registroParaLector, AUTOR_OCULTO, type CampoCambio } from '../src/lib/historialCambios';
import fs from 'node:fs';

const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const GARANTIAS: Garantia[] = [
  { id: 'g1', tipo: 'Carta de crédito', beneficiario: 'Proveedor de módulos', emisor: 'Banco', concepto: 'Pago de equipos', monto: 4_800_000, vence: '2027-06-30', estado: 'vigente' },
  { id: 'g2', tipo: 'Fianza', beneficiario: 'CENACE', emisor: 'Afianzadora', concepto: 'Garantía de interconexión', monto: 1_250_000, vence: '2027-07-05', estado: 'vigente' },
];
const S = SUPUESTOS_ILUSTRATIVOS as Supuestos;
const RTB = '2027-03-31';

describe('Resumen: estado de la preparación para RTB', () => {
  const frentes: Frente[] = [
    { nombre: 'Permisos', items: [
      ['MIA', 'bloqueado', 'Ambiental SA', '2027-01-15', {}],
      ['Licencia', 'curso', 'Municipio', '2027-05-10', {}],
      ['Uso de suelo', 'completo', 'Notaría', '2027-06-01', {}],
      ['Topografía', 'pendiente', '', null, {}],
    ] },
    { nombre: 'Financiamiento', items: [['Term sheet', 'pendiente', 'Banco', '2027-04-20', {}]] },
  ] as Frente[];

  test('bloqueado → RTB no alcanzable aún, con su lista', () => {
    const e = estadoPreparacionRtb(frentes, RTB);
    assert.equal(e.alcanzable, false);
    assert.deepEqual(e.bloqueados.map((i) => i.titulo), ['MIA']);
    assert.equal(e.bloqueados[0].frente, 'Permisos');
  });
  test('no completos con fecha posterior al RTB → RTB en riesgo (los completos y los sin fecha no cuentan)', () => {
    const e = estadoPreparacionRtb(frentes, RTB);
    assert.equal(e.enRiesgo, true);
    assert.deepEqual(e.despuesDelRtb.map((i) => i.titulo), ['Licencia', 'Term sheet']);
  });
  test('sin RTB objetivo no hay "en riesgo"; sin bloqueados es alcanzable', () => {
    const sinBloqueo = frentes.map((f) => ({ ...f, items: f.items.filter((i) => i[1] !== 'bloqueado') })) as Frente[];
    assert.deepEqual(estadoPreparacionRtb(sinBloqueo, null), { bloqueados: [], despuesDelRtb: [], alcanzable: true, enRiesgo: false });
  });
  test('el entregable calculado de garantías bloqueado también cuenta', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [{ ...GARANTIAS[0], vence: '2027-04-10' }], movimientos: [], supuestos: S });
    const e = estadoPreparacionRtb(a.frentesEfectivos, RTB);
    assert.ok(e.bloqueados.some((i) => /garant/i.test(i.titulo)));
  });
});

describe('Resumen: hitos e indicadores = cadena de cálculo', () => {
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: S });
  test('hitos RTB → NTP → COD del cronograma de ejemplo', () => {
    const h = hitosProyecto(a.fechasProyecto, '2026-10-18');
    assert.deepEqual(h.map((x) => [x.nombre, x.fecha, x.estimada]), [['RTB', RTB, false], ['NTP', FECHA_NTP_EJEMPLO, false], ['COD', FECHA_COD_EJEMPLO, false]]);
    assert.equal(h[0].dias, 164);
  });
  test('sin cronograma, NTP y COD se marcan como estimadas', () => {
    const b = analizarProyecto({ project: { ...ALPHA, esEjemplo: false }, frentes: [], garantias: [], movimientos: [], supuestos: S });
    const h = hitosProyecto(b.fechasProyecto, '2026-10-18');
    assert.equal(h[1].estimada, true);
    assert.equal(h[2].estimada, true);
  });
  test('KPIs con los mismos valores que Finanzas (estructura seleccionada)', () => {
    const k = Object.fromEntries(kpisResumen({ finanzas: a.finanzas, rentabilidad: a.rentabilidad, supuestos: S, motivoNd: '' }).map((x) => [x.clave, x]));
    const r = a.rentabilidad;
    assert.equal(k.tirEquity.valor, r.tirEquity);
    assert.equal(k.tirEquity.objetivo, S.tirEquityObjetivoPct! / 100);
    assert.equal(k.tirProyecto.valor, r.tirProyecto);
    assert.equal(k.dscrP50.valor, r.dscrMinP50);
    assert.equal(k.dscrP90.valor, r.dscrMinP90);
    assert.equal(k.dscrP50.covenant, S.dscrCovenant);
    assert.equal(k.capex.valor, a.finanzas.capex);
    assert.equal(k.deuda.valor, a.finanzas.deuda);
    assert.equal(k.deuda.equity, a.finanzas.equity);
    assert.equal(k.lcoe.valor, r.lcoe);
    assert.equal(k.ppa.valor, S.ppaPrecio);
    assert.equal(k.ppa.mercado, S.mercadoPrecio);
    assert.match(k.tirEquity.contexto, /^Caso P50 · /);
  });
  test('sin supuestos: TIR, DSCR y LCOE en N/D con el motivo; CAPEX sí', () => {
    const b = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: null });
    const k = Object.fromEntries(kpisResumen({ finanzas: b.finanzas, rentabilidad: b.rentabilidad, supuestos: null, motivoNd: 'Faltan supuestos de ingresos' }).map((x) => [x.clave, x]));
    for (const c of ['tirEquity', 'tirProyecto', 'dscrP50', 'dscrP90', 'lcoe']) {
      assert.equal(k[c].valor, null, c);
      assert.equal(k[c].contexto, 'Faltan supuestos de ingresos', c);
    }
    assert.equal(k.capex.valor, ALPHA.capex);
  });
});

describe('Historial: una sola fuente filtrada por módulo', () => {
  const CAMPOS: CampoCambio[] = ['estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja', 'baja_garantia',
    'garantia_concepto', 'garantia_tipo', 'garantia_beneficiario', 'garantia_categoria',
    'proyecto_nombre', 'proyecto_capacidad', 'proyecto_estado', 'proyecto_capex', 'proyecto_rtb', 'proyecto_margen',
    'proyecto_archivo', 'supuesto', 'miembro_alta', 'miembro_rol', 'miembro_baja', 'miembro_limite',
    'evidencia_alta', 'evidencia_baja', 'garantia_doc_alta', 'garantia_doc_baja'];
  const registros = CAMPOS.map((campo, i) => ({ id: String(i), campo }));
  test('cada registro aparece en exactamente un módulo con contenido (no se pierde ni se duplica)', () => {
    const porModulo = MODULOS.map((m) => cambiosDelModulo(registros, m.clave));
    assert.equal(porModulo.flat().length, registros.length);
    assert.deepEqual(new Set(porModulo.flat().map((r) => r.id)).size, registros.length);
  });
  test('entregables → Permisos; garantías → Garantías; supuestos → Finanzas; proyecto y equipo → Resumen', () => {
    assert.equal(moduloDeCambio({ campo: 'evidencia_alta' }), 'permisos');
    assert.equal(moduloDeCambio({ campo: 'fecha' }), 'permisos');
    assert.equal(moduloDeCambio({ campo: 'garantia_doc_alta' }), 'garantias');
    assert.equal(moduloDeCambio({ campo: 'baja_garantia' }), 'garantias');
    assert.equal(moduloDeCambio({ campo: 'proyecto_margen' }), 'garantias');
    assert.equal(moduloDeCambio({ campo: 'supuesto' }), 'finanzas');
    assert.equal(moduloDeCambio({ campo: 'miembro_rol' }), 'resumen');
    assert.equal(moduloDeCambio({ campo: 'proyecto_rtb' }), 'cronograma');
  });
  test('cada alerta enlaza a su módulo (todos existen); uno desconocido, a Resumen', () => {
    for (const m of ['documentos', 'cronograma', 'garantias', 'configuracion']) assert.equal(moduloDisponible(m), m);
    assert.equal(moduloDisponible('otro'), 'resumen');
  });
});

describe('Alertas: monto y responsable (solo datos)', () => {
  test('monto de la alerta de garantías = suma de las garantías que incluye; cada renglón con su monto', () => {
    const alertas = validarProyecto({ proyecto: ALPHA, frentes: [], garantias: GARANTIAS, hoy: '2027-05-01' });
    const g = alertas.find((a) => a.id === 'garantias')!;
    assert.equal(g.monto, g.garantias!.reduce((s, x) => s + GARANTIAS[x.indice].monto, 0));
    for (const x of g.garantias!) assert.equal(x.monto, GARANTIAS[x.indice].monto);
  });
  test('responsable del entregable en sus alertas; sin responsable capturado no se agrega', () => {
    const frentes = [{ nombre: 'Permisos', items: [['MIA', 'bloqueado', 'Ambiental SA', '2027-01-15', {}], ['EVIS', 'bloqueado', '', '2027-01-15', {}]] }] as Frente[];
    const alertas = validarProyecto({ proyecto: ALPHA, frentes, garantias: GARANTIAS, hoy: '2026-10-18' });
    assert.equal(alertas.find((a) => a.id === 'entregable-0-0')!.responsable, 'Ambiental SA');
    assert.ok(!('responsable' in alertas.find((a) => a.id === 'entregable-0-1')!));
  });
  test('el asistente recibe las mismas alertas que antes (sin monto ni responsable)', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: S });
    for (const x of datosParaAsesor(null, a.alertas).alertas) assert.deepEqual(Object.keys(x).sort(), ['accion', 'detalle', 'sev', 'titulo']);
  });

});

describe('Alerta de TIR de equity contra la objetivo', () => {
  const tir = (s: Supuestos, precio = true) => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: s, calcularPrecioMinimo: precio });
    return { a, alerta: a.alertas.find((x) => x.id === 'financiamiento-tir-objetivo') };
  };
  test('bajo el objetivo: advertencia con 2 decimales, puntos, precio mínimo sobre el % contratado y la acción acordada', () => {
    const { a, alerta } = tir(S);
    const r = a.rentabilidad;
    assert.ok(alerta && r.tirEquity < 0.12);
    assert.equal(alerta.sev, 'advertencia');
    assert.equal(alerta.titulo, `TIR de equity bajo el objetivo: ${formatearPorcentaje(r.tirEquity, 2)} frente a 12.00 %`);
    assert.ok(alerta.detalle.includes(`queda ${formatearNumero((0.12 - r.tirEquity) * 100, 2)} puntos por debajo del objetivo.`));
    assert.ok(a.precioMinimo.precio != null);
    assert.ok(alerta.detalle.endsWith(`Precio de PPA mínimo (sobre el 80 % contratado): ${formatearMoneda(a.precioMinimo.precio, 2)}/MWh (hoy ${formatearMoneda(42, 2)}/MWh), con la deuda redimensionada.`));
    assert.equal(alerta.accion, 'Mejorar el precio o el porcentaje del PPA, el CAPEX o las condiciones de la deuda; o revisar con los socios el objetivo de retorno.');
    assert.equal(moduloDisponible(moduloDeAlerta(alerta)), 'finanzas');
  });
  test('el % contratado sale del supuesto, no del texto', () => {
    const { alerta } = tir({ ...S, ppaPorcentaje: 70 });
    assert.match(alerta!.detalle, /\(sobre el 70 % contratado\)/);
  });
  test('sin objetivo capturado: no hay alerta de TIR ni precio mínimo, solo la sugerencia informativa', () => {
    const { a, alerta } = tir({ ...S, tirEquityObjetivoPct: null });
    assert.equal(a.precioMinimo, null);
    assert.equal(alerta!.sev, 'info');
    assert.equal(alerta!.titulo, 'Captura la TIR objetivo de los socios para evaluar el retorno');
    assert.equal(a.alertas.filter((x) => /bajo el objetivo/.test(x.titulo)).length, 0);
  });
  test('en o sobre el objetivo: sin alerta', () => {
    assert.equal(tir({ ...S, tirEquityObjetivoPct: 5 }).alerta, undefined);
  });
  test('tarjetas de Inicio (sin precio mínimo): la misma alerta sin la frase del precio; las críticas no cambian', () => {
    const conPrecio = tir(S), sinPrecio = tir(S, false);
    assert.equal(sinPrecio.alerta!.titulo, conPrecio.alerta!.titulo);
    assert.ok(!/Precio de PPA mínimo/.test(sinPrecio.alerta!.detalle));
    assert.equal(sinPrecio.a.alertas.filter((x) => x.sev === 'critico').length, conPrecio.a.alertas.filter((x) => x.sev === 'critico').length);
  });
  test('sin TIR calculada (faltan supuestos) no hay alerta ni sugerencia de TIR', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: null });
    assert.equal(a.alertas.find((x) => x.id === 'financiamiento-tir-objetivo'), undefined);
  });
  test('sin valor por defecto en el código: una fila sin tir_equity_objetivo_pct queda en null', () => {
    assert.equal(SUPUESTOS_DEFAULT.tirEquityObjetivoPct, null);
    assert.equal(aSupuestos({ tir_equity_objetivo_pct: null }).tirEquityObjetivoPct, null);
    assert.equal(aSupuestos({ tir_equity_objetivo_pct: 14 }).tirEquityObjetivoPct, 14);
  });
});

describe('Historial para el lector: sin correos de otras personas', () => {
  const base = { id: '1', deliverableId: null, motivo: null, tipo: 'cambio' as const, momento: '2026-10-13T16:20:00Z', valorAnterior: null };
  const alta = { ...base, entregable: 'Equipo: ingenieria@epc.example', campo: 'miembro_alta' as const, valorNuevo: 'editor', usuario: 'dueno@vista.local' };
  const yo = 'analista@banco.example';
  test('alta de otra persona: "Se agregó un editor", sin su correo ni el del autor', () => {
    const r = registroParaLector(alta, yo);
    assert.equal(r.entregable, 'Equipo');
    assert.equal(r.descripcion, 'Se agregó un editor');
    assert.equal(r.usuario, AUTOR_OCULTO);
    assert.ok(!JSON.stringify(r).includes('@epc.example') && !JSON.stringify(r).includes('dueno@'));
  });
  test('su propia alta y sus propios cambios conservan su correo', () => {
    const r = registroParaLector({ ...alta, entregable: `Equipo: ${yo}`, valorNuevo: 'lector (2 consultas/día)' }, yo);
    assert.equal(r.descripcion, 'Se te dio acceso como lector (2 consultas/día)');
    assert.equal(registroParaLector({ ...alta, usuario: yo }, yo).usuario, yo);
  });
  test('baja, cambio de rol y límite, por el rol', () => {
    assert.equal(registroParaLector({ ...alta, campo: 'miembro_baja', valorAnterior: 'lector', valorNuevo: null }, yo).descripcion, 'Se retiró el acceso a un lector');
    assert.equal(registroParaLector({ ...alta, campo: 'miembro_rol', valorAnterior: 'lector', valorNuevo: 'editor' }, yo).descripcion, 'Un miembro cambió de rol: lector → editor');
    assert.equal(registroParaLector({ ...alta, campo: 'miembro_limite', valorAnterior: 'predeterminado', valorNuevo: '4' }, yo).descripcion, 'Límite del asistente de un miembro: predeterminado → 4 consultas/día');
  });
  test('un correo dentro de un motivo o un valor también se oculta; lo demás no cambia', () => {
    const r = registroParaLector({ ...base, entregable: 'MIA', campo: 'estado', valorAnterior: 'curso', valorNuevo: 'completo', usuario: 'obra@epc.example', motivo: 'Lo confirmó obra@epc.example por correo' }, yo);
    assert.equal(r.motivo, 'Lo confirmó otra persona por correo');
    assert.equal(r.descripcion, 'Estado: En curso → Completo');
    assert.equal(r.entregable, 'MIA');
  });
  test('la app lo aplica solo al lector', () => {
    assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /ocultarCorreos=\{!puedeEditar\} correoPropio=\{session\?\.user\?\.email \?\? null\}/);
  });
});

describe('El simulador de la vista previa no llega al build', () => {
  // La vista previa local (supabase simulado, ?bloqueo=1, ?rol=…) vive fuera del repositorio, en el scratchpad,
  // y se activa con su propia configuración de Vite. Aquí se comprueba que nada del código publicado la usa.
  const archivos = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? archivos(`${dir}/${e.name}`) : [`${dir}/${e.name}`]));
  test('src/, vite.config y index.html no mencionan el simulador ni sus parámetros', () => {
    for (const f of [...archivos('src'), 'vite.config.mjs', 'index.html']) {
      const t = fs.readFileSync(f, 'utf8');
      assert.doesNotMatch(t, /supabaseSimulado|get\('bloqueo'\)|bloqueo=1|vite\.auditoria/, f);
    }
  });
  test('supabase.js usa el cliente real de Supabase', () => {
    assert.match(fs.readFileSync('src/supabase.js', 'utf8'), /from '@supabase\/supabase-js'/);
  });
});

describe('Monto de "Fondos que llegan justo a tiempo"', () => {
  test('Alpha I: suma de los pagos que menciona (8.5 M + 9.6 M = 18.1 M), con la etiqueta "Pagos en riesgo"', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: S });
    const f = a.alertas.find((x) => x.id === 'financiamiento-fondeo-justo')!;
    assert.match(f.detalle, /USD\s8,500,000/);
    assert.match(f.detalle, /USD\s9,600,000/);
    assert.equal(f.monto, 18_100_000);
    assert.equal(f.montoEtiqueta, 'Pagos en riesgo');
  });
  test('cada monto lleva su nombre', () => {
    const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: S });
    for (const x of a.alertas.filter((y) => y.monto != null)) assert.ok(x.montoEtiqueta, x.id);
  });
});

describe('TIR objetivo vacía (null) desde la base: "sin capturar", nunca 0', () => {
  const vacio = aSupuestos({ tir_equity_objetivo_pct: null }) as Supuestos;
  const s = { ...S, tirEquityObjetivoPct: vacio.tirEquityObjetivoPct };
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: s, calcularPrecioMinimo: true });
  test('llega como null, no como 0 ni como 12', () => {
    assert.equal(vacio.tirEquityObjetivoPct, null);
    assert.equal(a.resumenRentabilidad.tirObjetivo, null);
  });
  test('no calcula el precio mínimo de PPA (con 0 % saldría un precio bajo e inventado)', () => {
    assert.equal(a.precioMinimo, null);
    assert.equal(a.resumenRentabilidad.precioMinimo, null);
  });
  test('ninguna alerta compara contra 0 %: solo la sugerencia de capturarlo', () => {
    assert.ok(!a.alertas.some((x) => /0\.00 %/.test(x.titulo) || /bajo el objetivo/.test(x.titulo)));
    assert.equal(a.alertas.find((x) => x.id === 'financiamiento-tir-objetivo')!.titulo, 'Captura la TIR objetivo de los socios para evaluar el retorno');
  });
  test('indicadores de Resumen: "objetivo sin capturar" y sin objetivo para el color', () => {
    const k = kpisResumen({ finanzas: a.finanzas, rentabilidad: a.rentabilidad, supuestos: s, motivoNd: '' }).find((x) => x.clave === 'tirEquity')!;
    assert.equal(k.objetivo, null);
    assert.match(k.contexto, /objetivo sin capturar$/);
  });
  test('precioMinimoPpa se niega a calcular sin objetivo', async () => {
    const { precioMinimoPpa } = await import('../src/lib/rentabilidad');
    assert.throws(() => precioMinimoPpa(s, s.estructuraSeleccionada, ALPHA.capex, 62.5), /TIR objetivo capturada/);
  });
});

describe('Fase 2b: módulos y permisos por rol', () => {
  test('menú: los siete módulos para dueño y editor; el lector no ve Configuración', () => {
    assert.deepEqual(modulosVisibles(true).map((m) => m.nombre), ['Resumen', 'Permisos y frentes', 'Garantías', 'Cronograma', 'Finanzas', 'Documentos', 'Configuración']);
    assert.deepEqual(modulosVisibles(false).map((m) => m.clave), ['resumen', 'permisos', 'garantias', 'cronograma', 'finanzas', 'documentos']);
  });
  test('la app: Configuración para el lector muestra el mensaje; la barra superior ya no tiene el menú de acciones', () => {
    const app = fs.readFileSync('src/App.jsx', 'utf8');
    assert.match(app, /configuracion: puedeEditar \? \(\s*<Configuracion [\s\S]*?\) : <SinAccesoConfiguracion /);
    assert.match(app, /modulosVisibles\(puedeEditar\)/);
    assert.match(fs.readFileSync('src/paginas/Configuracion.jsx', 'utf8'), /Solo el dueño y los editores pueden ver la configuración/);
    const barra = fs.readFileSync('src/layout/BarraSuperior.jsx', 'utf8');
    assert.doesNotMatch(barra, /Más acciones|Archivar planta|Equipo y accesos/);
  });
  test('Configuración: equipo y archivar solo para el dueño', () => {
    const c = fs.readFileSync('src/paginas/Configuracion.jsx', 'utf8');
    assert.match(c, /\{esDueno \? \(\s*<>[\s\S]*?Administrar equipo y accesos/);
    assert.match(c, /\{esDueno && \(\s*<div[\s\S]*?Archivar planta/);
  });
  test('el RTB objetivo se edita en Cronograma; Resumen solo enlaza', () => {
    const barra = fs.readFileSync('src/RtbStatusBar.jsx', 'utf8');
    assert.match(barra, /\{enCronograma && project\?\.id && puedeEditar && <button[^\n]*>Cambiar<\/button>\}/);
    assert.match(barra, /\{enResumen && puedeEditar && accionRtb\}/);
  });
  test('"Exportar a MS Project" está en Cronograma y no en Permisos', () => {
    assert.doesNotMatch(fs.readFileSync('src/WorkstreamsPanel.jsx', 'utf8'), /Exportar a MS Project/);
    assert.match(fs.readFileSync('src/App.jsx', 'utf8'), /accion=\{<ExportarMsProject /);
  });
  test('una alerta del RTB objetivo va a Cronograma', () => {
    assert.equal(moduloDeAlerta({ id: 'proyecto-sin-rtb', sev: 'advertencia', categoria: 'Proyecto', etiqueta: '', titulo: '', detalle: '', accion: '', ref: { tipo: 'proyecto', clave: 'rtb' } }), 'cronograma');
  });
});

describe('Cronograma: hitos y línea de tiempo', () => {
  const a = analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: GARANTIAS, movimientos: [], supuestos: S });
  test('hitos con el fin de interconexión entre NTP y COD', () => {
    const h = hitosProyecto(a.fechasProyecto, '2026-10-18', true);
    assert.deepEqual(h.map((x) => x.clave), ['rtb', 'ntp', 'interconexion', 'cod']);
    assert.equal(h[2].fecha, a.fechasProyecto!.finInterconexion);
    assert.deepEqual(hitosProyecto(a.fechasProyecto, '2026-10-18').map((x) => x.clave), ['rtb', 'ntp', 'cod']);
  });
  test('clases: rojo vencido, ámbar después del RTB, completo y pendiente', () => {
    assert.equal(claseEntregable('curso', '2026-09-01', RTB, '2026-10-18'), 'vencido');
    assert.equal(claseEntregable('pendiente', '2027-05-01', RTB, '2026-10-18'), 'despuesRtb');
    assert.equal(claseEntregable('completo', '2026-09-01', RTB, '2026-10-18'), 'completo');
    assert.equal(claseEntregable('pendiente', '2027-01-01', RTB, '2026-10-18'), 'pendiente');
    assert.equal(claseEntregable('pendiente', '2027-05-01', null, '2026-10-18'), 'pendiente');
  });
  test('filas por frente: los entregables con fecha, ordenados; sin fecha aparte', () => {
    const filas = filasFrentes(a.frentesEfectivos, RTB, '2026-10-18');
    assert.equal(filas.length, a.frentesEfectivos.length);
    assert.equal(filas.reduce((s, f) => s + f.conFecha.length + f.sinFecha.length, 0), a.frentesEfectivos.flatMap((f) => f.items).length);
    for (const f of filas) assert.deepEqual(f.conFecha.map((i) => i.fecha), [...f.conFecha.map((i) => i.fecha)].sort());
  });
  test('garantías: vencimiento, vigencia requerida (hito y límite) y el nivel de la alerta de garantías', () => {
    const g = filasGarantias(GARANTIAS, a.fechasProyecto!, 90, a.alertas);
    const cenace = g.find((x) => x.nombre === 'Fianza CENACE')!;
    assert.equal(cenace.vence, '2027-07-05');
    assert.equal(cenace.hito, 'COD');
    assert.equal(cenace.limite, '2028-07-14');
    assert.equal(cenace.cubre, false);
    const alerta = a.alertas.find((x) => x.id === 'garantias')!.garantias!.find((x) => x.nombre === 'Fianza CENACE')!;
    assert.equal(cenace.nivel, alerta.nivel);
    assert.equal(cenace.accionCorta, alerta.accionCorta);
  });
  test('rango y marcas del eje', () => {
    const r = rangoLineaTiempo(['2026-10-18', '2027-03-31', null, '2028-07-14'])!;
    assert.ok(posicion('2026-10-18', r) > 0 && posicion('2028-07-14', r) < 100);
    const m = marcasTrimestre(r);
    assert.ok(m.includes('2027-01-01') && m.includes('2028-04-01'));
    assert.ok(m.every((x) => /-(01|04|07|10)-01$/.test(x)));
    assert.equal(rangoLineaTiempo([null, undefined]), null);
  });
});

describe('Documentos: índice, filtros y autor', () => {
  const frentes = [
    { nombre: 'Ambiental', items: [['MIA', 'completo', 'Ambiental SA', '2026-06-02', { id: 'd1' }], ['EVIS', 'completo', '', '2026-07-01', { id: 'd2' }]] },
    { nombre: 'Interconexión', items: [['Estudio', 'curso', 'CENACE', '2026-11-20', { id: 'd3' }]] },
  ] as Frente[];
  const garantias = [{ ...GARANTIAS[0], id: 'g1' }, { ...GARANTIAS[1], id: 'g2' }];
  const doc = (id: string, nombre: string, subidoEn: string, subidoPor = 'dueno@x.example') => ({ id, nombre, subidoEn, subidoPor, tamano: 1000, ruta: `p/${id}` });
  const evidencias = new Map([['d1', [doc('a', 'resolutivo-mia.pdf', '2026-10-01T10:00:00Z')]], ['d3', [doc('b', 'estudio.pdf', '2026-10-05T10:00:00Z', 'ing@epc.example')]]]);
  const evidenciasGarantias = new Map([['g2', [doc('c', 'fianza-cenace.pdf', '2026-10-03T10:00:00Z')]]]);
  const filas = indiceDocumentos({ frentes, evidencias, garantias, evidenciasGarantias });
  test('todos los documentos, de entregables y de garantías, del más reciente al más antiguo, con su origen', () => {
    assert.deepEqual(filas.map((f) => [f.nombre, f.origen, f.titulo, f.frente]), [
      ['estudio.pdf', 'entregable', 'Estudio', 'Interconexión'],
      ['fianza-cenace.pdf', 'garantia', 'Fianza CENACE', null],
      ['resolutivo-mia.pdf', 'entregable', 'MIA', 'Ambiental'],
    ]);
  });
  test('filtros por frente y por garantía', () => {
    assert.deepEqual(filtrarDocumentos(filas, { frente: 'Ambiental' }).map((f) => f.nombre), ['resolutivo-mia.pdf']);
    assert.deepEqual(filtrarDocumentos(filas, { garantia: 'todas' }).map((f) => f.nombre), ['fianza-cenace.pdf']);
    assert.deepEqual(filtrarDocumentos(filas, { garantia: 'g1' }), []);
    assert.equal(filtrarDocumentos(filas).length, 3);
  });
  test('completos sin documento: la misma regla que la alerta', () => {
    assert.deepEqual(completosSinDocumento(frentes, { d1: 1, d3: 1 }).map((e) => e.titulo), ['EVIS']);
  });
  test('el lector no ve correos de otras personas; el suyo sí', () => {
    assert.equal(autorVisible('ing@epc.example', true, 'banco@x.example'), AUTOR_OCULTO);
    assert.equal(autorVisible('banco@x.example', true, 'banco@x.example'), 'banco@x.example');
    assert.equal(autorVisible('ing@epc.example', false, 'dueno@x.example'), 'ing@epc.example');
  });
  test('la descarga usa el enlace firmado (sin URL pública)', () => {
    const d = fs.readFileSync('src/paginas/Documentos.jsx', 'utf8');
    assert.match(d, /enlaceDescarga\(evidencia\)/);
    assert.doesNotMatch(d, /getPublicUrl/);
  });
});

describe('Línea de tiempo: una fila por frente', () => {
  test('si un frente llega partido (entregables intercalados), sus entregables se juntan en una sola fila', () => {
    const frentes = [
      { nombre: 'Terreno', items: [['A', 'completo', '', '2026-05-01', {}]] },
      { nombre: 'Ambiental', items: [['B', 'pendiente', '', '2027-01-01', {}]] },
      { nombre: 'Terreno', items: [['C', 'pendiente', '', null, {}], ['D', 'curso', '', '2026-12-01', {}]] },
    ] as Frente[];
    const filas = filasFrentes(frentes, RTB, '2026-10-18');
    assert.deepEqual(filas.map((f) => [f.frente, f.conFecha.map((i) => i.titulo), f.sinFecha.map((i) => i.titulo)]), [
      ['Terreno', ['A', 'D'], ['C']],
      ['Ambiental', ['B'], []],
    ]);
  });
});

describe('Línea de tiempo: estados distinguibles sin color y etiquetas del eje', () => {
  test('cada estado tiene su propio ícono, y la garantía con prórroga uno distinto de la que cubre', () => {
    const iconos = Object.values(ICONO_CLASE);
    assert.equal(new Set(iconos).size, 4);
    assert.notEqual(iconoGarantia({ nivel: 'vigente' }), iconoGarantia({ nivel: 'advertencia' }));
    assert.equal(iconoGarantia({ nivel: 'critico' }), iconoGarantia({ nivel: 'info' }));
    const c = fs.readFileSync('src/paginas/LineaTiempo.jsx', 'utf8');
    assert.match(c, /\{ICONO_CLASE\[i\.clase\]\}<\/span>/);
    assert.match(c, /\{iconoGarantia\(g\)\}<\/span>/);
    assert.match(c, /TEXTO_CLASE\[i\.clase\]/); // y en la lista, con texto
  });
  test('etiquetas por trimestre: "T1 2027"', () => {
    assert.deepEqual(['2027-01-01', '2027-04-01', '2027-07-01', '2027-10-01'].map(etiquetaTrimestre), ['T1 2027', 'T2 2027', 'T3 2027', 'T4 2027']);
    assert.match(fs.readFileSync('src/paginas/LineaTiempo.jsx', 'utf8'), /\(min-width: 900px\)/);
  });
});
