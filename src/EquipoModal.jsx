import React, { useEffect, useState } from 'react';
import { miembrosProyecto, agregarMiembro, cambiarLimite, quitarMiembro, accesosProyecto, exportacionesProyecto } from './lib/equipoApi';
import { formatearMomento } from './lib/historialCambios';
import { limiteCambio } from './lib/permisos';

const ROLES = { dueno: 'Dueño', editor: 'Editor', lector: 'Lector' };
const campo = { padding: '7px 8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' };
const boton = { border: 'none', padding: '7px 12px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '12px' };
const LIMITE_MAXIMO = 1000;

// Equipo del proyecto (solo el dueño): agregar por correo con rol y límite diario del asistente, cambiar rol o
// límite, quitar, consultas de hoy de cada persona y registro de accesos. La persona debe tener cuenta (invitada
// desde Supabase). El dueño ve cuántas consultas lleva cada quien, nunca el contenido de su chat (es privado).
export default function EquipoModal({ projectId, nombreProyecto, onCerrar, onCambio }) {
  const [miembros, setMiembros] = useState([]);
  const [accesos, setAccesos] = useState([]);
  const [exportaciones, setExportaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [nuevo, setNuevo] = useState({ correo: '', rol: 'lector', limite: '' });
  const [limites, setLimites] = useState({}); // userId → texto del campo (lectores y editores)
  const [quitando, setQuitando] = useState(null);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = async () => {
    setCargando(true);
    try {
      const [m, a, x] = await Promise.all([
        miembrosProyecto(projectId), accesosProyecto(projectId),
        // Si el registro de exportaciones aún no existe en la base, no impide ver el equipo
        exportacionesProyecto(projectId).catch((err) => { console.error(err.message); return []; }),
      ]);
      setMiembros(m);
      setAccesos(a);
      setExportaciones(x);
      setLimites(Object.fromEntries(m.filter((x) => x.rol !== 'dueno').map((x) => [x.userId, x.limitePropio ? String(x.limite) : ''])));
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };
  useEffect(() => { cargar(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const ejecutar = async (accion, mensaje) => {
    setTrabajando(true);
    setError('');
    setAviso('');
    try {
      await accion();
      setAviso(mensaje);
      onCambio?.();
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  const limiteValido = (texto) => texto === '' || (Number.isInteger(Number(texto)) && Number(texto) >= 0 && Number(texto) <= LIMITE_MAXIMO);

  const agregar = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(nuevo.correo.trim())) return setError('Escribe un correo válido.');
    if (!limiteValido(nuevo.limite)) return setError(`El límite diario debe ser un número entero entre 0 y ${LIMITE_MAXIMO}.`);
    const limite = nuevo.limite !== '' ? Number(nuevo.limite) : null;
    return ejecutar(async () => {
      await agregarMiembro(projectId, nuevo.correo.trim(), nuevo.rol, limite);
      setNuevo({ correo: '', rol: 'lector', limite: '' });
    }, `${nuevo.correo.trim()} se agregó como ${ROLES[nuevo.rol].toLowerCase()}.`);
  };

  const predeterminado = miembros.find((m) => m.rol === 'lector' && !m.limitePropio)?.limite;

  return (
    <div onClick={() => !trabajando && onCerrar()} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '16px' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="titulo-equipo" onClick={(e) => e.stopPropagation()}
        style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: 'clamp(16px, 4vw, 24px)', width: '640px', maxWidth: '100%', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto', display: 'grid', gap: '14px', fontFamily: 'sans-serif', color: '#0f172a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
          <h2 id="titulo-equipo" style={{ margin: 0, fontSize: '18px' }}>Equipo de {nombreProyecto}</h2>
          <button type="button" onClick={onCerrar} style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }}>Cerrar</button>
        </div>
        <p style={{ margin: 0, fontSize: '12px', color: '#475569', lineHeight: 1.5 }}>
          <strong>Editor:</strong> ve y edita todo, sin archivar ni administrar el equipo. <strong>Lector</strong> (p. ej. un banco): ve todo, incluidos
          historial y documentos, y usa el asistente con un límite diario de consultas. Editores y lectores nunca usan las consultas reservadas
          al dueño; al editor puedes fijarle un límite propio (opcional). Ves cuántas consultas lleva cada persona hoy, no el contenido de su
          chat, que es privado. La persona debe tener cuenta: créala en Supabase (Authentication → Users → Add user) o invítala cuando la app esté publicada.
        </p>

        {cargando && <span style={{ fontSize: '13px', color: '#64748b' }}>Cargando equipo…</span>}
        {!cargando && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '11px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '6px' }}>Persona</th><th style={{ padding: '6px' }}>Rol</th>
                  <th style={{ padding: '6px' }}>Consultas/día</th><th style={{ padding: '6px' }}>Hoy</th><th style={{ padding: '6px' }} />
                </tr>
              </thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.userId} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '6px', wordBreak: 'break-all' }}>{m.correo}</td>
                    <td style={{ padding: '6px' }}>
                      {m.rol === 'dueno' ? 'Dueño' : (
                        <select name={`rol-${m.userId}`} value={m.rol} disabled={trabajando} style={campo}
                          onChange={(e) => ejecutar(() => agregarMiembro(projectId, m.correo, e.target.value, m.limitePropio ? m.limite : null), `Rol de ${m.correo} actualizado.`)}>
                          <option value="editor">Editor</option>
                          <option value="lector">Lector</option>
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '6px' }}>
                      {m.rol !== 'dueno' ? (
                        <span style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                          <input name={`limite-${m.userId}`} type="number" min="0" max={LIMITE_MAXIMO} step="1"
                            placeholder={m.rol === 'lector' ? `${predeterminado ?? m.limite} (predet.)` : 'Sin límite'}
                            value={limites[m.userId] ?? ''} onChange={(e) => setLimites({ ...limites, [m.userId]: e.target.value })} style={{ ...campo, width: '110px' }} />
                          <button type="button" disabled={trabajando || !limiteValido(limites[m.userId] ?? '') || !limiteCambio(limites[m.userId] ?? '', m)} style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }}
                            onClick={() => ejecutar(() => cambiarLimite(projectId, m.userId, (limites[m.userId] ?? '') === '' ? null : Number(limites[m.userId])), `Límite de ${m.correo} actualizado.`)}>
                            Guardar
                          </button>
                        </span>
                      ) : <span style={{ color: '#64748b' }}>Cupo completo</span>}
                    </td>
                    <td style={{ padding: '6px', whiteSpace: 'nowrap' }} title="Consultas al asistente hoy en este proyecto">
                      {m.limite != null ? `${m.usadasHoy ?? 0} de ${m.limite}` : `${m.usadasHoy ?? 0}`}
                    </td>
                    <td style={{ padding: '6px' }}>
                      {m.rol !== 'dueno' && (quitando === m.userId ? (
                        <span style={{ display: 'flex', gap: '4px' }}>
                          <button type="button" disabled={trabajando} style={{ ...boton, backgroundColor: '#b91c1c', color: '#fff' }}
                            onClick={() => ejecutar(async () => { await quitarMiembro(projectId, m.userId); setQuitando(null); }, `${m.correo} ya no tiene acceso.`)}>Quitar</button>
                          <button type="button" style={{ ...boton, backgroundColor: '#e2e8f0', color: '#334155' }} onClick={() => setQuitando(null)}>No</button>
                        </span>
                      ) : (
                        <button type="button" style={{ ...boton, backgroundColor: 'transparent', color: '#b91c1c', border: '1px solid #fecaca' }} onClick={() => setQuitando(m.userId)}>Quitar…</button>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <form onSubmit={agregar} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', fontWeight: 600, color: '#334155', flex: '1 1 200px' }}>Correo
            <input name="correo_miembro" type="email" required value={nuevo.correo} onChange={(e) => setNuevo({ ...nuevo, correo: e.target.value })} style={campo} />
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', fontWeight: 600, color: '#334155' }}>Rol
            <select name="rol_miembro" value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} style={campo}>
              <option value="lector">Lector</option>
              <option value="editor">Editor</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', fontWeight: 600, color: '#334155' }}>Consultas/día{nuevo.rol === 'editor' ? ' (opcional)' : ''}
            <input name="limite_miembro" type="number" min="0" max={LIMITE_MAXIMO} step="1" placeholder={nuevo.rol === 'lector' ? 'Predet.' : 'Sin límite'} value={nuevo.limite} onChange={(e) => setNuevo({ ...nuevo, limite: e.target.value })} style={{ ...campo, width: '130px' }} />
          </label>
          <button type="submit" disabled={trabajando} style={{ ...boton, backgroundColor: '#2563eb', color: '#fff' }}>{trabajando ? 'Guardando…' : 'Agregar'}</button>
        </form>

        {error && <span role="alert" style={{ fontSize: '12px', color: '#b91c1c' }}>{error}</span>}
        {aviso && <span role="status" style={{ fontSize: '12px', color: '#15803d' }}>{aviso}</span>}

        <div style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '13px' }}>Accesos recientes</strong>
          {accesos.length === 0
            ? <span style={{ fontSize: '12px', color: '#64748b' }}>Ningún miembro ha abierto el proyecto todavía.</span>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '3px', fontSize: '12px' }}>
                {accesos.map((a, i) => <li key={i}>{formatearMomento(a.momento)} · {a.correo || 'sin correo'} ({ROLES[a.rol] ?? a.rol})</li>)}
              </ul>
            )}
          <span style={{ fontSize: '11px', color: '#64748b' }}>Se registra como máximo un acceso por hora y persona.</span>
        </div>

        <div style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '13px' }}>Exportaciones del análisis financiero</strong>
          {exportaciones.length === 0
            ? <span style={{ fontSize: '12px', color: '#64748b' }}>Nadie ha exportado el análisis financiero de este proyecto.</span>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '3px', fontSize: '12px' }}>
                {exportaciones.map((x, i) => <li key={i}>{formatearMomento(x.momento)} · {x.correo || 'sin correo'} ({ROLES[x.rol] ?? x.rol}) · Excel</li>)}
              </ul>
            )}
          <span style={{ fontSize: '11px', color: '#64748b' }}>Se registra cada descarga, incluidas las tuyas.</span>
        </div>
      </div>
    </div>
  );
}
