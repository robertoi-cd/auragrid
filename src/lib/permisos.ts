// Reglas de interfaz que dependen del rol del usuario en sus proyectos (los permisos reales los aplica la base).

/**
 * "+ Nuevo Parque Solar": visible si el usuario es dueño de algún proyecto, o si no tiene ninguno (cuenta nueva que
 * crea el primero). Se oculta a quien solo tiene proyectos compartidos (p. ej. un banco con acceso de lector).
 * roles: el rol del usuario en cada proyecto que ve (activos y archivados).
 */
export function puedeCrearProyectos(roles: (string | null | undefined)[]): boolean {
  return roles.some((r) => r === 'dueno') || !roles.some((r) => r && r !== 'dueno');
}

/**
 * "Guardar" del límite diario en Equipo: solo si el campo cambió respecto a lo guardado (así no queda en el historial
 * un cambio "4 → 4"). texto: lo escrito en el campo ('' = predeterminado o sin límite); miembro: lo guardado.
 */
export function limiteCambio(texto: string, miembro: { limite: number | null; limitePropio: boolean }): boolean {
  const guardado = miembro.limitePropio && miembro.limite != null ? String(miembro.limite) : '';
  const escrito = texto.trim() === '' ? '' : String(Number(texto));
  return escrito !== guardado;
}
