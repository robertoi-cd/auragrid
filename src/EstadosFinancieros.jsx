import React from 'react';
import { formatearNumero, formatearTir, formatearMoneda } from './lib/formato';
import { NOTA_DIVIDENDOS, NOTA_LOCKUP, NOTA_CAPITAL_VARIABLE, NOTA_COMISION_ESTRUCTURACION, LIMITACIONES_ESTADOS, explicacionTir } from './lib/estadosFinancieros';

export { explicacionTir };

const tarjeta = { backgroundColor: '#1e293b', borderRadius: '12px', padding: '18px 20px', border: '1px solid #334155', display: 'grid', gap: '10px', alignContent: 'start', minWidth: 0 };
const etiqueta = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' };
const nota = { fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 };
const celda = { padding: '6px 8px', borderTop: '1px solid #334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
const primera = { ...celda, textAlign: 'left', position: 'sticky', left: 0, backgroundColor: '#1e293b', zIndex: 1, minWidth: 'min(190px, 40vw)', whiteSpace: 'normal' };
const ROJO = '#f2867b';
const VERDE = '#34d399';

/** Miles de USD; los ceros (menos de 500 USD) como "–" para que se lean las cifras. */
export const miles = (x) => (Math.abs(x) < 0.5 ? '–' : formatearNumero(x / 1000, 0));

/** ¿Alguna cifra de la fila es distinta de 0? (las filas que no aplican no se muestran). */
const conValor = (valores) => valores.some((x) => Math.abs(x) >= 0.5);

/**
 * Tabla de un estado financiero: una fila por concepto y una columna por periodo (desplazamiento horizontal dentro de
 * la tarjeta; la primera columna fija). filas: [concepto, valores, { total, opcional, color }].
 */
function TablaEstado({ titulo, seccion, periodos, filas }) {
  const visibles = filas.filter(([, valores, o = {}]) => !o.opcional || conValor(valores));
  return (
    <div style={tarjeta} data-seccion={seccion}>
      <span style={etiqueta}>{titulo}</span>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...primera, borderTop: 'none', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>Miles de USD</th>
              {periodos.map((p) => <th key={p} style={{ ...celda, borderTop: 'none', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibles.map(([concepto, valores, o = {}]) => (
              <tr key={concepto} data-fila={concepto}>
                <td style={{ ...primera, fontWeight: o.total ? 700 : 400, color: o.color ?? '#f8fafc' }}>{concepto}</td>
                {valores.map((x, i) => (
                  <td key={i} style={{ ...celda, fontWeight: o.total ? 700 : 400, color: o.color ?? (x < -0.5 ? '#cbd5e1' : '#f8fafc') }}>{miles(x)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Pestaña "Estados financieros" de Finanzas: TIR, control del balance, caja atrapada y los tres estados. */
export default function EstadosFinancieros({ estados: e, supuestos, motivo = 'Faltan supuestos de ingresos' }) {
  if (!e) {
    return (
      <div style={{ ...tarjeta, color: '#f8fafc' }} data-seccion="estados-financieros">
        <span style={etiqueta}>Estados financieros</span>
        <span style={nota}>N/D · {motivo}: los estados financieros necesitan la rentabilidad del proyecto.</span>
      </div>
    );
  }
  const n = e.resultados.length;
  const anos = e.resultados.map((r) => `Año ${r.ano}`);
  const lockup = supuestos?.dscrLockup ?? null;
  const serie = (fuente, campo, signo = 1) => fuente.map((x) => signo * x[campo]);
  const R = e.resultados, B = e.balance, F = e.flujo;
  const cuadra = e.controlMaximo < 1;
  const modo = e.devolucionCapital ? 'Con devolución de capital variable' : 'Solo dividendos';
  const tirKpi = (titulo, valor, detalle, elegida) => (
    <div style={{ ...tarjeta, gap: '4px', border: elegida ? '1px solid #38bdf8' : tarjeta.border }}>
      <span style={etiqueta}>{titulo}</span>
      <span style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc' }}>{formatearTir(valor)}</span>
      <span style={nota}>{detalle}</span>
    </div>
  );

  return (
    <div style={{ backgroundColor: '#0f172a', borderRadius: '16px', padding: 'clamp(14px, 3vw, 24px)', color: '#ffffff', border: '1px solid #1e293b', display: 'grid', gap: '18px', minWidth: 0 }} data-seccion="estados-financieros">
      <div style={{ display: 'grid', gap: '4px' }}>
        <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Estados financieros</h2>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>Caso base P50 · {n} años de operación · distribuciones: {modo.toLowerCase()} · cifras en miles de USD</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }} data-seccion="tres-tir">
        {tirKpi('TIR de equity (flujo disponible)', e.tir.flujoDisponible, 'Toda la caja después de la deuda, cada año')}
        {tirKpi('TIR de equity (dividendos y devolución de capital)', e.tir.dividendosYDevolucion, 'Dividendos permitidos y reembolso de capital variable', e.devolucionCapital)}
        {tirKpi('TIR de equity (solo dividendos)', e.tir.soloDividendos, 'Dividendos permitidos; el resto, en la liquidación', !e.devolucionCapital)}
      </div>
      <span style={{ ...nota, color: '#cbd5e1' }} data-explicacion-tir="">{explicacionTir(e, lockup)}</span>

      <div data-seccion="control-balance" style={{ ...tarjeta, gap: '4px', border: `1px solid ${cuadra ? VERDE : ROJO}` }}>
        <span style={etiqueta}>Control del balance</span>
        <span style={{ fontSize: '14px', fontWeight: 700, color: cuadra ? VERDE : ROJO }}>
          {cuadra ? `✓ Activo − pasivo − capital = 0 en los ${B.length} cierres (COD y años 1 a ${n})` : `✗ El balance no cuadra: diferencia máxima ${formatearMoneda(e.controlMaximo, 2)}`}
        </span>
        <span style={nota}>La caja final del flujo de efectivo es la caja del balance en cada año.</span>
      </div>

      <div style={tarjeta} data-seccion="caja-atrapada">
        <span style={etiqueta}>Caja atrapada al cierre de cada año</span>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12.5px', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ ...primera, borderTop: 'none', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>Miles de USD</th>
                {anos.map((p) => <th key={p} style={{ ...celda, borderTop: 'none', color: '#94a3b8', fontSize: '11px', fontWeight: 600 }}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {[['Solo dividendos', e.cajaAtrapada.soloDividendos, !e.devolucionCapital], ['Con devolución de capital', e.cajaAtrapada.conDevolucion, e.devolucionCapital]].map(([concepto, valores, elegido]) => (
                <tr key={concepto} data-fila={concepto}>
                  <td style={{ ...primera, fontWeight: elegido ? 700 : 400 }}>{concepto}{elegido ? ' (supuesto)' : ''}</td>
                  {valores.map((x, i) => <td key={i} style={{ ...celda, fontWeight: elegido ? 700 : 400, color: x >= 0.5 ? '#fbbf24' : '#94a3b8' }}>{miles(x)}</td>)}
                </tr>
              ))}
              {e.distribuciones.bloqueado.some(Boolean) && (
                <tr data-fila="Lock-up">
                  <td style={primera}>Lock-up (sin distribuciones)</td>
                  {e.distribuciones.bloqueado.map((x, i) => <td key={i} style={{ ...celda, color: ROJO }}>{x ? '●' : ''}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <span style={nota}>Caja que se queda en la sociedad porque no puede salir como dividendo{e.devolucionCapital ? ' ni como devolución de capital' : ''}. En el año {n} se liquida la sociedad y se reparte toda.</span>
      </div>

      <TablaEstado titulo="Estado de resultados" seccion="estado-resultados" periodos={anos} filas={[
        ['Ingresos', serie(R, 'ingresos')],
        ['OPEX, seguros y arrendamiento', serie(R, 'opex', -1)],
        ['EBITDA', serie(R, 'ebitda'), { total: true }],
        ['Depreciación contable', serie(R, 'depreciacion', -1)],
        ['Utilidad de operación', serie(R, 'utilidadOperacion'), { total: true }],
        ['Intereses de la deuda', serie(R, 'intereses', -1)],
        ['Amortización de la comisión de estructuración', serie(R, 'amortizacionComision', -1), { opcional: true }],
        ['Intereses y comisión de la línea de IVA', serie(R, 'costosLineaIva', -1), { opcional: true }],
        ['Utilidad antes de impuestos', serie(R, 'utilidadAntesImpuestos'), { total: true }],
        ['ISR corriente', serie(R, 'isrCorriente', -1)],
        ['ISR diferido', serie(R, 'isrDiferido', -1)],
        ['Utilidad neta', serie(R, 'utilidadNeta'), { total: true }],
      ]} />

      <TablaEstado titulo="Balance" seccion="balance" periodos={['COD', ...anos]} filas={[
        ['Activo fijo neto', serie(B, 'activoFijoNeto')],
        ['Caja', serie(B, 'caja')],
        ['DSRA', serie(B, 'dsra'), { opcional: true }],
        ['MMRA', serie(B, 'mmra'), { opcional: true }],
        ['IVA por recuperar', serie(B, 'ivaPorRecuperar'), { opcional: true }],
        ['ISR diferido activo', serie(B, 'isrDiferidoActivo'), { opcional: true }],
        ['Activo total', serie(B, 'activoTotal'), { total: true }],
        ['Deuda senior (neta de comisión)', serie(B, 'deuda')],
        ['Línea de IVA', serie(B, 'lineaIva'), { opcional: true }],
        ['ISR diferido pasivo', serie(B, 'isrDiferidoPasivo'), { opcional: true }],
        ['Pasivo total', serie(B, 'pasivoTotal'), { total: true }],
        ['Capital aportado', serie(B, 'capitalAportado')],
        ['Aportaciones para IVA', serie(B, 'aportacionesIva'), { opcional: true }],
        ['Reserva legal', serie(B, 'reservaLegal')],
        ['Utilidades acumuladas', serie(B, 'utilidadesAcumuladas')],
        ['Capital contable', serie(B, 'capitalTotal'), { total: true }],
        ['Pasivo + capital', B.map((b) => b.pasivoTotal + b.capitalTotal), { total: true }],
        ['Control (activo − pasivo − capital)', serie(B, 'control'), { color: cuadra ? VERDE : ROJO }],
      ]} />

      <TablaEstado titulo="Flujo de efectivo" seccion="flujo-efectivo" periodos={['Construcción', ...anos]} filas={[
        ['Utilidad neta', serie(F, 'utilidadNeta')],
        ['Depreciación contable', serie(F, 'depreciacion')],
        ['ISR diferido', serie(F, 'isrDiferido')],
        ['Amortización de la comisión', serie(F, 'amortizacionComision'), { opcional: true }],
        ['Flujo de operación', serie(F, 'operacion'), { total: true }],
        ['CAPEX y costos capitalizados', serie(F, 'capex')],
        ['IVA pagado', serie(F, 'ivaPagado'), { opcional: true }],
        ['IVA recuperado', serie(F, 'ivaRecuperado'), { opcional: true }],
        ['Flujo de inversión', serie(F, 'inversion'), { total: true }],
        ['Aportaciones de capital', serie(F, 'aportacionesCapital')],
        ['Disposición de la deuda', serie(F, 'disposicionDeuda')],
        ['Comisión de estructuración', serie(F, 'comisionEstructuracion'), { opcional: true }],
        ['Amortización de la deuda', serie(F, 'amortizacionDeuda')],
        ['Reservas (DSRA y MMRA)', serie(F, 'reservas'), { opcional: true }],
        ['Línea de IVA', serie(F, 'lineaIva'), { opcional: true }],
        ['Aportaciones para IVA', serie(F, 'aportacionesIva'), { opcional: true }],
        ['Dividendos', serie(F, 'dividendos')],
        ['Devolución de capital', serie(F, 'devolucionCapital')],
        ['Flujo de financiamiento', serie(F, 'financiamiento'), { total: true }],
        ['Cambio en la caja', serie(F, 'cambioCaja')],
        ['Caja final', serie(F, 'cajaFinal'), { total: true }],
      ]} />

      <div style={{ display: 'grid', gap: '6px' }}>
        <span style={nota}>{NOTA_DIVIDENDOS}{lockup != null ? ` ${NOTA_LOCKUP}` : ''}</span>
        {e.devolucionCapital && <span style={nota}>{NOTA_CAPITAL_VARIABLE}</span>}
        <span style={nota}>Pérdidas fiscales que caducan sin usarse: {formatearMoneda(e.perdidasCaducadas)} (no generan ISR diferido activo). {NOTA_COMISION_ESTRUCTURACION}</span>
        <details style={nota}>
          <summary style={{ cursor: 'pointer', color: '#e2e8f0' }}>Alcance y limitaciones del modelo</summary>
          <ul style={{ listStyle: 'disc', paddingLeft: '20px', marginTop: '6px', display: 'grid', gap: '3px' }}>
            {LIMITACIONES_ESTADOS.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </details>
      </div>
    </div>
  );
}
