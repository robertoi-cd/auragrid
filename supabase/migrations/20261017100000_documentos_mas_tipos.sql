-- Documentos por entregable: además de PDF, DOCX, XLSX y XML, se aceptan MPP (MS Project), XER (Primavera P6),
-- JPG y PNG. La misma lista en el bucket "aura-documentos" (ya configurada a mano el 13 oct 2026; aquí queda en el
-- repositorio para que una base nueva quede igual) y en la tabla deliverable_evidence, y la misma que declara la app
-- (src/lib/archivos.ts). XER no tiene tipo estándar: la app declara application/x-primavera-xer.
-- No cambia nada más: el bucket sigue privado, con 50 MB por archivo y las mismas políticas.

update storage.buckets
   set allowed_mime_types = array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/xml', 'text/xml',
     'application/vnd.ms-project', 'application/x-primavera-xer',
     'image/jpeg', 'image/png']
 where id = 'aura-documentos';

alter table public.deliverable_evidence drop constraint if exists deliverable_evidence_tipo_mime_check;
alter table public.deliverable_evidence add constraint deliverable_evidence_tipo_mime_check check (tipo_mime = any (array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/xml', 'text/xml',
  'application/vnd.ms-project', 'application/x-primavera-xer',
  'image/jpeg', 'image/png']));

-- Reversión: la lista de 5 tipos de 20261014100000 en el bucket y en la restricción (solo si no hay documentos
-- con los tipos nuevos).
