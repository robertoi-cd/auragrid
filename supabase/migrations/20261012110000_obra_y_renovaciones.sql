-- 1. Cronograma de caja: tipo de pago y compromiso anticipado.
--    * partida: además de 'equipos', 'financiero' (comisión, intereses durante la construcción, DSRA). Sin partida =
--      construcción. Así la validación de obra antes de permisos/RTB y el calendario de intereses distinguen la obra
--      de los costos financieros (también al convertir el cronograma de ejemplo en editable).
--    * compromiso_anticipado: anticipo de equipos aprobado para pagarse antes del RTB (no genera la advertencia
--      "Pagos de construcción antes del RTB"). Solo en anticipos de equipos.
-- 2. Corrección de la fianza CENACE de Alpha I: su vencimiento se extendió el 11 oct 2026 (20:22 UTC) desde
--    "Editar" (31 ene 2027 → 5 jul 2027) y quedó "En renovación" sin historial. Se registra la renovación con su
--    fecha real y la garantía pasa a "Vigente". (La app ya no permite extender el vencimiento desde "Editar".)
-- Solo agrega una columna, amplía un check y corrige una fila; no borra datos.

alter table public.project_cash_movements drop constraint if exists project_cash_movements_partida_check;
alter table public.project_cash_movements
  add constraint project_cash_movements_partida_check check (partida in ('equipos', 'financiero'));

alter table public.project_cash_movements
  add column if not exists compromiso_anticipado boolean not null default false;
alter table public.project_cash_movements drop constraint if exists project_cash_movements_compromiso_solo_anticipos;
alter table public.project_cash_movements
  add constraint project_cash_movements_compromiso_solo_anticipos check (not compromiso_anticipado or es_anticipo);

do $$
declare
  v_id uuid;
begin
  select id into v_id from public.project_guarantees
   where project_id = 'alpha-i-50mw' and tipo = 'Fianza' and beneficiario = 'CENACE'
     and vence = date '2027-07-05' and estado = 'en_renovacion';
  if v_id is not null then
    if not exists (select 1 from public.project_guarantee_renewals where guarantee_id = v_id) then
      -- renovado_por: el dueño del proyecto (el cambio se hizo con su sesión)
      insert into public.project_guarantee_renewals (guarantee_id, vence_anterior, vence_nueva, renovado_por, renovado_en)
      select v_id, date '2027-01-31', date '2027-07-05', sp.owner_id, timestamptz '2026-10-11 20:22:53+00'
        from public.solar_projects sp where sp.id = 'alpha-i-50mw';
    end if;
    update public.project_guarantees set estado = 'vigente', updated_at = now() where id = v_id;
  end if;
end;
$$;

-- Reversión:
--   update public.project_guarantees set estado = 'en_renovacion' where project_id = 'alpha-i-50mw' and beneficiario = 'CENACE';
--   delete from public.project_guarantee_renewals r using public.project_guarantees g
--    where r.guarantee_id = g.id and g.project_id = 'alpha-i-50mw' and g.beneficiario = 'CENACE' and r.vence_nueva = date '2027-07-05';
--   alter table public.project_cash_movements drop constraint if exists project_cash_movements_compromiso_solo_anticipos;
--   alter table public.project_cash_movements drop column if exists compromiso_anticipado;
--   alter table public.project_cash_movements drop constraint if exists project_cash_movements_partida_check;
--   alter table public.project_cash_movements add constraint project_cash_movements_partida_check check (partida in ('equipos'));
