import React from 'react';
import { formatearMoneda, formatearDscr, formatearTir, formatearNumero } from './lib/formato';
import { NOTA_CONVENCION_ESCENARIOS, NOTA_TIR_ESCENARIOS, NOTA_COD6, mensajeCovenantDsra, anosBajoCovenant } from './lib/escenarios';

const tarjeta = { backgroundColor: '#1e293b', borderRadius: '12px', padding: '18px 20px', border: '1px solid #334155', display: 'grid', gap: '10px', alignContent: 'start' };
const etiqueta = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' };
const nota = { fontSize: '12px', color: '#94a3b8' };
const celda = { padding: '7px 8px', borderTop: '1px solid #334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
const encabezado = { ...celda, borderTop: 'none', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'normal', verticalAlign: 'bottom' };
const ROJO = '#f2867b';

const ratio = (x) => (x == null ? 'N/D' : formatearDscr(x));
const pct = (x) => (x == null ? 'N/D' : `${formatearNumero(x * 100, 1)} %`);

/**
 * Escenarios de estrés (Finanzas): una fila por escenario con la deuda fija del caso base; en rojo el DSCR (y los años)
 * bajo el covenant. Debajo, los puntos de quiebre de ingresos y el detalle del COD +6 meses (faltante y DSRA).
 */
export default function TablaEscenarios({ escenarios, quiebres, covenant, lockup = null }) {
  if (!escenarios) return null;
  const cod6 = escenarios.find((e) => e.clave === 'cod6')?.cod6 ?? null;
  const bajo = (x) => x != null && x < covenant;
  return (
    <div style={tarjeta} data-seccion="escenarios">
      <span style={etiqueta}>Escenarios de estrés</span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr>
              {['Escenario', 'DSCR mínimo', 'DSCR promedio', 'LLCR', 'PLCR', 'TIR de equity (flujo disponible)', 'TIR de proyecto', 'Años bajo el covenant'].map((h, i) => (
                <th key={h} style={{ ...encabezado, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {escenarios.map((e) => (
              <tr key={e.clave} data-escenario={e.clave}>
                <td style={{ ...celda, textAlign: 'left', whiteSpace: 'normal', fontWeight: e.clave === 'base' ? 700 : 400 }}>{e.nombre}</td>
                <td style={{ ...celda, color: bajo(e.dscrMin) ? ROJO : '#f8fafc', fontWeight: bajo(e.dscrMin) ? 700 : 400 }}>
                  {ratio(e.dscrMin)}{e.anoDscrMin ? <span style={{ color: '#94a3b8', fontWeight: 400 }}> · año {e.anoDscrMin}</span> : null}
                </td>
                <td style={{ ...celda, color: bajo(e.dscrPromedio) ? ROJO : '#f8fafc' }}>{ratio(e.dscrPromedio)}</td>
                <td style={celda}>{ratio(e.llcr)}</td>
                <td style={celda}>{ratio(e.plcr)}</td>
                <td style={celda}>{formatearTir(e.tirEquity)}</td>
                <td style={celda}>{formatearTir(e.tirProyecto)}</td>
                <td style={{ ...celda, color: e.anosBajoCovenant.length ? ROJO : '#94a3b8' }}>{anosBajoCovenant(e.anosBajoCovenant)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span style={nota}>Covenant {formatearDscr(covenant)}. {NOTA_CONVENCION_ESCENARIOS} {NOTA_TIR_ESCENARIOS}</span>

      {quiebres && (
        <div data-seccion="quiebres" style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '13px', color: '#f8fafc' }}>
          <span>Caída de ingresos hasta el covenant ({formatearDscr(covenant)}): <strong>{pct(quiebres.hastaCovenant)}</strong></span>
          <span>Caída de ingresos hasta DSCR 1.00x: <strong>{pct(quiebres.hastaUno)}</strong></span>
          <span style={{ ...nota, flexBasis: '100%' }}>Todos los ingresos (PPA, mercado y CELs), con la deuda fija y el ISR recalculado.</span>
        </div>
      )}

      {cod6 && (
        <div data-seccion="cod6" style={{ display: 'grid', gap: '6px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
          <span style={etiqueta}>COD +6 meses: año 1 y DSRA</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: '8px', fontSize: '12.5px' }}>
            {[
              ['CFADS del año 1', formatearMoneda(cod6.cfadsAno1)],
              ['Servicio del año 1 (fijo en fechas)', formatearMoneda(cod6.servicioAno1)],
              ['DSCR del año 1', ratio(cod6.dscrAno1)],
              ['Faltante', formatearMoneda(cod6.faltante)],
              ['DSRA disponible', formatearMoneda(cod6.dsra)],
              ['Uso de la DSRA', formatearMoneda(cod6.usoDsra)],
              ['Reposición de la DSRA', cod6.usoDsra > 0 ? (cod6.anoRepuesta ? `año ${cod6.anoRepuesta}` : 'no se repone en el plazo') : 'no se usó'],
              ['Intereses adicionales (equity)', formatearMoneda(cod6.interesesAdicionales)],
              ['Penalización del EPC', cod6.penalizacionEpc > 0 ? formatearMoneda(cod6.penalizacionEpc) : 'No capturada'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'grid', gap: '1px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>{k}</span>
                <span style={{ color: '#f8fafc', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
              </div>
            ))}
          </div>
          {cod6.alcanza
            ? (cod6.dscrAno1 != null && cod6.dscrAno1 < covenant && (
              <span role="status" style={{ fontSize: '12.5px', color: '#fbbf24', fontWeight: 600 }}>{mensajeCovenantDsra(cod6.dscrAno1, covenant, lockup)}</span>
            ))
            : <span role="alert" style={{ fontSize: '12.5px', color: ROJO, fontWeight: 700 }}>Incumplimiento de pago en el año 1 con COD +6 meses: la DSRA no alcanza; quedan {formatearMoneda(cod6.faltante - cod6.usoDsra)} sin pagar.</span>}
          <span style={nota}>{NOTA_COD6}</span>
        </div>
      )}
    </div>
  );
}
