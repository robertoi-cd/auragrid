// Textos de la versión de prueba: banner, aviso de privacidad y términos de uso. BORRADORES pendientes de revisión
// legal; el contacto es el perfil de LinkedIn del responsable. Los datos técnicos (región de Supabase, servicios
// externos) salen de la auditoría del 19 oct 2026.

export const AVISO_VERSION_PRUEBA = 'Versión de prueba: usa datos ficticios. No captures información confidencial de proyectos reales.';
export const PENDIENTE_REVISION_LEGAL = 'Pendiente de revisión legal';
/** Contacto para preguntas y para ejercer los derechos (en lugar de un correo). */
export const CONTACTO_LINKEDIN = 'https://www.linkedin.com/in/robertoimb';
export const NOMBRE_RESPONSABLE = 'Roberto Imbers';
export const REGION_SUPABASE = 'Estados Unidos (AWS us-east-2, Ohio)';
export const ACTUALIZADO = '19 de octubre de 2026';

/** Documento legal: título, introducción y secciones [título, párrafos o listas]. */
export const AVISO_PRIVACIDAD = {
  ruta: '/privacidad',
  titulo: 'Aviso de privacidad',
  introduccion: `Este aviso explica qué datos guarda AuraGrid durante su versión de prueba, para qué los usa, dónde se guardan y cómo puedes pedir que se borren. La versión de prueba es privada y por invitación: usa datos ficticios y no captures información confidencial de proyectos reales.`,
  secciones: [
    ['Responsable de los datos', [
      `Responsable: ${NOMBRE_RESPONSABLE} (contacto por LinkedIn).`,
    ], { revisionLegal: true }],
    ['Contacto', [
      `Para cualquier pregunta sobre tus datos o para ejercer tus derechos, envía un mensaje por LinkedIn a ${CONTACTO_LINKEDIN}.`,
    ]],
    ['Qué datos guardamos', [
      'Tu correo electrónico y tu contraseña (la contraseña la guarda cifrada el servicio de autenticación; nadie de AuraGrid puede verla).',
      'Los datos de los proyectos que capturas: nombre, ubicación, capacidad, CAPEX, supuestos financieros, créditos, garantías, entregables, cronograma de caja y los documentos PDF que subes.',
      'El historial de cambios de cada proyecto (qué cambió, cuándo y el correo de quién lo cambió), el registro de accesos y de exportaciones, y el equipo de cada proyecto con su rol.',
      'Tus conversaciones con el asistente y cuántas consultas haces al día.',
    ]],
    ['Para qué los usamos', [
      'Para que la app funcione: calcular y mostrar las cifras de tus proyectos, compartirlos con tu equipo según su rol y generar los archivos que exportas.',
      'Para la seguridad y la trazabilidad: el historial y los registros de acceso permiten saber quién hizo cada cambio.',
      'Para responder tus preguntas en el asistente.',
      'No vendemos tus datos ni los usamos para publicidad.',
    ]],
    ['Dónde se guardan', [
      `En Supabase (base de datos, autenticación y archivos), con servidores en ${REGION_SUPABASE}.`,
      'La app se sirve desde Vercel; Vercel no guarda los datos de tus proyectos.',
      'La app mide visitas de forma anónima con Vercel Web Analytics (páginas vistas, país y tipo de dispositivo), sin cookies y sin identificar a las personas.',
    ]],
    ['El asistente envía datos a Google Gemini', [
      'Cuando haces una pregunta al asistente, se envían a Google Gemini tu pregunta, las cifras y alertas del proyecto que tienes abierto y la conversación en curso, para que Gemini redacte la respuesta.',
      'Google Gemini procesa esos datos fuera de México. Por eso, en la versión de prueba, no uses el asistente con información confidencial.',
      'Si un fallo del asistente se repite, se envía un aviso técnico al administrador por Telegram; ese aviso no incluye datos de proyectos ni de usuarios.',
    ]],
    ['Cuánto tiempo los conservamos', [
      'Mientras tengas acceso a la versión de prueba. Al borrar un proyecto se eliminan sus datos, documentos e historial.',
      'Si pides que se borren tus datos, o cuando termine la versión de prueba, los eliminamos en un máximo de 30 días.',
      'Los respaldos que hace el administrador se guardan en un lugar privado y se eliminan en un máximo de 8 semanas.',
    ]],
    ['Tus derechos', [
      'Puedes pedir acceso a tus datos, su corrección, su borrado o oponerte a su uso (derechos de acceso, rectificación, cancelación y oposición).',
      `Envía un mensaje por LinkedIn a ${CONTACTO_LINKEDIN} indicando tu correo de acceso y lo que pides; te responderemos en un máximo de 20 días hábiles.`,
    ]],
    ['Cambios a este aviso', [
      'Si cambia este aviso, lo publicaremos en esta página con su nueva fecha.',
    ]],
  ],
};

export const TERMINOS_USO = {
  ruta: '/terminos',
  titulo: 'Términos de uso',
  introduccion: 'Estos términos aplican a la versión de prueba de AuraGrid, una herramienta de apoyo para el desarrollo de proyectos solares.',
  secciones: [
    ['Versión de prueba', [
      'El acceso es solo por invitación y puede cambiar, interrumpirse o terminar en cualquier momento.',
      'Usa datos ficticios. No captures información confidencial de proyectos reales.',
      'La app se ofrece "tal como está", sin garantía de disponibilidad, de exactitud de los cálculos ni de conservación de los datos.',
    ]],
    ['No es asesoría', [
      'Los cálculos, alertas y respuestas del asistente son estimaciones con los datos capturados y no constituyen asesoría financiera, legal ni fiscal. Valida las decisiones con tus asesores.',
    ]],
    ['Tu cuenta y tu equipo', [
      'Eres responsable de tu contraseña y de lo que se hace con tu cuenta.',
      'El dueño de cada proyecto decide quién forma parte de su equipo y con qué rol (editor o lector).',
    ]],
    ['Uso aceptable', [
      'No intentes acceder a proyectos que no te compartieron, alterar la app o sus datos, ni usarla para algo ilícito.',
      'Podemos suspender el acceso a quien no respete estos términos.',
    ]],
    ['Datos personales', [
      'El uso de tus datos se explica en el Aviso de privacidad.',
    ]],
    ['Contacto', [
      `Para cualquier duda, envía un mensaje por LinkedIn a ${CONTACTO_LINKEDIN}.`,
    ]],
  ],
};

export const DOCUMENTOS_LEGALES = [AVISO_PRIVACIDAD, TERMINOS_USO];
