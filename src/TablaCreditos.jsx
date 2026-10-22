import React, { useState } from 'react';
import { formatearMoneda, formatearNumero, formatearFecha } from './lib/formato';
import { ESTADOS_CREDITO, nombreCredito, problemasCreditos } from './lib/creditos';
import { guardarCreditos } from './lib/creditosApi';

const tarjeta = { backgroundColor: '#1e293b', borderRadius: '12px', padding: '18px 20px', border: '1px solid #334155', display: 'grid', gap: '10px', alignContent: 'start' };
const etiqueta = { fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600' };
const nota = { fontSize: '12px', color: '#94a3b8' };
const boton = { padding: '5px 10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer' };
const botonPrimario = { padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#38bdf8', color: '#0f172a', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };
const campoEstilo = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '13px' };
const celda = { padding: '7px 8px', borderTop: '1px solid #334155', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' };
const encabezado = { ...celda, borderTop: 'none', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'normal', verticalAlign: 'bottom' };

const vacio = (v) => v === null || v === undefined || String(v).trim() === '';
const pct = (v, dec = 2) => (vacio(v) ? 'Sin capturar' : `${formatearNumero(Number(v), dec)} %`);
const SIN_CAPTURAR = <span style={{ color: '#fbbf24' }}>Sin capturar</span>;
export const SIN_CREDITOS = 'Agrega un crédito para calcular la deuda y la TIR (puede ser indicativo).';

// Campos numéricos de un crédito, con su rango (los mismos checks que la base de datos)
export const CAMPOS_CREDITO = [
  ['participacionPct', 'Participación', '%', (n) => n > 0 && n <= 100, 'mayor a 0 y hasta 100 %', true],
  ['tasaAnualPct', 'Tasa anual total', '%', (n) => n >= 0 && n <= 100, '0 a 100 %', true],
  ['comisionEstructuracionPct', 'Comisión de estructuración', '%', (n) => n >= 0 && n <= 100, '0 a 100 %', true],
  ['comisionNoDisposicionPct', 'Comisión por no disposición', '% anual', (n) => n >= 0 && n <= 100, '0 a 100 %', false],
];

/**
 * Problema del borrador antes de guardar, o '' si se puede guardar. Banco y estado son obligatorios en los créditos
 * nuevos y no se pueden borrar si ya estaban capturados (el crédito migrado sin banco se puede guardar sin él).
 * Las condiciones fuera de rango no se guardan; vacías sí (con aviso: la TIR queda en N/D).
 */
export function revisarCreditos(borrador, anteriores) {
  if (borrador.length === 0) return 'Debe haber al menos un crédito (la deuda senior necesita un prestamista).';
  for (const [i, c] of borrador.entries()) {
    const antes = anteriores.find((a) => a.id && a.id === c.id);
    const n = nombreCredito(c, i);
    if (vacio(c.banco) && (!antes || !vacio(antes.banco))) return `${n}: captura el banco.`;
    if (vacio(c.estado) && (!antes || !vacio(antes.estado))) return `${n}: elige el estado.`;
    for (const [campo, texto, , valido, rango] of CAMPOS_CREDITO) {
      if (!vacio(c[campo]) && !(Number.isFinite(Number(c[campo])) && valido(Number(c[campo])))) return `${n}: revisa "${texto}" (${rango}).`;
    }
  }
  return '';
}

/** Borrador (valores de los campos) → créditos del modelo: vacío = null, números como número. */
export const creditosDelBorrador = (borrador) => borrador.map((c) => ({
  ...c,
  banco: vacio(c.banco) ? null : String(c.banco).trim(),
  estado: vacio(c.estado) ? null : c.estado,
  ...Object.fromEntries(CAMPOS_CREDITO.map(([campo]) => [campo, vacio(c[campo]) ? null : Number(c[campo])])),
}));

/** Cambios que se van a guardar (altas, bajas y campos modificados), en texto. */
export function resumenCambiosCreditos(nuevos, anteriores) {
  const lineas = [];
  for (const [i, a] of anteriores.entries()) if (!nuevos.some((c) => c.id === a.id)) lineas.push(`Baja: ${nombreCredito(a, i)}`);
  nuevos.forEach((c, i) => {
    const antes = anteriores.find((a) => a.id && a.id === c.id);
    if (!antes) { lineas.push(`Alta: ${nombreCredito(c, i)}`); return; }
    if ((antes.banco ?? null) !== (c.banco ?? null)) lineas.push(`${nombreCredito(antes, i)}: banco ${antes.banco ?? 'sin capturar'} → ${c.banco ?? 'sin capturar'}`);
    if ((antes.estado ?? null) !== (c.estado ?? null)) lineas.push(`${nombreCredito(c, i)}: estado ${antes.estado ? ESTADOS_CREDITO[antes.estado] : 'sin capturar'} → ${c.estado ? ESTADOS_CREDITO[c.estado] : 'sin capturar'}`);
    for (const [campo, texto] of CAMPOS_CREDITO) {
      if ((antes[campo] ?? null) !== (c[campo] ?? null)) lineas.push(`${nombreCredito(c, i)}: ${texto.toLowerCase()} ${pct(antes[campo])} → ${pct(c[campo])}`);
    }
  });
  return lineas;
}

/**
 * Créditos de la deuda (Finanzas): quién presta y con qué condiciones, la tasa ponderada, los resultados por banco y
 * los desembolsos repartidos entre créditos. Dueño y editor editan la tabla; el lector solo la ve.
 */
export default function TablaCreditos({ creditos, condiciones, problemas = [], porCredito, desembolsos = [], deudaTotal, idcTotal, projectId, puedeEditar, onGuardados }) {
  const [borrador, setBorrador] = useState(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [verAnos, setVerAnos] = useState(false);

  const editar = () => {
    setBorrador(creditos.map((c) => ({ ...c, ...Object.fromEntries(CAMPOS_CREDITO.map(([campo]) => [campo, c[campo] ?? ''])), banco: c.banco ?? '', estado: c.estado ?? '' })));
    setConfirmar(false); setError('');
  };
  // Crédito indicativo: banco "Por definir" y estado pendiente; participación, tasa y comisión las captura el usuario
  const agregarIndicativo = () => {
    setBorrador([{ banco: 'Por definir', estado: 'pendiente', ...Object.fromEntries(CAMPOS_CREDITO.map(([campo]) => [campo, ''])) }]);
    setConfirmar(false); setError('');
  };
  const set = (i, campo) => (e) => setBorrador(borrador.map((c, j) => (j === i ? { ...c, [campo]: e.target.value } : c)));
  const nuevos = borrador ? creditosDelBorrador(borrador) : [];
  const revisar = (e) => {
    e.preventDefault();
    const problema = revisarCreditos(nuevos, creditos);
    if (problema) { setError(problema); return; }
    if (resumenCambiosCreditos(nuevos, creditos).length === 0) { setError('No hay cambios que guardar.'); return; }
    setError(''); setConfirmar(true);
  };
  const guardar = async () => {
    setGuardando(true); setError('');
    try {
      const guardados = await guardarCreditos(projectId, nuevos, creditos);
      onGuardados?.(guardados);
      setBorrador(null); setConfirmar(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const sumaParticipaciones = creditos.reduce((s, c) => s + (Number(c.participacionPct) || 0), 0);
  const varios = creditos.length > 1;

  return (
    <div style={tarjeta} data-seccion="creditos">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={etiqueta}>Créditos de la deuda</span>
        {puedeEditar && projectId && !borrador && creditos.length > 0 && <button type="button" style={boton} onClick={editar}>Editar créditos</button>}
      </div>

      {!borrador && (
        <>
          {creditos.length === 0 ? (
            <div style={{ display: 'grid', gap: '8px', justifyItems: 'start' }}>
              <span style={{ fontSize: '13px', color: '#f8fafc' }}>{SIN_CREDITOS}</span>
              {puedeEditar && projectId && <button type="button" style={botonPrimario} onClick={agregarIndicativo}>Agregar crédito indicativo</button>}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th style={{ ...encabezado, textAlign: 'left' }}>Banco</th>
                    {CAMPOS_CREDITO.map(([c, texto]) => <th key={c} style={encabezado}>{texto}</th>)}
                    <th style={{ ...encabezado, textAlign: 'left' }}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {creditos.map((c, i) => (
                    <tr key={c.id ?? i}>
                      <td style={{ ...celda, textAlign: 'left', fontWeight: 600 }}>{c.banco ?? SIN_CAPTURAR}</td>
                      {CAMPOS_CREDITO.map(([campo, , , , , obligatorio]) => (
                        <td key={campo} style={celda}>{vacio(c[campo]) ? (obligatorio ? SIN_CAPTURAR : <span style={{ color: '#94a3b8' }}>No se cobra</span>) : `${formatearNumero(c[campo], 2)} %`}</td>
                      ))}
                      <td style={{ ...celda, textAlign: 'left', color: c.estado === 'aprobado' ? '#4ade80' : '#fbbf24' }}>{c.estado ? ESTADOS_CREDITO[c.estado] : 'Sin capturar'}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ ...celda, textAlign: 'left', fontWeight: 700 }}>{varios ? 'Total / ponderado' : 'Total'}</td>
                    <td style={{ ...celda, fontWeight: 700, color: Math.abs(sumaParticipaciones - 100) > 1e-9 ? '#f2867b' : '#f8fafc' }}>{formatearNumero(sumaParticipaciones, 2)} %</td>
                    <td style={{ ...celda, fontWeight: 700 }}>{condiciones ? `${formatearNumero(condiciones.tasaPct, 2)} %` : 'N/D'}</td>
                    <td style={{ ...celda, fontWeight: 700 }}>{condiciones ? `${formatearNumero(condiciones.comisionEstructuracionPct, 2)} %` : 'N/D'}</td>
                    <td style={{ ...celda, fontWeight: 700 }}>{condiciones ? `${formatearNumero(condiciones.comisionNoDisposicionPct, 2)} %` : 'N/D'}</td>
                    <td style={celda} />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          {condiciones && varios && (
            <span style={{ fontSize: '13px', color: '#f8fafc' }}>
              Tasa promedio ponderada: <strong style={{ color: '#38bdf8' }}>{formatearNumero(condiciones.tasaPct, 2)} %</strong> · comisión ponderada {formatearNumero(condiciones.comisionEstructuracionPct, 2)} %
            </span>
          )}
          {problemas.length > 0 && (
            <div role="alert" style={{ border: '1px solid #f0b65a', backgroundColor: '#3a2c12', borderRadius: '8px', padding: '10px 14px', fontSize: '12.5px', color: '#f0b65a', display: 'grid', gap: '3px' }}>
              <strong>Créditos incompletos: no se calculan la deuda, la TIR ni el DSCR (N/D).</strong>
              {problemas.map((p) => <span key={p}>• {p}</span>)}
            </div>
          )}
          <span style={nota}>v1: mismo plazo y perfil esculpido para todos; cada crédito recibe su participación de cada desembolso y amortiza su participación del principal. DSCR, covenant, DSRA, intereses de construcción e ISR se calculan sobre los totales.</span>
        </>
      )}

      {borrador && (
        confirmar ? (
          <div style={{ display: 'grid', gap: '8px' }}>
            <strong style={{ fontSize: '13px' }}>¿Guardar estos cambios en los créditos?</strong>
            <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12.5px', display: 'grid', gap: '3px' }}>
              {resumenCambiosCreditos(nuevos, creditos).map((l) => <li key={l}>{l}</li>)}
            </ul>
            <span style={{ fontSize: '12px', color: problemasCreditos(nuevos).length ? '#fbbf24' : '#94a3b8' }}>
              {problemasCreditos(nuevos).length
                ? `⚠ ${problemasCreditos(nuevos).join(' ')} Si guardas así, la deuda, la TIR y el DSCR quedarán en N/D hasta corregirlo.`
                : 'La deuda se volverá a dimensionar con la tasa y las comisiones ponderadas; la TIR, el DSCR, los desembolsos y las alertas se recalcularán al guardar.'}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar'}</button>
              <button type="button" style={boton} disabled={guardando} onClick={() => setConfirmar(false)}>Volver</button>
            </div>
            {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
          </div>
        ) : (
          <form onSubmit={revisar} style={{ display: 'grid', gap: '12px' }}>
            {borrador.map((c, i) => (
              <fieldset key={c.id ?? `nuevo-${i}`} style={{ display: 'grid', gap: '8px', border: '1px solid #334155', borderRadius: '8px', padding: '10px 12px' }}>
                <legend style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>{c.id ? `Crédito ${i + 1}` : 'Crédito nuevo'}</legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                  <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>Banco
                    <input name={`banco-${i}`} value={c.banco} placeholder="Sin capturar" onChange={set(i, 'banco')} style={campoEstilo} />
                  </label>
                  {CAMPOS_CREDITO.map(([campo, texto, unidad, , , obligatorio]) => (
                    <label key={campo} style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>{texto} ({unidad})
                      <input name={`${campo}-${i}`} type="number" step="0.01" value={c[campo]} placeholder={obligatorio ? 'Sin capturar' : 'No se cobra'} onChange={set(i, campo)} style={campoEstilo} />
                    </label>
                  ))}
                  <label style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>Estado
                    <select name={`estado-${i}`} value={c.estado} onChange={set(i, 'estado')} style={campoEstilo}>
                      <option value="">Elige…</option>
                      {Object.entries(ESTADOS_CREDITO).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                    </select>
                  </label>
                </div>
                <button type="button" style={{ ...boton, justifySelf: 'start', color: '#f2867b', borderColor: '#7f1d1d' }} onClick={() => setBorrador(borrador.filter((_, j) => j !== i))}>Quitar crédito</button>
              </fieldset>
            ))}
            <button type="button" style={{ ...boton, justifySelf: 'start' }}
              onClick={() => setBorrador([...borrador, { banco: '', estado: '', ...Object.fromEntries(CAMPOS_CREDITO.map(([campo]) => [campo, ''])) }])}>
              + Agregar crédito
            </button>
            <span style={{ fontSize: '12px', color: Math.abs(nuevos.reduce((s, x) => s + (x.participacionPct ?? 0), 0) - 100) > 1e-9 ? '#fbbf24' : '#94a3b8' }}>
              Las participaciones suman {formatearNumero(nuevos.reduce((s, x) => s + (x.participacionPct ?? 0), 0), 2)} % (deben sumar 100 %).
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="submit" style={botonPrimario}>Revisar cambios</button>
              <button type="button" style={boton} onClick={() => setBorrador(null)}>Cancelar</button>
            </div>
            {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
          </form>
        )
      )}

      {/* Resultados por banco (solo con créditos completos y deuda calculada) */}
      {!borrador && porCredito && (
        <div style={{ display: 'grid', gap: '8px' }} data-seccion="resultados-por-banco">
          <span style={etiqueta}>Resultados por banco</span>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr>
                  {['Banco', 'Monto', 'Comisión de estructuración', 'Comisión por no disposición', 'Intereses de construcción', 'Intereses (plazo de la deuda)', 'Amortización'].map((h, i) => <th key={h} style={{ ...encabezado, textAlign: i === 0 ? 'left' : 'right' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {porCredito.map((r) => (
                  <tr key={r.nombre}>
                    <td style={{ ...celda, textAlign: 'left', fontWeight: 600 }}>{r.nombre} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({formatearNumero(r.peso * 100, 2)} %)</span></td>
                    <td style={celda}>{formatearMoneda(r.monto)}</td>
                    <td style={celda}>{formatearMoneda(r.comisionEstructuracion)}</td>
                    <td style={celda}>{formatearMoneda(r.comisionNoDisposicion)}</td>
                    <td style={celda}>{formatearMoneda(r.idc)}</td>
                    <td style={celda}>{formatearMoneda(r.anos.reduce((s, a) => s + a.intereses, 0))}</td>
                    <td style={celda}>{formatearMoneda(r.anos.reduce((s, a) => s + a.amortizacion, 0))}</td>
                  </tr>
                ))}
                {varios && (
                  <tr>
                    <td style={{ ...celda, textAlign: 'left', fontWeight: 700 }}>Total</td>
                    {[(r) => r.monto, (r) => r.comisionEstructuracion, (r) => r.comisionNoDisposicion, (r) => r.idc,
                      (r) => r.anos.reduce((s, a) => s + a.intereses, 0), (r) => r.anos.reduce((s, a) => s + a.amortizacion, 0)].map((f, j) => (
                      <td key={j} style={{ ...celda, fontWeight: 700 }}>{formatearMoneda(porCredito.reduce((s, r) => s + f(r), 0))}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <span style={nota}>
            Deuda total {formatearMoneda(deudaTotal)} · intereses de construcción {formatearMoneda(idcTotal)}. Saldo y amortización en proporción a la participación;
            intereses en proporción a participación × tasa; comisiones en proporción a participación × comisión.
          </span>
          <button type="button" style={{ ...boton, justifySelf: 'start' }} aria-expanded={verAnos} onClick={() => setVerAnos(!verAnos)}>
            {verAnos ? 'Ocultar' : 'Ver'} saldo, intereses y amortización por año
          </button>
          {verAnos && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th style={{ ...encabezado, textAlign: 'left' }}>Año</th>
                    {porCredito.map((r) => <th key={r.nombre} colSpan={3} style={{ ...encabezado, textAlign: 'center' }}>{r.nombre}</th>)}
                  </tr>
                  <tr>
                    <th style={encabezado} />
                    {porCredito.flatMap((r) => ['Saldo inicial', 'Intereses', 'Amortización'].map((h) => <th key={r.nombre + h} style={encabezado}>{h}</th>))}
                  </tr>
                </thead>
                <tbody>
                  {porCredito[0].anos.map((a, i) => (
                    <tr key={a.ano}>
                      <td style={{ ...celda, textAlign: 'left' }}>{a.ano}</td>
                      {porCredito.flatMap((r) => [r.anos[i].saldoInicial, r.anos[i].intereses, r.anos[i].amortizacion].map((v, j) => <td key={r.nombre + j} style={celda}>{formatearMoneda(v)}</td>))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Desembolsos: cuándo llega el dinero, repartido entre los créditos */}
      {!borrador && (
        <div style={{ display: 'grid', gap: '6px' }} data-seccion="desembolsos">
          <span style={etiqueta}>Desembolsos</span>
          {desembolsos.length === 0 && <span style={nota}>Sin desembolsos capturados en el cronograma de caja.</span>}
          {desembolsos.map((d) => (
            <div key={d.concepto} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', padding: '6px 0', borderTop: '1px solid #334155', fontSize: '12.5px', flexWrap: 'wrap' }}>
              <span style={{ display: 'grid', gap: '2px', minWidth: 0 }}>
                <span style={{ color: '#f8fafc', overflowWrap: 'anywhere' }}>{d.concepto}</span>
                <span style={{ fontSize: '11.5px', color: d.confirmado ? '#4ade80' : '#fbbf24' }}>{formatearFecha(d.fecha)} · {d.estado}{d.confirmado ? ' · confirmado' : ' · no confirmado'}</span>
              </span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatearMoneda(d.monto)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
