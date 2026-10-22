// Verifica que las cifras de una respuesta del asistente coincidan con las del tablero (las que calcula la app
// y se envían a Gemini en DATOS DEL PROYECTO). Se usa en el chat y en las descargas.

export interface CifraTablero { etiqueta: string; valor: string }

/** Alerta del motor de validaciones (lo necesario para verificar y anexar sus cifras). */
export interface AlertaTablero { sev: 'critico' | 'advertencia' | 'info'; titulo: string; detalle: string; accion: string }

const TEXTO_SEVERIDAD: Record<AlertaTablero['sev'], string> = { critico: 'Crítica', advertencia: 'Advertencia', info: 'Informativa' };

/** Todo lo que el asistente recibe como dato: cifras del proyecto y textos de las alertas activas. */
export function fuentesVerificacion(cifras: CifraTablero[], alertas: AlertaTablero[] = []): CifraTablero[] {
  return [...cifras, ...alertas.map((a) => ({ etiqueta: `Alerta: ${a.titulo}`, valor: `${a.detalle} ${a.accion}` }))];
}

type Unidad = 'usd' | 'pct' | 'x' | 'mwh';

export interface CifraEncontrada {
  texto: string;          // tal como aparece en la respuesta
  unidad: Unidad;
  valor: number;
  tolerancia: number;     // media unidad del último decimal escrito
}

export interface Verificacion {
  revisadas: number;
  noCoinciden: string[];  // textos de la respuesta que no están en el tablero
}

/**
 * Convierte "28,731,461", "28.73", "28,73" o "1,200" a número. La coma es de miles si va seguida de grupos
 * de 3 dígitos (convención es-MX de la app); si no, es decimal.
 */
export function parsearNumero(t: string): { valor: number; decimales: number } | null {
  const s = t.trim();
  let normal: string;
  if (s.includes('.') && s.includes(',')) normal = s.indexOf(',') < s.indexOf('.') ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) normal = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  else normal = s;
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  return { valor: Number(normal), decimales: normal.includes('.') ? normal.split('.')[1].length : 0 };
}

const MULTIPLICADOR: Record<string, number> = { m: 1e6, mm: 1e6, millones: 1e6, millón: 1e6, mdd: 1e6, k: 1e3, mil: 1e3 };

// Monto: USD 28,731,461 · USD 28.73 M · US$ 1.2 millones · $42.00/MWh
const RE_USD = /(?:USD|US\$|\$)\s?(\d[\d.,]*\d|\d)(?:\s?(M|MM|millones|millón|mdd|k|mil)\b)?/gi;
const RE_PCT = /(\d[\d.,]*\d|\d)\s?%/g;
const RE_X = /(\d+(?:[.,]\d+)?)\s?x\b/gi;
const RE_MWH = /(\d[\d.,]*\d|\d)\s?MWh\b/g;
const RE_PAR_MWH = /(\d[\d.,]*\d|\d)\s?\/\s?(?:\d[\d.,]*\d|\d)\s?MWh\b/g;

export function extraerCifras(texto: string): CifraEncontrada[] {
  const t = texto.replace(/[  ]/g, ' ');
  const cifras: CifraEncontrada[] = [];
  const agregar = (texto: string, unidad: Unidad, numero: string, mult = 1) => {
    const p = parsearNumero(numero);
    if (!p) return;
    cifras.push({ texto: texto.trim(), unidad, valor: p.valor * mult, tolerancia: 0.5 * 10 ** -p.decimales * mult });
  };
  for (const m of t.matchAll(RE_USD)) agregar(m[0], 'usd', m[1], m[2] ? MULTIPLICADOR[m[2].toLowerCase()] ?? 1 : 1);
  for (const m of t.matchAll(RE_PCT)) agregar(m[0], 'pct', m[1]);
  for (const m of t.matchAll(RE_X)) agregar(m[0], 'x', m[1]);
  // MWh sin el "/MWh" de los precios (esos ya se leen como USD)
  for (const m of t.matchAll(RE_MWH)) if (t[m.index! - 1] !== '/' && !/USD|\$/i.test(t.slice(Math.max(0, m.index! - 6), m.index))) agregar(m[0], 'mwh', m[1]);
  // Pares "135,750 / 124,890 MWh": el primero también es MWh
  for (const m of t.matchAll(RE_PAR_MWH)) agregar(`${m[1]} MWh`, 'mwh', m[1]);
  return cifras;
}

/**
 * Compara cada cifra de la respuesta con las del tablero de la misma unidad, con la precisión con que la
 * escribió la respuesta (p. ej. "USD 28.73 M" coincide con USD 28,731,461; "8.0 %" no coincide con 8.4 %).
 * Límite: comprueba que el valor exista en el tablero, no que se refiera al mismo dato.
 */
export function verificarCifras(respuesta: string, tablero: CifraTablero[]): Verificacion {
  const delTablero = extraerCifras(tablero.map((c) => `${c.etiqueta}: ${c.valor}`).join('\n'));
  const enRespuesta = extraerCifras(respuesta);
  const noCoinciden = enRespuesta
    .filter((c) => !delTablero.some((d) => d.unidad === c.unidad && Math.abs(d.valor - c.valor) <= Math.max(c.tolerancia, d.tolerancia) + 1e-9))
    .map((c) => c.texto);
  return { revisadas: enRespuesta.length, noCoinciden: [...new Set(noCoinciden)] };
}

/** Largo a partir del cual una respuesta sin cifras ni estructura ya cuenta como análisis. */
export const LARGO_ANALISIS = 600;

/**
 * Si la respuesta merece botones de descarga: tiene cifras (USD, %, x, MWh), estructura de análisis
 * (títulos, tabla o lista de 3+ puntos) o es larga. Las respuestas informativas cortas no los muestran.
 */
export function ameritaDescarga(texto: string): boolean {
  if (extraerCifras(texto).length > 0) return true;
  const lineas = texto.split('\n');
  if (lineas.some((l) => /^\s*#{1,6}\s/.test(l) || /^\s*\|.*\|/.test(l))) return true;
  if (lineas.filter((l) => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l)).length >= 3) return true;
  return texto.trim().length >= LARGO_ANALISIS;
}

/** Anexo en Markdown con las cifras del tablero, las alertas activas y el resultado de la verificación (descargas). */
export function anexoCifras(tablero: CifraTablero[], v: Verificacion, momento: string, alertas: AlertaTablero[] = []): string {
  const celda = (s: string) => s.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  const resultado = v.revisadas === 0
    ? 'La respuesta no contiene cifras para verificar.'
    : v.noCoinciden.length === 0
      ? `Las ${v.revisadas} cifras de la respuesta coinciden con el tablero.`
      : `ATENCIÓN: ${v.noCoinciden.length} cifra(s) de la respuesta no coinciden con el tablero: ${v.noCoinciden.join('; ')}. Usar los valores de esta tabla.`;
  return [
    '', '## Cifras del tablero (AuraGrid)', '',
    `Calculadas por AuraGrid el ${momento}. ${resultado}`, '',
    '| Dato | Valor |', '|---|---|',
    ...tablero.map((c) => `| ${celda(c.etiqueta)} | ${celda(c.valor)} |`),
    ...(alertas.length
      ? ['', '## Alertas activas (motor de validaciones)', '',
          '| Severidad | Alerta | Detalle |', '|---|---|---|',
          ...alertas.map((a) => `| ${TEXTO_SEVERIDAD[a.sev]} | ${celda(a.titulo)} | ${celda(a.detalle)} |`)]
      : []),
  ].join('\n');
}
