import { useEffect, useState } from 'react';
import { cargarDatosPortafolio } from '../lib/portafolioApi';
import { tarjetaProyecto } from '../lib/portafolio';

// Tarjetas de Inicio: carga los datos de todos los proyectos activos (4 consultas) y arma cada tarjeta con la misma
// cadena de cálculo que el tablero. Se vuelve a cargar cada vez que se muestra Inicio (activo = true), para reflejar
// los cambios hechos dentro de un proyecto.
export function usePortafolio(proyectos, activo) {
  const [estado, setEstado] = useState({ cargando: true, error: '', tarjetas: [] });
  const ids = proyectos.map((p) => p.id).join(',');

  useEffect(() => {
    if (!activo) return undefined;
    let vigente = true;
    setEstado((e) => ({ ...e, cargando: true, error: '' }));
    cargarDatosPortafolio(proyectos.map((p) => p.id))
      .then((datos) => {
        if (!vigente) return;
        const tarjetas = proyectos.map((p) => tarjetaProyecto(p, datos.get(p.id) ?? { frentes: [], garantias: [], movimientos: [], supuestos: null, errores: {} }));
        setEstado({ cargando: false, error: '', tarjetas });
      })
      .catch((err) => {
        console.error('Error al cargar el portafolio:', err);
        if (vigente) setEstado({ cargando: false, error: 'No se pudieron leer los datos de los proyectos.', tarjetas: [] });
      });
    return () => { vigente = false; };
  }, [ids, activo]); // eslint-disable-line react-hooks/exhaustive-deps

  return estado;
}
