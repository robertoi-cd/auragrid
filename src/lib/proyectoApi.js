// Edición de los datos de un proyecto (solar_projects). RLS: solo el dueño. La base valida los valores
// (trigger validar_proyecto) y registra cada cambio en el historial (trigger registrar_cambio_proyecto).
import { supabase } from '../supabase';
import { formatearMoneda } from './formato';

export const MAX_NOMBRE_PROYECTO = 120;
export const CAPACIDAD_MAXIMA_MW = 2000;

const MENSAJES = {
  nombre_invalido: `El nombre del proyecto es obligatorio y admite hasta ${MAX_NOMBRE_PROYECTO} caracteres.`,
  estado_invalido: 'Elige el estado del proyecto.',
  capacidad_invalida: `La capacidad debe estar entre 0 y ${CAPACIDAD_MAXIMA_MW.toLocaleString('en-US')} MWac.`,
  capex_invalido: 'El CAPEX debe ser una cifra en USD.',
};

/** Guarda nombre, capacidad (MWac), estado y CAPEX (USD); devuelve la fila guardada. */
export async function actualizarProyecto(id, { nombre, capacidadMw, estado, capexUsd }) {
  const { data, error } = await supabase
    .from('solar_projects')
    .update({ name: nombre, capacity_mw: capacidadMw, state: estado, capex: formatearMoneda(capexUsd).replace(/\s/g, ' ') })
    .eq('id', id)
    .select('id, name, capacity_mw, state, capex')
    .single();
  if (error) {
    if (MENSAJES[error.hint]) throw new Error(MENSAJES[error.hint]);
    if (error.code === 'PGRST116' || error.code === '42501') throw new Error('No tienes permiso para modificar este proyecto.');
    console.error('Error al actualizar solar_projects:', [error.code, error.message].filter(Boolean).join(' '));
    throw new Error('No se pudo guardar el proyecto. Intenta de nuevo.');
  }
  return data;
}
