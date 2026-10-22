// Estilos comunes de las páginas de los módulos (tarjetas oscuras, como los componentes del tablero).
export const tarjeta = { backgroundColor: '#1c2028', border: '1px solid #323843', borderRadius: '12px', padding: '18px 22px', display: 'grid', gap: '12px', color: '#e8e6e1', fontFamily: 'sans-serif', minWidth: 0 };
export const h2 = { margin: 0, fontSize: '16px', fontWeight: 700 };
export const gris = { fontSize: '12px', color: '#9aa1ad' };
export const enlace = { color: '#7cc4ff', fontWeight: 600, textDecoration: 'none', fontSize: '12px' };
export const boton = { padding: '5px 11px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '12px', cursor: 'pointer' };
export const campo = { padding: '5px 8px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: '#22272f', color: '#e8e6e1', fontSize: '12px', maxWidth: '100%', colorScheme: 'dark' };
export const textoDias = (d) => (d == null ? '' : d === 0 ? 'hoy' : d > 0 ? `en ${d} días` : `hace ${-d} días`);
