import React, { useRef, useState } from 'react';
import { subirEvidencia, enlaceDescarga, eliminarEvidencia, subirEvidenciaGarantia, eliminarEvidenciaGarantia } from './lib/archivosApi';
import { problemaArchivo, formatearTamano, EXTENSIONES_PERMITIDAS } from './lib/archivos';
import { formatearMomento } from './lib/historialCambios';
import MenuAcciones from './MenuAcciones';

const boton = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '11px', cursor: 'pointer' };
const botonPrimario = { ...boton, border: 'none', backgroundColor: '#f0a535', color: '#1c2028', fontWeight: 700 };
const campo = { width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: '#1c2028', color: '#e8e6e1', fontSize: '12px', boxSizing: 'border-box' };

// Documentos que respaldan un entregable o una garantía (bucket privado "aura-documentos"). Lector: ver y descargar.
// Editor y dueño: además subir y eliminar (con motivo). Todo queda en el historial.
// Con guaranteeId, son los documentos de esa garantía (póliza, carta de crédito, endoso); si no, los del entregable.
// aviso: texto opcional sobre el documento (p. ej. "anterior a la última renovación").
export default function EvidenciasPanel({ projectId, deliverableId, guaranteeId, titulo, documentos = [], puedeEditar, onCambio, aviso = '' }) {
  const deGarantia = Boolean(guaranteeId);
  const [archivo, setArchivo] = useState(null);
  const [nota, setNota] = useState('');
  const [error, setError] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [eliminando, setEliminando] = useState(null); // documento con el diálogo de eliminar abierto
  const [motivo, setMotivo] = useState('');
  const entrada = useRef(null);

  const descargar = async (d) => {
    setError('');
    try {
      const url = await enlaceDescarga(d);
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err.message);
    }
  };

  const subir = async (e) => {
    e.preventDefault();
    if (!archivo) return setError('Elige un archivo.');
    const problema = problemaArchivo(archivo);
    if (problema) return setError(problema);
    setTrabajando(true);
    setError('');
    try {
      const nuevo = deGarantia
        ? await subirEvidenciaGarantia(projectId, guaranteeId, archivo, nota)
        : await subirEvidencia(projectId, deliverableId, archivo, nota);
      onCambio([nuevo, ...documentos]);
      setArchivo(null);
      setNota('');
      if (entrada.current) entrada.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  const eliminar = async () => {
    if (!motivo.trim()) return setError('Escribe el motivo para eliminar el documento.');
    setTrabajando(true);
    setError('');
    try {
      await (deGarantia ? eliminarEvidenciaGarantia : eliminarEvidencia)(eliminando, motivo.trim());
      onCambio(documentos.filter((d) => d.id !== eliminando.id));
      setEliminando(null);
      setMotivo('');
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  return (
    <div style={{ margin: '0 8px 8px', padding: '10px 12px', backgroundColor: '#22272f', borderRadius: '6px', display: 'grid', gap: '8px' }}>
      <strong style={{ fontSize: '12px' }}>Documentos de «{titulo}»</strong>
      {aviso && <span role="note" style={{ fontSize: '11px', color: '#f0b65a', fontWeight: 600 }}>⚠ {aviso}</span>}
      {documentos.length === 0 && <span style={{ fontSize: '11px', color: '#9aa1ad' }}>{deGarantia ? 'Sin documentos todavía: sube la póliza, la carta de crédito o el endoso vigente.' : 'Sin documentos todavía.'}</span>}
      {documentos.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
          {documentos.map((d) => (
            <li key={d.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px' }}>
              <button type="button" onClick={() => descargar(d)} title="Descargar (enlace válido 10 minutos)"
                style={{ padding: 0, border: 'none', background: 'none', color: '#8fb0e0', cursor: 'pointer', fontSize: '12px', textAlign: 'left' }}>
                📄 {d.nombre}
              </button>
              <span style={{ color: '#7d8490', fontSize: '11px' }}>
                {formatearTamano(d.tamano)} · {d.subidoPor || 'usuario desconocido'} · {formatearMomento(d.subidoEn)}{d.nota ? ` · ${d.nota}` : ''}
              </span>
              {puedeEditar && (
                <MenuAcciones etiqueta={`Más acciones de ${d.nombre}`} acciones={[{ texto: 'Eliminar…', peligro: true, onClick: () => { setEliminando(d); setMotivo(''); setError(''); } }]} />
              )}
            </li>
          ))}
        </ul>
      )}

      {eliminando && (
        <div role="alertdialog" aria-label={`Eliminar ${eliminando.nombre}`} style={{ padding: '8px 10px', backgroundColor: '#2a1d1d', border: '1px solid #5c2b28', borderRadius: '6px', display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '12px' }}>¿Eliminar «{eliminando.nombre}»?</strong>
          <span style={{ fontSize: '11px', color: '#c5c9d0' }}>El archivo se borra; queda en el historial quién lo eliminó y el motivo.</span>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#f0b65a' }}>Motivo (obligatorio)
            <textarea name="motivo_eliminar_documento" rows={2} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={{ ...botonPrimario, backgroundColor: '#f2867b' }} disabled={trabajando} onClick={eliminar}>{trabajando ? 'Eliminando…' : 'Eliminar'}</button>
            <button type="button" style={boton} disabled={trabajando} onClick={() => setEliminando(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {puedeEditar ? (
        <form onSubmit={subir} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 200px' }}>
            Archivo ({EXTENSIONES_PERMITIDAS.map((x) => x.toUpperCase()).join(', ')}; máx. 50 MB)
            <input ref={entrada} type="file" name="documento" accept={EXTENSIONES_PERMITIDAS.map((x) => `.${x}`).join(',')}
              onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setError(''); }} style={{ fontSize: '11px', color: '#e8e6e1' }} />
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 160px' }}>Nota (opcional)
            <input name="nota_documento" maxLength={500} value={nota} onChange={(e) => setNota(e.target.value)} style={campo} />
          </label>
          <button type="submit" style={botonPrimario} disabled={trabajando}>{trabajando ? 'Subiendo…' : 'Subir'}</button>
        </form>
      ) : (
        <span style={{ fontSize: '11px', color: '#7d8490' }}>Acceso de solo lectura: puedes ver y descargar.</span>
      )}
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}
