import React, { useState } from 'react';
import { supabase } from './supabase';
import { formatearMoneda } from './lib/formato';
import { crearSupuestosIniciales } from './lib/supuestosApi';
import { crearEntregablesIniciales } from './lib/entregablesApi';
import { segurosEstimados, SEGUROS_ESTIMADOS_PCT_CAPEX } from './lib/rentabilidad';
// Valores sugeridos (con su fuente) en lib/fuentesSupuestos.ts: aquí no hay cifras fijas
import {
  ESTADOS_MEXICO, recursoSolar, produccionEspecifica, ETIQUETA_PROMEDIO_ESTATAL, ETIQUETA_POR_CONFIRMAR,
  PERFILES_INTERCONEXION, FUENTES_PROYECTO_NUEVO, ETIQUETA_ILUSTRATIVO,
  capexReferencia, interconexionReferencia, opexReferencia, arrendamientoReferencia,
} from './lib/fuentesSupuestos';

// solar_projects.id es texto sin valor por defecto y único en toda la tabla. El sufijo aleatorio evita
// que dos usuarios con el mismo nombre y capacidad choquen (y que el error revele el proyecto ajeno).
const crearIdProyecto = (nombre, capacidad) => {
  const slug = nombre
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const sufijo = crypto.randomUUID().slice(0, 6);
  return `${slug || 'proyecto'}-${String(capacidad).replace('.', '-')}mw-${sufijo}`;
};

// Rango aceptado para la producción específica capturada (kWh/kWp·año con estructura fija)
const PRODUCCION_MIN = 800;
const PRODUCCION_MAX = 2600;

// GHI y producción específica del estado elegido, con su etiqueta de fuente
function RecursoDelEstado({ estado }) {
  const r = recursoSolar(estado);
  const texto = { display: 'block', marginTop: '3px', fontSize: '11px' };
  if (!r || r.ghi == null || r.pvout == null) return <span style={{ ...texto, color: '#b45309' }}>{ETIQUETA_POR_CONFIRMAR}: sin dato de recurso solar para este estado.</span>;
  return (
    <span style={{ ...texto, color: '#64748b' }} title={`Rango entre los ${r.puntos} puntos muestreados: ${r.ghiMin.toFixed(2)}–${r.ghiMax.toFixed(2)} kWh/m²/día`}>
      GHI {r.ghi.toFixed(2)} kWh/m²/día · {r.pvout.toLocaleString('en-US')} kWh/kWp · <span style={{ color: '#b45309' }}>{ETIQUETA_PROMEDIO_ESTATAL}</span> (Global Solar Atlas)
    </span>
  );
}

export default function NewProjectModal({ isOpen, onClose, onProjectCreated }) {
  const [name, setName] = useState('');
  // Estado y RTB los elige el usuario (sin valores precargados que parezcan del proyecto)
  const [state, setState] = useState('');
  const [fechaRtb, setFechaRtb] = useState('');
  // Datos de ejemplo solo si se piden explícitamente; el proyecto queda marcado como "Ejemplo"
  const [conEjemplo, setConEjemplo] = useState(false);
  const [capacityMw, setCapacityMw] = useState(50);
  const [profileKey, setProfileKey] = useState('standard');

  // Campos totalmente editables por el usuario con valores iniciales sugeridos (paramétricos por MW)
  const [distanceKm, setDistanceKm] = useState(10);
  const [interconnectionCost, setInterconnectionCost] = useState(() => interconexionReferencia('standard'));
  const [opexAnnual, setOpexAnnual] = useState(() => opexReferencia(50));
  const [landLease, setLandLease] = useState(() => arrendamientoReferencia(50));
  // Seguros: estimado sobre el CAPEX (se actualiza solo) hasta que el usuario capture su cotización
  const [seguros, setSeguros] = useState(null); // null = usar el estimado
  // Producción específica (kWh/kWp) de un estudio de recurso o PVsyst; vacía = promedio estatal de Global Solar Atlas
  const [produccion, setProduccion] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const segurosSugeridos = segurosEstimados(capexReferencia(capacityMw, state, interconnectionCost));
  const segurosValor = seguros ?? segurosSugeridos;

  // Función para rellenar con los valores recomendados según el perfil y capacidad seleccionados
  const handleApplyOptimal = (newProfileKey = profileKey, newCapacity = capacityMw) => {
    setProfileKey(newProfileKey);
    setDistanceKm(PERFILES_INTERCONEXION[newProfileKey].km);
    setInterconnectionCost(interconexionReferencia(newProfileKey));
    setOpexAnnual(opexReferencia(newCapacity));
    setLandLease(arrendamientoReferencia(newCapacity));
    setSeguros(null);
  };

  const handleProfileChange = (e) => {
    const key = e.target.value;
    setProfileKey(key);
    setDistanceKm(PERFILES_INTERCONEXION[key].km);
    setInterconnectionCost(interconexionReferencia(key));
  };

  const handleCapacityChange = (e) => {
    const val = e.target.value;
    setCapacityMw(val);
    // Sugerencia proporcional de OPEX y Land Lease al cambiar capacidad
    setOpexAnnual(opexReferencia(val));
    setLandLease(arrendamientoReferencia(val));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');
    try {
      const numericCapacity = parseFloat(capacityMw) || 50;

      // CAPEX total (generación por región + interconexión editable). El equity no se fija aquí: lo calcula
      // la app con la deuda esculpida y los supuestos financieros.
      const totalCapexNum = capexReferencia(numericCapacity, state, interconnectionCost);
      const segurosNum = parseFloat(segurosValor);
      if (!Number.isFinite(segurosNum) || segurosNum < 0) { setError('Revisa el valor de los seguros.'); setLoading(false); return; }
      const produccionNum = produccion.trim() === '' ? null : parseFloat(produccion);
      if (produccionNum != null && !(produccionNum >= PRODUCCION_MIN && produccionNum <= PRODUCCION_MAX)) {
        setError(`La producción específica debe estar entre ${PRODUCCION_MIN} y ${PRODUCCION_MAX} kWh/kWp.`); setLoading(false); return;
      }

      const formattedCapex = formatearMoneda(Math.round(totalCapexNum));

      const newProjectPayload = {
        id: crearIdProyecto(name.trim(), numericCapacity),
        name: name.trim(),
        state: state,
        capacity_mw: numericCapacity,
        capex: formattedCapex,
        // Columnas obligatorias heredadas: el equity y la TIR se calculan en la app con los supuestos
        equity_required: 'N/D',
        tir: 'N/D',
        interconnection_cost: parseFloat(interconnectionCost),
        opex_annual: parseFloat(opexAnnual),
        land_lease_cost: parseFloat(landLease),
        transmission_distance_km: parseFloat(distanceKm),
        fecha_rtb: fechaRtb,
        es_ejemplo: conEjemplo,
        is_archived: false
      };

      const { data, error } = await supabase
        .from('solar_projects')
        .insert([newProjectPayload])
        .select()
        .single();

      if (error) throw error;

      // Entregables: plantilla vacía (todo pendiente, sin fechas) o, si se pidió, el ejemplo marcado
      await crearEntregablesIniciales(data.id, conEjemplo);
      // Supuestos financieros iniciales (valores por defecto + OPEX, arrendamiento y seguros capturados aquí)
      // Producción específica: la capturada (dato del usuario) o el promedio estatal de Global Solar Atlas
      await crearSupuestosIniciales(data.id, {
        opexAnual: parseFloat(opexAnnual), arrendamientoAnual: parseFloat(landLease), segurosAnual: segurosNum,
        rendimientoFijaKwhKwp: produccionEspecifica(state, produccionNum).valor,
      });

      onProjectCreated({
        id: data.id,
        name: data.name,
        state: data.state,
        capacityMw: data.capacity_mw,
        capex: data.capex,
        interconnectionCost: data.interconnection_cost,
        opexAnnual: data.opex_annual,
        landLease: data.land_lease_cost,
        distanceKm: data.transmission_distance_km
      });

      setName('');
      setCapacityMw(50);
      handleApplyOptimal('standard', 50);
      setState('');
      setFechaRtb('');
      setConEjemplo(false);
      setSeguros(null);
      setProduccion('');
      onClose();
    } catch (err) {
      console.error('Error al registrar proyecto bancario:', err.message);
      setError(err.message?.startsWith('El proyecto se creó') ? err.message : 'No se pudo registrar el parque solar. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
      <div style={{ backgroundColor: '#ffffff', padding: 'clamp(16px, 4vw, 25px) clamp(16px, 4vw, 30px)', borderRadius: '12px', width: '540px', maxWidth: 'calc(100% - 32px)', boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontFamily: 'sans-serif' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ margin: 0, color: '#0f172a', fontSize: '18px' }}>Nuevo Parque Solar • Control Total</h2>
          <button type="button" onClick={() => handleApplyOptimal()} style={{ backgroundColor: '#f1f5f9', color: '#2563eb', border: '1px solid #cbd5e1', padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer' }}>
            Restaurar valores sugeridos
          </button>
        </div>
        <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#64748b' }}>
          Modifica libremente cualquier parámetro financiero o de interconexión CFE según tus requerimientos.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label htmlFor="np-nombre" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Nombre del Parque Solar</label>
            <input id="np-nombre" name="nombre" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Central Solar Altiplano" required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label htmlFor="np-estado" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Estado (Ubicación)</label>
              <select id="np-estado" name="estado" required value={state} onChange={(e) => setState(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}>
                <option value="" disabled>Selecciona el estado…</option>
                {ESTADOS_MEXICO.map((st) => (
                  <option key={st} value={st}>{st}{recursoSolar(st)?.ghi != null ? ` (GHI ${recursoSolar(st).ghi.toFixed(2)})` : ' (GHI por confirmar)'}</option>
                ))}
              </select>
              {state && <RecursoDelEstado estado={state} />}
            </div>
            <div>
              <label htmlFor="np-capacidad" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Capacidad (MW)</label>
              <input id="np-capacidad" name="capacidad_mw" type="number" min="5" max="1000" value={capacityMw} onChange={handleCapacityChange} required style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
            </div>
          </div>

          <div>
            <label htmlFor="np-fecha-rtb" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>RTB objetivo</label>
            <input id="np-fecha-rtb" name="fecha_rtb" type="date" required value={fechaRtb} onChange={(e) => setFechaRtb(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box' }} />
          </div>

          <label htmlFor="np-ejemplo" style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: '#334155', backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '8px 10px' }}>
            <input id="np-ejemplo" name="con_ejemplo" type="checkbox" checked={conEjemplo} onChange={(e) => setConEjemplo(e.target.checked)} style={{ marginTop: '2px' }} />
            <span>
              <strong>Crear con datos de ejemplo</strong> (estados, fechas y cronograma de caja ilustrativos del caso Alpha I).
              El proyecto quedará marcado como <strong>«Ejemplo»</strong>. Sin marcar: todos los entregables en «Pendiente», sin fechas ni montos.
            </span>
          </label>

          <div>
            <label htmlFor="np-perfil" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Perfil Base de Interconexión CFE (Referencia)</label>
            <select id="np-perfil" name="perfil_interconexion" value={profileKey} onChange={handleProfileChange} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', backgroundColor: '#fff', boxSizing: 'border-box' }}>
              {Object.keys(PERFILES_INTERCONEXION).map((key) => (
                <option key={key} value={key}>{PERFILES_INTERCONEXION[key].label}</option>
              ))}
            </select>
          </div>

          {/* CAMPOS 100% EDITABLES PARA EL USUARIO */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div>
              <label htmlFor="np-distancia" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Distancia POI (km)</label>
              <input id="np-distancia" name="distancia_km" type="number" step="0.1" value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
            </div>
            <div>
              <label htmlFor="np-costo-interconexion" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Costo Interconexión (USD)</label>
              <input id="np-costo-interconexion" name="costo_interconexion" type="number" step="1000" value={interconnectionCost} onChange={(e) => setInterconnectionCost(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
            </div>
            <div>
              <label htmlFor="np-opex" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>OPEX Anual (USD/año)</label>
              <input id="np-opex" name="opex_anual" type="number" step="1000" value={opexAnnual} onChange={(e) => setOpexAnnual(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
            </div>
            <div>
              <label htmlFor="np-land-lease" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Land Lease (USD/año)</label>
              <input id="np-land-lease" name="land_lease" type="number" step="1000" value={landLease} onChange={(e) => setLandLease(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="np-seguros" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Seguros (USD/año)</label>
              <input id="np-seguros" name="seguros_anual" type="number" min="0" step="1000" value={segurosValor} onChange={(e) => setSeguros(e.target.value)} required style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
              <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: seguros == null ? '#b45309' : '#64748b' }}>
                {seguros == null
                  ? `Estimado: ${SEGUROS_ESTIMADOS_PCT_CAPEX} % del CAPEX (${formatearMoneda(segurosSugeridos)}/año); se ajusta con capacidad, estado e interconexión. Reemplázalo con la cotización de la aseguradora.`
                  : <>Valor capturado. <button type="button" onClick={() => setSeguros(null)} style={{ padding: 0, border: 'none', background: 'none', color: '#2563eb', fontSize: '11px', cursor: 'pointer' }}>Usar el estimado ({formatearMoneda(segurosSugeridos)})</button></>}
              </span>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="np-produccion" style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: '#334155', marginBottom: '3px' }}>Producción específica (kWh/kWp) · opcional</label>
              <input id="np-produccion" name="produccion_especifica" type="number" min={PRODUCCION_MIN} max={PRODUCCION_MAX} step="1" value={produccion}
                placeholder={state && recursoSolar(state)?.pvout ? `Promedio estatal: ${recursoSolar(state).pvout.toLocaleString('en-US')}` : 'Del estudio de recurso o PVsyst'}
                onChange={(e) => setProduccion(e.target.value)} style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', boxSizing: 'border-box', backgroundColor: '#fff' }} />
              <span style={{ display: 'block', marginTop: '3px', fontSize: '11px', color: produccion.trim() ? '#64748b' : '#b45309' }}>
                {produccion.trim()
                  ? 'Dato del usuario: reemplaza al promedio estatal en el cálculo de producción (estructura fija; los seguidores suman su ganancia).'
                  : `Si lo capturas (estudio de recurso o PVsyst), reemplaza al promedio estatal y se marca como dato del usuario. Sin captura se usa: ${produccionEspecifica(state, null).valor.toLocaleString('en-US')} kWh/kWp (${produccionEspecifica(state, null).etiqueta.toLowerCase()}).`}
              </span>
            </div>
          </div>

          <details style={{ fontSize: '11px', color: '#64748b' }}>
            <summary style={{ cursor: 'pointer', color: '#b45309', fontWeight: '600' }}>Valores sugeridos · {ETIQUETA_ILUSTRATIVO}</summary>
            <ul style={{ margin: '6px 0 0 16px', listStyle: 'disc', display: 'grid', gap: '3px' }}>
              {Object.values(FUENTES_PROYECTO_NUEVO).map((t) => <li key={t}>{t}</li>)}
            </ul>
          </details>

          {error && (
            <p role="alert" style={{ margin: 0, padding: '8px 10px', borderRadius: '6px', backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '12px' }}>{error}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button type="button" onClick={() => { setError(''); onClose(); }} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ backgroundColor: '#2563eb', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>{loading ? 'Calculando...' : 'Crear Proyecto'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}