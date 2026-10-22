import React from 'react';
import { BannerPrueba } from './VersionPrueba';

export const MENSAJE_ERROR = 'Ocurrió un error inesperado al mostrar esta pantalla. Lo que ya guardaste está a salvo; los cambios sin guardar de esta pantalla pueden haberse perdido.';

/** Pantalla amable de error: completa (falló toda la app) o dentro del tablero (falló solo una página). */
export function PantallaError({ completa = false, detalle = '' }) {
  const boton = { padding: '10px 16px', borderRadius: '6px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', border: '1px solid #2563eb' };
  const tarjeta = (
    <div role="alert" data-pantalla-error="" style={{ backgroundColor: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '32px 24px', maxWidth: '520px', width: '100%', margin: '0 auto', display: 'grid', gap: '12px', textAlign: 'center', fontFamily: 'sans-serif', color: '#0f172a', boxSizing: 'border-box' }}>
      <strong style={{ fontSize: '19px' }}>Algo salió mal</strong>
      <span style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>{MENSAJE_ERROR}</span>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
        <button type="button" onClick={() => window.location.reload()} style={{ ...boton, backgroundColor: '#2563eb', color: '#ffffff' }}>Recargar la página</button>
        {/* Enlace normal (no del router): funciona aunque el error haya sido del router */}
        <a href="/proyectos" style={{ ...boton, backgroundColor: '#ffffff', color: '#2563eb' }}>Ir a Inicio</a>
      </div>
      <span style={{ fontSize: '12px', color: '#64748b' }}>Si se repite, avisa al dueño del proyecto qué estabas haciendo.</span>
      {detalle && (
        <details style={{ fontSize: '12px', color: '#64748b', textAlign: 'left' }}>
          <summary style={{ cursor: 'pointer' }}>Detalle técnico</summary>
          <code style={{ display: 'block', marginTop: '6px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detalle}</code>
        </details>
      )}
    </div>
  );
  if (!completa) return tarjeta;
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
      <BannerPrueba />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '24px 16px' }}>{tarjeta}</div>
    </div>
  );
}

/**
 * Atrapa los errores al dibujar una pantalla y muestra PantallaError en lugar de una página en blanco. Con `clave`
 * (la ruta), se recupera solo al cambiar de página. No atrapa errores de clics ni de cargas asíncronas: esos ya los
 * avisa cada pantalla.
 */
export default class LimiteDeError extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Error al mostrar la pantalla:', error, info?.componentStack);
  }

  componentDidUpdate(anteriores) {
    if (this.state.error && anteriores.clave !== this.props.clave) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <PantallaError completa={this.props.completa} detalle={String(this.state.error?.message ?? this.state.error)} />;
  }
}
