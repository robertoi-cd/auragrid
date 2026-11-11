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
