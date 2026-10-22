import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { enlaceDescarga } from '../lib/archivosApi';
import { formatearTamano } from '../lib/archivos';
import { formatearMomento } from '../lib/historialCambios';
import { indiceDocumentos, filtrarDocumentos, completosSinDocumento, autorVisible } from '../lib/documentos';
import { tarjeta, h2, gris, enlace, boton, campo } from './estilos';

/**
 * Documentos: índice de todos los documentos del proyecto (entregables y garantías) con origen, fecha, quién lo subió
 * y descarga con enlace firmado (10 minutos). Subir y borrar se hace en Permisos y frentes y en Garantías.
 * evidencias / evidenciasGarantias null: no se pudieron leer (no se afirma que falten).
 */
export default function Documentos({ frentes, garantias, evidencias, evidenciasGarantias, documentos, evidenciaGarantias, rutaDe, puedeEditar, correoPropio }) {
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState('');
  const disponibles = evidencias != null && evidenciasGarantias != null;
  const filas = indiceDocumentos({ frentes, evidencias, garantias, evidenciasGarantias });
  const sinDocumento = documentos ? completosSinDocumento(frentes, documentos, evidenciaGarantias) : null;
  const verSinDocumento = filtro === 'sin-documento';
  const visibles = verSinDocumento ? [] : filtrarDocumentos(filas,
    filtro.startsWith('frente:') ? { frente: filtro.slice(7) } : filtro.startsWith('garantia:') ? { garantia: filtro.slice(9) } : {});

  const descargar = async (evidencia) => {
    setError('');
    try {
      window.open(await enlaceDescarga(evidencia), '_blank', 'noopener');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={tarjeta}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
        <h2 style={h2}>Documentos del proyecto</h2>
        <span style={gris}>
          {puedeEditar ? 'Para subir o borrar: ' : 'Se suben en '}
          <Link to={rutaDe('permisos')} style={enlace}>Permisos y frentes</Link>{' · '}<Link to={rutaDe('garantias')} style={enlace}>Garantías</Link>
        </span>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', ...gris }}>
        Mostrar
        <select name="filtro_documentos" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={campo}>
          <option value="">Todos los documentos ({filas.length})</option>
          <optgroup label="Por frente">
            {frentes.map((f) => <option key={f.nombre} value={`frente:${f.nombre}`}>{f.nombre} ({filtrarDocumentos(filas, { frente: f.nombre }).length})</option>)}
          </optgroup>
          <optgroup label="Por garantía">
            <option value="garantia:todas">Todas las garantías ({filtrarDocumentos(filas, { garantia: 'todas' }).length})</option>
            {garantias.filter((g) => g.id).map((g) => <option key={g.id} value={`garantia:${g.id}`}>{g.tipo} {g.beneficiario} ({filtrarDocumentos(filas, { garantia: g.id }).length})</option>)}
          </optgroup>
          <option value="sin-documento">Completos sin documento{sinDocumento ? ` (${sinDocumento.length})` : ''}</option>
        </select>
      </label>

      {!disponibles && (
        <div role="alert" style={{ border: '1px solid #f0b65a', backgroundColor: '#3a2c12', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f0b65a' }}>
          ⚠ No se pudieron leer todos los documentos del proyecto: la lista puede estar incompleta.
        </div>
      )}
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}

      {verSinDocumento ? (
        sinDocumento == null ? <span style={gris}>No se pudieron leer los documentos: no se puede saber qué entregables no tienen.</span>
          : sinDocumento.length === 0 ? <span style={gris}>Todos los entregables completos tienen documento.</span>
          : (
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'grid', gap: '4px', fontSize: '13px' }}>
              {sinDocumento.map((e) => (
                <li key={e.id ?? e.titulo}>{e.titulo}{' · '}
                  <Link to={rutaDe(/garantías con documento/.test(e.titulo) ? 'garantias' : 'permisos')} style={enlace}>{puedeEditar ? 'Subir documento →' : 'Ver →'}</Link>
                </li>
              ))}
            </ul>
          )
      ) : visibles.length === 0 ? (
        <span style={gris}>{filas.length === 0 ? 'Aún no hay documentos en este proyecto.' : 'No hay documentos con este filtro.'}</span>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '6px' }}>
          {visibles.map((f) => (
            <li key={f.id} style={{ backgroundColor: '#22272f', borderRadius: '8px', padding: '8px 12px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 14px' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0, display: 'grid', gap: '2px' }}>
                <strong style={{ fontSize: '13px', overflowWrap: 'anywhere' }}>{f.nombre}</strong>
                <span style={gris}>
                  {f.origen === 'entregable' ? `Entregable: ${f.titulo}${f.frente ? ` · ${f.frente}` : ''}` : `Garantía: ${f.titulo}`}
                  {' · '}<Link to={rutaDe(f.origen === 'entregable' ? 'permisos' : 'garantias')} style={enlace}>{f.origen === 'entregable' ? 'Permisos y frentes' : 'Garantías'}</Link>
                </span>
                <span style={{ fontSize: '11px', color: '#7d8490' }}>
                  {formatearMomento(f.subidoEn)} · {autorVisible(f.subidoPor, !puedeEditar, correoPropio)} · {formatearTamano(f.tamano)}
                </span>
              </div>
              <button type="button" style={boton} onClick={() => descargar(f.evidencia)} aria-label={`Descargar ${f.nombre}`}>⬇ Descargar</button>
            </li>
          ))}
        </ul>
      )}
      <span style={{ fontSize: '11px', color: '#7d8490' }}>La descarga usa un enlace firmado válido 10 minutos; los documentos no tienen URL pública.</span>
    </div>
  );
}
