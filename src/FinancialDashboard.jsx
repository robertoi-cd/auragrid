import React, { useState } from 'react';
import { formatearMoneda, formatearCapacidad, formatearFecha, formatearPorcentaje, formatearNumero, formatearDscr, formatearTir } from './lib/formato';
import { ESTRUCTURAS, CRITERIOS_DEUDA, ESQUEMAS_DEPRECIACION, ANOS_AMORTIZACION_PERDIDAS, PRECIO_PPA_MAXIMO_BUSQUEDA, CATEGORIAS_ACTIVO, problemasDepreciacion } from './lib/rentabilidad';
import { guardarSupuestos } from './lib/supuestosApi';
import { fuenteDe, origenProduccion, ETIQUETA_ILUSTRATIVO } from './lib/fuentesSupuestos';
import {
  GRUPOS, CAMPOS_DEPRECIACION_CATEGORIAS, NOTA_DEDUCCION_INMEDIATA, NOTA_EQUIPO_GENERACION, NOTA_INTERCONEXION, REFERENCIA_CONSTRUCCIONES, NOTA_MONEDA,
} from './lib/camposSupuestos';
import { OPCIONALES } from './lib/supuestosApi';
import { problemasIva } from './lib/iva';
import CamposIva, { ETIQUETA_IVA, valorIva, ivaDelBorrador, descripcionIva, revisarIva } from './CamposIva';
import TablaCreditos from './TablaCreditos';
import TablaEscenarios from './TablaEscenarios';
import { CAMPOS_RIESGOS, NOTA_REEMPLAZO_INVERSORES, CAMPOS_ESTADOS, NOTA_DEVOLUCION_CAPITAL } from './lib/camposSupuestos';

// Riesgos de operación: opcionales (vacío = no aplica), con el rango de la base de datos
const ETIQUETA_RIESGO = Object.fromEntries(CAMPOS_RIESGOS.map(([c, e, u]) => [c, `${e} (${u})`]));
const valorRiesgo = (v) => (v === null || v === undefined || v === '' ? 'No aplica' : formatearNumero(Number(v), 2));
// Estados financieros: sí/no opcional (vacío = no)
const ETIQUETA_ESTADOS = Object.fromEntries(CAMPOS_ESTADOS.map(([c, e]) => [c, e]));
const valorSiNo = (v) => (v === true ? 'Sí' : v === false ? 'No' : 'Sin capturar (no)');

const tarjeta = { backgroundColor: '#1e293b', borderRadius: '12px', padding: '18px 20px', border: '1px solid #334155', display: 'grid', gap: '4px', alignContent: 'start' };
const etiqueta = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' };
const nota = { fontSize: '12px', color: '#94a3b8' };
const boton = { padding: '5px 10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer' };
const botonPrimario = { padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#38bdf8', color: '#0f172a', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };
const campoEstilo = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '13px' };
const celda = { padding: '7px 8px', borderTop: '1px solid #334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

// Supuestos editables, agrupados como en la tabla project_financial_assumptions (definidos en lib/camposSupuestos)
export { GRUPOS };
// La tasa y la comisión de estructuración se capturan por crédito (tabla de créditos): no se editan aquí
export const DE_CREDITOS = new Set(['tasaInteresPct', 'comisionEstructuracionPct']);
const ETIQUETAS = Object.fromEntries(GRUPOS.flatMap(([, campos]) => campos.filter(([c]) => !DE_CREDITOS.has(c)).map(([c, e, u]) => [c, `${e} (${u})`])));
/** Porcentaje de los créditos (sin créditos completos, N/D). */
const pctCredito = (x) => (x == null || !Number.isFinite(Number(x)) ? 'N/D (créditos incompletos)' : `${formatearNumero(Number(x), 2)} %`);
// Supuestos de opción (no numéricos): campo → [etiqueta, opciones]
const OPCIONES = {
  estructuraBase: ['Estructura del CAPEX registrado', ESTRUCTURAS],
  depreciacionEsquema: ['Esquema de depreciación', ESQUEMAS_DEPRECIACION]
};

const descripcionDepreciacion = (s) => (s.depreciacionPorCategorias
  ? 'por categorías: ' + CATEGORIAS_ACTIVO.filter(c => Number(s[c.reparto]) > 0)
    .map(c => `${c.nombre.toLowerCase()} ${s[c.reparto]} % del CAPEX a ${s[c.tasa] != null ? `${s[c.tasa]} % anual` : 'tasa sin capturar'}`).join('; ')
  : s.depreciacionEsquema === 'ano1'
    ? `${s.depreciacionAno1Pct} % en el año 1${s.depreciacionAno1Pct < 100 ? ` y el resto al ${s.depreciacionTasaAnualPct} % anual` : ''}`
    : `${s.depreciacionTasaAnualPct} % anual`);

const ETIQUETA_CATEGORIA = Object.fromEntries(CAMPOS_DEPRECIACION_CATEGORIAS.map(([c, e]) => [c, e]));
const valorCategoria = (c, v) => (c === 'depreciacionPorCategorias' ? (v ? 'Sí' : 'No') : v === null || v === '' || v === undefined ? 'Sin capturar' : `${formatearNumero(Number(v), 2)} %`);

// Depreciación por categorías de activo: interruptor, reparto del CAPEX (suma 100 %) y tasa de cada categoría.
// Las tasas de obra civil, subestación e interconexión las captura el usuario (sin valores propuestos).
function CamposDepreciacionCategorias({ borrador, setBorrador }) {
  const activa = Boolean(borrador.depreciacionPorCategorias);
  const suma = CATEGORIAS_ACTIVO.reduce((a, c) => a + (Number(borrador[c.reparto]) || 0), 0);
  const nota = { fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' };
  const notas = { generacion: NOTA_EQUIPO_GENERACION, obraCivil: REFERENCIA_CONSTRUCCIONES, interconexion: NOTA_INTERCONEXION };
  return (
    <fieldset style={{ display: 'grid', gap: '8px' }}>
      <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>Depreciación por categorías de activo</legend>
      <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px', color: '#e2e8f0' }}>
        <input type="checkbox" name="depreciacionPorCategorias" checked={activa}
          onChange={(e) => setBorrador({ ...borrador, depreciacionPorCategorias: e.target.checked })} />
        Depreciar por categorías (sustituye al esquema de depreciación de arriba)
      </label>
      {activa && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' }}>
            {CATEGORIAS_ACTIVO.map((c) => (
              <div key={c.clave} style={{ display: 'grid', gap: '4px', alignContent: 'start' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: '#e2e8f0' }}>{c.nombre}</span>
                <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>% del CAPEX
                  <input name={c.reparto} type="number" step="0.1" min="0" max="100" required value={borrador[c.reparto]}
                    onChange={(e) => setBorrador({ ...borrador, [c.reparto]: e.target.value })} style={campoEstilo} />
                </label>
                <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>Tasa (% anual){OPCIONALES.has(c.tasa) ? ' · la capturas tú' : ''}
                  <input name={c.tasa} type="number" step="0.1" min="0.1" max="100" required={!OPCIONALES.has(c.tasa)}
                    value={borrador[c.tasa] ?? ''} placeholder={OPCIONALES.has(c.tasa) ? 'Sin capturar' : ''}
                    onChange={(e) => setBorrador({ ...borrador, [c.tasa]: e.target.value })} style={campoEstilo} />
                </label>
                {notas[c.clave] && <span style={nota}>{notas[c.clave]}</span>}
              </div>
            ))}
          </div>
          <span style={{ fontSize: '11px', color: Math.abs(suma - 100) <= 0.01 ? '#4ade80' : '#f2867b' }}>
            Reparto: {formatearNumero(suma, 2)} % {Math.abs(suma - 100) <= 0.01 ? '(suma 100 %)' : '(debe sumar 100 %)'}
          </span>
          <span style={{ fontSize: '11px', color: '#fbbf24', fontWeight: 700 }}>{NOTA_DEDUCCION_INMEDIATA}</span>
        </>
      )}
    </fieldset>
  );
}

function Kpi({ titulo, valor, detalle, color = '#f8fafc', alerta = false }) {
  return (
    <div style={{ ...tarjeta, borderColor: alerta ? '#f2867b' : '#334155' }}>
      <span style={etiqueta}>{titulo}</span>
      <span style={{ fontSize: '24px', fontWeight: '800', color: alerta ? '#f2867b' : color, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
      {detalle && <span style={nota}>{detalle}</span>}
    </div>
  );
}

function Fila({ concepto, detalle, monto }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 0', borderTop: '1px solid #334155' }}>
      <div>
        <div style={{ fontSize: '13px', color: '#f8fafc' }}>{concepto}</div>
        {detalle && <div style={{ fontSize: '11px', color: '#94a3b8' }}>{detalle}</div>}
      </div>
      <span style={{ fontSize: '13px', fontWeight: '700', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatearMoneda(monto)}</span>
    </div>
  );
}

// Confirmación común antes de guardar cambios de supuestos
function Confirmacion({ titulo, cambios, aviso, guardando, error, onConfirmar, onVolver }) {
  return (
    <div role="alertdialog" aria-label={titulo} style={{ backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '12px 14px', display: 'grid', gap: '8px' }}>
      <strong style={{ fontSize: '13px' }}>{titulo}</strong>
      {cambios.map(([campo, antes, despues]) => (
        <span key={campo} style={{ fontSize: '12px' }}><span style={{ color: '#94a3b8' }}>{campo}:</span> {antes} → <strong>{despues}</strong></span>
      ))}
      {aviso && <span style={nota}>{aviso}</span>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" style={botonPrimario} disabled={guardando} onClick={onConfirmar}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
        <button type="button" style={boton} disabled={guardando} onClick={onVolver}>Volver</button>
      </div>
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

function useGuardado(projectId, onGuardados) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const guardar = async (cambios, alTerminar) => {
    setGuardando(true);
    setError('');
    try {
      onGuardados?.(await guardarSupuestos(projectId, cambios));
      alTerminar?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };
  return { guardando, error, setError, guardar };
}

function ComparacionEstructuras({ comparacion, supuestos, projectId, onGuardados }) {
  const [elegida, setElegida] = useState(null);
  const { guardando, error, setError, guardar } = useGuardado(projectId, onGuardados);
  const mejor = (campo, mayor) => comparacion.reduce((m, r) => (r[campo] != null && (m == null || (mayor ? r[campo] > m : r[campo] < m)) ? r[campo] : m), null);
  const mejores = { tirProyecto: mejor('tirProyecto', true), tirEquity: mejor('tirEquity', true), dscrMinP90: mejor('dscrMinP90', true), lcoe: mejor('lcoe', false) };
  const resaltar = (campo, valor) => (valor != null && valor === mejores[campo] ? { color: '#4ade80', fontWeight: 700 } : {});
  const actual = comparacion.find(r => r.estructura === supuestos.estructuraSeleccionada);
  const nueva = comparacion.find(r => r.estructura === elegida);

  return (
    <div style={tarjeta}>
      <span style={etiqueta}>Comparación de estructuras</span>
      <span style={nota}>
        El CAPEX registrado corresponde a: <strong style={{ color: '#e2e8f0' }}>{ESTRUCTURAS[supuestos.estructuraBase]}</strong>. Las otras opciones suman o restan los sobrecostos de los supuestos. En verde, la mejor de cada columna.
      </span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '6px' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'right' }}>
              <th style={{ ...celda, textAlign: 'left', borderTop: 'none' }}>Estructura</th>
              <th style={{ ...celda, borderTop: 'none' }}>kWh/kWp</th>
              <th style={{ ...celda, borderTop: 'none' }}>P50 (MWh)</th>
              <th style={{ ...celda, borderTop: 'none' }}>CAPEX</th>
              <th style={{ ...celda, borderTop: 'none' }}>Deuda (% usos)</th>
              <th style={{ ...celda, borderTop: 'none' }}>TIR proyecto</th>
              <th style={{ ...celda, borderTop: 'none' }}>TIR equity</th>
              <th style={{ ...celda, borderTop: 'none' }}>DSCR mín. P90</th>
              <th style={{ ...celda, borderTop: 'none' }}>LCOE</th>
              <th style={{ ...celda, borderTop: 'none' }}></th>
            </tr>
          </thead>
          <tbody>
            {comparacion.map(r => {
              const seleccionada = r.estructura === supuestos.estructuraSeleccionada;
              return (
                <tr key={r.estructura} style={{ textAlign: 'right', backgroundColor: seleccionada ? '#0f172a' : 'transparent' }}>
                  <td style={{ ...celda, textAlign: 'left' }}>
                    {ESTRUCTURAS[r.estructura]}
                    {seleccionada && <span style={{ marginLeft: 6, fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>EN USO</span>}
                  </td>
                  <td style={celda}>{formatearNumero(r.rendimientoKwhKwp)}</td>
                  <td style={celda}>{formatearNumero(r.p50Mwh)}</td>
                  <td style={celda}>{formatearMoneda(r.capex)}</td>
                  <td style={celda}>{formatearMoneda(r.deuda)} ({formatearPorcentaje(r.deudaPct)})</td>
                  <td style={{ ...celda, ...resaltar('tirProyecto', r.tirProyecto) }}>{formatearTir(r.tirProyecto)}</td>
                  <td style={{ ...celda, ...resaltar('tirEquity', r.tirEquity) }}>{formatearTir(r.tirEquity)}</td>
                  <td style={{ ...celda, ...resaltar('dscrMinP90', r.dscrMinP90), ...(r.dscrMinP90 != null && r.dscrMinP90 < supuestos.dscrCovenant ? { color: '#f2867b' } : {}) }}>{formatearDscr(r.dscrMinP90)}</td>
                  <td style={{ ...celda, ...resaltar('lcoe', r.lcoe) }}>{r.lcoe != null ? formatearMoneda(r.lcoe, 2) : 'N/D'}</td>
                  <td style={celda}>
                    {!seleccionada && projectId && (
                      <button type="button" style={boton} onClick={() => { setElegida(r.estructura); setError(''); }}>Usar esta</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <span style={nota}>Cada estructura con su propia deuda dimensionada. DSCR en rojo: por debajo del covenant de {formatearDscr(supuestos.dscrCovenant)}.</span>
      {nueva && actual && (
        <Confirmacion
          titulo={`¿Usar «${ESTRUCTURAS[nueva.estructura]}» en el proyecto?`}
          cambios={[
            ['Estructura', ESTRUCTURAS[actual.estructura], ESTRUCTURAS[nueva.estructura]],
            ['CAPEX', formatearMoneda(actual.capex), formatearMoneda(nueva.capex)],
            ['P50 año 1', `${formatearNumero(actual.p50Mwh)} MWh`, `${formatearNumero(nueva.p50Mwh)} MWh`]
          ]}
          aviso="La deuda se volverá a dimensionar; el equity, los pagos del cronograma, las alertas y el asistente se recalcularán con la nueva estructura."
          guardando={guardando}
          error={error}
          onConfirmar={() => guardar({ estructuraSeleccionada: nueva.estructura }, () => setElegida(null))}
          onVolver={() => setElegida(null)}
        />
      )}
    </div>
  );
}

// Resumen siempre visible de los supuestos con que se calcula todo el tablero.
// En proyectos de ejemplo, cada valor muestra su fuente o justificación.
function ResumenSupuestos({ supuestos: s, rentabilidad: r, esEjemplo, estado }) {
  const anual = (monto) => `${formatearMoneda(monto)}/año`;
  const grupos = [
    ['Ingresos', [
      ['PPA', `${formatearMoneda(s.ppaPrecio, 2)}/MWh por el ${s.ppaPorcentaje} % de la energía`, ['ppaPrecio', 'ppaPorcentaje']],
      ['Plazo del PPA', `${s.ppaPlazoAnos} años · escalamiento ${s.ppaEscalamientoPct} %/año`, ['ppaPlazoAnos', 'ppaEscalamientoPct']],
      ['Mercado (sin contrato)', `${formatearMoneda(s.mercadoPrecio, 2)}/MWh · ${s.mercadoEscalamientoPct} %/año`, ['mercadoPrecio', 'mercadoEscalamientoPct']],
      ['CELs', `${formatearMoneda(s.celPrecio, 2)}/MWh`, ['celPrecio']]
    ]],
    ['Producción', [
      ['P50 año 1', r ? `${formatearNumero(r.p50Mwh)} MWh` : 'N/D', ['rendimientoFijaKwhKwp', 'gananciaUnEjePct']],
      ['P90 año 1', r ? `${formatearNumero(r.p90Mwh)} MWh (${s.p90Pct} % del P50)` : `${s.p90Pct} % del P50`, ['p90Pct']],
      ['Degradación', `${s.degradacionPct} %/año`, ['degradacionPct']],
      ['Vida útil', `${s.vidaUtilAnos} años`, ['vidaUtilAnos']],
      ['Construcción', `${s.mesesConstruccion} meses`, ['mesesConstruccion']]
    ]],
    ['Estructuras y referencias', [
      ['Seguidor a un eje', `+${s.gananciaUnEjePct} % de producción · +${formatearMoneda(s.sobrecostoUnEjeUsdWdc, 2)}/Wdc · O&M +${formatearMoneda(s.omExtraUnEjeUsdKwdc, 2)}/kWdc·año`, ['sobrecostoUnEjeUsdWdc', 'omExtraUnEjeUsdKwdc']],
      ['Seguidor a dos ejes (sobre un eje)', `+${s.gananciaDosEjesPct} % de producción · +${formatearMoneda(s.sobrecostoDosEjesUsdWdc, 2)}/Wdc · O&M +${formatearMoneda(s.omExtraDosEjesUsdKwdc, 2)}/kWdc·año`, ['gananciaDosEjesPct', 'sobrecostoDosEjesUsdWdc', 'omExtraDosEjesUsdKwdc']],
      ['Tasa de descuento (LCOE)', `${s.tasaDescuentoPct} %`, ['tasaDescuentoPct']],
      ['TIR de equity objetivo', s.tirEquityObjetivoPct != null ? `${s.tirEquityObjetivoPct} % (para el precio mínimo de PPA)` : 'Sin capturar: captura la TIR objetivo de los socios para evaluar el retorno', ['tirEquityObjetivoPct']]
    ]],
    ['Costos e impuestos', [
      ['OPEX y arrendamiento', `${anual(s.opexAnual)} + ${anual(s.arrendamientoAnual)} · ${s.opexEscalamientoPct} %/año`, ['opexAnual', 'arrendamientoAnual', 'opexEscalamientoPct']],
      ['Seguros', `${anual(s.segurosAnual)} · ${s.opexEscalamientoPct} %/año`, ['segurosAnual']],
      ['ISR', `${s.isrPct} % · pérdidas amortizables ${ANOS_AMORTIZACION_PERDIDAS} años`, ['isrPct']],
      ['Depreciación fiscal', descripcionDepreciacion(s), s.depreciacionPorCategorias ? ['depreciacionPorCategorias'] : ['depreciacionEsquema', 'depreciacionAno1Pct', 'depreciacionTasaAnualPct']],
      // Solo con el IVA activo (apagado, el resumen queda como antes)
      ...(s.ivaActivo ? [['IVA de construcción', descripcionIva(s), ['ivaActivo']]] : [])
    ]],
    ['Deuda', [
      ['Tasa y plazo', `${pctCredito(s.tasaInteresPct)} a ${s.plazoDeudaAnos} años · amortización esculpida · tasa de los créditos`, ['tasaInteresPct', 'plazoDeudaAnos']],
      ['DSCR de dimensionamiento', `P50 ${formatearDscr(s.dscrDimensionamientoP50)} · P90 ${formatearDscr(s.dscrDimensionamientoP90)} · sin contrato ${formatearDscr(s.dscrMercado)}`, ['dscrDimensionamientoP50', 'dscrDimensionamientoP90', 'dscrMercado']],
      ['Covenant', formatearDscr(s.dscrCovenant), ['dscrCovenant']],
      ['Límites y costos', `apalancamiento máx. ${s.apalancamientoMaxPct} % · comisión ${pctCredito(s.comisionEstructuracionPct)} · DSRA ${s.dsraMeses} meses`, ['apalancamientoMaxPct', 'comisionEstructuracionPct', 'dsraMeses']]
    ]]
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
      {grupos.map(([grupo, filas]) => (
        <div key={grupo} style={{ display: 'grid', gap: '8px', alignContent: 'start' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>{grupo}</span>
          {filas.map(([k, v, campos]) => {
            // Proyecto de ejemplo: fuente de cada supuesto ilustrativo. Proyecto real: origen de la producción específica
            const fuente = esEjemplo ? fuenteDe(campos, s)
              : campos.includes('rendimientoFijaKwhKwp') ? `${formatearNumero(s.rendimientoFijaKwhKwp)} kWh/kWp con estructura fija · ${origenProduccion(s.rendimientoFijaKwhKwp, estado)}` : '';
            return (
              <div key={k} style={{ display: 'grid', gap: '1px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{k}</span>
                <span style={{ fontSize: '12px', color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                {fuente && <span style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic' }}>{fuente}</span>}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// Precio del PPA con el que la TIR de equity alcanza el objetivo (deuda redimensionada)
function PrecioMinimoPpa({ precioMinimo: p, supuestos: s }) {
  const objetivo = formatearTir(p.tirObjetivo);
  const r = p.rentabilidad;
  const diferencia = p.precio != null ? p.precio - s.ppaPrecio : null;
  return (
    <div style={{ display: 'grid', gap: '4px', padding: '10px 12px', borderRadius: '8px', backgroundColor: '#0f172a', border: '1px solid #38bdf8' }}>
      {p.precio != null ? (
        <>
          <span style={{ fontSize: '14px', color: '#f8fafc' }}>
            Para una TIR de equity de <strong>{objetivo}</strong> necesitas un PPA de al menos <strong style={{ color: '#38bdf8' }}>{formatearMoneda(p.precio, 2)}/MWh</strong>
          </span>
          <span style={nota}>
            {diferencia > 0
              ? `${formatearMoneda(diferencia, 2)}/MWh (${formatearPorcentaje(diferencia / s.ppaPrecio)}) arriba del PPA actual de ${formatearMoneda(s.ppaPrecio, 2)}/MWh.`
              : `El PPA actual de ${formatearMoneda(s.ppaPrecio, 2)}/MWh ya alcanza el objetivo.`}
            {' '}Con ese precio: deuda {formatearMoneda(r.deuda)} ({formatearPorcentaje(r.deudaPct)} de los usos; manda: {CRITERIOS_DEUDA[r.criterioDeuda]}), DSCR mínimo P90 {formatearDscr(r.dscrMinP90)}. Resto de los supuestos sin cambio.
          </span>
        </>
      ) : (
        <span style={{ fontSize: '13px', color: '#fbbf24' }}>
          La TIR de equity de {objetivo} no se alcanza ni con un PPA de {formatearMoneda(PRECIO_PPA_MAXIMO_BUSQUEDA)}/MWh con los supuestos actuales.
        </span>
      )}
    </div>
  );
}

// Precio del PPA × CAPEX: TIR de equity y % de deuda con la deuda vuelta a dimensionar en cada celda
function TablaSensibilidad({ sensibilidad: t, precioMinimo, supuestos }) {
  const encabezado = { ...celda, borderTop: 'none', color: '#94a3b8' };
  return (
    <div style={tarjeta}>
      <span style={etiqueta}>Sensibilidad: TIR de equity / % de deuda</span>
      {precioMinimo && <PrecioMinimoPpa precioMinimo={precioMinimo} supuestos={supuestos} />}
      <span style={nota}>Filas: precio del PPA (USD/MWh). Columnas: CAPEX total (USD/Wdc). La deuda se vuelve a dimensionar en cada combinación.</span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '4px' }}>
          <thead>
            <tr style={{ textAlign: 'right' }}>
              <th style={{ ...encabezado, textAlign: 'left' }}>PPA \ CAPEX</th>
              {t.capexWdc.map((c, j) => (
                <th key={c} style={{ ...encabezado, color: j === t.columnaActual ? '#38bdf8' : '#94a3b8' }}>
                  {j === t.columnaActual ? `${formatearNumero(c, 3)} (actual)` : formatearNumero(c, 2)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {t.precios.map((precio, i) => (
              <tr key={precio} style={{ textAlign: 'right' }}>
                <td style={{ ...celda, textAlign: 'left', color: i === t.filaActual ? '#38bdf8' : '#e2e8f0', fontWeight: i === t.filaActual ? 700 : 400 }}>
                  {formatearMoneda(precio)}{i === t.filaActual ? ' (actual)' : ''}
                </td>
                {t.celdas[i].map((c, j) => {
                  const actual = i === t.filaActual && j === t.columnaActual;
                  return (
                    <td key={j} style={{ ...celda, ...(actual ? { backgroundColor: '#0c4a6e', outline: '2px solid #38bdf8', fontWeight: 700 } : {}) }}>
                      {formatearTir(c.tirEquity)} / {formatearPorcentaje(c.deudaPct, 0)}{c.criterioDeuda === 'apalancamiento' ? '*' : ''}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span style={nota}>* La deuda queda en el tope de apalancamiento; en las demás celdas la limita el DSCR. Resaltada: combinación actual del proyecto.</span>
    </div>
  );
}

function EditorSupuestos({ supuestos, rentabilidad, esEjemplo, estado, projectId, onGuardados }) {
  const [abierto, setAbierto] = useState(false);
  const [borrador, setBorrador] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const { guardando, error, setError, guardar } = useGuardado(projectId, onGuardados);

  const abrir = () => { setBorrador({ ...supuestos }); setConfirmar(false); setError(''); setAbierto(true); };
  const normalizar = (c, v) => (OPCIONALES.has(c) && (v === '' || v === null || v === undefined) ? null : v);
  const cambios = borrador
    ? Object.keys(ETIQUETAS).concat(Object.keys(OPCIONES), Object.keys(ETIQUETA_CATEGORIA))
      .filter(c => String(normalizar(c, borrador[c])) !== String(supuestos[c]))
      .concat(Object.keys(ETIQUETA_IVA).filter(c => String(ivaDelBorrador(borrador)[c]) !== String(supuestos[c] ?? null)))
      .concat(Object.keys(ETIQUETA_RIESGO).filter(c => String(normalizar(c, borrador[c])) !== String(supuestos[c] ?? null)))
      .concat(Object.keys(ETIQUETA_ESTADOS).filter(c => (borrador[c] ?? null) !== (supuestos[c] ?? null)))
    : [];

  const revisar = () => {
    const invalido = Object.keys(ETIQUETAS).find(c => normalizar(c, borrador[c]) !== null && (borrador[c] === '' || !Number.isFinite(Number(borrador[c]))));
    if (invalido) { setError(`Revisa el valor de "${ETIQUETAS[invalido]}".`); return; }
    // Depreciación por categorías: reparto 0–100 que sume 100 %; tasas mayores a 0 y hasta 100 (las opcionales, vacías o válidas)
    for (const c of CATEGORIAS_ACTIVO) {
      const reparto = Number(borrador[c.reparto]);
      if (borrador[c.reparto] === '' || !Number.isFinite(reparto) || reparto < 0 || reparto > 100) { setError(`Revisa "${ETIQUETA_CATEGORIA[c.reparto]}" (0 a 100 %).`); return; }
      const tasa = normalizar(c.tasa, borrador[c.tasa]);
      if (tasa !== null && (!Number.isFinite(Number(tasa)) || Number(tasa) <= 0 || Number(tasa) > 100)) { setError(`Revisa "${ETIQUETA_CATEGORIA[c.tasa]}" (mayor a 0 y hasta 100 %).`); return; }
    }
    const suma = CATEGORIAS_ACTIVO.reduce((a, c) => a + Number(borrador[c.reparto]), 0);
    if (Math.abs(suma - 100) > 0.01) { setError(`El reparto del CAPEX por categoría suma ${formatearNumero(suma, 2)} % y debe sumar 100 %.`); return; }
    // IVA: la tasa es obligatoria (dato de ley); lo demás puede quedar vacío, pero si se captura debe estar en rango
    const problemaIva = revisarIva(borrador);
    if (problemaIva) { setError(problemaIva); return; }
    for (const [c, , , , valido, rango] of CAMPOS_RIESGOS) {
      const v = normalizar(c, borrador[c]);
      if (v !== null && !(Number.isFinite(Number(v)) && valido(Number(v)))) { setError(`Revisa "${ETIQUETA_RIESGO[c]}" (${rango}).`); return; }
    }
    if (cambios.length === 0) { setError('No hay cambios que guardar.'); return; }
    setError('');
    setConfirmar(true);
  };

  if (!abierto) {
    return (
      <div style={{ ...tarjeta, gap: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={etiqueta}>Supuestos del modelo</span>
            {esEjemplo && (
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#fbbf24', border: '1px solid #fbbf24', borderRadius: '999px', padding: '2px 8px' }}>{ETIQUETA_ILUSTRATIVO}</span>
            )}
          </span>
          {projectId && <button type="button" style={boton} onClick={abrir}>Editar supuestos</button>}
        </div>
        <ResumenSupuestos supuestos={supuestos} rentabilidad={rentabilidad} esEjemplo={esEjemplo} estado={estado} />
        <span style={nota}>Supuestos de trabajo: edítalos con los datos de tu proyecto (term sheet, oferta de PPA, estudio de recurso y asesor fiscal).</span>
      </div>
    );
  }

  const set = (c) => (e) => setBorrador({ ...borrador, [c]: e.target.value });
  return (
    <div style={{ ...tarjeta, gap: '12px' }}>
      <span style={etiqueta}>Supuestos del modelo</span>
      {confirmar ? (
        <Confirmacion
          titulo="¿Guardar estos supuestos?"
          cambios={cambios.map(c => (OPCIONES[c]
            ? [OPCIONES[c][0], OPCIONES[c][1][supuestos[c]], OPCIONES[c][1][borrador[c]]]
            : ETIQUETA_IVA[c]
              ? [ETIQUETA_IVA[c], valorIva(c, supuestos[c]), valorIva(c, ivaDelBorrador(borrador)[c])]
            : ETIQUETA_RIESGO[c]
              ? [ETIQUETA_RIESGO[c], valorRiesgo(supuestos[c]), valorRiesgo(normalizar(c, borrador[c]))]
            : ETIQUETA_ESTADOS[c]
              ? [ETIQUETA_ESTADOS[c], valorSiNo(supuestos[c] ?? null), valorSiNo(borrador[c] ?? null)]
            : ETIQUETA_CATEGORIA[c]
              ? [ETIQUETA_CATEGORIA[c], valorCategoria(c, supuestos[c]), valorCategoria(c, normalizar(c, borrador[c]))]
              : [ETIQUETAS[c], formatearNumero(Number(supuestos[c]), 2), formatearNumero(Number(borrador[c]), 2)]))}
          aviso={(() => {
            // Con una categoría sin tasa se puede guardar, pero no se calculará nada hasta capturarla
            const faltan = problemasDepreciacion({ ...supuestos, ...Object.fromEntries(Object.keys(ETIQUETA_CATEGORIA).map(c => [c, c === 'depreciacionPorCategorias' ? borrador[c] : normalizar(c, borrador[c]) === null ? null : Number(borrador[c])])) });
            const faltaIva = problemasIva({ ...supuestos, ...ivaDelBorrador(borrador) });
            if (faltaIva.length) return '⚠ IVA de construcción: ' + faltaIva.join(' ') + ' Si guardas así, la TIR de proyecto y la de equity quedarán en N/D hasta capturarlo.';
            return faltan.length
              ? `⚠ ${faltan.join(' ')} Si guardas así, la TIR, el DSCR y el LCOE quedarán en N/D hasta capturar la tasa.`
              : 'La deuda se volverá a dimensionar; la TIR, el DSCR, el LCOE, la comparación de estructuras y las alertas se recalcularán al guardar.';
          })()}
          guardando={guardando}
          error={error}
          onConfirmar={() => guardar(
            Object.fromEntries(cambios.map(c => {
              if (ETIQUETA_IVA[c]) return [c, ivaDelBorrador(borrador)[c]];
              if (OPCIONES[c] || c === 'depreciacionPorCategorias') return [c, borrador[c]];
              if (ETIQUETA_RIESGO[c]) { const v = normalizar(c, borrador[c]); return [c, v === null ? null : Number(v)]; }
              if (ETIQUETA_ESTADOS[c]) return [c, borrador[c] ?? null];
              const v = normalizar(c, borrador[c]);
              return [c, v === null ? null : Number(v)];
            })),
            () => setAbierto(false)
          )}
          onVolver={() => setConfirmar(false)}
        />
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); revisar(); }} style={{ display: 'grid', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px' }}>
            {Object.entries(OPCIONES).map(([c, [texto, opciones]]) => (
              <label key={c} style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                {texto}
                <select id={`supuesto-${c}`} name={c} value={borrador[c]} onChange={set(c)} style={campoEstilo}>
                  {Object.entries(opciones).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </label>
            ))}
          </div>
          {GRUPOS.map(([grupo, campos]) => (
            <fieldset key={grupo} style={{ display: 'grid', gap: '8px' }}>
              <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>{grupo}</legend>
              {campos.some(([c]) => DE_CREDITOS.has(c)) && (
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>La tasa y la comisión de estructuración se capturan por crédito, en "Créditos de la deuda".</span>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
                {campos.filter(([c]) => !DE_CREDITOS.has(c)).map(([c, texto, unidad, paso]) => (
                  <label key={c} style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                    {texto} ({unidad})
                    <input id={`supuesto-${c}`} name={c} type="number" step={paso} required={!OPCIONALES.has(c)} value={borrador[c] ?? ''} placeholder={c === 'tirEquityObjetivoPct' ? 'Captura la TIR objetivo de los socios' : OPCIONALES.has(c) ? 'Sin capturar' : undefined} onChange={set(c)} style={campoEstilo} />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <CamposDepreciacionCategorias borrador={borrador} setBorrador={setBorrador} />
          <CamposIva borrador={borrador} setBorrador={setBorrador} />
          <fieldset style={{ display: 'grid', gap: '8px' }}>
            <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>Riesgos de operación y estrés (opcional)</legend>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Vacío = no aplica y la cifra base no cambia. {NOTA_REEMPLAZO_INVERSORES}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
              {CAMPOS_RIESGOS.map(([c, texto, unidad, paso]) => (
                <label key={c} style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  {texto} ({unidad})
                  <input id={`supuesto-${c}`} name={c} type="number" step={paso} value={borrador[c] ?? ''} placeholder="No aplica" onChange={set(c)} style={campoEstilo} />
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset style={{ display: 'grid', gap: '8px' }}>
            <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', marginBottom: '6px' }}>Estados financieros (opcional)</legend>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{NOTA_DEVOLUCION_CAPITAL}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '8px' }}>
              {CAMPOS_ESTADOS.map(([c, texto]) => (
                <label key={c} style={{ display: 'grid', gap: '4px', fontSize: '11px', color: '#94a3b8' }}>
                  {texto}
                  <select id={`supuesto-${c}`} name={c} value={borrador[c] === true ? 'si' : borrador[c] === false ? 'no' : ''} onChange={(e) => setBorrador({ ...borrador, [c]: e.target.value === 'si' ? true : e.target.value === 'no' ? false : null })} style={campoEstilo}>
                    <option value="">Sin capturar (no)</option>
                    <option value="si">Sí</option>
                    <option value="no">No</option>
                  </select>
                </label>
              ))}
            </div>
          </fieldset>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" style={botonPrimario}>Revisar cambios</button>
            <button type="button" style={boton} onClick={() => setAbierto(false)}>Cancelar</button>
          </div>
          {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
        </form>
      )}
    </div>
  );
}

function FlujosAnuales({ rentabilidad }) {
  const [abierto, setAbierto] = useState(false);
  const m = (x) => formatearNumero(x / 1000); // miles de USD
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      <button type="button" style={{ ...boton, justifySelf: 'start' }} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        {abierto ? 'Ocultar' : 'Ver'} flujos anuales (P50, miles de USD)
      </button>
      {abierto && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'right' }}>
                {['Año', 'Energía (MWh)', 'Ingresos', 'Costos', 'EBITDA', 'Depreciación', 'Intereses', 'ISR', 'CFADS', 'Servicio deuda', 'DSCR', 'Saldo deuda', 'Flujo equity'].map(h => <th key={h} style={{ ...celda, borderTop: 'none' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {rentabilidad.anos.map(a => (
                <tr key={a.ano} style={{ textAlign: 'right' }}>
                  <td style={celda}>{a.ano}</td>
                  <td style={celda}>{formatearNumero(a.energiaMwh)}</td>
                  <td style={celda}>{m(a.ingresos)}</td>
                  <td style={celda}>{m(a.costos)}</td>
                  <td style={celda}>{m(a.ebitda)}</td>
                  <td style={celda}>{m(a.depreciacion)}</td>
                  <td style={celda}>{m(a.intereses)}</td>
                  <td style={celda}>{m(a.isrConDeuda)}</td>
                  <td style={celda}>{m(a.cfads)}</td>
                  <td style={celda}>{m(a.servicioDeuda)}</td>
                  <td style={celda}>{a.dscr != null ? formatearDscr(a.dscr) : '—'}</td>
                  <td style={celda}>{m(a.saldoDeuda)}</td>
                  <td style={celda}>{m(a.flujoEquity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Cómo se dimensionó la deuda: criterio que manda, capacidad de cada criterio y plazo frente al PPA
function DimensionamientoDeuda({ rentabilidad: r, supuestos: s }) {
  const plazoLargo = r.plazoDeudaAnos > r.ppaPlazoAnos;
  const capacidades = [
    ['dscr_p50', `DSCR ${formatearDscr(s.dscrDimensionamientoP50)} sobre CFADS P50`, r.capacidadDeuda.dscrP50],
    ['dscr_p90', `DSCR ${formatearDscr(s.dscrDimensionamientoP90)} sobre CFADS P90`, r.capacidadDeuda.dscrP90],
    ['apalancamiento', `Apalancamiento máximo (${s.apalancamientoMaxPct} % de los usos)`, r.capacidadDeuda.tope]
  ];
  return (
    <div style={tarjeta}>
      <span style={etiqueta}>Dimensionamiento de la deuda</span>
      <span style={{ fontSize: '14px', color: '#f8fafc' }}>
        Manda: <strong style={{ color: '#38bdf8' }}>{CRITERIOS_DEUDA[r.criterioDeuda]}</strong> · deuda {formatearMoneda(r.deuda)} = <strong>{formatearPorcentaje(r.deudaPct)}</strong> de los usos
      </span>
      {capacidades.map(([clave, texto, monto]) => (
        <div key={clave} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderTop: '1px solid #334155', fontSize: '12px' }}>
          <span style={{ color: clave === r.criterioDeuda ? '#38bdf8' : '#cbd5e1', fontWeight: clave === r.criterioDeuda ? 700 : 400 }}>{texto}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatearMoneda(monto)}</span>
        </div>
      ))}
      <span style={nota}>
        Deuda que admite cada criterio por separado; año a año se toma el menor servicio ({formatearMoneda(r.capacidadDeuda.anoAAno)}).
        Los ingresos sin contrato (mercado y CELs) se dimensionan siempre a {formatearDscr(s.dscrMercado)}.
      </span>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '8px 10px', borderRadius: '8px', backgroundColor: '#0f172a', border: `1px solid ${plazoLargo ? '#fbbf24' : '#334155'}`, fontSize: '12px' }}>
        <span>Plazo de la deuda <strong>{r.plazoDeudaAnos} años</strong> · PPA <strong>{r.ppaPlazoAnos} años</strong></span>
        <span style={{ color: plazoLargo ? '#fbbf24' : '#4ade80', fontWeight: 700 }}>{plazoLargo ? `${r.plazoDeudaAnos - r.ppaPlazoAnos} años sin contrato` : 'Dentro del PPA'}</span>
      </div>
    </div>
  );
}

function UsosYFuentes({ finanzas: f, supuestos: s }) {
  const filas = f.deudaDimensionada
    ? [
        ['CAPEX', 'Equipos, obra civil, interconexión y montaje', f.capex],
        ['Intereses durante la construcción', `${s.mesesConstruccion} meses; saldo de deuda mes a mes según el calendario de pagos (primero el equity)`, f.idc],
        ['Comisión de estructuración', `${pctCredito(s.comisionEstructuracionPct)} de la deuda`, f.comision],
        ...(f.noDisposicion > 0 ? [['Comisión por no disposición', `${pctCredito(s.comisionNoDisposicionPct)} anual sobre lo comprometido no dispuesto, del NTP a la COD`, f.noDisposicion]] : []),
        ['Cuenta de reserva (DSRA)', `${s.dsraMeses} meses del servicio del año 1; se libera al final del plazo`, f.dsra]
      ]
    : [['CAPEX', 'Equipos, obra civil, interconexión y montaje', f.capex]];
  return (
    <div style={tarjeta}>
      <span style={etiqueta}>Usos y fuentes</span>
      {filas.map(([c, d, m]) => <Fila key={c} concepto={c} detalle={d} monto={m} />)}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid #64748b', fontSize: '13px', fontWeight: 800 }}>
        <span>Usos totales</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatearMoneda(f.usos)}</span>
      </div>
      <Fila concepto={`Equity (${formatearPorcentaje(f.equityPct)})`} detalle="Usos − deuda" monto={f.equity} />
      <Fila concepto={`Deuda (${formatearPorcentaje(1 - f.equityPct)})`} detalle={f.deudaDimensionada ? 'Dimensionada con los supuestos' : 'Supuesto: 70 % del CAPEX, sin dimensionar'} monto={f.deuda} />
    </div>
  );
}

// ISR con la deuda dimensionada y comparación de los dos esquemas de depreciación (dato informativo)
function IsrYDepreciacion({ rentabilidad: r, comparacionDepreciacion, supuestos: s }) {
  const enUso = (esquema) => (s.depreciacionPorCategorias
    ? esquema === 'categorias'
    : s.depreciacionEsquema === esquema && (esquema === 'anual' || Number(s.depreciacionAno1Pct) === 100));
  return (
    <div style={tarjeta}>
      <span style={etiqueta}>ISR y depreciación fiscal (informativo)</span>
      <span style={{ fontSize: '13px', color: '#f8fafc' }}>
        ISR a partir del <strong>año {r.isrConDeuda.inicio ?? '—'}</strong> de operación{r.isrConDeuda.inicio == null ? ' (no se paga en la vida útil)' : ''} ·
        pérdida fiscal que caduca sin usarse: <strong style={{ color: r.isrConDeuda.perdidaCaducada > 0 ? '#fbbf24' : '#4ade80' }}>{formatearMoneda(r.isrConDeuda.perdidaCaducada)}</strong>
      </span>
      <span style={nota}>Depreciación actual: {descripcionDepreciacion(s)}. Las pérdidas fiscales se amortizan en {ANOS_AMORTIZACION_PERDIDAS} años; la parte no usada se pierde.</span>
      {comparacionDepreciacion && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '4px' }}>
            <thead>
              <tr style={{ color: '#94a3b8', textAlign: 'right' }}>
                {['Esquema', 'ISR desde', 'Pérdida que caduca', 'Deuda', 'TIR equity'].map((h, i) => <th key={h} style={{ ...celda, borderTop: 'none', textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {comparacionDepreciacion.map(({ esquema, descripcion, rentabilidad: c }) => (
                <tr key={esquema} style={{ textAlign: 'right', backgroundColor: enUso(esquema) ? '#0f172a' : 'transparent' }}>
                  <td style={{ ...celda, textAlign: 'left' }}>
                    {descripcion}
                    {enUso(esquema) && <span style={{ marginLeft: 6, fontSize: '10px', color: '#38bdf8', fontWeight: 700 }}>EN USO</span>}
                  </td>
                  <td style={celda}>{c.isrConDeuda.inicio ? `año ${c.isrConDeuda.inicio}` : '—'}</td>
                  <td style={celda}>{formatearMoneda(c.isrConDeuda.perdidaCaducada)}</td>
                  <td style={celda}>{formatearMoneda(c.deuda)}</td>
                  <td style={celda}>{formatearTir(c.tirEquity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>
        Validar con asesor fiscal.{s.depreciacionPorCategorias ? ` ${NOTA_DEDUCCION_INMEDIATA}` : ''}
      </span>
      {s.depreciacionPorCategorias && (
        <span style={{ ...nota, fontSize: '11px' }}>{NOTA_EQUIPO_GENERACION} {NOTA_INTERCONEXION}</span>
      )}
      <span style={{ ...nota, fontSize: '11px' }}>{NOTA_MONEDA}</span>
    </div>
  );
}

// "Exportar análisis financiero (Excel)": disponible para todos los roles (también lectores). onExportar registra
// quién exporta, genera el archivo con las cifras del motor y lo descarga; devuelve el nombre del archivo.
function ExportarAnalisis({ disponible, motivo, onExportar }) {
  const [exportando, setExportando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const exportar = async () => {
    setExportando(true);
    setAviso(null);
    try {
      const nombre = await onExportar();
      setAviso({ error: false, texto: `Se descargó ${nombre}. La descarga queda registrada en el proyecto.` });
    } catch (err) {
      console.error('Error al exportar el análisis financiero:', err);
      setAviso({ error: true, texto: err.message || 'No se pudo generar el archivo. Intenta de nuevo.' });
    } finally {
      setExportando(false);
    }
  };
  return (
    <div style={{ display: 'grid', gap: '4px', justifyItems: 'end' }}>
      <button type="button" style={{ ...boton, opacity: disponible ? 1 : 0.5, cursor: disponible ? 'pointer' : 'not-allowed' }}
        disabled={!disponible || exportando} onClick={exportar}
        title={disponible ? 'Portada, resumen, supuestos, fuentes y usos, deuda, flujo anual, impuestos, cronograma de caja y sensibilidad' : motivo}>
        {exportando ? 'Generando…' : '📊 Exportar análisis financiero (Excel)'}
      </button>
      {!disponible && <span style={{ fontSize: '11px', color: '#94a3b8' }}>{motivo}</span>}
      {aviso && <span role={aviso.error ? 'alert' : 'status'} style={{ fontSize: '11px', color: aviso.error ? '#f2867b' : '#94a3b8', maxWidth: '360px', textAlign: 'right' }}>{aviso.texto}</span>}
    </div>
  );
}

export default function FinancialDashboard({ finanzas, rentabilidad, comparacion, comparacionDepreciacion, sensibilidad, precioMinimo, supuestos, esEjemplo = false, estado = '', cargaSupuestos = {}, projectId, onSupuestosGuardados, puedeEditar = true, onExportarAnalisis, problemasDepreciacion = [], creditos = [], condicionesCreditos = null, problemasCreditos = [], porCredito = null, onCreditosGuardados, escenarios = null, quiebres = null }) {
  // Lector: se muestran los supuestos, sin botones para editarlos ni para elegir otra estructura
  const projectIdEditable = puedeEditar ? projectId : null;
  if (!finanzas) return null;
  const f = finanzas;
  const r = rentabilidad;
  const tramos = f.fondos.filter(m => m.fuente === 'deuda');
  const pagosEquipos = f.pagos.filter(p => p.partida === 'equipos');
  const covenant = supuestos?.dscrCovenant;
  const p50BajoCovenant = r?.dscrMinP50 != null && r.dscrMinP50 < covenant;
  const p90BajoCovenant = r?.dscrMinP90 != null && r.dscrMinP90 < covenant;
  const motivoNd = cargaSupuestos.cargando ? 'Cargando supuestos…'
    : cargaSupuestos.error ? 'Supuestos no disponibles'
    : problemasDepreciacion.length ? 'Depreciación por categorías incompleta'
    : problemasCreditos.length ? 'Créditos de la deuda incompletos'
    : 'Faltan supuestos de ingresos';

  return (
    <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)', color: '#ffffff', border: '1px solid #1e293b', display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'grid', gap: '4px' }}>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Estructura financiera y rentabilidad</h2>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {formatearCapacidad(f.mwac, f.mwdc)}{r ? ` · ${ESTRUCTURAS[r.estructura]}` : ''} · supuestos de trabajo{f.origenCronograma === 'ejemplo' ? ' · cronograma de ejemplo' : ''}
          </span>
        </div>
        {onExportarAnalisis && (
          <ExportarAnalisis disponible={Boolean(r && supuestos)} motivo={problemasDepreciacion.length ? 'Depreciación por categorías incompleta: captura la tasa que falta para exportar.' : problemasCreditos.length ? 'Créditos de la deuda incompletos: complétalos para exportar.' : `${motivoNd}: el análisis necesita los supuestos de ingresos y producción.`} onExportar={onExportarAnalisis} />
        )}
      </div>

      {/* Fuentes y usos (estructura seleccionada, deuda dimensionada) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <Kpi
          titulo={f.deudaDimensionada ? 'Usos totales' : 'CAPEX total'}
          valor={formatearMoneda(f.usos)}
          detalle={f.deudaDimensionada ? `CAPEX ${formatearMoneda(f.capex)} + costos financieros ${formatearMoneda(f.usos - f.capex)}` : 'Equipos, obra civil, interconexión y montaje'}
          color="#fbbf24"
        />
        <Kpi titulo={`Equity (${formatearPorcentaje(f.equityPct)})`} valor={formatearMoneda(f.equity)} detalle="Aportación de los socios = usos − deuda" color="#38bdf8" />
        <Kpi
          titulo={`Deuda (${formatearPorcentaje(1 - f.equityPct)})`}
          valor={formatearMoneda(f.deuda)}
          detalle={r ? `Manda: ${CRITERIOS_DEUDA[r.criterioDeuda]}` : tramos.length ? tramos.map((t, i) => `Tramo ${i + 1}: ${formatearMoneda(t.monto)}`).join(' + ') : 'Sin tramos capturados'}
          color="#34d399"
        />
      </div>

      {/* Rentabilidad calculada con los supuestos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '16px' }}>
        <Kpi titulo="TIR de proyecto" valor={r ? formatearTir(r.tirProyecto) : 'N/D'} detalle={r ? 'Calculada · sin deuda, después de ISR' : motivoNd} />
        <Kpi titulo="TIR de equity (flujo disponible)" valor={r ? formatearTir(r.tirEquity) : 'N/D'} detalle={r ? 'Calculada · con deuda, después de ISR' : motivoNd} />
        <Kpi titulo="LCOE" valor={r?.lcoe != null ? `${formatearMoneda(r.lcoe, 2)}/MWh` : 'N/D'} detalle={r ? `Calculado · descuento ${supuestos.tasaDescuentoPct} %` : motivoNd} />
        <Kpi
          titulo="DSCR mínimo P50 / P90"
          valor={r ? `${formatearDscr(r.dscrMinP50)} / ${formatearDscr(r.dscrMinP90)}` : 'N/D'}
          alerta={p50BajoCovenant}
          color={p90BajoCovenant ? '#fbbf24' : '#f8fafc'}
          detalle={r ? `Covenant ${formatearDscr(covenant)}${r.anoDscrMinP90 ? ` · peor año: año ${r.anoDscrMinP90} de operación` : ''}` : motivoNd}
        />
      </div>

      {r && supuestos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
          <DimensionamientoDeuda rentabilidad={r} supuestos={supuestos} />
          <UsosYFuentes finanzas={f} supuestos={supuestos} />
        </div>
      )}
      {r && supuestos && escenarios && (
        <TablaEscenarios escenarios={escenarios} quiebres={quiebres} covenant={supuestos.dscrCovenant} lockup={supuestos.dscrLockup ?? null} />
      )}
      {supuestos && (
        <TablaCreditos
          creditos={creditos} condiciones={condicionesCreditos} problemas={problemasCreditos} porCredito={porCredito}
          desembolsos={tramos} deudaTotal={r?.deuda ?? null} idcTotal={r?.usos.idc ?? null}
          projectId={projectId} puedeEditar={puedeEditar} onGuardados={onCreditosGuardados}
        />
      )}
      {supuestos && <EditorSupuestos supuestos={supuestos} rentabilidad={r} esEjemplo={esEjemplo} estado={estado} projectId={projectIdEditable} onGuardados={onSupuestosGuardados} />}
      {sensibilidad && <TablaSensibilidad sensibilidad={sensibilidad} precioMinimo={precioMinimo} supuestos={supuestos} />}
      {r && supuestos && <IsrYDepreciacion rentabilidad={r} comparacionDepreciacion={comparacionDepreciacion} supuestos={supuestos} />}
      {comparacion && supuestos && <ComparacionEstructuras comparacion={comparacion} supuestos={supuestos} projectId={projectIdEditable} onGuardados={onSupuestosGuardados} />}
      {r && <FlujosAnuales rentabilidad={r} />}
      {r && (
        <span style={{ ...nota, fontSize: '11px' }}>
          Modelo anual simplificado: CAPEX y aportaciones repartidos en los años de construcción; deuda esculpida desde el primer año de operación;
          intereses durante la construcción sobre el saldo de deuda dispuesto mes a mes (se usa primero el equity); ISR con pérdidas amortizables {ANOS_AMORTIZACION_PERDIDAS} años (LISR art. 57) y depreciación según supuestos (validar con asesor fiscal). {NOTA_MONEDA}
        </span>
      )}

      {/* Detalle de deuda y contrato de equipos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px', alignItems: 'start' }}>
        <div style={tarjeta}>
          <span style={etiqueta}>Contrato de equipos mayores{f.contratoEquipos ? ` · ${formatearMoneda(f.contratoEquipos)}` : ''}</span>
          {pagosEquipos.length === 0 && <span style={nota}>Sin contrato ni calendario de pagos capturados.</span>}
          {pagosEquipos.map(p => (
            <Fila key={p.concepto} concepto={p.concepto.replace('Equipos mayores · ', '')} detalle={formatearFecha(p.fecha)} monto={p.monto} />
          ))}
        </div>
      </div>
    </div>
  );
}
