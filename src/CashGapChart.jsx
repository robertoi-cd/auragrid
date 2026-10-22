import React, { useState } from 'react';
import { calcularFlujoAcumulado } from './lib/modeloFinanciero';
import { diasEntre } from './lib/validaciones';
import { formatearMoneda, formatearFecha } from './lib/formato';

// Paleta validada (dataviz/validate_palette.js, modo oscuro sobre #1e293b)
const COLOR_PAGOS = '#d97706';
const COLOR_FONDOS = '#3b82f6';
const COLOR_HUECO = '#ef4444';
const TEXTO = '#cbd5e1';
const TEXTO_SUAVE = '#94a3b8';
const REJILLA = '#334155';

const ANCHO = 1100;
const ALTO = 320;
const M = { arriba: 16, derecha: 24, abajo: 34, izquierda: 112 };

const sumarDias = (iso, dias) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10);
};

// Pagos acumulados frente a fondos confirmados; las zonas sin cobertura se marcan en rojo.
export default function CashGapChart({ finanzas, fechaRtb }) {
  const [activo, setActivo] = useState(null);
  const puntos = calcularFlujoAcumulado(finanzas);
  if (puntos.length === 0) return null;

  const inicio = puntos[0].fecha;
  const fin = sumarDias(puntos[puntos.length - 1].fecha, 30);
  const totalDias = diasEntre(inicio, fin);
  const maximo = Math.max(...puntos.map(p => Math.max(p.pagosAcumulados, p.fondosConfirmados)));
  // Paso "redondo" (1, 2 o 5 × 10^k) para unas cinco divisiones
  const bruto = maximo / 5;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const paso = [1, 2, 5, 10].map(f => f * magnitud).find(p => p >= bruto);
  const divisiones = Math.ceil(maximo / paso);
  const techo = paso * divisiones;

  const anchoUtil = ANCHO - M.izquierda - M.derecha;
  const altoUtil = ALTO - M.arriba - M.abajo;
  const x = iso => M.izquierda + (diasEntre(inicio, iso) / totalDias) * anchoUtil;
  const y = v => M.arriba + altoUtil - (v / techo) * altoUtil;

  // Cada punto se mantiene constante hasta la siguiente fecha (función escalonada)
  const tramos = puntos.map((p, i) => ({ ...p, x0: x(p.fecha), x1: x(puntos[i + 1]?.fecha ?? fin) }));
  const escalon = campo => tramos.map((t, i) => `${i === 0 ? 'M' : 'L'}${t.x0},${y(t[campo])} L${t.x1},${y(t[campo])}`).join(' ');

  const conHueco = tramos.filter(t => t.hueco > 0);
  const primerHueco = conHueco[0];
  const peorHueco = conHueco.reduce((a, b) => (!a || b.hueco > a.hueco ? b : a), null);
  const xRtb = fechaRtb && fechaRtb >= inicio && fechaRtb <= fin ? x(fechaRtb) : null;
  const ticksY = Array.from({ length: divisiones + 1 }, (_, i) => i * paso);
  const ultimo = tramos[tramos.length - 1];

  const resumen = primerHueco
    ? `Hueco de caja desde el ${formatearFecha(primerHueco.fecha)}; máximo ${formatearMoneda(peorHueco.hueco)} el ${formatearFecha(peorHueco.fecha)}.`
    : 'Los fondos confirmados cubren todos los pagos programados.';

  return (
    <div style={{ backgroundColor: '#1e293b', padding: '18px 20px', borderRadius: '12px', border: '1px solid #334155', display: 'grid', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: '700', color: '#f8fafc' }}>Pagos acumulados frente a fondos confirmados</h3>
        <span style={{ fontSize: '12px', color: primerHueco ? '#f2867b' : TEXTO_SUAVE, fontWeight: primerHueco ? 600 : 400 }}>
          {primerHueco ? '⚠ ' : ''}{resumen}
        </span>
      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', fontSize: '12px', color: TEXTO }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '18px', height: '2px', backgroundColor: COLOR_PAGOS }} />Pagos acumulados</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '18px', height: '2px', backgroundColor: COLOR_FONDOS }} />Fondos confirmados (equity y deuda aprobada)</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '14px', height: '10px', backgroundColor: COLOR_HUECO, opacity: 0.35, border: `1px solid ${COLOR_HUECO}` }} />⚠ Hueco de caja</span>
      </div>

      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} style={{ width: '100%', minWidth: '520px', display: 'block' }} role="img" aria-label={`Pagos acumulados frente a fondos confirmados. ${resumen}`} onMouseLeave={() => setActivo(null)}>
          {/* Rejilla y eje Y */}
          {ticksY.map(v => (
            <g key={v}>
              <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} stroke={REJILLA} strokeWidth="1" />
              <text x={M.izquierda - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill={TEXTO_SUAVE}>{formatearMoneda(v)}</text>
            </g>
          ))}

          {/* Huecos de caja */}
          {conHueco.map(t => (
            <rect key={t.fecha} x={t.x0} width={t.x1 - t.x0} y={y(t.pagosAcumulados)} height={y(t.fondosConfirmados) - y(t.pagosAcumulados)} fill={COLOR_HUECO} fillOpacity="0.3" stroke={COLOR_HUECO} strokeOpacity="0.6" />
          ))}

          {/* RTB objetivo */}
          {xRtb !== null && (
            <g>
              <line x1={xRtb} x2={xRtb} y1={M.arriba} y2={ALTO - M.abajo} stroke={TEXTO_SUAVE} strokeDasharray="4 4" />
              <text x={xRtb + 4} y={M.arriba + 10} fontSize="11" fill={TEXTO}>RTB {formatearFecha(fechaRtb)}</text>
            </g>
          )}

          <path d={escalon('fondosConfirmados')} fill="none" stroke={COLOR_FONDOS} strokeWidth="2" strokeLinejoin="round" />
          <path d={escalon('pagosAcumulados')} fill="none" stroke={COLOR_PAGOS} strokeWidth="2" strokeLinejoin="round" />

          {/* Etiquetas directas al final de cada serie */}
          <text x={ultimo.x1 - 4} y={y(ultimo.pagosAcumulados) - 8} textAnchor="end" fontSize="11" fill={TEXTO}>Pagos {formatearMoneda(ultimo.pagosAcumulados)}</text>
          <text x={ultimo.x1 - 4} y={y(ultimo.fondosConfirmados) + 16} textAnchor="end" fontSize="11" fill={TEXTO}>Fondos {formatearMoneda(ultimo.fondosConfirmados)}</text>

          {/* Eje X: solo inicio y fin para no saturar */}
          <text x={M.izquierda} y={ALTO - 10} fontSize="11" fill={TEXTO_SUAVE}>{formatearFecha(inicio)}</text>
          <text x={ANCHO - M.derecha} y={ALTO - 10} textAnchor="end" fontSize="11" fill={TEXTO_SUAVE}>{formatearFecha(fin)}</text>

          {/* Capa de interacción */}
          {activo !== null && (
            <line x1={tramos[activo].x0} x2={tramos[activo].x0} y1={M.arriba} y2={ALTO - M.abajo} stroke={TEXTO} strokeWidth="1" />
          )}
          {tramos.map((t, i) => (
            <rect key={t.fecha} x={t.x0} width={Math.max(t.x1 - t.x0, 1)} y={M.arriba} height={altoUtil} fill="transparent" onMouseEnter={() => setActivo(i)} />
          ))}
        </svg>

        {activo !== null && (() => {
          const t = tramos[activo];
          const izquierda = t.x0 / ANCHO > 0.6;
          return (
            <div style={{ position: 'absolute', top: '8px', [izquierda ? 'right' : 'left']: `${(izquierda ? (ANCHO - t.x0) : t.x0) / ANCHO * 100}%`, margin: '0 10px', backgroundColor: '#0f172a', border: '1px solid #475569', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', color: TEXTO, pointerEvents: 'none', whiteSpace: 'nowrap', display: 'grid', gap: '2px' }}>
              <strong style={{ color: '#f8fafc' }}>{formatearFecha(t.fecha)}</strong>
              <span><span style={{ color: COLOR_PAGOS }}>■</span> Pagos acumulados: {formatearMoneda(t.pagosAcumulados)}</span>
              <span><span style={{ color: COLOR_FONDOS }}>■</span> Fondos confirmados: {formatearMoneda(t.fondosConfirmados)}</span>
              {t.hueco > 0 && <span style={{ color: '#f2867b', fontWeight: 600 }}>⚠ Hueco: {formatearMoneda(t.hueco)}</span>}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
