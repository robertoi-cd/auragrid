// Supuestos editables: grupo → [campo, etiqueta, unidad, paso del campo]. Los usan el tablero, el historial y el
// Excel del análisis financiero (mismos nombres y unidades en todos).
import type { Supuestos } from './rentabilidad';

// Notas fiscales y de moneda (tablero, editor de supuestos y Excel del análisis financiero)
export const NOTA_DEDUCCION_INMEDIATA = 'Validar con asesor fiscal qué activos califican para la deducción inmediata.';
export const NOTA_EQUIPO_GENERACION = 'Deducción del 100 % en el año 1 (LISR art. 34 fr. XIII). Requiere que el equipo opere al menos 5 años después del ejercicio de la deducción; si no, se paga el ISR de la diferencia. Validar con asesor fiscal.';
export const NOTA_INTERCONEXION = 'Obras de interconexión transferidas a CFE pueden tener un tratamiento fiscal distinto; validar con asesor fiscal.';
/** Solo referencia (no se usa como valor capturado). */
export const REFERENCIA_CONSTRUCCIONES = 'Referencia: construcciones 5 % anual (tasa general LISR).';
export const NOTA_MONEDA = 'Modelo en USD; el ISR se determina en pesos, por lo que el tipo de cambio puede modificar el escudo fiscal.';

/** Campos de la depreciación por categorías: [campo, etiqueta, unidad] (historial de cambios y Excel). */
export const CAMPOS_DEPRECIACION_CATEGORIAS: [keyof Supuestos, string, string][] = [
  ['depreciacionPorCategorias', 'Depreciación por categorías de activo', 'sí/no'],
  ['depreciacionGeneracionPct', 'Equipo de generación: % del CAPEX', '%'],
  ['depreciacionGeneracionTasaPct', 'Equipo de generación: tasa', '% anual'],
  ['depreciacionObraCivilPct', 'Obra civil: % del CAPEX', '%'],
  ['depreciacionObraCivilTasaPct', 'Obra civil: tasa', '% anual'],
  ['depreciacionSubestacionPct', 'Subestación y línea: % del CAPEX', '%'],
  ['depreciacionSubestacionTasaPct', 'Subestación y línea: tasa', '% anual'],
  ['depreciacionInterconexionPct', 'Interconexión: % del CAPEX', '%'],
  ['depreciacionInterconexionTasaPct', 'Interconexión: tasa', '% anual'],
];

/** IVA de construcción: nombre legible de cada campo (historial y Excel). */
export const CAMPOS_IVA: [keyof Supuestos, string, string][] = [
  ['ivaActivo', 'IVA de construcción', 'sí/no'],
  ['ivaTasaPct', 'Tasa de IVA', '%'],
  ['ivaCapexSujetoPct', 'CAPEX sujeto a IVA', '%'],
  ['ivaOrigenEquipo', 'Origen del equipo', 'importación/local'],
  ['ivaRecuperacionMeses', 'Meses de recuperación del IVA', 'meses'],
  ['ivaFinanciamiento', 'Financiamiento del IVA', 'equity/línea'],
  ['ivaLineaMonto', 'Línea IVA: monto máximo (equivalente en USD)', 'USD'],
  ['ivaLineaTasaPct', 'Línea IVA: tasa anual', '%'],
  ['ivaLineaComisionPct', 'Línea IVA: comisión', '%'],
];

export const GRUPOS: [string, [keyof Supuestos, string, string, number][]][] = [
  ['Producción', [
    ['rendimientoFijaKwhKwp', 'Rendimiento con estructura fija', 'kWh/kWp·año', 1],
    ['gananciaUnEjePct', 'Ganancia de un eje sobre fija', '%', 0.5],
    ['gananciaDosEjesPct', 'Ganancia de dos ejes sobre un eje', '%', 0.5],
    ['p90Pct', 'P90 como % del P50', '%', 0.5],
    ['degradacionPct', 'Degradación anual', '%', 0.05],
    ['vidaUtilAnos', 'Vida útil', 'años', 1],
    ['mesesConstruccion', 'Construcción', 'meses', 1]
  ]],
  ['Ingresos', [
    ['ppaPrecio', 'Precio PPA', 'USD/MWh', 0.5],
    ['ppaPorcentaje', 'Energía vendida por PPA', '%', 1],
    ['ppaPlazoAnos', 'Plazo del PPA', 'años', 1],
    ['ppaEscalamientoPct', 'Escalamiento PPA', '%/año', 0.1],
    ['mercadoPrecio', 'Precio de mercado', 'USD/MWh', 0.5],
    ['mercadoEscalamientoPct', 'Escalamiento mercado', '%/año', 0.1],
    ['celPrecio', 'Precio CEL', 'USD/MWh', 0.5]
  ]],
  ['Costos y estructuras', [
    ['opexAnual', 'OPEX sin seguros (estructura base)', 'USD/año', 1000],
    ['segurosAnual', 'Seguros', 'USD/año', 1000],
    ['arrendamientoAnual', 'Arrendamiento', 'USD/año', 1000],
    ['opexEscalamientoPct', 'Escalamiento de OPEX, seguros y arrendamiento', '%/año', 0.1],
    ['sobrecostoUnEjeUsdWdc', 'Sobrecosto un eje vs fija', 'USD/Wdc', 0.01],
    ['sobrecostoDosEjesUsdWdc', 'Sobrecosto dos ejes vs un eje', 'USD/Wdc', 0.01],
    ['omExtraUnEjeUsdKwdc', 'O&M extra un eje vs fija', 'USD/kWdc·año', 0.5],
    ['omExtraDosEjesUsdKwdc', 'O&M extra dos ejes vs un eje', 'USD/kWdc·año', 0.5]
  ]],
  ['Deuda (esculpida)', [
    ['tasaInteresPct', 'Tasa de interés', '%', 0.1],
    ['plazoDeudaAnos', 'Plazo de la deuda', 'años', 1],
    ['dscrDimensionamientoP50', 'DSCR de dimensionamiento con P50', 'x', 0.05],
    ['dscrDimensionamientoP90', 'DSCR de dimensionamiento con P90', 'x', 0.05],
    ['dscrMercado', 'DSCR de ingresos sin contrato', 'x', 0.05],
    ['dscrCovenant', 'Covenant (DSCR mínimo del crédito)', 'x', 0.05],
    ['apalancamientoMaxPct', 'Apalancamiento máximo sobre usos', '%', 1],
    ['comisionEstructuracionPct', 'Comisión de estructuración', '%', 0.1],
    ['dsraMeses', 'Cuenta de reserva (DSRA)', 'meses de servicio', 1]
  ]],
  ['Impuestos y descuento', [
    ['isrPct', 'ISR', '%', 1],
    ['depreciacionAno1Pct', 'Depreciación en el año 1 (esquema inmediato)', '%', 1],
    ['depreciacionTasaAnualPct', 'Tasa anual de depreciación', '%', 1],
    ['tasaDescuentoPct', 'Tasa de descuento (LCOE)', '%', 0.1]
  ]],
  ['Objetivo de rentabilidad', [
    ['tirEquityObjetivoPct', 'TIR de equity objetivo (precio mínimo de PPA)', '%', 0.5]
  ]]
];
/**
 * Riesgos de operación y estrés (Nivel bancario A). Opcionales: vacío = no aplica y la cifra base no cambia. No están en
 * GRUPOS para que el resumen y el Excel queden como antes mientras no se capturen. [campo, etiqueta, unidad, paso, rango]
 */
export const CAMPOS_RIESGOS: [keyof Supuestos, string, string, number, (n: number) => boolean, string][] = [
  ['disponibilidadPct', 'Disponibilidad de la planta', '%', 0.1, (n) => n > 0 && n <= 100, 'mayor a 0 y hasta 100 %'],
  ['curtailmentPct', 'Curtailment (energía no despachada)', '%', 0.1, (n) => n >= 0 && n < 100, '0 a menos de 100 %'],
  ['reemplazoInversoresAno', 'Reemplazo de inversores: año de operación', 'año', 1, (n) => Number.isInteger(n) && n >= 1 && n <= 60, 'año entero de 1 a 60'],
  ['reemplazoInversoresUsdKwac', 'Reemplazo de inversores: costo (USD nominales del año del reemplazo)', 'USD/kWac', 1, (n) => n >= 0, '0 o mayor'],
  ['mmraAnosFondeo', 'Reserva MMRA: años de fondeo previos al reemplazo', 'años', 1, (n) => Number.isInteger(n) && n >= 1 && n <= 30, 'años enteros de 1 a 30'],
  ['dscrLockup', 'DSCR de lock-up (bloqueo de dividendos)', 'x', 0.01, (n) => n > 0 && n <= 5, 'mayor a 0 y hasta 5x'],
  ['epcPenalizacionUsdDia', 'Penalización del EPC por retraso de la COD', 'USD/día', 100, (n) => n >= 0, '0 o mayor'],
  ['epcPenalizacionTopeUsd', 'Tope de la penalización del EPC', 'USD', 1000, (n) => n >= 0, '0 o mayor'],
];
/** Estados financieros (opcional; vacío = no). [campo, etiqueta, unidad] */
export const CAMPOS_ESTADOS: [keyof Supuestos, string, string][] = [
  ['devolucionCapitalVariable', 'Devolución de capital variable', 'sí/no'],
];
export const NOTA_DEVOLUCION_CAPITAL = 'Con sí, la caja que no puede salir como dividendo se reembolsa como capital variable (hasta el capital aportado pendiente y sujeto al lock-up). Vacío = no: esa caja queda atrapada hasta que haya utilidades.';
export const NOTA_REEMPLAZO_INVERSORES = 'Se deprecia con la tasa del equipo de generación; validar con asesor fiscal. La reserva MMRA se fondea desde el CFADS en partes iguales, sin escalamiento.';
