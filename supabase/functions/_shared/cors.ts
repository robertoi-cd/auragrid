// CORS de gemini-proxy: solo los orígenes de la lista blanca (secreto ORIGENES_PERMITIDOS, separados por comas).
// Sin comodines: una vista previa de Vercel se agrega con su URL exacta. Un origen que no está en la lista no recibe
// Access-Control-Allow-Origin y el navegador bloquea la respuesta. Es una capa adicional: la función ya exige un JWT
// de usuario (verify_jwt y rol authenticated) y el cupo se cuenta por usuario.
// Sin dependencias, para probarla con tsx igual que _shared/asesor.ts.

/** Si el secreto no está configurado, solo la app local. */
export const ORIGEN_LOCAL = 'http://localhost:5173';

export const CABECERAS_PERMITIDAS = 'authorization, x-client-info, apikey, content-type';

/** Lista blanca a partir del secreto: sin espacios ni "/" final; descarta comodines y lo que no sea http(s). */
export function origenesPermitidos(valor: string | null | undefined): string[] {
  const lista = (valor ?? '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  const validos = lista.filter((o) => !o.includes('*') && /^https?:\/\/[^/\s]+$/.test(o));
  return validos.length ? [...new Set(validos)] : [ORIGEN_LOCAL];
}

/** Cabeceras CORS para el Origin de la petición: lo devuelve solo si está en la lista; siempre con Vary: Origin. */
export function cabecerasCors(origen: string | null, permitidos: string[]): Record<string, string> {
  const base: Record<string, string> = { 'Access-Control-Allow-Headers': CABECERAS_PERMITIDAS, Vary: 'Origin' };
  return origen && permitidos.includes(origen) ? { ...base, 'Access-Control-Allow-Origin': origen } : base;
}
