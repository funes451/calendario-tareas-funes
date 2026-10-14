# Calendario de Tareas (Eli · Marti · David)

Calendario compartido en tiempo real, cubre de octubre de 2026 a diciembre de 2027. Frontend en HTML, CSS y JavaScript puro con Supabase como backend.

## Estado

Backend ya configurado y verificado (14/10/2026):

- Organización de Supabase: **Calendario Funes** (plan Free)
- Proyecto: **calendario-tareas**, región Europe West (Irlanda)
- URL del proyecto: `https://igevbjfallgxeczcynql.supabase.co`
- Tabla `tareas` creada con sus políticas de acceso y tiempo real activado (el SQL ejecutado está en `supabase.sql`)
- `app.js` ya contiene la URL y la clave publicable, no hay que tocar nada

## Puesta en marcha

Abre `index.html` en el navegador y ya funciona. Para que Eli, Marti y David lo usen desde cualquier sitio, sube los tres archivos (`index.html`, `styles.css`, `app.js`) a cualquier hosting estático gratuito (Netlify Drop, Vercel o GitHub Pages) y comparte la URL. El panel del proyecto está en https://supabase.com/dashboard/project/igevbjfallgxeczcynql.

## Uso

- Al abrir por primera vez, cada persona elige quién es (Eli, Marti o David), la elección queda guardada en el navegador y se puede cambiar con el botón **Cambiar**.
- El responsable de todas las tareas es siempre David, Eli y Marti las crean para encargarle faena.
- Clic en un día del calendario o en **+ Nueva tarea** para crear, clic en cualquier tarea para editarla o eliminarla.
- Los cambios de cualquiera aparecen al instante en la pantalla de los demás, sin recargar.
- La prioridad se marca con un punto (rojo alta, ámbar media, gris baja).
- La vista **Agenda** ordena las tareas no hechas por fecha y prioridad, las atrasadas salen primero y marcadas.
- El panel **Urgente / esta semana** recoge las de prioridad alta y las que empiezan en los próximos 7 días.
- Los filtros de estado, prioridad y proyecto se pueden combinar.
