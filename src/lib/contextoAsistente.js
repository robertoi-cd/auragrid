// Qué recibe el asistente según la página. El proyecto abierto sale de la lista de proyectos del usuario (ya filtrada
// por RLS: los suyos y los compartidos con él); un id que no está en ella no abre nada. En Inicio, o sin acceso, el
// asistente no recibe datos de ningún proyecto (projectId null: la base lo cobra como dueño o lo rechaza).

/** Proyecto de la ruta /proyectos/:id/… dentro de los proyectos a los que el usuario tiene acceso, o null. */
export const proyectoDeRuta = (proyectos, id) => (id ? proyectos.find((p) => p.id === id) ?? null : null);

/** Props del asistente: { proyecto, alertas, projectId }, con el módulo actual como primera cifra. */
export function contextoAsistente({ project, proyectoParaIA, alertas, moduloActual }) {
  if (!project || !proyectoParaIA) return { proyecto: null, alertas: [], projectId: null };
  return {
    proyecto: { ...proyectoParaIA, cifras: [{ etiqueta: 'Módulo que está viendo el usuario', valor: moduloActual }, ...proyectoParaIA.cifras] },
    alertas,
    projectId: project.id,
  };
}
