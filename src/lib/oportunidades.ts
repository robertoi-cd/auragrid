// Oportunidades de optimización: mejoras posibles que la app detecta con los supuestos del proyecto.
// No son alertas (no hay un riesgo que atender): se muestran aparte y se pasan al asistente como tales.

import { formatearMoneda, formatearNumero, formatearPorcentaje, formatearTir } from './formato';
import type { ComparacionDepreciacion, Rentabilidad, Supuestos } from './rentabilidad';

export interface Oportunidad {
  id: string;
  /** Texto completo, igual en el tablero, el asistente y las descargas. */
  texto: string;
  /** Advertencia que acompaña a la oportunidad (p. ej. "Validar con asesor fiscal"). */
  nota: string;
  accion: string;
}

/** Mejora mínima de la TIR de equity, en puntos porcentuales, para proponer otro esquema de depreciación. */
export const UMBRAL_MEJORA_TIR_PP = 0.25;

const redondear2 = (fraccion: number) => Math.round(fraccion * 10000) / 100; // fracción → % con 2 decimales (como se muestra la TIR)

/** Esquema que usa hoy el proyecto, si coincide con alguno de los comparados (100 % año 1 o tasa anual). */
function esquemaActual(s: Supuestos): ComparacionDepreciacion['esquema'] | null {
  if (s.depreciacionPorCategorias) return 'categorias';
  if (s.depreciacionEsquema === 'anual') return 'anual';
  return Number(s.depreciacionAno1Pct) === 100 ? 'ano1' : null;
}

export function detectarOportunidades(
  { supuestos: s, rentabilidad: r, comparacionDepreciacion }:
  { supuestos: Supuestos | null; rentabilidad: Rentabilidad | null; comparacionDepreciacion: ComparacionDepreciacion[] | null },
): Oportunidad[] {
  if (!s || !r || r.tirEquity == null || !comparacionDepreciacion) return [];
  const oportunidades: Oportunidad[] = [];
  const actual = esquemaActual(s);

  for (const c of comparacionDepreciacion) {
    const tir = c.rentabilidad.tirEquity;
    // La depreciación por categorías solo se compara cuando es la actual (no se propone como alternativa)
    if (c.esquema === actual || c.esquema === 'categorias' || tir == null) continue;
    const mejoraPp = (tir - r.tirEquity) * 100;
    if (mejoraPp <= UMBRAL_MEJORA_TIR_PP + 1e-9) continue; // "más de 0.25 pp" (tolerancia de punto flotante)
    // La diferencia se muestra con las mismas cifras redondeadas que se ven en el tablero
    const diferenciaMostrada = redondear2(tir) - redondear2(r.tirEquity);
    const nombre = c.esquema === 'anual' ? `al ${formatearNumero(s.depreciacionTasaAnualPct, 0)} % anual` : 'del 100 % en el año 1';
    const caducada = c.rentabilidad.isrConDeuda.perdidaCaducada;
    oportunidades.push({
      id: `depreciacion-${c.esquema}`,
      texto: `Depreciación ${nombre}: TIR de equity ${formatearTir(tir)} (+${formatearNumero(diferenciaMostrada, 2)} pp), ${caducada > 0 ? `pérdida fiscal caducada ${formatearMoneda(caducada)}` : 'sin pérdida fiscal caducada'}`,
      nota: 'Validar con asesor fiscal',
      accion: 'Si el asesor fiscal lo confirma, cambiar el esquema de depreciación en "Editar supuestos".',
    });
  }
  return oportunidades;
}
