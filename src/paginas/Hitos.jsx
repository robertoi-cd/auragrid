import React from 'react';
import { formatearFecha } from '../lib/formato';
import { hitosProyecto } from '../lib/modulos';
import { tarjeta, h2, gris, textoDias } from './estilos';

// Hitos del proyecto: RTB → NTP → COD (Resumen) o con el fin de interconexión (Cronograma).
export default function Hitos({ fechas, hoy, conInterconexion = false }) {
  const hitos = hitosProyecto(fechas, hoy, conInterconexion);
  if (hitos.length === 0) return null;
  return (
    <div style={tarjeta}>
      <h2 style={h2}>Hitos</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: '8px' }}>
        {hitos.map((h, i) => (
          <React.Fragment key={h.clave}>
            {i > 0 && <li aria-hidden="true" style={{ alignSelf: 'center', color: '#7d8490' }}>→</li>}
            <li style={{ flex: '1 1 140px', backgroundColor: '#22272f', borderRadius: '8px', padding: '10px 12px', display: 'grid', gap: '2px' }}>
              <strong style={{ fontSize: '13px' }}>{h.nombre}</strong>
              <span style={{ fontFamily: 'monospace', fontSize: '15px' }}>{h.fecha ? formatearFecha(h.fecha) : 'Sin definir'}</span>
              <span style={gris}>{textoDias(h.dias)}{h.estimada ? `${h.dias != null ? ' · ' : ''}estimada (sin cronograma capturado)` : ''}</span>
            </li>
          </React.Fragment>
        ))}
      </ol>
    </div>
  );
}
