import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/** 404: la dirección no existe en la app (con sesión; sin sesión se ve el login). */
export default function NoEncontrada() {
  const { pathname } = useLocation();
  return (
    <div data-pagina-404="" style={{ textAlign: 'center', padding: '48px 20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gap: '10px', justifyItems: 'center' }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b', letterSpacing: '0.08em' }}>ERROR 404</span>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a' }}>Página no encontrada</h1>
      <span style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5, overflowWrap: 'anywhere' }}>
        La dirección <code style={{ backgroundColor: '#f1f5f9', padding: '1px 5px', borderRadius: '4px' }}>{pathname}</code> no existe en AuraGrid. Revisa el enlace o vuelve a Inicio.
      </span>
      <Link to="/proyectos" style={{ fontSize: '14px', fontWeight: 600, color: '#2563eb' }}>Ir a Inicio</Link>
    </div>
  );
}
