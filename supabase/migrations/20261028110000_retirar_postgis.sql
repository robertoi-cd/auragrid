-- Retirar PostGIS: la única forma de cerrar la escritura anónima en spatial_ref_sys.
-- Esa tabla de referencia de coordenadas pertenece a supabase_admin y anon y authenticated pueden escribir en ella
-- (INSERT, UPDATE, DELETE, TRUNCATE; sin RLS). El rol de las migraciones (postgres) no puede quitar esos permisos ni activar
-- el RLS (no es el dueño), pero sí puede borrar la extensión. La app no usa PostGIS (ninguna tabla tiene columnas
-- geometry o geography desde 20261028100000_limpiar_prototipo) y la tabla no tiene datos de proyectos.
-- Al borrar la extensión desaparecen spatial_ref_sys, geometry_columns, geography_columns y las funciones de PostGIS.
-- Sin CASCADE: si algo dependiera de PostGIS, falla y no se borra nada.
-- Cuando el módulo de terrenos necesite PostGIS, se activa en el esquema extensions (no en public, donde sus tablas
-- quedan expuestas por la API):  create extension postgis with schema extensions;

drop extension if exists postgis;

-- Reversión: create extension postgis with schema extensions;  (spatial_ref_sys no tiene datos propios del proyecto)
