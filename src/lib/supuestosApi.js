// Acceso a project_financial_assumptions (RLS: el equipo del proyecto lee; dueño y editor editan).
// La tasa de interés y la comisión de estructuración ya no viven aquí sino en los créditos (project_loans,
// creditosApi.js): sus dos columnas de esta tabla quedan en desuso (comentario en la columna) y no se leen ni se
// escriben; por eso las consultas piden columnas explícitas y no "*".
import { supabase } from '../supabase';
import { SUPUESTOS_DEFAULT } from './rentabilidad';

export const MENSAJE_SIN_SUPUESTOS = 'Supuestos financieros no disponibles';

// Modelo (rentabilidad.ts) ↔ columna en Supabase
export const COLUMNAS = {
  estructuraBase: 'estructura_base',
  estructuraSeleccionada: 'estructura_seleccionada',
  rendimientoFijaKwhKwp: 'rendimiento_fija_kwh_kwp',
  gananciaUnEjePct: 'ganancia_un_eje_pct',
  gananciaDosEjesPct: 'ganancia_dos_ejes_pct',
  sobrecostoUnEjeUsdWdc: 'sobrecosto_un_eje_usd_wdc',
  sobrecostoDosEjesUsdWdc: 'sobrecosto_dos_ejes_usd_wdc',
  omExtraUnEjeUsdKwdc: 'om_extra_un_eje_usd_kwdc',
  omExtraDosEjesUsdKwdc: 'om_extra_dos_ejes_usd_kwdc',
  p90Pct: 'p90_pct',
  degradacionPct: 'degradacion_pct',
  vidaUtilAnos: 'vida_util_anos',
  mesesConstruccion: 'meses_construccion',
  ppaPrecio: 'ppa_precio_usd_mwh',
  ppaPorcentaje: 'ppa_porcentaje',
  ppaPlazoAnos: 'ppa_plazo_anos',
  ppaEscalamientoPct: 'ppa_escalamiento_pct',
  mercadoPrecio: 'mercado_precio_usd_mwh',
  mercadoEscalamientoPct: 'mercado_escalamiento_pct',
  celPrecio: 'cel_precio_usd_mwh',
  opexAnual: 'opex_anual_usd',
  segurosAnual: 'seguros_anual_usd',
  arrendamientoAnual: 'arrendamiento_anual_usd',
  opexEscalamientoPct: 'opex_escalamiento_pct',
  plazoDeudaAnos: 'plazo_deuda_anos',
  dscrDimensionamientoP50: 'dscr_minimo_requerido',
  dscrDimensionamientoP90: 'dscr_dimensionamiento_p90',
  dscrMercado: 'dscr_mercado',
  dscrCovenant: 'dscr_covenant',
  apalancamientoMaxPct: 'apalancamiento_max_pct',
  dsraMeses: 'dsra_meses',
  isrPct: 'isr_pct',
  depreciacionEsquema: 'depreciacion_esquema',
  depreciacionAno1Pct: 'depreciacion_ano1_pct',
  depreciacionTasaAnualPct: 'depreciacion_tasa_anual_pct',
  depreciacionPorCategorias: 'depreciacion_por_categorias',
  depreciacionGeneracionPct: 'depreciacion_generacion_pct',
  depreciacionObraCivilPct: 'depreciacion_obra_civil_pct',
  depreciacionSubestacionPct: 'depreciacion_subestacion_pct',
  depreciacionInterconexionPct: 'depreciacion_interconexion_pct',
  depreciacionGeneracionTasaPct: 'depreciacion_generacion_tasa_pct',
  depreciacionObraCivilTasaPct: 'depreciacion_obra_civil_tasa_pct',
  depreciacionSubestacionTasaPct: 'depreciacion_subestacion_tasa_pct',
  depreciacionInterconexionTasaPct: 'depreciacion_interconexion_tasa_pct',
  tasaDescuentoPct: 'tasa_descuento_pct',
  tirEquityObjetivoPct: 'tir_equity_objetivo_pct',
  // IVA de construcción (migración 20261022100000)
  ivaActivo: 'iva_activo',
  ivaTasaPct: 'iva_tasa_pct',
  ivaCapexSujetoPct: 'iva_capex_sujeto_pct',
  ivaRecuperacionMeses: 'iva_recuperacion_meses',
  ivaOrigenEquipo: 'iva_origen_equipo',
  ivaFinanciamiento: 'iva_financiamiento',
  ivaLineaMonto: 'iva_linea_monto',
  ivaLineaTasaPct: 'iva_linea_tasa_pct',
  ivaLineaComisionPct: 'iva_linea_comision_pct',
  // Riesgos de operación (migración 20261024100000): vacío = no aplica
  disponibilidadPct: 'disponibilidad_pct',
  curtailmentPct: 'curtailment_pct',
  reemplazoInversoresAno: 'reemplazo_inversores_ano',
  reemplazoInversoresUsdKwac: 'reemplazo_inversores_usd_kwac',
  mmraAnosFondeo: 'mmra_anos_fondeo',
  dscrLockup: 'dscr_lockup',
  epcPenalizacionUsdDia: 'epc_penalizacion_usd_dia',
  epcPenalizacionTopeUsd: 'epc_penalizacion_tope_usd',
  // Estados financieros (migración 20261026100000): vacío = no
  devolucionCapitalVariable: 'devolucion_capital_variable'
};
const TEXTO = new Set(['estructuraBase', 'estructuraSeleccionada', 'depreciacionEsquema', 'ivaOrigenEquipo', 'ivaFinanciamiento']);
const BOOLEANOS = new Set(['depreciacionPorCategorias', 'ivaActivo', 'devolucionCapitalVariable']);
// Datos que el usuario puede dejar sin capturar: null se conserva (no se sustituye por un valor supuesto)
export const OPCIONALES = new Set(['depreciacionObraCivilTasaPct', 'depreciacionSubestacionTasaPct', 'depreciacionInterconexionTasaPct', 'tirEquityObjetivoPct',
  'ivaCapexSujetoPct', 'ivaRecuperacionMeses', 'ivaOrigenEquipo', 'ivaFinanciamiento', 'ivaLineaMonto', 'ivaLineaTasaPct', 'ivaLineaComisionPct',
  'disponibilidadPct', 'curtailmentPct', 'reemplazoInversoresAno', 'reemplazoInversoresUsdKwac', 'mmraAnosFondeo', 'dscrLockup',
  'epcPenalizacionUsdDia', 'epcPenalizacionTopeUsd', 'devolucionCapitalVariable']);

// Una columna ausente (p. ej. antes de aplicar una migración) toma el valor por defecto del modelo
export const aSupuestos = (fila) => Object.fromEntries(
  Object.entries(COLUMNAS).map(([campo, col]) => {
    const valor = fila[col];
    if (valor === undefined || valor === null) return [campo, OPCIONALES.has(campo) ? null : SUPUESTOS_DEFAULT[campo]];
    if (BOOLEANOS.has(campo)) return [campo, Boolean(valor)];
    return [campo, TEXTO.has(campo) ? valor : Number(valor)];
  })
);

/**
 * Fecha de la última modificación de los supuestos (updated_at), como propiedad no enumerable: viaja con el objeto
 * para mostrar "supuestos actualizados el…" sin entrar en cálculos, comparaciones ni exportaciones (que recorren campos).
 */
const conFecha = (s, fila) => Object.defineProperty(s, 'actualizado', { value: fila.updated_at ?? null, enumerable: false });

/** Columnas que se leen (las del modelo, sin las que están en desuso). */
export const COLUMNAS_SUPUESTOS = ['project_id', 'updated_at', ...Object.values(COLUMNAS)].join(', ');

/** Supuestos del proyecto, o null si el proyecto aún no tiene (se muestra N/D, no valores inventados). */
export async function cargarSupuestos(projectId) {
  const { data, error } = await supabase
    .from('project_financial_assumptions')
    .select(COLUMNAS_SUPUESTOS)
    .eq('project_id', projectId)
    .maybeSingle();
  if (error) {
    console.error('Error al cargar project_financial_assumptions:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error(MENSAJE_SIN_SUPUESTOS);
  }
  return data ? conFecha(aSupuestos(data), data) : null;
}

/** Guarda solo los campos indicados y devuelve los supuestos completos ya guardados. */
export async function guardarSupuestos(projectId, cambios) {
  const fila = Object.fromEntries(Object.entries(cambios).map(([campo, valor]) => [COLUMNAS[campo], valor]));
  const { data, error } = await supabase
    .from('project_financial_assumptions')
    .update({ ...fila, updated_at: new Date().toISOString() })
    .eq('project_id', projectId)
    .select(COLUMNAS_SUPUESTOS)
    .single();
  if (error) {
    if (error.code === '23514') throw new Error('Algún valor está fuera del rango permitido.');
    if (error.code === 'PGRST116' || error.code === '42501') throw new Error('No tienes permiso para modificar este proyecto.');
    throw new Error('No se pudieron guardar los supuestos. Intenta de nuevo.');
  }
  return conFecha(aSupuestos(data), data);
}

/** Crea la fila de supuestos (valores por defecto de la base + los indicados) al dar de alta un proyecto. */
export async function crearSupuestosIniciales(projectId, valores = {}) {
  const fila = Object.fromEntries(
    Object.entries(valores).filter(([, v]) => Number.isFinite(v)).map(([campo, v]) => [COLUMNAS[campo], v])
  );
  const { error } = await supabase.from('project_financial_assumptions').insert({ project_id: projectId, ...fila });
  if (error) console.error('No se pudieron crear los supuestos iniciales:', [error.code, error.message].filter(Boolean).join(' '));
}
