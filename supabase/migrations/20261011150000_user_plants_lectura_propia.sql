-- Nota (copia pública): el correo del dueño y su UUID se reemplazaron por marcadores (el UUID nulo, 0000…). En la base real esta migración ya está aplicada con los valores originales.
-- user_plants: cada usuario lee solo sus asignaciones (sin crear ni modificar; eso queda para service_role).
-- Hace funcionar las políticas por usuario existentes de data_rooms y financial_optimization_tips.

create policy "user_plants_select_propias" on public.user_plants
  for select to authenticated using (user_id = (select auth.uid()));

alter policy "Aislamiento estricto de Data Rooms por Organización"  on public.data_rooms                  to authenticated;
alter policy "Aislamiento de Tips de Optimización por Organización" on public.financial_optimization_tips to authenticated;

-- Las 2 asignaciones existentes no tenían usuario: pasan a la cuenta del dueño
update public.user_plants
  set user_id = '00000000-0000-0000-0000-000000000000'
  where user_id is null
    and plant_id in ('0a485556-c063-4b38-b4ab-098f4fd4bff3', '86d813a5-b81a-449c-b316-3deb7bae0cc4');

-- Reversión:
--   drop policy "user_plants_select_propias" on public.user_plants;
--   alter policy "Aislamiento estricto de Data Rooms por Organización"  on public.data_rooms                  to public;
--   alter policy "Aislamiento de Tips de Optimización por Organización" on public.financial_optimization_tips to public;
--   update public.user_plants set user_id = null
--     where user_id = '00000000-0000-0000-0000-000000000000'
--       and plant_id in ('0a485556-c063-4b38-b4ab-098f4fd4bff3', '86d813a5-b81a-449c-b316-3deb7bae0cc4');
