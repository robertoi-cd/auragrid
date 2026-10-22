import React from 'react';

// Mejoras posibles detectadas con los supuestos (lib/oportunidades.ts). Separadas de las alertas: no son riesgos.
export default function OportunidadesOptimizacion({ oportunidades = [], disponible = true }) {
  return (
    <div style={{ backgroundColor: '#1c2028', border: '1px solid #1f4d3a', borderRadius: '12px', padding: '20px 24px', display: 'grid', gap: '10px', color: '#e8e6e1', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Oportunidades de optimización</h2>
        <span style={{ fontSize: '12px', color: '#9aa1ad' }}>Mejoras posibles calculadas con los supuestos · no son alertas</span>
      </div>
      {!disponible && <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Se calculan cuando el proyecto tiene supuestos financieros.</span>}
      {disponible && oportunidades.length === 0 && (
        <span style={{ fontSize: '13px', color: '#9aa1ad' }}>No se detectaron oportunidades con las reglas actuales.</span>
      )}
      {oportunidades.map(o => (
        <div key={o.id} style={{ borderLeft: '3px solid #5cc596', backgroundColor: '#18241f', borderRadius: '8px', padding: '10px 14px', display: 'grid', gap: '4px' }}>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>
            {o.texto} <span style={{ color: '#f0b65a', fontWeight: 700 }}>· {o.nota}</span>
          </span>
          <span style={{ fontSize: '12px', color: '#9aa1ad' }}>{o.accion}</span>
        </div>
      ))}
    </div>
  );
}
