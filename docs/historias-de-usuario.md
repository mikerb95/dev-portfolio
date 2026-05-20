# Historias de Usuario — Portfolio CodeByMike

## Visitantes del sitio público

### HU-01 — Ver portafolio profesional
**Como** visitante del sitio,  
**quiero** ver una presentación clara de las habilidades, proyectos y experiencia del desarrollador,  
**para** evaluar si es el perfil adecuado para mis necesidades.

**Criterios de aceptación:**
- La página de inicio muestra hero, expertise técnico y proyectos visibles.
- Solo se muestran proyectos marcados como visibles.
- La página carga en menos de 3 segundos en conexión media.

---

### HU-02 — Explorar proyectos
**Como** visitante,  
**quiero** ver el detalle de cada proyecto (stack, descripción, links),  
**para** conocer el nivel técnico y tipo de trabajo realizado.

**Criterios de aceptación:**
- Cada proyecto tiene su propia página con URL única (`/projects/[slug]`).
- Se muestra: título, descripción, tech stack, screenshot, URL de preview y repositorio.
- Si el proyecto no existe o no es visible, retorna 404.

---

### HU-03 — Ver certificaciones
**Como** visitante,  
**quiero** ver las certificaciones y logros académicos del desarrollador,  
**para** validar su formación y actualización profesional.

**Criterios de aceptación:**
- Se listan certificaciones con título, institución, fecha y link al certificado.
- Solo se muestran las marcadas como públicas.

---

### HU-04 — Enviar mensaje de contacto
**Como** visitante interesado,  
**quiero** enviar un mensaje de contacto,  
**para** iniciar una conversación sobre un proyecto o colaboración.

**Criterios de aceptación:**
- El formulario requiere nombre, email y mensaje.
- El mensaje queda guardado en la base de datos.
- Se muestra confirmación de envío al usuario.
- Los campos vacíos o con formato inválido muestran error claro.

---

### HU-05 — Ver Engineering Log
**Como** visitante,  
**quiero** leer el registro de decisiones técnicas y aprendizajes del desarrollador,  
**para** entender su proceso de pensamiento y nivel de madurez técnica.

**Criterios de aceptación:**
- Se muestra un feed cronológico de entradas de ingeniería.
- Solo aparecen entradas marcadas como públicas.

---

## Administrador (Mike)

### HU-06 — Iniciar sesión en el panel admin
**Como** administrador,  
**quiero** autenticarme con mis credenciales,  
**para** acceder al panel de gestión privado.

**Criterios de aceptación:**
- El acceso a rutas `/admin/*` requiere autenticación.
- Usuarios no autenticados son redirigidos al login.
- La sesión persiste entre recargas.

---

### HU-07 — Gestionar proyectos
**Como** administrador,  
**quiero** crear, editar y archivar proyectos,  
**para** mantener actualizado mi portafolio y el registro interno de trabajo.

**Criterios de aceptación:**
- Puedo crear un proyecto con: título, slug, descripción, tech stack, URLs, estado y visibilidad.
- Puedo cambiar la visibilidad (público/oculto) desde la lista.
- Los estados disponibles son: activo, pausado, completado, archivado.
- El slug es único y se valida antes de guardar.

---

### HU-08 — Gestionar variables de entorno por proyecto
**Como** administrador,  
**quiero** guardar las variables de entorno asociadas a cada proyecto,  
**para** tener un registro centralizado y seguro de configuraciones.

**Criterios de aceptación:**
- Puedo agregar variables con clave, valor cifrado, entorno (production/staging/development/all) y notas.
- Los valores cifrados se pueden revelar bajo demanda.
- Puedo editar y eliminar variables existentes.

---

### HU-09 — Gestionar clientes
**Como** administrador,  
**quiero** registrar y editar la información de mis clientes,  
**para** tener un directorio centralizado vinculado a proyectos y mensajes.

**Criterios de aceptación:**
- Puedo crear un cliente con: nombre, email, empresa y notas.
- Los clientes pueden vincularse a proyectos, mensajes y finanzas.

---

### HU-10 — Gestionar finanzas
**Como** administrador,  
**quiero** registrar ingresos, pagos pendientes y proyecciones económicas,  
**para** tener control sobre el estado financiero de mi actividad freelance.

**Criterios de aceptación:**
- Puedo registrar un movimiento con: descripción, monto, estado (cobrado/pendiente/proyectado), fecha límite y vínculos a proyecto/cliente.
- Se muestra un resumen de totales por estado.

---

### HU-11 — Gestionar briefings
**Como** administrador,  
**quiero** crear y gestionar briefings de proyectos con clientes,  
**para** documentar alcance, requerimientos y presupuesto acordado.

**Criterios de aceptación:**
- Un briefing puede vincularse a un cliente y/o proyecto.
- Estados disponibles: borrador, en revisión, aprobado, rechazado.
- Se pueden registrar: objetivo, alcance, entregables, presupuesto estimado/acordado, horas estimadas y deadline.

---

### HU-12 — Leer mensajes de contacto
**Como** administrador,  
**quiero** ver los mensajes recibidos a través del formulario de contacto,  
**para** responder oportunamente a posibles clientes o colaboradores.

**Criterios de aceptación:**
- Los mensajes se listan con nombre, email, asunto y fecha.
- Puedo marcar mensajes como leídos.
- Los mensajes no leídos se distinguen visualmente.

---

### HU-13 — Registrar hitos educativos
**Como** administrador,  
**quiero** registrar cursos, certificaciones y logros de aprendizaje,  
**para** mantener un historial personal y controlar qué aparece públicamente.

**Criterios de aceptación:**
- Puedo crear un hito con: título, institución, descripción, skills, estado, fechas y URL del certificado.
- Puedo elegir si el hito es público o privado.
- Un hito puede vincularse a un proyecto.

---

### HU-14 — Gestionar ADRs por proyecto
**Como** administrador,  
**quiero** documentar decisiones arquitectónicas (ADRs) por proyecto,  
**para** mantener un registro de las decisiones técnicas tomadas y su justificación.

**Criterios de aceptación:**
- Cada ADR incluye: título, contexto, decisión, justificación, alternativas consideradas y consecuencias.
- Estados: propuesto, aceptado, deprecado, reemplazado.
- Puedo marcar un ADR como público para mostrarlo en el sitio.

---

### HU-15 — Gestionar servicios externos por proyecto
**Como** administrador,  
**quiero** registrar los servicios externos que usa cada proyecto (hosting, BD, auth, etc.),  
**para** tener un inventario rápido de dependencias de infraestructura.

**Criterios de aceptación:**
- Puedo agregar un servicio con: nombre, categoría, URL, usuario y notas.
- Categorías disponibles: hosting, database, auth, cdn, email, storage, dns, monitoring, payment, repository, other.

---

### HU-16 — Gestionar contactos por proyecto
**Como** administrador,  
**quiero** registrar los contactos relevantes de cada proyecto (PM, QA, diseño, etc.),  
**para** tener acceso rápido a las personas involucradas.

**Criterios de aceptación:**
- Puedo agregar un contacto con: nombre, email, rol, teléfono y notas.
- Roles disponibles: cliente, pm, dev, qa, diseño, otro.

---

### HU-17 — Gestionar repositorios
**Como** administrador,  
**quiero** visualizar y gestionar los repositorios vinculados a mis proyectos,  
**para** tener acceso directo a los repos desde el panel.

**Criterios de aceptación:**
- Se listan los repos vinculados con nombre y URL.
- Puedo acceder al repo directamente desde el panel.
