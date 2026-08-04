# CodeByMike — Portafolio, Panel de Control y Portal de Clientes

## Plan de Capacitación

**Versión:** 0100
**Fecha:** 03/08/2026

---

## HOJA DE CONTROL

| | | | |
|---|---|---|---|
| **Organismo** | SENA — Centro de Servicios Financieros, Regional Distrito Capital | | |
| **Proyecto** | CodeByMike — Portafolio, Panel de Control y Portal de Clientes (codebymike.tech) | | |
| **Entregable** | Plan de Capacitación | | |
| **Autor** | Michael David Rodríguez Beltran<br>Análisis y Desarrollo de Software — Ficha 3114731 — Trimestre 7 | | |
| **Versión/Edición** | 0100 | **Fecha Versión** | 03/08/2026 |
| **Aprobado por** | (pendiente de asignación) | **Fecha Aprobación** | (pendiente) |
| | | **Nº Total de Páginas** | `<al exportar>` |

## REGISTRO DE CAMBIOS

| Versión doc | Causa del Cambio | Responsable del Cambio | Fecha del Cambio |
|---|---|---|---|
| 0100 | Versión inicial | Michael David Rodríguez Beltran | 03/08/2026 |
| | | | |
| | | | |

---

# 1. INTRODUCCIÓN

El Plan de Capacitación técnica y de usuarios finales precisa la metodología con
la cual se realizará el proceso de capacitación de los usuarios de la aplicación,
de modo que cada perfil alcance la autonomía necesaria para operar el sistema en
las tareas que le corresponden, sin depender de asistencia permanente del
desarrollador.

El sistema presenta una característica que condiciona todo el plan: **sus
usuarios no forman un grupo homogéneo**. Conviven un perfil técnico con acceso
total al panel de control y a la infraestructura, y un perfil de negocio —el
cliente— que entra a un portal acotado y cuya única expectativa es consultar el
avance de su proyecto, sus facturas y sus documentos. Impartir a ambos la misma
sesión sería ineficaz en los dos sentidos: dejaría al cliente frente a conceptos
que no necesita y dejaría al perfil técnico sin la profundidad que sí requiere.

Por ello el plan se organiza en **dos rutas independientes**, con objetivos,
duración, metodología y evaluación propios:

- **Capacitación técnica**, dirigida a quien deba operar, mantener y evolucionar
  el sistema.
- **Capacitación de usuario final**, dirigida a quien deba usar la aplicación en
  su trabajo diario: el administrador funcional del panel y los usuarios del
  portal de clientes.

Un segundo condicionante es la rotación de usuarios del portal: los clientes se
incorporan de manera continua a medida que se abren proyectos, no en una fecha
única. La ruta de usuario final está diseñada, en consecuencia, para poder
repetirse tantas veces como haga falta y de forma **asíncrona**, sin convocar una
sesión presencial por cada alta.

---

# 2. OBJETIVO GENERAL

Realizar la capacitación a los usuarios de la aplicación, de forma que al
finalizar el proceso:

- El personal técnico sea capaz de instalar, configurar, desplegar, monitorear,
  respaldar, diagnosticar y evolucionar el sistema de manera autónoma, apoyado en
  el *Manual Técnico* y el *Manual de Instalación*.
- El administrador funcional sea capaz de ejecutar sin asistencia la totalidad de
  la operación diaria del negocio: gestión de proyectos y clientes, registro de
  costos e ingresos, emisión de facturas, cobro, atención del portal y respuesta
  ante una alerta de disponibilidad o de seguridad.
- El usuario de cliente sea capaz de acceder al portal, consultar el avance de su
  proyecto, descargar sus facturas y documentos, comunicarse por la mensajería y
  administrar sus preferencias de notificación, en su primera sesión y sin
  acompañamiento.

## 2.1 Objetivos específicos

| # | Objetivo | Ruta |
|---|---|---|
| 1 | Reproducir el despliegue completo del sistema en un entorno nuevo, partiendo del repositorio y las cuentas de servicio | Técnica |
| 2 | Interpretar el modelo de datos y aplicar una migración aditiva sin romper el esquema existente | Técnica |
| 3 | Ejecutar las suites de pruebas y leer sus resultados, incluida la verificación posterior al despliegue y la reversión automática | Técnica |
| 4 | Diagnosticar y responder ante un incidente de disponibilidad y ante un evento de seguridad | Técnica |
| 5 | Ejecutar y verificar un respaldo, y conocer el procedimiento de restauración | Técnica |
| 6 | Operar el ciclo comercial completo: alta de cliente, proyecto, alcance, seguimiento, costos y rentabilidad | Usuario final — administrador |
| 7 | Emitir una factura, cobrarla y comprobar que el cobro se refleja correctamente | Usuario final — administrador |
| 8 | Invitar a un usuario de cliente, publicar hitos de avance y atender su mensajería | Usuario final — administrador |
| 9 | Activar la cuenta, acceder al portal y consultar avance, facturas y documentos | Usuario final — cliente |
| 10 | Comunicarse por la mensajería del portal y configurar las notificaciones | Usuario final — cliente |

---

# 3. PLANIFICACIÓN DE LA CAPACITACIÓN

## 3.1 Capacitación técnica

| Aspecto | Definición |
|---|---|
| Dirigida a | Personal de desarrollo y operación que asuma el mantenimiento y la evolución del sistema |
| Número de participantes | Grupo reducido, máximo 5 personas por convocatoria |
| Perfil de entrada | Conocimientos de desarrollo web, línea de comandos, Git y bases de datos relacionales. No se requiere experiencia previa en Astro ni en libSQL |
| Duración total | 16 horas, distribuidas en 5 sesiones |
| Modalidad | Presencial o remota sincrónica, con ejercicio práctico en cada sesión |
| Prerrequisitos del participante | Equipo propio con Node.js 22, Git y contenedores instalados; acceso de lectura al repositorio; cuentas de prueba en los servicios gestionados |
| Prerrequisitos de la organización | Entorno de pruebas provisionado y bases de datos desechables disponibles |
| Momento de ejecución | Antes de la transferencia de responsabilidad operativa |
| Instructor | Michael David Rodríguez Beltran (autor del sistema) |

**Cronograma propuesto**

| Sesión | Duración | Contenido | Entregable de la sesión |
|---|---|---|---|
| 1 | 3 h | Arquitectura, modelo de despliegue y recorrido del repositorio | Diagnóstico de comprensión resuelto |
| 2 | 4 h | Instalación, configuración y despliegue completo en entorno propio | Entorno del participante funcionando |
| 3 | 3 h | Modelo de datos, migraciones y capa de acceso a datos | Migración aditiva aplicada correctamente |
| 4 | 3 h | Seguridad, observabilidad y respuesta ante incidentes | Incidente simulado diagnosticado y cerrado |
| 5 | 3 h | Pruebas, canal de integración continua, respaldos y recuperación | Respaldo generado y restauración ensayada |

## 3.2 Capacitación de Usuario Final

La ruta de usuario final se subdivide en dos audiencias con planificación
distinta, porque su relación con el sistema es distinta.

### 3.2.1 Administrador funcional

| Aspecto | Definición |
|---|---|
| Dirigida a | Persona responsable de la operación diaria del negocio en el panel `/admin` |
| Número de participantes | 1 a 3 |
| Perfil de entrada | Manejo básico de navegador web. No se requiere conocimiento técnico |
| Duración total | 6 horas, distribuidas en 3 sesiones |
| Modalidad | Presencial o remota sincrónica, con práctica sobre el entorno de demostración |
| Prerrequisitos | Cuenta de GitHub incluida en la lista de autorización; navegador actualizado |
| Momento de ejecución | Antes de la entrada en operación |
| Instructor | Michael David Rodríguez Beltran |

**Cronograma propuesto**

| Sesión | Duración | Contenido |
|---|---|---|
| 1 | 2 h | Acceso, orientación general del panel y ciclo comercial (clientes, proyectos, alcance, seguimiento) |
| 2 | 2 h | Finanzas: costos, rentabilidad, ingresos, facturación, cobro de campo y bóveda de credenciales |
| 3 | 2 h | Portal de clientes, observabilidad y qué hacer ante una alerta |

### 3.2.2 Usuario de cliente (portal)

| Aspecto | Definición |
|---|---|
| Dirigida a | Contactos de las empresas cliente con acceso al portal `/portal` |
| Número de participantes | Variable; los clientes se incorporan de forma continua |
| Perfil de entrada | Manejo básico de navegador web y correo electrónico |
| Duración total | 45 minutos |
| Modalidad | **Asíncrona y autoservicio**, con sesión de acompañamiento opcional de 30 minutos a solicitud del cliente |
| Prerrequisitos | Invitación recibida por correo |
| Momento de ejecución | En el momento de la invitación, sin convocatoria previa |
| Responsable | Administrador funcional |

La decisión de hacer asíncrona esta ruta responde a una restricción real de la
operación: convocar una sesión de capacitación por cada contacto de cada cliente
que se da de alta no es sostenible, y además introduce una demora entre la
invitación y el primer acceso que degrada la experiencia justamente en el momento
en que el cliente tiene más interés en entrar.

---

# 4. ESTRUCTURA DE LA CAPACITACIÓN

## 4.1 Capacitación técnica

La ruta técnica se estructura en cinco módulos secuenciales. Cada módulo parte
del documento de referencia correspondiente y termina en un ejercicio práctico
verificable sobre el entorno del propio participante.

| Módulo | Título | Duración | Documento de referencia |
|---|---|---|---|
| MT-1 | Arquitectura y visión general del sistema | 3 h | Manual Técnico §1–§6; Documento de Especificación de Arquitectura |
| MT-2 | Instalación, configuración y despliegue | 4 h | Manual de Instalación completo |
| MT-3 | Modelo de datos y migraciones | 3 h | Manual Técnico §7–§10 |
| MT-4 | Seguridad, observabilidad y respuesta a incidentes | 3 h | Manual Técnico §6.2.3, §6.2.6, §14 |
| MT-5 | Pruebas, integración continua y respaldos | 3 h | Manual Técnico §11, Anexo A |

**Secuencia obligatoria.** MT-2 no puede impartirse antes que MT-1, y MT-5 exige
haber completado MT-3: sin comprender el modelo de datos no es posible interpretar
lo que un respaldo contiene ni lo que una restauración recupera.

## 4.2 Capacitación de Usuario Final

### 4.2.1 Administrador funcional

| Módulo | Título | Duración | Documento de referencia |
|---|---|---|---|
| MU-1 | Acceso, sesiones y orientación general del panel | 45 min | Manual de Usuario §2.1 |
| MU-2 | Gestión de clientes, proyectos, alcance y seguimiento | 1 h 15 min | Manual de Usuario §2.2 |
| MU-3 | Finanzas: costos, rentabilidad, ingresos y bóveda | 1 h | Manual de Usuario §2.3.1–§2.3.4 |
| MU-4 | Facturación y cobro de campo | 1 h | Manual de Usuario §2.3.5, §2.7.3 |
| MU-5 | Administración del portal de clientes | 1 h | Manual de Usuario §2.7 |
| MU-6 | Observabilidad, seguridad y respuesta ante alertas | 1 h | Manual de Usuario §2.4–§2.5 |

### 4.2.2 Usuario de cliente

| Módulo | Título | Duración | Formato |
|---|---|---|---|
| MC-1 | Activación de la cuenta y primer acceso | 10 min | Guía breve enviada con la invitación |
| MC-2 | Consulta del avance del proyecto | 10 min | Recorrido guiado dentro del portal |
| MC-3 | Facturas y documentos | 10 min | Recorrido guiado dentro del portal |
| MC-4 | Mensajería y notificaciones | 15 min | Recorrido guiado dentro del portal |

---

# 5. METODOLOGÍA DE LA CAPACITACIÓN

## 5.1 Capacitación técnica

La ruta técnica se imparte bajo una metodología de **aprender haciendo sobre el
sistema real**, no sobre presentaciones. El criterio es que el participante toque
el sistema desde la primera sesión y que cada concepto se introduzca en el
momento en que resuelve un problema concreto que el participante acaba de
encontrar.

Distribución del tiempo por sesión:

| Fase | Proporción | Descripción |
|---|---|---|
| Exposición | 30 % | Presentación del concepto apoyada en el documento de referencia y en el código real |
| Demostración | 20 % | El instructor ejecuta la tarea explicando cada decisión |
| Práctica guiada | 40 % | El participante reproduce la tarea en su propio entorno, con acompañamiento |
| Cierre y resolución de dudas | 10 % | Repaso de errores frecuentes y verificación del entregable |

**Recursos empleados:**

- Repositorio con historial completo y planes vivos en `docs/plan-*.md`.
- Documentación de ingeniería publicada en `/docs`, generada desde modelos
  tipados: requerimientos, casos de uso, diagramas BPMN y UML, niveles de
  testing, verificación y validación, y estado del canal de integración continua
  en vivo.
- Entorno de desarrollo reproducible en contenedor (`.devcontainer/`), que evita
  que la sesión se consuma resolviendo diferencias entre las máquinas de los
  participantes.
- Bases de datos desechables, sembradas con datos ficticios.
- Laboratorio del sistema, que permite provocar fallos reales de forma controlada
  y observarlos en el monitoreo.

**Principio metodológico.** Los ejercicios de las sesiones 4 y 5 se realizan
**provocando fallos reales, no simulándolos con diapositivas**. El participante
inyecta una caída con la herramienta de caos, observa cómo el monitoreo la
detecta y cómo se abre el incidente, y después lo cierra. La misma lógica aplica
a la reversión automática: se fuerza un fallo de verificación posterior al
despliegue y se observa la vuelta a la última versión saludable. Un procedimiento
de respuesta que solo se ha leído no está aprendido.

## 5.2 Capacitación de Usuario Final

### 5.2.1 Administrador funcional

Metodología **demostrativa y práctica sobre el entorno de demostración**
(`/demo`), que reproduce la interfaz real con datos ficticios. Esto permite que
el participante ejecute libremente cualquier acción del recorrido sin riesgo de
alterar información real ni de enviar comunicaciones a clientes verdaderos.

Distribución del tiempo por módulo:

| Fase | Proporción | Descripción |
|---|---|---|
| Demostración | 40 % | El instructor recorre la funcionalidad mostrando el flujo completo |
| Práctica | 45 % | El participante repite el flujo sobre el entorno de demostración |
| Preguntas y casos límite | 15 % | Qué hacer cuando algo no sale como se espera |

El lenguaje es **funcional y orientado a la tarea**, no técnico: se habla de
«rentabilidad del proyecto» y no de «cálculo de P&L», de «bloquear una dirección
que está atacando» y no de «escalado de TTL en la lista de bloqueo». Los términos
técnicos que resulten inevitables se remiten al glosario del *Manual de Usuario*.

Cada módulo cierra con un **caso práctico completo de extremo a extremo** en
lugar de un ejercicio por pantalla: por ejemplo, dar de alta un cliente, crear su
proyecto, registrar su alcance, cargar sus costos, emitir una factura y
comprobarla como pagada. La operación real encadena pantallas, y practicarlas
aisladas no prepara para ello.

### 5.2.2 Usuario de cliente

Metodología de **autoservicio guiado**. El material se entrega junto con la
invitación y está diseñado para consumirse en el momento del primer acceso, sin
instructor.

Componentes:

1. **Guía breve de primer acceso**, incluida en el correo de invitación: qué es
   el portal, cómo activar la cuenta y qué encontrará dentro. Extensión máxima de
   una página.
2. **Recorrido dentro del propio portal**, que orienta sobre cada sección la
   primera vez que se visita.
3. **Extracto del Manual de Usuario** correspondiente al apartado 2.8, entregado
   en PDF.
4. **Canal de consulta**: la propia mensajería del portal, que sirve
   simultáneamente como soporte y como primer ejercicio práctico de la
   herramienta.
5. **Sesión de acompañamiento opcional** de 30 minutos, a solicitud del cliente,
   remota y sobre su propia cuenta.

El criterio de diseño de esta ruta es que **el portal debe poder usarse sin
capacitación**. La formación de usuario final es aquí una red de seguridad, no un
requisito de acceso; si un cliente necesita una sesión para entender dónde está
su factura, el problema está en la interfaz y debe corregirse allí, no
compensarse con más capacitación.

## 5.3 Roles y responsabilidades

| Rol | Responsable | Responsabilidades |
|---|---|---|
| Instructor | Michael David Rodríguez Beltran | Preparar e impartir las sesiones; elaborar y mantener el material; aplicar y calificar las evaluaciones; atender las dudas durante el periodo de acompañamiento |
| Responsable del material | Michael David Rodríguez Beltran | Mantener actualizados los manuales y el material de apoyo cuando el sistema cambie |
| Participante técnico | Personal de desarrollo y operación | Asistir a la totalidad de las sesiones; disponer del entorno según los prerrequisitos; completar los ejercicios y la evaluación |
| Participante usuario final | Administrador funcional | Asistir a las sesiones; completar los casos prácticos; reportar los puntos de la interfaz que resulten confusos |
| Usuario de cliente | Contacto de la empresa cliente | Activar su cuenta y recorrer el material de autoservicio; solicitar acompañamiento si lo requiere |
| Patrocinador | (Instructor asignado) | Aprobar el plan, verificar su cumplimiento y validar los resultados de la evaluación |

## 5.4 Seguimiento

El seguimiento se realiza en tres momentos, con instrumentos distintos.

**Durante la capacitación**

| Instrumento | Ruta | Criterio |
|---|---|---|
| Lista de asistencia por sesión | Técnica y usuario final | Asistencia mínima del 80 % de las sesiones |
| Verificación del entregable de cada sesión | Técnica | El entregable debe completarse; sin él la sesión no se da por cursada |
| Observación del caso práctico | Usuario final — administrador | El participante completa el flujo de extremo a extremo sin asistencia |

**Al finalizar la capacitación**

| Instrumento | Ruta | Criterio de aprobación |
|---|---|---|
| Evaluación práctica | Técnica | Desplegar el sistema en un entorno limpio, aplicar una migración aditiva y responder a un incidente simulado. Aprobación con el 100 % de las tres tareas completadas |
| Evaluación práctica | Usuario final — administrador | Completar el ciclo comercial de extremo a extremo y responder correctamente a una alerta. Aprobación con las dos tareas completadas |
| Encuesta de satisfacción | Todas | Instrumento de mejora del plan, no de calificación del participante |
| Confirmación de primer acceso | Usuario de cliente | La cuenta pasa de estado `invited` a `active`, dato que el sistema registra por sí mismo |

**Después de la capacitación**

| Instrumento | Ruta | Periodo |
|---|---|---|
| Acompañamiento con consultas ilimitadas | Técnica | 30 días naturales tras la última sesión |
| Acompañamiento con consultas ilimitadas | Usuario final — administrador | 15 días naturales tras la última sesión |
| Revisión de refuerzo | Técnica y usuario final | Sesión de 1 hora a los 30 días, para resolver las dudas surgidas en la operación real |
| Soporte por la mensajería del portal | Usuario de cliente | Permanente |

**Indicadores del plan**

| Indicador | Meta |
|---|---|
| Cobertura: participantes convocados que completan su ruta | ≥ 90 % |
| Aprobación de la evaluación práctica | 100 % de los participantes técnicos y del administrador funcional |
| Activación de cuentas de cliente en los 7 días siguientes a la invitación | ≥ 80 % |
| Consultas de soporte por cliente en su primer mes de uso del portal | ≤ 2 |
| Satisfacción media declarada | ≥ 4 sobre 5 |

El cuarto indicador es el que mide realmente el éxito de la ruta de cliente: un
número alto de consultas de soporte no señala un fallo de capacitación, señala un
punto de la interfaz que debe rediseñarse.

## 5.5 Material de capacitación

| # | Material | Ruta | Formato | Estado |
|---|---|---|---|---|
| 1 | Manual Técnico | Técnica | Documento | Elaborado |
| 2 | Manual de Instalación | Técnica | Documento | Elaborado |
| 3 | Manual de Usuario | Usuario final | Documento | Elaborado |
| 4 | Documento de Especificación de Arquitectura | Técnica | Documento | Elaborado |
| 5 | Documentación de ingeniería publicada en `/docs` | Técnica | Sitio web | Publicado y vivo |
| 6 | Diagramas BPMN y UML (procesos, despliegue, componentes, comunicación, actividades) | Técnica | SVG y PDF imprimible | Publicados; exportables con `npm run bpmn:export` |
| 7 | Repositorio con planes vivos por módulo | Técnica | Repositorio | Vigente |
| 8 | Entorno de desarrollo reproducible en contenedor | Técnica | Configuración | Elaborado |
| 9 | Bases de datos de prueba sembradas | Técnica | Guiones de siembra | Elaborados |
| 10 | Entorno de demostración del panel (`/demo`) | Usuario final | Sitio web | Publicado |
| 11 | Guía breve de primer acceso al portal | Usuario de cliente | Una página, adjunta a la invitación | **Por elaborar** |
| 12 | Extracto del Manual de Usuario, apartado 2.8 | Usuario de cliente | PDF | Derivado del material 3 |
| 13 | Presentación de apoyo por módulo | Todas | Presentación | **Por elaborar** |
| 14 | Guion de casos prácticos y evaluaciones | Todas | Documento | **Por elaborar** |
| 15 | Listas de asistencia y encuesta de satisfacción | Todas | Formato | **Por elaborar** |

**Mantenimiento del material.** El material se actualiza cuando el sistema
cambia, no en una revisión periódica programada. La regla operativa vigente en el
proyecto es que toda entrega de un módulo grande actualiza su plan
correspondiente y da de alta el requerimiento en la fuente de verdad tipada; los
manuales se revisan en ese mismo momento si el cambio afecta a un procedimiento
descrito.

## 5.6 Agenda de la Capacitación

### 5.6.1 Contenido de la capacitación técnica

**Módulo MT-1 — Arquitectura y visión general del sistema (3 h)**

| Tema | Duración | Contenido |
|---|---|---|
| Propósito y alcance del sistema | 20 min | Las tres funciones simultáneas: vitrina, operación y laboratorio. Limitaciones declaradas del alcance |
| Arquitectura general | 40 min | Flujo de una petición: borde, middleware, renderizado en servidor y persistencia. Por qué no hay servidor propio |
| Recorrido del repositorio | 40 min | Estructura de directorios, qué vive en cada uno y por qué. Convenciones obligatorias |
| Los tres sistemas de autenticación | 30 min | Administración, portal y demostración. Por qué están completamente separados |
| Documentación como código | 20 min | La fuente de verdad tipada, los diagramas generados en el servidor y por qué ninguna cifra se escribe a mano |
| Ejercicio | 30 min | Localizar en el código el punto donde se aplica un requerimiento dado, partiendo de su ficha en `/docs` |

**Módulo MT-2 — Instalación, configuración y despliegue (4 h)**

| Tema | Duración | Contenido |
|---|---|---|
| Prerrequisitos y software base | 20 min | Node.js 22 y por qué una versión inferior rompe la construcción. Contenedor de desarrollo |
| Variables de entorno | 50 min | Obligatorias, específicas y opcionales. La diferencia entre las dos fuentes de configuración y por qué toda lectura pasa por un único punto |
| Aprovisionamiento de servicios | 30 min | Cuentas necesarias y credenciales a obtener. Confirmación del proyecto de despliegue correcto antes de escribir variables |
| Despliegue completo | 60 min | Del clonado del repositorio al sitio respondiendo, paso a paso |
| Bases de datos locales | 30 min | Servidores en contenedor, siembra y reinicio |
| Verificación posterior | 30 min | Las once comprobaciones mínimas del Manual de Instalación |
| Ejercicio | 40 min | Despliegue completo en el entorno del participante, verificado con la lista de comprobación |

**Módulo MT-3 — Modelo de datos y migraciones (3 h)**

| Tema | Duración | Contenido |
|---|---|---|
| Esquema y agrupaciones | 40 min | Las cincuenta tablas por agrupación funcional; las entidades centrales en detalle |
| Decisiones de modelado | 30 min | Denormalización deliberada del feed de actividad; el cobro de campo como fila de pagos; importes enteros |
| Capa de acceso a datos | 30 min | Consultas con el mapeador; selección de instancia por petición; por qué no hay vistas ni procedimientos almacenados |
| Aislamiento multi-cliente | 30 min | Por qué el identificador de cliente nunca procede de la petición, y qué expone un fallo aquí |
| Migraciones | 30 min | Generación y aplicación; por qué son exclusivamente aditivas; el caso en que el generador produce SQL incorrecto |
| Ejercicio | 20 min | Añadir una columna, generar la migración, revisar el SQL y aplicarla |

**Módulo MT-4 — Seguridad, observabilidad y respuesta a incidentes (3 h)**

| Tema | Duración | Contenido |
|---|---|---|
| El middleware como guarda único | 30 min | El orden de los guardas y por qué la normalización de idioma va primero |
| Sistema reducido de eventos de seguridad | 40 min | Sensor, límite de tasa durable, lista de bloqueo con expiración escalada, agregación y detección de anomalías |
| El criterio de fail-open | 20 min | Por qué el fallo del enforcement deja pasar la petición, y cuál es la única excepción del sistema |
| Motor de disponibilidad | 30 min | Sondeos, incidentes, objetivos de nivel de servicio y presupuesto de error |
| OPSEC en páginas públicas | 15 min | Qué no puede publicarse nunca, y por qué las vistas públicas solo muestran agregados |
| Ejercicio | 45 min | Inyectar una caída controlada, observar la apertura del incidente en el monitoreo, cerrarla; bloquear una dirección y comprobar su expiración |

**Módulo MT-5 — Pruebas, integración continua y respaldos (3 h)**

| Tema | Duración | Contenido |
|---|---|---|
| Estrategia de pruebas | 40 min | Los niveles empleados, qué pregunta responde cada uno y su costo |
| Reglas de la suite | 30 min | Base en fichero temporal y no en memoria; separación de módulos isomorfos; siembra en el arranque del servidor de pruebas |
| Canal de integración continua | 30 min | Etapas, ingesta de resultados y reversión automática |
| Respaldos y retención | 30 min | Alcance del volcado, destino, frecuencia y política de purga a 90 días |
| Recuperación | 20 min | Procedimiento completo de restauración |
| Ejercicio | 30 min | Ejecutar las suites, generar un respaldo y ensayar su restauración sobre una base desechable |

### 5.6.2 Contenido de la capacitación de Usuario Final

**Administrador funcional**

**Módulo MU-1 — Acceso, sesiones y orientación general (45 min)**

| Tema | Duración |
|---|---|
| Iniciar sesión y por qué autenticarse no basta para entrar | 10 min |
| Llaves de acceso como alternativa a la contraseña | 10 min |
| Revisar dispositivos conectados y revocar los desconocidos | 15 min |
| Recorrido general del panel y ubicación de cada apartado | 10 min |

**Módulo MU-2 — Clientes, proyectos, alcance y seguimiento (1 h 15 min)**

| Tema | Duración |
|---|---|
| Dar de alta un cliente | 10 min |
| Crear un proyecto y sus campos obligatorios | 20 min |
| Elaborar el alcance del proyecto, con especial atención a las exclusiones | 20 min |
| Registrar seguimiento comercial con próxima acción y vencimiento | 15 min |
| Atender la bandeja de mensajes y la asociación automática por correo | 10 min |

**Módulo MU-3 — Finanzas (1 h)**

| Tema | Duración |
|---|---|
| Registrar ingresos y el ciclo proyectado → pendiente → cobrado | 15 min |
| Registrar costos de servicios y consultar la rentabilidad real | 20 min |
| Interpretar la advertencia de moneda sin tasa de cambio | 10 min |
| Guardar y revelar credenciales en la bóveda | 15 min |

**Módulo MU-4 — Facturación y cobro (1 h)**

| Tema | Duración |
|---|---|
| Emitir una factura y su ciclo de estados | 20 min |
| Cobro de campo desde el celular por mensajería instantánea | 25 min |
| Comprobar que el pago cierra la factura, y qué ocurre ante un doble intento | 15 min |

**Módulo MU-5 — Administración del portal de clientes (1 h)**

| Tema | Duración |
|---|---|
| Invitar a un usuario de cliente y elegir su rol | 15 min |
| Publicar hitos de avance y su efecto en lo que ve el cliente | 15 min |
| Responder la mensajería y compartir documentos | 15 min |
| Curar el feed de actividad y usar la vista de soporte de solo lectura | 15 min |

**Módulo MU-6 — Observabilidad, seguridad y alertas (1 h)**

| Tema | Duración |
|---|---|
| Dar de alta un monitor y leer la página de estado | 15 min |
| Qué hacer cuando llega una alerta de caída | 20 min |
| Revisar eventos y anomalías de seguridad; bloquear una dirección | 15 min |
| Generar un respaldo manual | 10 min |

**Usuario de cliente**

**Módulo MC-1 — Activación y primer acceso (10 min)**

| Tema |
|---|
| Qué es el portal y qué información encontrará en él |
| Abrir la invitación y elegir la contraseña |
| Iniciar sesión y recuperar la contraseña si se olvida |

**Módulo MC-2 — Avance del proyecto (10 min)**

| Tema |
|---|
| Leer la barra de avance y los hitos |
| La información se actualiza sola: no es necesario recargar |

**Módulo MC-3 — Facturas y documentos (10 min)**

| Tema |
|---|
| Consultar las facturas y sus estados |
| Descargar una factura en PDF |
| Consultar y descargar los documentos compartidos |

**Módulo MC-4 — Mensajería y notificaciones (15 min)**

| Tema |
|---|
| Escribir en el hilo del proyecto y leer las respuestas |
| La campana de notificaciones |
| Consultar la línea de tiempo de actividad |
| Ajustar qué avisos se reciben por correo |

---

## Anexo — Restricciones y consideraciones del plan

| # | Consideración | Implicación |
|---|---|---|
| 1 | El sistema tiene un único administrador y no maneja roles granulares en el panel | La ruta de administrador funcional no requiere formación diferenciada por perfil |
| 2 | Los clientes se incorporan de forma continua | La ruta de cliente debe ser asíncrona y repetible sin costo marginal |
| 3 | El entorno de demostración reproduce el panel con datos ficticios | Toda la práctica de la ruta de usuario final se realiza sin riesgo sobre datos reales |
| 4 | Los cambios del sistema son frecuentes | El material debe actualizarse al entregar cada módulo, no en revisiones programadas |
| 5 | Parte del laboratorio está aún pendiente (pruebas de carga) | El módulo MT-5 declara ese contenido como no cubierto en esta versión del plan |
| 6 | La documentación de `/docs` está solo en español | No se contempla capacitación en inglés en esta versión |
