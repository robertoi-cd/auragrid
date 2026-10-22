import React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';

/** /proyectos/:id o un módulo que no existe → Resumen del mismo proyecto (ruta absoluta: sin acumular segmentos). */
export function IrAResumen() {
  const { id } = useParams();
  return <Navigate to={`/proyectos/${id}/resumen`} replace />;
}

// Envoltorio de todas las páginas de un proyecto (/proyectos/:id/<módulo>). Comprueba el acceso: si el proyecto no
// existe, está archivado o el usuario no tiene acceso, lo dice con un enlace a Inicio; si no, muestra el módulo.
export default function ProyectoRuta({ cargando, proyecto, archivado, modulo, children }) {
  if (cargando) return <p role="status" style={{ color: '#64748b' }}>Cargando el proyecto…</p>;
  if (!proyecto) {
    return (
      <div role="alert" style={{ textAlign: 'center', padding: '48px 20px', backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'grid', gap: '10px', justifyItems: 'center' }}>
        <strong style={{ fontSize: '17px', color: '#0f172a' }}>{archivado ? 'Este proyecto está archivado' : 'No tienes acceso a este proyecto'}</strong>
        <span style={{ fontSize: '13px', color: '#64748b' }}>
          {archivado ? 'Restáuralo desde Archivados, en Inicio, para volver a abrirlo.' : 'El proyecto no existe o no está compartido contigo.'}
        </span>
        <Link to="/proyectos" style={{ fontSize: '14px', fontWeight: 600, color: '#2563eb' }}>Ir a Inicio</Link>
      </div>
    );
  }
  return <div id="tablero" data-modulo={modulo} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>{children}</div>;
}
