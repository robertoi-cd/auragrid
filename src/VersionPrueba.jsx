import React from 'react';
import { Link } from 'react-router-dom';
import { AVISO_VERSION_PRUEBA, PENDIENTE_REVISION_LEGAL, ACTUALIZADO, AVISO_PRIVACIDAD, TERMINOS_USO } from './lib/textosLegales';

/** Banner de la versión de prueba: arriba de toda pantalla (app, login, invitación y páginas legales). */
export function BannerPrueba() {
  return (
    <div role="note" data-banner-prueba="" style={{ backgroundColor: '#fef3c7', color: '#78350f', borderBottom: '1px solid #f59e0b', padding: '7px 16px', fontSize: '13px', fontWeight: 600, textAlign: 'center', lineHeight: 1.4 }}>
      {AVISO_VERSION_PRUEBA}
    </div>
  );
}

/** Enlaces al aviso de privacidad y a los términos de uso (pie de la app y login). */
export function EnlacesLegales({ color = '#64748b' }) {
  const estilo = { color, textDecoration: 'underline' };
  return (
    <span data-enlaces-legales="" style={{ display: 'inline-flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
      <Link to={AVISO_PRIVACIDAD.ruta} style={estilo}>{AVISO_PRIVACIDAD.titulo}</Link>
      <Link to={TERMINOS_USO.ruta} style={estilo}>{TERMINOS_USO.titulo}</Link>
    </span>
  );
}

/** Texto con sus direcciones https:// como enlaces (el punto final de la frase queda fuera del enlace). */
export function conEnlaces(texto) {
  return texto.split(/(https:\/\/[^\s]+?)(?=[.,;]?(?:\s|$))/).map((parte, i) => (parte.startsWith('https://')
    ? <a key={i} href={parte} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>{parte}</a>
    : parte));
}

/** Página del aviso de privacidad o de los términos de uso (se ve sin sesión). */
export function PaginaLegal({ documento }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'sans-serif' }}>
      <BannerPrueba />
      <main style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 16px 64px', display: 'grid', gap: '18px', color: '#0f172a' }}>
        <Link to="/" style={{ color: '#2563eb', fontSize: '13px' }}>← Volver a AuraGrid</Link>
        <div style={{ display: 'grid', gap: '6px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700 }}>{documento.titulo}</h1>
          <span data-pendiente-legal="" style={{ justifySelf: 'start', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '999px', padding: '3px 10px', fontSize: '12px', fontWeight: 700 }}>
            Borrador · {PENDIENTE_REVISION_LEGAL}
          </span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Última actualización: {ACTUALIZADO}</span>
        </div>
        <p style={{ fontSize: '15px', lineHeight: 1.6 }}>{documento.introduccion}</p>
        {documento.secciones.map(([titulo, parrafos, opciones]) => (
          <section key={titulo} style={{ display: 'grid', gap: '6px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{titulo}</h2>
            {opciones?.revisionLegal && (
              <span data-revision-seccion="" style={{ justifySelf: 'start', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: '999px', padding: '2px 8px', fontSize: '11px', fontWeight: 700 }}>{PENDIENTE_REVISION_LEGAL}</span>
            )}
            <ul style={{ listStyle: 'disc', paddingLeft: '22px', display: 'grid', gap: '4px', fontSize: '14.5px', lineHeight: 1.6 }}>
              {parrafos.map((p) => <li key={p}>{conEnlaces(p)}</li>)}
            </ul>
          </section>
        ))}
        <EnlacesLegales color="#2563eb" />
      </main>
    </div>
  );
}
