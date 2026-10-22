// Cupo diario del asistente (lo calcula y lo hace cumplir la base de datos; aquí solo los textos del chat).
// El dueño usa el cupo global completo. Editores y lectores, el cupo del equipo (global menos la reserva del dueño),
// con su límite diario: obligatorio para el lector, opcional para el editor.
// Los valores (cupo global, reserva, límite por lector, zona horaria) están en la tabla configuracion_asistente.

export type RolAsistente = 'dueno' | 'editor' | 'lector';
export type MotivoCupo =
  | 'limite_lector' | 'limite_editor' | 'reserva_dueno' | 'cupo_global' | 'sin_acceso'
  // Respuestas 429 de Google (la consulta se devuelve al contador en ambos casos)
  | 'cuota_google' | 'limite_minuto'
  // Fallos del servicio de IA sin respuesta para el usuario (gemini-proxy devuelve la consulta y manda el mensaje)
  | 'ia_saturada' | 'ia_tiempo' | 'ia_sin_conexion' | 'ia_rechazo' | 'ia_configuracion' | 'ia_sin_respuesta' | 'error_interno';

/** Motivos que dejan al usuario sin consultas por hoy (los demás son fallos pasajeros: se puede reintentar). */
const MOTIVOS_SIN_CUPO = new Set(['limite_lector', 'limite_editor', 'reserva_dueno', 'cupo_global', 'sin_acceso', 'cuota_google']);

export interface CupoAsistente {
  rol: RolAsistente | null;
  limite: number;
  usadas: number;
  restantes: number;
  motivo: MotivoCupo | null;
  /** Próximo reinicio del contador (ISO). La cuota diaria de Google se reinicia a medianoche del Pacífico. */
  reinicia?: string | null;
}

const ZONA_USUARIO = 'America/Mexico_City';
/** Zona de la cuota diaria de Google (la misma que configuracion_asistente.zona_horaria). */
export const ZONA_CUOTA = 'America/Los_Angeles';

/** Diferencia (minutos) entre la hora local de una zona y UTC en un instante: -420 en verano del Pacífico, -480 en invierno. */
function desfaseMinutos(instante: Date, zona: string): number {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instante).map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instante.getTime() / 1000) * 1000) / 60000;
}

/**
 * Próximo reinicio: la siguiente medianoche en la zona de la cuota (por defecto, Pacífico), con su horario de verano
 * o de invierno vigente esa noche. Es el mismo cálculo que hace la base (reinicio_asistente).
 */
export function proximoReinicio(ahora: Date = new Date(), zona: string = ZONA_CUOTA): Date {
  const hoy = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(ahora).map((x) => [x.type, Number(x.value)]));
  const medianocheComoUtc = Date.UTC(hoy.year, hoy.month - 1, hoy.day + 1);
  // El desfase se toma en la propia medianoche (dos pasos por si esa noche cambia el horario)
  let instante = medianocheComoUtc - desfaseMinutos(new Date(medianocheComoUtc), zona) * 60000;
  instante = medianocheComoUtc - desfaseMinutos(new Date(instante), zona) * 60000;
  return new Date(instante);
}

/**
 * "a la 1:00 a.m. (hora del centro de México)" o "a las 2:00 a.m. (…)": el reinicio (medianoche del Pacífico)
 * convertido a la hora del centro de México. Sin dato del servidor, se calcula aquí con proximoReinicio().
 */
export function textoReinicio(reinicia?: string | null, ahora: Date = new Date()): string {
  const delServidor = reinicia ? new Date(reinicia) : null;
  const fecha = delServidor && !Number.isNaN(delServidor.getTime()) ? delServidor : proximoReinicio(ahora);
  const partes = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: ZONA_USUARIO }).formatToParts(fecha);
  const hora = partes.map((p) => p.value).join('').replace(/[\u00a0\u202f]/g, ' ');
  const articulo = partes.find((p) => p.type === 'hour')?.value === '1' ? 'la' : 'las';
  if (/^12:00 a/.test(hora)) return 'a medianoche (hora del centro de México)';
  return `a ${articulo} ${hora} (hora del centro de México)`;
}

/** Lector o editor: "Te quedan 3 consultas hoy". Dueño: "Cupo del día: 12 de 20 consultas". */
export function textoCupo(c: Pick<CupoAsistente, 'rol' | 'limite' | 'restantes'>): string {
  if (c.rol === 'lector' || c.rol === 'editor') {
    return c.restantes === 1 ? 'Te queda 1 consulta hoy' : `Te quedan ${c.restantes} consultas hoy`;
  }
  return `Cupo del día: ${c.restantes} de ${c.limite} consultas`;
}

/**
 * ¿El motivo deja al usuario sin consultas por hoy? Solo los de cupo. El límite por minuto de Google y los fallos del
 * servicio de IA (saturado, tiempo agotado…) no: la consulta se devolvió y se puede intentar de nuevo.
 */
export function agotaCupo(motivo: MotivoCupo | string | null | undefined): boolean {
  return Boolean(motivo && MOTIVOS_SIN_CUPO.has(motivo));
}

/** Inicio (sin proyecto abierto): la base solo deja consultar a quien es dueño de algún proyecto. */
export const MENSAJE_SIN_ACCESO_INICIO = 'En Inicio el asistente solo está disponible para dueños de proyectos. Abre un proyecto para consultarlo.';

/**
 * Texto para un error del asistente: el de cupo lo arma la app (con la hora del reinicio); el resto lo manda el servidor.
 * sinProyecto: la consulta se hizo desde Inicio (sin projectId).
 */
export function mensajeError(datos: { motivo?: string | null; error?: string | null; reinicia?: string | null }, sinProyecto = false): string {
  if (datos.motivo && (MOTIVOS_SIN_CUPO.has(datos.motivo) || datos.motivo === 'limite_minuto')) return mensajeLimite(datos.motivo, datos.reinicia, new Date(), sinProyecto);
  return datos.error || 'El asistente no pudo responder. Intenta de nuevo en unos minutos.';
}

/** Mensaje claro al no poder consultar, según el motivo. */
export function mensajeLimite(motivo: MotivoCupo | string | null | undefined, reinicia?: string | null, ahora: Date = new Date(), sinProyecto = false): string {
  if (motivo === 'sin_acceso' && sinProyecto) return MENSAJE_SIN_ACCESO_INICIO;
  const reinicio = `Se reinicia ${textoReinicio(reinicia, ahora)}.`;
  switch (motivo) {
    case 'limite_lector':
    case 'limite_editor':
      return `Llegaste a tu límite de consultas de hoy en este proyecto. ${reinicio} Si necesitas más, pídele al dueño del proyecto que lo amplíe.`;
    case 'reserva_dueno':
      return `Por hoy se agotaron las consultas disponibles para el equipo; las restantes están reservadas para el dueño del proyecto. ${reinicio}`;
    case 'cupo_global':
      return `Se agotó el cupo diario del asistente. ${reinicio}`;
    case 'cuota_google':
      return `Se alcanzó el límite diario del asistente (cuota de Google agotada). Esta consulta no se descontó de tu cupo. ${reinicio}`;
    case 'limite_minuto':
      return 'Se alcanzó el límite de consultas por minuto del asistente. Espera un minuto e intenta de nuevo; esta consulta no se descontó de tu cupo.';
    case 'sin_acceso':
      return 'No tienes acceso al asistente en este proyecto.';
    default:
      return `No quedan consultas disponibles por hoy. ${reinicio}`;
  }
}
