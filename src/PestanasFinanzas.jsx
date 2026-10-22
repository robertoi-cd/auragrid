import React from 'react';
import { Link, useLocation } from 'react-router-dom';

/** Pestañas de Finanzas: el modelo (todo lo de siempre) y los estados financieros (?vista=estados). */
export const PESTANAS_FINANZAS = [
  { vista: 'modelo', texto: 'Modelo y financiamiento' },
  { vista: 'estados', texto: 'Estados financieros' },
];

/** Vista de Finanzas según la URL: "estados" o "modelo" (la de siempre). */
export const vistaFinanzas = (search) => (new URLSearchParams(search).get('vista') === 'estados' ? 'estados' : 'modelo');

export default function PestanasFinanzas({ vista }) {
  const { pathname } = useLocation();
  return (
    <nav aria-label="Secciones de Finanzas" data-pestanas-finanzas="" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {PESTANAS_FINANZAS.map((p) => {
        const activa = p.vista === vista;
        return (
          <Link
            key={p.vista}
            to={p.vista === 'modelo' ? pathname : `${pathname}?vista=${p.vista}`}
            aria-current={activa ? 'page' : undefined}
            style={{
              padding: '8px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600,
              border: `1px solid ${activa ? '#0f172a' : '#cbd5e1'}`,
              backgroundColor: activa ? '#0f172a' : '#ffffff', color: activa ? '#ffffff' : '#334155',
            }}
          >
            {p.texto}
          </Link>
        );
      })}
    </nav>
  );
}
