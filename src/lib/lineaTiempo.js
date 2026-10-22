// Línea de tiempo del Cronograma: entregables por frente y vencimientos de garantías contra el RTB objetivo.
// Solo ordena y clasifica fechas que ya existen (entregables efectivos, garantías y referenciaGarantia); no calcula
// plazos nuevos. La severidad de cada garantía es la de la alerta de garantías (estadoGarantia).
import { referenciaGarantia, estadoGarantia, hoyISO, MARGEN_GARANTIAS_DEFAULT } from './validaciones';

/**
 * Clase de un entregable en la línea de tiempo: completo; vencido (rojo: fecha anterior a hoy y no completo);
 * despuesRtb (ámbar: no completo con fecha posterior al RTB objetivo); pendiente (el resto con fecha).
 */
export function claseEntregable(estado, fecha, fechaRtb, hoy = hoyISO()) {
  if (estado === 'completo') return 'completo';
  if (fecha && fecha < hoy) return 'vencido';
  if (fecha && fechaRtb && fecha > fechaRtb) return 'despuesRtb';
  return 'pendiente';
}

/**
 * Filas por frente (una por nombre de frente, en el orden en que aparece): entregables con fecha (en la línea) y sin
 * fecha (solo en la lista).
 */
export function filasFrentes(frentes, fechaRtb, hoy = hoyISO()) {
  const porNombre = new Map();
  frentes.forEach((f, iFrente) => {
    const items = f.items.map(([titulo, estado, responsable, fecha], iItem) => ({
      titulo, estado, responsable, fecha, iFrente, iItem, clase: claseEntregable(estado, fecha, fechaRtb, hoy),
    }));
    porNombre.set(f.nombre, [...(porNombre.get(f.nombre) ?? []), ...items]);
  });
  return [...porNombre].map(([frente, items]) => ({
    frente,
    conFecha: items.filter((i) => i.fecha).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    sinFecha: items.filter((i) => !i.fecha),
  }));
}

/**
 * Garantías activas (no liberadas): vencimiento, su "vigencia requerida hasta" (hito y fecha) y el límite
 * (hito + margen) que debe superar; nivel y acción corta de la alerta de garantías. indice = posición en `garantias`.
 */
export function filasGarantias(garantias, fechas, margen = MARGEN_GARANTIAS_DEFAULT, alertas = []) {
  const accion = new Map(alertas.flatMap((a) => a.garantias ?? []).map((g) => [g.indice, g.accionCorta]));
  return garantias.flatMap((g, indice) => {
    if (g.estado === 'liberada') return [];
    const r = referenciaGarantia(g, fechas, margen);
    const estado = estadoGarantia(alertas, indice);
    return [{
      indice, id: g.id, nombre: `${g.tipo} ${g.beneficiario}`, vence: g.vence,
      hito: r.hito, fechaHito: r.fecha, limite: r.limite, estimada: Boolean(r.estimada),
      cubre: r.limite == null || g.vence > r.limite,
      nivel: estado.nivel, etiqueta: estado.etiqueta, accionCorta: accion.get(indice) ?? null,
    }];
  }).sort((a, b) => a.vence.localeCompare(b.vence));
}

/** Rango de la línea de tiempo (de la fecha más temprana a la más tardía, incluidos hoy y el RTB), con 3 % de margen. */
export function rangoLineaTiempo(fechas) {
  const validas = fechas.filter(Boolean).sort();
  if (validas.length === 0) return null;
  const ms = (iso) => Date.parse(`${iso}T00:00:00Z`);
  const ini = ms(validas[0]), fin = ms(validas[validas.length - 1]);
  const margen = Math.max((fin - ini) * 0.03, 15 * 86_400_000);
  return { desde: ini - margen, hasta: fin + margen };
}

/** Posición (0–100 %) de una fecha ISO dentro del rango. */
export const posicion = (iso, rango) => ((Date.parse(`${iso}T00:00:00Z`) - rango.desde) / (rango.hasta - rango.desde)) * 100;

/** Marcas del eje: el primer día de cada trimestre dentro del rango (ISO). */
export function marcasTrimestre(rango) {
  const marcas = [];
  const d = new Date(rango.desde);
  let anio = d.getUTCFullYear(), mes = Math.floor(d.getUTCMonth() / 3) * 3 + 3;
  for (;;) {
    if (mes >= 12) { anio += 1; mes -= 12; }
    const t = Date.UTC(anio, mes, 1);
    if (t > rango.hasta) break;
    marcas.push(new Date(t).toISOString().slice(0, 10));
    mes += 3;
  }
  return marcas;
}

/** "T1 2027" para el primer día de un trimestre (ISO). */
export const etiquetaTrimestre = (iso) => `T${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1} ${iso.slice(0, 4)}`;

/** Ícono de cada estado (para no depender solo del color). Garantía: ◆ cubre su vigencia; ⚠ requiere prórroga o venció. */
export const ICONO_CLASE = { completo: '✓', vencido: '✕', despuesRtb: '▲', pendiente: '●' };
export const iconoGarantia = (fila) => (fila.nivel === 'vigente' ? '◆' : '⚠');
