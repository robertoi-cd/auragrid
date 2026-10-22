// Módulos del proyecto (rutas /proyectos/:id/<ruta>) y lo que Resumen toma de la cadena de cálculo.
// Nada de aquí calcula cifras nuevas: solo elige y ordena lo que ya calcularon analizarProyecto() y validarProyecto().
import { diasEntre, hoyISO } from './validaciones';
import { ESTRUCTURAS } from './rentabilidad';
import { formatearMoneda, formatearNumero } from './formato';

/**
 * Módulos con contenido, en el orden del menú. soloEdicion: solo dueño y editor (el lector no lo ve en el menú y, si
 * entra por la URL, ve un mensaje).
 */
export const MODULOS = [
  { clave: 'resumen', ruta: 'resumen', nombre: 'Resumen' },
  { clave: 'permisos', ruta: 'permisos', nombre: 'Permisos y frentes' },
  { clave: 'garantias', ruta: 'garantias', nombre: 'Garantías' },
  { clave: 'cronograma', ruta: 'cronograma', nombre: 'Cronograma' },
  { clave: 'finanzas', ruta: 'finanzas', nombre: 'Finanzas' },
  { clave: 'documentos', ruta: 'documentos', nombre: 'Documentos' },
  { clave: 'configuracion', ruta: 'configuracion', nombre: 'Configuración', soloEdicion: true },
];
const CLAVES = new Set(MODULOS.map((m) => m.clave));

/** Módulos del menú según el rol: el lector no ve los de solo edición. */
export const modulosVisibles = (puedeEditar) => MODULOS.filter((m) => puedeEditar || !m.soloEdicion);

/** Módulo con contenido al que lleva el enlace de una alerta (si no existe, Resumen). */
export const moduloDisponible = (clave) => (CLAVES.has(clave) ? clave : 'resumen');
export const nombreModulo = (clave) => MODULOS.find((m) => m.clave === clave)?.nombre ?? 'Resumen';

/**
 * Módulo donde se muestra cada registro del historial (una sola fuente, project_change_log, filtrada por módulo).
 * Entregables y sus documentos → Permisos; garantías, sus documentos y el margen → Garantías; supuestos y CAPEX →
 * Finanzas; la fecha RTB objetivo → Cronograma; el resto (datos del proyecto y equipo) → Resumen, visible también
 * para el lector.
 */
export function moduloDeCambio(r) {
  if (r.campo === 'proyecto_rtb') return 'cronograma';
  if (r.campo === 'baja_garantia' || r.campo.startsWith('garantia_') || r.campo === 'proyecto_margen') return 'garantias';
  if (r.campo === 'supuesto' || r.campo === 'proyecto_capex') return 'finanzas';
  if (['estado', 'fecha', 'responsable', 'titulo', 'alta', 'baja', 'evidencia_alta', 'evidencia_baja'].includes(r.campo)) return 'permisos';
  return 'resumen';
}
export const cambiosDelModulo = (registros, modulo) => registros.filter((r) => moduloDeCambio(r) === modulo);

/**
 * Preparación para RTB: entregables bloqueados (RTB no alcanzable aún) y entregables no completos con fecha
 * compromiso posterior al RTB objetivo (RTB en riesgo). Los entregables calculados (garantías) cuentan igual.
 */
export function estadoPreparacionRtb(frentes, fechaRtb) {
  const items = frentes.flatMap((f, iFrente) => f.items.map(([titulo, estado, responsable, fecha], iItem) => ({ titulo, estado, responsable, fecha, frente: f.nombre, iFrente, iItem })));
  const bloqueados = items.filter((i) => i.estado === 'bloqueado');
  const despuesDelRtb = fechaRtb ? items.filter((i) => i.estado !== 'completo' && i.fecha && i.fecha > fechaRtb) : [];
  return { bloqueados, despuesDelRtb, alcanzable: bloqueados.length === 0, enRiesgo: despuesDelRtb.length > 0 };
}

/**
 * Hitos RTB → NTP → COD (fechasClave), con días desde hoy. estimada: sin cronograma, NTP y COD salen del RTB.
 * conInterconexion (Cronograma): agrega la conclusión de obras de interconexión entre NTP y COD.
 */
export function hitosProyecto(fechas, hoy = hoyISO(), conInterconexion = false) {
  if (!fechas) return [];
  return [
    { clave: 'rtb', nombre: 'RTB', fecha: fechas.rtb ?? null, estimada: false },
    { clave: 'ntp', nombre: 'NTP', fecha: fechas.ntp ?? null, estimada: Boolean(fechas.estimadas) },
    ...(conInterconexion ? [{ clave: 'interconexion', nombre: 'Fin de interconexión', fecha: fechas.finInterconexion ?? null, estimada: Boolean(fechas.estimadas || fechas.finInterconexionEstimada) }] : []),
    { clave: 'cod', nombre: 'COD', fecha: fechas.cod ?? null, estimada: Boolean(fechas.estimadas) },
  ].map((h) => ({ ...h, dias: h.fecha ? diasEntre(hoy, h.fecha) : null }));
}

/**
 * KPIs de Resumen: los mismos valores que muestra Finanzas (estructura seleccionada, caso P50 salvo que se diga),
 * con su contexto. valor null → N/D con el motivo.
 */
const quiebre = (x) => (x == null ? 'no se alcanza' : `${formatearNumero(x * 100, 1)} %`);

export function kpisResumen({ finanzas, rentabilidad: r, supuestos: s, motivoNd, escenarios = null, quiebres = null }) {
  const estructura = r ? ESTRUCTURAS[r.estructura] : null;
  const nd = (valor) => (r ? valor : null);
  return [
    { clave: 'tirEquity', titulo: 'TIR de equity (flujo disponible)', tipo: 'porcentaje', valor: nd(r?.tirEquity ?? null),
      contexto: r ? `Caso P50 · ${estructura} · ${s.tirEquityObjetivoPct != null ? `objetivo ${formatearNumero(s.tirEquityObjetivoPct, 2)} %` : 'objetivo sin capturar'}` : motivoNd,
      objetivo: s?.tirEquityObjetivoPct != null ? s.tirEquityObjetivoPct / 100 : null },
    { clave: 'tirProyecto', titulo: 'TIR de proyecto', tipo: 'porcentaje', valor: nd(r?.tirProyecto ?? null),
      contexto: r ? `Caso P50 · ${estructura} · sin deuda, después de ISR` : motivoNd },
    { clave: 'dscrP50', titulo: 'DSCR mínimo P50', tipo: 'dscr', valor: nd(r?.dscrMinP50 ?? null),
      contexto: r ? `Covenant ${s.dscrCovenant.toFixed(2)}x${r.anoDscrMinP50 ? ` · año ${r.anoDscrMinP50} de operación` : ''}` : motivoNd,
      covenant: s?.dscrCovenant ?? null },
    { clave: 'dscrP90', titulo: 'DSCR mínimo P90', tipo: 'dscr', valor: nd(r?.dscrMinP90 ?? null),
      contexto: r ? `Covenant ${s.dscrCovenant.toFixed(2)}x${r.anoDscrMinP90 ? ` · año ${r.anoDscrMinP90} de operación` : ''}` : motivoNd,
      covenant: s?.dscrCovenant ?? null },
    { clave: 'capex', titulo: 'CAPEX', tipo: 'moneda', valor: finanzas.capex,
      contexto: finanzas.deudaDimensionada ? `Usos totales ${formatearMoneda(finanzas.usos)} con costos financieros` : 'Equipos, obra civil, interconexión y montaje' },
    { clave: 'deuda', titulo: 'Deuda / equity', tipo: 'estructura', valor: finanzas.deuda, equity: finanzas.equity, equityPct: finanzas.equityPct,
      contexto: r ? `Deuda dimensionada · caso P50 y P90` : 'Sin dimensionar (faltan supuestos)' },
    { clave: 'lcoe', titulo: 'LCOE', tipo: 'usdMwh', valor: nd(r?.lcoe ?? null),
      contexto: r ? `Descuento ${s.tasaDescuentoPct} % · caso P50` : motivoNd },
    { clave: 'ppa', titulo: 'PPA vs mercado', tipo: 'precios', valor: s ? s.ppaPrecio : null, mercado: s ? s.mercadoPrecio : null,
      contexto: s ? `${s.ppaPorcentaje} % de la energía por PPA a ${s.ppaPlazoAnos} años; el resto a mercado` : 'Faltan supuestos de ingresos' },
    // Métricas bancarias del caso base (escenarios.ts) y puntos de quiebre de ingresos; solo cuando se calcularon
    ...(escenarios ? (() => {
      const base = escenarios.find((e) => e.clave === 'base');
      return [
        { clave: 'llcr', titulo: 'LLCR', tipo: 'dscr', valor: base?.llcr ?? null, contexto: 'VP del CFADS en el plazo de la deuda ÷ deuda · caso P50' },
        { clave: 'plcr', titulo: 'PLCR', tipo: 'dscr', valor: base?.plcr ?? null, contexto: 'VP del CFADS en toda la vida útil ÷ deuda · caso P50' },
      ];
    })() : []),
    ...(quiebres ? [{
      clave: 'quiebre', titulo: 'Caída de ingresos tolerable', tipo: 'texto',
      valor: `${quiebre(quiebres.hastaCovenant)} / ${quiebre(quiebres.hastaUno)}`,
      contexto: `Hasta el covenant (${s.dscrCovenant.toFixed(2)}x) / hasta DSCR 1.00x · deuda fija, ISR recalculado`,
    }] : []),
  ];
}
