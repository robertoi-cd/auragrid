import React, { useState } from 'react';
import { supabase } from './supabase';
import { AVISO_LEGAL } from './lib/avisoLegal';
import { problemaContrasena, LARGO_MINIMO_CONTRASENA } from './lib/contrasena';
import { BannerPrueba, EnlacesLegales } from './VersionPrueba';

const campo = { width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' };

// Después de abrir el enlace de una invitación o de "¿Olvidaste tu contraseña?", el usuario ya tiene sesión
// (la creó el enlace) pero necesita una contraseña para volver a entrar.
export default function DefinirContrasena({ tipo, correo, onListo }) {
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    const problema = problemaContrasena(contrasena, confirmacion);
    if (problema) return setError(problema);
    setGuardando(true);
    setError('');
    const { error: err } = await supabase.auth.updateUser({ password: contrasena });
    setGuardando(false);
    if (err) return setError(err.message || 'No se pudo guardar la contraseña. Intenta de nuevo.');
    // Limpia el enlace de la barra de direcciones para que recargar no repita el flujo
    window.history.replaceState(null, '', window.location.pathname);
    onListo();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
    <BannerPrueba />
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, backgroundColor: '#0f172a', fontFamily: 'sans-serif', padding: '16px', boxSizing: 'border-box' }}>
      <form onSubmit={guardar} style={{ backgroundColor: '#ffffff', padding: 'clamp(20px, 5vw, 36px)', borderRadius: '12px', width: '100%', maxWidth: '420px', boxSizing: 'border-box', display: 'grid', gap: '14px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>{tipo === 'invite' ? 'Bienvenido a AuraGrid' : 'Nueva contraseña'}</h1>
        <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
          {tipo === 'invite' ? 'Define la contraseña con la que entrarás' : 'Escribe tu nueva contraseña'} como <strong>{correo}</strong>.
        </p>
        <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>Contraseña
          <input type="password" name="nueva_contrasena" autoComplete="new-password" required minLength={LARGO_MINIMO_CONTRASENA} value={contrasena} onChange={(e) => setContrasena(e.target.value)} style={campo} />
        </label>
        <label style={{ display: 'grid', gap: '4px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>Repite la contraseña
          <input type="password" name="confirmar_contrasena" autoComplete="new-password" required value={confirmacion} onChange={(e) => setConfirmacion(e.target.value)} style={campo} />
        </label>
        <span style={{ fontSize: '11px', color: '#64748b' }}>Mínimo {LARGO_MINIMO_CONTRASENA} caracteres.</span>
        {error && <span role="alert" style={{ fontSize: '13px', color: '#b91c1c' }}>{error}</span>}
        <button type="submit" disabled={guardando} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none', padding: '12px', borderRadius: '6px', fontWeight: 600, cursor: 'pointer', fontSize: '14px' }}>
          {guardando ? 'Guardando…' : 'Guardar contraseña y entrar'}
        </button>
        <p style={{ margin: 0, fontSize: '11px', color: '#64748b', lineHeight: 1.5, textAlign: 'center' }}>{AVISO_LEGAL}</p>
        <div style={{ fontSize: '12px', textAlign: 'center' }}><EnlacesLegales /></div>
      </form>
    </div>
    </div>
  );
}
