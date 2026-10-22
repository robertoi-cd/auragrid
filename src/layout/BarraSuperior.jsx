import React from 'react';
import { Link } from 'react-router-dom';

const ETIQUETA_ROL = { editor: 'editor', lector: 'lector' };

// Barra superior fija: logo, selector de proyecto, contador de alertas críticas, botón del asistente y sesión.
// Editar el proyecto, el equipo y archivar están en el módulo Configuración.
export default function BarraSuperior({
  proyectos, proyecto, onElegirProyecto, criticas, etiquetaCriticas, onAsistente, asistenteAbierto,
  puedeEditar, correo, onSalir,
}) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 900, backgroundColor: '#0f172a', color: '#ffffff', padding: '10px clamp(12px, 3vw, 24px)', display: 'flex', flexWrap: 'wrap', gap: '10px 18px', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.15)' }}>
      <Link to="/proyectos" style={{ color: '#ffffff', textDecoration: 'none', display: 'grid', lineHeight: 1.15 }}>
        <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.2px' }}>⚡ AuraGrid</span>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Desarrollo PV · México</span>
      </Link>

      {proyectos.length > 0 && (
        <select id="selector-proyecto" name="proyecto" aria-label="Proyecto" value={proyecto?.id || ''}
          onChange={(e) => e.target.value && onElegirProyecto(e.target.value)}
          style={{ backgroundColor: '#1e293b', color: '#fff', border: '1px solid #334155', padding: '8px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', minWidth: 'min(240px, 100%)', maxWidth: '100%' }}>
          <option value="">Todos los proyectos (Inicio)</option>
          {proyectos.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.capacityMw} MWac - {p.state}){ETIQUETA_ROL[p.rol] ? ` · ${ETIQUETA_ROL[p.rol]}` : ''}</option>
          ))}
        </select>
      )}

      {proyecto && !puedeEditar && (
        <span title="Te compartieron este proyecto como lector: puedes ver todo y descargar documentos, sin modificar" style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', backgroundColor: '#1e3a5f', color: '#bfdbfe' }}>
          Solo lectura
        </span>
      )}

      <div style={{ flex: '1 1 auto' }} />

      {/* Contador fijo de alertas críticas (del proyecto abierto o, en Inicio, de todo el portafolio).
          null: se están calculando; undefined: no hay proyecto abierto (p. ej. "No tienes acceso a este proyecto") */}
      <span role="status"
        aria-label={criticas === undefined ? 'Alertas críticas: sin proyecto abierto' : criticas == null ? 'Calculando alertas críticas' : `${criticas} alertas críticas ${etiquetaCriticas}`}
        title={criticas === undefined ? 'Abre un proyecto o Inicio para ver sus alertas críticas' : `Alertas críticas ${etiquetaCriticas}`}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
          backgroundColor: criticas == null ? '#334155' : criticas > 0 ? '#7f1d1d' : '#14532d', color: '#ffffff' }}>
        {criticas === undefined ? '— críticas' : criticas == null ? '… críticas' : `${criticas} ${criticas === 1 ? 'crítica' : 'críticas'}`}
      </span>

      <button onClick={onAsistente} aria-pressed={asistenteAbierto}
        style={{ backgroundColor: asistenteAbierto ? '#1d4ed8' : '#2563eb', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>
        ⚡ Asistente
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #334155', paddingLeft: '14px', minWidth: 0 }}>
        <span title={correo} style={{ fontSize: '12px', color: '#cbd5e1', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{correo}</span>
        <button onClick={onSalir} style={{ backgroundColor: '#475569', color: '#ffffff', border: 'none', padding: '7px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}>Salir</button>
      </div>
    </header>
  );
}
