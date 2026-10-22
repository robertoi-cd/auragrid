// Referencia del Excel antes de los estados financieros: huella de cada hoja fila por fila para
// comprobar que las hojas existentes quedan idénticas celda por celda (salvo las etiquetas renombradas y lo que se
// agrega al final de una hoja). La genera scripts del scratchpad con el código anterior; aquí solo se calcula.
import crypto from 'node:crypto';
import type { Worksheet } from 'exceljs';
import { analizarProyecto } from '../src/lib/analisisProyecto';
import { calcularSensibilidad, type Supuestos } from '../src/lib/rentabilidad';
import { SUPUESTOS_ILUSTRATIVOS } from '../src/lib/fuentesSupuestos';
import { FRENTES_EJEMPLO } from '../src/lib/datosProyecto';
import type { DatosAnalisis } from '../src/lib/exportarFinanzas';
import type { Credito } from '../src/lib/creditos';

export const ALPHA = { id: 'alpha-i-50mw', name: 'Alpha I', capacityMw: 50, capex: 46_500_000, state: 'Sonora', esEjemplo: true, fechaRtb: '2027-03-31' };
const credito = (orden: number, banco: string | null, p: number, r: number, c: number): Credito =>
  ({ orden, banco, participacionPct: p, tasaAnualPct: r, comisionEstructuracionPct: c, comisionNoDisposicionPct: null, estado: 'aprobado' });
export const MIGRADO = credito(1, null, 100, 7, 1.5);
const IVA_LINEA: Partial<Supuestos> = { ivaActivo: true, ivaTasaPct: 16, ivaCapexSujetoPct: 80, ivaRecuperacionMeses: 14, ivaOrigenEquipo: 'local', ivaFinanciamiento: 'linea', ivaLineaMonto: 3_000_000, ivaLineaTasaPct: 12, ivaLineaComisionPct: 1 };

/** Casos de referencia: [nombre, supuestos adicionales, créditos]. */
export const CASOS_EXCEL: [string, Partial<Supuestos>, Credito[]][] = [
  ['alpha', {}, [MIGRADO]],
  ['iva-linea', IVA_LINEA, [MIGRADO]],
  ['dos-bancos', {}, [credito(1, 'Banco A', 60, 7, 1.5), credito(2, 'Banco B', 40, 8.5, 1)]],
  ['riesgos', { dscrLockup: 1.412, reemplazoInversoresAno: 12, reemplazoInversoresUsdKwac: 40, mmraAnosFondeo: 4 }, [MIGRADO]],
];

export const analizarCaso = (extra: Partial<Supuestos>, creditos: Credito[]) =>
  analizarProyecto({ project: ALPHA, frentes: FRENTES_EJEMPLO, garantias: [], movimientos: [], supuestos: { ...(SUPUESTOS_ILUSTRATIVOS as Supuestos), ...extra }, creditos, calcularPrecioMinimo: false });

/** Datos del Excel como los arma App.jsx (con sensibilidad, escenarios, créditos y estados financieros). */
export function datosExcel(a: ReturnType<typeof analizarCaso>, creditos: Credito[]): DatosAnalisis {
  const f = a.finanzas;
  const s = a.supuestosCalculables!;
  return {
    proyecto: { nombre: ALPHA.name, estado: ALPHA.state, capacidad: '50 MWac / 62.5 MWdc', esEjemplo: true, fechaRtb: ALPHA.fechaRtb },
    supuestos: a.supuestosConCreditos!, rentabilidad: a.rentabilidad, cronograma: { pagos: f.pagos, fondos: f.fondos, origen: f.origenCronograma },
    sensibilidad: calcularSensibilidad(s, s.estructuraSeleccionada, a.base.capex, a.base.mwdc, a.calendario, undefined, undefined, a.calIva),
    costoIva: a.costoIva,
    fuentesUsos: { capex: f.capex, idc: f.idc, comision: f.comision, dsra: f.dsra, usos: f.usos, deuda: f.deuda, equity: f.equity, noDisposicion: f.noDisposicion },
    creditos: { lista: creditos, porCredito: a.porCredito, condiciones: a.condicionesCreditos },
    escenarios: a.escenarios, quiebres: a.quiebres,
    ...({ estados: (a as { estados?: unknown }).estados } as object),
    generado: new Date('2026-10-20T16:45:00Z'), version: '1.0.0 (prueba)', exportadoPor: 'banco@prueba.example',
  } as DatosAnalisis;
}

const hash = (x: unknown) => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);

export interface HuellaHoja {
  filas: Record<number, string>;
  ultimaFila: number;
  cols: (number | null)[];
  merges: string[];
  condicional: string[];
  resto: string;
}

/**
 * Huella de una hoja: cada fila (alto y, de cada celda, valor o fórmula, formato de número, fuente, relleno, borde,
 * alineación, protección y combinada) con su hash; anchos de columna; combinadas; formato condicional; y vistas,
 * protección, configuración de página y propiedades. `renombres`: etiqueta nueva → anterior (para comparar).
 */
export function huellaHoja(ws: Worksheet, renombres: Record<string, string> = {}): HuellaHoja {
  const filas: Record<number, string> = {};
  let ultimaFila = 0;
  ws.eachRow({ includeEmpty: true }, (row, r) => {
    const celdas: unknown[] = [`alto=${row.height ?? ''}`];
    row.eachCell({ includeEmpty: true }, (c) => {
      const valor = typeof c.value === 'string' && renombres[c.value] ? renombres[c.value] : c.value;
      // Columna (no la dirección) y la combinada relativa a la fila: una fila desplazada se compara con su original
      celdas.push([c.col, valor, c.numFmt, c.font, c.fill, c.border, c.alignment, c.protection, c.isMerged ? [c.master.col, Number(c.master.row) - r] : null]);
    });
    filas[r] = hash(celdas);
    ultimaFila = r;
  });
  const extra = ws as unknown as { conditionalFormattings: unknown[]; sheetProtection: unknown };
  return {
    filas, ultimaFila,
    cols: Array.from({ length: ws.columnCount }, (_, i) => ws.getColumn(i + 1).width ?? null),
    merges: [...((ws.model as { merges?: string[] }).merges ?? [])].sort(),
    condicional: (extra.conditionalFormattings ?? []).map((x) => JSON.stringify(x)).sort(),
    resto: hash({ views: ws.views, proteccion: extra.sheetProtection, pageSetup: ws.pageSetup, props: ws.properties }),
  };
}
