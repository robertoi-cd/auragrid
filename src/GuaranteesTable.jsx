import React, { Fragment, useState } from 'react';
import {
  estadoGarantia, sumarDias, referenciaGarantia, describirReferencia, categoriaGarantia, categoriaSugerida, vigenciaPorDefecto,
  CATEGORIAS_GARANTIA, VIGENCIAS_REQUERIDAS, NOTA_GARANTIA_INTERCONEXION, MARGEN_GARANTIAS_DEFAULT
} from './lib/validaciones';
import { formatearMoneda, formatearFecha } from './lib/formato';
import { ESTADOS_GARANTIA, MAX_GARANTIA, actualizarGarantia, registrarRenovacion, guardarMargenGarantias, agregarGarantia, eliminarGarantia } from './lib/garantiasApi';
import MenuAcciones from './MenuAcciones';
import EvidenciasPanel from './EvidenciasPanel';

const MARGEN_MAXIMO = 365;
const TIPOS_SUGERIDOS = ['Fianza', 'Carta de crédito', 'Garantía bancaria', 'Seguro de caución'];
const NUEVA_VACIA = { tipo: '', beneficiario: '', emisor: '', concepto: '', categoria: null, monto: '', vence: '', estado: 'vigente', vigenciaRequerida: null, vigenciaFecha: '' };

// "Qué garantiza": categoría fija de la garantía; de ella sale la vigencia requerida sugerida (no del nombre)
function CampoCategoria({ id, valor, sugerida, onChange }) {
  return (
    <label style={etiquetaCampo}>Qué garantiza
      <select id={`${id}-categoria`} name="categoria" value={valor} onChange={(e) => onChange(e.target.value)} style={campo}>
        {Object.entries(CATEGORIAS_GARANTIA).map(([v, t]) => <option key={v} value={v}>{t}{sugerida && v === sugerida ? ' (sugerida por el texto)' : ''}</option>)}
      </select>
    </label>
  );
}

// Nombre (concepto), tipo y beneficiario: obligatorios y con largo máximo
function problemaDeNombres(b) {
  for (const [k, texto] of [['concepto', 'el nombre'], ['tipo', 'el tipo'], ['beneficiario', 'el beneficiario']]) {
    const v = (b[k] ?? '').trim();
    if (!v) return `Indica ${texto} de la garantía.`;
    if (v.length > MAX_GARANTIA[k]) return `${texto.charAt(3).toUpperCase()}${texto.slice(4)} admite hasta ${MAX_GARANTIA[k]} caracteres.`;
  }
  return null;
}

// "Vigencia requerida hasta": hito del proyecto o fecha específica. `sugerida` es la de su tipo (se marca así).
function CampoVigencia({ id, valor, fecha, sugerida, onChange }) {
  return (
    <>
      <label style={etiquetaCampo}>Vigencia requerida hasta
        <select id={`${id}-vigencia`} name="vigencia_requerida" value={valor} onChange={(e) => onChange({ vigenciaRequerida: e.target.value, vigenciaFecha: fecha })} style={campo}>
          {Object.entries(VIGENCIAS_REQUERIDAS).map(([v, t]) => <option key={v} value={v}>{t}{v === sugerida ? ' (sugerida por lo que garantiza)' : ''}</option>)}
        </select>
      </label>
      {valor === 'fecha' && (
        <label style={etiquetaCampo}>Fecha requerida
          <input id={`${id}-vigencia-fecha`} name="vigencia_fecha" type="date" required value={fecha ?? ''} onChange={(e) => onChange({ vigenciaRequerida: valor, vigenciaFecha: e.target.value })} style={{ ...campo, colorScheme: 'dark' }} />
        </label>
      )}
    </>
  );
}

const textoVigencia = (v, fecha) => (v === 'fecha' ? `${VIGENCIAS_REQUERIDAS.fecha} (${formatearFecha(fecha)})` : VIGENCIAS_REQUERIDAS[v]);

// Alta de una garantía con confirmación antes de guardar (RLS: solo en proyectos propios)
function AgregarGarantia({ projectId, onAgregada }) {
  const [paso, setPaso] = useState(null); // null | 'formulario' | 'confirmar'
  const [g, setG] = useState(NUEVA_VACIA);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setG({ ...g, [k]: e.target.value });
  // Mientras no se elijan, la categoría sigue a la sugerida por el texto y la vigencia a la de esa categoría
  const categoria = g.categoria ?? categoriaSugerida(g);
  const sugerida = vigenciaPorDefecto({ ...g, categoria });
  const vigencia = g.vigenciaRequerida ?? sugerida;

  const revisar = () => {
    const monto = Number(g.monto);
    const problema = problemaDeNombres(g);
    if (problema) { setError(problema); return; }
    if (!g.emisor.trim()) { setError('Indica el emisor.'); return; }
    if (!Number.isFinite(monto) || monto <= 0) { setError('El monto debe ser mayor que cero.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.vence)) { setError('Indica la fecha de vencimiento.'); return; }
    if (vigencia === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(g.vigenciaFecha ?? '')) { setError('Indica la fecha hasta la que debe estar vigente.'); return; }
    setError('');
    setPaso('confirmar');
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      const nueva = await agregarGarantia(projectId, {
        tipo: g.tipo.trim(), beneficiario: g.beneficiario.trim(), emisor: g.emisor.trim(), concepto: g.concepto.trim(), categoria,
        monto: Number(g.monto), vence: g.vence, estado: g.estado, vigenciaRequerida: vigencia, vigenciaFecha: g.vigenciaFecha || null
      });
      onAgregada?.(nueva);
      setG(NUEVA_VACIA);
      setPaso(null);
    } catch (err) {
      setError(err.message);
      setPaso('formulario');
    } finally {
      setGuardando(false);
    }
  };

  if (!paso) {
    return <button type="button" style={{ ...botonPrimario, justifySelf: 'start' }} onClick={() => { setError(''); setPaso('formulario'); }}>+ Agregar garantía</button>;
  }
  return (
    <div style={{ backgroundColor: '#22272f', border: '1px solid #323843', borderRadius: '8px', padding: '12px 14px', display: 'grid', gap: '10px' }}>
      {paso === 'formulario' ? (
        <form onSubmit={(e) => { e.preventDefault(); revisar(); }} style={{ display: 'grid', gap: '10px' }}>
          <strong style={{ fontSize: '13px' }}>Nueva garantía</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <label style={etiquetaCampo}>Nombre
              <input id="nueva-garantia-concepto" name="concepto" required maxLength={MAX_GARANTIA.concepto} value={g.concepto} onChange={set('concepto')} placeholder="p. ej. Garantía de interconexión" style={campo} />
            </label>
            <label style={etiquetaCampo}>Tipo
              <input id="nueva-garantia-tipo" name="tipo" list="tipos-garantia" required maxLength={MAX_GARANTIA.tipo} value={g.tipo} onChange={set('tipo')} style={campo} />
              <datalist id="tipos-garantia">{TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>
            </label>
            <label style={etiquetaCampo}>Beneficiario
              <input id="nueva-garantia-beneficiario" name="beneficiario" required maxLength={MAX_GARANTIA.beneficiario} value={g.beneficiario} onChange={set('beneficiario')} placeholder="p. ej. CENACE" style={campo} />
            </label>
            <label style={etiquetaCampo}>Emisor
              <input id="nueva-garantia-emisor" name="emisor" required maxLength={200} value={g.emisor} onChange={set('emisor')} placeholder="Afianzadora o banco" style={campo} />
            </label>
            <label style={etiquetaCampo}>Monto (USD)
              <input id="nueva-garantia-monto" name="monto" type="number" min="1" step="1" required value={g.monto} onChange={set('monto')} style={campo} />
            </label>
            <label style={etiquetaCampo}>Vencimiento
              <input id="nueva-garantia-vence" name="vence" type="date" required value={g.vence} onChange={set('vence')} style={{ ...campo, colorScheme: 'dark' }} />
            </label>
            <label style={etiquetaCampo}>Estado
              <select id="nueva-garantia-estado" name="estado" value={g.estado} onChange={set('estado')} style={campo}>
                {Object.entries(ESTADOS_GARANTIA).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <CampoCategoria id="nueva-garantia" valor={categoria} sugerida={categoriaSugerida(g)} onChange={(c) => setG({ ...g, categoria: c })} />
            <CampoVigencia id="nueva-garantia" valor={vigencia} fecha={g.vigenciaFecha} sugerida={sugerida}
              onChange={(cambio) => setG({ ...g, ...cambio })} />
          </div>
          {categoria === 'interconexion' && <span style={notaInterconexion}>{NOTA_GARANTIA_INTERCONEXION}.</span>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="submit" style={botonPrimario}>Revisar</button>
            <button type="button" style={botonSecundario} onClick={() => setPaso(null)}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div role="alertdialog" aria-label="Confirmar nueva garantía" style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '13px' }}>¿Registrar esta garantía?</strong>
          <span style={{ fontSize: '12px' }}><strong>{g.concepto}</strong> · {g.tipo} · {g.beneficiario} · {CATEGORIAS_GARANTIA[categoria]}</span>
          <span style={{ fontSize: '12px' }}>Emisor: {g.emisor} · Monto: <strong>{formatearMoneda(Number(g.monto))}</strong></span>
          <span style={{ fontSize: '12px' }}>Vence: <strong>{formatearFecha(g.vence)}</strong> · Estado: {ESTADOS_GARANTIA[g.estado]}</span>
          <span style={{ fontSize: '12px' }}>Vigencia requerida hasta: <strong>{textoVigencia(vigencia, g.vigenciaFecha)}</strong></span>
          <span style={{ fontSize: '12px', color: '#9aa1ad' }}>Las alertas y el entregable "Garantías con la vigencia requerida" se recalcularán al guardar.</span>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            <button type="button" style={botonSecundario} disabled={guardando} onClick={() => setPaso('formulario')}>Volver</button>
          </div>
        </div>
      )}
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

// Margen después del RTB, editable por proyecto con confirmación antes de guardar
function ControlMargen({ projectId, fechaRtb, margen, onGuardado }) {
  const [paso, setPaso] = useState(null); // null | 'editar' | 'confirmar'
  const [valor, setValor] = useState(String(margen));
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const nuevo = Number(valor);

  const revisar = () => {
    if (!Number.isInteger(nuevo) || nuevo < 0 || nuevo > MARGEN_MAXIMO) { setError(`Indica un número entero de días entre 0 y ${MARGEN_MAXIMO}.`); return; }
    if (nuevo === margen) { setError('El margen no cambió.'); return; }
    setError('');
    setPaso('confirmar');
  };
  const guardar = async () => {
    setGuardando(true);
    try {
      onGuardado?.(await guardarMargenGarantias(projectId, nuevo));
      setPaso(null);
    } catch (err) {
      setError(err.message);
      setPaso('editar');
    } finally {
      setGuardando(false);
    }
  };

  const texto = { fontSize: '12px', color: '#9aa1ad' };
  if (!paso) {
    return (
      <div style={{ ...texto, display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span>
          Cada garantía se valida contra su «vigencia requerida hasta» (por defecto: interconexión CENACE → COD; cumplimiento EPC → fin de construcción; las demás → RTB).
          Si vence antes de esa fecha + <strong style={{ color: '#e8e6e1' }}>{margen} días</strong> de margen, requiere prórroga: informativa si faltan más de 90 días para que venza, advertencia de 30 a 90 y crítica a menos de 30 o vencida.
          Si la cubre con menos de 30 días de holgura, advertencia. Para el RTB basta con que sigan vigentes al RTB + margen.
        </span>
        {projectId && (
          <button type="button" style={{ ...botonSecundario, padding: '2px 8px', fontSize: '11px' }} onClick={() => { setValor(String(margen)); setError(''); setPaso('editar'); }}>
            Cambiar margen
          </button>
        )}
      </div>
    );
  }
  return (
    <div style={{ backgroundColor: '#22272f', border: '1px solid #323843', borderRadius: '8px', padding: '10px 12px', display: 'grid', gap: '8px' }}>
      {paso === 'editar' ? (
        <form onSubmit={(e) => { e.preventDefault(); revisar(); }} style={{ display: 'flex', gap: '8px', alignItems: 'end', flexWrap: 'wrap' }}>
          <label style={etiquetaCampo}>Margen después de la fecha de referencia (días)
            <input id="margen-garantias" name="margen_garantias_dias" type="number" min="0" max={MARGEN_MAXIMO} step="1" required value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...campo, width: '120px' }} />
          </label>
          <button type="submit" style={botonPrimario}>Revisar cambios</button>
          <button type="button" style={botonSecundario} onClick={() => setPaso(null)}>Cancelar</button>
        </form>
      ) : (
        <div role="alertdialog" aria-label="Confirmar margen" style={{ display: 'grid', gap: '8px' }}>
          <strong style={{ fontSize: '13px' }}>¿Guardar el nuevo margen?</strong>
          <span style={{ fontSize: '12px' }}>
            <span style={{ color: '#9aa1ad' }}>Margen:</span> {margen} días → <strong>{nuevo} días</strong>
            {' '}(las garantías deberán vencer más de {nuevo} días después de su fecha de referencia; p. ej. RTB + {nuevo} días = {formatearFecha(sumarDias(fechaRtb, nuevo))}).
          </span>
          <span style={texto}>Las alertas y el entregable "Garantías con la vigencia requerida" se recalcularán al guardar.</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Confirmar y guardar'}</button>
            <button type="button" style={botonSecundario} disabled={guardando} onClick={() => setPaso('editar')}>Volver</button>
          </div>
        </div>
      )}
      {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
    </div>
  );
}

const BADGES = {
  critico: { bg: '#3d1c1a', color: '#f2867b' },
  advertencia: { bg: '#3a2c12', color: '#f0b65a' },
  info: { bg: '#16263a', color: '#8fb0e0' },
  vigente: { bg: '#163327', color: '#5cc596' }
};

const celda = { padding: '10px 8px', verticalAlign: 'top' };
const campo = { width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: '#22272f', color: '#e8e6e1', fontSize: '13px' };
const etiquetaCampo = { display: 'grid', gap: '4px', fontSize: '11px', color: '#9aa1ad', fontWeight: 600 };
const notaInterconexion = { fontSize: '11px', color: '#f0b65a', fontStyle: 'italic' };
const botonSecundario = { padding: '5px 10px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '12px', cursor: 'pointer' };
const botonPrimario = { padding: '6px 12px', borderRadius: '6px', border: 'none', backgroundColor: '#f0a535', color: '#1c2028', fontSize: '12px', fontWeight: 700, cursor: 'pointer' };

const diaSiguiente = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

// Valida el borrador de edición; devuelve el mensaje de error o null.
// Alargar el vencimiento es una renovación: debe registrarse como tal (historial y estado "Vigente").
function validarEdicion(b, g) {
  const problema = problemaDeNombres(b);
  if (problema) return problema;
  const monto = Number(b.monto);
  if (!Number.isFinite(monto) || monto <= 0) return 'El monto debe ser mayor que cero.';
  if (!b.emisor.trim()) return 'El emisor es obligatorio.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.vence)) return 'Indica una fecha de vencimiento válida.';
  if (b.vigenciaRequerida === 'fecha' && !/^\d{4}-\d{2}-\d{2}$/.test(b.vigenciaFecha ?? '')) return 'Indica la fecha hasta la que debe estar vigente.';
  if (g && b.vence > g.vence) return 'Para extender el vencimiento usa «Registrar renovación»: queda en el historial y la garantía pasa a «Vigente». Aquí solo puedes corregir la fecha hacia atrás.';
  return null;
}

function cambiosDeEdicion(g, b) {
  const cambios = [];
  if (b.concepto.trim() !== g.concepto) cambios.push(['Nombre', g.concepto || '—', b.concepto.trim()]);
  if (b.tipo.trim() !== g.tipo) cambios.push(['Tipo', g.tipo, b.tipo.trim()]);
  if (b.beneficiario.trim() !== g.beneficiario) cambios.push(['Beneficiario', g.beneficiario, b.beneficiario.trim()]);
  if (b.categoria !== categoriaGarantia(g)) cambios.push(['Qué garantiza', CATEGORIAS_GARANTIA[categoriaGarantia(g)], CATEGORIAS_GARANTIA[b.categoria]]);
  if (Number(b.monto) !== g.monto) cambios.push(['Monto', formatearMoneda(g.monto), formatearMoneda(Number(b.monto))]);
  if (b.emisor.trim() !== g.emisor) cambios.push(['Emisor', g.emisor, b.emisor.trim()]);
  if (b.vence !== g.vence) cambios.push(['Vencimiento', formatearFecha(g.vence), formatearFecha(b.vence)]);
  if (b.estado !== g.estado) cambios.push(['Estado', ESTADOS_GARANTIA[g.estado], ESTADOS_GARANTIA[b.estado]]);
  const antes = g.vigenciaRequerida ?? vigenciaPorDefecto(g);
  if (b.vigenciaRequerida !== antes || (b.vigenciaRequerida === 'fecha' && b.vigenciaFecha !== g.vigenciaFecha)) {
    cambios.push(['Vigencia requerida hasta', textoVigencia(antes, g.vigenciaFecha), textoVigencia(b.vigenciaRequerida, b.vigenciaFecha)]);
  }
  return cambios;
}

export default function GuaranteesTable({
  garantias = [], alertas = [], cargando = false, errorCarga = '', onGuardada,
  projectId, fechaRtb, fechasClave = null, margen = MARGEN_GARANTIAS_DEFAULT, onMargenGuardado, onAgregada, onEliminada, puedeEditar = true,
  // Documentos de cada garantía: Map<guaranteeId, documento[]> (null si no se pudieron leer) y su vigencia
  // (evidenciaGarantias().porGarantia); al subir o eliminar, onEvidenciasCambio(guaranteeId, lista)
  evidencias = null, estadoDocumentos = null, onEvidenciasCambio
}) {
  // Fecha contra la que se valida cada garantía: su "vigencia requerida hasta" (por defecto según su tipo)
  const referencias = fechaRtb
    ? garantias.map(g => referenciaGarantia(g, { ...(fechasClave ?? { ntp: null, finInterconexion: null, cod: null, finConstruccion: null, estimadas: false }), rtb: fechaRtb }, margen))
    : null;
  // modo: { id, accion: 'editar' | 'renovar' | 'historial' | 'eliminar' | 'documentos', paso: 'formulario' | 'confirmar' }
  const [modo, setModo] = useState(null);
  const [borrador, setBorrador] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');

  const abrir = (g, accion) => {
    setError('');
    setAviso('');
    if (modo?.id === g.id && modo.accion === accion) { setModo(null); return; }
    setModo({ id: g.id, accion, paso: 'formulario' });
    setBorrador(accion === 'editar'
      ? {
        concepto: g.concepto, tipo: g.tipo, beneficiario: g.beneficiario, categoria: categoriaGarantia(g),
        monto: String(g.monto), emisor: g.emisor, vence: g.vence, estado: g.estado, vigenciaRequerida: g.vigenciaRequerida ?? vigenciaPorDefecto(g), vigenciaFecha: g.vigenciaFecha ?? ''
      }
      : accion === 'eliminar' ? { motivo: '' } : { nuevaFecha: '' });
  };
  const cerrar = () => { setModo(null); setBorrador(null); setError(''); };

  const revisar = (g) => {
    const problema = modo.accion === 'editar'
      ? validarEdicion(borrador, g) || (cambiosDeEdicion(g, borrador).length === 0 ? 'No hay cambios que guardar.' : null)
      : (!borrador.nuevaFecha ? 'Indica la nueva fecha de vencimiento.'
        : borrador.nuevaFecha <= g.vence ? `La nueva fecha debe ser posterior al ${formatearFecha(g.vence)}.` : null);
    if (problema) { setError(problema); return; }
    setError('');
    setModo({ ...modo, paso: 'confirmar' });
  };

  const eliminar = async (g) => {
    if (!borrador?.motivo?.trim()) { setError('Escribe el motivo para eliminar la garantía.'); return; }
    setGuardando(true);
    setError('');
    try {
      await eliminarGarantia(g.id, borrador.motivo.trim());
      onEliminada?.(g.id);
      setAviso(`Garantía "${g.tipo} ${g.beneficiario}" eliminada.`);
      cerrar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const guardar = async (g) => {
    setGuardando(true);
    setError('');
    try {
      const actualizada = modo.accion === 'editar'
        ? await actualizarGarantia(g.id, {
          concepto: borrador.concepto.trim(), tipo: borrador.tipo.trim(), beneficiario: borrador.beneficiario.trim(), categoria: borrador.categoria,
          monto: Number(borrador.monto), emisor: borrador.emisor.trim(), vence: borrador.vence, estado: borrador.estado,
          vigenciaRequerida: borrador.vigenciaRequerida, vigenciaFecha: borrador.vigenciaFecha || null
        })
        : await registrarRenovacion(g.id, borrador.nuevaFecha);
      onGuardada?.(actualizada);
      setAviso(modo.accion === 'editar'
        ? `Garantía "${g.tipo} ${g.beneficiario}" actualizada.`
        : `Renovación registrada: vence el ${formatearFecha(actualizada.vence)}.`);
      cerrar();
    } catch (err) {
      setError(err.message);
      setModo({ ...modo, paso: 'formulario' });
    } finally {
      setGuardando(false);
    }
  };

  const panel = (g) => {
    if (modo.accion === 'documentos') {
      const estado = estadoDocumentos?.get(g.id);
      return (
        <EvidenciasPanel
          projectId={projectId}
          guaranteeId={g.id}
          titulo={`${g.tipo} · ${g.beneficiario}`}
          documentos={evidencias?.get(g.id) ?? []}
          puedeEditar={puedeEditar}
          aviso={estado?.anteriorARenovacion ? 'Los documentos son anteriores a la última renovación: sube el endoso o la póliza renovada.' : ''}
          onCambio={(lista) => onEvidenciasCambio?.(g.id, lista)}
        />
      );
    }
    if (modo.accion === 'eliminar') {
      return (
        <div role="alertdialog" aria-label="Eliminar garantía" style={{ display: 'grid', gap: '8px' }}>
          <strong style={{ fontSize: '13px' }}>¿Eliminar «{g.tipo} · {g.beneficiario}»?</strong>
          <span style={{ fontSize: '12px', color: '#c5c9d0' }}>
            Se borra de forma definitiva{g.renovaciones?.length ? `, junto con su historial de ${g.renovaciones.length} ${g.renovaciones.length === 1 ? 'renovación' : 'renovaciones'}` : ''}. Úsalo solo si se capturó por error. Queda registrada en el historial con sus datos y el motivo.
          </span>
          <span style={{ fontSize: '12px', color: '#f0b65a' }}>
            Si la garantía ya terminó o se devolvió, mejor márcala como «Liberada» en Editar: deja de generar alertas y se conserva el registro.
          </span>
          <label style={{ display: 'grid', gap: '3px', fontSize: '12px', color: '#f0b65a' }}>Motivo (obligatorio)
            <textarea name="motivo_baja_garantia" rows={2} maxLength={500} required value={borrador?.motivo ?? ''}
              onChange={(e) => setBorrador({ ...borrador, motivo: e.target.value })} style={{ ...campo, resize: 'vertical', fontFamily: 'inherit' }} />
          </label>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={{ ...botonPrimario, backgroundColor: '#f2867b' }} disabled={guardando} onClick={() => eliminar(g)}>{guardando ? 'Eliminando…' : 'Eliminar definitivamente'}</button>
            <button type="button" style={botonSecundario} disabled={guardando} onClick={() => abrir(g, 'editar')}>Marcar como liberada</button>
            <button type="button" style={botonSecundario} disabled={guardando} onClick={cerrar}>Cancelar</button>
          </div>
        </div>
      );
    }
    if (modo.accion === 'historial') {
      return (
        <div style={{ display: 'grid', gap: '6px' }}>
          <strong style={{ fontSize: '12px' }}>Historial de renovaciones</strong>
          {g.renovaciones.length === 0
            ? <span style={{ fontSize: '12px', color: '#9aa1ad' }}>Esta garantía no se ha renovado.</span>
            : g.renovaciones.map(r => (
              <span key={r.id} style={{ fontSize: '12px', color: '#c5c9d0' }}>
                {formatearFecha(r.renovado_en.slice(0, 10))}: vencimiento {formatearFecha(r.vence_anterior)} → {formatearFecha(r.vence_nueva)}
              </span>
            ))}
        </div>
      );
    }

    if (modo.paso === 'confirmar') {
      const filas = modo.accion === 'editar'
        ? cambiosDeEdicion(g, borrador)
        : [['Vencimiento', formatearFecha(g.vence), formatearFecha(borrador.nuevaFecha)], ['Estado', ESTADOS_GARANTIA[g.estado], ESTADOS_GARANTIA.vigente]];
      return (
        <div role="alertdialog" aria-label="Confirmar cambios" style={{ display: 'grid', gap: '10px' }}>
          <strong style={{ fontSize: '13px' }}>
            {modo.accion === 'editar' ? '¿Guardar estos cambios?' : '¿Registrar esta renovación?'}
          </strong>
          <div style={{ display: 'grid', gap: '4px' }}>
            {filas.map(([campoNombre, antes, despues]) => (
              <span key={campoNombre} style={{ fontSize: '12px' }}>
                <span style={{ color: '#9aa1ad' }}>{campoNombre}:</span> {antes} → <strong>{despues}</strong>
              </span>
            ))}
          </div>
          {modo.accion === 'renovar' && (
            <span style={{ fontSize: '12px', color: '#9aa1ad' }}>
              El vencimiento anterior ({formatearFecha(g.vence)}) quedará en el historial.
            </span>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" style={botonPrimario} disabled={guardando} onClick={() => guardar(g)}>
              {guardando ? 'Guardando…' : 'Confirmar y guardar'}
            </button>
            <button type="button" style={botonSecundario} disabled={guardando} onClick={() => setModo({ ...modo, paso: 'formulario' })}>
              Volver
            </button>
          </div>
        </div>
      );
    }

    const set = (k) => (e) => setBorrador({ ...borrador, [k]: e.target.value });
    return (
      <form onSubmit={(e) => { e.preventDefault(); revisar(g); }} style={{ display: 'grid', gap: '10px' }}>
        {modo.accion === 'editar' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
            <label style={etiquetaCampo}>Nombre
              <input id={`${g.id}-concepto`} name="concepto" type="text" required maxLength={MAX_GARANTIA.concepto} value={borrador.concepto} onChange={set('concepto')} style={campo} />
            </label>
            <label style={etiquetaCampo}>Tipo
              <input id={`${g.id}-tipo`} name="tipo" type="text" list="tipos-garantia-edicion" required maxLength={MAX_GARANTIA.tipo} value={borrador.tipo} onChange={set('tipo')} style={campo} />
              <datalist id="tipos-garantia-edicion">{TIPOS_SUGERIDOS.map(t => <option key={t} value={t} />)}</datalist>
            </label>
            <label style={etiquetaCampo}>Beneficiario
              <input id={`${g.id}-beneficiario`} name="beneficiario" type="text" required maxLength={MAX_GARANTIA.beneficiario} value={borrador.beneficiario} onChange={set('beneficiario')} style={campo} />
            </label>
            <CampoCategoria id={g.id} valor={borrador.categoria} onChange={(c) => setBorrador({ ...borrador, categoria: c })} />
            <label style={etiquetaCampo}>Monto (USD)
              <input id={`${g.id}-monto`} name="monto" type="number" min="1" step="1" required value={borrador.monto} onChange={set('monto')} style={campo} />
            </label>
            <label style={etiquetaCampo}>Emisor
              <input id={`${g.id}-emisor`} name="emisor" type="text" required maxLength={200} value={borrador.emisor} onChange={set('emisor')} style={campo} />
            </label>
            <label style={etiquetaCampo}>Vencimiento
              <input id={`${g.id}-vence`} name="vence" type="date" required max={g.vence} value={borrador.vence} onChange={set('vence')} style={{ ...campo, colorScheme: 'dark' }} />
            </label>
            <label style={etiquetaCampo}>Estado
              <select id={`${g.id}-estado`} name="estado" value={borrador.estado} onChange={set('estado')} style={campo}>
                {Object.entries(ESTADOS_GARANTIA).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
              </select>
            </label>
            <CampoVigencia id={g.id} valor={borrador.vigenciaRequerida} fecha={borrador.vigenciaFecha} sugerida={vigenciaPorDefecto({ ...g, categoria: borrador.categoria })}
              onChange={(cambio) => setBorrador({ ...borrador, ...cambio })} />
            {/* Si cambia lo que garantiza, se propone la vigencia de esa categoría; el usuario decide si la usa */}
            {borrador.categoria !== categoriaGarantia(g) && borrador.vigenciaRequerida !== vigenciaPorDefecto({ ...g, categoria: borrador.categoria }) && (
              <span style={{ gridColumn: '1 / -1', fontSize: '12px', color: '#f0b65a' }}>
                Para «{CATEGORIAS_GARANTIA[borrador.categoria]}» la vigencia sugerida es «{VIGENCIAS_REQUERIDAS[vigenciaPorDefecto({ ...g, categoria: borrador.categoria })]}».{' '}
                <button type="button" style={{ ...botonSecundario, padding: '2px 8px', fontSize: '11px' }}
                  onClick={() => setBorrador({ ...borrador, vigenciaRequerida: vigenciaPorDefecto({ ...g, categoria: borrador.categoria }) })}>
                  Usar la sugerida
                </button>
              </span>
            )}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '6px', maxWidth: '280px' }}>
            <span style={{ fontSize: '12px', color: '#9aa1ad' }}>Vencimiento actual: <strong style={{ color: '#e8e6e1' }}>{formatearFecha(g.vence)}</strong></span>
            <label style={etiquetaCampo}>Nuevo vencimiento
              <input id={`${g.id}-nueva-fecha`} name="nuevaFecha" type="date" required min={diaSiguiente(g.vence)} value={borrador.nuevaFecha} onChange={set('nuevaFecha')} style={{ ...campo, colorScheme: 'dark' }} />
            </label>
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="submit" style={botonPrimario}>Revisar cambios</button>
          <button type="button" style={botonSecundario} onClick={cerrar}>Cancelar</button>
        </div>
      </form>
    );
  };

  return (
    <div id="tabla-garantias" style={{ backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '20px 24px', display: 'grid', gap: '14px', alignSelf: 'start', alignContent: 'start', color: '#e8e6e1', fontFamily: 'sans-serif', scrollMarginTop: '16px' }}>
      <div style={{ display: 'grid', gap: '6px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700' }}>Control de Garantías (CENACE / Proveedores)</h2>
        {fechaRtb && <ControlMargen key={projectId} projectId={puedeEditar ? projectId : null} fechaRtb={fechaRtb} margen={margen} onGuardado={onMargenGuardado} />}
      </div>

      {/* Arriba, para que se vea sin recorrer la tabla. No se ofrece mientras carga o si no se pudieron leer
          (evitaría duplicados o datos incompletos) */}
      {projectId && puedeEditar && !cargando && !errorCarga && <AgregarGarantia key={projectId} projectId={projectId} onAgregada={onAgregada} />}

      {aviso && <div role="status" style={{ fontSize: '12px', color: '#5cc596' }}>{aviso}</div>}
      {errorCarga && (
        <div role="alert" style={{ border: '1px solid #f2867b', backgroundColor: '#3d1c1a', borderRadius: '8px', padding: '12px 14px', display: 'grid', gap: '4px' }}>
          <strong style={{ fontSize: '14px', color: '#f2867b' }}>⚠ {errorCarga}</strong>
          <span style={{ fontSize: '12px', color: '#e8e6e1' }}>
            No se pudieron leer las garantías de este proyecto, así que sus alertas (vencimientos antes del RTB) no están incluidas en el conteo de riesgos.
          </span>
        </div>
      )}

      {cargando ? (
        <span style={{ fontSize: '13px', color: '#9aa1ad' }}>Cargando garantías…</span>
      ) : garantias.length === 0 ? (
        !errorCarga && (
          <span style={{ fontSize: '13px', color: '#f2867b' }}>
            Este proyecto no tiene garantías registradas. Agrégalas para que el entregable "Garantías con la vigencia requerida" pueda completarse.
          </span>
        )
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #323843', textAlign: 'left', color: '#9aa1ad', fontSize: '11px', textTransform: 'uppercase' }}>
                <th style={{ padding: '8px' }}>Garantía</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Monto</th>
                <th style={{ padding: '8px' }}>Vencimiento</th>
                <th style={{ padding: '8px' }}>Estado / Riesgo</th>
              </tr>
            </thead>
            <tbody>
              {garantias.map((g, idx) => {
                // Estado dentro de la alerta agrupada de garantías de validarProyecto() (mismo índice que el arreglo que recibió)
                const riesgo = estadoGarantia(alertas, idx);
                const badge = BADGES[riesgo.nivel];
                const abierta = modo?.id === g.id;

                return (
                  <Fragment key={g.id ?? idx}>
                    <tr style={{ borderBottom: abierta ? 'none' : '1px solid #323843' }}>
                      <td style={celda}>
                        <div style={{ fontWeight: '600' }}>{g.concepto || `${g.tipo} · ${g.beneficiario}`}</div>
                        <div style={{ fontSize: '11px', color: '#9aa1ad' }}>{g.tipo} · {g.beneficiario}</div>
                        <div style={{ fontSize: '11px', color: '#9aa1ad' }}>Emisor: {g.emisor}</div>
                        {g.id && evidencias && (() => {
                          const n = evidencias.get(g.id)?.length ?? 0;
                          const estado = estadoDocumentos?.get(g.id);
                          const activa = g.estado !== 'liberada';
                          return (
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginTop: '4px' }}>
                              <button type="button" onClick={() => abrir(g, 'documentos')} aria-expanded={abierta && modo.accion === 'documentos'}
                                aria-label={`Documentos de ${g.tipo} ${g.beneficiario} (${n})`} title="Póliza, carta de crédito o endoso"
                                style={{ padding: 0, border: 'none', background: 'none', color: n ? '#8fb0e0' : '#7d8490', fontSize: '11px', cursor: 'pointer', fontFamily: 'sans-serif' }}>
                                📎 {n}
                              </button>
                              {activa && !estado?.vigente && (
                                <span title={estado?.anteriorARenovacion ? 'El documento es anterior a la última renovación' : 'Sin póliza ni carta de crédito adjunta'}
                                  style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '999px', backgroundColor: '#3a2c12', color: '#f0b65a', fontWeight: 600 }}>
                                  {estado?.anteriorARenovacion ? 'Documento anterior a la renovación' : 'Sin documento'}
                                </span>
                              )}
                            </div>
                          );
                        })()}
                        {g.id && puedeEditar && (
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                            <button type="button" style={botonSecundario} onClick={() => abrir(g, 'editar')} aria-expanded={abierta && modo.accion === 'editar'}>Editar</button>
                            <button type="button" style={botonSecundario} onClick={() => abrir(g, 'renovar')} aria-expanded={abierta && modo.accion === 'renovar'}>Registrar renovación</button>
                            <MenuAcciones etiqueta={`Más acciones de ${g.tipo} ${g.beneficiario}`} acciones={[{ texto: 'Eliminar…', peligro: true, onClick: () => abrir(g, 'eliminar') }]} />
                          </div>
                        )}
                      </td>
                      <td style={{ ...celda, textAlign: 'right', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{formatearMoneda(g.monto)}</td>
                      <td style={{ ...celda, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        {formatearFecha(g.vence)}
                        {referencias && (
                          <div style={{ fontFamily: 'sans-serif', fontSize: '11px', color: '#9aa1ad', whiteSpace: 'normal', marginTop: '2px', maxWidth: '240px' }}
                            title={`Garantía de ${CATEGORIAS_GARANTIA[referencias[idx].categoria].toLowerCase()}`}>
                            <div>Vigencia requerida hasta: <span style={{ color: '#e8e6e1' }}>{textoVigencia(referencias[idx].vigencia, g.vigenciaFecha)}</span>{referencias[idx].porDefecto ? ' (según su tipo)' : ''}</div>
                            <div>Se valida contra: {describirReferencia(referencias[idx], margen)}</div>
                            {referencias[idx].categoria === 'interconexion' && <div style={notaInterconexion}>{NOTA_GARANTIA_INTERCONEXION}.</div>}
                          </div>
                        )}
                        {g.renovaciones?.length > 0 && (
                          <button type="button" onClick={() => abrir(g, 'historial')} style={{ display: 'block', marginTop: '2px', padding: 0, border: 'none', background: 'none', color: '#8fb0e0', fontSize: '11px', cursor: 'pointer', fontFamily: 'sans-serif' }}>
                            {g.renovaciones.length} {g.renovaciones.length === 1 ? 'renovación' : 'renovaciones'}
                          </button>
                        )}
                      </td>
                      <td style={celda}>
                        <div style={{ fontSize: '12px', marginBottom: '6px', whiteSpace: 'nowrap' }}>{ESTADOS_GARANTIA[g.estado] ?? '—'}</div>
                        <span style={{ fontSize: '11px', fontWeight: '600', padding: '3px 8px', borderRadius: '999px', backgroundColor: badge.bg, color: badge.color, whiteSpace: 'nowrap' }}>
                          {riesgo.etiqueta}
                        </span>
                      </td>
                    </tr>
                    {abierta && (
                      <tr style={{ borderBottom: '1px solid #323843' }}>
                        <td colSpan={4} style={{ padding: '4px 8px 14px' }}>
                          <div style={{ backgroundColor: '#22272f', border: '1px solid #323843', borderRadius: '8px', padding: '12px 14px', display: 'grid', gap: '8px' }}>
                            {panel(g)}
                            {error && <span role="alert" style={{ fontSize: '12px', color: '#f2867b' }}>{error}</span>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
