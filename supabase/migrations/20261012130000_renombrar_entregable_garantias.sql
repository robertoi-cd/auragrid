-- El entregable automático de garantías cambia de nombre: "Garantías vigentes hasta RTB" →
-- "Garantías con la vigencia requerida". Ya no exige cobertura solo hasta el RTB: cada garantía debe cubrir su
-- "vigencia requerida hasta" (RTB, NTP, interconexión, COD, fin de construcción o fecha específica) + el margen.
-- Solo cambia el título en project_deliverables (todos los proyectos); estado, fecha y responsable no cambian.
-- La app reconoce los dos nombres, así que funciona antes y después de esta migración.

update public.project_deliverables
   set titulo = 'Garantías con la vigencia requerida', updated_at = now()
 where titulo = 'Garantías vigentes hasta RTB'
   and not exists (
     select 1 from public.project_deliverables d2
      where d2.project_id = project_deliverables.project_id and d2.titulo = 'Garantías con la vigencia requerida'
   );

-- Reversión:
--   update public.project_deliverables set titulo = 'Garantías vigentes hasta RTB' where titulo = 'Garantías con la vigencia requerida';
