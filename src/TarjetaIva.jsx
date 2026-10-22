import React from 'react';
import { formatearMoneda, formatearNumero } from './lib/formato';
import { NOTA_IVA, FINANCIAMIENTOS_IVA, NOTA_TASA_LINEA_IVA, textoDescuentoCostoIva } from './lib/iva';

const MES = new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric', timeZone: 'UTC' });
/** "2028-02" → "feb 2028" */
export const mesLegible = (mes) => (mes ? MES.format(new Date(`${mes}-01T00:00:00Z`)).replace('.', '') : '—');
const pp = (x) => (x == null ? 'N/D' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${formatearNumero(Math.abs(x) * 100, 2)} pp`);

const tarjeta = { backgroundColor: '#0f172a', borderRadius: '16px', padding: '24px', border: '1px solid #1e293b', color: '#ffffff', display: 'grid', gap: '16px' };
const kpi = { backgroundColor: '#1e293b', borderRadius: '12px', padding: '14px 16px', border: '1px solid #334155', display: 'grid', gap: '3px', alignContent: 'start' };
const etiqueta = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 };
const valor = { fontSize: '19px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' };
const detalle = { fontSize: '12px', color: '#94a3b8' };

/**
 * IVA de construcción (Finanzas): IVA total, pico de necesidad, compromiso máximo de equity, IVA pendiente en la COD
 * y costo financiero (valor presente al NTP, la misma medida con equity o con línea). Solo con el IVA activo.
 */
export default function TarjetaIva({ supuestos, rentabilidad, costoIva }) {
  if (!supuestos?.ivaActivo) return null;
  const problemas = rentabilidad?.problemasIva ?? [];
  const iva = rentabilidad?.iva ?? null;
  const conLinea = iva?.financiamiento === 'linea';
  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>IVA de construcción</h2>
        {iva && <span style={detalle}>Financiado con {FINANCIAMIENTOS_IVA[iva.financiamiento].replace(/^./, (c) => c.toLowerCase())} · necesidad temporal: se recupera del SAT</span>}
      </div>

      {!iva && (
        <div role="alert" style={{ border: '1px solid #f0b65a', backgroundColor: '#3a2c12', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f0b65a', display: 'grid', gap: '4px' }}>
          <strong>Faltan datos del IVA: no se calcula con valores supuestos y la TIR queda en N/D.</strong>
          {problemas.length > 0 ? problemas.map((p) => <span key={p}>• {p}</span>) : <span>Faltan los supuestos financieros del proyecto.</span>}
        </div>
      )}

      {iva && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: '12px' }}>
          <div style={kpi}><span style={etiqueta}>IVA total</span><span style={valor}>{formatearMoneda(iva.total)}</span><span style={detalle}>{`IVA de los pagos de obra y equipos; ${iva.mesSaldoCero ? `se recupera por completo en ${mesLegible(iva.mesSaldoCero)}` : 'no se recupera por completo en el horizonte'}`}</span></div>
          <div style={kpi}><span style={etiqueta}>Pico de necesidad</span><span style={valor}>{formatearMoneda(iva.pico)}</span><span style={detalle}>{mesLegible(iva.mesPico)} · saldo por recuperar al inicio del mes</span></div>
          <div style={kpi}><span style={etiqueta}>Compromiso máximo de equity por IVA</span><span style={valor}>{formatearMoneda(iva.compromisoMaximoEquity)}</span><span style={detalle}>{iva.mesCompromisoMaximo ? mesLegible(iva.mesCompromisoMaximo) : '—'} · adicional al equity de fuentes y usos</span></div>
          <div style={kpi}><span style={etiqueta}>IVA pendiente de recuperar en la COD</span><span style={valor}>{formatearMoneda(iva.ivaPendienteCod)}</span><span style={detalle}>COD: {mesLegible(iva.mesCod)}</span></div>
          <div style={kpi}>
            <span style={etiqueta}>Costo financiero del IVA (valor presente al NTP)</span>
            <span style={valor}>{costoIva?.valorPresenteNtp != null ? formatearMoneda(costoIva.valorPresenteNtp) : 'N/D'}</span>
            <span style={detalle}>
              {textoDescuentoCostoIva(costoIva)}
              {conLinea ? '' : ' · costo de oportunidad, no es un gasto'}
            </span>
            <span style={detalle}>Impacto en TIR: equity {pp(costoIva?.impactoTirEquity)} · proyecto {pp(costoIva?.impactoTirProyecto)}</span>
            {conLinea && <span style={detalle}>Intereses + comisión de la línea (nominal): {formatearMoneda(costoIva?.nominalLinea ?? 0)}</span>}
          </div>
          {conLinea && (
            <div style={kpi}>
              <span style={etiqueta}>Monto máximo de la línea (equivalente en USD)</span>
              <span style={valor}>{formatearMoneda(supuestos.ivaLineaMonto)}</span>
              <span style={detalle}>Tasa {formatearNumero(supuestos.ivaLineaTasaPct, 2)} % anual · comisión {formatearNumero(supuestos.ivaLineaComisionPct, 2)} %</span>
              <span style={detalle}>{NOTA_TASA_LINEA_IVA}</span>
            </div>
          )}
        </div>
      )}

      {iva && iva.notas.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '3px', fontSize: '11.5px', color: '#94a3b8' }}>
          {iva.notas.filter((n) => n !== NOTA_IVA).map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
      <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: 700 }}>{NOTA_IVA}</span>
    </div>
  );
}

/** Filas del IVA por mes para el cronograma de caja: solo los meses con movimiento o saldo por recuperar. */
export function filasIvaCaja(iva) {
  return iva.meses.filter((m) => m.pagado || m.recuperado || m.saldoFin > 0.5 || m.linea?.saldoFin > 0.5 || m.linea?.repago);
}

/** IVA en el cronograma de caja: IVA pagado, recuperado y saldo por recuperar (y la línea de IVA, si aplica). */
export function IvaEnCaja({ iva }) {
  if (!iva) return null;
  const filas = filasIvaCaja(iva);
  const conLinea = iva.financiamiento === 'linea';
  const celda = { padding: '6px 8px', borderTop: '1px solid #334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
  const encabezado = { ...celda, borderTop: 'none', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600 };
  const m0 = (v) => (v ? formatearMoneda(v) : '—');
  return (
    <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', display: 'grid', gap: '10px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#c4b5fd', margin: 0 }}>IVA de construcción por mes</h3>
      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Pagos al inicio del mes y devoluciones al cierre; el hueco de caja de arriba ya incluye el IVA.</span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
          <thead>
            <tr>
              <th style={{ ...encabezado, textAlign: 'left' }}>Mes</th>
              <th style={encabezado}>IVA pagado</th>
              <th style={encabezado}>IVA recuperado</th>
              <th style={encabezado}>Saldo por recuperar</th>
              {conLinea && <><th style={encabezado}>Línea: disposición</th><th style={encabezado}>Línea: repago</th><th style={encabezado}>Línea: saldo</th></>}
            </tr>
          </thead>
          <tbody>
            {filas.map((m) => (
              <tr key={m.mes}>
                <td style={{ ...celda, textAlign: 'left' }}>{mesLegible(m.mes)}</td>
                <td style={celda}>{m0(m.pagado)}</td>
                <td style={celda}>{m0(m.recuperado)}</td>
                <td style={celda}>{formatearMoneda(m.saldoFin)}</td>
                {conLinea && <><td style={celda}>{m0(m.linea?.disposicion)}</td><td style={celda}>{m0(m.linea?.repago)}</td><td style={celda}>{formatearMoneda(m.linea?.saldoFin ?? 0)}</td></>}
              </tr>
            ))}
            <tr>
              <td style={{ ...celda, textAlign: 'left', fontWeight: 700 }}>Total</td>
              <td style={{ ...celda, fontWeight: 700 }}>{formatearMoneda(iva.meses.reduce((s, m) => s + m.pagado, 0))}</td>
              <td style={{ ...celda, fontWeight: 700 }}>{formatearMoneda(iva.meses.reduce((s, m) => s + m.recuperado, 0))}</td>
              <td style={celda} />
              {conLinea && <><td style={celda} /><td style={celda} /><td style={celda} /></>}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
