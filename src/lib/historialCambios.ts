// Historial de cambios de los entregables (project_change_log): formato y reglas que usa la interfaz.
// El registro lo escribe un trigger en Supabase; aquí solo se lee y se presenta.

import { formatearFecha, formatearMoneda, formatearNumero, aNumero } from './formato';
import { VIGENCIAS_REQUERIDAS, CATEGORIAS_GARANTIA, type EstadoEntregable, type VigenciaRequerida, type CategoriaGarantia } from './validaciones';

export type CampoCambio = 'estado' | 'fecha' | 'responsable' | 'titulo' | 'alta' | 'baja' | 'baja_garantia'
  | 'garantia_concepto' | 'garantia_tipo' | 'garantia_beneficiario' | 'garantia_categoria'
  | 'proyecto_nombre' | 'proyecto_capacidad' | 'proyecto_estado' | 'proyecto_capex' | 'proyecto_rtb' | 'proyecto_margen'
  | 'proyecto_archivo' | 'supuesto'
  | 'miembro_alta' | 'miembro_rol' | 'miembro_baja' | 'miembro_limite'
  | 'evidencia_alta' | 'evidencia_baja' | 'garantia_doc_alta' | 'garantia_doc_baja';

export interface RegistroCambio {
  id: string;
  deliverableId: string | null;
  entregable: string;
  campo: CampoCambio;
  valorAnterior: string | null;
  valorNuevo: string | null;
  motivo: string | null;
  tipo: 'cambio' | 'correccion';
  /** Correo de quien hizo el cambio (null si no se conoce). */
  usuario: string | null;
  /** Momento del cambio (timestamp ISO). */
  momento: string;
}

export const ESTADOS_ENTREGABLE: EstadoEntregable[] = ['pendiente', 'curso', 'completo', 'bloqueado'];

export const ETIQUETAS_ESTADO: Record<EstadoEntregable, string> = {
  pendiente: 'Pendiente', curso: 'En curso', completo: 'Completo', bloqueado: 'Bloqueado',
};

const NOMBRE_CAMPO: Record<CampoCambio, string> = {
  estado: 'Estado', fecha: 'Fecha compromiso', responsable: 'Responsable', titulo: 'Nombre', alta: 'Alta', baja: 'Baja', baja_garantia: 'Baja de garantía',
  garantia_concepto: 'Nombre', garantia_tipo: 'Tipo', garantia_beneficiario: 'Beneficiario', garantia_categoria: 'Qué garantiza',
  proyecto_nombre: 'Nombre del proyecto', proyecto_capacidad: 'Capacidad', proyecto_estado: 'Estado (ubicación)', proyecto_capex: 'CAPEX',
  proyecto_rtb: 'RTB objetivo', proyecto_margen: 'Margen de garantías', proyecto_archivo: 'Portafolio', supuesto: 'Supuesto',
  miembro_alta: 'Acceso', miembro_rol: 'Rol', miembro_baja: 'Acceso', miembro_limite: 'Límite del asistente',
  evidencia_alta: 'Documento', evidencia_baja: 'Documento', garantia_doc_alta: 'Documento', garantia_doc_baja: 'Documento',
};
const ROLES: Record<string, string> = { editor: 'editor', lector: 'lector', dueno: 'dueño' };

const ESTADOS_GARANTIA: Record<string, string> = { vigente: 'Vigente', en_renovacion: 'En renovación', liberada: 'Liberada' };

/** Pasar de "Completo" a cualquier otro estado exige motivo (también lo valida la base de datos). */
export function requiereMotivo(anterior: EstadoEntregable, nuevo: EstadoEntregable): boolean {
  return anterior === 'completo' && nuevo !== 'completo';
}

export function valorLegible(campo: CampoCambio, valor: string | null): string {
  if (campo === 'estado') return valor && valor in ETIQUETAS_ESTADO ? ETIQUETAS_ESTADO[valor as EstadoEntregable] : (valor ?? '—');
  if (campo === 'fecha') return valor ? formatearFecha(valor) : 'Sin fecha';
  if (campo === 'garantia_categoria') return CATEGORIAS_GARANTIA[valor as CategoriaGarantia] ?? (valor ?? '—');
  if (campo === 'proyecto_rtb') return valor ? formatearFecha(valor) : 'Sin definir';
  if (campo === 'proyecto_capacidad') return valor ? `${formatearNumero(Number(valor))} MWac` : '—';
  if (campo === 'proyecto_capex') return valor ? formatearMoneda(aNumero(valor)) : '—';
  if (campo === 'proyecto_margen') return valor ? `${valor} días` : '—';
  if (campo === 'proyecto_archivo') return valor === 'archivado' ? 'Archivado' : 'Activo';
  if (campo === 'responsable') return valor?.trim() ? valor : 'Sin responsable';
  return valor?.trim() ? valor : '—';
}

/**
 * "Estado: En curso → Completo"; altas y bajas: "Entregable agregado al frente Ambiental" / "Entregable eliminado (…)".
 * Supuestos ("columna=valor"): con `etiquetas` (columna → nombre legible) se muestran con su nombre.
 */
const ESTADOS_CREDITO_HISTORIAL: Record<string, string> = { aprobado: 'Aprobado', en_revision: 'En revisión', pendiente: 'Pendiente' };

export function describirCambio(r: Pick<RegistroCambio, 'campo' | 'valorAnterior' | 'valorNuevo'>, etiquetas: Record<string, string> = {}): string {
  if (r.campo === 'supuesto') {
    // Créditos de la deuda: alta y baja ("credito=alta" / "credito=baja")
    if (r.valorNuevo === 'credito=alta') return 'Crédito agregado';
    if (r.valorNuevo === 'credito=baja') return 'Crédito eliminado';
    const [columna, antes] = (r.valorAnterior ?? '').split(/=(.*)/s);
    const despues = (r.valorNuevo ?? '').split(/=(.*)/s)[1];
    const valor = (v: string | undefined) => (columna === 'estado' && v ? ESTADOS_CREDITO_HISTORIAL[v] ?? v : v) || '—';
    return `${etiquetas[columna] ?? columna}: ${valor(antes)} → ${valor(despues)}`;
  }
  if (r.campo === 'alta') return `Entregable agregado al frente ${r.valorNuevo ?? '—'}`;
  // Documentos de entregables y de garantías (el motivo de una baja se muestra aparte)
  if (r.campo === 'evidencia_alta' || r.campo === 'garantia_doc_alta') return `Evidencia agregada: ${r.valorNuevo ?? '—'}`;
  if (r.campo === 'evidencia_baja' || r.campo === 'garantia_doc_baja') return `Evidencia eliminada: ${r.valorAnterior ?? '—'}`;
  // Equipo: valor_nuevo de una alta puede traer el límite ("lector (2 consultas/día)")
  const rol = (v: string | null) => (v ? v.replace(/^(editor|lector|dueno)/, (m) => ROLES[m] ?? m) : '—');
  if (r.campo === 'miembro_alta') return `Acceso otorgado como ${rol(r.valorNuevo)}`;
  if (r.campo === 'miembro_rol') return `Rol: ${rol(r.valorAnterior)} → ${rol(r.valorNuevo)}`;
  if (r.campo === 'miembro_baja') return `Acceso retirado (era ${rol(r.valorAnterior)})`;
  if (r.campo === 'miembro_limite') {
    const limite = (v: string | null) => (v == null || v === 'predeterminado' ? 'predeterminado' : `${v} consultas/día`);
    return `Límite del asistente: ${limite(r.valorAnterior)} → ${limite(r.valorNuevo)}`;
  }
  if (r.campo === 'baja') {
    // valor_anterior = "frente · estado · fecha · responsable" (los registros anteriores no traen responsable)
    const [frente, estado, fecha, responsable] = (r.valorAnterior ?? '').split(' · ');
    const detalle = [frente, estado && valorLegible('estado', estado), fecha && valorLegible('fecha', fecha), responsable && `resp. ${responsable}`]
      .filter(Boolean).join(' · ');
    return `Entregable eliminado${detalle ? ` (${detalle})` : ''}`;
  }
  if (r.campo === 'baja_garantia') {
    // valor_anterior = "emisor · monto · vence · vigencia requerida[:fecha] · estado · renovaciones"
    const [emisor, monto, vence, vigencia, estado, renovaciones] = (r.valorAnterior ?? '').split(' · ');
    const [clave, fechaVigencia] = (vigencia ?? '').split(':');
    const nombreVigencia = VIGENCIAS_REQUERIDAS[clave as VigenciaRequerida];
    const n = Number(renovaciones);
    const detalle = [
      emisor && `emisor ${emisor}`,
      monto && Number.isFinite(Number(monto)) && formatearMoneda(Number(monto)),
      vence && `vencía ${formatearFecha(vence)}`,
      nombreVigencia && `vigencia requerida hasta ${clave === 'fecha' && fechaVigencia ? formatearFecha(fechaVigencia) : nombreVigencia}`,
      estado && (ESTADOS_GARANTIA[estado] ?? estado),
      n > 0 && `${n} ${n === 1 ? 'renovación' : 'renovaciones'}`,
    ].filter(Boolean).join(' · ');
    return `Garantía eliminada${detalle ? ` (${detalle})` : ''}`;
  }
  return `${NOMBRE_CAMPO[r.campo]}: ${valorLegible(r.campo, r.valorAnterior)} → ${valorLegible(r.campo, r.valorNuevo)}`;
}

/** "12 oct 2026, 09:52" en la hora local del navegador. */
export function formatearMomento(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const fecha = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }).format(d).replace('.', '');
  const hora = new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${fecha}, ${hora}`;
}

/** Último cambio de cada entregable (por id), sin importar el orden en que lleguen los registros. */
export function ultimoCambioPorEntregable(registros: RegistroCambio[]): Map<string, RegistroCambio> {
  const ultimos = new Map<string, RegistroCambio>();
  for (const r of registros) {
    if (!r.deliverableId) continue;
    const actual = ultimos.get(r.deliverableId);
    if (!actual || r.momento > actual.momento) ultimos.set(r.deliverableId, r);
  }
  return ultimos;
}

/** Fila de project_change_log → RegistroCambio. */
export function aRegistroCambio(fila: Record<string, unknown>): RegistroCambio {
  return {
    id: String(fila.id),
    deliverableId: (fila.deliverable_id as string | null) ?? null,
    entregable: String(fila.entregable ?? ''),
    campo: fila.campo as CampoCambio,
    valorAnterior: (fila.valor_anterior as string | null) ?? null,
    valorNuevo: (fila.valor_nuevo as string | null) ?? null,
    motivo: (fila.motivo as string | null) ?? null,
    tipo: fila.tipo === 'correccion' ? 'correccion' : 'cambio',
    usuario: (fila.user_email as string | null) ?? null,
    momento: String(fila.created_at),
  };
}

// ---------------------------------------------------------------------------
// Historial para el lector: sin correos de otras personas (el dueño y los editores sí los ven)
// ---------------------------------------------------------------------------

const CORREO = /[^\s@()<>,;:"']+@[^\s@()<>,;:"']+\.[^\s@()<>,;:"'.]+/g;
/** Quien registra un cambio siempre es dueño o editor: el lector no puede modificar el proyecto. */
export const AUTOR_OCULTO = 'Dueño o editor del proyecto';

/**
 * Registro como lo ve un lector: los correos de otras personas se quitan (el suyo se conserva) y los cambios del
 * equipo se describen por el rol ("Se agregó un editor"). Las cifras y fechas no cambian.
 */
export function registroParaLector(r: RegistroCambio, correoPropio: string | null): RegistroCambio & { descripcion: string } {
  const propio = (correoPropio ?? '').toLowerCase();
  const esPropio = (c: string | null) => Boolean(c && propio && c.toLowerCase() === propio);
  const ocultar = (t: string | null) => (t == null ? t : t.replace(CORREO, (c) => (esPropio(c) ? c : 'otra persona')));
  const rol = (v: string | null) => (v ? v.replace(/^(editor|lector|dueno)/, (m) => ROLES[m] ?? m) : 'miembro');
  const deEquipo = r.campo.startsWith('miembro_');
  const tuyo = deEquipo && esPropio((r.entregable.match(CORREO) ?? [])[0] ?? null);
  const descripcion =
    r.campo === 'miembro_alta' ? (tuyo ? `Se te dio acceso como ${rol(r.valorNuevo)}` : `Se agregó un ${rol(r.valorNuevo)}`)
      : r.campo === 'miembro_baja' ? `Se retiró el acceso a un ${rol(r.valorAnterior)}`
      : r.campo === 'miembro_rol' ? `${tuyo ? 'Tu rol' : 'Un miembro cambió de rol'}: ${rol(r.valorAnterior)} → ${rol(r.valorNuevo)}`
      : r.campo === 'miembro_limite' ? `${tuyo ? 'Tu límite del asistente' : 'Límite del asistente de un miembro'}: ${describirCambio(r).replace(/^Límite del asistente: /, '')}`
      : describirCambio({ ...r, valorAnterior: ocultar(r.valorAnterior), valorNuevo: ocultar(r.valorNuevo) });
  return {
    ...r,
    entregable: deEquipo ? 'Equipo' : ocultar(r.entregable) ?? '',
    valorAnterior: ocultar(r.valorAnterior),
    valorNuevo: ocultar(r.valorNuevo),
    motivo: ocultar(r.motivo),
    usuario: r.usuario == null ? null : esPropio(r.usuario) ? r.usuario : AUTOR_OCULTO,
    descripcion,
  };
}
