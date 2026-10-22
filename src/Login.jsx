import React, { useState } from 'react';
import { supabase, errorEnlaceInicial } from './supabase';
import { AVISO_LEGAL } from './lib/avisoLegal';
import { BannerPrueba, EnlacesLegales } from './VersionPrueba';

// Acceso solo por invitación: las cuentas las crea el dueño desde Supabase (Authentication → Users → Invite user) y el
// registro público está desactivado en Supabase. Aquí no hay "Crear cuenta".
export const NOTA_SOLO_INVITACION = 'El acceso es solo por invitación. Si necesitas una cuenta, pide al dueño del proyecto que te invite.';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  // Un enlace vencido o ya usado (invitación o recuperación) llega con error en la URL
  const [errorMsg, setErrorMsg] = useState(errorEnlaceInicial ? `El enlace no es válido o ya venció (${errorEnlaceInicial}). Pide uno nuevo.` : '');
  const [successMsg, setSuccessMsg] = useState(''); // Estado para el mensaje de éxito en correo

  // "¿Olvidaste tu contraseña?": Supabase envía un enlace que abre la app para definir una nueva
  const recuperar = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErrorMsg('Escribe tu correo arriba y vuelve a pulsar «¿Olvidaste tu contraseña?».'); return; }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    setLoading(false);
    // Mismo mensaje exista o no la cuenta (no se revela qué correos están registrados)
    if (error && error.status !== 400) { setErrorMsg('No se pudo enviar el correo. Intenta de nuevo en unos minutos.'); return; }
    setSuccessMsg(`Si ${email} tiene una cuenta, recibirás un correo con un enlace para definir una nueva contraseña.`);
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (onLoginSuccess) onLoginSuccess(data.session);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#0f172a' }}>
    <BannerPrueba />
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      flex: 1,
      width: '100%',
      backgroundColor: '#0f172a',
      fontFamily: 'sans-serif',
      boxSizing: 'border-box',
      margin: 0,
      padding: 0
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        padding: '36px',
        borderRadius: '12px',
        width: '100%',
        maxWidth: '420px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
        boxSizing: 'border-box'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ color: '#0f172a', margin: '0 0 8px 0', fontSize: '24px' }}>AuraGrid</h2>
          <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Plataforma de Optimización Solar PV</p>
        </div>

        {errorMsg && (
          <div style={{ backgroundColor: '#fee2e2', color: '#991b1b', padding: '10px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px' }}>
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '12px', borderRadius: '6px', fontSize: '13px', marginBottom: '16px', border: '1px solid #bbf7d0', lineHeight: '1.4' }}>
            {successMsg}
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} autoComplete="off">
          <div>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Correo Electrónico</label>
            <input
              id="login-email"
              name="email"
              type="text"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="nombre@auragrid.com"
              style={{ 
                width: '100%', 
                padding: '11px 14px', 
                borderRadius: '6px', 
                border: '1px solid #cbd5e1', 
                fontSize: '14px', 
                boxSizing: 'border-box',
                color: '#000000',
                backgroundColor: '#ffffff',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#334155', marginBottom: '6px' }}>Contraseña</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="login-password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Mínimo 6 caracteres"
                style={{ 
                  width: '100%', 
                  padding: '11px 40px 11px 14px', 
                  borderRadius: '6px', 
                  border: '1px solid #cbd5e1', 
                  fontSize: '14px', 
                  boxSizing: 'border-box',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  outline: 'none'
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '16px',
                  color: '#64748b',
                  padding: 0
                }}
                title={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          <button 
            type="submit"
            disabled={loading}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              padding: '12px',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: 'pointer',
              fontSize: '14px',
              marginTop: '8px',
              transition: 'background-color 0.2s'
            }}
          >
            {loading ? 'Procesando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '14px' }}>
          <button type="button" onClick={recuperar} disabled={loading}
            style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>
            ¿Olvidaste tu contraseña?
          </button>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: '12px', color: '#475569', textAlign: 'center', lineHeight: 1.5 }}>{NOTA_SOLO_INVITACION}</p>
        <p style={{ margin: '22px 0 0', fontSize: '11px', color: '#64748b', lineHeight: 1.5, textAlign: 'center' }}>{AVISO_LEGAL}</p>
        <div style={{ marginTop: '10px', fontSize: '12px', textAlign: 'center' }}><EnlacesLegales /></div>
      </div>
    </div>
    </div>
  );
}