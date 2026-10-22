// Catálogo de entregables hacia RTB. De aquí salen dos versiones:
//   - la plantilla de un proyecto nuevo: todo "pendiente", sin fechas y con responsables genéricos;
//   - el EJEMPLO (caso Alpha I, Sonora): estados y fechas ficticios, solo si el usuario lo pide y marcado como "Ejemplo".
// La migración 20261011190000_entregables_por_proyecto.sql usa estos mismos títulos.
// codigo: tipo interno fijo (project_deliverables.codigo). Las reglas usan el código, no el título, así que el
// usuario puede renombrar cualquier entregable; los que agrega él son 'otro' (migración 20261013100000).

const CATALOGO = [
  { frente: 'Terreno', items: [
    { codigo: 'terreno_arrendamiento', titulo: 'Contrato de arrendamiento a 30 años', responsable: 'Notaría', ejemplo: ['completo', '2026-03-12'] },
    { codigo: 'terreno_registro_publico', titulo: 'Inscripción en Registro Público', responsable: 'Registro Público de la Propiedad', ejemplo: ['completo', '2026-04-20', 'RPP Sonora'] },
    { codigo: 'terreno_topografia', titulo: 'Levantamiento topográfico y deslinde', responsable: 'Topógrafo', ejemplo: ['completo', '2026-05-08'] }
  ] },
  { frente: 'Ambiental', items: [
    { codigo: 'ambiental_mia_presentada', titulo: 'MIA modalidad regional presentada', responsable: 'SEMARNAT', ejemplo: ['completo', '2026-06-02'] },
    { codigo: 'ambiental_mia_resolutivo', titulo: 'Resolutivo de MIA', responsable: 'SEMARNAT', ejemplo: ['curso', '2026-12-15'] },
    { codigo: 'ambiental_cambio_uso_suelo', titulo: 'Estudio técnico justificativo (cambio de uso de suelo)', responsable: 'SEMARNAT', ejemplo: ['pendiente', '2027-01-20'] }
  ] },
  { frente: 'Social', items: [
    { codigo: 'social_evis_presentada', titulo: 'EVIS presentada', responsable: 'SENER', ejemplo: ['completo', '2026-06-30'] },
    { codigo: 'social_evis_resolutivo', titulo: 'Resolutivo de EVIS', responsable: 'SENER', ejemplo: ['curso', '2026-11-30'] }
  ] },
  { frente: 'Interconexión', items: [
    { codigo: 'interconexion_solicitud', titulo: 'Solicitud y estudio de impacto', responsable: 'CENACE', ejemplo: ['completo', '2026-02-15'] },
    { codigo: 'interconexion_estudio_instalaciones', titulo: 'Estudio de instalaciones', responsable: 'CENACE', ejemplo: ['curso', '2026-11-20'] },
    { codigo: 'interconexion_contrato', titulo: 'Contrato de interconexión', responsable: 'CENACE / CFE', ejemplo: ['pendiente', '2027-02-28'] }
  ] },
  { frente: 'Permisos', items: [
    { codigo: 'permisos_uso_suelo', titulo: 'Licencia de uso de suelo', responsable: 'Municipio', ejemplo: ['completo', '2026-05-30'] },
    { codigo: 'permisos_generacion', titulo: 'Permiso de generación', responsable: 'CNE (antes CRE)', ejemplo: ['curso', '2027-01-15'] },
    { codigo: 'permisos_licencia_construccion', titulo: 'Licencia de construcción', responsable: 'Municipio', ejemplo: ['pendiente', '2027-02-10'] }
  ] },
  { frente: 'Financiamiento y garantías', items: [
    { codigo: 'financiamiento_term_sheet', titulo: 'Term sheet firmado', responsable: 'Banco', ejemplo: ['completo', '2026-07-01'] },
    { codigo: 'financiamiento_due_diligence', titulo: 'Due diligence técnica y legal', responsable: 'Asesores del banco', ejemplo: ['completo', '2026-09-15'] },
    { codigo: 'financiamiento_tramo_2', titulo: 'Aprobación de crédito tramo 2', responsable: 'Comité de crédito', ejemplo: ['curso', '2026-12-10'] },
    { codigo: 'garantias_vigencia', titulo: 'Garantías con la vigencia requerida', responsable: 'Afianzadora', ejemplo: ['bloqueado', '2026-12-31'] }
  ] },
  { frente: 'Construcción', items: [
    { codigo: 'construccion_cronograma_epc', titulo: 'Cronograma EPC nivel 3', responsable: 'EPC', ejemplo: ['completo', '2026-08-20'] },
    { codigo: 'construccion_ingeniero_independiente', titulo: 'Aceptación del ingeniero independiente', responsable: 'Ingeniero independiente', ejemplo: ['curso', '2026-12-01'] }
  ] }
];

/** Código de cada entregable del catálogo por su título original (incluye el nombre anterior del de garantías). */
export const CODIGOS_CATALOGO = Object.fromEntries([
  ...CATALOGO.flatMap(({ items }) => items.map((it) => [it.titulo, it.codigo])),
  ['Garantías vigentes hasta RTB', 'garantias_vigencia'],
]);

/** Filas para guardar en project_deliverables: plantilla vacía o ejemplo. */
export function filasEntregables(ejemplo = false) {
  return CATALOGO.flatMap(({ frente, items }, frenteOrden) => items.map((it, orden) => ({
    frente, frente_orden: frenteOrden, orden, titulo: it.titulo, codigo: it.codigo,
    estado: ejemplo ? it.ejemplo[0] : 'pendiente',
    responsable: ejemplo ? (it.ejemplo[2] ?? it.responsable) : it.responsable,
    fecha: ejemplo ? it.ejemplo[1] : null
  })));
}

/** Frentes de un proyecto nuevo: todo pendiente y sin fechas. Cada entregable: [título, estado, responsable, fecha|null]. */
export const PLANTILLA_FRENTES = CATALOGO.map(({ frente, items }) => ({
  nombre: frente, items: items.map((it) => [it.titulo, 'pendiente', it.responsable, null, { codigo: it.codigo }])
}));

// ---------------------------------------------------------------------------
// EJEMPLO (Alpha I). La app solo lo usa en proyectos marcados como ejemplo; también lo usan las pruebas.
// ---------------------------------------------------------------------------

export const FECHA_RTB_EJEMPLO = '2027-03-31';

export const FRENTES_EJEMPLO = CATALOGO.map(({ frente, items }) => ({
  nombre: frente, items: items.map((it) => [it.titulo, it.ejemplo[0], it.ejemplo[2] ?? it.responsable, it.ejemplo[1], { codigo: it.codigo }])
}));

// Nombres anteriores, conservados para las pruebas existentes
export const FECHA_RTB_OBJETIVO = FECHA_RTB_EJEMPLO;
export const FRENTES_INICIALES = FRENTES_EJEMPLO;

// La app ya no lee esta lista: las garantías viven en Supabase (project_guarantees). Se conserva para las pruebas.
export const GARANTIAS = [
  {tipo:"Fianza", beneficiario:"CENACE", emisor:"Afianzadora (ejemplo)", concepto:"Garantía de interconexión", monto:1250000, vence:"2027-01-31"},
  {tipo:"Carta de crédito", beneficiario:"Proveedor de módulos", emisor:"Banco (ejemplo)", concepto:"Pago de equipos", monto:4800000, vence:"2027-06-30"},
  {tipo:"Fianza", beneficiario:"Alpha I (SPV)", emisor:"Afianzadora (ejemplo)", concepto:"Cumplimiento EPC", monto:1340000, vence:"2027-12-31"}
];
