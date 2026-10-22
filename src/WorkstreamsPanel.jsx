import React, { useState } from 'react';
import { formatearFecha } from './lib/formato';
import MenuAcciones from './MenuAcciones';
import EvidenciasPanel from './EvidenciasPanel';
import { garantiasRespaldadas, textoEvidenciaGarantias } from './lib/evidencia';
import { codigoEntregable, REGLA_POR_CODIGO } from './lib/codigosEntregables';
import { MAX_NOMBRE_ENTREGABLE } from './lib/entregablesApi';
import { ESTADOS_ENTREGABLE, ETIQUETAS_ESTADO, requiereMotivo, describirCambio, formatearMomento } from './lib/historialCambios';

const STATUS_LABELS = ETIQUETAS_ESTADO;
const STATUS_STYLES = {
  completo: { bg: '#163327', color: '#5cc596' },
  curso: { bg: '#1d2a3d', color: '#8fb0e0' },
  pendiente: { bg: '#22272f', color: '#9aa1ad', border: '1px solid #323843' },
  bloqueado: { bg: '#3d1c1a', color: '#f2867b' }
};

const campo = { padding: '6px 8px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: '#1c2028', color: '#e8e6e1', fontSize: '12px' };
const boton = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '12px', cursor: 'pointer' };
const botonPrimario = { ...boton, border: 'none', backgroundColor: '#f0a535', color: '#1c2028', fontWeight: 700 };

// Fecha compromiso y responsable de un entregable, con confirmación antes de guardar
function EditorEntregable({ titulo, fecha, responsable, otrosTitulos = [], automatico = false, onGuardar, onCerrar }) {
  const [borrador, setBorrador] = useState({ titulo, fecha: fecha ?? '', responsable: responsable ?? '' });
  const nombre = borrador.titulo.trim();
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const cambios = [
    nombre !== titulo && ['Nombre', titulo, nombre],
    (borrador.fecha || null) !== (fecha || null) && ['Fecha compromiso', fecha ? formatearFecha(fecha) : 'Sin fecha', borrador.fecha ? formatearFecha(borrador.fecha) : 'Sin fecha'],
    borrador.responsable.trim() !== (responsable ?? '') && ['Responsable', responsable || 'Sin responsable', borrador.responsable.trim() || 'Sin responsable'],
  ].filter(Boolean);

  const guardar = async () => {
    setGuardando(true);
    try {
      await onGuardar({ ...(nombre !== titulo ? { titulo: nombre } : {}), fecha: borrador.fecha || null, responsable: borrador.responsable.trim() });
      onCerrar();
    } catch (err) {
      setError(err.message);
      setConfirmar(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ margin: '0 8px 8px', padding: '10px 12px', backgroundColor: '#22272f', borderRadius: '6px', display: 'grid', gap: '8px' }}>
      {confirmar ? (
        <div role="alertdialog" aria-label={`Confirmar cambios en ${titulo}`} style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '12px' }}>¿Guardar cambios en «{titulo}»?</strong>
          {cambios.map(([c, antes, despues]) => (
            <span key={c} style={{ fontSize: '12px' }}><span style={{ color: '#9aa1ad' }}>{c}:</span> {antes} → <strong>{despues}</strong></span>
          ))}
          <span style={{ fontSize: '11px', color: '#9aa1ad' }}>Las alertas de plazo se recalcularán al guardar. Cambiar el nombre no cambia las reglas que usa el entregable.</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            <button type="button" style={boton} disabled={guardando} onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!nombre) { setError('El nombre del entregable no puede quedar vacío.'); return; }
          if (nombre !== titulo && otrosTitulos.some((t) => t.trim().toLowerCase() === nombre.toLowerCase())) { setError('Ya existe un entregable con ese nombre en el proyecto.'); return; }
          if (cambios.length === 0) { setError('No hay cambios que guardar.'); return; }
          setError(''); setConfirmar(true);
        }}
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 100%' }}>Nombre{automatico ? ' (se sigue calculando con las garantías)' : ''}
            <input name="titulo" type="text" required maxLength={MAX_NOMBRE_ENTREGABLE} value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} style={campo} />
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad' }}>Fecha compromiso
            <input name="fecha" type="date" value={borrador.fecha} onChange={(e) => setBorrador({ ...borrador, fecha: e.target.value })} style={{ ...campo, colorScheme: 'dark' }} />
          </label>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 160px' }}>Responsable
            <input name="responsable" type="text" maxLength={200} value={borrador.responsable} onChange={(e) => setBorrador({ ...borrador, responsable: e.target.value })} style={campo} />
          </label>
          <button type="submit" style={botonPrimario}>Revisar</button>
          <button type="button" style={boton} onClick={onCerrar}>Cancelar</button>
        </form>
      )}
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Menú de estados dentro de la página: elegir, confirmar y (si sale de "Completo") escribir el motivo
function SelectorEstado({ titulo, estado, onGuardar, onCerrar }) {
  const [nuevo, setNuevo] = useState(null);
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const conMotivo = nuevo != null && requiereMotivo(estado, nuevo);

  const guardar = async () => {
    if (conMotivo && !motivo.trim()) { setError('Escribe el motivo del cambio.'); return; }
    setGuardando(true);
    setError('');
    try {
      await onGuardar(nuevo, motivo.trim());
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div role="dialog" aria-label={`Cambiar estado de ${titulo}`} style={{ margin: '0 8px 8px', padding: '10px 12px', backgroundColor: '#22272f', borderRadius: '6px', display: 'grid', gap: '8px' }}>
      {nuevo == null ? (
        <>
          <span style={{ fontSize: '12px', color: '#9aa1ad' }}>Nuevo estado para «{titulo}»:</span>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {ESTADOS_ENTREGABLE.map(e => {
              const cfg = STATUS_STYLES[e];
              const actual = e === estado;
              return (
                <button key={e} type="button" disabled={actual} onClick={() => { setNuevo(e); setError(''); }}
                  aria-pressed={actual}
                  style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: '999px', border: cfg.border || 'none', backgroundColor: cfg.bg, color: cfg.color, cursor: actual ? 'default' : 'pointer', opacity: actual ? 0.5 : 1 }}>
                  {STATUS_LABELS[e]}{actual ? ' (actual)' : ''}
                </button>
              );
            })}
            <button type="button" style={boton} onClick={onCerrar}>Cancelar</button>
          </div>
        </>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); guardar(); }} style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '12px' }}>¿Cambiar «{titulo}» de {STATUS_LABELS[estado]} a {STATUS_LABELS[nuevo]}?</strong>
          <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: conMotivo ? '#f0b65a' : '#9aa1ad' }}>
            {conMotivo ? 'Motivo (obligatorio: el entregable deja de estar completo)' : 'Motivo (opcional)'}
            <textarea name="motivo" rows={2} maxLength={500} required={conMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <span style={{ fontSize: '11px', color: '#9aa1ad' }}>El cambio queda en el historial del proyecto; las alertas se recalcularán al guardar.</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" style={botonPrimario} disabled={guardando}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            <button type="button" style={boton} disabled={guardando} onClick={() => { setNuevo(null); setError(''); }}>Volver</button>
          </div>
        </form>
      )}
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

const NUEVO_FRENTE = '__nuevo__';

// Alta de un entregable (pendiente) en un frente existente o nuevo, con confirmación
function AgregarEntregable({ frentes, onAgregar, onCerrar }) {
  const [d, setD] = useState({ frente: frentes[0]?.nombre ?? NUEVO_FRENTE, frenteNuevo: '', titulo: '', responsable: '', fecha: '', motivo: '' });
  const [confirmar, setConfirmar] = useState(false);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const frente = d.frente === NUEVO_FRENTE ? d.frenteNuevo.trim() : d.frente;
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });

  const revisar = () => {
    if (!frente) return setError('Indica el nombre del frente nuevo.');
    if (!d.titulo.trim()) return setError('Indica el nombre del entregable.');
    const repetido = frentes.flatMap(f => f.items).some(i => i[0].trim().toLowerCase() === d.titulo.trim().toLowerCase());
    if (repetido) return setError('Ya existe un entregable con ese nombre en el proyecto.');
    setError('');
    setConfirmar(true);
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      await onAgregar({ frente, titulo: d.titulo.trim(), responsable: d.responsable.trim(), fecha: d.fecha || null, motivo: d.motivo.trim() });
      onCerrar();
    } catch (err) {
      setError(err.message);
      setConfirmar(false);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ padding: '10px 12px', backgroundColor: '#22272f', borderRadius: '8px', display: 'grid', gap: '8px' }}>
      {confirmar ? (
        <div role="alertdialog" aria-label="Confirmar nuevo entregable" style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '12px' }}>¿Agregar «{d.titulo.trim()}» al frente «{frente}»{d.frente === NUEVO_FRENTE ? ' (nuevo)' : ''}?</strong>
          <span style={{ fontSize: '12px' }}>Responsable: {d.responsable.trim() || 'sin responsable'} · Fecha compromiso: {d.fecha ? formatearFecha(d.fecha) : 'sin fecha'} · Estado: Pendiente</span>
          <span style={{ fontSize: '11px', color: '#9aa1ad' }}>Queda en el historial; el avance hacia RTB y las alertas se recalcularán.</span>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar y agregar'}</button>
            <button type="button" style={boton} disabled={guardando} onClick={() => setConfirmar(false)}>Volver</button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); revisar(); }} style={{ display: 'grid', gap: '8px' }}>
          <strong style={{ fontSize: '12px' }}>Nuevo entregable</strong>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end' }}>
            <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad' }}>Frente
              <select name="frente" value={d.frente} onChange={set('frente')} style={campo}>
                {frentes.map(f => <option key={f.nombre} value={f.nombre}>{f.nombre}</option>)}
                <option value={NUEVO_FRENTE}>+ Frente nuevo…</option>
              </select>
            </label>
            {d.frente === NUEVO_FRENTE && (
              <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad' }}>Nombre del frente
                <input name="frente_nuevo" maxLength={100} value={d.frenteNuevo} onChange={set('frenteNuevo')} placeholder="p. ej. Comunidad" style={campo} />
              </label>
            )}
            <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 200px' }}>Entregable
              <input name="titulo" required maxLength={200} value={d.titulo} onChange={set('titulo')} placeholder="p. ej. Convenio con el ejido" style={campo} />
            </label>
            <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad' }}>Responsable
              <input name="responsable" maxLength={200} value={d.responsable} onChange={set('responsable')} style={campo} />
            </label>
            <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad' }}>Fecha compromiso
              <input name="fecha" type="date" value={d.fecha} onChange={set('fecha')} style={{ ...campo, colorScheme: 'dark' }} />
            </label>
            <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#9aa1ad', flex: '1 1 200px' }}>Motivo (opcional)
              <input name="motivo" maxLength={500} value={d.motivo} onChange={set('motivo')} style={campo} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="submit" style={botonPrimario}>Revisar</button>
            <button type="button" style={boton} onClick={onCerrar}>Cancelar</button>
          </div>
        </form>
      )}
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}


// Baja de un entregable con motivo obligatorio
function EliminarEntregable({ titulo, regla, onEliminar, onCerrar }) {
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const eliminar = async () => {
    if (!motivo.trim()) return setError('Escribe el motivo para eliminar el entregable.');
    setGuardando(true);
    try {
      await onEliminar(motivo.trim());
      onCerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div role="alertdialog" aria-label={`Eliminar ${titulo}`} style={{ margin: '0 8px 8px', padding: '10px 12px', backgroundColor: '#2a1d1d', border: '1px solid #5c2b28', borderRadius: '6px', display: 'grid', gap: '6px' }}>
      <strong style={{ fontSize: '12px' }}>¿Eliminar «{titulo}»?</strong>
      <span style={{ fontSize: '11px', color: '#c5c9d0' }}>
        Deja de contar en el avance hacia RTB. Queda registrado en el historial con su motivo.
        {regla && <> <strong style={{ color: '#f0b65a' }}>Lo usa {regla}, que dejará de evaluarse.</strong></>}
      </span>
      <label style={{ display: 'grid', gap: '3px', fontSize: '11px', color: '#f0b65a' }}>Motivo (obligatorio)
        <textarea name="motivo_baja" rows={2} maxLength={500} required value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }} />
      </label>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button type="button" style={{ ...botonPrimario, backgroundColor: '#f2867b' }} disabled={guardando} onClick={eliminar}>{guardando ? 'Eliminando…' : 'Eliminar'}</button>
        <button type="button" style={boton} disabled={guardando} onClick={onCerrar}>Cancelar</button>
      </div>
      {error && <span role="alert" style={{ fontSize: '11px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Sin onCambiarEstado / onDetalleGuardar / onAgregar / onEliminar (lector) el panel es de solo lectura.
// evidencias: Map<deliverableId, documento[]>; null si no se pudieron leer (no se muestra "Sin evidencia" a ciegas).
// evidenciaGarantias: { activas, conDocumento } de la tabla de garantías; es la evidencia del entregable automático.
export default function WorkstreamsPanel({ frentes, onCambiarEstado, onDetalleGuardar, onAgregar, onEliminar, ultimosCambios = new Map(), cargando = false, errorCarga = '', esEjemplo = false, nombreProyecto = '', fechaRtb = null, projectId = null, evidencias = null, puedeEditar = false, onEvidenciasCambio, evidenciaGarantias = null }) {
  const [editandoClave, setEditandoClave] = useState(null);
  const [estadoClave, setEstadoClave] = useState(null);
  const [eliminandoClave, setEliminandoClave] = useState(null);
  const [documentosClave, setDocumentosClave] = useState(null);
  const [agregando, setAgregando] = useState(false);
  const abrirSolo = (cual, clave) => {
    setEditandoClave(cual === 'editar' ? clave : null); setEstadoClave(cual === 'estado' ? clave : null);
    setEliminandoClave(cual === 'eliminar' ? clave : null); setDocumentosClave(cual === 'documentos' ? clave : null);
  };
  const formatDate = (fecha) => (fecha ? formatearFecha(fecha) : 'Sin fecha');

  return (
    <div style={{ backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '20px 24px', display: 'grid', gap: '16px', color: '#e8e6e1', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>
          Frentes de trabajo hacia RTB
          {esEjemplo && <span style={{ marginLeft: '8px', fontSize: '11px', padding: '1px 8px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', fontWeight: 600 }}>Ejemplo</span>}
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: '#9aa1ad' }}>{onCambiarEstado ? 'Toca un estatus para elegir uno nuevo; se confirma antes de guardar' : 'Solo lectura · 📎 para ver los documentos'}</span>
          {onAgregar && !cargando && !errorCarga && (
            <button type="button" style={boton} onClick={() => setAgregando(!agregando)} aria-expanded={agregando}>+ Agregar entregable</button>
          )}
        </div>
      </div>
      {agregando && onAgregar && <AgregarEntregable frentes={frentes} onAgregar={onAgregar} onCerrar={() => setAgregando(false)} />}

      {cargando && <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Cargando entregables…</span>}
      {errorCarga && (
        <div role="alert" style={{ border: '1px solid #f2867b', backgroundColor: '#3d1c1a', borderRadius: '8px', padding: '10px 14px', fontSize: '13px', color: '#f2867b' }}>
          ⚠ {errorCarga}. No se muestran entregables de otro proyecto ni de respaldo.
        </div>
      )}
      {!cargando && !errorCarga && frentes.length === 0 && (
        <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Este proyecto no tiene entregables registrados.</span>
      )}

      <div style={{ display: 'grid', gap: '14px' }}>
        {frentes.map((ws, wsIndex) => {
          const completedCount = (ws.items || []).filter(i => i[1] === 'completo').length;
          const totalCount = ws.items.length;
          const pct = Math.round((completedCount / totalCount) * 100);

          return (
            <div key={wsIndex} style={{ borderTop: wsIndex > 0 ? '1px solid #323843' : 'none', paddingTop: wsIndex > 0 ? '12px' : '0', display: 'grid', gap: '8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 40px', gap: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', fontWeight: '700' }}>{ws.nombre}</span>
                <div style={{ height: '6px', backgroundColor: '#2b313b', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#f0a535' }}></div>
                </div>
                <span style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: '11px', color: '#9aa1ad' }}>{completedCount}/{totalCount}</span>
              </div>

              <div style={{ display: 'grid', gap: '4px' }}>
                {ws.items.map((item, itemIndex) => {
                  const [title, status, owner, dueDate, meta] = item;
                  const styleCfg = STATUS_STYLES[status] || STATUS_STYLES.pendiente;
                  const automatico = Boolean(meta?.auto);

                  const clave = meta?.id ?? `${wsIndex}-${itemIndex}`;
                  const editando = editandoClave === clave;
                  const eligiendoEstado = estadoClave === clave;
                  const eliminando = eliminandoClave === clave;
                  const ultimo = meta?.id ? ultimosCambios.get(meta.id) : null;
                  const documentos = meta?.id && evidencias ? (evidencias.get(meta.id) ?? []) : [];
                  // Entregable automático de garantías: su evidencia son los documentos de las garantías activas
                  const sinEvidencia = automatico
                    ? Boolean(evidenciaGarantias) && !garantiasRespaldadas(evidenciaGarantias)
                    : Boolean(evidencias) && documentos.length === 0;
                  const viendoDocumentos = documentosClave === clave;
                  const editableEstado = !automatico && meta?.id && onCambiarEstado;

                  return (
                    <div key={clave}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '10px', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', backgroundColor: editando ? '#22272f' : 'transparent' }}>
                      <div>
                        <div style={{ fontSize: '13px' }}>{title}</div>
                        <div style={{ fontSize: '11px', color: '#9aa1ad' }}>
                          {owner || 'Sin responsable'}
                          {meta?.id && onDetalleGuardar && !editando && (
                            <button type="button" onClick={() => abrirSolo('editar', clave)} aria-label={`Editar fecha y responsable de ${title}`}
                              style={{ marginLeft: '8px', padding: 0, border: 'none', background: 'none', color: '#8fb0e0', fontSize: '11px', cursor: 'pointer' }}>
                              Editar
                            </button>
                          )}
                          {automatico && evidenciaGarantias && (
                            <a href="#tabla-garantias" title="Póliza o carta de crédito de cada garantía activa, en la tabla de garantías"
                              style={{ marginLeft: '8px', color: garantiasRespaldadas(evidenciaGarantias) ? '#8fb0e0' : '#9aa1ad', fontSize: '11px' }}>
                              📎 {textoEvidenciaGarantias(evidenciaGarantias)}
                            </a>
                          )}
                          {meta?.id && evidencias && !automatico && (
                            <button type="button" onClick={() => abrirSolo(viendoDocumentos ? null : 'documentos', clave)} aria-expanded={viendoDocumentos}
                              aria-label={`Documentos de ${title} (${documentos.length})`} title="Documentos de respaldo"
                              style={{ marginLeft: '8px', padding: 0, border: 'none', background: 'none', color: documentos.length ? '#8fb0e0' : '#7d8490', fontSize: '11px', cursor: 'pointer' }}>
                              📎 {documentos.length}
                            </button>
                          )}
                          {status === 'completo' && meta?.id && sinEvidencia && (
                            <span title="Marcado como completo sin documento de respaldo" style={{ marginLeft: '8px', fontSize: '10px', padding: '1px 6px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', fontWeight: 600 }}>Sin evidencia</span>
                          )}
                          {meta?.id && onEliminar && !automatico && !eliminando && (
                            <span style={{ marginLeft: '8px' }}>
                              <MenuAcciones etiqueta={`Más acciones de ${title}`} acciones={[{ texto: 'Eliminar…', peligro: true, onClick: () => abrirSolo('eliminar', clave) }]} />
                            </span>
                          )}
                        </div>
                        {automatico && (
                          <div style={{ fontSize: '11px', color: '#c5c9d0', marginTop: '2px' }}>
                            <span style={{ color: '#8fb0e0', fontWeight: 600 }}>🔒 Automático:</span> {meta.motivo}
                          </div>
                        )}
                        {ultimo && (
                          <div style={{ fontSize: '10.5px', color: '#7d8490', marginTop: '2px' }}>
                            Último cambio: {describirCambio(ultimo)} · {ultimo.usuario || 'usuario desconocido'} · {formatearMomento(ultimo.momento)}
                            {ultimo.tipo === 'correccion' && <span style={{ marginLeft: '6px', color: '#f0b65a', fontWeight: 600 }}>Corrección</span>}
                            {ultimo.motivo && <div style={{ color: '#a9afb9' }}>Motivo: {ultimo.motivo}</div>}
                          </div>
                        )}
                      </div>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#9aa1ad', whiteSpace: 'nowrap' }}>{formatDate(dueDate)}</span>
                      <button
                        type="button"
                        onClick={() => { if (editableEstado) abrirSolo(eligiendoEstado ? null : 'estado', clave); }}
                        disabled={!editableEstado}
                        aria-expanded={editableEstado ? eligiendoEstado : undefined}
                        title={automatico ? 'Se calcula con las garantías del proyecto; no se cambia a mano' : editableEstado ? 'Elegir un nuevo estatus' : 'Solo lectura'}
                        style={{
                          fontSize: '11px',
                          fontWeight: '600',
                          padding: '4px 10px',
                          borderRadius: '999px',
                          border: styleCfg.border || 'none',
                          backgroundColor: styleCfg.bg,
                          color: styleCfg.color,
                          cursor: automatico ? 'not-allowed' : editableEstado ? 'pointer' : 'default',
                          whiteSpace: 'nowrap',
                          minWidth: '84px',
                          textAlign: 'center'
                        }}
                      >
                        {automatico ? '🔒 ' : ''}{STATUS_LABELS[status]}{editableEstado ? ' ▾' : ''}
                      </button>
                    </div>
                    {eligiendoEstado && (
                      <SelectorEstado
                        titulo={title}
                        estado={status}
                        onGuardar={(nuevo, motivo) => onCambiarEstado(wsIndex, itemIndex, nuevo, motivo)}
                        onCerrar={() => setEstadoClave(null)}
                      />
                    )}
                    {editando && (
                      <EditorEntregable
                        titulo={title}
                        fecha={dueDate}
                        responsable={owner}
                        automatico={automatico}
                        otrosTitulos={frentes.flatMap((f) => f.items).map((i) => i[0]).filter((t) => t !== title)}
                        onGuardar={(cambios) => onDetalleGuardar(wsIndex, itemIndex, cambios)}
                        onCerrar={() => setEditandoClave(null)}
                      />
                    )}
                    {viendoDocumentos && (
                      <EvidenciasPanel
                        projectId={projectId}
                        deliverableId={meta.id}
                        titulo={title}
                        documentos={documentos}
                        puedeEditar={puedeEditar}
                        onCambio={(lista) => onEvidenciasCambio?.(meta.id, lista)}
                      />
                    )}
                    {eliminando && (
                      <EliminarEntregable
                        titulo={title}
                        regla={REGLA_POR_CODIGO[codigoEntregable(item)]}
                        onEliminar={(motivo) => onEliminar(wsIndex, itemIndex, motivo)}
                        onCerrar={() => setEliminandoClave(null)}
                      />
                    )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}