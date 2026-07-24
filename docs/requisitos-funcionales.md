# Requisitos Funcionales — Portfolio CodeByMike

> ⚠️ **Este archivo es una instantánea histórica (mayo 2026), no la fuente de
> verdad.** Los requisitos vigentes viven tipados en
> [`src/data/documentacion.ts`](../src/data/documentacion.ts) y se publican en
> [`/docs/requerimientos-funcionales`](https://codebymike.tech/docs/requerimientos-funcionales),
> donde cada requisito lleva además su estado, dónde vive en el código (`origen`)
> y cómo se comprueba (`verificacion`).
>
> Módulos que este archivo **no** cubre porque son posteriores: portal de
> clientes, cobros de campo por WhatsApp, demo read-only del panel, LAB
> (CI/CD, chaos, SAST/DAST, a11y, mutation testing), micro-SIEM y landing
> comercial de diseño web. Se conserva como registro del alcance inicial.

## RF-01 — Autenticación y control de acceso

| ID | Requisito |
|----|-----------|
| RF-01.1 | El sistema debe proteger todas las rutas bajo `/admin/*` mediante autenticación. |
| RF-01.2 | Los usuarios no autenticados deben ser redirigidos al login al intentar acceder a rutas protegidas. |
| RF-01.3 | El sistema debe mantener la sesión activa entre recargas de página. |
| RF-01.4 | El sistema debe permitir cerrar sesión de forma explícita. |

---

## RF-02 — Gestión de proyectos

| ID | Requisito |
|----|-----------|
| RF-02.1 | El sistema debe permitir crear proyectos con los campos: título, slug único, descripción, tech stack, URL de repo, URL de preview, URL de screenshot, estado y visibilidad. |
| RF-02.2 | El slug del proyecto debe ser único; el sistema debe validarlo antes de guardar. |
| RF-02.3 | El estado de un proyecto debe ser uno de: `activo`, `pausado`, `completado`, `archivado`. |
| RF-02.4 | El sistema debe permitir marcar un proyecto como visible o invisible para el sitio público. |
| RF-02.5 | Solo los proyectos marcados como visibles deben aparecer en la página pública de inicio y en `/projects/[slug]`. |
| RF-02.6 | El sistema debe mostrar una página 404 si el slug del proyecto no existe o no es visible. |
| RF-02.7 | El sistema debe permitir editar y eliminar proyectos desde el panel admin. |
| RF-02.8 | Un proyecto puede vincularse opcionalmente a un cliente. |

---

## RF-03 — Variables de entorno por proyecto

| ID | Requisito |
|----|-----------|
| RF-03.1 | El sistema debe permitir agregar variables de entorno a un proyecto con: clave, valor, entorno y notas. |
| RF-03.2 | El entorno de una variable debe ser uno de: `production`, `staging`, `development`, `all`. |
| RF-03.3 | El valor de cada variable debe almacenarse cifrado en la base de datos. |
| RF-03.4 | El sistema debe permitir revelar el valor de una variable bajo demanda desde el panel admin. |
| RF-03.5 | El sistema debe permitir editar y eliminar variables existentes. |
| RF-03.6 | Al eliminar un proyecto, sus variables de entorno deben eliminarse en cascada. |

---

## RF-04 — Gestión de clientes

| ID | Requisito |
|----|-----------|
| RF-04.1 | El sistema debe permitir crear clientes con: nombre, email, empresa y notas. |
| RF-04.2 | Un cliente puede estar vinculado a múltiples proyectos, mensajes y registros financieros. |
| RF-04.3 | El sistema debe permitir editar y eliminar clientes desde el panel admin. |

---

## RF-05 — Gestión de finanzas

| ID | Requisito |
|----|-----------|
| RF-05.1 | El sistema debe permitir registrar movimientos financieros con: descripción, monto, estado, fecha límite y vínculos opcionales a proyecto y cliente. |
| RF-05.2 | El estado de un movimiento debe ser uno de: `cobrado`, `pendiente`, `proyectado`. |
| RF-05.3 | El sistema debe mostrar un resumen de totales agrupados por estado. |
| RF-05.4 | El sistema debe permitir editar y eliminar movimientos desde el panel admin. |

---

## RF-06 — Mensajes de contacto

| ID | Requisito |
|----|-----------|
| RF-06.1 | El formulario público de contacto debe aceptar: nombre, email, asunto y cuerpo del mensaje. |
| RF-06.2 | El sistema debe validar que nombre, email y cuerpo no estén vacíos antes de guardar. |
| RF-06.3 | El mensaje guardado debe mostrar confirmación de envío al visitante. |
| RF-06.4 | El panel admin debe listar todos los mensajes recibidos con indicador visual de no leído. |
| RF-06.5 | El administrador debe poder marcar mensajes como leídos. |
| RF-06.6 | El sistema puede intentar vincular automáticamente el mensaje a un cliente existente por email. |

---

## RF-07 — Certifications y educación

| ID | Requisito |
|----|-----------|
| RF-07.1 | El sistema debe permitir registrar hitos educativos con: título, institución, descripción, skills (array JSON), estado, fechas y URL del certificado. |
| RF-07.2 | El estado de un hito debe ser uno de: `en_curso`, `completado`, `pausado`. |
| RF-07.3 | El sistema debe permitir marcar un hito como público o privado. |
| RF-07.4 | Solo los hitos marcados como públicos deben mostrarse en la página pública de certificaciones. |
| RF-07.5 | Un hito puede vincularse opcionalmente a un proyecto. |

---

## RF-08 — Briefings

| ID | Requisito |
|----|-----------|
| RF-08.1 | El sistema debe permitir crear briefings con: título, objetivo, alcance, requerimientos, entregables, presupuesto estimado/acordado, horas estimadas, deadline y notas. |
| RF-08.2 | El estado de un briefing debe ser uno de: `borrador`, `en_revision`, `aprobado`, `rechazado`. |
| RF-08.3 | Un briefing puede vincularse opcionalmente a un cliente y/o proyecto. |
| RF-08.4 | El sistema debe permitir editar y eliminar briefings desde el panel admin. |

---

## RF-09 — ADRs (Architecture Decision Records)

| ID | Requisito |
|----|-----------|
| RF-09.1 | El sistema debe permitir crear ADRs por proyecto con: título, contexto, decisión, justificación, alternativas y consecuencias. |
| RF-09.2 | El estado de un ADR debe ser uno de: `propuesto`, `aceptado`, `deprecado`, `reemplazado`. |
| RF-09.3 | El sistema debe permitir marcar un ADR como público para mostrarlo en el sitio. |
| RF-09.4 | Al eliminar un proyecto, sus ADRs deben eliminarse en cascada. |

---

## RF-10 — Servicios externos por proyecto

| ID | Requisito |
|----|-----------|
| RF-10.1 | El sistema debe permitir registrar servicios externos por proyecto con: nombre, categoría, URL, usuario y notas. |
| RF-10.2 | La categoría debe ser una de: `hosting`, `database`, `auth`, `cdn`, `email`, `storage`, `dns`, `monitoring`, `payment`, `repository`, `other`. |
| RF-10.3 | Al eliminar un proyecto, sus servicios deben eliminarse en cascada. |

---

## RF-11 — Contactos por proyecto

| ID | Requisito |
|----|-----------|
| RF-11.1 | El sistema debe permitir registrar contactos por proyecto con: nombre, email, rol, teléfono y notas. |
| RF-11.2 | El rol del contacto debe ser uno de: `cliente`, `pm`, `dev`, `qa`, `diseño`, `otro`. |
| RF-11.3 | Al eliminar un proyecto, sus contactos deben eliminarse en cascada. |

---

## RF-12 — Engineering Log

| ID | Requisito |
|----|-----------|
| RF-12.1 | El sistema debe mostrar un feed público de entradas de ingeniería en orden cronológico. |
| RF-12.2 | Solo las entradas marcadas como públicas deben aparecer en el feed. |

---

## RF-13 — Repositorios

| ID | Requisito |
|----|-----------|
| RF-13.1 | El sistema debe listar los repositorios vinculados a proyectos en el panel admin. |
| RF-13.2 | Cada repositorio debe mostrar nombre y URL accesible directamente desde el panel. |
