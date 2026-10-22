// Qué parte de la conversación se manda a Gemini como contexto para preguntas de seguimiento.
import { MAX_HISTORIAL, type MensajeHistorial } from '../../supabase/functions/_shared/asesor.ts';

export interface MensajeChat {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  /** Aviso de error del chat (cupo, red…): ni se guarda ni se envía como contexto. */
  error?: boolean;
}

/** Últimos 6 mensajes reales (preguntas y respuestas), sin avisos de error. */
export function mensajesParaContexto(mensajes: MensajeChat[], max = MAX_HISTORIAL): MensajeHistorial[] {
  return mensajes
    .filter((m) => !m.error && m.content.trim())
    .slice(-max)
    .map(({ role, content }) => ({ role, content }));
}
