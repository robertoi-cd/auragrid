import React, { useState } from 'react';

const boton = { padding: '4px 10px', borderRadius: '6px', border: '1px solid #3a414d', backgroundColor: 'transparent', color: '#e8e6e1', fontSize: '12px', cursor: 'pointer' };

// Plan de entregables en XML de MS Project (MSPDI): frentes como tareas resumen y entregables como hitos.
// Se genera en el navegador (Blob application/xml, "<proyecto>_cronograma.xml"); el generador se carga solo al exportar.
async function exportarMsProject(nombreProyecto, fechaRtb, frentes) {
  const [{ planMsProject, archivoMsProject }, { descargarBlob }] = await Promise.all([import('./lib/exportarRespuesta'), import('./lib/descargar')]);
  const plan = planMsProject({ nombre: nombreProyecto || 'Proyecto', fechaRtb }, frentes);
  if (plan.tareas === 0) return { error: false, texto: 'Ningún entregable tiene fecha compromiso: no hay nada que programar en MS Project.' };
  const { nombre, blob } = archivoMsProject(nombreProyecto, plan);
  descargarBlob(blob, nombre);
  return {
    error: false,
    texto: `Se descargó ${nombre} (${plan.tareas} tareas).${plan.sinFecha.length ? ` Se omitieron ${plan.sinFecha.length} entregables sin fecha compromiso.` : ''}`,
  };
}

// Botón "Exportar a MS Project" (Cronograma). Solo descarga: también lo usa el lector.
export default function ExportarMsProject({ nombreProyecto = '', fechaRtb = null, frentes = [] }) {
  const [exportando, setExportando] = useState(false);
  const [avisoExportar, setAvisoExportar] = useState(null);
  const exportar = async () => {
    setExportando(true);
    setAvisoExportar(null);
    try {
      setAvisoExportar(await exportarMsProject(nombreProyecto, fechaRtb, frentes));
    } catch (err) {
      console.error('Error al exportar a MS Project:', err);
      setAvisoExportar({ error: true, texto: 'No se pudo generar el archivo de MS Project. Intenta de nuevo.' });
    } finally {
      setExportando(false);
    }
  };
  if (frentes.length === 0) return null;
  return (
    <div style={{ display: 'grid', gap: '6px' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
        <button type="button" style={boton} disabled={exportando} onClick={exportar}
          title="Frentes como tareas resumen y entregables como hitos en su fecha compromiso, más el hito RTB objetivo">
          {exportando ? 'Generando…' : '📅 Exportar a MS Project'}
        </button>
        <span style={{ fontSize: '11px', color: '#7d8490' }}>Se abre en MS Project: Archivo → Abrir → Formato XML</span>
      </span>
      {avisoExportar && (
        <span role={avisoExportar.error ? 'alert' : 'status'} style={{ fontSize: '12px', color: avisoExportar.error ? '#f2867b' : '#9aa1ad' }}>{avisoExportar.texto}</span>
      )}
    </div>
  );
}
