-- IVA de construcción v1 (fase 2): supuestos de IVA por proyecto en project_financial_assumptions.
-- Solo agrega columnas; no borra ni renombra nada y no cambia ninguna cifra: el IVA queda apagado (iva_activo = false).
-- Sin valores inventados: todo vacío salvo la tasa, que es dato de ley (LIVA art. 1) y viene prellenada en 16 %.
-- El historial ya registra cualquier columna de supuestos que cambie (trigger registrar_cambio_supuestos).

alter table public.project_financial_assumptions
  add column if not exists iva_activo boolean not null default false,
  add column if not exists iva_tasa_pct numeric not null default 16 check (iva_tasa_pct > 0 and iva_tasa_pct <= 100),
  add column if not exists iva_capex_sujeto_pct numeric check (iva_capex_sujeto_pct between 0 and 100),
  add column if not exists iva_recuperacion_meses integer check (iva_recuperacion_meses between 0 and 60),
  add column if not exists iva_origen_equipo text check (iva_origen_equipo in ('importacion', 'local')),
  add column if not exists iva_financiamiento text check (iva_financiamiento in ('equity', 'linea')),
  add column if not exists iva_linea_monto numeric check (iva_linea_monto > 0),
  add column if not exists iva_linea_tasa_pct numeric check (iva_linea_tasa_pct between 0 and 100),
  add column if not exists iva_linea_comision_pct numeric check (iva_linea_comision_pct between 0 and 100);

-- Reversión:
--   alter table public.project_financial_assumptions
--     drop column if exists iva_linea_comision_pct, drop column if exists iva_linea_tasa_pct, drop column if exists iva_linea_monto,
--     drop column if exists iva_financiamiento, drop column if exists iva_origen_equipo, drop column if exists iva_recuperacion_meses,
--     drop column if exists iva_capex_sujeto_pct, drop column if exists iva_tasa_pct, drop column if exists iva_activo;
