// GENERADO por scripts/recurso_solar_estados.py — no editar a mano (volver a ejecutar el script).
// GHI y producción específica (PVOUT, estructura fija con inclinación óptima) promedio por entidad federativa.
// Fuente: Global Solar Atlas (Banco Mundial / Solargis), API pública /data/lta, datos v1.7, actualizados 2026-04-01.
// Método: promedio simple de 9 a 16 puntos de una cuadrícula regular dentro de los límites estatales de
// Natural Earth 1:10m (admin-1, v5.1.2). Es una aproximación ilustrativa, no un estudio de recurso del sitio.

export interface RecursoSolarEstado {
  /** GHI promedio, kWh/m²/día (null = por confirmar). */
  ghi: number | null;
  /** Rango de GHI entre los puntos muestreados, kWh/m²/día. */
  ghiMin: number | null;
  ghiMax: number | null;
  /** Producción específica con estructura fija (PVOUT de Global Solar Atlas), kWh/kWp·año (null = por confirmar). */
  pvout: number | null;
  /** Puntos con dato usados en el promedio. */
  puntos: number;
}

export const FUENTE_RECURSO_SOLAR = 'Global Solar Atlas (Banco Mundial / Solargis), datos v1.7 actualizados 2026-04-01: promedio de 9 a 16 puntos de una cuadrícula dentro de cada estado (límites: Natural Earth 1:10m)';

/** Las 32 entidades federativas, en orden alfabético. */
export const RECURSO_SOLAR_ESTADOS: Record<string, RecursoSolarEstado> = {
  'Aguascalientes': { ghi: 6.12, ghiMin: 5.9, ghiMax: 6.26, pvout: 1907, puntos: 9 },
  'Baja California': { ghi: 5.98, ghiMin: 5.63, ghiMax: 6.24, pvout: 1942, puntos: 9 },
  'Baja California Sur': { ghi: 6.2, ghiMin: 6.09, ghiMax: 6.31, pvout: 1944, puntos: 16 },
  'Campeche': { ghi: 5.37, ghiMin: 5.01, ghiMax: 5.57, pvout: 1601, puntos: 16 },
  'Chiapas': { ghi: 5.43, ghiMin: 5.01, ghiMax: 5.95, pvout: 1632, puntos: 16 },
  'Chihuahua': { ghi: 5.9, ghiMin: 5.45, ghiMax: 6.1, pvout: 1900, puntos: 16 },
  'Ciudad de México': { ghi: 5.68, ghiMin: 5.31, ghiMax: 5.93, pvout: 1776, puntos: 16 },
  'Coahuila': { ghi: 5.68, ghiMin: 5.12, ghiMax: 6.17, pvout: 1799, puntos: 12 },
  'Colima': { ghi: 5.77, ghiMin: 5.57, ghiMax: 5.95, pvout: 1752, puntos: 16 },
  'Durango': { ghi: 5.96, ghiMin: 5.3, ghiMax: 6.26, pvout: 1874, puntos: 11 },
  'Estado de México': { ghi: 5.74, ghiMin: 5.06, ghiMax: 6.01, pvout: 1771, puntos: 9 },
  'Guanajuato': { ghi: 6.05, ghiMin: 5.8, ghiMax: 6.3, pvout: 1865, puntos: 11 },
  'Guerrero': { ghi: 5.81, ghiMin: 5.04, ghiMax: 6.15, pvout: 1750, puntos: 16 },
  'Hidalgo': { ghi: 5.57, ghiMin: 4.22, ghiMax: 6.12, pvout: 1717, puntos: 16 },
  'Jalisco': { ghi: 5.91, ghiMin: 5.42, ghiMax: 6.17, pvout: 1817, puntos: 16 },
  'Michoacán': { ghi: 5.77, ghiMin: 5.27, ghiMax: 6.01, pvout: 1753, puntos: 16 },
  'Morelos': { ghi: 6.09, ghiMin: 5.39, ghiMax: 6.34, pvout: 1849, puntos: 16 },
  'Nayarit': { ghi: 5.72, ghiMin: 5.14, ghiMax: 6.02, pvout: 1745, puntos: 10 },
  'Nuevo León': { ghi: 5.43, ghiMin: 4.98, ghiMax: 6.11, pvout: 1698, puntos: 16 },
  'Oaxaca': { ghi: 5.21, ghiMin: 4.26, ghiMax: 6.08, pvout: 1574, puntos: 9 },
  'Puebla': { ghi: 5.65, ghiMin: 4.61, ghiMax: 6.33, pvout: 1730, puntos: 12 },
  'Querétaro': { ghi: 5.77, ghiMin: 4.8, ghiMax: 6.23, pvout: 1773, puntos: 16 },
  'Quintana Roo': { ghi: 5.3, ghiMin: 5.2, ghiMax: 5.75, pvout: 1598, puntos: 13 },
  'San Luis Potosí': { ghi: 5.62, ghiMin: 4.15, ghiMax: 6.26, pvout: 1737, puntos: 16 },
  'Sinaloa': { ghi: 5.76, ghiMin: 5.44, ghiMax: 5.98, pvout: 1787, puntos: 16 },
  'Sonora': { ghi: 5.96, ghiMin: 5.81, ghiMax: 6.1, pvout: 1907, puntos: 16 },
  'Tabasco': { ghi: 5.3, ghiMin: 4.87, ghiMax: 5.54, pvout: 1578, puntos: 16 },
  'Tamaulipas': { ghi: 5.21, ghiMin: 4.96, ghiMax: 5.42, pvout: 1602, puntos: 16 },
  'Tlaxcala': { ghi: 5.97, ghiMin: 5.66, ghiMax: 6.17, pvout: 1867, puntos: 16 },
  'Veracruz': { ghi: 4.9, ghiMin: 4.37, ghiMax: 5.44, pvout: 1467, puntos: 16 },
  'Yucatán': { ghi: 5.39, ghiMin: 5.26, ghiMax: 5.5, pvout: 1628, puntos: 13 },
  'Zacatecas': { ghi: 6.11, ghiMin: 5.67, ghiMax: 6.21, pvout: 1914, puntos: 16 },
};
