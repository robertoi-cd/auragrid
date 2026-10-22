import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Routes, Route, Navigate, Link, useMatch, useNavigate, useLocation } from 'react-router-dom';
import { supabase, tipoEnlaceInicial } from './supabase';
import DefinirContrasena from './DefinirContrasena';
import { validarProyecto, diasEntre, hoyISO, aplicarEntregablesAutomaticos, calcularCoberturaGarantias, calcularAvance, situacionRtb, referenciaGarantia, describirReferencia, MARGEN_GARANTIAS_DEFAULT, esEntregableGarantias, DIAS_VENCIDO_CRITICO } from './lib/validaciones';
import { cargarGarantias } from './lib/garantiasApi';
import { cargarEntregables, actualizarEstadoEntregable, actualizarDetalleEntregable, agregarEntregable, eliminarEntregable } from './lib/entregablesApi';
import { cargarHistorialCambios } from './lib/historialCambiosApi';
import { ultimoCambioPorEntregable } from './lib/historialCambios';
import { cargarMovimientos } from './lib/cronogramaApi';
import { crearModeloFinanciero, calendarioPagos, fechasClave } from './lib/modeloFinanciero';
import { compararEstructuras, compararDepreciacion, calcularSensibilidad, problemasDepreciacion, ESTRUCTURAS, CRITERIOS_DEUDA, PRECIO_PPA_MAXIMO_BUSQUEDA } from './lib/rentabilidad';
import { ETIQUETA_ILUSTRATIVO, origenProduccion } from './lib/fuentesSupuestos';
import { cargarSupuestos } from './lib/supuestosApi';
import { cargarCreditos } from './lib/creditosApi';
import { descripcionCreditos, financiamientoIndicativo } from './lib/creditos';
import { formatearMoneda, formatearFecha, formatearCapacidad, formatearPorcentaje, formatearNumero, formatearDscr, formatearTir } from './lib/formato';
import Login from './Login';
import FinancialDashboard from './FinancialDashboard';
import ConstructionTimeline from './ConstructionTimeline';
import AdvisorAlerts from './AdvisorAlerts';
import AiAssistantChat from './AiAssistantChat';
import NewProjectModal from './NewProjectModal';
import EditarProyectoModal from './EditarProyectoModal';
import RtbStatusBar from './RtbStatusBar';
import WorkstreamsPanel from './WorkstreamsPanel';
import GuaranteesTable from './GuaranteesTable';
import HistorialCambios from './HistorialCambios';
import OportunidadesOptimizacion from './OportunidadesOptimizacion';
import { detectarOportunidades } from './lib/oportunidades';
import { AVISO_LEGAL } from './lib/avisoLegal';
import { BannerPrueba, EnlacesLegales, PaginaLegal } from './VersionPrueba';
import { DOCUMENTOS_LEGALES } from './lib/textosLegales';
import { cargarEvidencias, cargarEvidenciasGarantias } from './lib/archivosApi';
import { rolesCompartidos, registrarAcceso, registrarExportacion } from './lib/equipoApi';
import { resumenEvidencia, textoEvidencia, evidenciaGarantias as calcularEvidenciaGarantias } from './lib/evidencia';
import EquipoModal from './EquipoModal';
import { puedeCrearProyectos } from './lib/permisos';
import { analizarProyecto } from './lib/analisisProyecto';
import { contarAlertas } from './lib/validaciones';
import { usePortafolio } from './hooks/usePortafolio';
import { proyectoDeRuta, contextoAsistente } from './lib/contextoAsistente';
import BarraSuperior from './layout/BarraSuperior';
import MenuLateral from './layout/MenuLateral';
import Inicio from './paginas/Inicio';
import Resumen from './paginas/Resumen';
import ProyectoRuta, { IrAResumen } from './paginas/ProyectoRuta';
import NoEncontrada from './paginas/NoEncontrada';
import LimiteDeError from './LimiteDeError';
import { tituloPestana } from './lib/titulos';
import { MODULOS, modulosVisibles, moduloDisponible, nombreModulo, cambiosDelModulo } from './lib/modulos';
import Hitos from './paginas/Hitos';
import LineaTiempo from './paginas/LineaTiempo';
import Documentos from './paginas/Documentos';
import Configuracion, { SinAccesoConfiguracion } from './paginas/Configuracion';
import ExportarMsProject from './ExportarMsProject';
import TarjetaIva from './TarjetaIva';
import { eliminarProyectoDefinitivo } from './lib/eliminarProyecto';
import EstadosFinancieros from './EstadosFinancieros';
import PestanasFinanzas, { vistaFinanzas } from './PestanasFinanzas';
import { criticasPorModulo, moduloDeAlerta } from './lib/portafolio';


const TEXTO_ESTADO_IA = { pendiente: 'pendiente', curso: 'en curso', bloqueado: 'bloqueado', completo: 'completo' };

// Situación del RTB proyectado en texto para el asistente (misma regla que la barra de RTB)
function textoSituacionIA(s, avance) {
  const bloqueados = avance.bloqueadosEnRiesgo.map(b => b.titulo).join(', ');
  if (s.tipo === 'atraso') return `: ${s.dias} días de atraso contra el RTB objetivo${s.bloqueados ? `; además hay bloqueados antes del RTB: ${bloqueados}` : ''}`;
  if (s.tipo === 'en_riesgo') return `: EN RIESGO, no a tiempo: ${s.bloqueados} entregable(s) bloqueado(s) con fecha anterior o igual al RTB objetivo (${bloqueados})`;
  if (s.tipo === 'a_tiempo') return ': a tiempo para el RTB objetivo';
  return '';
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  // Estados para la gestión dinámica de proyectos solares desde Supabase
  const [projects, setProjects] = useState([]);
  const [archivedProjects, setArchivedProjects] = useState([]);
  const [project, setProject] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [cargaInicialHecha, setCargaInicialHecha] = useState(false);

  // Menú secundario, confirmación de archivo y avisos dentro de la página
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [confirmarArchivo, setConfirmarArchivo] = useState(false);
  const [editarProyectoAbierto, setEditarProyectoAbierto] = useState(false);
  const [equipoAbierto, setEquipoAbierto] = useState(false);
  // Enlace de invitación o de recuperación: con sesión, pero falta definir la contraseña
  const [definirContrasena, setDefinirContrasena] = useState(['invite', 'recovery'].includes(tipoEnlaceInicial) ? tipoEnlaceInicial : null);
  const [archivando, setArchivando] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);

  // Navegación: el proyecto activo sale de la URL (/proyectos/:id/…), no de un estado aparte
  const ubicacion = useLocation();
  const navegar = useNavigate();
  const coincidencia = useMatch('/proyectos/:id/*');
  const idRuta = coincidencia?.params.id ?? null;
  const moduloRuta = useMatch('/proyectos/:id/:modulo/*')?.params.modulo ?? null;
  const enInicio = ubicacion.pathname === '/proyectos';
  useEffect(() => {
    setProject(proyectoDeRuta(projects, idRuta));
  }, [idRuta, projects]);
  // Tarjetas de Inicio (se recargan cada vez que se muestra Inicio)
  const portafolio = usePortafolio(projects, enInicio && Boolean(session));

  useEffect(() => {
    const alPresionar = (e) => {
      if (e.key === 'Escape') {
        setMenuAbierto(false);
        if (!archivando) setConfirmarArchivo(false);
      }
    };
    window.addEventListener('keydown', alPresionar);
    return () => window.removeEventListener('keydown', alPresionar);
  }, [archivando]);

  // Entregables del proyecto activo (Supabase, project_deliverables; RLS: solo proyectos propios).
  // Sin datos de respaldo: si no se pueden leer se avisa, nunca se muestran los de otro proyecto.
  const [frentes, setFrentes] = useState([]);
  const [cargaEntregables, setCargaEntregables] = useState({ cargando: false, error: '' });

  useEffect(() => {
    if (!project?.id) { setFrentes([]); return; }
    let vigente = true;
    setCargaEntregables({ cargando: true, error: '' });
    cargarEntregables(project.id)
      .then(lista => { if (vigente) { setFrentes(lista); setCargaEntregables({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente) { setFrentes([]); setCargaEntregables({ cargando: false, error: err.message }); } });
    return () => { vigente = false; };
  }, [project?.id]);

  // Garantías del proyecto activo (Supabase, project_guarantees; RLS: solo las de proyectos propios)
  const [garantias, setGarantias] = useState([]);
  const [cargaGarantias, setCargaGarantias] = useState({ cargando: false, error: '' });

  useEffect(() => {
    if (!project?.id) { setGarantias([]); return; }
    let vigente = true;
    setCargaGarantias({ cargando: true, error: '' });
    cargarGarantias(project.id)
      .then(lista => { if (vigente) { setGarantias(lista); setCargaGarantias({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente) { setGarantias([]); setCargaGarantias({ cargando: false, error: err.message }); } });
    return () => { vigente = false; };
  }, [project?.id]);

  // Sin datos de respaldo: si la consulta falla se avisa en vez de mostrar garantías que parezcan reales
  const avisoGarantias = cargaGarantias.error;

  // "+ Nuevo Parque Solar" se oculta a quien solo tiene proyectos compartidos (p. ej. un banco lector); una cuenta
  // sin ningún proyecto lo sigue viendo para crear el primero.
  const puedeCrear = puedeCrearProyectos([...projects, ...archivedProjects].map(p => p.rol));

  // Rol del usuario en el proyecto activo. Lector: solo lectura en toda la app (la base también lo impide).
  const rol = project?.rol ?? 'dueno';
  const puedeEditar = rol !== 'lector';
  const esDueno = rol === 'dueno';

  // Un editor o lector que abre el proyecto queda en el registro de accesos (lo ve el dueño)
  useEffect(() => {
    if (project?.id && project.rol && project.rol !== 'dueno') registrarAcceso(project.id);
  }, [project?.id, project?.rol]);

  // Documentos de respaldo por entregable (deliverable_evidence). null = no se pudieron leer: no se afirma "sin evidencia".
  const [evidencias, setEvidencias] = useState(null);
  useEffect(() => {
    if (!project?.id) { setEvidencias(null); return; }
    let vigente = true;
    setEvidencias(null);
    cargarEvidencias(project.id)
      .then(mapa => { if (vigente) setEvidencias(mapa); })
      .catch(err => { if (vigente) { console.error(err.message); setEvidencias(null); } });
    return () => { vigente = false; };
  }, [project?.id]);

  // Exportar análisis financiero (Excel): primero se registra quién exporta (si falla, no se exporta) y después se
  // genera el archivo con las cifras del tablero. ExcelJS se carga solo aquí.
  const handleExportarAnalisis = async () => {
    if (!project || !rentabilidad || !supuestosConCreditos || !finanzas) throw new Error('El análisis necesita los supuestos de ingresos y producción.');
    await registrarExportacion(project.id, 'analisis_financiero');
    const [modExcel, { archivoAnalisisFinanciero }, { descargarBlob }] = await Promise.all([
      import('exceljs'), import('./lib/exportarFinanzas'), import('./lib/descargar'),
    ]);
    const ExcelJS = modExcel.default ?? modExcel;
    const { nombre, blob } = await archivoAnalisisFinanciero(ExcelJS, {
      proyecto: { nombre: project.name, estado: project.state, capacidad: formatearCapacidad(finanzas.mwac, finanzas.mwdc), esEjemplo: Boolean(project.esEjemplo), fechaRtb: project.fechaRtb ?? null },
      supuestos: supuestosConCreditos, rentabilidad,
      cronograma: { pagos: finanzas.pagos, fondos: finanzas.fondos, origen: finanzas.origenCronograma },
      sensibilidad,
      fuentesUsos: { capex: finanzas.capex, idc: finanzas.idc, comision: finanzas.comision, dsra: finanzas.dsra, usos: finanzas.usos, deuda: finanzas.deuda, equity: finanzas.equity, noDisposicion: finanzas.noDisposicion },
      creditos: { lista: creditos, porCredito, condiciones: condicionesCreditos },
      escenarios, quiebres, estados,
      costoIva,
      generado: new Date(),
      version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'desarrollo',
      exportadoPor: session?.user?.email ?? null,
    });
    descargarBlob(blob, nombre);
    return nombre;
  };

  // Alta o baja de un documento: se refleja al instante y queda en el historial
  const handleEvidenciasCambio = (deliverableId, lista) => {
    setEvidencias(prev => new Map(prev ?? []).set(deliverableId, lista));
    if (project?.id) recargarHistorial(project.id);
  };

  // Documentos de las garantías (guarantee_evidence): son la evidencia del entregable automático de garantías.
  // null = no se pudieron leer (no se afirma que falten).
  const [evidenciasGarantias, setEvidenciasGarantias] = useState(null);
  useEffect(() => {
    if (!project?.id) { setEvidenciasGarantias(null); return; }
    let vigente = true;
    setEvidenciasGarantias(null);
    cargarEvidenciasGarantias(project.id)
      .then(mapa => { if (vigente) setEvidenciasGarantias(mapa); })
      .catch(err => { if (vigente) { console.error(err.message); setEvidenciasGarantias(null); } });
    return () => { vigente = false; };
  }, [project?.id]);
  const handleEvidenciasGarantiaCambio = (guaranteeId, lista) => {
    setEvidenciasGarantias(prev => new Map(prev ?? []).set(guaranteeId, lista));
    if (project?.id) recargarHistorial(project.id);
  };
  // Activas con documento vigente (subido después de su última renovación)
  const evidenciaGarantias = useMemo(
    () => (evidenciasGarantias && !cargaGarantias.cargando && !cargaGarantias.error ? calcularEvidenciaGarantias(garantias, evidenciasGarantias) : null),
    [garantias, evidenciasGarantias, cargaGarantias.cargando, cargaGarantias.error]
  );
  const resumenGarantiasEvidencia = evidenciaGarantias ? { activas: evidenciaGarantias.activas, conDocumento: evidenciaGarantias.conDocumento } : undefined;
  const documentosPorEntregable = useMemo(
    () => (evidencias ? Object.fromEntries([...evidencias].map(([id, lista]) => [id, lista.length])) : undefined),
    [evidencias]
  );

  // Al guardar se reemplaza la garantía en el estado; `alertas` (abajo) se recalcula en ese mismo render
  const handleGarantiaGuardada = (actualizada) => {
    setGarantias(prev => prev.map(g => (g.id === actualizada.id ? actualizada : g)));
  };
  // La baja queda en el historial (trigger de project_guarantees): se recarga para mostrarla
  const handleGarantiaEliminada = (id) => {
    setGarantias(prev => prev.filter(g => g.id !== id));
    if (project?.id) recargarHistorial(project.id);
  };
  const handleGarantiaAgregada = (nueva) => {
    setGarantias(prev => [...prev, nueva].sort((a, b) => a.vence.localeCompare(b.vence)));
  };

  // Cronograma de caja capturado (project_cash_movements; RLS: solo proyectos propios)
  const [movimientos, setMovimientos] = useState([]);
  const [cargaCronograma, setCargaCronograma] = useState({ cargando: false, error: '' });

  useEffect(() => {
    if (!project?.id) { setMovimientos([]); return; }
    let vigente = true;
    setCargaCronograma({ cargando: true, error: '' });
    cargarMovimientos(project.id)
      .then(lista => { if (vigente) { setMovimientos(lista); setCargaCronograma({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente) { setMovimientos([]); setCargaCronograma({ cargando: false, error: err.message }); } });
    return () => { vigente = false; };
  }, [project?.id]);

  const handleMovimientoGuardado = (m) => {
    setMovimientos(prev => (prev.some(x => x.id === m.id) ? prev.map(x => (x.id === m.id ? m : x)) : [...prev, m]));
  };
  const handleMovimientoEliminado = (id) => setMovimientos(prev => prev.filter(x => x.id !== id));
  // El ejemplo copiado pasa a ser el cronograma propio del proyecto (a partir de aquí, editable)
  const handleMovimientosCopiados = (lista) => setMovimientos(lista);

  // Historial de cambios de los entregables (project_change_log; lo escribe un trigger, RLS: solo proyectos propios)
  const [historial, setHistorial] = useState([]);
  const [cargaHistorial, setCargaHistorial] = useState({ cargando: false, error: '' });

  const recargarHistorial = useCallback((projectId, vigente = () => true) => {
    setCargaHistorial(c => ({ ...c, cargando: true }));
    return cargarHistorialCambios(projectId)
      .then(lista => { if (vigente()) { setHistorial(lista); setCargaHistorial({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente()) { setCargaHistorial({ cargando: false, error: err.message }); } });
  }, []);

  useEffect(() => {
    if (!project?.id) { setHistorial([]); return; }
    let vigente = true;
    setHistorial([]);
    recargarHistorial(project.id, () => vigente);
    return () => { vigente = false; };
  }, [project?.id, recargarHistorial]);

  const ultimosCambios = useMemo(() => ultimoCambioPorEntregable(historial), [historial]);

  // Sustituye en pantalla un entregable por la fila guardada en Supabase
  const reflejarEntregable = (wsIndex, itemIndex, fila) => {
    setFrentes(prev => prev.map((ws, i) => (i !== wsIndex ? ws : {
      ...ws, items: ws.items.map((it, j) => (j !== itemIndex ? it : [fila.titulo, fila.estado, fila.responsable, fila.fecha, it[4]]))
    })));
  };

  // Nombre, fecha compromiso y responsable de un entregable: se guardan, se reflejan y quedan en el historial
  const handleDetalleEntregable = async (wsIndex, itemIndex, cambios) => {
    const item = frentes[wsIndex]?.items[itemIndex];
    const guardado = await actualizarDetalleEntregable(item?.[4]?.id, cambios);
    reflejarEntregable(wsIndex, itemIndex, guardado);
    recargarHistorial(project.id);
  };

  // Alta de un entregable: se agrega al final de su frente (o en un frente nuevo) y queda en el historial
  const handleAgregarEntregable = async (datos) => {
    const fila = await agregarEntregable(project.id, datos);
    const item = [fila.titulo, fila.estado, fila.responsable, fila.fecha, { id: fila.id, codigo: fila.codigo }];
    setFrentes(prev => (prev.some(ws => ws.nombre === fila.frente)
      ? prev.map(ws => (ws.nombre === fila.frente ? { ...ws, items: [...ws.items, item] } : ws))
      : [...prev, { nombre: fila.frente, items: [item] }]));
    recargarHistorial(project.id);
  };

  // Baja de un entregable con motivo; si su frente queda vacío, el frente desaparece
  const handleEliminarEntregable = async (wsIndex, itemIndex, motivo) => {
    const item = frentesEfectivos[wsIndex]?.items[itemIndex];
    if (!item || item[4]?.auto) return;
    await eliminarEntregable(item[4]?.id, motivo);
    setFrentes(prev => prev
      .map((ws, i) => (i !== wsIndex ? ws : { ...ws, items: ws.items.filter((_, j) => j !== itemIndex) }))
      .filter(ws => ws.items.length > 0));
    recargarHistorial(project.id);
  };

  // Estado elegido en el menú y confirmado (con motivo si sale de "completo"); si falla, el menú muestra el error
  const handleCambiarEstado = async (wsIndex, itemIndex, estado, motivo) => {
    const item = frentesEfectivos[wsIndex]?.items[itemIndex];
    if (!item || item[4]?.auto) return; // calculado: no se cambia a mano
    const guardado = await actualizarEstadoEntregable(item[4]?.id, estado, motivo);
    reflejarEntregable(wsIndex, itemIndex, guardado);
    recargarHistorial(project.id);
  };

  // Fecha RTB objetivo capturada por el usuario (solar_projects.fecha_rtb)
  const handleRtbGuardada = (fecha) => {
    setProject(p => ({ ...p, fechaRtb: fecha }));
    setProjects(ps => ps.map(p => (p.id === project?.id ? { ...p, fechaRtb: fecha } : p)));
    if (project?.id) recargarHistorial(project.id);
  };

  // Margen por proyecto (solar_projects.margen_garantias_dias); al guardarlo se recalcula todo al instante
  const margenGarantias = project?.margenGarantiasDias ?? MARGEN_GARANTIAS_DEFAULT;
  const handleMargenGuardado = (dias) => {
    setProject(p => ({ ...p, margenGarantiasDias: dias }));
    setProjects(ps => ps.map(p => (p.id === project?.id ? { ...p, margenGarantiasDias: dias } : p)));
    if (project?.id) recargarHistorial(project.id);
  };

  // Nombre, capacidad, estado y CAPEX del proyecto: se reflejan al instante (todo se recalcula) y quedan en el historial
  const handleProyectoEditado = (fila, nuevosSupuestos) => {
    const cambios = { name: fila.name, capacityMw: fila.capacity_mw, state: fila.state, capex: fila.capex };
    setProject(p => ({ ...p, ...cambios }));
    setProjects(ps => ps.map(p => (p.id === fila.id ? { ...p, ...cambios } : p)));
    if (nuevosSupuestos) setSupuestos(nuevosSupuestos);
    setEditarProyectoAbierto(false);
    recargarHistorial(fila.id);
    mostrarAviso('Proyecto actualizado.');
  };

  // Supuestos guardados desde el tablero: también quedan en el historial
  const handleSupuestosGuardados = (s) => {
    setSupuestos(s);
    if (project?.id) recargarHistorial(project.id);
  };

  // Supuestos financieros del proyecto (Supabase, project_financial_assumptions; RLS: solo proyectos propios)
  const [supuestos, setSupuestos] = useState(null);
  const [cargaSupuestos, setCargaSupuestos] = useState({ cargando: false, error: '' });

  useEffect(() => {
    if (!project?.id) { setSupuestos(null); return; }
    let vigente = true;
    setCargaSupuestos({ cargando: true, error: '' });
    cargarSupuestos(project.id)
      .then(s => { if (vigente) { setSupuestos(s); setCargaSupuestos({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente) { setSupuestos(null); setCargaSupuestos({ cargando: false, error: err.message }); } });
    return () => { vigente = false; };
  }, [project?.id]);

  // Créditos de la deuda (project_loans): la tasa y las comisiones de la deuda salen de aquí (ponderadas)
  const [creditos, setCreditos] = useState([]);
  const [cargaCreditos, setCargaCreditos] = useState({ cargando: false, error: '' });
  useEffect(() => {
    if (!project?.id) { setCreditos([]); return; }
    let vigente = true;
    setCargaCreditos({ cargando: true, error: '' });
    cargarCreditos(project.id)
      .then(c => { if (vigente) { setCreditos(c); setCargaCreditos({ cargando: false, error: '' }); } })
      .catch(err => { if (vigente) { setCreditos([]); setCargaCreditos({ cargando: false, error: err.message }); } });
    return () => { vigente = false; };
  }, [project?.id]);
  const handleCreditosGuardados = (lista) => {
    setCreditos(lista);
    if (project?.id) recargarHistorial(project.id);
  };
  // Supuestos y créditos se cargan por separado: el cálculo espera a ambos y, si alguno falla, queda "no disponible"
  const cargaFinanciera = useMemo(() => ({
    cargando: cargaSupuestos.cargando || cargaCreditos.cargando,
    error: cargaSupuestos.error || cargaCreditos.error,
  }), [cargaSupuestos, cargaCreditos]);

  // Cadena de cálculo del proyecto (lib/analisisProyecto): la misma que usan las tarjetas de Inicio
  const analisis = useMemo(
    () => analizarProyecto({ project, frentes, garantias, movimientos, supuestos, creditos, cargaGarantias, cargaSupuestos: cargaFinanciera, documentos: documentosPorEntregable, evidenciaGarantias: resumenGarantiasEvidencia, calcularPrecioMinimo: true }),
    [project, frentes, garantias, movimientos, supuestos, creditos, cargaGarantias, cargaFinanciera, documentosPorEntregable, resumenGarantiasEvidencia?.activas, resumenGarantiasEvidencia?.conDocumento] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { fechasProyecto, garantiasDisponibles, frentesEfectivos, avance, base, calendario, problemasDep, supuestosCalculables, comparacion, rentabilidad, precioMinimo, finanzas, resumenRentabilidad, alertas, calIva, costoIva, condicionesCreditos, problemasCreditos, porCredito, supuestosConCreditos, escenarios, quiebres, estados } = analisis;

  // Los dos esquemas de depreciación con la estructura seleccionada (dato informativo; validar con asesor fiscal)
  const comparacionDepreciacion = useMemo(
    () => (supuestosCalculables && base ? compararDepreciacion(supuestosCalculables, supuestosCalculables.estructuraSeleccionada, base.capex, base.mwdc, calendario, calIva) : null),
    [supuestosCalculables, base, calendario, calIva]
  );

  // Sensibilidad de la TIR de equity y el % de deuda: precio del PPA × CAPEX (estructura seleccionada)
  const sensibilidad = useMemo(
    () => (supuestosCalculables && base ? calcularSensibilidad(supuestosCalculables, supuestosCalculables.estructuraSeleccionada, base.capex, base.mwdc, calendario, undefined, undefined, calIva) : null),
    [supuestosCalculables, base, calendario, calIva]
  );

  // Oportunidades de optimización (no son alertas): por ahora, otro esquema de depreciación con mejor TIR de equity
  const oportunidades = useMemo(
    () => detectarOportunidades({ supuestos, rentabilidad, comparacionDepreciacion }),
    [supuestos, rentabilidad, comparacionDepreciacion]
  );

  const textoEvidenciaRtb = documentosPorEntregable ? textoEvidencia(resumenEvidencia(frentesEfectivos, documentosPorEntregable, resumenGarantiasEvidencia)) : null;

  // Contexto para el asistente: cifras ya calculadas aquí para que Gemini solo las cite
  const proyectoParaIA = useMemo(() => {
    if (!project || !finanzas) return null;
    const entregables = frentesEfectivos.flatMap(f => f.items);
    const entregableGarantias = entregables.find(esEntregableGarantias);
    const completos = entregables.filter(i => i[1] === 'completo').length;
    const f = finanzas;
    return {
      ...project,
      cifras: [
        { etiqueta: 'Capacidad', valor: formatearCapacidad(f.mwac, f.mwdc) },
        { etiqueta: 'Avance hacia RTB', valor: `${completos} de ${entregables.length} entregables completos` },
        ...(avance && avance.total > 0
          ? [
              {
                etiqueta: 'Avance real frente al plan (fechas compromiso; referencia para saber si hay atraso)',
                valor: `real ${formatearPorcentaje(avance.realPct, 0)} (${avance.completos} completos) frente a planeado a hoy ${formatearPorcentaje(avance.planeadoPct, 0)} (${avance.planeados} cuya fecha compromiso ya pasó)${avance.sinFecha > 0 ? `; ${avance.sinFecha} no completos sin fecha compromiso` : ''}`
              },
              {
                etiqueta: `Entregables vencidos (fecha compromiso pasada y no completos; críticos si van hacia RTB y llevan más de ${DIAS_VENCIDO_CRITICO} días)`,
                valor: avance.vencidos.length === 0
                  ? 'ninguno'
                  // El servidor recorta cada valor a 300 caracteres: los 2 más vencidos aquí; todos aparecen en las alertas
                  : `${avance.vencidos.length}: ` + avance.vencidos.slice(0, 2).map(v => `${v.titulo} (${TEXTO_ESTADO_IA[v.estado]}, compromiso ${formatearFecha(v.fecha)}, ${v.diasVencido} días vencido${v.critico ? ', crítico' : ''})`).join('; ') + (avance.vencidos.length > 2 ? `; y ${avance.vencidos.length - 2} más (ver alertas)` : '')
              },
              {
                etiqueta: 'RTB proyectado (fecha del entregable no completo más tardío; los vencidos cuentan como hoy)',
                valor: avance.rtbProyectado
                  ? `${formatearFecha(avance.rtbProyectado)} (${avance.entregableRtbProyectado})${textoSituacionIA(situacionRtb(avance, project.fechaRtb), avance)}${avance.sinFecha > 0 ? '; no considera los entregables sin fecha' : ''}`
                  : 'sin proyección: ningún entregable abierto tiene fecha compromiso'
              }
            ]
          : []),
        { etiqueta: 'Días al RTB objetivo', valor: project.fechaRtb ? String(diasEntre(hoyISO(), project.fechaRtb)) : 'RTB sin definir' },
        ...(project.esEjemplo ? [{ etiqueta: 'Tipo de proyecto', valor: 'EJEMPLO: entregables, fechas y cronograma de caja ilustrativos' }] : []),
        ...(!finanzas.conCronograma ? [{ etiqueta: 'Cronograma de caja', valor: 'Sin pagos ni fuentes capturados' }] : []),
        { etiqueta: 'CAPEX', valor: formatearMoneda(f.capex) },
        ...(f.deudaDimensionada
          ? [{ etiqueta: 'Usos totales', valor: `${formatearMoneda(f.usos)} (CAPEX + intereses durante la construcción ${formatearMoneda(f.idc)} + comisión ${formatearMoneda(f.comision)} + DSRA ${formatearMoneda(f.dsra)})` }]
          : []),
        { etiqueta: `Equity (${formatearPorcentaje(f.equityPct)} de los usos)`, valor: formatearMoneda(f.equity) },
        { etiqueta: `Deuda (${formatearPorcentaje(1 - f.equityPct)} de los usos)`, valor: `${formatearMoneda(f.deuda)}${f.deudaDimensionada ? '' : ' (supuesto: 70 % del CAPEX, sin dimensionar)'}` },
        ...f.fondos.map(m => ({ etiqueta: m.concepto, valor: `${formatearMoneda(m.monto)} · ${formatearFecha(m.fecha)} · ${m.estado}${m.confirmado ? '' : ' (no confirmado)'}` })),
        { etiqueta: 'Contrato de equipos mayores', valor: `${formatearMoneda(f.contratoEquipos)}; anticipo ${formatearMoneda(f.anticipoEquipos)} y resto por hitos` },
        ...f.pagos.map(m => ({ etiqueta: `Pago: ${m.concepto}`, valor: `${formatearMoneda(m.monto)} · ${formatearFecha(m.fecha)}` })),
        ...(rentabilidad && supuestos
          ? [
              { etiqueta: 'Estructura seleccionada', valor: ESTRUCTURAS[rentabilidad.estructura] },
              { etiqueta: 'Producción P50 / P90 (año 1)', valor: `${formatearNumero(rentabilidad.p50Mwh)} / ${formatearNumero(rentabilidad.p90Mwh)} MWh` },
              { etiqueta: 'Producción específica con estructura fija', valor: `${formatearNumero(supuestos.rendimientoFijaKwhKwp)} kWh/kWp · ${project.esEjemplo ? ETIQUETA_ILUSTRATIVO : origenProduccion(supuestos.rendimientoFijaKwhKwp, project.state)}` },
              { etiqueta: 'PPA', valor: `${formatearMoneda(supuestos.ppaPrecio, 2)}/MWh por el ${supuestos.ppaPorcentaje} % de la energía durante ${supuestos.ppaPlazoAnos} años (escalamiento ${supuestos.ppaEscalamientoPct} %/año)` },
              { etiqueta: 'Precio de mercado', valor: `${formatearMoneda(supuestos.mercadoPrecio, 2)}/MWh (escalamiento ${supuestos.mercadoEscalamientoPct} %/año)` },
              { etiqueta: 'Precio de CELs', valor: `${formatearMoneda(supuestos.celPrecio, 2)}/MWh` },
              { etiqueta: 'Degradación anual', valor: `${supuestos.degradacionPct} %` },
              { etiqueta: 'Costos de operación (año 1)', valor: `OPEX ${formatearMoneda(supuestos.opexAnual)} + seguros ${formatearMoneda(supuestos.segurosAnual)} + arrendamiento ${formatearMoneda(supuestos.arrendamientoAnual)}, escalamiento ${supuestos.opexEscalamientoPct} %/año` },
              ...(project.esEjemplo ? [{ etiqueta: 'Calidad de los supuestos', valor: ETIQUETA_ILUSTRATIVO }] : []),
              { etiqueta: 'Créditos de la deuda', valor: descripcionCreditos(creditos, condicionesCreditos) },
              { etiqueta: 'Condiciones de la deuda', valor: `esculpida, ${condicionesCreditos ? `${formatearNumero(condicionesCreditos.tasaPct, 2)} %${creditos.length > 1 ? ' (tasa ponderada)' : ''}` : 'N/D'} a ${supuestos.plazoDeudaAnos} años (PPA de ${supuestos.ppaPlazoAnos} años); dimensionada con DSCR ${formatearDscr(supuestos.dscrDimensionamientoP50)} sobre P50 y ${formatearDscr(supuestos.dscrDimensionamientoP90)} sobre P90, ingresos sin contrato a ${formatearDscr(supuestos.dscrMercado)}, apalancamiento máximo ${supuestos.apalancamientoMaxPct} % de los usos; covenant ${formatearDscr(supuestos.dscrCovenant)}` },
              { etiqueta: 'Criterio que limita la deuda (calculado)', valor: `${CRITERIOS_DEUDA[rentabilidad.criterioDeuda]}; deuda = ${formatearPorcentaje(rentabilidad.deudaPct)} de los usos` },
              { etiqueta: 'ISR', valor: `${supuestos.isrPct} %, depreciación ${supuestos.depreciacionEsquema === 'ano1' ? `${supuestos.depreciacionAno1Pct} % en el año 1` : `${supuestos.depreciacionTasaAnualPct} % anual`}, pérdidas amortizables 10 años` },
              { etiqueta: 'ISR con deuda (calculado)', valor: `${rentabilidad.isrConDeuda.inicio ? `empieza en el año ${rentabilidad.isrConDeuda.inicio} de operación` : 'no se paga en la vida útil'}; pérdida fiscal que caduca sin usarse ${formatearMoneda(rentabilidad.isrConDeuda.perdidaCaducada)}` },
              ...comparacionDepreciacion.map(c => ({
                etiqueta: `Comparación de depreciación: ${c.descripcion} (validar con asesor fiscal)`,
                valor: `ISR desde el año ${c.rentabilidad.isrConDeuda.inicio ?? 'N/D'}, pérdida que caduca ${formatearMoneda(c.rentabilidad.isrConDeuda.perdidaCaducada)}, TIR equity ${formatearTir(c.rentabilidad.tirEquity)}`
              })),
              { etiqueta: 'TIR de proyecto (calculada)', valor: formatearTir(rentabilidad.tirProyecto) },
              { etiqueta: 'TIR de equity (calculada)', valor: formatearTir(rentabilidad.tirEquity) },
              { etiqueta: 'DSCR mínimo con P50 / P90 (calculado)', valor: `${formatearDscr(rentabilidad.dscrMinP50)} / ${formatearDscr(rentabilidad.dscrMinP90)} (covenant ${formatearDscr(supuestos.dscrCovenant)})` },
              { etiqueta: 'LCOE (calculado)', valor: rentabilidad.lcoe != null ? `${formatearMoneda(rentabilidad.lcoe, 2)}/MWh` : 'N/D' },
              {
                etiqueta: 'Oportunidades de optimización (calculadas por AuraGrid; no son alertas)',
                valor: oportunidades.length ? oportunidades.map(o => `${o.texto} · ${o.nota}`).join('; ') : 'ninguna detectada con las reglas actuales'
              },
              ...(precioMinimo
                ? [{
                    etiqueta: `Precio mínimo de PPA para una TIR de equity de ${formatearTir(precioMinimo.tirObjetivo)} (calculado)`,
                    valor: precioMinimo.precio != null
                      ? `al menos ${formatearMoneda(precioMinimo.precio, 2)}/MWh (PPA actual ${formatearMoneda(supuestos.ppaPrecio, 2)}/MWh); con ese precio la deuda se redimensiona a ${formatearMoneda(precioMinimo.rentabilidad.deuda)} (${formatearPorcentaje(precioMinimo.rentabilidad.deudaPct)} de los usos) y el DSCR mínimo P90 queda en ${formatearDscr(precioMinimo.rentabilidad.dscrMinP90)}; resto de los supuestos sin cambio`
                      : `no se alcanza ni con un PPA de ${formatearMoneda(PRECIO_PPA_MAXIMO_BUSQUEDA)}/MWh con los supuestos actuales`
                  }]
                : []),
              ...(sensibilidad
                ? sensibilidad.precios.map((precio, i) => ({
                    etiqueta: `Sensibilidad con PPA ${formatearMoneda(precio)}/MWh${i === sensibilidad.filaActual ? ' (actual)' : ''}: TIR equity / % deuda por CAPEX (USD/Wdc)`,
                    valor: sensibilidad.capexWdc.map((c, j) => `${formatearNumero(c, 2)}${i === sensibilidad.filaActual && j === sensibilidad.columnaActual ? ' (actual)' : ''}: ${formatearTir(sensibilidad.celdas[i][j].tirEquity)} / ${formatearPorcentaje(sensibilidad.celdas[i][j].deudaPct, 0)}`).join('; ')
                  }))
                : []),
              ...comparacion.map(r => ({
                etiqueta: `Comparación: ${ESTRUCTURAS[r.estructura]}`,
                valor: `CAPEX ${formatearMoneda(r.capex)}, P50 ${formatearNumero(r.p50Mwh)} MWh, deuda ${formatearMoneda(r.deuda)} (${formatearPorcentaje(r.deudaPct)} de los usos), TIR proyecto ${formatearTir(r.tirProyecto)}, TIR equity ${formatearTir(r.tirEquity)}, DSCR mín. P90 ${formatearDscr(r.dscrMinP90)}, LCOE ${r.lcoe != null ? formatearMoneda(r.lcoe, 2) : 'N/D'}/MWh`
              }))
            ]
          : [{ etiqueta: 'TIR, DSCR y LCOE', valor: 'N/D: el proyecto no tiene supuestos de ingresos y producción capturados' }]),
        { etiqueta: 'Margen exigido a las garantías después de su fecha de referencia', valor: `${margenGarantias} días` },
        ...(project.fechaRtb && garantias.length
          ? [{
              etiqueta: 'Vigencia requerida de cada garantía y fecha contra la que se valida (la de interconexión está por confirmar con el Manual de Interconexión, cap. 15, y el contrato de interconexión)',
              valor: garantias.map(g => `${g.tipo} ${g.beneficiario}: ${describirReferencia(referenciaGarantia(g, { ...(fechasProyecto ?? { ntp: null, finInterconexion: null, cod: null, finConstruccion: null, estimadas: false }), rtb: project.fechaRtb }, margenGarantias), margenGarantias)}`).join('; ')
            }]
          : []),
        ...(entregableGarantias?.[4]
          ? [{ etiqueta: `Entregable automático de garantías "${entregableGarantias[0]}" (calculado)`, valor: `${entregableGarantias[1]}: ${entregableGarantias[4].motivo}` }]
          : []),
        ...(evidenciaGarantias
          ? [{ etiqueta: 'Garantías con documento (póliza, carta de crédito o endoso vigente; evidencia del entregable de garantías)', valor: `${evidenciaGarantias.conDocumento} de ${evidenciaGarantias.activas} garantías activas` }]
          : []),
        ...(avisoGarantias
          ? [{ etiqueta: 'Garantías', valor: 'DATOS NO DISPONIBLES: no se evaluaron sus vencimientos; no afirmes que están en orden' }]
          : [])
      ]
    };
  }, [project, frentesEfectivos, finanzas, avisoGarantias, margenGarantias, rentabilidad, supuestos, creditos, condicionesCreditos, comparacion, comparacionDepreciacion, sensibilidad, precioMinimo, avance, oportunidades, garantias, fechasProyecto, evidenciaGarantias]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setDefinirContrasena('recovery');
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function fetchSolarProjects() {
    try {
      setLoadingProjects(true);
      
      const { data: activeData, error: activeError } = await supabase
        .from('solar_projects')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false });

      if (activeError) throw activeError;

      const { data: archivedData, error: archivedError } = await supabase
        .from('solar_projects')
        .select('*')
        .eq('is_archived', true)
        .order('created_at', { ascending: false });

      if (archivedError) throw archivedError;

      // Proyectos compartidos con el usuario y su rol; si no se puede leer, se tratan como de solo lectura
      const userId = session?.user?.id;
      const compartidos = await rolesCompartidos(userId).catch(err => { console.error(err.message); return {}; });
      const rolDe = (p) => (p.owner_id === userId ? 'dueno' : compartidos[p.id] ?? 'lector');

      const formatList = (list) => list.map(p => ({
        id: p.id,
        name: p.name,
        state: p.state || 'Sonora',
        capacityMw: p.capacity_mw,
        capex: p.capex,
        fechaRtb: p.fecha_rtb ?? null,
        esEjemplo: Boolean(p.es_ejemplo),
        margenGarantiasDias: p.margen_garantias_dias ?? MARGEN_GARANTIAS_DEFAULT,
        isArchived: p.is_archived,
        rol: rolDe(p)
      }));

      const formattedActive = formatList(activeData || []);
      const formattedArchived = formatList(archivedData || []);

      setProjects(formattedActive);
      setArchivedProjects(formattedArchived);

    } catch (err) {
      console.error('Error al cargar proyectos solares de Supabase:', err.message);
    } finally {
      setLoadingProjects(false);
      setCargaInicialHecha(true);
    }
  }

  useEffect(() => {
    if (session) {
      fetchSolarProjects();
    }
  }, [session]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleProjectCreated = () => {
    fetchSolarProjects();
  };

  const mostrarAviso = (texto, tipo = 'ok') => {
    setAviso({ texto, tipo });
    setTimeout(() => setAviso(null), 4000);
  };

  // Se ejecuta desde el diálogo de confirmación dentro de la página
  const handleArchiveCurrentProject = async () => {
    if (!project) return;
    setArchivando(true);
    try {
      const { error } = await supabase
        .from('solar_projects')
        .update({ is_archived: true })
        .eq('id', project.id);

      if (error) throw error;

      mostrarAviso(`Proyecto "${project.name}" archivado.`);
      fetchSolarProjects();
      navegar('/proyectos');
    } catch (err) {
      console.error('Error al archivar el proyecto:', err.message);
      mostrarAviso('No se pudo archivar el proyecto. Intenta de nuevo.', 'error');
    } finally {
      setArchivando(false);
      setConfirmarArchivo(false);
    }
  };

  const handleRestoreProject = async (projectId) => {
    try {
      const { error } = await supabase
        .from('solar_projects')
        .update({ is_archived: false })
        .eq('id', projectId);

      if (error) throw error;

      mostrarAviso('Proyecto restaurado al portafolio activo.');
      fetchSolarProjects();
    } catch (err) {
      console.error('Error al restaurar el proyecto:', err.message);
      mostrarAviso('No se pudo restaurar el proyecto. Intenta de nuevo.', 'error');
    }
  };

  // Eliminar definitivamente un proyecto archivado (solo el dueño): archivos del bucket y, en cascada, todos sus datos.
  // Los errores los muestra la confirmación (lib/eliminarProyecto los redacta para el usuario).
  const handleEliminarArchivado = async (projectId) => {
    const nombre = archivedProjects.find(a => a.id === projectId)?.name ?? 'El proyecto';
    await eliminarProyectoDefinitivo(supabase, projectId);
    mostrarAviso(`${nombre} se eliminó definitivamente.`);
    fetchSolarProjects();
  };

  // Título de la pestaña según la pantalla (antes de los return anticipados: es un hook)
  const tituloActual = tituloPestana({ ruta: ubicacion.pathname, conSesion: Boolean(session), definirContrasena, proyecto: project?.name ?? null, modulo: moduloRuta });
  useEffect(() => { document.title = tituloActual; }, [tituloActual]);

  // Aviso de privacidad y términos de uso: se ven con o sin sesión
  const documentoLegal = DOCUMENTOS_LEGALES.find(d => d.ruta === ubicacion.pathname);
  if (documentoLegal) return <PaginaLegal documento={documentoLegal} />;

  // Pantalla completa de carga solo la primera vez: las recargas posteriores de la lista (crear, archivar,
  // restaurar) no deben desmontar el tablero ni el chat (antes se perdía la conversación)
  if (loadingSession || (session && loadingProjects && !cargaInicialHecha)) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f172a', color: '#ffffff', fontFamily: 'sans-serif' }}>
        <p>Cargando AuraGrid…</p>
      </div>
    );
  }

  if (!session) {
    return <Login onLoginSuccess={(activeSession) => setSession(activeSession)} />;
  }

  if (definirContrasena) {
    return <DefinirContrasena tipo={definirContrasena} correo={session.user.email} onListo={() => setDefinirContrasena(null)} />;
  }

  // Páginas del proyecto: cada sección del tablero en su módulo, con los mismos componentes y props (sin duplicar)
  const rutaDe = (modulo) => `/proyectos/${project?.id}/${modulo}`;
  const motivoNd = cargaFinanciera.cargando ? 'Cargando supuestos…'
    : cargaFinanciera.error ? 'Supuestos no disponibles'
    : problemasDep.length ? 'Depreciación por categorías incompleta'
    : problemasCreditos.length ? 'Créditos de la deuda incompletos'
    : 'Faltan supuestos de ingresos';
  const historialDe = (modulo, titulo, descripcion, vacio) => (
    <HistorialCambios registros={cambiosDelModulo(historial, modulo)} cargando={cargaHistorial.cargando && historial.length === 0} error={cargaHistorial.error} titulo={titulo} descripcion={descripcion} vacio={vacio} ocultarCorreos={!puedeEditar} correoPropio={session?.user?.email ?? null} />
  );
  const paginas = project && finanzas ? {
    resumen: (
      <Resumen
        barraRtb={(
          <RtbStatusBar
            project={project}
            capacidad={formatearCapacidad(finanzas.mwac, finanzas.mwdc)}
            frentes={frentesEfectivos}
            alertas={alertas}
            avance={avance}
            avisoDatos={[avisoGarantias, cargaEntregables.error].filter(Boolean).join(' · ')}
            onRtbGuardada={handleRtbGuardada}
            puedeEditar={puedeEditar}
            evidencia={textoEvidenciaRtb}
            vista="resumen"
            accionRtb={<Link to={rutaDe('cronograma')} style={{ color: '#7cc4ff', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>{project.fechaRtb ? 'Cambiar en Cronograma →' : 'Definir en Cronograma →'}</Link>}
          />
        )}
        alertas={(
          <AdvisorAlerts enlaceModulo={(a) => { const m = moduloDisponible(moduloDeAlerta(a)); return { to: rutaDe(m), texto: nombreModulo(m) }; }} alertas={alertas} avisoDatos={[avisoGarantias, cargaEntregables.error].filter(Boolean).join(' · ')} />
        )}
        historial={historialDe('resumen', 'Historial del proyecto', 'Datos del proyecto y equipo · los demás cambios están en su módulo · no se puede editar', 'Aún no hay cambios de los datos del proyecto ni del equipo.')}
        project={project} frentes={frentesEfectivos} finanzas={finanzas} rentabilidad={rentabilidad} supuestos={supuestos}
        motivoNd={motivoNd} fechas={fechasProyecto} rutaDe={rutaDe} financiamientoIndicativo={financiamientoIndicativo(creditos)}
        escenarios={escenarios} quiebres={quiebres}
        version={typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'desarrollo'}
      />
    ),
    permisos: (
      <>
        <section data-seccion="frentes">
          <WorkstreamsPanel
            frentes={frentesEfectivos}
            onCambiarEstado={puedeEditar ? handleCambiarEstado : undefined}
            onDetalleGuardar={puedeEditar ? handleDetalleEntregable : undefined}
            onAgregar={puedeEditar ? handleAgregarEntregable : undefined}
            onEliminar={puedeEditar ? handleEliminarEntregable : undefined}
            projectId={project.id}
            evidencias={evidencias}
            puedeEditar={puedeEditar}
            onEvidenciasCambio={handleEvidenciasCambio}
            evidenciaGarantias={resumenGarantiasEvidencia ?? null}
            ultimosCambios={ultimosCambios}
            nombreProyecto={project.name}
            fechaRtb={project.fechaRtb}
            cargando={cargaEntregables.cargando}
            errorCarga={cargaEntregables.error}
            esEjemplo={project.esEjemplo}
          />
        </section>
        {historialDe('permisos', 'Historial de entregables', 'Estado, fechas, responsables, altas, bajas y documentos de los entregables · no se puede editar', 'Aún no hay cambios en los entregables.')}
      </>
    ),
    garantias: (
      <>
        <section data-seccion="garantias">
          <GuaranteesTable
            garantias={garantias}
            alertas={alertas}
            cargando={cargaGarantias.cargando}
            errorCarga={cargaGarantias.error}
            onGuardada={handleGarantiaGuardada}
            projectId={project.id}
            fechaRtb={project.fechaRtb}
            fechasClave={fechasProyecto}
            margen={margenGarantias}
            onMargenGuardado={handleMargenGuardado}
            onAgregada={handleGarantiaAgregada}
            onEliminada={handleGarantiaEliminada}
            puedeEditar={puedeEditar}
            evidencias={evidenciasGarantias}
            estadoDocumentos={evidenciaGarantias?.porGarantia ?? null}
            onEvidenciasCambio={handleEvidenciasGarantiaCambio}
          />
        </section>
        {historialDe('garantias', 'Historial de garantías', 'Datos, bajas, documentos y margen de las garantías · no se puede editar', 'Aún no hay cambios en las garantías.')}
      </>
    ),
    finanzas: vistaFinanzas(ubicacion.search) === 'estados' ? (
      <>
        <PestanasFinanzas vista="estados" />
        <EstadosFinancieros estados={estados} supuestos={supuestosConCreditos} motivo={motivoNd} />
      </>
    ) : (
      <>
        <PestanasFinanzas vista="modelo" />
        <section data-seccion="financiero">
          <FinancialDashboard
            finanzas={finanzas}
            rentabilidad={rentabilidad}
            comparacion={comparacion}
            comparacionDepreciacion={comparacionDepreciacion}
            sensibilidad={sensibilidad}
            precioMinimo={precioMinimo}
            supuestos={supuestosConCreditos}
            esEjemplo={!!project.esEjemplo}
            estado={project.state}
            cargaSupuestos={cargaFinanciera}
            creditos={creditos}
            condicionesCreditos={condicionesCreditos}
            problemasCreditos={problemasCreditos}
            porCredito={porCredito}
            onCreditosGuardados={handleCreditosGuardados}
            escenarios={escenarios}
            quiebres={quiebres}
            projectId={project.id}
            onSupuestosGuardados={handleSupuestosGuardados}
            puedeEditar={puedeEditar}
            onExportarAnalisis={handleExportarAnalisis}
            problemasDepreciacion={problemasDep}
          />
        </section>
        {supuestos?.ivaActivo && (
          <section data-seccion="iva">
            <TarjetaIva supuestos={supuestos} rentabilidad={rentabilidad} costoIva={costoIva} />
          </section>
        )}
        <section data-seccion="oportunidades">
          <OportunidadesOptimizacion oportunidades={oportunidades} disponible={Boolean(rentabilidad)} />
        </section>
        <section data-seccion="cronograma-caja">
          <ConstructionTimeline
            finanzas={finanzas}
            fechaRtb={project.fechaRtb}
            projectId={project.id}
            cargando={cargaCronograma.cargando}
            errorCarga={cargaCronograma.error}
            onMovimientoGuardado={handleMovimientoGuardado}
            onMovimientoEliminado={handleMovimientoEliminado}
            onMovimientosCopiados={handleMovimientosCopiados}
            onEjemploRestaurado={() => setMovimientos([])}
            esEjemplo={project.esEjemplo}
            puedeEditar={puedeEditar}
            iva={rentabilidad?.iva ?? null}
          />
        </section>
        {historialDe('finanzas', 'Historial de supuestos', 'Cambios de los supuestos financieros y del CAPEX · no se puede editar', 'Aún no hay cambios en los supuestos.')}
      </>
    ),
    cronograma: (
      <>
        <Hitos fechas={fechasProyecto} conInterconexion />
        <section data-seccion="avance-plan">
          <RtbStatusBar
            project={project}
            capacidad={formatearCapacidad(finanzas.mwac, finanzas.mwdc)}
            frentes={frentesEfectivos}
            alertas={alertas}
            avance={avance}
            onRtbGuardada={handleRtbGuardada}
            puedeEditar={puedeEditar}
            vista="cronograma"
          />
        </section>
        <LineaTiempo frentes={frentesEfectivos} garantias={garantias} fechas={fechasProyecto} margen={margenGarantias} alertas={alertas}
          fechaRtb={project.fechaRtb} rutaDe={rutaDe}
          accion={<ExportarMsProject nombreProyecto={project.name} fechaRtb={project.fechaRtb} frentes={frentesEfectivos} />} />
        {historialDe('cronograma', 'Historial del cronograma', 'Cambios de la fecha RTB objetivo · las fechas de los entregables están en Permisos y frentes · no se puede editar', 'Aún no hay cambios de la fecha RTB objetivo.')}
      </>
    ),
    documentos: (
      <Documentos frentes={frentesEfectivos} garantias={garantias} evidencias={evidencias} evidenciasGarantias={evidenciasGarantias}
        documentos={documentosPorEntregable} evidenciaGarantias={resumenGarantiasEvidencia} rutaDe={rutaDe}
        puedeEditar={puedeEditar} correoPropio={session?.user?.email ?? null} />
    ),
    configuracion: puedeEditar ? (
      <Configuracion project={project} esDueno={esDueno} rutaDe={rutaDe}
        onEditar={() => setEditarProyectoAbierto(true)} onEquipo={() => setEquipoAbierto(true)} onArchivar={() => setConfirmarArchivo(true)} />
    ) : <SinAccesoConfiguracion rutaResumen={rutaDe('resumen')} />,
  } : null;

  const criticasProyecto = project ? contarAlertas(alertas).criticas : null;
  const criticasPortafolio = portafolio.cargando ? null : portafolio.tarjetas.reduce((a, t) => a + t.criticas, 0);
  const porModulo = project ? criticasPorModulo(alertas).porModulo : {};
  // Resumen cuenta todas las críticas del proyecto; cada módulo, las suyas
  const modulosMenu = project ? modulosVisibles(puedeEditar).map(m => ({ to: rutaDe(m.ruta), texto: m.nombre, criticas: m.clave === 'resumen' ? criticasProyecto : porModulo[m.clave] ?? 0 })) : [];
  const moduloActual = enInicio ? 'Inicio (portafolio de proyectos)' : `${nombreModulo(moduloRuta ?? 'resumen')} del proyecto`;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f1f5f9', fontFamily: 'sans-serif' }}>
      <BannerPrueba />
      <BarraSuperior
        proyectos={projects}
        proyecto={project}
        onElegirProyecto={(id) => navegar(`/proyectos/${id}/${MODULOS.some(m => m.ruta === moduloRuta) ? moduloRuta : 'resumen'}`)}
        criticas={project ? criticasProyecto : enInicio ? criticasPortafolio : undefined}
        etiquetaCriticas={project ? `de ${project.name}` : 'del portafolio'}
        onAsistente={() => setAsistenteAbierto(!asistenteAbierto)}
        asistenteAbierto={asistenteAbierto}
        puedeEditar={puedeEditar}
        correo={session.user.email}
        onSalir={handleLogout}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', maxWidth: '1640px', margin: '0 auto', paddingRight: asistenteAbierto ? 'min(410px, 100vw)' : 0, boxSizing: 'border-box' }}>
        <MenuLateral criticasPortafolio={criticasPortafolio} modulos={modulosMenu} />
        <main style={{ flex: '1 1 min(640px, 100%)', minWidth: 0, padding: 'clamp(16px, 3vw, 28px)' }}>
          {/* Si una página falla, el error se muestra aquí y el menú sigue funcionando; se recupera al cambiar de página */}
          <LimiteDeError clave={ubicacion.pathname}>
          <Routes>
            <Route path="/" element={<Navigate to="/proyectos" replace />} />
            <Route path="/proyectos" element={
              <Inicio portafolio={portafolio} proyectos={projects} archivados={archivedProjects} puedeCrear={puedeCrear} onEliminar={handleEliminarArchivado}
                onNuevo={() => setIsModalOpen(true)} onRestaurar={handleRestoreProject} />
            } />
            <Route path="/proyectos/:id" element={<IrAResumen />} />
            {MODULOS.map(m => (
              <Route key={m.ruta} path={`/proyectos/:id/${m.ruta}`} element={
                <ProyectoRuta cargando={loadingProjects && !project} proyecto={project} archivado={archivedProjects.some(a => a.id === idRuta)} modulo={m.clave}>
                  {paginas?.[m.clave]}
                </ProyectoRuta>
              } />
            ))}
            <Route path="/proyectos/:id/*" element={<IrAResumen />} />
            <Route path="*" element={<NoEncontrada />} />
          </Routes>
          </LimiteDeError>
        </main>
      </div>

      <footer role="contentinfo" style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 clamp(16px, 4vw, 32px) 96px', fontSize: '11.5px', color: '#64748b', lineHeight: 1.5 }}>
        {AVISO_LEGAL}
        <div style={{ marginTop: '8px' }}><EnlacesLegales /></div>
      </footer>

      {/* Asistente: panel lateral en cualquier página; recibe el módulo actual como contexto */}
      <AiAssistantChat
        {...contextoAsistente({ project, proyectoParaIA, alertas, moduloActual })}
        abierto={asistenteAbierto}
        onCambiarAbierto={setAsistenteAbierto}
      />

      <NewProjectModal
        isOpen={isModalOpen && puedeCrear}
        onClose={() => setIsModalOpen(false)}
        onProjectCreated={handleProjectCreated}
      />

      {equipoAbierto && project && esDueno && (
        <EquipoModal projectId={project.id} nombreProyecto={project.name} onCerrar={() => setEquipoAbierto(false)} onCambio={() => recargarHistorial(project.id)} />
      )}

      {editarProyectoAbierto && project && puedeEditar && (
        <EditarProyectoModal proyecto={project} supuestos={supuestos} onGuardado={handleProyectoEditado} onCerrar={() => setEditarProyectoAbierto(false)} />
      )}

      {/* Confirmación de archivo dentro de la página */}
      {confirmarArchivo && project && (
        <div onClick={() => !archivando && setConfirmarArchivo(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(15, 23, 42, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000, padding: '16px' }}>
          <div role="dialog" aria-modal="true" aria-labelledby="titulo-archivar" onClick={(e) => e.stopPropagation()} style={{ backgroundColor: '#ffffff', borderRadius: '12px', padding: '24px', width: '420px', maxWidth: '100%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', display: 'grid', gap: '12px' }}>
            <h2 id="titulo-archivar" style={{ margin: 0, fontSize: '18px', color: '#0f172a' }}>¿Archivar "{project.name}"?</h2>
            <p style={{ margin: 0, fontSize: '14px', color: '#475569', lineHeight: 1.5 }}>
              El proyecto saldrá del portafolio activo. Sus datos se conservan y puedes restaurarlo desde el Histórico de archivados.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button autoFocus onClick={() => setConfirmarArchivo(false)} disabled={archivando} style={{ backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>
                Cancelar
              </button>
              <button onClick={handleArchiveCurrentProject} disabled={archivando} style={{ backgroundColor: '#b91c1c', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer', fontSize: '13px' }}>
                {archivando ? 'Archivando…' : 'Archivar planta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {aviso && (
        <div role="status" style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', zIndex: 2100, backgroundColor: aviso.tipo === 'error' ? '#7f1d1d' : '#14532d', color: '#ffffff', padding: '10px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '600', boxShadow: '0 8px 20px rgba(0,0,0,0.25)' }}>
          {aviso.texto}
        </div>
      )}
    </div>
  );
}