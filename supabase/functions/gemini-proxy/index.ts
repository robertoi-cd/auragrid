import { INSTRUCCION_SISTEMA, MAX_PREGUNTA, construirContexto, limpiarAlertas, limpiarProyecto, limpiarHistorial, contenidosGemini } from "../_shared/asesor.ts"
import { origenesPermitidos, cabecerasCors } from "../_shared/cors.ts"

// Control de frecuencia en memoria para la alerta de Telegram (cooldown de 24 horas)
let lastAlertTime = 0;
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;

// Tiempos. El navegador espera 60 s (AiAssistantChat): la función siempre responde antes, para que la consulta se
// devuelva al cupo cuando no hay respuesta. Si el navegador se rindiera primero, nadie recibiría la respuesta y la
// consulta quedaría cobrada (eso pasó el 13 oct 2026 con Gemini saturado).
const PRESUPUESTO_GEMINI_MS = Number(Deno.env.get('GEMINI_PRESUPUESTO_MS')) || 45_000 // todos los intentos y esperas
const INTENTO_MAX_MS = Number(Deno.env.get('GEMINI_INTENTO_MS')) || 25_000             // cada intento
const ESPERA_INICIAL_MS = Number(Deno.env.get('GEMINI_ESPERA_MS')) || 1_500             // se duplica en cada reintento
const MARGEN_MINIMO_MS = Math.min(2_000, PRESUPUESTO_GEMINI_MS / 10)                    // no se empieza un intento con menos

// Fallo de Gemini sin contenido para el usuario. tipo decide el mensaje en español (nunca el texto de Google).
type TipoFallo = 'saturado' | 'tiempo' | 'red' | 'rechazo' | 'configuracion' | 'sin_respuesta'
class FalloGemini extends Error {
  constructor(public tipo: TipoFallo, public status?: number) {
    super(`Gemini: ${tipo}${status ? ` (HTTP ${status})` : ''}`)
  }
}

// Reintenta solo fallos temporales (5xx, red, tiempo agotado) mientras quede presupuesto. Cualquier 4xx (incluido
// 429, cupo agotado) se devuelve de inmediato: reintentar solo gastaría más cupo.
async function llamarGemini(url: string, options: RequestInit): Promise<Response> {
  const limite = Date.now() + PRESUPUESTO_GEMINI_MS
  let espera = ESPERA_INICIAL_MS
  let ultimo: FalloGemini = new FalloGemini('tiempo')
  for (let intento = 1; ; intento++) {
    const restante = limite - Date.now()
    if (restante < MARGEN_MINIMO_MS) throw ultimo
    try {
      const respuesta = await fetch(url, { ...options, signal: AbortSignal.timeout(Math.min(INTENTO_MAX_MS, restante)) })
      if (respuesta.status < 500) return respuesta
      await respuesta.body?.cancel()
      ultimo = new FalloGemini('saturado', respuesta.status)
    } catch (error) {
      const nombre = error instanceof Error ? error.name : ''
      ultimo = new FalloGemini(nombre === 'TimeoutError' || nombre === 'AbortError' ? 'tiempo' : 'red')
    }
    console.warn(`Intento ${intento} a Gemini sin éxito (${ultimo.message}).`)
    if (limite - Date.now() < espera + MARGEN_MINIMO_MS) throw ultimo
    await new Promise((resolve) => setTimeout(resolve, espera))
    espera *= 2
  }
}

// Error con código HTTP propio (p. ej. 429 cuando se agota el cupo de Gemini)
class ErrorHttp extends Error {
  constructor(message: string, public status: number, public codigo?: string, public motivo?: string) {
    super(message)
  }
}

// Respuestas sin contenido: estado HTTP, motivo (lo usa el chat) y mensaje. "{devuelta}" se sustituye por
// "; esta consulta no se descontó." si la consulta se devolvió al cupo, o por "." si no se pudo devolver.
// La cuota diaria de Google se reinicia a medianoche del Pacífico (https://ai.google.dev/gemini-api/docs/rate-limits);
// el contador de AuraGrid usa la misma zona (configuracion_asistente.zona_horaria).
const FALLOS: Record<string, { status: number; codigo: string; texto: string }> = {
  cuota_google: { status: 429, codigo: 'CUOTA_DIARIA', texto: 'Se alcanzó el límite diario del asistente (cuota de Google agotada). Se reinicia a medianoche, hora del Pacífico{devuelta}' },
  limite_minuto: { status: 429, codigo: 'LIMITE_POR_MINUTO', texto: 'Se alcanzó el límite de consultas por minuto del asistente. Espera un minuto e intenta de nuevo{devuelta}' },
  ia_saturada: { status: 503, codigo: 'IA_SATURADA', texto: 'El servicio de IA está saturado. Intenta en unos minutos{devuelta}' },
  ia_tiempo: { status: 504, codigo: 'IA_TIEMPO_AGOTADO', texto: 'El servicio de IA tardó demasiado en responder. Intenta de nuevo en unos minutos{devuelta}' },
  ia_sin_conexion: { status: 502, codigo: 'IA_SIN_CONEXION', texto: 'No se pudo conectar con el servicio de IA. Intenta de nuevo en unos minutos{devuelta}' },
  ia_rechazo: { status: 502, codigo: 'IA_RECHAZO', texto: 'El servicio de IA no pudo procesar esta pregunta. Reformúlala o intenta más tarde{devuelta}' },
  ia_configuracion: { status: 503, codigo: 'IA_CONFIGURACION', texto: 'El asistente no está disponible por un problema de configuración. Avisa al dueño del proyecto{devuelta}' },
  ia_sin_respuesta: { status: 502, codigo: 'IA_SIN_RESPUESTA', texto: 'El servicio de IA no devolvió una respuesta. Intenta reformular la pregunta{devuelta}' },
  error_interno: { status: 500, codigo: 'ERROR_INTERNO', texto: 'El asistente tuvo un error interno. Intenta de nuevo{devuelta}' },
}
const MOTIVO_POR_TIPO: Record<TipoFallo, string> = {
  saturado: 'ia_saturada', tiempo: 'ia_tiempo', red: 'ia_sin_conexion', rechazo: 'ia_rechazo', configuracion: 'ia_configuracion', sin_respuesta: 'ia_sin_respuesta',
}
const textoFallo = (motivo: string, devuelta: boolean) =>
  (FALLOS[motivo] ?? FALLOS.error_interno).texto.replace('{devuelta}', devuelta ? '; esta consulta no se descontó.' : '.')

// "a la 1:00 a.m. (hora del centro de México)" / "a las 2:00 a.m. (…)": el reinicio que calcula la base (medianoche
// del Pacífico, con su horario de verano o de invierno) convertido a la hora del centro de México.
function textoReinicio(reinicia: string | null): string | null {
  const fecha = reinicia ? new Date(reinicia) : null
  if (!fecha || Number.isNaN(fecha.getTime())) return null
  const partes = new Intl.DateTimeFormat('es-MX', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Mexico_City' }).formatToParts(fecha)
  const hora = partes.map((p) => p.value).join('').replace(/[\u00a0\u202f]/g, ' ')
  if (/^12:00 a/.test(hora)) return 'a medianoche (hora del centro de México)'
  return `a ${partes.find((p) => p.type === 'hour')?.value === '1' ? 'la' : 'las'} ${hora} (hora del centro de México)`
}
// Sustituye "a medianoche, hora del Pacífico" por la hora calculada, si se conoce
const conReinicio = (mensaje: string, reinicia: string | null) => {
  const texto = textoReinicio(reinicia)
  return texto ? mensaje.replace('a medianoche, hora del Pacífico', texto) : mensaje
}

const respuestaJson = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } })

// AuraGrid aún no guarda la geometría del terreno ni exporta KML/KMZ (pendiente en ROADMAP.md, "Módulo de terrenos").
// El asistente no debe generar KML ni coordenadas: no habría forma de descargarlos y serían datos no verificados.
const DIRECTRIZ_GEOLOCALIZACION = `GEOLOCALIZACIÓN: AuraGrid todavía no guarda la ubicación ni el polígono del terreno y no exporta archivos KML/KMZ ni para Google Earth. Si el usuario pide polígonos, coordenadas, mapas o archivos KML/KMZ, explica que esa exportación aún no está disponible en la app (está planeada en el módulo de terrenos) y no escribas KML, KMZ ni coordenadas.`

// Cupo diario del asistente por rol (tabla configuracion_asistente). Se reserva una consulta ANTES de llamar a Gemini,
// con la sesión del usuario (así la base aplica su rol y su límite), y se libera si Gemini falla.
const MENSAJES_CUPO: Record<string, string> = {
  limite_lector: 'Llegaste a tu límite de consultas de hoy en este proyecto. Se reinicia a medianoche, hora del Pacífico.',
  limite_editor: 'Llegaste a tu límite de consultas de hoy en este proyecto. Se reinicia a medianoche, hora del Pacífico.',
  reserva_dueno: 'Por hoy se agotaron las consultas disponibles para el equipo; las restantes están reservadas para el dueño del proyecto.',
  cupo_global: 'Se agotó el cupo diario del asistente. Se reinicia a medianoche, hora del Pacífico.',
  sin_acceso: 'No tienes acceso al asistente en este proyecto.',
}

// Para el modelo: un lector consulta, pero no puede modificar nada en AuraGrid
const DIRECTRIZ_LECTOR = 'USUARIO: lector del proyecto (solo lectura). Puede consultar todos los datos, pero no puede modificar nada en AuraGrid: no le pidas que edite, registre, suba ni cambie datos en la app; si algo requiere una acción, sugiérele comentarlo con el equipo del proyecto.'

async function rpcConSesion(nombre: string, argumentos: unknown, autorizacion: string): Promise<any> {
  const url = Deno.env.get('SUPABASE_URL')
  const clave = Deno.env.get('SUPABASE_ANON_KEY')
  if (!url || !clave) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en la función.')
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: clave, Authorization: autorizacion, 'Content-Type': 'application/json' },
    body: JSON.stringify(argumentos),
  })
  const datos = await r.json().catch(() => null)
  if (!r.ok) throw new Error(`${nombre} respondió ${r.status}: ${JSON.stringify(datos)}`)
  return datos
}

// Rol del JWT (la firma ya la validó la plataforma con verify_jwt). La clave anon trae role "anon".
function rolDelToken(req: Request): string | null {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    return JSON.parse(atob(base64)).role ?? null
  } catch {
    return null
  }
}

// CORS: lista blanca del secreto ORIGENES_PERMITIDOS (se lee en cada petición: cambiarla no requiere redesplegar).
// La respuesta de atender() recibe aquí sus cabeceras CORS.
Deno.serve(async (req: Request) => {
  const cors = cabecerasCors(req.headers.get('Origin'), origenesPermitidos(Deno.env.get('ORIGENES_PERMITIDOS')))
  if (req.method === 'OPTIONS') {
    const permitido = 'Access-Control-Allow-Origin' in cors
    return new Response(permitido ? 'ok' : 'Origen no permitido', { status: permitido ? 200 : 403, headers: cors })
  }
  const respuesta = await atender(req)
  for (const [clave, valor] of Object.entries(cors)) respuesta.headers.set(clave, valor)
  return respuesta
})

async function atender(req: Request): Promise<Response> {

  // Autenticación, capa 1: verify_jwt = true (supabase/config.toml) hace que la plataforma rechace con 401
  // cualquier llamada sin un JWT válido del proyecto antes de ejecutar este código.
  // Capa 2: la clave anon también es un JWT válido y es pública; aquí se exige el rol de un usuario con sesión.
  if (rolDelToken(req) !== 'authenticated') {
    return respuestaJson({ error: 'Debe iniciar sesión para utilizar el asistente.' }, 401)
  }

  const autorizacion = req.headers.get('authorization') ?? ''
  // Consulta reservada en el cupo diario. Toda salida sin contenido para el usuario la devuelve (una sola vez).
  let usoId: string | null = null
  let entregada = false
  let devuelta = false
  const devolverConsulta = async (): Promise<boolean> => {
    if (!usoId || entregada) return false
    if (devuelta) return true
    try {
      await rpcConSesion('liberar_consulta_asistente', { p_uso_id: usoId }, autorizacion)
      devuelta = true
    } catch (e) {
      console.error('No se pudo devolver la consulta:', e instanceof Error ? e.message : e)
    }
    return devuelta
  }
  // Si el navegador se desconecta antes de recibir la respuesta, también se devuelve (si el entorno lo permite)
  req.signal?.addEventListener('abort', () => { if (!entregada) devolverConsulta() })
  // Próximo reinicio del contador (lo calcula la base); viaja en las respuestas para que el chat muestre la hora
  let reinicia: string | null = null

  try {
    const body = await req.json().catch(() => ({}))
    // Formato: { pregunta, proyecto, alertas, historial, projectId }. El formato anterior { prompt, project } ya no se acepta:
    // usaba campos guardados del proyecto (p. ej. una TIR fija) en lugar de las cifras calculadas por la app.
    // historial: últimos mensajes de la conversación (se limpia y se limita a 6 en limpiarHistorial)
    const { pregunta, proyecto, alertas, historial } = body
    const projectId = typeof body.projectId === 'string' && body.projectId.trim() ? body.projectId.trim().slice(0, 200) : null
    const textoPregunta = typeof pregunta === 'string' ? pregunta.trim() : ''

    if (!textoPregunta) {
      return respuestaJson({ error: 'La pregunta es obligatoria.' }, 400)
    }
    if (textoPregunta.length > MAX_PREGUNTA) {
      return respuestaJson({
        error: `La pregunta tiene ${textoPregunta.length.toLocaleString('es-MX')} caracteres y el máximo es ${MAX_PREGUNTA.toLocaleString('es-MX')}. Resúmela o divídela en varias preguntas.`,
        codigo: 'PREGUNTA_MUY_LARGA',
      }, 400)
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error('La variable de entorno GEMINI_API_KEY no está configurada en Supabase.')
      throw new FalloGemini('configuracion')
    }

    // Cupo: sin consulta reservada no se llama a Gemini. Si no se puede verificar, se rechaza (no se deja pasar).
    let reserva: { permitido: boolean; rol?: string; limite?: number; restantes?: number; motivo?: string; uso_id?: string; reinicia?: string }
    try {
      reserva = await rpcConSesion('reservar_consulta_asistente', { p_project_id: projectId }, autorizacion)
    } catch (e) {
      console.error('No se pudo reservar la consulta:', e instanceof Error ? e.message : e)
      return respuestaJson({ error: 'No se pudo verificar tu cupo de consultas. Intenta de nuevo en unos minutos.', codigo: 'CUPO_NO_VERIFICADO' }, 503)
    }
    reinicia = reserva?.reinicia ?? null
    if (!reserva?.permitido) {
      const motivo = reserva?.motivo ?? 'cupo_global'
      return respuestaJson({
        error: conReinicio(MENSAJES_CUPO[motivo] ?? MENSAJES_CUPO.cupo_global, reinicia), codigo: motivo.toUpperCase(), motivo,
        rol: reserva?.rol ?? null, limite: reserva?.limite ?? null, restantes: 0, reinicia,
      }, 429)
    }
    usoId = reserva.uso_id ?? null

    // Reglas del asesor + datos y alertas de validarProyecto(), armados aquí (no se acepta un system prompt del cliente)
    const systemContext = [
      INSTRUCCION_SISTEMA,
      DIRECTRIZ_GEOLOCALIZACION,
      ...(reserva.rol === 'lector' ? [DIRECTRIZ_LECTOR] : []),
      construirContexto(limpiarProyecto(proyecto), limpiarAlertas(alertas)),
    ].join('\n\n')

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent`

    // Reintentos con presupuesto de tiempo. La clave va en cabecera (no en la URL) para que no aparezca en registros.
    const geminiResponse = await llamarGemini(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemContext }] },
        // Hasta 6 mensajes previos + la pregunta
        contents: contenidosGemini(limpiarHistorial(historial), textoPregunta)
      })
    })

    const data = await geminiResponse.json().catch(() => ({}))

    if (!geminiResponse.ok) {
      // El texto de Google (en inglés) solo va al registro; el usuario recibe un mensaje en español
      console.error('Error de la API de Google:', geminiResponse.status, JSON.stringify(data))
      if (geminiResponse.status === 429) {
        // Gemini indica en los detalles qué cuota se agotó; si no dice que es por minuto, se trata como diaria
        const porMinuto = /PerMinute/i.test(JSON.stringify(data.error?.details ?? data))
        throw new ErrorHttp('Cuota de Google', 429, undefined, porMinuto ? 'limite_minuto' : 'cuota_google')
      }
      throw new FalloGemini(geminiResponse.status === 401 || geminiResponse.status === 403 ? 'configuracion' : 'rechazo', geminiResponse.status)
    }

    const replyText: string = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('').trim() ?? ''
    // Sin texto (p. ej. respuesta bloqueada por los filtros de Google): no se entrega nada, así que no se cobra
    if (!replyText) {
      console.error('Gemini respondió sin texto:', JSON.stringify(data).slice(0, 500))
      throw new FalloGemini('sin_respuesta')
    }
    entregada = true

    return new Response(
      JSON.stringify({ reply: replyText, rol: reserva.rol, limite: reserva.limite, restantes: reserva.restantes, reinicia }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    console.error('Error en la Edge Function:', mensaje)

    // Sin contenido para el usuario: la consulta no se cobra en el cupo diario
    const seDevolvio = usoId ? await devolverConsulta() : true
    const motivo = error instanceof FalloGemini ? MOTIVO_POR_TIPO[error.tipo]
      : error instanceof ErrorHttp && error.motivo && FALLOS[error.motivo] ? error.motivo
      : 'error_interno'
    const fallo = FALLOS[motivo]

    // SISTEMA DE ALERTA A TELEGRAM CON COOLDOWN DE 24 HORAS
    try {
      const telegramToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
      const telegramChatId = Deno.env.get('TELEGRAM_CHAT_ID');
      const now = Date.now();

      // Verifica si las credenciales existen y si ya pasaron 24 horas desde la última alerta
      if (telegramToken && telegramChatId && (now - lastAlertTime > TWENTY_FOUR_HOURS)) {
        lastAlertTime = now; // Actualiza la marca de tiempo del último envío

        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          signal: AbortSignal.timeout(3_000),
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: `🚨 **Alerta AuraGrid AI**\n\nEl asistente ha registrado un fallo definitivo tras agotar los reintentos (posible límite de cuota excedido).\n\n📄 *Detalle:* ${mensaje}\n\n_Este mensaje solo se enviará una vez cada 24 horas._`,
            parse_mode: 'Markdown'
          })
        });
      }
    } catch (telegramError) {
      console.error('No se pudo enviar la alerta a Telegram:', telegramError);
    }

    return respuestaJson({
      error: conReinicio(textoFallo(motivo, Boolean(usoId) && seDevolvio), reinicia),
      codigo: fallo.codigo, motivo, devuelta: Boolean(usoId) && seDevolvio, reinicia,
    }, fallo.status)
  }
}
