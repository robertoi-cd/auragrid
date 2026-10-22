import React, { useEffect, useState } from 'react';

// Menú "⋯" para acciones poco frecuentes o irreversibles (p. ej. Eliminar), fuera de la vista habitual de la fila.
// Se cierra al elegir una acción, al hacer clic fuera o con Escape.
export default function MenuAcciones({ etiqueta, acciones }) {
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto]);

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <button type="button" onClick={() => setAbierto(!abierto)} aria-haspopup="menu" aria-expanded={abierto} aria-label={etiqueta}
        style={{ padding: '0 6px', border: '1px solid #3a414d', borderRadius: '6px', background: 'none', color: '#c5c9d0', fontSize: '12px', lineHeight: '18px', cursor: 'pointer' }}>
        ⋯
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: 'fixed', inset: 0, zIndex: 1500 }} />
          <div role="menu" style={{ position: 'absolute', left: 0, top: 'calc(100% + 4px)', zIndex: 1501, backgroundColor: '#1e232b', border: '1px solid #3a414d', borderRadius: '8px', padding: '4px', minWidth: '150px', boxShadow: '0 8px 20px rgba(0,0,0,0.35)' }}>
            {acciones.map((a) => (
              <button key={a.texto} type="button" role="menuitem" onClick={() => { setAbierto(false); a.onClick(); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', border: 'none', borderRadius: '6px', backgroundColor: 'transparent', color: a.peligro ? '#f2867b' : '#e8e6e1', fontSize: '12px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {a.texto}
              </button>
            ))}
          </div>
        </>
      )}
    </span>
  );
}
