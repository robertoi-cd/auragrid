// Pruebas del historial de cambios de los entregables (formato y reglas de la interfaz).
// Las reglas de la base (trigger, motivo obligatorio, RLS, solo lectura) se probaron contra Supabase
// en una transacción revertida antes de aplicar la migración 20261012100000.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  requiereMotivo, describirCambio, valorLegible, ultimoCambioPorEntregable, aRegistroCambio, formatearMomento,
  ESTADOS_ENTREGABLE, type RegistroCambio,
} from '../src/lib/historialCambios';
import { formatearMoneda } from '../src/lib/formato';

const registro = (cambios: Partial<RegistroCambio>): RegistroCambio => ({
  id: 'x', deliverableId: 'd1', entregable: 'E', campo: 'estado', valorAnterior: 'curso', valorNuevo: 'completo',
  motivo: null, tipo: 'cambio', usuario: 'a@b.example', momento: '2026-10-12T08:00:00Z', ...cambios,
});

describe('Motivo obligatorio', () => {
  test('salir de "Completo" a cualquier otro estado exige motivo', () => {
    for (const nuevo of ['pendiente', 'curso', 'bloqueado'] as const) assert.equal(requiereMotivo('completo', nuevo), true);
  });
  test('los demás cambios no lo exigen', () => {
    for (const anterior of ['pendiente', 'curso', 'bloqueado'] as const) {
      for (const nuevo of ESTADOS_ENTREGABLE) assert.equal(requiereMotivo(anterior, nuevo), false);
    }
    assert.equal(requiereMotivo('completo', 'completo'), false);
  });
});

describe('Descripción de los cambios', () => {
  test('estado con etiquetas legibles', () => assert.equal(describirCambio(registro({})), 'Estado: En curso → Completo'));
  test('fecha compromiso formateada; vacía = "Sin fecha"', () => {
    assert.equal(describirCambio(registro({ campo: 'fecha', valorAnterior: null, valorNuevo: '2027-01-20' })), 'Fecha compromiso: Sin fecha → 20 ene 2027');
  });
  test('responsable vacío = "Sin responsable"', () => {
    assert.equal(describirCambio(registro({ campo: 'responsable', valorAnterior: 'SEMARNAT', valorNuevo: '' })), 'Responsable: SEMARNAT → Sin responsable');
  });
  test('estado desconocido se muestra tal cual', () => assert.equal(valorLegible('estado', 'otro'), 'otro'));
  test('alta: "Entregable agregado al frente …"', () => {
    assert.equal(describirCambio(registro({ campo: 'alta', valorAnterior: null, valorNuevo: 'Comunidad' })), 'Entregable agregado al frente Comunidad');
  });
  test('baja: "Entregable eliminado (frente · estado · fecha)" con etiquetas legibles', () => {
    assert.equal(describirCambio(registro({ campo: 'baja', valorAnterior: 'Ambiental · curso · 2027-01-31', valorNuevo: null })),
      'Entregable eliminado (Ambiental · En curso · 31 ene 2027)');
    assert.equal(describirCambio(registro({ campo: 'baja', valorAnterior: 'Ambiental · pendiente', valorNuevo: null })),
      'Entregable eliminado (Ambiental · Pendiente)');
  });
  test('baja con responsable (formato nuevo, fecha vacía incluida)', () => {
    assert.equal(describirCambio(registro({ campo: 'baja', valorAnterior: 'Permisos · pendiente · 2027-02-10 · Municipio', valorNuevo: null })),
      'Entregable eliminado (Permisos · Pendiente · 10 feb 2027 · resp. Municipio)');
    assert.equal(describirCambio(registro({ campo: 'baja', valorAnterior: 'Permisos · curso ·  · Municipio', valorNuevo: null })),
      'Entregable eliminado (Permisos · En curso · resp. Municipio)');
  });
  test('baja de garantía: datos borrados legibles (formato que escribe el trigger)', () => {
    assert.equal(
      describirCambio(registro({ campo: 'baja_garantia', valorAnterior: 'Afianzadora (ejemplo) · 1250000.00 · 2027-07-05 · cod · vigente · 1', valorNuevo: null })),
      `Garantía eliminada (emisor Afianzadora (ejemplo) · ${formatearMoneda(1_250_000)} · vencía 05 jul 2027 · vigencia requerida hasta COD · Vigente · 1 renovación)`);
    assert.equal(
      describirCambio(registro({ campo: 'baja_garantia', valorAnterior: 'Banco · 4800000.00 · 2027-06-30 · fecha:2027-12-01 · liberada · 0', valorNuevo: null })),
      `Garantía eliminada (emisor Banco · ${formatearMoneda(4_800_000)} · vencía 30 jun 2027 · vigencia requerida hasta 01 dic 2027 · Liberada)`);
  });
});

describe('Último cambio por entregable', () => {
  test('toma el más reciente de cada entregable, sin importar el orden', () => {
    const m = ultimoCambioPorEntregable([
      registro({ id: '1', momento: '2026-10-12T07:12:47Z' }),
      registro({ id: '2', momento: '2026-10-12T09:00:00Z' }),
      registro({ id: '3', deliverableId: 'd2', momento: '2026-10-12T08:00:00Z' }),
      registro({ id: '4', momento: '2026-10-12T08:30:00Z' }),
    ]);
    assert.equal(m.get('d1')?.id, '2');
    assert.equal(m.get('d2')?.id, '3');
  });
  test('ignora registros de entregables borrados (sin id)', () => {
    assert.equal(ultimoCambioPorEntregable([registro({ deliverableId: null })]).size, 0);
  });
});

describe('Lectura de project_change_log', () => {
  test('fila de Supabase → registro', () => {
    const r = aRegistroCambio({
      id: 'u1', deliverable_id: 'd1', entregable: 'Resolutivo de MIA', campo: 'estado', valor_anterior: 'bloqueado', valor_nuevo: 'curso',
      motivo: 'Corrección', tipo: 'correccion', user_email: 'a@b.example', created_at: '2026-10-12T07:40:00.733+00:00',
    });
    assert.deepEqual([r.deliverableId, r.tipo, r.usuario, r.valorNuevo], ['d1', 'correccion', 'a@b.example', 'curso']);
  });
  test('tipo desconocido = "cambio"; sin correo = null', () => {
    const r = aRegistroCambio({ id: 'u2', campo: 'fecha', tipo: 'raro', created_at: '2026-10-12T07:40:00Z' });
    assert.deepEqual([r.tipo, r.usuario, r.deliverableId], ['cambio', null, null]);
  });
  test('momento con fecha y hora; inválido = "—"', () => {
    assert.match(formatearMomento('2026-10-12T07:40:00Z'), /2026, \d{2}:\d{2}$/);
    assert.equal(formatearMomento('no es fecha'), '—');
  });
});

describe('Cambios del proyecto y de sus supuestos', () => {
  const d = (campo: RegistroCambio['campo'], a: string | null, b: string | null, etiquetas?: Record<string, string>) =>
    describirCambio(registro({ campo, valorAnterior: a, valorNuevo: b }), etiquetas);
  test('nombre, capacidad, estado y CAPEX', () => {
    assert.equal(d('proyecto_nombre', 'Beta II', 'Beta II ampliado'), 'Nombre del proyecto: Beta II → Beta II ampliado');
    assert.equal(d('proyecto_capacidad', '100', '120'), 'Capacidad: 100 MWac → 120 MWac');
    assert.equal(d('proyecto_estado', 'Zacatecas', 'Coahuila'), 'Estado (ubicación): Zacatecas → Coahuila');
    assert.equal(d('proyecto_capex', '$89,300,000 USD', 'USD 110,000,000'), `CAPEX: ${formatearMoneda(89_300_000)} → ${formatearMoneda(110_000_000)}`);
  });
  test('RTB, margen y archivado', () => {
    assert.equal(d('proyecto_rtb', '2027-03-31', '2027-09-30'), 'RTB objetivo: 31 mar 2027 → 30 sep 2027');
    assert.equal(d('proyecto_rtb', null, '2027-09-30'), 'RTB objetivo: Sin definir → 30 sep 2027');
    assert.equal(d('proyecto_margen', '90', '60'), 'Margen de garantías: 90 días → 60 días');
    assert.equal(d('proyecto_archivo', 'activo', 'archivado'), 'Portafolio: Activo → Archivado');
  });
  test('supuestos ("columna=valor") con su nombre legible', () => {
    const etiquetas = { ppa_precio_usd_mwh: 'Precio PPA (USD/MWh)' };
    assert.equal(d('supuesto', 'ppa_precio_usd_mwh=42', 'ppa_precio_usd_mwh=45', etiquetas), 'Precio PPA (USD/MWh): 42 → 45');
    assert.equal(d('supuesto', 'columna_nueva=1', 'columna_nueva=2'), 'columna_nueva: 1 → 2');
  });
});

describe('Aviso legal', () => {
  test('dice que no constituye asesoría financiera, legal ni fiscal', async () => {
    const { AVISO_LEGAL } = await import('../src/lib/avisoLegal');
    assert.match(AVISO_LEGAL, /no constituyen asesoría financiera, legal ni fiscal/);
  });
});

describe('Contraseña de una invitación o recuperación', () => {
  test('mínimo 8 caracteres y las dos deben coincidir', async () => {
    const { problemaContrasena } = await import('../src/lib/contrasena');
    assert.match(problemaContrasena('corta', 'corta')!, /al menos 8/);
    assert.equal(problemaContrasena('suficiente1', 'suficiente2'), 'Las dos contraseñas no coinciden.');
    assert.equal(problemaContrasena('suficiente1', 'suficiente1'), null);
  });
});
