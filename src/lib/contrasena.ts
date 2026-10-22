// Reglas de la contraseña que define un usuario invitado o que recupera su acceso.
export const LARGO_MINIMO_CONTRASENA = 8;

/** Mensaje de validación de la contraseña nueva, o null si es válida. */
export function problemaContrasena(contrasena: string, confirmacion: string): string | null {
  if (contrasena.length < LARGO_MINIMO_CONTRASENA) return `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`;
  if (contrasena !== confirmacion) return 'Las dos contraseñas no coinciden.';
  return null;
}
