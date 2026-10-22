import React, { useState } from 'react';
import { AVISO_ELIMINAR, nombreCoincide } from './lib/eliminarProyecto';

const boton = { border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 };

/**
 * "Eliminar definitivamente" de un proyecto archivado (solo lo ve el dueño): confirmación en la que hay que escribir el
 * nombre del proyecto (sin distinguir mayúsculas, acentos ni espacios repetidos, pero completo); el botón final queda
 * desactivado hasta que coincida. onEliminar(id) borra y lanza un error con un mensaje para el usuario si algo falla.
 * abiertoInicial y escritoInicial: estado inicial de la confirmación (para mostrarla ya abierta, p. ej. en las pruebas).
 */
export default function EliminarArchivado({ proyecto, onEliminar, abiertoInicial = false, escritoInicial = '' }) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [escrito, setEscrito] = useState(escritoInicial);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState('');
  const listo = nombreCoincide(escrito, proyecto.name);

  if (!abierto) {
    return (
      <button type="button" onClick={() => { setAbierto(true); setEscrito(''); setError(''); }}
        style={{ ...boton, backgroundColor: 'transparent', color: '#f2867b', border: '1px solid #f2867b' }}>
        Eliminar definitivamente
      </button>
    );
  }
  const confirmar = async () => {
    if (!listo || borrando) return;
    setBorrando(true);
    setError('');
    try {
      await onEliminar(proyecto.id);
    } catch (err) {
      setError(err.message);
      setBorrando(false);
    }
  };
  const id = `confirmar-eliminar-${proyecto.id}`;
  return (
    <div role="alertdialog" aria-labelledby={`${id}-titulo`} data-eliminar-proyecto="" style={{ flexBasis: '100%', display: 'grid', gap: '8px', padding: '12px', border: '1px solid #f2867b', borderRadius: '8px', backgroundColor: '#2a1d1d' }}>
      <strong id={`${id}-titulo`} style={{ fontSize: '14px', color: '#f2867b' }}>¿Eliminar definitivamente «{proyecto.name}»?</strong>
      <span style={{ fontSize: '13px', color: '#e8e6e1' }}>{AVISO_ELIMINAR}</span>
      <label htmlFor={id} style={{ fontSize: '12px', color: '#9aa1ad' }}>Para confirmar, escribe el nombre del proyecto: <strong style={{ color: '#e8e6e1' }}>{proyecto.name}</strong></label>
      <input id={id} type="text" value={escrito} onChange={(e) => setEscrito(e.target.value)} disabled={borrando} autoComplete="off"
        style={{ padding: '7px 9px', borderRadius: '6px', border: '1px solid #475569', backgroundColor: '#0f172a', color: '#e2e8f0', fontSize: '13px' }} />
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>⚠ {error}</span>}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={confirmar} disabled={!listo || borrando}
          style={{ ...boton, backgroundColor: listo ? '#b91c1c' : '#5b2b2b', color: '#ffffff', cursor: listo && !borrando ? 'pointer' : 'not-allowed' }}>
          {borrando ? 'Eliminando…' : 'Eliminar definitivamente'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={borrando} style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }}>Cancelar</button>
      </div>
    </div>
  );
}
