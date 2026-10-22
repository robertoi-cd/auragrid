import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://vpsikmgnhubkydftahdl.supabase.co';
export const supabaseKey = 'sb_publishable_IWaHF0-ApvXkqzCEuhNQcw_35dVPYdd';

// Enlace con que se abrió la app (invitación, recuperación de contraseña o un enlace vencido). Se lee antes de
// crear el cliente, que limpia el fragmento de la URL al tomar la sesión.
const fragmento = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : new URLSearchParams();
export const tipoEnlaceInicial = fragmento.get('type');
export const errorEnlaceInicial = fragmento.get('error_description');

export const supabase = createClient(supabaseUrl, supabaseKey);