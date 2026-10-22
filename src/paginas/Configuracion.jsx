import React from 'react';
import { Link } from 'react-router-dom';
import { formatearMoneda, formatearFecha } from '../lib/formato';
import { MARGEN_GARANTIAS_DEFAULT } from '../lib/validaciones';
import { tarjeta, h2, gris, enlace, boton } from './estilos';

const botonPrincipal = { ...boton, border: 'none', backgroundColor: '#f0a535', color: '#1c2028', fontWeight: 700, justifySelf: 'start' };
const dato = { display: 'grid', gap: '1px' };
const etiqueta = { fontSize: '11px', color: '#9aa1ad', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 600 };

/** Lector: la configuración no se le muestra (tampoco aparece en su menú). */
export function SinAccesoConfiguracion({ rutaResumen }) {
  return (
    <div role="alert" style={{ ...tarjeta, textAlign: 'center', justifyItems: 'center', padding: '40px 20px' }}>
      <strong style={{ fontSize: '16px' }}>Solo el dueño y los editores pueden ver la configuración</strong>
      <span style={gris}>Tu acceso a este proyecto es de lectura.</span>
      <Link to={rutaResumen} style={enlace}>Ir al Resumen</Link>
    </div>
  );
}

/**
 * Configuración (dueño y editor): datos del proyecto (se editan con el formulario de siempre), equipo y accesos con
 * el límite diario de cada lector (solo dueño) y archivar con confirmación (solo dueño).
 */
export default function Configuracion({ project, esDueno, onEditar, onEquipo, onArchivar, rutaDe }) {
  const datos = [
    ['Nombre', project.name],
    ['Capacidad', `${project.capacityMw} MWac`],
    ['Estado (ubicación)', project.state],
    ['CAPEX registrado', formatearMoneda(project.capex)],
  ];
  return (
    <>
      <div style={tarjeta}>
        <h2 style={h2}>Datos del proyecto</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(180px, 100%), 1fr))', gap: '12px' }}>
          {datos.map(([e, v]) => (
            <div key={e} style={dato}><span style={etiqueta}>{e}</span><span style={{ fontSize: '14px', fontWeight: 600 }}>{v}</span></div>
          ))}
          <div style={dato}>
            <span style={etiqueta}>RTB objetivo</span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{project.fechaRtb ? formatearFecha(project.fechaRtb) : 'Sin definir'}</span>
            <Link to={rutaDe('cronograma')} style={enlace}>Se cambia en Cronograma →</Link>
          </div>
          <div style={dato}>
            <span style={etiqueta}>Margen de garantías</span>
            <span style={{ fontSize: '14px', fontWeight: 600 }}>{project.margenGarantiasDias ?? MARGEN_GARANTIAS_DEFAULT} días</span>
            <Link to={rutaDe('garantias')} style={enlace}>Se cambia en Garantías →</Link>
          </div>
        </div>
        <button type="button" style={botonPrincipal} onClick={onEditar}>Editar datos del proyecto…</button>
        <span style={gris}>Al guardar se recalculan el modelo financiero, las alertas y el cronograma. Cada cambio queda en el historial.</span>
      </div>

      <div style={tarjeta}>
        <h2 style={h2}>Equipo y accesos</h2>
        {esDueno ? (
          <>
            <span style={gris}>Comparte el proyecto como editor o lector (p. ej. un banco), fija el límite diario de consultas del asistente de cada lector y retira accesos. Ves cuántas consultas lleva cada persona hoy, no el contenido de su chat.</span>
            <button type="button" style={{ ...boton, justifySelf: 'start' }} onClick={onEquipo}>Administrar equipo y accesos…</button>
          </>
        ) : (
          <span style={gris}>Solo el dueño del proyecto administra el equipo, los roles y el límite diario de los lectores.</span>
        )}
      </div>

      {esDueno && (
        <div style={{ ...tarjeta, borderColor: '#5c2b28' }}>
          <h2 style={h2}>Archivar el proyecto</h2>
          <span style={gris}>Sale del portafolio activo. Sus datos financieros y trazas de auditoría se conservan; puedes restaurarlo desde Archivados, en Inicio.</span>
          <button type="button" style={{ ...boton, justifySelf: 'start', borderColor: '#f2867b', color: '#f2867b' }} onClick={onArchivar}>Archivar planta…</button>
        </div>
      )}
    </>
  );
}
