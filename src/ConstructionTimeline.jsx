import React, { useState } from 'react';
import { NOTA_TRAMOS } from './lib/creditos';
import { formatearMoneda, formatearFecha } from './lib/formato';
import { agregarMovimiento, actualizarMovimiento, eliminarMovimiento, copiarCronogramaEjemplo, eliminarTodosLosMovimientos } from './lib/cronogramaApi';
import CashGapChart from './CashGapChart';
import { IvaEnCaja } from './TarjetaIva';

const ESTADOS = {
  pago: ['Programado', 'Pagado', 'Pendiente'],
  fondo: ['Comprometido', 'Aprobado', 'En revisión', 'Pendiente']
};
const VACIO = {
  pago: { tipo: 'pago', concepto: '', fecha: '', monto: '', estado: 'Programado', fondeo: '', partida: '', esAnticipo: false, compromisoAnticipado: false },
  fondo: { tipo: 'fondo', concepto: '', fecha: '', monto: '', estado: 'Comprometido', fuente: 'equity', confirmado: true }
};

const campo = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '13px' };
const etiqueta = { display: 'grid', gap: '3px', fontSize: '11px', color: '#94a3b8' };
const boton = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: 'transparent', color: '#e2e8f0', fontSize: '12px', cursor: 'pointer' };
const botonPrimario = { ...boton, border: 'none', backgroundColor: '#38bdf8', color: '#0f172a', fontWeight: 700 };
const botonPeligro = { ...boton, borderColor: '#f2867b', color: '#f2867b' };

const resumen = (m) => [
  `${m.concepto} · ${formatearFecha(m.fecha)} · ${formatearMoneda(Number(m.monto))} · ${m.estado}`,
  m.tipo === 'fondo'
    ? `Fuente: ${m.fuente === 'deuda' ? 'deuda' : 'equity'} · ${m.confirmado ? 'compromiso firme' : 'no confirmado'}`
    : `${m.partida === 'equipos' ? `Contrato de equipos${m.esAnticipo ? ` · anticipo${m.compromisoAnticipado ? ' (compromiso anticipado)' : ''}` : ''}` : m.partida === 'financiero' ? 'Costo financiero' : 'Construcción'}${m.fondeo ? ` · fondeo: ${m.fondeo}` : ''}`
];

// Alta, edición o baja de un movimiento, siempre con confirmación antes de guardar
function EditorMovimiento({ inicial, projectId, onGuardado, onEliminado, onCerrar }) {
  const [m, setM] = useState({ ...inicial, monto: String(inicial.monto ?? '') });
  const [paso, setPaso] = useState('formulario'); // 'formulario' | 'confirmar' | 'eliminar'
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k, v) => setM({ ...m, [k]: v });
  const esPago = m.tipo === 'pago';

  const revisar = () => {
    if (!m.concepto.trim()) return setError('Indica el concepto.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) return setError('Indica la fecha.');
    if (!(Number(m.monto) > 0)) return setError('El monto debe ser mayor que cero.');
    setError('');
    setPaso('confirmar');
  };
  const ejecutar = async (accion) => {
    setGuardando(true);
    try {
      if (accion === 'eliminar') {
        await eliminarMovimiento(m.id);
        onEliminado?.(m.id);
      } else {
        const datos = { ...m, concepto: m.concepto.trim(), monto: Number(m.monto), fondeo: (m.fondeo ?? '').trim() };
        onGuardado?.(m.id ? await actualizarMovimiento(m.id, datos) : await agregarMovimiento(projectId, datos));
      }
      onCerrar();
    } catch (err) {
      setError(err.message);
      setPaso('formulario');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '10px' }}>
      {paso === 'formulario' && (
        <form onSubmit={(e) => { e.preventDefault(); revisar(); }} style={{ display: 'grid', gap: '10px' }}>
          <strong style={{ fontSize: '13px' }}>{m.id ? 'Editar' : 'Nuevo'} {esPago ? 'pago' : 'fondo'}</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px' }}>
            <label style={{ ...etiqueta, gridColumn: '1 / -1' }}>Concepto
              <input name="concepto" required maxLength={200} value={m.concepto} onChange={(e) => set('concepto', e.target.value)}
                placeholder={esPago ? 'p. ej. Anticipo módulos' : 'p. ej. Tramo 1 · desembolso inicial'} style={campo} />
            </label>
            <label style={etiqueta}>Fecha
              <input name="fecha" type="date" required value={m.fecha} onChange={(e) => set('fecha', e.target.value)} style={{ ...campo, colorScheme: 'dark' }} />
            </label>
            <label style={etiqueta}>Monto (USD)
              <input name="monto" type="number" min="1" step="1" required value={m.monto} onChange={(e) => set('monto', e.target.value)} style={campo} />
            </label>
            <label style={etiqueta}>Estado
              <select name="estado" value={m.estado} onChange={(e) => set('estado', e.target.value)} style={campo}>
                {ESTADOS[m.tipo].map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </label>
            {esPago ? (
              <>
                <label style={etiqueta}>Fondeo (opcional)
                  <input name="fondeo" maxLength={100} value={m.fondeo ?? ''} onChange={(e) => set('fondeo', e.target.value)} placeholder="Equity, deuda…" style={campo} />
                </label>
                <label style={etiqueta}>Tipo de pago
                  <select name="partida" value={m.partida || ''} style={campo}
                    onChange={(e) => setM({ ...m, partida: e.target.value, esAnticipo: e.target.value === 'equipos' && m.esAnticipo, compromisoAnticipado: e.target.value === 'equipos' && m.compromisoAnticipado })}>
                    <option value="">Construcción (obra, interconexión, montaje)</option>
                    <option value="equipos">Contrato de equipos mayores</option>
                    <option value="financiero">Costo financiero (comisión, intereses, DSRA)</option>
                  </select>
                </label>
                {m.partida === 'equipos' && (
                  <label style={{ ...etiqueta, display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input name="es_anticipo" type="checkbox" checked={Boolean(m.esAnticipo)} onChange={(e) => setM({ ...m, esAnticipo: e.target.checked, compromisoAnticipado: e.target.checked && m.compromisoAnticipado })} />
                    Es anticipo
                  </label>
                )}
                {m.partida === 'equipos' && m.esAnticipo && (
                  <label style={{ ...etiqueta, display: 'flex', gap: '6px', alignItems: 'center', gridColumn: '1 / -1' }}
                    title="Anticipo aprobado para pagarse antes del RTB (p. ej. reserva de módulos): no genera la advertencia de obra antes del RTB">
                    <input name="compromiso_anticipado" type="checkbox" checked={Boolean(m.compromisoAnticipado)} onChange={(e) => set('compromisoAnticipado', e.target.checked)} />
                    Compromiso anticipado (aprobado para pagarse antes del RTB)
                  </label>
                )}
              </>
            ) : (
              <>
                <label style={etiqueta}>Fuente
                  <select name="fuente" value={m.fuente} onChange={(e) => set('fuente', e.target.value)} style={campo}>
                    <option value="equity">Equity (socios)</option>
                    <option value="deuda">Deuda (banco)</option>
                  </select>
                </label>
                <label style={{ ...etiqueta, display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <input name="confirmado" type="checkbox" checked={Boolean(m.confirmado)} onChange={(e) => set('confirmado', e.target.checked)} />
                  Compromiso firme (cuenta para cubrir pagos)
                </label>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="submit" style={botonPrimario}>Revisar</button>
            <button type="button" style={boton} onClick={onCerrar}>Cancelar</button>
            {m.id && <button type="button" style={{ ...botonPeligro, marginLeft: 'auto' }} onClick={() => { setError(''); setPaso('eliminar'); }}>Eliminar</button>}
          </div>
        </form>
      )}
      {paso !== 'formulario' && (
        <div role="alertdialog" aria-label="Confirmar movimiento" style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '13px' }}>
            {paso === 'eliminar' ? `¿Eliminar este ${esPago ? 'pago' : 'fondo'}?` : `¿Guardar este ${esPago ? 'pago' : 'fondo'}?`}
          </strong>
          {resumen(m).map((linea) => <span key={linea} style={{ fontSize: '12px' }}>{linea}</span>)}
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>La gráfica de caja, los huecos y las alertas se recalcularán.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={paso === 'eliminar' ? { ...botonPeligro, fontWeight: 700 } : botonPrimario} disabled={guardando} onClick={() => ejecutar(paso)}>
              {guardando ? 'Guardando…' : paso === 'eliminar' ? 'Confirmar y eliminar' : 'Confirmar y guardar'}
            </button>
            <button type="button" style={boton} disabled={guardando} onClick={() => setPaso('formulario')}>Volver</button>
          </div>
        </div>
      )}
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Copia el cronograma de ejemplo como movimientos propios del proyecto, con confirmación
function ConvertirEnEditable({ finanzas, projectId, onCopiados }) {
  const [paso, setPaso] = useState(null); // null | 'confirmar'
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const total = (l) => formatearMoneda(l.reduce((s, x) => s + x.monto, 0));

  const copiar = async () => {
    setGuardando(true);
    setError('');
    try {
      onCopiados?.(await copiarCronogramaEjemplo(projectId, finanzas.pagos, finanzas.fondos));
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  if (!paso) {
    return (
      <button type="button" style={{ ...boton, justifySelf: 'start' }} onClick={() => setPaso('confirmar')}>
        Convertir en editable
      </button>
    );
  }
  return (
    <div role="alertdialog" aria-label="Convertir el cronograma en editable" style={{ backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '6px' }}>
      <strong style={{ fontSize: '13px' }}>¿Convertir el cronograma de ejemplo en editable?</strong>
      <span style={{ fontSize: '12px' }}>
        Se copiarán al proyecto {finanzas.pagos.length} pagos ({total(finanzas.pagos)}) y {finanzas.fondos.length} fondos ({total(finanzas.fondos)}) tal como se ven ahora.
      </span>
      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
        Desde ese momento serán movimientos propios: podrás editarlos y borrarlos, y el ejemplo dejará de generarse.
        Los montos quedan fijos: si después cambias de estructura, de CAPEX o los supuestos de la deuda, las alertas te dirán cuánto falta o sobra.
        El tramo 2 ya no se confirmará solo con su entregable; márcalo como «compromiso firme» cuando se apruebe.
      </span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" style={botonPrimario} disabled={guardando} onClick={copiar}>{guardando ? 'Copiando…' : 'Confirmar y copiar'}</button>
        <button type="button" style={boton} disabled={guardando} onClick={() => setPaso(null)}>Cancelar</button>
      </div>
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Solo en proyectos de ejemplo: borra el cronograma propio y vuelve al ilustrativo, con confirmación
function VolverAlEjemplo({ finanzas, projectId, onRestaurado }) {
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const n = finanzas.pagos.length + finanzas.fondos.length;

  const restaurar = async () => {
    setGuardando(true);
    setError('');
    try {
      await eliminarTodosLosMovimientos(projectId);
      onRestaurado?.();
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  };

  if (!confirmar) {
    return <button type="button" style={{ ...boton, justifySelf: 'start' }} onClick={() => setConfirmar(true)}>Volver al ejemplo</button>;
  }
  return (
    <div role="alertdialog" aria-label="Volver al cronograma de ejemplo" style={{ backgroundColor: '#0f172a', border: '1px solid #f2867b', borderRadius: '10px', padding: '12px 14px', display: 'grid', gap: '6px' }}>
      <strong style={{ fontSize: '13px' }}>¿Volver al cronograma de ejemplo?</strong>
      <span style={{ fontSize: '12px' }}>Se borrarán los {n} movimientos capturados de este proyecto y volverá a mostrarse el cronograma ilustrativo.</span>
      <span style={{ fontSize: '12px', color: '#94a3b8' }}>Los cambios que hiciste en pagos y fondos se pierden; no se puede deshacer.</span>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" style={{ ...botonPeligro, fontWeight: 700 }} disabled={guardando} onClick={restaurar}>{guardando ? 'Borrando…' : 'Confirmar y volver al ejemplo'}</button>
        <button type="button" style={boton} disabled={guardando} onClick={() => setConfirmar(false)}>Cancelar</button>
      </div>
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

function Movimiento({ item, color, onEditar }) {
  const sinConfirmar = item.confirmado === false;
  return (
    <li style={{ backgroundColor: '#0f172a', padding: '14px 16px', borderRadius: '10px', border: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
      <div>
        <p style={{ fontWeight: '600', color: '#f8fafc', fontSize: '14px', margin: '0 0 4px 0' }}>{item.concepto}</p>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>
          {formatearFecha(item.fecha)}{item.fondeo && <> · Fondeo: <span style={{ color: '#60a5fa' }}>{item.fondeo}</span></>}
          {onEditar && <button type="button" onClick={onEditar} style={{ marginLeft: '8px', padding: 0, border: 'none', background: 'none', color: '#8fb0e0', fontSize: '12px', cursor: 'pointer' }}>Editar</button>}
        </p>
      </div>
      <div style={{ textAlign: 'right' }}>
        <p style={{ fontWeight: 'bold', color, fontSize: '15px', margin: '0 0 4px 0', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatearMoneda(item.monto)}</p>
        <span style={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: '600', padding: '2px 8px', borderRadius: '6px', backgroundColor: sinConfirmar ? '#3d1c1a' : '#1e293b', color: sinConfirmar ? '#f2867b' : '#cbd5e1', border: '1px solid #334155' }}>
          {item.estado}{sinConfirmar ? ' · no confirmado' : ''}
        </span>
      </div>
    </li>
  );
}

// iva: IVA de construcción calculado (ResultadoIva) o null; con él se muestran sus filas por mes.
export default function ConstructionTimeline({ finanzas, fechaRtb, projectId, esEjemplo = false, cargando = false, errorCarga = '', onMovimientoGuardado, onMovimientoEliminado, onMovimientosCopiados, onEjemploRestaurado, puedeEditar = true, iva = null }) {
  const [editando, setEditando] = useState(null); // { tipo } para alta o el movimiento a editar
  if (!finanzas) return null;

  // El cronograma ilustrativo de los proyectos de ejemplo no se edita; capturado o vacío, sí
  const editable = Boolean(projectId) && puedeEditar && !cargando && !errorCarga && finanzas.origenCronograma !== 'ejemplo';
  const suma = (l) => l.reduce((s, x) => s + x.monto, 0);

  const columna = (tipo, titulo, color, items, objetivo) => (
    <div style={{ backgroundColor: '#1e293b', padding: '20px', borderRadius: '12px', border: '1px solid #334155', alignSelf: 'start', display: 'grid', gap: '12px' }}>
      <h3 style={{ fontSize: '13px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', color, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: color, display: 'inline-block' }}></span>
        {titulo}
      </h3>
      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
        Programado {formatearMoneda(suma(items))} de {formatearMoneda(objetivo)}
      </span>
      {items.length === 0 && <span style={{ fontSize: '12px', color: '#94a3b8' }}>Sin movimientos capturados.</span>}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {items.map((item) => (editando?.id && editando.id === item.id
          ? <li key={item.id}><EditorMovimiento inicial={item} projectId={projectId} onGuardado={onMovimientoGuardado} onEliminado={onMovimientoEliminado} onCerrar={() => setEditando(null)} /></li>
          : <Movimiento key={item.id ?? item.concepto} item={item} color={color} onEditar={editable && item.id ? () => setEditando(item) : null} />))}
      </ul>
      {tipo === 'fondo' && items.some((i) => i.fuente === 'deuda') && <span data-nota-tramos="" style={{ fontSize: '11.5px', color: '#94a3b8' }}>{NOTA_TRAMOS}</span>}
      {editable && (editando && !editando.id && editando.tipo === tipo
        ? <EditorMovimiento inicial={VACIO[tipo]} projectId={projectId} onGuardado={onMovimientoGuardado} onCerrar={() => setEditando(null)} />
        : <button type="button" style={{ ...boton, justifySelf: 'start' }} onClick={() => setEditando({ tipo })}>+ Agregar {tipo === 'pago' ? 'pago' : 'fondo'}</button>)}
    </div>
  );

  return (
    <div style={{ backgroundColor: '#0f172a', padding: '24px', borderRadius: '16px', border: '1px solid #1e293b', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)', color: '#fff', display: 'grid', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Cronograma de caja y fondeo</h2>
        {finanzas.origenCronograma === 'ejemplo' && (
          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', fontWeight: 600 }}>Ejemplo ilustrativo</span>
        )}
      </div>

      {finanzas.origenCronograma === 'ejemplo' && projectId && puedeEditar && !cargando && !errorCarga && (
        <ConvertirEnEditable finanzas={finanzas} projectId={projectId} onCopiados={onMovimientosCopiados} />
      )}
      {esEjemplo && finanzas.origenCronograma === 'capturado' && projectId && puedeEditar && !cargando && !errorCarga && (
        <VolverAlEjemplo finanzas={finanzas} projectId={projectId} onRestaurado={onEjemploRestaurado} />
      )}

      {cargando && <span style={{ fontSize: '13px', color: '#94a3b8' }}>Cargando cronograma…</span>}
      {errorCarga && (
        <div role="alert" style={{ border: '1px solid #f2867b', backgroundColor: '#3d1c1a', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f2867b' }}>
          ⚠ {errorCarga}. No se muestran pagos ni fondos de ejemplo en su lugar.
        </div>
      )}
      {!cargando && !errorCarga && finanzas.origenCronograma === 'ninguno' && (
        <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
          Este proyecto aún no tiene pagos ni fuentes de fondeo. Captúralos abajo para calcular los huecos de caja; no se muestran montos ni fechas de ejemplo.
        </p>
      )}

      <CashGapChart finanzas={finanzas} fechaRtb={fechaRtb} />

      {(finanzas.conCronograma || editable) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {columna('pago', 'Salidas: pagos a proveedores', '#fbbf24', finanzas.pagos, finanzas.usos)}
          {columna('fondo', 'Entradas: equity y deuda', '#60a5fa', finanzas.fondos, finanzas.equity + finanzas.deuda)}
        </div>
      )}
      <IvaEnCaja iva={iva} />
    </div>
  );
}
