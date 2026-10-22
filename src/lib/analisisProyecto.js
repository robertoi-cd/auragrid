// Cadena de cálculo de un proyecto, la misma que usaba App.jsx (mismas funciones y mismo orden): entregables
// efectivos → avance → modelo financiero → rentabilidad (estructura seleccionada) → finanzas → validarProyecto().
// La usan el tablero (Resumen) y las tarjetas de Inicio, para que ambos den exactamente las mismas cifras.
// No calcula la sensibilidad ni la comparación de depreciación (solo el tablero las usa). El precio mínimo de PPA
// (una búsqueda costosa) solo con calcularPrecioMinimo: el tablero lo pide; las tarjetas de Inicio, no.
import { validarProyecto, aplicarEntregablesAutomaticos, calcularCoberturaGarantias, calcularAvance, MARGEN_GARANTIAS_DEFAULT } from './validaciones';
import { crearModeloFinanciero, calendarioPagos, calendarioIva, fechasClave } from './modeloFinanciero';
import { compararEstructuras, calcularRentabilidad, problemasDepreciacion, precioMinimoPpa, valorPresenteFechado, ESTRUCTURAS, PRECIO_PPA_MAXIMO_BUSQUEDA } from './rentabilidad';
import { problemasIva, movimientosIva, flujosFechadosIva } from './iva';
import { problemasCreditos, condicionesPonderadas, resultadosPorCredito, avisosCreditos } from './creditos';
import { calcularEscenarios, puntosDeQuiebre } from './escenarios';
import { estadosFinancieros } from './estadosFinancieros';

const SIN_CARGA = { cargando: false, error: '' };

/**
 * @param {object} e
 * @param {object|null} e.project  Proyecto (formato de la lista de proyectos de App.jsx).
 * @param {Array} e.frentes        Entregables por frente (cargarEntregables).
 * @param {Array} e.garantias      Garantías (cargarGarantias).
 * @param {Array} e.movimientos    Cronograma de caja capturado (cargarMovimientos).
 * @param {object|null} e.supuestos Supuestos financieros (cargarSupuestos) o null.
 * @param {{cargando:boolean,error:string}} [e.cargaGarantias]
 * @param {{cargando:boolean,error:string}} [e.cargaSupuestos]
 * @param {Record<string, number>} [e.documentos]      Documentos por entregable (solo el tablero).
 * @param {{activas:number,conDocumento:number}} [e.evidenciaGarantias]
 * @param {boolean} [e.calcularPrecioMinimo] Precio de PPA para la TIR objetivo (solo si hay objetivo capturado).
 * @param {Array} [e.creditos] Créditos de la deuda (project_loans). Con ellos, la tasa y las comisiones de la deuda son
 *   las ponderadas por participación y los desembolsos se reparten entre créditos; si están incompletos o las
 *   participaciones no suman 100 %, no se calcula (TIR, DSCR y deuda en N/D). Sin el parámetro, los supuestos tal cual.
 */
export function analizarProyecto({ project, frentes, garantias, movimientos, supuestos, creditos, cargaGarantias = SIN_CARGA, cargaSupuestos = SIN_CARGA, documentos, evidenciaGarantias, calcularPrecioMinimo = false }) {
  const margenGarantias = project?.margenGarantiasDias ?? MARGEN_GARANTIAS_DEFAULT;

  // COD y fin de construcción (cronograma de ejemplo o capturado; sin cronograma, estimados desde el RTB)
  const fechasProyecto = project ? fechasClave(crearModeloFinanciero(project, [], movimientos), project.fechaRtb, supuestos?.mesesConstruccion ?? 12) : null;

  // "Garantías con la vigencia requerida" no se edita a mano: su estado sale de las garantías
  const avisoGarantias = cargaGarantias.error;
  const garantiasDisponibles = !cargaGarantias.cargando && !avisoGarantias;
  const frentesEfectivos = project
    ? aplicarEntregablesAutomaticos(frentes, calcularCoberturaGarantias(garantias, project.fechaRtb, margenGarantias, garantiasDisponibles, fechasProyecto ?? undefined))
    : frentes;

  // Avance real contra el plan, entregables vencidos y RTB proyectado
  const avance = project ? calcularAvance(frentesEfectivos, project.fechaRtb) : null;

  // CAPEX registrado (estructura base) y potencia DC
  const base = project ? crearModeloFinanciero(project) : null;

  // Calendario de pagos para los intereses de construcción
  const modeloCronograma = project ? crearModeloFinanciero(project, frentesEfectivos, movimientos) : null;
  const calendario = modeloCronograma ? calendarioPagos(modeloCronograma.pagos, supuestos?.mesesConstruccion ?? 12, modeloCronograma.fechaNtp) : null;

  // IVA de construcción: fechado con los pagos del cronograma (mes 0 = NTP); solo si está activo
  const ivaActivo = Boolean(project && supuestos?.ivaActivo);
  const calIva = ivaActivo ? calendarioIva(modeloCronograma.pagos, supuestos.ivaOrigenEquipo, modeloCronograma.fechaNtp) : null;

  // Depreciación por categorías incompleta: no se calcula con un valor supuesto
  const problemasDep = supuestos ? problemasDepreciacion(supuestos) : [];
  // Créditos: tasa y comisiones ponderadas (Σ wᵢ·xᵢ). Incompletos o sin sumar 100 %: no se calcula con valores supuestos
  const problemasCred = supuestos && creditos ? problemasCreditos(creditos) : [];
  const condicionesCreditos = creditos ? condicionesPonderadas(creditos) : null;
  const supuestosConCreditos = supuestos && condicionesCreditos ? {
    ...supuestos,
    tasaInteresPct: condicionesCreditos.tasaPct,
    comisionEstructuracionPct: condicionesCreditos.comisionEstructuracionPct,
    comisionNoDisposicionPct: condicionesCreditos.comisionNoDisposicionPct,
  } : supuestos;
  const supuestosCalculables = problemasDep.length === 0 && problemasCred.length === 0 ? supuestosConCreditos : null;

  // TIR, DSCR y LCOE para las 3 estructuras; el tablero usa la seleccionada
  const comparacion = supuestosCalculables && base ? compararEstructuras(supuestosCalculables, base.capex, base.mwdc, calendario, calIva) : null;
  const rentabilidad = comparacion?.find(r => r.estructura === supuestos?.estructuraSeleccionada) ?? null;

  // Modelo financiero con el CAPEX de la estructura seleccionada y la deuda dimensionada (fuentes = usos)
  const modelo = project
    ? crearModeloFinanciero(
        rentabilidad ? { ...project, capex: rentabilidad.capex } : project, frentesEfectivos, movimientos,
        rentabilidad ? { deuda: rentabilidad.deuda, idc: rentabilidad.usos.idc, comision: rentabilidad.usos.comision, dsra: rentabilidad.usos.dsra, noDisposicion: rentabilidad.usos.noDisposicion } : undefined,
        condicionesCreditos ? creditos : undefined,
      )
    : null;
  // Con IVA calculado, sus movimientos cuentan en el hueco de caja (sin IVA, el modelo queda exactamente igual)
  const finanzas = modelo && rentabilidad?.iva ? { ...modelo, iva: movimientosIva(rentabilidad.iva) } : modelo;

  // Costo financiero del IVA (misma medida con equity o con línea): valor presente al NTP de los flujos de IVA a cargo
  // del equity, descontados a la TIR objetivo de equity si está capturada (costo de oportunidad de los socios) y, si
  // no, a la TIR de equity sin IVA; más el impacto en las TIR (pp). Con línea, además intereses y comisión.
  const rentabilidadSinIva = rentabilidad?.iva ? calcularRentabilidad({ ...supuestosCalculables, ivaActivo: false }, rentabilidad.estructura, base.capex, base.mwdc, calendario) : null;
  const tirObjetivoIva = supuestos?.tirEquityObjetivoPct != null ? supuestos.tirEquityObjetivoPct / 100 : null;
  const tasaCostoIva = tirObjetivoIva ?? rentabilidadSinIva?.tirEquity ?? null;
  const costoIva = rentabilidad?.iva && rentabilidadSinIva ? {
    valorPresenteNtp: tasaCostoIva != null ? -valorPresenteFechado(flujosFechadosIva(rentabilidad.iva).equity, tasaCostoIva) : null,
    tasaDescuento: tasaCostoIva,
    baseDescuento: tirObjetivoIva != null ? 'objetivo' : 'sinIva',
    tirEquitySinIva: rentabilidadSinIva.tirEquity,
    tirProyectoSinIva: rentabilidadSinIva.tirProyecto,
    impactoTirEquity: rentabilidad.tirEquity != null && rentabilidadSinIva.tirEquity != null ? rentabilidad.tirEquity - rentabilidadSinIva.tirEquity : null,
    impactoTirProyecto: rentabilidad.tirProyecto != null && rentabilidadSinIva.tirProyecto != null ? rentabilidad.tirProyecto - rentabilidadSinIva.tirProyecto : null,
    nominalLinea: rentabilidad.iva.financiamiento === 'linea' ? rentabilidad.iva.interesesLinea + rentabilidad.iva.comisionLinea : null,
  } : null;

  // IVA para las reglas de validarProyecto (datos faltantes, línea menor al pico, equity comprometido)
  const resumenIva = ivaActivo ? {
    problemas: rentabilidad ? rentabilidad.problemasIva : problemasIva(supuestos),
    ...(rentabilidad?.iva ? {
      pico: rentabilidad.iva.pico, mesPico: rentabilidad.iva.mesPico, financiamiento: rentabilidad.iva.financiamiento,
      lineaMonto: rentabilidad.iva.lineaMonto, sinHitoEntrega: rentabilidad.iva.sinHitoEntrega,
      compromisoMaximoEquity: rentabilidad.iva.compromisoMaximoEquity, mesCompromisoMaximo: rentabilidad.iva.mesCompromisoMaximo,
      equityFuentesUsos: modelo.equity,
      equityComprometido: modelo.fondos.filter((f) => f.fuente === 'equity' && f.confirmado).reduce((s, f) => s + f.monto, 0),
    } : {}),
  } : undefined;

  // Precio de PPA con el que la TIR de equity alcanza el objetivo (deuda redimensionada en cada iteración)
  const precioMinimo = calcularPrecioMinimo && supuestosCalculables && base && supuestosCalculables.tirEquityObjetivoPct != null
    ? precioMinimoPpa(supuestosCalculables, supuestosCalculables.estructuraSeleccionada, base.capex, base.mwdc, undefined, calendario, calIva)
    : null;

  // Escenarios de estrés con la deuda fija del caso base y puntos de quiebre de ingresos (Nivel bancario A)
  const escenarios = rentabilidad ? calcularEscenarios(supuestosCalculables, rentabilidad, base.capex, base.mwdc) : null;
  const quiebres = rentabilidad ? puntosDeQuiebre(supuestosCalculables, rentabilidad, base.capex, base.mwdc) : null;
  const cod6 = escenarios?.find((e) => e.clave === 'cod6')?.cod6 ?? null;
  // Estados financieros del caso base (no cambian ninguna cifra del modelo)
  const estados = rentabilidad ? estadosFinancieros(supuestosCalculables, rentabilidad, base.mwdc) : null;

  let resumenRentabilidad;
  if (!project || cargaSupuestos.cargando) resumenRentabilidad = undefined;
  else if (cargaSupuestos.error) resumenRentabilidad = { estado: 'no_disponible' };
  else if (problemasDep.length) resumenRentabilidad = { estado: 'depreciacion_incompleta', problemas: problemasDep };
  else if (problemasCred.length) resumenRentabilidad = { estado: 'creditos_incompletos', problemas: problemasCred };
  else if (!rentabilidad) resumenRentabilidad = { estado: 'sin_supuestos' };
  else resumenRentabilidad = {
    estado: 'calculada',
    dscrMinP50: rentabilidad.dscrMinP50, anoDscrMinP50: rentabilidad.anoDscrMinP50,
    dscrMinP90: rentabilidad.dscrMinP90, anoDscrMinP90: rentabilidad.anoDscrMinP90,
    covenant: supuestos.dscrCovenant,
    dscrDimensionamientoP50: supuestos.dscrDimensionamientoP50, dscrDimensionamientoP90: supuestos.dscrDimensionamientoP90,
    plazoDeudaAnos: rentabilidad.plazoDeudaAnos, ppaPlazoAnos: rentabilidad.ppaPlazoAnos,
    segurosAnual: supuestos.segurosAnual,
    estructura: ESTRUCTURAS[rentabilidad.estructura],
    tirEquity: rentabilidad.tirEquity,
    tirObjetivo: supuestos.tirEquityObjetivoPct != null ? supuestos.tirEquityObjetivoPct / 100 : null,
    ppaPrecio: supuestos.ppaPrecio, ppaPorcentaje: supuestos.ppaPorcentaje,
    precioMinimo: precioMinimo ? { precio: precioMinimo.precio, maximo: PRECIO_PPA_MAXIMO_BUSQUEDA } : null,
    // Solo si no convergió (alerta); si convergió, el resumen queda igual que antes
    ...(rentabilidad.deudaConvergio ? {} : { deudaConvergio: false }),
    // Solo cuando aplican (sin ellos, el resumen queda igual que antes)
    ...(cod6 && !cod6.alcanza ? { cod6Incumple: cod6 } : {}),
    ...(supuestos.dscrLockup != null ? {
      lockup: {
        dscr: supuestos.dscrLockup,
        casos: escenarios.flatMap((e) => e.dscr.flatMap((x, i) => (x != null && x < supuestos.dscrLockup ? [{ escenario: e.nombre, ano: i + 1, dscr: x }] : []))),
      },
    } : {}),
  };

  // Resultados por crédito (saldo, intereses, amortización, comisiones e IDC), repartidos de los totales
  const porCredito = rentabilidad && condicionesCreditos ? resultadosPorCredito(rentabilidad, creditos) : null;

  // Única fuente de alertas de riesgo
  const alertas = project
    ? validarProyecto({ proyecto: project, frentes: frentesEfectivos, garantias, finanzas, garantiasDisponibles, rentabilidad: resumenRentabilidad, fechasClave: fechasProyecto ?? undefined, documentos, evidenciaGarantias, iva: resumenIva, creditos: supuestos && creditos?.length ? avisosCreditos(creditos) : undefined })
    : [];

  return {
    margenGarantias, fechasProyecto, avisoGarantias, garantiasDisponibles, frentesEfectivos, avance, base, calendario,
    problemasDep, supuestosCalculables, comparacion, rentabilidad, precioMinimo, finanzas, resumenRentabilidad, alertas,
    calIva, costoIva, condicionesCreditos, problemasCreditos: problemasCred, porCredito, escenarios, quiebres, estados,
    // Supuestos con la tasa y las comisiones de los créditos (para mostrar, exportar y el asistente)
    supuestosConCreditos,
  };
}
