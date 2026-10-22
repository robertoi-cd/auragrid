import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from './supabase';
import { datosParaAsesor, MAX_PREGUNTA } from './lib/validaciones';
import { mensajesParaContexto } from './lib/historialChat';
import { cargarHistorial, guardarMensaje, borrarHistorial } from './lib/historialApi';
import { verificarCifras, anexoCifras, fuentesVerificacion, ameritaDescarga } from './lib/verificarCifras';
import { AVISO_LEGAL } from './lib/avisoLegal';
import { textoCupo, mensajeLimite, agotaCupo, mensajeError } from './lib/cupoAsistente';
import { cupoAsistente } from './lib/equipoApi';

// Resultado de comparar las cifras de una respuesta con las del tablero, bajo cada respuesta del asistente
function VerificacionCifras({ texto, cifras }) {
  if (cifras.length === 0) return null;
  const v = verificarCifras(texto, cifras);
  if (v.revisadas === 0) return null;
  const ok = v.noCoinciden.length === 0;
  return (
    <div role="status" style={{ marginTop: '8px', fontSize: '11px', padding: '5px 8px', borderRadius: '6px', backgroundColor: ok ? '#dcfce7' : '#fef3c7', color: ok ? '#166534' : '#92400e' }}>
      {ok
        ? `✓ ${v.revisadas} cifras verificadas: coinciden con el tablero.`
        : `⚠ ${v.noCoinciden.length} de ${v.revisadas} cifras no coinciden con el tablero actual: ${v.noCoinciden.join('; ')}. Usa las del tablero (las descargas incluyen la tabla correcta).`}
    </div>
  );
}

// Markdown seguro para las respuestas del asistente: skipHtml descarta cualquier HTML que venga en el texto
// (no se interpreta ni se ejecuta) y react-markdown neutraliza enlaces javascript:/data: por defecto.
const COMPONENTES_MARKDOWN = {
  // Un enlace cuyo destino se neutralizó (p. ej. javascript:) queda como texto, no como enlace vacío
  a: ({ node, href, children, ...props }) => (href
    ? <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>),
  table: ({ node, ...props }) => <div className="md-tabla"><table {...props} /></div>
};

export function RespuestaMarkdown({ texto }) {
  return (
    <div className="md-asistente">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={COMPONENTES_MARKDOWN}>{texto}</ReactMarkdown>
    </div>
  );
}

// Las librerías de exportación (~1 MB) se cargan solo al pulsar un botón de descarga
const cargarDescarga = async () => (await import('./lib/descargar')).descargarBlob;

// Aviso de que las respuestas las genera una IA: en el chat y en los archivos descargados
const AVISO_IA = 'El asistente es una IA y puede cometer errores. Verifica las cifras con el tablero. No constituye asesoría financiera, legal ni fiscal.';
const AVISO_IA_DESCARGAS = 'Respuesta generada por el asistente de IA de AuraGrid; puede contener errores. Verifica las cifras con el tablero de AuraGrid.';

const URL_PROXY_GEMINI = 'https://vpsikmgnhubkydftahdl.supabase.co/functions/v1/gemini-proxy';


const BIENVENIDA = { role: 'assistant', content: 'Hola. Soy el asistente de AuraGrid especializado en análisis de parques solares PV. ¿En qué puedo ayudarte hoy?', local: true };
const SIN_PROYECTO = 'sin-proyecto';
const VACIA = { mensajes: [], estado: 'lista', error: '' };

// abierto / onCambiarAbierto: panel lateral controlado desde la barra superior (en cualquier página). Sin ellos,
// el botón flotante de siempre. El componente sigue montado al cerrarse: las conversaciones no se pierden.
export default function AiAssistantChat({ proyecto, alertas = [], projectId = null, abierto, onCambiarAbierto }) {
  const controlado = abierto !== undefined;
  const [abiertoInterno, setAbiertoInterno] = useState(false);
  const isOpen = controlado ? abierto : abiertoInterno;
  const setIsOpen = controlado ? (v) => onCambiarAbierto?.(v) : setAbiertoInterno;
  // Conversación por proyecto. Vive aquí durante la sesión (no se pierde al cerrar el panel)
  // y la de cada proyecto se carga de Supabase la primera vez que se usa.
  const [conversaciones, setConversaciones] = useState({});
  const [avisoHistorial, setAvisoHistorial] = useState('');
  const [confirmarBorrado, setConfirmarBorrado] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const clave = projectId ?? SIN_PROYECTO;
  const conversacion = conversaciones[clave] ?? (projectId ? { ...VACIA, estado: 'cargando' } : VACIA);
  const mensajes = conversacion.mensajes;

  const actualizar = (k, cambio) => setConversaciones((prev) => ({ ...prev, [k]: cambio(prev[k] ?? VACIA) }));
  const agregarMensaje = (k, m) => actualizar(k, (c) => ({ ...c, mensajes: [...c.mensajes, m] }));

  // Cupo diario del asistente por proyecto ({ rol, limite, restantes, motivo, reinicia }); lo calcula la base.
  // Si no se puede leer, no se muestra contador (el servidor sigue aplicando el límite).
  const [cupos, setCupos] = useState({});
  const cupo = cupos[clave] ?? null;
  // Pasada la hora de reinicio se vuelve a permitir enviar (el servidor decide de nuevo)
  const sinConsultas = Boolean(cupo && cupo.restantes <= 0 && !(cupo.reinicia && Date.now() >= Date.parse(cupo.reinicia)));

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Historial guardado del proyecto: se carga una vez por proyecto y sesión
  useEffect(() => {
    if (!projectId || conversaciones[projectId]) return;
    actualizar(projectId, (c) => ({ ...c, estado: 'cargando' }));
    cargarHistorial(projectId)
      .then((lista) => actualizar(projectId, (c) => ({ mensajes: [...lista, ...c.mensajes], estado: 'lista', error: '' })))
      .catch((err) => actualizar(projectId, (c) => ({ ...c, estado: 'error', error: err.message })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { setConfirmarBorrado(false); setAvisoHistorial(''); }, [projectId]);

  // Vuelve a leer el contador de la base (p. ej. después de un fallo, cuando la consulta se devolvió)
  const releerCupo = (k, pid) => {
    cupoAsistente(pid)
      .then((c) => { if (c) setCupos((prev) => ({ ...prev, [k]: c })); })
      .catch((err) => console.error(err.message));
  };

  // Cupo al abrir el chat (y al cambiar de proyecto con el chat abierto): así el contador refleja el día actual
  useEffect(() => {
    if (!isOpen) return undefined;
    let vigente = true;
    const k = clave;
    cupoAsistente(projectId)
      .then((c) => { if (vigente && c) setCupos((prev) => ({ ...prev, [k]: c })); })
      .catch((err) => console.error(err.message));
    return () => { vigente = false; };
  }, [isOpen, clave, projectId]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [isOpen, mensajes]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || loading || sinConsultas || input.trim().length > MAX_PREGUNTA) return;

    const userMessage = input.trim();
    // Se fija el proyecto al enviar: si el usuario cambia de proyecto mientras espera, la respuesta va al correcto
    const k = clave;
    const pid = projectId;
    const historial = mensajesParaContexto(mensajes);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    agregarMensaje(k, { role: 'user', content: userMessage });
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        throw new Error('Debe iniciar sesión para utilizar el asistente.');
      }

      // La clave de Gemini y las reglas del asesor viven en la Edge Function; aquí viajan la pregunta,
      // los últimos 6 mensajes (para preguntas de seguimiento), las cifras ya calculadas y las alertas
      const response = await fetch(URL_PROXY_GEMINI, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({
          pregunta: userMessage,
          historial,
          projectId: pid,
          ...datosParaAsesor(proyecto, alertas)
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        // Sin respuesta: solo un motivo de cupo deja el contador en 0. Un fallo del servicio de IA (saturado, tiempo
        // agotado…) devolvió la consulta: el contador se vuelve a leer de la base para mostrar el valor real.
        if (agotaCupo(data.motivo)) {
          setCupos((prev) => ({ ...prev, [k]: { ...(prev[k] ?? {}), rol: data.rol ?? prev[k]?.rol ?? null, limite: data.limite ?? prev[k]?.limite ?? 0, restantes: 0, motivo: data.motivo ?? null, reinicia: data.reinicia ?? prev[k]?.reinicia ?? null } }));
        } else {
          releerCupo(k, pid);
        }
        throw new Error(mensajeError(data, !pid));
      }

      if (typeof data.restantes === 'number') {
        setCupos((prev) => ({ ...prev, [k]: { rol: data.rol ?? null, limite: data.limite ?? 0, usadas: (data.limite ?? 0) - data.restantes, restantes: data.restantes, motivo: null, reinicia: data.reinicia ?? null } }));
      }
      const assistantReply = data?.reply || 'Respuesta recibida.';
      agregarMensaje(k, { role: 'assistant', content: assistantReply });

      // Solo se guardan pares completos pregunta-respuesta (si Gemini falla, nada queda a medias)
      if (pid) {
        try {
          await guardarMensaje(pid, 'user', userMessage);
          await guardarMensaje(pid, 'assistant', assistantReply);
        } catch (err) {
          setAvisoHistorial(`${err.message} La conversación sigue disponible mientras no recargues la página.`);
        }
      }
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Detalle del error:', err);

      let errorMsg = err.message;
      if (err.name === 'AbortError') {
        // El servidor contesta antes de este tiempo (45 s de presupuesto); llegar aquí indica un problema de conexión
        errorMsg = 'El servidor no respondió a tiempo. Revisa tu conexión e intenta de nuevo en unos minutos.';
        releerCupo(k, pid);
      }

      agregarMensaje(k, { role: 'assistant', content: `⚠️ ${errorMsg}`, error: true });
    } finally {
      setLoading(false);
    }
  };

  const handleBorrarHistorial = async () => {
    setBorrando(true);
    try {
      await borrarHistorial(projectId);
      actualizar(clave, () => VACIA);
      setConfirmarBorrado(false);
      setAvisoHistorial('');
    } catch (err) {
      setAvisoHistorial(err.message);
    } finally {
      setBorrando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Descargas: la respuesta con su formato (títulos, listas, negritas, tablas) y el plan real de entregables.
  // No hay descarga KML: el proyecto no tiene coordenadas guardadas y no se exportan ubicaciones inventadas.
  const [avisoDescarga, setAvisoDescarga] = useState(null); // { indice, texto, error }
  const nombreArchivo = (sufijo, ext) => `AuraGrid_${(proyecto?.name || 'Proyecto').replace(/[^\p{L}\p{N}]+/gu, '_')}_${sufijo}.${ext}`;
  const titulo = `AuraGrid · ${proyecto?.name || 'Asistente'}`;

  // Datos actuales del tablero que también recibe Gemini: cifras del proyecto y mensajes de las alertas.
  // Las respuestas y las descargas se comparan con ellos.
  const cifrasProyecto = proyecto?.cifras ?? [];
  const cifrasTablero = fuentesVerificacion(cifrasProyecto, alertas);
  // Las descargas llevan el aviso de IA y el aviso legal (los archivos circulan fuera de la app) y, si hay datos, el anexo de cifras
  const conAnexo = (text) => {
    const aviso = `\n\n*${AVISO_IA_DESCARGAS}*\n\n*${AVISO_LEGAL}*`;
    if (cifrasProyecto.length === 0) return `${text}${aviso}`;
    const momento = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date());
    return `${text}${aviso}\n${anexoCifras(cifrasProyecto, verificarCifras(text, cifrasTablero), momento, alertas)}`;
  };

  const descargar = async (indice, accion) => {
    setAvisoDescarga(null);
    try {
      const aviso = await accion();
      if (aviso) setAvisoDescarga({ indice, texto: aviso, error: false });
    } catch (err) {
      console.error('Error al generar la descarga:', err);
      setAvisoDescarga({ indice, texto: 'No se pudo generar el archivo. Intenta de nuevo.', error: true });
    }
  };

  const downloadPDF = async (text) => {
    const [{ jsPDF }, { bloquesMarkdown, crearPdf }] = await Promise.all([import('jspdf'), import('./lib/exportarRespuesta')]);
    crearPdf(new jsPDF(), titulo, bloquesMarkdown(conAnexo(text))).save(nombreArchivo('Respuesta', 'pdf'));
  };

  const downloadExcel = async (text) => {
    const [modExcel, descargarBlob, { bloquesMarkdown, crearLibro }] = await Promise.all([import('exceljs'), cargarDescarga(), import('./lib/exportarRespuesta')]);
    const buffer = await crearLibro(modExcel.default ?? modExcel, bloquesMarkdown(conAnexo(text))).xlsx.writeBuffer();
    descargarBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombreArchivo('Respuesta', 'xlsx'));
  };

  const downloadWord = async (text) => {
    const [docx, descargarBlob, { bloquesMarkdown, crearDocx }] = await Promise.all([import('docx'), cargarDescarga(), import('./lib/exportarRespuesta')]);
    const generado = await docx.Packer.toBlob(crearDocx(docx, titulo, bloquesMarkdown(conAnexo(text))));
    descargarBlob(new Blob([generado], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }), nombreArchivo('Respuesta', 'docx'));
  };

  // El plan de entregables para MS Project se exporta desde el panel "Frentes de trabajo" (no es parte de una respuesta)

  return (
    <div style={controlado
      ? { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(410px, 100vw)', zIndex: 1000, fontFamily: 'sans-serif', display: isOpen ? 'block' : 'none' }
      : { position: 'fixed', bottom: '24px', right: '24px', zIndex: 1000, fontFamily: 'sans-serif' }}>
      {!isOpen ? (controlado ? null : (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '30px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          ⚡ Asistente IA
        </button>
      )) : (
        <div role={controlado ? 'complementary' : undefined} aria-label={controlado ? 'Asistente' : undefined} style={{
          width: controlado ? '100%' : '410px',
          height: controlado ? '100%' : '630px',
          backgroundColor: '#ffffff',
          borderRadius: controlado ? 0 : '12px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #cbd5e1'
        }}>
          {/* Header */}
          <div style={{
            backgroundColor: '#0f172a',
            color: '#ffffff',
            padding: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'grid', gap: '2px' }}>
              <span style={{ fontWeight: '600', fontSize: '15px' }}>AuraGrid AI Assistant</span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {projectId ? `Tu conversación sobre ${proyecto?.name ?? 'este proyecto'}` : 'Sin proyecto: la conversación no se guarda'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {projectId && mensajes.length > 0 && !confirmarBorrado && (
                <button
                  type="button"
                  onClick={() => setConfirmarBorrado(true)}
                  style={{ background: 'none', border: '1px solid #475569', borderRadius: '6px', color: '#cbd5e1', fontSize: '11px', padding: '3px 8px', cursor: 'pointer' }}
                >
                  Borrar historial
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Cerrar asistente (la conversación se conserva)"
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '18px', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
          </div>

          {confirmarBorrado && (
            <div role="alertdialog" aria-label="Confirmar borrado del historial" style={{ backgroundColor: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '10px 14px', display: 'grid', gap: '6px' }}>
              <strong style={{ fontSize: '13px', color: '#991b1b' }}>¿Borrar el historial de este proyecto?</strong>
              <span style={{ fontSize: '12px', color: '#7f1d1d' }}>
                Se eliminarán tus {mensajes.filter((m) => !m.error).length} mensajes guardados de {proyecto?.name ?? 'este proyecto'}. No se puede deshacer.
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" disabled={borrando} onClick={handleBorrarHistorial}
                  style={{ backgroundColor: '#b91c1c', color: '#fff', border: 'none', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                  {borrando ? 'Borrando…' : 'Confirmar y borrar'}
                </button>
                <button type="button" disabled={borrando} onClick={() => setConfirmarBorrado(false)}
                  style={{ backgroundColor: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '5px 10px', fontSize: '12px', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {avisoHistorial && (
            <div role="status" style={{ backgroundColor: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '6px 14px', fontSize: '12px', color: '#92400e' }}>
              ⚠ {avisoHistorial}
            </div>
          )}

          {/* Mensajes */}
          <div style={{
            flex: 1,
            padding: '16px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: '#f8fafc'
          }}>
            {conversacion.estado === 'cargando' && (
              <span style={{ alignSelf: 'center', fontSize: '12px', color: '#64748b' }}>Cargando consultas anteriores…</span>
            )}
            {conversacion.estado === 'error' && (
              <span role="alert" style={{ alignSelf: 'center', fontSize: '12px', color: '#b45309' }}>
                ⚠ {conversacion.error}. Puedes seguir preguntando; si tampoco se pueden guardar los mensajes nuevos, te avisaré.
              </span>
            )}
            {[BIENVENIDA, ...mensajes].map((msg, index) => (
              <div
                key={msg.id ?? index}
                style={{
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  maxWidth: '90%',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  lineHeight: '1.4',
                  backgroundColor: msg.role === 'user' ? '#2563eb' : '#ffffff',
                  color: msg.role === 'user' ? '#ffffff' : '#0f172a',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  whiteSpace: msg.role === 'user' ? 'pre-wrap' : 'normal',
                  wordBreak: 'break-word'
                }}
              >
                {msg.role === 'assistant' ? <RespuestaMarkdown texto={msg.content} /> : <div>{msg.content}</div>}

                {msg.role === 'assistant' && !msg.local && !msg.error && ameritaDescarga(msg.content) && (
                  <div style={{
                    marginTop: '10px',
                    paddingTop: '8px',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    gap: '5px',
                    flexWrap: 'wrap'
                  }}>
                    <button
                      type="button"
                      onClick={() => descargar(index, () => downloadPDF(msg.content))}
                      style={{ fontSize: '11px', padding: '4px 7px', backgroundColor: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      📥 PDF
                    </button>
                    <button
                      type="button"
                      onClick={() => descargar(index, () => downloadExcel(msg.content))}
                      style={{ fontSize: '11px', padding: '4px 7px', backgroundColor: '#dcfce7', color: '#166534', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      📊 Excel
                    </button>
                    <button
                      type="button"
                      onClick={() => descargar(index, () => downloadWord(msg.content))}
                      style={{ fontSize: '11px', padding: '4px 7px', backgroundColor: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      📝 Word
                    </button>
                  </div>
                )}
                {msg.role === 'assistant' && !msg.local && !msg.error && (
                  <VerificacionCifras texto={msg.content} cifras={cifrasTablero} />
                )}
                {avisoDescarga?.indice === index && (
                  <div role={avisoDescarga.error ? 'alert' : 'status'} style={{ marginTop: '6px', fontSize: '11px', color: avisoDescarga.error ? '#991b1b' : '#475569' }}>
                    {avisoDescarga.texto}
                  </div>
                )}
              </div>
            ))}
            
            {loading && (
              <div style={{
                alignSelf: 'flex-start',
                backgroundColor: '#ffffff',
                padding: '12px 16px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                display: 'flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span className="dot" style={{ animationDelay: '0s' }} />
                <span className="dot" style={{ animationDelay: '0.2s' }} />
                <span className="dot" style={{ animationDelay: '0.4s' }} />
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <style>{`
            .dot {
              width: 7px;
              height: 7px;
              background-color: #94a3b8;
              border-radius: 50%;
              display: inline-block;
              animation: bounce 1.4s infinite ease-in-out both;
            }
            @keyframes bounce {
              0%, 80%, 100% { transform: scale(0); }
              40% { transform: scale(1.0); }
            }
            /* Respuestas en Markdown (el reset de index.html quita márgenes y viñetas) */
            .md-asistente > * + * { margin-top: 8px; }
            .md-asistente h1, .md-asistente h2, .md-asistente h3, .md-asistente h4 { font-weight: 700; line-height: 1.3; }
            .md-asistente h1 { font-size: 16px; }
            .md-asistente h2 { font-size: 15px; }
            .md-asistente h3, .md-asistente h4 { font-size: 14px; }
            .md-asistente strong { font-weight: 700; }
            .md-asistente em { font-style: italic; }
            .md-asistente ul, .md-asistente ol { padding-left: 20px; }
            .md-asistente ul { list-style: disc; }
            .md-asistente ol { list-style: decimal; }
            .md-asistente li + li { margin-top: 4px; }
            .md-asistente li > ul, .md-asistente li > ol { margin-top: 4px; }
            .md-asistente a { color: #2563eb; text-decoration: underline; }
            .md-asistente code { font-family: ui-monospace, monospace; font-size: 12px; background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
            .md-asistente pre { background: #f1f5f9; padding: 8px 10px; border-radius: 6px; overflow-x: auto; }
            .md-asistente pre code { padding: 0; background: none; }
            .md-asistente blockquote { border-left: 3px solid #cbd5e1; padding-left: 10px; color: #475569; }
            .md-asistente hr { border-top: 1px solid #e2e8f0; }
            .md-tabla { overflow-x: auto; }
            .md-asistente table { border-collapse: collapse; font-size: 12px; }
            .md-asistente th, .md-asistente td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
            .md-asistente th { background: #f8fafc; font-weight: 700; }
          `}</style>

          {/* Contenedor inferior */}
          <div style={{
            backgroundColor: '#ffffff',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'flex-end',
              padding: '10px 12px 6px 12px',
              gap: '8px'
            }}>
              <textarea
                id="pregunta-asistente"
                name="pregunta"
                aria-label="Pregunta para el asistente"
                ref={textareaRef}
                rows={1}
                value={input}
                maxLength={MAX_PREGUNTA}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_PREGUNTA))}
                onKeyDown={handleKeyDown}
                placeholder="¿En qué te puedo ayudar?"
                aria-describedby="contador-pregunta"
                style={{
                  flex: 1,
                  minHeight: '20px',
                  maxHeight: '120px',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  outline: 'none',
                  fontSize: '13px',
                  color: '#000000',
                  resize: 'none',
                  fontFamily: 'inherit',
                  lineHeight: '1.4',
                  boxSizing: 'border-box'
                }}
              />
              <button
                onClick={handleSend}
                disabled={loading || sinConsultas}
                style={{
                  backgroundColor: sinConsultas ? '#94a3b8' : '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 16px',
                  fontWeight: '600',
                  cursor: sinConsultas ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                Enviar
              </button>
            </div>

            {cupo && (
              <div role="status" style={{ padding: '0 12px 4px 12px', fontSize: '11px', fontWeight: 600, color: sinConsultas ? '#b91c1c' : cupo.rol !== 'dueno' && cupo.restantes <= 1 ? '#b45309' : '#475569' }}>
                {sinConsultas ? mensajeLimite(cupo.motivo, cupo.reinicia, new Date(), !projectId) : textoCupo(cupo)}
              </div>
            )}
            <div style={{ padding: '0 12px 8px 12px', display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
              <span style={{ fontSize: '11px', color: '#64748b', userSelect: 'none' }}>
                {AVISO_IA}
              </span>
              <span
                id="contador-pregunta"
                style={{ fontSize: '11px', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: input.length >= MAX_PREGUNTA ? '#b91c1c' : input.length > MAX_PREGUNTA * 0.9 ? '#b45309' : '#64748b', fontWeight: input.length >= MAX_PREGUNTA ? 600 : 400 }}
              >
                {input.length >= MAX_PREGUNTA
                  ? `Límite de ${MAX_PREGUNTA.toLocaleString('es-MX')} caracteres`
                  : `${input.length.toLocaleString('es-MX')} / ${MAX_PREGUNTA.toLocaleString('es-MX')}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
