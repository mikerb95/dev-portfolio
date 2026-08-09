# CodeByMike - Portafolio, Panel de Control y Portal de Clientes

## Manual Técnico

**Versión:** 0100
**Fecha:** 03/08/2026

---

## HOJA DE CONTROL

| | | | |
|---|---|---|---|
| **Organismo** | SENA - Centro de Servicios Financieros, Regional Distrito Capital | | |
| **Proyecto** | CodeByMike - Portafolio, Panel de Control y Portal de Clientes (codebymike.tech) | | |
| **Entregable** | Manual Técnico | | |
| **Autor** | Michael David Rodríguez Beltran<br>Análisis y Desarrollo de Software - Ficha 3114731 - Trimestre 7 | | |
| **Versión/Edición** | 0100 | **Fecha Versión** | 03/08/2026 |
| **Aprobado por** | (pendiente de asignación) | **Fecha Aprobación** | (pendiente) |
| | | **Nº Total de Páginas** | `<al exportar>` |

## REGISTRO DE CAMBIOS

| Versión doc | Causa del Cambio | Responsable del Cambio | Fecha del Cambio |
|---|---|---|---|
| 0100 | Versión inicial | Michael David Rodríguez Beltran | 03/08/2026 |
| | | | |
| | | | |

## CONTENIDO

1. Propósito
2. Alcance
3. Documentos de referencia
4. Definiciones importantes
5. Procesos de entrada y salida
6. Descripción de módulos
7. Diccionario de datos
8. Modelo relacional
9. Distribución física y lógica de base de datos
10. Tablas, vistas y procedimientos almacenados
11. Políticas de respaldo
12. Instalación y configuración
    - 12.1 Requisitos generales pre-instalación
    - 12.2 Detalles del proceso de instalación
    - 12.3 Detalles de configuración de la aplicación
    - 12.4 Variables de ambiente
    - 12.5 Parámetros de aplicaciones
    - 12.6 Lista de contactos técnicos
13. Diseño de la arquitectura física
14. Descripción de usuarios
15. Anexos

---

# 1. PROPÓSITO

Este documento describe la construcción interna del sistema publicado en
`codebymike.tech`: sus módulos, sus interfaces, su modelo de datos, su despliegue
y los procedimientos técnicos necesarios para operarlo y mantenerlo.

Está dirigido a personal técnico (desarrollo y operación) que deba intervenir el
sistema, diagnosticar una incidencia o continuar su evolución. No sustituye al
*Manual de Usuario*, que describe la operación funcional, ni al *Manual de
Instalación*, que detalla el procedimiento de puesta en marcha paso a paso.

# 2. ALCANCE

El documento cubre la totalidad del sistema, que comprende cuatro subsistemas
desplegados sobre una misma base de código:

- **Sitio público** - portafolio, artículos técnicos, estado de servicios,
  documentación de ingeniería y vitrina comercial, en español (canónico) e inglés
  (bajo el prefijo `/en`).
- **Panel de control privado** (`/admin`) - CRM, finanzas y rentabilidad, bóveda
  de credenciales, observabilidad, seguridad y laboratorio de ingeniería.
- **Portal de clientes** (`/portal`) - área privada multi-cliente con hitos,
  facturas, documentos, mensajería y feed de actividad.
- **Servicios automáticos** - motor de sondeos de disponibilidad, agregación de
  eventos de seguridad, respaldos, detección de anomalías y notificaciones,
  disparados por tareas programadas externas.

Queda fuera del alcance el detalle interno de los servicios de terceros
utilizados (Vercel, Turso, GitHub, Wompi, ntfy.sh, Resend), de los que solo se
documenta la interfaz de integración.

# 3. DOCUMENTOS DE REFERENCIA

| Ref. | Título | Ubicación |
|---|---|---|
| Ref. 1 | Documento de Especificación de Arquitectura (DEA) | `DEA Formato_Documento_de_Arquitectura.docx` |
| Ref. 2 | Manual de Usuario | `docs/manuales-sena/manual-de-usuario.md` |
| Ref. 3 | Manual de Instalación | `docs/manuales-sena/manual-de-instalacion.md` |
| Ref. 4 | Plan de Capacitación | `docs/manuales-sena/plan-de-capacitacion.md` |
| Ref. 5 | Requerimientos funcionales y no funcionales (fuente de verdad, tipada) | `src/data/documentacion.ts` · publicado en `/docs` |
| Ref. 6 | Guía de niveles de testing y estrategia de pruebas | `src/data/testing.ts` · publicado en `/docs/testing` |
| Ref. 7 | Verificación y validación | `src/data/vyv.ts` · publicado en `/docs/verificacion-validacion` |
| Ref. 8 | Diagramas BPMN de los procesos de negocio | `src/data/bpmn.ts` · publicado en `/docs/diagrama-bpmn` |
| Ref. 9 | Diagramas UML (despliegue, componentes, comunicación, actividades) | `src/data/{despliegue,componentes,comunicacion,actividades}.ts` |
| Ref. 10 | Instrucciones de contribución y convenciones del repositorio | `CLAUDE.md` |
| Ref. 11 | Planes vivos por módulo | `docs/plan-*.md` |
| Ref. 12 | ISO/IEC 25010 - Modelo de calidad del producto software | Norma externa |
| Ref. 13 | OWASP Top 10 | Norma externa |
| Ref. 14 | WCAG 2.1 nivel AA | Norma externa |

# 4. DEFINICIONES IMPORTANTES

| Término | Definición |
|---|---|
| SSR | *Server-Side Rendering*. El HTML se construye en el servidor en cada petición. Astro está configurado con `output: 'server'`. |
| Middleware | Capa que intercepta toda petición antes de que llegue a la aplicación. Aquí concentra los guardas de seguridad, el límite de tasa y las cabeceras. |
| ORM | *Object-Relational Mapping*. Drizzle traduce entre tipos de TypeScript y tablas SQL, y garantiza consultas parametrizadas. |
| libSQL / Turso | Motor compatible con SQLite (`libSQL`) ofrecido como servicio gestionado (`Turso`), accedido por HTTP/hrana sobre TLS. |
| Fail-open | Criterio de diseño según el cual el fallo de un mecanismo de seguridad u observabilidad deja pasar la petición en lugar de bloquearla. |
| Idempotencia | Propiedad por la que repetir una operación con la misma clave produce el mismo resultado que ejecutarla una vez. |
| Micro-SIEM | Implementación propia y reducida de un sistema de gestión de eventos de seguridad: sensor, límite de tasa durable, lista de bloqueo y agregación. |
| Honeypot | Ruta señuelo sin función legítima cuya sola visita evidencia intención hostil. |
| AsyncLocalStorage | Mecanismo de Node.js empleado para propagar el contexto de «modo demostración» a lo largo de la cadena asíncrona y así seleccionar la base de datos correcta. |
| TTL | *Time To Live*. Plazo obligatorio de expiración de un dato temporal. |
| Rollup | Agregado precalculado (horario o diario) de eventos, que sobrevive a la purga del detalle crudo. |
| Mutation testing | Técnica que mide la calidad de la suite de pruebas introduciendo defectos artificiales y comprobando cuántos detecta. |
| SAST / DAST | Análisis estático de seguridad sobre el código y análisis dinámico sobre la aplicación en ejecución, respectivamente. |

# 5. PROCESOS DE ENTRADA Y SALIDA

## 5.1 Entradas

| Entrada | Origen | Canal | Tratamiento |
|---|---|---|---|
| Petición HTTP de navegación | Visitante, administrador o cliente | HTTPS | Normalización de idioma, clasificación de seguridad, límite de tasa, verificación de sesión y renderizado SSR |
| Formulario de contacto | Visitante | `POST /api/contact` | Validación de campos, límite de tasa, asociación por correo exacto a un cliente, persistencia en `messages` |
| Autenticación del administrador | GitHub (OAuth 2.0) o llave WebAuthn | `/api/auth/*`, `/api/auth/webauthn/*` | Verificación de identidad, contraste contra la lista de autorización, alta de sesión |
| Autenticación del cliente | Cliente | `POST /api/portal/login` | Verificación de contraseña (scrypt), control de intentos fallidos, alta de sesión propia |
| Aviso de la pasarela de pagos | Wompi | `POST /api/payments/webhook` | Verificación de firma, aplicación idempotente del evento, detección de duplicados y desórdenes |
| Disparo de tarea programada | cron-job.org | `GET /api/cron/*` con `Authorization: Bearer` | Comparación del secreto en tiempo constante y ejecución de la tarea |
| Ingesta del pipeline | GitHub Actions | `POST /api/lab/ingest` | Registro de la corrida en `ci_runs` y de los hallazgos en `security_findings` |
| Métricas de experiencia real | Navegador del visitante | `POST /api/vitals` | Persistencia sin datos personales |
| Informes de violación de CSP | Navegador del visitante | `POST /api/security/csp-report` | Registro para diagnóstico de la política de contenido |

## 5.2 Salidas

| Salida | Destino | Canal | Contenido |
|---|---|---|---|
| Páginas HTML | Navegador | HTTPS | Sitio público, panel y portal renderizados en servidor |
| Respuestas JSON | Navegador y sistemas externos | HTTPS | Resultado de las operaciones de las rutas `/api` |
| Factura en PDF | Cliente | `GET /api/portal/facturas/[id]/pdf` | Documento generado en el servidor |
| Notificación push | Canal ntfy.sh | HTTPS | Caída de monitor, vencimiento de dominio, anomalía de seguridad |
| Correo electrónico | Cliente o administrador | Resend | Invitación, restablecimiento de contraseña, alerta y avisos del portal |
| Cobro y enlace de pago | Cliente | WhatsApp (`wa.me`) desde el dispositivo | Mensaje con enlace corto `/c/[code]` y enlace firmado al histórico |
| Respaldo de la base de datos | Vercel Blob | HTTPS | Volcado periódico y manual |
| Sitemap, RSS y notificación IndexNow | Buscadores | HTTPS | Índice de contenidos y avisos de publicación |
| Respuesta de salud | Motor de monitoreo | `GET /api/health`, `GET /api/portal/health` | Estado booleano y latencias, sin datos de clientes |

# 6. DESCRIPCIÓN DE MÓDULOS

## 6.1 Mapa de componentes

| Componente | Ubicación | Responsabilidad | Interfaces que provee | Interfaces que consume |
|---|---|---|---|---|
| `SitioPublico` | `src/pages/` (raíz, `notes/`, `docs/`, `status/`, `tools/`) | Presentación pública | - | `IEndpointsHTTP` |
| `PanelAdmin` | `src/pages/admin/` | Operación privada del negocio | - | `IEndpointsHTTP` |
| `PortalClientes` | `src/pages/portal/` | Área privada del cliente | - | `IEndpointsHTTP` |
| `Middleware` | `src/middleware.ts` | Guarda único de entrada | - | `IEnforcement` |
| `ApiInterna` | `src/pages/api/` | Endpoints de negocio y tareas programadas | `IEndpointsHTTP` | `ICobros`, `IMonitoreo` |
| `MicroSIEM` | `src/lib/security/` | Clasificación, límite de tasa, bloqueo y agregación | `IEnforcement` | `IRepositorio` |
| `MotorDePagos` | `src/lib/payments.ts`, `payments-state.ts` | Máquina de estados idempotente | `ICobros` | `IRepositorio`, `INotificacion` |
| `Observabilidad` | `src/lib/slo.ts`, `src/lib/lab/` | Monitores, incidentes y objetivos de servicio | `IMonitoreo` | `IRepositorio`, `INotificacion` |
| `AccesoADatos` | `src/db/` | Esquema y consultas | `IRepositorio` | - |
| `Notificaciones` | `src/lib/notify.ts` | Envío push y correo, opcional | `INotificacion` | - |

El componente de acceso a datos es aquel del que dependen casi todos los demás y
es, por tanto, el único punto donde puede imponerse una regla transversal como el
aislamiento por cliente del portal. Una consulta que accediera a la base de datos
sin pasar por él no aparecería en el diagrama de componentes, y es exactamente la
clase de defecto capaz de exponer los datos de un cliente a otro.

## 6.2 Módulos funcionales

### 6.2.1 Middleware (`src/middleware.ts`)

Punto de entrada único de toda petición. Ejecuta, en este orden:

1. **Normalización de idioma.** El *pathname* se convierte a su forma canónica
   una sola vez. Todos los guardas posteriores reciben la ruta ya normalizada,
   porque comparan rutas literales: una ruta `/en/admin` sin normalizar habría
   sido una copia del panel sin vigilancia.
2. **Lista de bloqueo.** Direcciones IP bloqueadas reciben `403` sin más
   procesamiento.
3. **Clasificación de amenazas.** Cada petición se contrasta contra firmas
   conocidas (recorrido de rutas, inyección SQL, XSS). El registro del evento es
   *fire-and-forget* para no añadir latencia.
4. **Límite de tasa durable.** Contadores respaldados en base de datos, que
   sobreviven a los redespliegues.
5. **Inyección de fallos (chaos).** Solo si hay un experimento activo. Las rutas
   `/admin`, `/api/admin` y `/api/auth` están excluidas por código.
6. **Guarda de administración.** Revalidación de la lista de autorización en cada
   petición, como defensa en profundidad frente a la sesión.
7. **Guardas del portal y del modo demostración.**
8. **Cabeceras de respuesta.** CSP, HSTS, `Permissions-Policy`, `X-Frame-Options`,
   `X-Content-Type-Options`, `Referrer-Policy`, `noindex` en rutas privadas y
   `Cache-Control` de páginas públicas.

Todo el enforcement es *fail-open*: si un guarda falla internamente, la petición
continúa. Un sistema de defensa capaz de tumbar el sitio que protege es una
superficie de ataque nueva, no una defensa.

### 6.2.2 Autenticación

El sistema mantiene **tres mecanismos de autenticación completamente separados**,
que no comparten cookies ni lógica:

| Mecanismo | Ámbito | Credencial | Sesión |
|---|---|---|---|
| Administrador | `/admin`, `/api/admin/*` | GitHub OAuth con lista de autorización, o llave WebAuthn/FIDO2 | Auth.js; dispositivos en `admin_sessions` |
| Portal de clientes | `/portal`, `/api/portal/*` | Correo y contraseña (scrypt) | Cookie `portal_session`; tabla `portal_sessions` |
| Demostración pública | `/demo` | Pase HMAC de corta duración, sin inicio de sesión | Cookie propia; solo `GET`/`HEAD` |

La separación es deliberada: un defecto en el portal no puede escalar al panel, y
viceversa.

### 6.2.3 Módulo de seguridad (`src/lib/security/`)

| Fichero | Función |
|---|---|
| `classify.ts` | Clasificación por firmas de la petición: categoría y severidad |
| `sensor.ts` | Registro del evento sin bloquear la respuesta |
| `ratelimit-durable.ts` | Límite de tasa de dos capas respaldado en `rate_limit_buckets` |
| `blocklist.ts` | Bloqueo con TTL y escalado por reincidencia (1 h → 24 h → 7 d); caché en memoria de 30 s |
| `anomaly.ts` | Detección estadística por puntuación z sobre línea base de 30 días |
| `paths.ts` | Clasificación de rutas: limitables, de cobro, honeypot |
| `events.ts` | Persistencia de eventos y agregados |

### 6.2.4 Módulo de pagos (`src/lib/payments.ts`, `payments-state.ts`)

La máquina de estados vive en un módulo **puro, sin acceso a base de datos**,
para poder reutilizarse también en código que se ejecuta en el navegador. Sus
invariantes:

- Una clave de idempotencia nunca genera dos cobros: la operación es
  `createPaymentIdempotent`.
- Los estados terminales (`approved`, `declined`, `error`, `voided`) no
  retroceden ante avisos fuera de orden; el evento se registra marcado como
  `out_of_order` y el estado se conserva.
- Todo evento de la pasarela queda en `payment_events`, incluidos los duplicados
  y los de importe discordante.

Cualquier operación de pago nueva debe reutilizar `createPaymentIdempotent` y
`applyGatewayEvent`; construir una máquina de estados paralela por funcionalidad
está expresamente prohibido en las convenciones del repositorio.

### 6.2.5 Módulo del portal (`src/lib/portal/`)

Contiene sesiones, contraseñas, consultas de proyectos, facturas, documentos,
mensajería, actividad, digest en vivo y salud del propio portal.

**Regla de aislamiento multi-cliente:** el identificador de cliente nunca procede
de la petición. En toda consulta del portal, `clientId` sale de
`requirePortalSession()` y viaja en la cláusula `WHERE` aunque la consulta ya
lleve un `projectId` o un `invoiceId` que «ya implique» al cliente. Un defecto
aquí no degrada una funcionalidad: expone los datos de un cliente a otro.

### 6.2.6 Módulo de observabilidad

El motor de sondeos no es un proceso residente: lo dispara una tarea programada
externa contra `GET /api/cron/uptime-check`. Cada sondeo registra un *check*, y
los fallos consecutivos se agrupan en un incidente que se abre en el primer fallo
y se cierra en el primer éxito.

El chequeo de salud del portal (`src/lib/portal/health.ts`) es la **única parte
de la observabilidad que no es fail-open**: si algo está roto tiene que decirlo.
Ejecuta la misma unión de tres tablas que resuelve una sesión, con un
identificador imposible, en lugar de sondear la página de acceso (que renderiza
sin tocar la base de datos y cuyo `200` no probaría nada).

### 6.2.7 Módulo de internacionalización (`src/i18n/`)

Módulo **puro**, importado tanto por el middleware como por el navegador. El
español es el idioma canónico y el inglés vive bajo el prefijo `/en`. Añadir una
traducción son tres pasos: texto al diccionario, cascarón de ruta en
`src/pages/en/` y alta en `TRANSLATED_ROUTES`. Los enlaces se pintan con
`localizedHref`, que cae al español cuando no hay traducción.

### 6.2.8 Módulos de diagramación (`src/lib/bpmn-layout.ts`, `src/lib/uml-*.ts`)

Motores de trazado propios que generan el SVG **en el servidor** a partir de
modelos tipados en `src/data/`. Se emplean para BPMN, despliegue, comunicación,
actividades y componentes, notaciones que Mermaid no cubre o cubre
incorrectamente. Los diagramas de secuencia, clases y objetos sí se generan con
Mermaid.

# 7. DICCIONARIO DE DATOS

El esquema completo es la fuente de verdad y vive en `src/db/schema.ts`. Se
compone de **50 tablas**. A continuación se documenta el diccionario de las
entidades centrales; el resto se relaciona en el apartado 10.

## 7.1 `clients` - Clientes

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | No | Identificador |
| `name` | TEXT | No | Razón social o nombre |
| `email` | TEXT | Sí | Correo de contacto principal |
| `phone` | TEXT | Sí | Teléfono de contacto |
| `company` | TEXT | Sí | Empresa |
| `notes` | TEXT | Sí | Notas internas, nunca visibles en el portal |
| `portal_enabled` | INTEGER (bool) | No | Habilita el acceso al portal para este cliente |
| `logo_url` | TEXT | Sí | Logotipo mostrado en el portal |
| `billing_info` | TEXT | Sí | Datos de facturación |
| `created_at` | INTEGER (timestamp) | No | Fecha de alta |

## 7.2 `projects` - Proyectos

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `slug` | TEXT UNIQUE | No | Identificador para la URL pública |
| `title` / `title_en` | TEXT | No / Sí | Título en español y su traducción |
| `description` / `description_en` | TEXT | Sí | Descripción y su traducción |
| `tech_stack` | TEXT | Sí | Tecnologías empleadas |
| `repo_url`, `preview_url`, `screenshot_url` | TEXT | Sí | Enlaces asociados |
| `visible` | INTEGER (bool) | No | Determina la aparición en el sitio público |
| `status` | TEXT | No | `activo` \| `pausado` \| `completado` \| `archivado` |
| `start_date`, `end_date` | INTEGER (timestamp) | Sí | Fechas del proyecto |
| `internal_notes` | TEXT | Sí | Notas privadas |
| `client_id` | INTEGER FK → `clients.id` | Sí | Cliente asociado |
| `created_at` | INTEGER (timestamp) | No | Fecha de alta |

## 7.3 `project_services` - Servicios y costos (incluye la bóveda)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `project_id` | INTEGER FK → `projects.id` | Sí | Proyecto asociado |
| `client_id` | INTEGER FK → `clients.id` | Sí | Cliente asociado |
| `name`, `category`, `provider`, `url`, `username` | TEXT | - | Identificación del servicio contratado |
| `cost` | REAL | Sí | Costo del servicio |
| `currency` | TEXT | No | Moneda del costo |
| `billing_cycle` | TEXT | Sí | Periodicidad de facturación |
| `renewal_date` | INTEGER (timestamp) | Sí | Próxima renovación |
| `auto_renew`, `active` | INTEGER (bool) | No | Estado del servicio |
| `payer` | TEXT | Sí | Quién asume el costo |
| `billed_to_client` | REAL | Sí | Importe repercutido al cliente |
| `secrets` | TEXT | Sí | **Credenciales cifradas con AES-256-GCM.** Nunca se devuelve en listados |
| `notes` | TEXT | Sí | Observaciones |
| `created_at`, `updated_at` | INTEGER (timestamp) | - | Auditoría |

## 7.4 `payments` - Pagos

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `reference` | TEXT UNIQUE | No | Referencia de la transacción |
| `idempotency_key` | TEXT UNIQUE | No | **Clave que impide el doble cobro** |
| `description` | TEXT | Sí | Concepto |
| `amount_cents` | INTEGER | No | Importe en unidades enteras de la moneda menor |
| `currency` | TEXT | No | Moneda |
| `status` | TEXT | No | `pending` \| `approved` \| `declined` \| `error` \| `voided` |
| `provider`, `gateway_tx_id` | TEXT | Sí | Pasarela e identificador de la transacción |
| `payer_email`, `payer_phone` | TEXT | Sí | Datos del pagador |
| `invoice_id` | INTEGER FK → `invoices.id` | Sí | Factura que salda |
| `source` | TEXT | Sí | Origen del cobro (checkout, cobro de campo) |
| `short_code` | TEXT | Sí | Código del enlace corto `/c/[code]` |
| `expires_at` | INTEGER (timestamp) | Sí | Caducidad del enlace de cobro |
| `client_id` | INTEGER FK → `clients.id` | Sí | Cliente |
| `version` | INTEGER | No | Control de concurrencia optimista |
| `created_at`, `updated_at` | INTEGER (timestamp) | - | Auditoría |

## 7.5 `payment_events` - Bitácora de avisos de la pasarela

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `payment_id` | INTEGER FK → `payments.id` | No | Pago afectado |
| `provider`, `type`, `gateway_tx_id`, `event_status` | TEXT | - | Datos del evento recibido |
| `payload` | TEXT | Sí | Cuerpo íntegro del aviso |
| `duplicate` | INTEGER (bool) | No | El evento ya se había recibido |
| `out_of_order` | INTEGER (bool) | No | El evento llegó después de un estado terminal |
| `amount_mismatch` | INTEGER (bool) | No | El importe no coincide con el del pago |
| `received_at` | INTEGER (timestamp) | No | Momento de recepción |

## 7.6 `client_users` - Usuarios del portal

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `client_id` | INTEGER FK → `clients.id` ON DELETE CASCADE | No | Empresa a la que pertenece |
| `email` | TEXT UNIQUE | No | Identidad de acceso. Único global: un correo, una persona, un cliente |
| `name` | TEXT | Sí | Nombre |
| `password_hash` | TEXT | Sí | `scrypt$N$r$p$salt$hash`. Nulo mientras la invitación está pendiente |
| `role` | TEXT | No | `owner` \| `member` \| `billing` |
| `status` | TEXT | No | `invited` \| `active` \| `disabled` |
| `failed_attempts` | INTEGER | No | Contador de bloqueo por fuerza bruta; se limpia con un acceso correcto |
| `locked_until` | INTEGER (timestamp) | Sí | Bloqueo temporal |
| `last_login_at` | INTEGER (timestamp) | Sí | Último acceso |
| `created_at` | INTEGER (timestamp) | No | Alta |

El formato del hash incorpora sus propios parámetros, lo que permite endurecerlos
más adelante sin invalidar los hashes existentes.

## 7.7 `invoices` - Facturas

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `client_id` | INTEGER FK → `clients.id` ON DELETE CASCADE | No | Cliente |
| `project_id` | INTEGER FK → `projects.id` ON DELETE SET NULL | Sí | Proyecto |
| `number` | TEXT UNIQUE | No | Correlativo legible y estable (`INV-2026-001`). Único, porque numerar dos veces igual es un problema contable |
| `status` | TEXT | No | `draft` \| `sent` \| `paid` \| `overdue` \| `void` |
| `currency` | TEXT | No | Moneda (por defecto COP) |
| `subtotal_cents`, `tax_cents`, `total_cents` | INTEGER | No | Importes en unidades enteras; nunca coma flotante para dinero |
| `notes` | TEXT | Sí | Observaciones |
| `issued_at`, `due_at`, `paid_at` | INTEGER (timestamp) | Sí | Fechas del ciclo |
| `payment_id` | INTEGER FK → `payments.id` ON DELETE SET NULL | Sí | Pago que la saldó |
| `created_at`, `updated_at` | INTEGER (timestamp) | - | Auditoría |

## 7.8 `security_events` - Eventos de seguridad

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `id` | INTEGER PK | No | Identificador |
| `at` | INTEGER (timestamp) | No | Momento del evento |
| `ip` | TEXT | Sí | Dirección de origen; solo accesible desde el panel |
| `ip_hash` | TEXT | Sí | Hash empleado en toda exposición fuera del panel |
| `method`, `path`, `query`, `user_agent` | TEXT | - | Datos de la petición |
| `country`, `asn` | TEXT | Sí | Geolocalización aproximada |
| `category` | TEXT | No | Clase de amenaza detectada |
| `severity` | TEXT | No | Gravedad |
| `action` | TEXT | No | Respuesta aplicada |
| `status_code` | INTEGER | Sí | Código devuelto |
| `rule_id` | TEXT | Sí | Regla que disparó la clasificación |
| `hits` | INTEGER | No | Repeticiones agregadas |

## 7.9 `blocked_ips` - Lista de bloqueo

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| `ip` | TEXT PK | No | Dirección bloqueada |
| `reason`, `rule_id` | TEXT | Sí | Motivo del bloqueo |
| `hits` | INTEGER | No | Reincidencias; determina el escalado del TTL |
| `created_at` | INTEGER (timestamp) | No | Alta del bloqueo |
| `expires_at` | INTEGER (timestamp) | No | **Vencimiento obligatorio.** No existen bloqueos permanentes |
| `source` | TEXT | No | Manual o automático |

## 7.10 `monitors` y `monitor_checks` - Disponibilidad

`monitors` define qué se vigila (URL, método, código y texto esperados, umbral de
latencia, intervalo, estado de pausa, y expiración del certificado TLS
descubierta). `monitor_checks` registra cada sondeo (`at`, `ok`, `status_code`,
`response_ms`, `error`). `monitor_incidents` agrupa los fallos consecutivos con
su causa y duración.

Los `monitor_checks` y los `security_events` crudos se purgan a los 90 días; los
agregados de `security_rollups` sobreviven a la purga, de modo que se conservan
las tendencias históricas sin el peso del detalle.

# 8. MODELO RELACIONAL

El modelo se organiza en siete agrupaciones. Las relaciones se expresan como
claves foráneas declaradas en `src/db/schema.ts`, con su comportamiento de
borrado explícito.

```
CRM
  clients 1──N projects
  clients 1──N messages          projects 1──N project_contacts
  clients 1──N finances          projects 1──N project_adrs
  clients 1──N briefings         projects 1──N project_env_vars
  briefings 1──N briefing_items  projects 1──N project_services
  clients/projects/briefings 1──N interactions
  projects 1──N presentations 1──N presentation_slides

PORTAL DE CLIENTES
  clients 1──N client_users 1──N portal_sessions
  clients 1──N client_invitations
  clients 1──N invoices 1──N invoice_items
  clients 1──N portal_threads 1──N portal_messages
  portal_threads 1──N portal_message_reads
  clients 1──N portal_documents        (auto-referencia: supersedes_id)
  client_users 1──N portal_notifications
  client_users 1──N portal_notification_prefs
  clients 1──N portal_activity         (client_id denormalizado a propósito)
  clients 1──N portal_audit_log
  projects 1──N project_milestones

PAGOS
  payments 1──N payment_events
  invoices 1──1 payments               (invoices.payment_id)
  clients  1──N payments

OBSERVABILIDAD
  projects 1──N monitors 1──N monitor_checks
  monitors 1──N monitor_incidents

SEGURIDAD
  security_events        (crudo, purgado a 90 días)
  security_rollups       (agregado, permanente)
  security_anomalies · blocked_ips · rate_limit_buckets

LABORATORIO
  ci_runs · security_findings · chaos_flags · lab_experiments
  web_vitals · cv_downloads · fp_rooms 1──N fp_devices

SISTEMA
  admin_sessions · webauthn_credentials · app_settings
  education_milestones · education_lab_progress
```

**Decisiones de modelado que conviene conocer antes de intervenir el esquema:**

- `portal_activity.client_id` está **denormalizado a propósito**: el feed se lee
  siempre filtrando por cliente y la consulta más frecuente del portal no debe
  depender de una unión.
- Un cobro de campo **no es una tabla propia**: es una fila de `payments` con
  campos adicionales (`short_code`, `expires_at`, `source`). No existe una
  máquina de estados paralela.
- Los importes monetarios son enteros en la unidad menor de la moneda. No se
  emplea coma flotante para dinero en ningún punto del sistema.
- Las migraciones son **exclusivamente aditivas**. No se elimina una columna sin
  acordarlo previamente.

El diagrama entidad-relación completo y los diagramas UML de clases y objetos
están publicados en `/docs` y generados desde los modelos tipados de `src/data/`.

# 9. DISTRIBUCIÓN FÍSICA Y LÓGICA DE BASE DE DATOS

## 9.1 Distribución física

| Instancia | Contenido | Variable de conexión | Acceso |
|---|---|---|---|
| Base de producción | Datos reales del negocio | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | Lectura y escritura desde el runtime |
| Base de demostración | Datos ficticios de `/demo` | `TURSO_DEMO_URL` + `TURSO_DEMO_AUTH_TOKEN` | Solo lectura desde el runtime |
| Bases locales de desarrollo | Copias desechables | Servidores `sqld` en contenedor (puertos 8080 y 8081) | Lectura y escritura |
| Bases de pruebas | Ficheros temporales en `tmpdir()` | Generadas por la suite | Lectura y escritura |

El motor es libSQL, compatible con SQLite, ofrecido como servicio gestionado por
Turso y accedido por HTTP/hrana sobre TLS. **No existe servidor de base de datos
propio** ni instancia autoalojada en producción.

## 9.2 Distribución lógica

La selección de instancia se resuelve **por petición**, no por consulta. El
módulo `src/db/index.ts` emplea `AsyncLocalStorage` para propagar el contexto de
«modo demostración» a lo largo de toda la cadena asíncrona: cuando la petición
llega a `/demo`, todas las consultas que nazcan de ella se dirigen a la base de
demostración sin que el código de las páginas lo sepa.

El aislamiento de la demostración es, por tanto, **por diseño** (una base de
datos distinta) y no por filtrado de consultas ni por ocultación de botones. Este
detalle importa: los endpoints que revelan credenciales de la bóveda son
peticiones `GET`, de modo que una restricción de «solo lectura» no los habría
detenido; la lista de rutas vetadas en modo demostración va por patrón de ruta.

## 9.3 Entornos

| Entorno | Base de datos | Origen del despliegue |
|---|---|---|
| Producción | Turso (producción y demostración) | Rama `main` en el proyecto `dev-portfolio` de Vercel |
| Vista previa | Turso (producción, solo lectura efectiva) | Despliegue por *pull request* |
| Desarrollo | `sqld` local en contenedor, o fichero local | `npm run dev` |
| Pruebas e2e | Bases libSQL desechables sembradas en el arranque | `npm run test:e2e` |

# 10. TABLAS, VISTAS Y STORED PROCEDURES

El sistema **no utiliza vistas ni procedimientos almacenados**. Toda la lógica de
negocio reside en la capa de aplicación (TypeScript) y toda consulta se construye
con Drizzle ORM, lo que garantiza consultas parametrizadas y, con ello, la
protección frente a inyección SQL.

Esta decisión es deliberada: mantener la lógica en un único lugar versionado y
cubierto por pruebas evita la duplicación de reglas entre el código y el motor de
base de datos, y permite ejecutar la suite contra bases desechables sin replicar
objetos de servidor.

## 10.1 Inventario de tablas (50)

| # | Tabla | Agrupación | Cols. | Descripción |
|---|---|---|---|---|
| 1 | `clients` | CRM | 10 | Clientes |
| 2 | `projects` | CRM | 17 | Proyectos |
| 3 | `messages` | CRM | 8 | Mensajes del formulario público |
| 4 | `finances` | CRM | 8 | Movimientos de ingreso |
| 5 | `project_env_vars` | CRM | 7 | Variables de entorno por proyecto (cifradas) |
| 6 | `project_services` | CRM | 20 | Servicios, costos y bóveda de credenciales |
| 7 | `project_contacts` | CRM | 8 | Contactos por proyecto |
| 8 | `project_adrs` | CRM | 12 | Decisiones de arquitectura |
| 9 | `briefings` | CRM | 15 | Documentos de alcance |
| 10 | `briefing_items` | CRM | 7 | Requerimientos, entregables y exclusiones |
| 11 | `interactions` | CRM | 14 | Seguimiento comercial |
| 12 | `presentations` | CRM | 7 | Presentaciones para cliente |
| 13 | `presentation_slides` | CRM | 5 | Diapositivas |
| 14 | `education_milestones` | Sistema | 16 | Hitos formativos y certificaciones |
| 15 | `education_lab_progress` | Sistema | 6 | Progreso en rutas de aprendizaje |
| 16 | `monitors` | Observabilidad | 18 | Definición de servicios vigilados |
| 17 | `monitor_checks` | Observabilidad | 7 | Sondeos (purga a 90 días) |
| 18 | `monitor_incidents` | Observabilidad | 8 | Incidentes agrupados |
| 19 | `ci_runs` | LAB | 13 | Corridas de integración continua |
| 20 | `security_findings` | LAB | 13 | Hallazgos de SAST, DAST, dependencias y accesibilidad |
| 21 | `payments` | Pagos | 19 | Pagos y cobros de campo |
| 22 | `payment_events` | Pagos | 11 | Bitácora de avisos de pasarela |
| 23 | `chaos_flags` | LAB | 7 | Experimentos de inyección de fallos |
| 24 | `lab_experiments` | LAB | 6 | Bitácora de experimentos |
| 25 | `app_settings` | Sistema | 3 | Configuración clave-valor |
| 26 | `web_vitals` | Observabilidad | 7 | Métricas de experiencia real, sin datos personales |
| 27 | `admin_sessions` | Autenticación | 7 | Dispositivos con sesión de administrador |
| 28 | `webauthn_credentials` | Autenticación | 10 | Llaves de acceso registradas |
| 29 | `security_events` | Seguridad | 16 | Eventos crudos (purga a 90 días) |
| 30 | `security_rollups` | Seguridad | 8 | Agregados horarios y diarios (permanentes) |
| 31 | `blocked_ips` | Seguridad | 7 | Lista de bloqueo con TTL |
| 32 | `rate_limit_buckets` | Seguridad | 3 | Contadores durables de límite de tasa |
| 33 | `security_anomalies` | Seguridad | 9 | Anomalías detectadas por puntuación z |
| 34 | `fp_rooms` | LAB | 3 | Salas del laboratorio de identificación de dispositivos |
| 35 | `fp_devices` | LAB | 11 | Dispositivos por sala |
| 36 | `cv_downloads` | LAB | 12 | Histórico de descargas del currículum |
| 37 | `client_users` | Portal | 11 | Usuarios de cliente |
| 38 | `client_invitations` | Portal | 11 | Invitaciones y restablecimientos (token de un solo uso) |
| 39 | `portal_sessions` | Portal | 9 | Sesiones del portal |
| 40 | `portal_audit_log` | Portal | 9 | Auditoría de acciones del portal |
| 41 | `project_milestones` | Portal | 10 | Hitos de avance visibles al cliente |
| 42 | `invoices` | Portal | 16 | Facturas |
| 43 | `invoice_items` | Portal | 7 | Líneas de factura |
| 44 | `portal_threads` | Portal | 7 | Hilos de conversación |
| 45 | `portal_messages` | Portal | 7 | Mensajes |
| 46 | `portal_message_reads` | Portal | 4 | Marcas de lectura |
| 47 | `portal_documents` | Portal | 16 | Documentos con versionado (`supersedes_id`) |
| 48 | `portal_notifications` | Portal | 9 | Notificaciones del portal |
| 49 | `portal_notification_prefs` | Portal | 4 | Preferencias de notificación por correo |
| 50 | `portal_activity` | Portal | 9 | Feed de actividad por cliente |

## 10.2 Migraciones

Las migraciones se generan con Drizzle Kit a partir de `src/db/schema.ts` y se
versionan en `drizzle/`. **Nunca se editan a mano.**

```bash
export $(grep -E '^TURSO_' .env | xargs)
npx drizzle-kit generate   # genera drizzle/00XX_*.sql desde el esquema
npx drizzle-kit migrate    # aplica contra Turso
```

El SQL generado debe revisarse antes de aplicarse: en combinaciones de «añadir
columnas» con «cambiar la nulabilidad», Drizzle Kit puede generar un
`INSERT ... SELECT` que referencia columnas nuevas sobre la tabla antigua.

# 11. POLÍTICAS DE RESPALDO

## 11.1 Respaldo

| Aspecto | Definición |
|---|---|
| Alcance | Volcado de las tablas de negocio de la base de producción |
| Formato | JSON |
| Destino | Vercel Blob (almacenamiento privado) |
| Frecuencia | Automática por tarea programada, más generación manual bajo demanda |
| Disparo automático | `GET /api/cron/*` con `Authorization: Bearer CRON_SECRET`, desde cron-job.org |
| Disparo manual | Apartado **Respaldos** del panel de administración |
| Verificación | Descarga del volcado y comprobación de que contiene las tablas esperadas |

El proveedor de base de datos mantiene además sus propios respaldos gestionados,
que constituyen la segunda línea de recuperación.

## 11.2 Retención y purga

| Dato | Retención | Justificación |
|---|---|---|
| `monitor_checks` | 90 días | El detalle crudo de sondeos crece linealmente y solo se necesita para diagnóstico reciente |
| `security_events` | 90 días | Ídem; los agregados conservan la tendencia |
| `security_rollups` | Permanente | Agregado sin datos personales; sostiene las series históricas |
| Sesiones (`admin_sessions`, `portal_sessions`) | Hasta su vencimiento o revocación | - |
| `blocked_ips`, `chaos_flags`, `rate_limit_buckets` | Hasta su TTL | Todo bloqueo y todo experimento expira solo |

## 11.3 Recuperación

La restauración no es una operación de la interfaz de usuario. Procedimiento:

1. Descargar el volcado desde el almacenamiento de respaldos.
2. Provisionar una base de datos nueva y aplicarle las migraciones vigentes.
3. Cargar el volcado en la base nueva.
4. Verificar la integridad comparando conteos por tabla contra el volcado.
5. Reapuntar `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` en el entorno de
   producción.
6. Redesplegar para que el runtime tome la nueva conexión.

Se recomienda ensayar el procedimiento periódicamente contra una base
desechable: un respaldo que nunca se ha restaurado no es un respaldo verificado.

# 12. INSTALACIÓN Y CONFIGURACIÓN

Este apartado resume el procedimiento. El detalle completo (incluidos recursos de
hardware, matriz de certificación y verificación posterior) está en el *Manual de
Instalación* (Ref. 3).

# 12.1 REQUISITOS GENERALES PRE-INSTALACIÓN

| Requisito | Valor |
|---|---|
| Node.js | ≥ 22.12.0 (declarado en `package.json`) |
| Gestor de paquetes | npm |
| Cuenta de Vercel | Organización `codebymike`, proyecto **`dev-portfolio`** |
| Cuenta de Turso | Dos bases: producción y demostración |
| Aplicación OAuth de GitHub | Identificador y secreto de cliente |
| Docker y Docker Compose | Solo para desarrollo y pruebas; **nunca** como runtime de producción |
| Navegador de Playwright | Solo para la suite e2e |

Un Node.js 20 presente en el `PATH` rompe `astro build` y `astro dev`. Si el
intérprete por defecto no es el correcto, debe anteponerse el binario adecuado:

```bash
source ~/.nvm/nvm.sh && nvm use 22
```

El directorio `.devcontainer/` fija Node 22.12 y el navegador de Playwright, y
constituye la solución definitiva a este problema.

# 12.2 DETALLES DEL PROCESO DE INSTALACIÓN

```bash
git clone <repositorio> && cd portfolio
source ~/.nvm/nvm.sh && nvm use 22
npm install
cp .env.example .env          # y diligenciar según el apartado 12.4
npx drizzle-kit migrate       # aplica el esquema
npm run dev                   # servidor de desarrollo
```

Para desarrollo contra servidores libSQL equivalentes a los de producción:

```bash
npm run db:up      # levanta sqld principal y de demostración
npm run db:seed    # siembra ambas bases locales
npm run db:reset   # borra volúmenes y vuelve a levantar
```

Verificación de la instalación:

```bash
npm run build      # construcción con adaptador de Vercel
npm test           # suite unitaria y de integración (Vitest)
npm run test:e2e   # suite end-to-end (Playwright)
npx astro check    # verificación de tipos
```

# 12.3 DETALLES DE CONFIGURACIÓN DE LA APLICACIÓN

Existe una particularidad que debe conocerse antes de añadir cualquier
configuración: el repositorio combina `import.meta.env` (en algunos módulos) y
`process.env` (en otros), y **no son equivalentes**. El servidor de desarrollo
carga el fichero `.env` solo en el primero; la plataforma de despliegue inyecta
las variables solo en el segundo.

Para leer cualquier variable de entorno nueva debe emplearse siempre
`serverEnv()` de `src/lib/env.ts`, que consulta ambas fuentes.

Antes de escribir variables de entorno mediante la CLI de la plataforma debe
confirmarse el proyecto destino con `cat .vercel/project.json`: bajo la misma
organización existen dos proyectos, y el que sirve el dominio real es
**`dev-portfolio`**, no `portfolio` (cuyo nombre coincide por accidente con el del
directorio local).

# 12.4 Variables de ambiente

## Obligatorias

| Variable | Descripción |
|---|---|
| `TURSO_DATABASE_URL` | URL de la base de producción |
| `TURSO_AUTH_TOKEN` | Token de acceso a la base de producción |
| `AUTH_SECRET` | Secreto de firma de sesiones de Auth.js |
| `AUTH_URL` | URL base de retorno de OAuth |
| `GITHUB_CLIENT_ID` | Identificador de la aplicación OAuth |
| `GITHUB_CLIENT_SECRET` | Secreto de la aplicación OAuth |
| `ALLOWED_GITHUB_LOGINS` | Lista de autorización de cuentas de administrador |
| `ENCRYPTION_KEY` | Clave AES-256-GCM de la bóveda. Sin ella, el guardado de credenciales falla en lugar de degradar a texto plano |
| `BASE_URL` | URL pública del sitio |

## Funcionalidades específicas

| Variable | Habilita |
|---|---|
| `TURSO_DEMO_URL`, `TURSO_DEMO_AUTH_TOKEN` | Modo de demostración `/demo` |
| `CRON_SECRET` | Tareas programadas (`/api/cron/*`), verificado en tiempo constante |
| `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | Pasarela de pagos y verificación de firma de avisos |
| `PAYMENTS_MOCK_ENABLED` | Pasarela en modo simulado, sin claves reales |
| `LAB_INGEST_TOKEN` | Ingesta de corridas y hallazgos desde el pipeline |
| `SECURITY_IP_SALT` | Sal del hash de direcciones IP expuestas fuera del panel |
| `SECURITY_IP_ALLOWLIST` | Direcciones exentas del enforcement |
| `MONITOR_SITE_URL` | Objetivo por defecto del motor de sondeos |

## Opcionales (degradan silenciosamente si faltan)

| Variable | Efecto de su ausencia |
|---|---|
| `NTFY_TOPIC` | No se envían notificaciones push |
| `RESEND_API_KEY`, `ALERT_EMAIL_TO` | No se envían correos |
| `GITHUB_API_TOKEN`, `GITHUB_USERNAME` | No se muestra actividad de repositorios |
| `GOOGLE_INDEXING_SA` | No se notifica la publicación a buscadores |
| `DEVTO_API_KEY`, `HASHNODE_*`, `LINKEDIN_*`, `IG_*` | No se sindica contenido a plataformas externas |

Las integraciones opcionales siguen todas el mismo patrón: `src/lib/notify.ts`
devuelve `{ skipped: true }` en silencio si falta la variable correspondiente, y
**nunca lanza una excepción**. Toda integración opcional nueva debe respetar este
patrón.

# 12.5 Parámetros de aplicaciones

Parámetros ajustables sin redespliegue, desde el apartado **Ajustes** del panel
(tabla `app_settings`):

| Parámetro | Uso |
|---|---|
| Tasas de cambio por moneda | Cálculo de rentabilidad. Un costo en moneda sin tasa se excluye del total y se marca como advertencia |
| Moneda base | Moneda de presentación de los totales |

Parámetros fijados en código:

| Parámetro | Valor | Ubicación |
|---|---|---|
| Caché de lista de bloqueo y experimentos | 30 s | `src/lib/security/blocklist.ts` |
| Escalado de bloqueo por reincidencia | 1 h → 24 h → 7 d | `src/lib/security/blocklist.ts` |
| TTL máximo de experimento de caos | 15 min | `src/lib/chaos.ts` |
| Rutas excluidas de la inyección de fallos | `/admin`, `/api/admin`, `/api/auth` | `src/lib/chaos.ts` |
| Objetivo de disponibilidad por defecto | 99,5 % en 30 días | `src/lib/slo.ts` |
| Intervalo del digest en vivo del portal | 20 s, con retroceso hasta 300 s | `src/lib/portal/live.ts` |
| Límite del digest del portal | 10 peticiones/min por sesión | `src/lib/portal/live.ts` |
| Ventana del token de descarga del currículum | 5 min | `src/pages/api/cv/` |
| Línea base de detección de anomalías | 30 días | `src/lib/security/anomaly.ts` |
| Retención de datos operativos crudos | 90 días | Tarea de purga |
| Caché de páginas públicas | `public, s-maxage=300, stale-while-revalidate` | `src/middleware.ts` |

# 12.6 Lista de contactos técnicos

| Nombre | Cargo | Módulo | Contacto |
|---|---|---|---|
| Michael David Rodríguez Beltran | Aprendiz - desarrollador y responsable técnico | Todos | 0368dev@gmail.com · @mikerb95 |
| (Instructor asignado) | Instructor / supervisor | Documentación y sustentación | - |
| Soporte de Vercel | Proveedor | Cómputo y despliegue | `vercel.com/support` |
| Soporte de Turso | Proveedor | Base de datos | `turso.tech` |
| Soporte de Wompi | Proveedor | Pasarela de pagos | `wompi.co` |

# 13. DISEÑO DE LA ARQUITECTURA FÍSICA

## 13.1 Topología

```
Navegador del cliente ──HTTPS/TLS 1.3, HSTS──┐
cron-job.org ─────────HTTPS, Bearer─────────┤
GitHub (OAuth y Actions) ──HTTPS───────────┤
                                            ▼
                      ┌─────────────────────────────────────┐
                      │        RED DE BORDE DE VERCEL        │
                      │  Routing Middleware (middleware.ts)  │
                      │            ↓ (antes de caché)        │
                      │  Fluid Compute · Node 22             │
                      │  páginas SSR y rutas /api            │
                      │  artefactos: dist/server, dist/client│
                      └───┬───────┬───────────┬──────────┬───┘
                libSQL/TLS│  HTTPS│      HTTPS│     HTTPS│
                          ▼       ▼           ▼          ▼
                      Turso   Vercel Blob   Wompi     ntfy.sh
                   (producción  (respaldos  (pasarela  (canal de
                   y demo)     y capturas)  y avisos)   alertas)
```

## 13.2 Nodos y responsabilidades

| Nodo | Estereotipo | Contenido | Responsabilidad |
|---|---|---|---|
| Dispositivo del cliente | `device` | Navegador; `bundle.js`, `styles.css` | Presentación e interacción |
| cron-job.org | `device` | Disparadores programados | Ejecución periódica de sondeos, agregados y respaldos |
| GitHub | `device` | Repositorio, Actions, proveedor OAuth | Control de versiones, integración continua e identidad del administrador |
| Red de borde de Vercel | `device` | Routing Middleware y Fluid Compute (Node 22) | Todo el cómputo del sistema |
| Turso | `device` | Base de producción y base de demostración | Persistencia |
| Vercel Blob | `device` | Respaldos y capturas | Almacenamiento de objetos |
| Wompi | `device` | Pasarela | Procesamiento de pagos |
| ntfy.sh | `device` | Canal de alertas | Entrega de notificaciones push |

**El sistema no dispone de servidor propio.** Todo el cómputo reside en la red de
borde del proveedor, la persistencia es un servicio gestionado y los disparadores
periódicos provienen del exterior, no de un proceso residente.

Los dos entornos de ejecución dentro de la plataforma comparten máquina pero no
responsabilidad: el middleware se ejecuta **antes de la caché** y decide si la
petición llega siquiera al runtime de la aplicación. Por eso los guardas de
seguridad residen allí y no en las páginas.

Docker **no** es el runtime de producción y no debe llegar a serlo:
contenerizar la aplicación perdería el despliegue en borde, las vistas previas
por *pull request* y la reversión automática del pipeline. Su lugar es la
infraestructura de desarrollo y pruebas.

## 13.3 Canal de despliegue

```
push a main → GitHub Actions
   ├── pruebas unitarias e integración (Vitest)
   ├── pruebas end-to-end (Playwright)
   ├── análisis estático (npm audit, CodeQL) y accesibilidad (axe-core)
   ├── construcción (astro build)
   ├── despliegue en Vercel
   └── verificación posterior al despliegue
         └── si falla → reversión automática a la última versión saludable
```

Los resultados de cada corrida se ingieren en `ci_runs` mediante
`POST /api/lab/ingest`, autenticado con `LAB_INGEST_TOKEN`, y quedan visibles en
`/admin/lab/pipeline` y en la página pública `/docs/pipeline-en-vivo`.

El análisis de mutantes (Stryker) se ejecuta bajo demanda y los domingos, nunca
en cada `push`: mutar la totalidad de `src/lib` es costoso y no debe bloquear un
despliegue.

# 14. DESCRIPCIÓN DE USUARIOS

## 14.1 Actores del sistema

| Actor | Naturaleza | Autenticación | Alcance |
|---|---|---|---|
| Visitante público | Humano | Ninguna | Sitio público, demostración, estado, pago por enlace |
| Administrador | Humano | GitHub OAuth con lista de autorización, o llave WebAuthn | Totalidad del panel `/admin` y de `/api/admin/*` |
| Usuario de cliente | Humano | Correo y contraseña (scrypt) | Portal `/portal`, limitado a su propio cliente |
| Cron externo | Sistema | `Authorization: Bearer CRON_SECRET` | Rutas `/api/cron/*` |
| Pasarela de pagos | Sistema | Firma criptográfica del aviso | `POST /api/payments/webhook` |
| Pipeline de integración continua | Sistema | `LAB_INGEST_TOKEN` | `POST /api/lab/ingest` |
| Buscador | Sistema | Ninguna | Sitemap, RSS, IndexNow |

## 14.2 Perfiles y permisos

**Administración.** No existen roles ni permisos granulares: el panel tiene un
único administrador y la lista de autorización es la única fuente de
autorización. La lista se revalida en **cada petición** dentro del middleware, no
solo en el momento del inicio de sesión, como defensa en profundidad.

**Portal de clientes.** Tres roles, definidos en `client_users.role`:

| Rol | Proyectos e hitos | Documentos | Mensajes | Facturas | Pagar | Gestionar usuarios |
|---|---|---|---|---|---|---|
| `owner` | Sí | Sí | Sí | Sí | Sí | Sí (solo de su empresa) |
| `member` | Sí | Sí | Sí | Sí (ver) | No | No |
| `billing` | No | No | No | Sí | Sí | No |

Estados posibles de un usuario de cliente: `invited` (invitación pendiente),
`active` y `disabled`.

**Impersonación de soporte.** El administrador puede ver el portal como un
cliente concreto, en modo **estrictamente de solo lectura**. El corte está
aplicado en dos puntos independientes: en el middleware y, adicionalmente, en
`/api/payments/mock/pay`, que vive fuera del prefijo `/api/portal/` y se habría
escapado del primer guarda. La sesión impersonada queda marcada en
`portal_sessions.impersonated_by`.

# 15. ANEXOS

## Anexo A - Estrategia de pruebas

| Nivel | Herramienta | Alcance |
|---|---|---|
| Unitario e integración | Vitest | Lógica pura de `src/lib/`, preferentemente sin base de datos |
| Integración con base de datos real | Vitest + libSQL en fichero temporal | Concurrencia, restricciones `UNIQUE` y transacciones |
| End-to-end | Playwright | Recorridos completos contra bases desechables |
| Contrato | Vitest + esquemas Zod | Forma de las respuestas de la API |
| Mutantes | Stryker | Calidad real de la suite sobre `src/lib` |
| Accesibilidad | axe-core sobre Playwright | Páginas públicas, WCAG AA |
| Análisis estático | npm audit, CodeQL | Dependencias y código |
| Análisis dinámico | OWASP ZAP (baseline) | Despliegue de vista previa; nunca contra producción |
| Carga | k6 | **Planeado.** Última fase pendiente del plan de laboratorio |

Reglas de la suite que conviene conocer antes de escribir una prueba nueva:

- Cuando se requiere base de datos real, se usa libSQL en **fichero temporal**,
  nunca en memoria: las transacciones abren otra conexión y una base en memoria
  no comparte tablas entre conexiones.
- Un módulo que se importa desde el navegador no puede importar `node:crypto` ni
  la capa de datos. Si la lógica se necesita en ambos lados, se separa en un
  módulo puro y otro exclusivo de servidor, como `cobros.ts` y
  `cobros-crypto.ts`.
- Las bases de las pruebas end-to-end se siembran en el arranque del servidor de
  pruebas, no en la preparación global, que se ejecuta después de que el servidor
  ya arrancó.

## Anexo B - Convenciones del repositorio

- **Comentarios en español**, explicando el *porqué* de una decisión no obvia,
  nunca el *qué* hace el código.
- **Fail-open** en todo lo relativo a seguridad y observabilidad.
- **Idempotencia obligatoria** en toda operación que mueva dinero.
- **OPSEC en páginas públicas** (`/status`, `/security`, `/lab`): solo agregados.
  Nunca direcciones IP completas, nombres exactos de reglas de detección ni rutas
  señuelo; es decir, ningún dato que sirva de manual de ataque.
- **Migraciones exclusivamente aditivas.**
- Los datos que alimentan `/docs` viven tipados en `src/data/` y las páginas solo
  los renderizan: **ninguna cifra se escribe a mano** en un fichero `.astro`.

## Anexo C - Rutas de la API

Las rutas se agrupan por prefijo y régimen de acceso:

| Prefijo | Acceso | Contenido |
|---|---|---|
| `/api/admin/*` | Sesión de administrador | CRM, costos, monitores, seguridad, laboratorio, portal, respaldos, credenciales |
| `/api/portal/*` | Sesión de portal | Cuenta, facturas, documentos, mensajes, notificaciones, digest en vivo, salud |
| `/api/cron/*` | `Bearer CRON_SECRET` | Sondeos, agregados de seguridad, vencimientos, facturas vencidas, resiembra de la demostración, IndexNow |
| `/api/payments/*` | Público y firma de pasarela | Checkout, aviso de la pasarela, pago simulado |
| `/api/auth/*` | Público | OAuth y WebAuthn |
| `/api/lab/*` | Token de ingesta o público | Ingesta del pipeline, estado en vivo, laboratorio de identificación de dispositivos |
| Resto | Público | Contacto, currículum, métricas, salud, estado, informes de CSP |

## Anexo D - Estado de la documentación de ingeniería

La fuente de verdad de los requerimientos, casos de uso e iteraciones es
`src/data/documentacion.ts`, tipada en TypeScript y verificada por el compilador:
un campo faltante o mal tipado rompe `astro check`. Un requerimiento nuevo entra
en estado `planeado` y se promueve a `implementado` al entregarlo, indicando
siempre **dónde vive en el código** y **cómo se comprueba**.

Un módulo entregado que no aparece en `/docs` es, a efectos de la sustentación,
un módulo que no existe.
