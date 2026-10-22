// Título de la pestaña del navegador y rutas que existen en la app (lo demás es la página 404).
import { nombreModulo, MODULOS } from './modulos';
import { DOCUMENTOS_LEGALES } from './textosLegales';

export const NOMBRE_APP = 'AuraGrid';

/** Quita la "/" final (React Router trata "/proyectos/" igual que "/proyectos"). */
const normalizar = (ruta) => (ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta);

/** Rutas de la app: Inicio, cualquier ruta de un proyecto (un módulo que no existe lleva a su Resumen) y las legales. */
export function rutaConocida(ruta) {
  const r = normalizar(ruta);
  return r === '/' || r === '/proyectos' || /^\/proyectos\/[^/]+(\/.*)?$/.test(r) || DOCUMENTOS_LEGALES.some((d) => d.ruta === r);
}

/** "Finanzas · Alpha I · AuraGrid": dice dónde estás, útil con varias pestañas abiertas. */
export function tituloPestana({ ruta, conSesion, definirContrasena = null, proyecto = null, modulo = null }) {
  const r = normalizar(ruta);
  const con = (...partes) => [...partes, NOMBRE_APP].join(' · ');
  const legal = DOCUMENTOS_LEGALES.find((d) => d.ruta === r);
  if (legal) return con(legal.titulo);
  if (!conSesion) return con('Iniciar sesión');
  if (definirContrasena) return con('Definir contraseña');
  if (!rutaConocida(r)) return con('Página no encontrada');
  if (r === '/' || r === '/proyectos') return con('Inicio');
  if (!proyecto) return con('Proyecto');
  return con(nombreModulo(MODULOS.find((m) => m.ruta === modulo)?.clave ?? 'resumen'), proyecto);
}
