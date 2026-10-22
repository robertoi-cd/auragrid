// Formato único de montos y fechas para toda la app.
// es-MX + USD produce "USD 46,500,000": separador de miles con coma y moneda explícita.

const monedas = new Map<number, Intl.NumberFormat>();

/**
 * Formatea un monto en dólares. Acepta número o texto heredado como "$46,500,000 USD".
 * `decimales` solo para precios unitarios (p. ej. LCOE en USD/MWh).
 */
export function formatearMoneda(valor: number | string | null | undefined, decimales = 0): string {
  const n = aNumero(valor);
  if (n === null) return 'N/D';
  if (!monedas.has(decimales)) {
    monedas.set(decimales, new Intl.NumberFormat('es-MX', {
      style: 'currency', currency: 'USD', minimumFractionDigits: decimales, maximumFractionDigits: decimales,
    }));
  }
  return monedas.get(decimales)!.format(n);
}

/** Convierte montos guardados como texto ("$48.000.000 USD", "$46,500,000 USD") a número entero. */
export function aNumero(valor: number | string | null | undefined): number | null {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (!valor) return null;
  // Los montos de la app son enteros: se descartan separadores de miles en cualquier convención.
  const digitos = String(valor).replace(/[^\d]/g, '');
  return digitos ? Number(digitos) : null;
}

const NUMERO = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

/** Número entero con separador de miles: 135,750 */
export function formatearNumero(valor: number | null | undefined, decimales = 0): string {
  if (valor == null || !Number.isFinite(valor)) return 'N/D';
  return new Intl.NumberFormat('es-MX', { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(valor);
}

/** Fracción como porcentaje: 0.082 → "8.2 %"; null → "N/D" */
export function formatearPorcentaje(fraccion: number | null | undefined, decimales = 1): string {
  if (fraccion == null || !Number.isFinite(fraccion)) return 'N/D';
  return `${formatearNumero(fraccion * 100, decimales)} %`;
}

/** TIR (fracción) con 2 decimales en toda la app: tarjetas, indicadores, Finanzas, alertas y asistente ("8.15 %"). */
export const formatearTir = (fraccion: number | null | undefined): string => formatearPorcentaje(fraccion, 2);

/** DSCR: 1.234 → "1.23x"; null → "N/D" */
export function formatearDscr(valor: number | null | undefined): string {
  return valor == null || !Number.isFinite(valor) ? 'N/D' : `${formatearNumero(valor, 2)}x`;
}

/** "50 MWac / 62.5 MWdc" */
export function formatearCapacidad(mwac: number, mwdc: number): string {
  return `${NUMERO.format(mwac)} MWac / ${NUMERO.format(mwdc)} MWdc`;
}

const FECHA =new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Formatea una fecha ISO (YYYY-MM-DD) como "31 mar 2027", sin desfases por zona horaria. */
export function formatearFecha(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return FECHA.format(new Date(Date.UTC(y, m - 1, d)));
}
