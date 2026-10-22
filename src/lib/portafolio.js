// Tarjetas de Inicio y alertas por módulo. Todo sale de analizarProyecto() (la misma cadena que el tablero) y de
// validarProyecto(); aquí solo se toma lo que la tarjeta muestra. Sin sensibilidades ni precio mínimo de PPA.
import { analizarProyecto } from './analisisProyecto';
import { financiamientoIndicativo } from './creditos';
import { contarAlertas, diasEntre, hoyISO } from './validaciones';

/** Módulo donde se resuelve cada alerta (para el número de alertas críticas del menú lateral). */
export function moduloDeAlerta(alerta) {
  if (alerta.ref?.tipo === 'garantias' || alerta.categoria === 'Garantías') return 'garantias';
  if (alerta.ref?.tipo === 'proyecto' && alerta.ref.clave === 'evidencia') return 'documentos';
  if (alerta.ref?.tipo === 'proyecto' && alerta.ref.clave === 'rtb') return 'cronograma';
  if (alerta.categoria === 'Frentes de trabajo') return 'permisos';
  if (alerta.categoria === 'Financiamiento') return 'finanzas';
  return 'resumen';
}

/** Alertas críticas por módulo: { garantias: 1, finanzas: 2, … } y el total. */
export function criticasPorModulo(alertas) {
  const porModulo = {};
  let total = 0;
  for (const a of alertas) {
    if (a.sev !== 'critico') continue;
    const m = moduloDeAlerta(a);
    porModulo[m] = (porModulo[m] ?? 0) + 1;
    total += 1;
  }
  return { porModulo, total };
}

/** % de preparación para RTB: entregables completos sobre el total (la misma regla que la barra de RTB). */
export const porcentajeRtb = (frentes) => {
  const items = frentes.flatMap((f) => f.items || []);
  return items.length > 0 ? Math.round((items.filter((i) => i[1] === 'completo').length / items.length) * 100) : 0;
};

/**
 * Tarjeta de Inicio de un proyecto. datos: { frentes, garantias, movimientos, supuestos, errores } (portafolioApi).
 * faltantes: qué dato falta (la tarjeta dice "Datos incompletos" y lo lista; nunca "Sin alertas" a ciegas).
 */
export function tarjetaProyecto(project, datos, hoy = hoyISO()) {
  const errores = datos.errores ?? {};
  const a = analizarProyecto({
    project, frentes: datos.frentes, garantias: datos.garantias, movimientos: datos.movimientos, supuestos: datos.supuestos,
    // Créditos de la deuda (los mismos que usa el tablero); si no se pudieron leer, los supuestos quedan "no disponibles"
    creditos: datos.creditos,
    cargaGarantias: { cargando: false, error: errores.garantias ?? '' },
    cargaSupuestos: { cargando: false, error: errores.supuestos ?? errores.creditos ?? '' },
  });
  const r = a.rentabilidad;
  const faltantes = [
    ...Object.values(errores),
    ...(!project.fechaRtb ? ['RTB objetivo sin definir'] : []),
    ...(!errores.entregables && a.frentesEfectivos.flatMap((f) => f.items).length === 0 ? ['Sin entregables registrados'] : []),
    ...(!errores.garantias && datos.garantias.length === 0 ? ['Sin garantías registradas'] : []),
    ...(!errores.cronograma && a.finanzas?.origenCronograma === 'ninguno' ? ['Sin cronograma de caja'] : []),
    ...(a.resumenRentabilidad?.estado === 'sin_supuestos' ? ['Sin supuestos financieros: TIR y DSCR en N/D'] : []),
    ...(a.resumenRentabilidad?.estado === 'depreciacion_incompleta' ? ['Depreciación por categorías incompleta: TIR y DSCR en N/D'] : []),
    ...(a.resumenRentabilidad?.estado === 'creditos_incompletos' ? ['Créditos de la deuda incompletos: TIR y DSCR en N/D'] : []),
    ...(r?.problemasIva?.length ? ['Datos de IVA incompletos: TIR en N/D'] : []),
  ];
  const { criticas } = contarAlertas(a.alertas);
  return {
    id: project.id,
    nombre: project.name,
    estado: project.state,
    rol: project.rol,
    esEjemplo: Boolean(project.esEjemplo),
    fechaRtb: project.fechaRtb ?? null,
    diasRtb: project.fechaRtb ? diasEntre(hoy, project.fechaRtb) : null,
    preparacionRtb: porcentajeRtb(a.frentesEfectivos),
    criticas,
    criticasPorModulo: criticasPorModulo(a.alertas).porModulo,
    capex: a.finanzas?.capex ?? null,
    tirEquity: r?.tirEquity ?? null,
    dscrMinimo: r?.dscrMinP50 ?? null,
    faltantes,
    completo: faltantes.length === 0,
    // Todos los créditos pendientes o sin banco definido (no cambia las cifras)
    financiamientoIndicativo: datos.creditos ? financiamientoIndicativo(datos.creditos) : false,
  };
}
