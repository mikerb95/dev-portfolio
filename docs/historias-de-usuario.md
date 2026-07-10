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

---

## Administrador (Mike) — Observabilidad y operación

### HU-18 — Monitorear la salud de mis servicios
**Como** administrador,  
**quiero** monitorear la disponibilidad y latencia de los servicios en producción,  
**para** enterarme de caídas antes que mis clientes.

**Criterios de aceptación:**
- Un cron externo dispara checks HTTP periódicos por monitor (método, texto esperado, umbral de latencia).
- El estado materializado (`up`/`degraded`/`down`) se actualiza tras cada chequeo.
- Se puede pausar o desactivar un monitor sin borrar su historial.

---

### HU-19 — Ver historial de incidentes
**Como** administrador,  
**quiero** que las caídas consecutivas se agrupen automáticamente en incidentes,  
**para** conocer cuánto duró cada caída sin reconstruirla manualmente del log crudo.

**Criterios de aceptación:**
- El primer chequeo fallido abre un incidente; el primer éxito posterior lo cierra con duración calculada.
- Cada incidente registra causa y último error observado.

---

### HU-20 — Evaluar SLO y presupuesto de error
**Como** administrador,  
**quiero** definir un objetivo de disponibilidad (SLO) y ventana de tiempo por monitor,  
**para** saber cuánto margen de caída me queda antes de incumplir el objetivo.

**Criterios de aceptación:**
- Objetivo (%) y ventana (días) son configurables desde la UI.
- Se calcula el SLI real sobre los chequeos de la ventana y el presupuesto de error restante.

---

### HU-21 — Recibir notificaciones push de alertas
**Como** administrador,  
**quiero** recibir una notificación push cuando un servicio cae, un dominio está por vencer o se detecta una anomalía de seguridad,  
**para** reaccionar sin tener que revisar el panel constantemente.

**Criterios de aceptación:**
- Las alertas llegan vía ntfy.sh al topic configurado.
- Cubren: caída/recuperación de monitor, vencimiento próximo de dominio, anomalía de seguridad detectada.

---

### HU-22 — Gestionar vencimiento de dominios
**Como** administrador,  
**quiero** que el sistema descubra automáticamente la fecha de expiración de mis dominios,  
**para** no perder uno por olvido de renovación.

**Criterios de aceptación:**
- La fecha se resuelve vía RDAP al guardar un costo de categoría "Dominio", o manualmente con un botón de refresco por fila.
- Se muestra un badge de alerta cuando el vencimiento está próximo o vencido.

---

### HU-23 — Dar seguimiento comercial a clientes y proyectos
**Como** administrador,  
**quiero** registrar llamadas, reuniones, notas y tareas pendientes por cliente/proyecto,  
**para** no perder el hilo de una negociación o un compromiso adquirido.

**Criterios de aceptación:**
- Una interacción puede vincularse a cliente, proyecto y/o briefing.
- Se puede marcar una acción siguiente con fecha límite y marcarla como hecha.

---

### HU-24 — Presentar slides a un cliente con control remoto
**Como** administrador,  
**quiero** avanzar una presentación desde mi teléfono mientras el cliente la ve en su pantalla,  
**para** dar demos sin depender de compartir pantalla en video llamada.

**Criterios de aceptación:**
- Cada presentación tiene un token de acceso propio para el cliente.
- El avance de diapositiva se sincroniza en tiempo casi real entre control y vista de presentación.

---

## Visitantes del sitio público — Vitrina y SEO

### HU-25 — Ver el estado en vivo de los servicios
**Como** visitante,  
**quiero** ver el uptime, los incidentes activos y la latencia en tiempo real de los servicios públicos,  
**para** confiar en que el sitio (y quien lo construyó) toma en serio la operación en producción.

**Criterios de aceptación:**
- `/status` muestra uptime global de los últimos 30 días.
- Se listan los incidentes activos, si los hay.
- La latencia se anima en tiempo real (EKG) por servicio monitoreado.

---

### HU-26 — Encontrar el sitio en buscadores
**Como** visitante que busca en Google,  
**quiero** que el contenido del portafolio aparezca indexado y bien descrito,  
**para** encontrarlo fácilmente sin conocer la URL exacta.

**Criterios de aceptación:**
- Cada proyecto expone JSON-LD y breadcrumbs estructurados.
- Existe feed RSS y notificación IndexNow ante cada publicación nueva.
- El sitio es instalable como PWA (manifest + iconos).

---

### HU-27 — Explorar herramientas y notas técnicas
**Como** visitante técnico,  
**quiero** ver una vitrina de herramientas internas y notas de ingeniería del stack,  
**para** evaluar la profundidad técnica real detrás del portafolio.

**Criterios de aceptación:**
- `/tools` y `/notes` están publicadas con contenido curado (mínimo 5 artículos).
- Cada nota/proyecto genera su propia imagen OG.

---

## Administrador (Mike) — Seguridad

### HU-28 — Detectar requests hostiles sin frenar tráfico legítimo
**Como** administrador,  
**quiero** que el sistema observe y clasifique cada request sospechoso,  
**para** tener visibilidad de ataques sin arriesgar falsos positivos que bloqueen visitantes reales.

**Criterios de aceptación:**
- Cada request se clasifica contra firmas conocidas (alineadas a OWASP) de forma síncrona y no bloqueante.
- Los eventos quedan registrados con categoría, severidad y regla que los disparó.

---

### HU-29 — Bloquear IPs maliciosas y limitar su tasa de requests
**Como** administrador,  
**quiero** bloquear IPs reincidentes y aplicar un límite de tasa que no se resetee con cada despliegue,  
**para** contener abuso sostenido sin depender de reiniciar el servicio.

**Criterios de aceptación:**
- Toda IP bloqueada tiene TTL obligatorio (nunca un bloqueo eterno).
- El estado del rate limiter persiste en base de datos, no en memoria del proceso.
- Cualquier fallo del enforcement deja pasar el request (fail-open): nunca tumba el sitio.

---

### HU-30 — Revisar anomalías de seguridad agregadas
**Como** administrador,  
**quiero** ver picos y patrones nuevos de tráfico hostil agregados en un panel,  
**para** revisar la postura de seguridad periódicamente sin leer eventos crudos uno por uno.

**Criterios de aceptación:**
- Un detector estadístico (z-score sobre baseline de 30 días) marca spikes, patrones nuevos, anomalías geográficas y ráfagas de error.
- Cada anomalía puede marcarse como notificada/reconocida.

---

## Administrador (Mike) — Documentación del proyecto

### HU-31 — Consultar la documentación de ingeniería sin salir del panel
**Como** administrador,  
**quiero** navegar requerimientos, casos de uso, diagramas UML y el kanban del propio proyecto desde `/admin`,  
**para** sustentar el trabajo (académica o comercialmente) sin mantener documentos externos desincronizados.

**Criterios de aceptación:**
- Existe una sección "Documentación" en la sidebar con 10 subpáginas navegables.
- Todo el contenido se define como datos tipados en el repo (no en documentos sueltos).
- El tablero kanban del propio portfolio reutiliza el mismo componente que el de DobleYo, sin duplicar lógica.

---

## Resumen

| Grupo | Historias | Rango |
|---|---|---|
| Visitantes | 8 | HU-01 a HU-05, HU-25 a HU-27 |
| Administrador — CRM y perfil | 12 | HU-06 a HU-17 |
| Administrador — Observabilidad y operación | 7 | HU-18 a HU-24 |
| Administrador — Seguridad | 3 | HU-28 a HU-30 |
| Administrador — Documentación | 1 | HU-31 |
| **Total** | **31** | HU-01 a HU-31 |

Ver también el tablero XP con historias ancladas al historial real de commits en `/admin/docs/kanban`
(datos en `src/data/iteraciones-portfolio.ts`).
