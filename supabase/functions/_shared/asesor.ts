// Reglas del asesor y armado del contexto que recibe Gemini.
// Fuente única: lo usan la Edge Function gemini-proxy (Deno) y el frontend (src/lib/validaciones.ts).
// Sin dependencias, para que funcione igual en ambos entornos.

export const MAX_PREGUNTA = 2000;

export const INSTRUCCION_SISTEMA = `Eres el asesor de desarrollo de AuraGrid para parques solares fotovoltaicos en México. Ayudas a llevar proyectos hasta RTB (ready to build).

Reglas obligatorias:
1. No calcules, estimes, redondees ni conviertas cifras. Usa solo las cifras del bloque DATOS DEL PROYECTO, copiadas tal como aparecen. Si te piden una cifra que no está ahí, di que no está en el modelo y qué dato haría falta.
2. Las alertas ya las calculó el motor de validaciones de AuraGrid. No cambies su severidad ni inventes alertas nuevas; puedes priorizarlas y explicar cómo resolverlas.
3. Si el bloque ALERTAS ACTIVAS contiene alertas, nunca digas ni insinúes que el proyecto no tiene riesgos, que está "optimizado" o "en orden". Si el bloque dice "Ninguna.", di que el motor no detectó alertas, no que el proyecto esté libre de riesgos.
4. Cuándo detallar las alertas: si la pregunta trata de riesgos, alertas, financiamiento, deuda, caja, garantías, RTB o qué atender primero, menciona las alertas pertinentes completas, las críticas primero. Las alertas INFORMATIVAS son seguimiento sin riesgo inmediato (p. ej. una prórroga que vence en más de 90 días): preséntalas como tales, nunca como urgentes. En cualquier otra pregunta responde solo lo que se pregunta y, si hay alertas críticas, agrega como máximo una línea al final (por ejemplo: "Nota: hay 2 alertas críticas activas; pregúntame por ellas si quieres el detalle").
5. Los datos del proyecto son de trabajo y pueden no estar verificados; no presentes plazos, montos ni normativa como hechos confirmados si no aparecen en los datos.
6. Responde en español, de forma concisa, en Markdown simple (negritas, viñetas y listas numeradas); no uses HTML.
7. Menciona al responsable de cada acción cuando esté en los datos. Si a alguna acción le falta responsable, no lo señales en cada una: escríbelo una sola vez al final, en una línea "Responsable por definir:" seguida de las acciones afectadas.
8. Los mensajes anteriores de la conversación sirven solo para entender preguntas de seguimiento ("¿y eso cuánto cuesta?", "explica el segundo punto"). Las cifras y alertas válidas son siempre las del bloque DATOS DEL PROYECTO y ALERTAS ACTIVAS actual, aunque una respuesta anterior diga otra cosa.`;

/** Mensajes previos que se envían como contexto (pregunta y respuesta cuentan por separado). */
export const MAX_HISTORIAL = 6;
const MAX_TEXTO_HISTORIAL = 4000;

export interface MensajeHistorial {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Historial que llega del navegador: solo los últimos 6 mensajes válidos, recortados, empezando por una
 * pregunta y alternando roles (Gemini espera usuario/modelo alternados; los consecutivos del mismo rol se unen).
 */
export function limpiarHistorial(entrada: unknown): MensajeHistorial[] {
  if (!Array.isArray(entrada)) return [];
  const validos: MensajeHistorial[] = entrada.flatMap((m) => {
    if (!m || typeof m !== 'object') return [];
    const { role, content } = m as Record<string, unknown>;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string' || !content.trim()) return [];
    return [{ role: role as MensajeHistorial['role'], content: content.trim().slice(0, MAX_TEXTO_HISTORIAL) }];
  }).slice(-MAX_HISTORIAL);

  const alternados: MensajeHistorial[] = [];
  for (const m of validos) {
    const ultimo = alternados[alternados.length - 1];
    if (ultimo && ultimo.role === m.role) ultimo.content += `\n\n${m.content}`;
    else alternados.push({ ...m });
  }
  while (alternados.length && alternados[0].role !== 'user') alternados.shift();
  return alternados;
}

/** Historial + pregunta actual en el formato `contents` de Gemini (rol "model" para el asistente). */
export function contenidosGemini(historial: MensajeHistorial[], pregunta: string) {
  const previos = historial.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }));
  // Si el historial terminara en una pregunta sin respuesta, se une a la actual para mantener la alternancia
  const ultimo = previos[previos.length - 1];
  if (ultimo && ultimo.role === 'user') {
    ultimo.parts[0].text += `\n\n${pregunta}`;
    return previos;
  }
  return [...previos, { role: 'user', parts: [{ text: pregunta }] }];
}

export type SeveridadAsesor = 'critico' | 'advertencia' | 'info';

const PESO_SEVERIDAD: Record<SeveridadAsesor, number> = { critico: 0, advertencia: 1, info: 2 };
const TEXTO_SEVERIDAD: Record<SeveridadAsesor, string> = { critico: 'CRÍTICA', advertencia: 'ADVERTENCIA', info: 'INFORMATIVA' };

export interface AlertaAsesor {
  sev: SeveridadAsesor;
  titulo: string;
  detalle: string;
  accion: string;
}

export interface CifraAsesor {
  etiqueta: string;
  valor: string;
}

export interface ProyectoAsesor {
  name: string;
  state?: string;
  /** Cifras ya calculadas y formateadas por la app; Gemini solo las cita. */
  cifras?: CifraAsesor[];
}

/** Bloques DATOS DEL PROYECTO y ALERTAS ACTIVAS que se agregan al contexto de sistema. */
export function construirContexto(proyecto: ProyectoAsesor | null, alertas: AlertaAsesor[]): string {
  const lineas: string[] = ['DATOS DEL PROYECTO (calculados por AuraGrid; cítalos sin modificarlos)'];

  if (proyecto) {
    lineas.push(`- Proyecto: ${proyecto.name}${proyecto.state ? ` (${proyecto.state})` : ''}`);
    for (const { etiqueta, valor } of proyecto.cifras ?? []) lineas.push(`- ${etiqueta}: ${valor}`);
  } else {
    lineas.push('- No hay un proyecto activo seleccionado.');
  }

  const ordenadas = [...alertas].sort((a, b) => PESO_SEVERIDAD[a.sev] - PESO_SEVERIDAD[b.sev]);
  const cuenta = (sev: SeveridadAsesor) => ordenadas.filter((a) => a.sev === sev).length;
  const informativas = cuenta('info');
  lineas.push('', `ALERTAS ACTIVAS (${cuenta('critico')} críticas, ${cuenta('advertencia')} advertencias${informativas ? `, ${informativas} informativas` : ''}; ordenadas por severidad)`);
  if (ordenadas.length === 0) lineas.push('- Ninguna.');
  ordenadas.forEach((a, i) => {
    lineas.push(`${i + 1}. [${TEXTO_SEVERIDAD[a.sev]}] ${a.titulo}. ${a.detalle} Acción recomendada: ${a.accion}`);
  });

  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// Validación de lo que llega del navegador (no se confía en el cliente)
// ---------------------------------------------------------------------------

const MAX_ALERTAS = 50;
const MAX_CIFRAS = 60;
const MAX_TEXTO = 1200;

const texto = (v: unknown, max = MAX_TEXTO): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

export function limpiarAlertas(entrada: unknown): AlertaAsesor[] {
  if (!Array.isArray(entrada)) return [];
  return entrada.slice(0, MAX_ALERTAS).flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const { sev, titulo, detalle, accion } = a as Record<string, unknown>;
    if (sev !== 'critico' && sev !== 'advertencia' && sev !== 'info') return [];
    const t = texto(titulo);
    return t ? [{ sev, titulo: t, detalle: texto(detalle), accion: texto(accion) }] : [];
  });
}

export function limpiarProyecto(entrada: unknown): ProyectoAsesor | null {
  if (!entrada || typeof entrada !== 'object') return null;
  const { name, state, cifras } = entrada as Record<string, unknown>;
  const nombre = texto(name, 200);
  if (!nombre) return null;
  return {
    name: nombre,
    state: texto(state, 100) || undefined,
    cifras: Array.isArray(cifras)
      ? cifras.slice(0, MAX_CIFRAS).flatMap((c) => {
          const { etiqueta, valor } = (c ?? {}) as Record<string, unknown>;
          const e = texto(etiqueta, 200);
          return e ? [{ etiqueta: e, valor: texto(valor, 300) }] : [];
        })
      : [],
  };
}
