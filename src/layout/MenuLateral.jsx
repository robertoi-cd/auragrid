import React from 'react';
import { NavLink } from 'react-router-dom';

// Menú por módulo con el número de alertas críticas de cada uno. Solo módulos que ya tienen contenido.
// modulos: [{ to, texto, criticas }] del proyecto abierto (vacío en Inicio).
export default function MenuLateral({ criticasPortafolio, modulos = [] }) {
  const enlaces = [{ to: '/proyectos', texto: 'Inicio', criticas: criticasPortafolio, end: true }, ...modulos];
  return (
    <nav aria-label="Módulos" style={{ flex: '0 0 190px', alignSelf: 'flex-start', position: 'sticky', top: '64px', padding: '16px 10px', display: 'grid', gap: '4px' }}>
      {enlaces.map((e) => (
        <NavLink key={e.to} to={e.to} end={e.end}
          style={({ isActive }) => ({
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', padding: '9px 12px', borderRadius: '8px',
            textDecoration: 'none', fontSize: '14px', fontWeight: isActive ? 700 : 500,
            color: isActive ? '#0f172a' : '#334155', backgroundColor: isActive ? '#e2e8f0' : 'transparent',
          })}>
          <span>{e.texto}</span>
          {e.criticas != null && e.criticas > 0 && (
            <span aria-label={`${e.criticas} alertas críticas`} style={{ minWidth: '20px', textAlign: 'center', fontSize: '11px', fontWeight: 700, padding: '1px 7px', borderRadius: '999px', backgroundColor: '#b91c1c', color: '#ffffff' }}>
              {e.criticas}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
