import React, { useState } from 'react';
import { actualizarProyecto, MAX_NOMBRE_PROYECTO, CAPACIDAD_MAXIMA_MW } from './lib/proyectoApi';
import { guardarSupuestos } from './lib/supuestosApi';
import { ESTADOS_MEXICO, recursoSolar, origenProduccion } from './lib/fuentesSupuestos';
import { aNumero, formatearMoneda, formatearNumero } from './lib/formato';

const etiquetaCampo = { display: 'grid', gap: '3px', fontSize: '11px', fontWeight: '600', color: '#334155' };
const campo = { width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' };
const boton = { border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' };

// Editar nombre, capacidad, estado y CAPEX de un proyecto, con confirmación. Todo se recalcula al guardar y cada
// cambio queda en el historial. Si cambia el estado, se propone la producción específica del estado nuevo.
export default function EditarProyectoModal({ proyecto, supuestos, onGuardado, onCerrar }) {
  const capexActual = aNumero(proyecto.capex) ?? 0;
  const [b, setB] = useState({ nombre: proyecto.name, capacidad: String(proyecto.capacityMw ?? ''), estado: proyecto.state, capex: String(capexActual) });
  const [actualizarProduccion, setActualizarProduccion] = useState(false);
  const [paso, setPaso] = useState('formulario');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const nombre = b.nombre.trim();
  const capacidad = Number(b.capacidad);
  const capex = Number(b.capex);
  // Producción específica: se propone la del estado nuevo; el usuario decide (por defecto se conserva la actual)
  const produccionActual = supuestos?.rendimientoFijaKwhKwp ?? null;
  const produccionNueva = b.estado !== proyecto.state ? recursoSolar(b.estado)?.pvout ?? null : null;
  const proponerProduccion = produccionActual != null && produccionNueva != null && produccionNueva !== produccionActual;

  const cambios = [
    nombre !== proyecto.name && ['Nombre', proyecto.name, nombre],
    capacidad !== Number(proyecto.capacityMw) && ['Capacidad', `${formatearNumero(Number(proyecto.capacityMw))} MWac`, `${formatearNumero(capacidad)} MWac`],
    b.estado !== proyecto.state && ['Estado', proyecto.state, b.estado],
    capex !== capexActual && ['CAPEX', formatearMoneda(capexActual), formatearMoneda(capex)],
    proponerProduccion && actualizarProduccion && ['Producción específica', `${formatearNumero(produccionActual)} kWh/kWp`, `${formatearNumero(produccionNueva)} kWh/kWp (promedio de ${b.estado})`],
  ].filter(Boolean);

  const revisar = (e) => {
    e.preventDefault();
    if (!nombre || nombre.length > MAX_NOMBRE_PROYECTO) return setError(`El nombre es obligatorio y admite hasta ${MAX_NOMBRE_PROYECTO} caracteres.`);
    if (!(capacidad > 0 && capacidad <= CAPACIDAD_MAXIMA_MW)) return setError(`La capacidad debe estar entre 0 y ${CAPACIDAD_MAXIMA_MW.toLocaleString('en-US')} MWac.`);
    if (!b.estado) return setError('Elige el estado del proyecto.');
    if (!(capex > 0)) return setError('El CAPEX debe ser mayor que cero.');
    if (cambios.length === 0) return setError('No hay cambios que guardar.');
    setError('');
    setPaso('confirmar');
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const fila = await actualizarProyecto(proyecto.id, { nombre, capacidadMw: capacidad, estado: b.estado, capexUsd: capex });
      const nuevosSupuestos = proponerProduccion && actualizarProduccion
        ? await guardarSupuestos(proyecto.id, { rendimientoFijaKwhKwp: produccionNueva })
        : null;
      onGuardado(fila, nuevosSupuestos);
    } catch (err) {
      setError(err.message);
      setPaso('formulario');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div onClick={() => !guardando && onCerrar()} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '16px' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-editar-proyecto" onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: 'clamp(16px, 4vw, 24px)', width: '480px', maxWidth: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '12px', fontFamily: 'sans-serif', color: '#0f172a' }}>
        <h2 id="titulo-editar-proyecto" style={{ margin: 0, fontSize: '18px' }}>Editar proyecto</h2>
        {paso === 'formulario' ? (
          <form onSubmit={revisar} style={{ display: 'grid', gap: '12px' }}>
            <label style={etiquetaCampo}>Nombre
              <input name="nombre" required maxLength={MAX_NOMBRE_PROYECTO} value={b.nombre} onChange={(e) => setB({ ...b, nombre: e.target.value })} style={campo} />
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
              <label style={etiquetaCampo}>Capacidad (MWac)
                <input name="capacidad_mw" type="number" min="0.1" max={CAPACIDAD_MAXIMA_MW} step="0.1" required value={b.capacidad} onChange={(e) => setB({ ...b, capacidad: e.target.value })} style={campo} />
              </label>
              <label style={etiquetaCampo}>Estado (ubicación)
                <select name="estado" required value={b.estado} onChange={(e) => setB({ ...b, estado: e.target.value })} style={campo}>
                  {!ESTADOS_MEXICO.includes(proyecto.state) && <option value={proyecto.state}>{proyecto.state}</option>}
                  {ESTADOS_MEXICO.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </label>
            </div>
            <label style={etiquetaCampo}>CAPEX total (USD)
              <input name="capex_usd" type="number" min="1" step="1000" required value={b.capex} onChange={(e) => setB({ ...b, capex: e.target.value })} style={campo} />
            </label>
            {proponerProduccion && (
              <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#334155', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px' }}>
                <input type="checkbox" name="actualizar_produccion" checked={actualizarProduccion} onChange={(e) => setActualizarProduccion(e.target.checked)} style={{ marginTop: '2px' }} />
                <span>
                  Actualizar la producción específica al promedio de {b.estado}: <strong>{formatearNumero(produccionNueva)} kWh/kWp</strong> (hoy {formatearNumero(produccionActual)}).
                  <span style={{ display: 'block', color: '#64748b' }}>Origen actual: {origenProduccion(produccionActual, proyecto.state)}</span>
                </span>
              </label>
            )}
            <span style={{ fontSize: '11px', color: '#64748b' }}>Al guardar se recalculan el modelo financiero, las alertas y el cronograma. Cada cambio queda en el historial.</span>
            {error && <span role="alert" style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onCerrar} style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }}>Cancelar</button>
              <button type="submit" style={{ ...boton, backgroundColor: '#2563eb', color: '#ffffff' }}>Revisar cambios</button>
            </div>
          </form>
        ) : (
          <div role="alertdialog" aria-label="Confirmar cambios del proyecto" style={{ display: 'grid', gap: '8px' }}>
            <strong style={{ fontSize: '14px' }}>¿Guardar estos cambios?</strong>
            {cambios.map(([c, antes, despues]) => (
              <span key={c} style={{ fontSize: '13px' }}><span style={{ color: '#64748b' }}>{c}:</span> {antes} → <strong>{despues}</strong></span>
            ))}
            {error && <span role="alert" style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</span>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button type="button" disabled={guardando} onClick={() => setPaso('formulario')} style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }}>Volver</button>
              <button type="button" disabled={guardando} onClick={guardar} style={{ ...boton, backgroundColor: '#2563eb', color: '#ffffff' }}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
