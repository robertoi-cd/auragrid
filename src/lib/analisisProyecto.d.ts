import type { CostoIva } from './iva';
import type { Credito, CondicionesPonderadas, ResultadoCredito } from './creditos';
import type { MetricasEscenario, PuntosQuiebre } from './escenarios';
import type { EstadosFinancieros } from './estadosFinancieros';
// Tipos de analisisProyecto.js (cadena de cálculo del tablero y de las tarjetas de Inicio), para tsc y las pruebas.
import type { Alerta, Frente, Garantia, AvancePlan } from './validaciones';
import type { Supuestos } from './rentabilidad';

export interface EntradaAnalisis {
  project: any;
  frentes: Frente[];
  garantias: Garantia[];
  movimientos: any[];
  supuestos: Supuestos | null;
  cargaGarantias?: { cargando: boolean; error: string };
  cargaSupuestos?: { cargando: boolean; error: string };
  documentos?: Record<string, number>;
  evidenciaGarantias?: { activas: number; conDocumento: number };
  calcularPrecioMinimo?: boolean;
  /** Créditos de la deuda (project_loans); sin el parámetro, los supuestos tal cual. */
  creditos?: Credito[];
}

export interface AnalisisProyecto {
  margenGarantias: number;
  fechasProyecto: any;
  avisoGarantias: string;
  garantiasDisponibles: boolean;
  frentesEfectivos: Frente[];
  avance: AvancePlan | null;
  base: any;
  calendario: any;
  problemasDep: string[];
  supuestosCalculables: Supuestos | null;
  comparacion: any[] | null;
  rentabilidad: any;
  precioMinimo: any;
  /** Calendario de IVA fechado (null con el IVA apagado). */
  calIva: any;
  /** Costo financiero del IVA (null sin IVA calculado). */
  costoIva: CostoIva | null;
  /** Tasa y comisiones ponderadas de los créditos (null sin créditos o con problemas). */
  condicionesCreditos: CondicionesPonderadas | null;
  /** Lo que impide calcular con los créditos (vacío si están completos). */
  problemasCreditos: string[];
  /** Resultados por crédito (null sin créditos válidos o sin rentabilidad). */
  porCredito: ResultadoCredito[] | null;
  /** Escenarios de estrés con la deuda fija del caso base (null sin rentabilidad). */
  escenarios: MetricasEscenario[] | null;
  /** Caída de ingresos hasta el covenant y hasta 1.0x (null sin rentabilidad). */
  quiebres: PuntosQuiebre | null;
  /** Estado de resultados, balance y flujo de efectivo del caso base, con dividendos y las tres TIR (null sin rentabilidad). */
  estados: EstadosFinancieros | null;
  /** Supuestos con la tasa y las comisiones ponderadas de los créditos (sin créditos válidos, los supuestos tal cual). */
  supuestosConCreditos: Supuestos | null;
  finanzas: any;
  resumenRentabilidad: any;
  alertas: Alerta[];
}

export function analizarProyecto(e: EntradaAnalisis): AnalisisProyecto;
