// Evidencia de los entregables completos y textos del cupo del asistente por rol.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resumenEvidencia, textoEvidencia } from '../src/lib/evidencia';
import { textoCupo, mensajeLimite, textoReinicio, agotaCupo, proximoReinicio, mensajeError } from '../src/lib/cupoAsistente';
import fs from 'node:fs';

const leer = (ruta: string) => fs.readFileSync(ruta, 'utf8');
const AJUSTES = 'supabase/migrations/20261016100000_asistente_ajustes.sql';
import { validarProyecto, type Frente } from '../src/lib/validaciones';

const frentes: Frente[] = [
  { nombre: 'Permisos', items: [
    ['Licencia de construcción', 'completo', 'Municipio', '2027-02-10', { id: 'e1', codigo: 'permisos_licencia_construccion' }],
    ['Permiso de generación', 'completo', 'CNE', '2027-01-15', { id: 'e2', codigo: 'permisos_generacion' }],
    ['Licencia de uso de suelo', 'curso', 'Municipio', '2026-05-30', { id: 'e3', codigo: 'permisos_uso_suelo' }],
  ] },
  { nombre: 'Terreno', items: [['Contrato de arrendamiento', 'completo', 'Notaría', '2026-03-12', { id: 'e4', codigo: 'terreno_arrendamiento' }]] },
];

describe('Indicador "N completos · M con evidencia" y etiqueta "Sin evidencia"', () => {
  test('cuenta los completos y cuáles tienen al menos un documento', () => {
    const r = resumenEvidencia(frentes, { e1: 2, e3: 1 });
    assert.deepEqual([r.completos, r.conEvidencia], [3, 1]);
    assert.deepEqual(r.sinEvidencia.map((e) => e.id), ['e2', 'e4']);
    assert.equal(textoEvidencia(r), '1 de 3 completos con documento');
  });
  test('un documento de un entregable no completo no cuenta como evidencia de un completo', () => {
    assert.equal(resumenEvidencia(frentes, { e3: 5 }).conEvidencia, 0);
  });
  test('cero documentos y singular', () => {
    assert.equal(textoEvidencia(resumenEvidencia([frentes[1]], {})), '0 de 1 completo con documento');
  });
  test('entregable sin id (aún no guardado) cuenta como sin evidencia', () => {
    const f: Frente[] = [{ nombre: 'X', items: [['Nuevo', 'completo', 'R', null]] }];
    assert.deepEqual(resumenEvidencia(f, {}).sinEvidencia, [{ titulo: 'Nuevo', id: null }]);
  });
});

describe('Alerta de completos sin documento (advertencia a 180 días o menos del RTB)', () => {
  const alertas = (documentos?: Record<string, number>, fechaRtb: string | null = '2027-12-31', hoy = '2026-10-13') =>
    validarProyecto({ proyecto: { name: 'P', fechaRtb }, frentes, garantias: [], hoy, documentos })
      .filter((a) => a.id === 'evidencia');
  test('a más de 180 días del RTB: informativa, con el conteo y los nombres', () => {
    const [a] = alertas({ e1: 1 });
    assert.equal(a.sev, 'info');
    assert.equal(a.titulo, '2 entregables completos sin documento');
    assert.match(a.detalle, /^1 de 3 completos con documento. Sin documento: Permiso de generación, Contrato de arrendamiento.$/);
  });
  test('a 180 días o menos del RTB: advertencia, con los días que faltan', () => {
    const [a] = alertas({ e1: 1 }, '2027-03-31'); // 169 días
    assert.equal(a.sev, 'advertencia');
    assert.match(a.detalle, /Faltan 169 días para el RTB objetivo/);
    assert.equal(alertas({ e1: 1 }, '2027-04-11')[0].sev, 'advertencia'); // exactamente 180
    assert.equal(alertas({ e1: 1 }, '2027-04-12')[0].sev, 'info'); // 181
  });
  test('si el RTB objetivo ya pasó: advertencia', () => {
    const [a] = alertas({ e1: 1 }, '2026-09-30');
    assert.equal(a.sev, 'advertencia');
    assert.match(a.detalle, /ya pasó/);
  });
  test('sin RTB objetivo: informativa', () => assert.equal(alertas({ e1: 1 }, null)[0].sev, 'info'));
  test('con todos los completos respaldados no hay alerta', () => assert.deepEqual(alertas({ e1: 1, e2: 1, e4: 3 }), []));
  test('si la app no pasa los documentos (no se pudieron leer), no se inventa la alerta', () => assert.deepEqual(alertas(undefined), []));
  test('marcar "Completo" sin documento sigue permitido: nunca es crítica', () => {
    assert.ok([...alertas({}), ...alertas({}, '2026-01-01')].every((a) => a.sev !== 'critico'));
  });
});

describe('Contador y mensajes del asistente', () => {
  test('lector: "Te quedan N consultas hoy" (y singular)', () => {
    assert.equal(textoCupo({ rol: 'lector', limite: 5, restantes: 3 }), 'Te quedan 3 consultas hoy');
    assert.equal(textoCupo({ rol: 'lector', limite: 5, restantes: 1 }), 'Te queda 1 consulta hoy');
    assert.equal(textoCupo({ rol: 'lector', limite: 5, restantes: 0 }), 'Te quedan 0 consultas hoy');
  });
  test('el dueño ve el cupo global; el editor, lo que le queda (sin la reserva del dueño)', () => {
    assert.equal(textoCupo({ rol: 'dueno', limite: 20, restantes: 12 }), 'Cupo del día: 12 de 20 consultas');
    assert.equal(textoCupo({ rol: 'editor', limite: 10, restantes: 7 }), 'Te quedan 7 consultas hoy');
  });
  test('mensaje claro según el motivo, con la hora del reinicio', () => {
    assert.match(mensajeLimite('limite_lector', null, new Date('2026-11-15T18:00:00Z')), /Llegaste a tu límite de consultas de hoy.*a las 2:00 a\.m\..*pídele al dueño/);
    assert.match(mensajeLimite('reserva_dueno'), /disponibles para el equipo.*reservadas para el dueño/);
    assert.match(mensajeLimite('cupo_global'), /Se agotó el cupo diario del asistente/);
    assert.match(mensajeLimite('otro'), /No quedan consultas disponibles/);
  });
});

describe('Ajuste 1: la reserva es solo del dueño; el editor puede tener límite propio', () => {
  test('editor con límite propio agotado: mismo mensaje claro que el lector', () => {
    assert.match(mensajeLimite('limite_editor', '2026-10-14T07:00:00Z'), /^Llegaste a tu límite de consultas de hoy en este proyecto\. Se reinicia a la 1:00/);
  });
  test('la migración calcula el cupo del editor sin tocar la reserva y con su límite opcional', () => {
    const sql = leer(AJUSTES);
    assert.match(sql, /v_equipo := c\.cupo_global_diario - c\.reserva_dueno_diaria - v_global/);
    // El dueño es el único con el cupo global completo
    assert.match(sql, /elsif v_rol = 'dueno' then\s+return query select v_rol, c\.cupo_global_diario/);
    // Editor: su límite propio es opcional (sin valor por defecto); lector: el predeterminado
    assert.match(sql, /when v_rol = 'lector' then coalesce\(m\.limite_asistente_diario, c\.limite_lector_defecto\) else m\.limite_asistente_diario end/);
    assert.match(sql, /'limite_' \|\| v_rol/);
  });
});

describe('Ajuste 2: 429 de Google y reinicio alineado con la cuota de Google', () => {
  test('la cuota diaria de Gemini se reinicia a medianoche del Pacífico: el contador usa esa zona (configurable)', () => {
    const sql = leer(AJUSTES);
    assert.match(sql, /set default 'America\/Los_Angeles'/);
    assert.match(sql, /set zona_horaria = 'America\/Los_Angeles'/);
    assert.match(sql, /ai\.google\.dev\/gemini-api\/docs\/rate-limits/);
    // La base calcula el reinicio con la zona configurada (horario de verano o invierno de cada fecha), sin horas fijas
    assert.match(sql, /\(public\.dia_asistente\(\) \+ 1\)::timestamp at time zone \(select zona_horaria from public\.configuracion_asistente where id\)/);
    assert.match(leer('docs/OPERACION.md'), /medianoche del Pacífico/);
  });
  test('hora del reinicio en hora del centro de México (1:00 en horario de verano de EE. UU., 2:00 en invierno)', () => {
    assert.equal(textoReinicio('2026-10-14T07:00:00Z'), 'a la 1:00 a.m. (hora del centro de México)');
    assert.equal(textoReinicio('2026-12-15T08:00:00Z'), 'a las 2:00 a.m. (hora del centro de México)');
  });
  test('noviembre: medianoche del Pacífico = 2:00 a.m. del centro de México (calculado, no fijo)', () => {
    const ahora = new Date('2026-11-15T18:00:00Z'); // 15 nov, mediodía en México
    assert.equal(proximoReinicio(ahora).toISOString(), '2026-11-16T08:00:00.000Z');
    // Sin dato del servidor (o inválido), la app lo calcula
    assert.equal(textoReinicio(null, ahora), 'a las 2:00 a.m. (hora del centro de México)');
    assert.equal(textoReinicio('no es fecha', ahora), 'a las 2:00 a.m. (hora del centro de México)');
    assert.match(mensajeLimite('limite_lector', null, ahora), /Se reinicia a las 2:00 a\.m\. \(hora del centro de México\)/);
    // Con el dato del servidor (reinicio_asistente), el mismo resultado
    assert.match(mensajeLimite('cuota_google', '2026-11-16T08:00:00+00:00'), /Se reinicia a las 2:00 a\.m\./);
  });
  test('octubre: 1:00 a.m.; noches del cambio de horario en EE. UU. (1 nov 2026 y 14 mar 2027)', () => {
    assert.equal(textoReinicio(null, new Date('2026-10-13T18:00:00Z')), 'a la 1:00 a.m. (hora del centro de México)');
    // 31 oct (aún horario de verano): el reinicio del 1 nov es a la 1:00; el del 2 nov ya es a las 2:00
    assert.equal(proximoReinicio(new Date('2026-10-31T23:00:00Z')).toISOString(), '2026-11-01T07:00:00.000Z');
    assert.equal(proximoReinicio(new Date('2026-11-01T12:00:00Z')).toISOString(), '2026-11-02T08:00:00.000Z');
    // 13 mar (aún invierno): 2:00; desde el 14 mar, 1:00
    assert.equal(textoReinicio(null, new Date('2027-03-13T12:00:00Z')), 'a las 2:00 a.m. (hora del centro de México)');
    assert.equal(textoReinicio(null, new Date('2027-03-14T12:00:00Z')), 'a la 1:00 a.m. (hora del centro de México)');
  });
  test('justo antes y después del reinicio de noviembre', () => {
    assert.equal(proximoReinicio(new Date('2026-11-16T07:59:00Z')).toISOString(), '2026-11-16T08:00:00.000Z');
    assert.equal(proximoReinicio(new Date('2026-11-16T08:01:00Z')).toISOString(), '2026-11-17T08:00:00.000Z');
  });
  test('cuota de Google agotada: mensaje de límite diario y la consulta no se descuenta', () => {
    const m = mensajeLimite('cuota_google', '2026-10-14T07:00:00Z');
    assert.match(m, /límite diario del asistente/);
    assert.match(m, /no se descontó de tu cupo/);
    assert.match(m, /Se reinicia a la 1:00/);
    assert.equal(agotaCupo('cuota_google'), true);
  });
  test('límite por minuto de Google: espera un minuto y el contador no se agota', () => {
    assert.match(mensajeLimite('limite_minuto'), /Espera un minuto.*no se descontó/);
    assert.equal(agotaCupo('limite_minuto'), false);
    assert.equal(agotaCupo('limite_lector'), true);
  });
  test('gemini-proxy devuelve la consulta en cualquier fallo de Gemini, incluido el 429', () => {
    const proxy = leer('supabase/functions/gemini-proxy/index.ts');
    const capturado = proxy.slice(proxy.indexOf('} catch (error) {', proxy.indexOf('replyText')));
    // Toda salida por error devuelve la consulta, y devolverConsulta llama a liberar_consulta_asistente
    assert.match(capturado, /const seDevolvio = usoId \? await devolverConsulta\(\) : true/);
    assert.match(proxy, /const devolverConsulta = async[\s\S]*?rpcConSesion\('liberar_consulta_asistente'/);
    assert.match(proxy, /porMinuto \? 'limite_minuto' : 'cuota_google'/);
  });
});

describe('Ajuste 3: el dueño ve el número de consultas de cada persona, no su chat', () => {
  test('Equipo muestra las consultas de hoy y no lee el chat', () => {
    const modal = leer('src/EquipoModal.jsx');
    const api = leer('src/lib/equipoApi.js');
    assert.match(modal, /usadasHoy/);
    for (const codigo of [modal, api]) assert.doesNotMatch(codigo, /assistant_messages|cargarHistorial/);
  });
  test('la base solo da el conteo (usadas_hoy) al dueño; assistant_messages sigue siendo privado', () => {
    const sql = leer(AJUSTES);
    assert.match(sql, /case when public\.es_dueno\(p_project_id\) then coalesce\(\(select n from usos/);
    assert.doesNotMatch(sql, /policy[^;]*assistant_messages/i);
    assert.match(leer('supabase/migrations/20261011210000_historial_asistente.sql'), /assistant_messages_select_propios[\s\S]*using \(user_id = \(select auth\.uid\(\)\)\)/);
  });
  test('los valores predeterminados viven en un solo lugar: la tabla configuracion_asistente', () => {
    // La app no fija cupo, reserva ni límite: los lee de la base (cupo_asistente)
    const sql = leer('supabase/migrations/20261015100000_asistente_por_rol.sql');
    assert.match(sql, /cupo_global_diario\s+integer not null default 20/);
    assert.match(sql, /reserva_dueno_diaria\s+integer not null default 10/);
    assert.match(sql, /limite_lector_defecto integer not null default 5/);
  });
});

describe('Fallos del servicio de IA: la consulta se devuelve y el contador no se bloquea', () => {
  test('solo los motivos de cupo dejan el contador en 0', () => {
    for (const m of ['limite_lector', 'limite_editor', 'reserva_dueno', 'cupo_global', 'sin_acceso', 'cuota_google']) assert.equal(agotaCupo(m), true, m);
    for (const m of ['ia_saturada', 'ia_tiempo', 'ia_sin_conexion', 'ia_rechazo', 'ia_configuracion', 'ia_sin_respuesta', 'error_interno', 'limite_minuto', null, undefined]) {
      assert.equal(agotaCupo(m), false, String(m));
    }
  });
  test('mensaje: el del servidor (en español) para fallos de IA; el de cupo lo arma la app', () => {
    assert.equal(mensajeError({ motivo: 'ia_saturada', error: 'El servicio de IA está saturado. Intenta en unos minutos; esta consulta no se descontó.' }),
      'El servicio de IA está saturado. Intenta en unos minutos; esta consulta no se descontó.');
    assert.match(mensajeError({ motivo: 'limite_lector', error: 'x', reinicia: '2026-10-14T07:00:00Z' }), /Llegaste a tu límite.*1:00 a\.m\./);
    assert.match(mensajeError({}), /no pudo responder/);
  });
  test('el servidor responde antes de que el navegador se rinda (45 s de presupuesto frente a 60 s)', () => {
    const chat = fs.readFileSync('src/AiAssistantChat.jsx', 'utf8');
    const proxy = fs.readFileSync('supabase/functions/gemini-proxy/index.ts', 'utf8');
    const navegador = Number(chat.match(/setTimeout\(\(\) => controller\.abort\(\), (\d+)\)/)![1]);
    const servidor = Number(proxy.match(/GEMINI_PRESUPUESTO_MS'\)\) \|\| ([\d_]+)/)![1].replace(/_/g, ''));
    assert.equal(navegador, 60_000);
    assert.equal(servidor, 45_000);
    // Margen para reservar el cupo, armar el contexto, devolver la consulta y la red
    assert.ok(navegador - servidor >= 10_000, `${navegador} - ${servidor}`);
  });
  test('gemini-proxy nunca pasa el texto de Google al usuario', () => {
    const proxy = fs.readFileSync('supabase/functions/gemini-proxy/index.ts', 'utf8');
    assert.doesNotMatch(proxy, /throw new Error\(data\.error\?\.message/);
    assert.match(proxy, /El servicio de IA está saturado\. Intenta en unos minutos\{devuelta\}/);
  });
  test('título del chat: "Tu conversación sobre <proyecto>"', () => {
    const chat = fs.readFileSync('src/AiAssistantChat.jsx', 'utf8');
    assert.match(chat, /`Tu conversación sobre \$\{proyecto\?\.name \?\? 'este proyecto'\}`/);
    assert.doesNotMatch(chat, /`Historial de \$\{/);
  });
});
