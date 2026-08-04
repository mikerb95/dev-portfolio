# CodeByMike — Portafolio, Panel de Control y Portal de Clientes

## Manual de Instalación

**Versión:** 0100
**Fecha:** 03/08/2026

---

## HOJA DE CONTROL

| | | | |
|---|---|---|---|
| **Organismo** | SENA — Centro de Servicios Financieros, Regional Distrito Capital | | |
| **Proyecto** | CodeByMike — Portafolio, Panel de Control y Portal de Clientes (codebymike.tech) | | |
| **Entregable** | Manual de Instalación | | |
| **Autor** | Michael David Rodríguez Beltran<br>Análisis y Desarrollo de Software — Ficha 3114731 — Trimestre 7 | | |
| **Versión/Edición** | 0100 | **Fecha Versión** | 03/08/2026 |
| **Aprobado por** | (pendiente de asignación) | **Fecha Aprobación** | (pendiente) |
| | | **Nº Total de Páginas** | `<al exportar>` |

## REGISTRO DE CAMBIOS

| Versión | Causa del Cambio | Responsable del Cambio | Fecha del Cambio |
|---|---|---|---|
| 0100 | Versión inicial | Michael David Rodríguez Beltran | 03/08/2026 |
| | | | |
| | | | |

## CONTROL DE DISTRIBUCIÓN

| Nombre y Apellidos |
|---|
| Michael David Rodríguez Beltran — Aprendiz, ficha 3114731 |
| (Instructor asignado) |
| (Jurado de sustentación) |
| |

---

## ÍNDICE

1. Introducción
   - 1.1 Objeto
   - 1.2 Alcance
2. Descripción del sistema
   - 2.1 Antecedentes y descripción funcional del sistema
   - 2.2 Componentes fundamentales
3. Recursos hardware
   - 3.1 Servidores
   - 3.2 Estaciones cliente
   - 3.3 Conectividad
   - 3.4 Restricciones
4. Recursos software
   - 4.1 Matriz de certificación
   - 4.2 Restricciones técnicas del sistema
5. Instalación y configuración del software base
6. Configuración del sistema
   - 6.1 Configuración del sistema
7. Instalación del sistema
   - 7.1 Requisitos previos
   - 7.2 Procedimiento de instalación
8. Verificación del proceso de instalación
9. Anexos
   - 9.1 Resumen de tareas de configuración
10. Glosario
11. Bibliografía y referencias

---

# 1. INTRODUCCIÓN

## 1.1 Objeto

El objeto de este documento es describir el procedimiento completo de
instalación, configuración y puesta en marcha del sistema, tanto en el entorno
de producción como en los entornos de desarrollo y pruebas, de forma que una
persona técnica distinta del autor pueda reproducir el despliegue sin
conocimiento previo del proyecto.

## 1.2 Alcance

El manual cubre los recursos de hardware y software necesarios, la matriz de
compatibilidad, la configuración de cada elemento, el procedimiento secuencial de
instalación y las comprobaciones mínimas que deben realizarse tras el despliegue
para darlo por correcto.

Queda fuera del alcance la operación funcional del sistema, descrita en el
*Manual de Usuario*, y el detalle interno de módulos y modelo de datos, descrito
en el *Manual Técnico*.

---

# 2. DESCRIPCIÓN DEL SISTEMA

## 2.1 Antecedentes y descripción funcional del sistema

Antes de la construcción del sistema, la gestión de la actividad profesional
independiente se repartía entre herramientas desconectadas: una hoja de cálculo
para los costos, el correo y la mensajería instantánea para el seguimiento con
clientes, servicios de terceros para el monitoreo de disponibilidad y ningún
mecanismo propio de detección de tráfico hostil. Esa fragmentación multiplicaba
costos fijos mensuales, dispersaba la información entre sistemas que no se
comunican entre sí e impedía responder a preguntas elementales —cuánto margen
real deja un proyecto, desde cuándo está caído un servicio— sin reconstruir los
datos a mano.

A ello se sumaba un problema de fondo: demostrar competencia técnica real es
difícil cuando la evidencia vive detrás de acuerdos de confidencialidad o en
repositorios privados inaccesibles.

El sistema sustituye ese conjunto de herramientas por una plataforma única que
aporta, sobre una misma base de código y una misma base de datos:

- **Vitrina pública verificable.** El portafolio, los artículos técnicos y las
  páginas de estado y seguridad muestran datos reales agregados del propio
  sistema en funcionamiento, no material de demostración.
- **Operación diaria del negocio.** Gestión de proyectos, clientes, seguimiento
  comercial, alcance, costos y rentabilidad real por proyecto, con las
  credenciales de servicios custodiadas cifradas.
- **Relación con el cliente.** Portal privado donde cada cliente consulta avance,
  facturas, documentos y mensajes, con aislamiento estricto entre clientes.
- **Cobro.** Pasarela con idempotencia garantizada y cobro de campo por
  mensajería instantánea desde el propio celular.
- **Vigilancia.** Motor propio de sondeos de disponibilidad con incidentes,
  objetivos de nivel de servicio y alertas, más un sistema reducido de gestión de
  eventos de seguridad.

## 2.2 Componentes fundamentales

| Módulo | Descripción |
|---|---|
| Sitio público | Portafolio, artículos técnicos, estado de servicios, documentación de ingeniería y vitrina comercial. Bilingüe: español canónico e inglés bajo el prefijo `/en` |
| Middleware | Guarda único de entrada. Normaliza el idioma de la ruta, aplica lista de bloqueo, clasificación de amenazas, límite de tasa, inyección de fallos, guardas de sesión y cabeceras de seguridad, antes de la caché |
| Panel de administración | CRM (proyectos, clientes, mensajes, seguimiento, alcance, decisiones de arquitectura), finanzas y rentabilidad, bóveda cifrada de credenciales, observabilidad, seguridad y laboratorio |
| Portal de clientes | Área privada multi-cliente con hitos, facturas, documentos, mensajería, notificaciones y feed de actividad. Sistema de sesiones propio, sin nada compartido con el panel |
| API interna | Endpoints de negocio bajo `/api`, más los endpoints de tareas programadas bajo `/api/cron` |
| Motor de pagos | Máquina de estados idempotente, verificación de firma de los avisos de la pasarela y bitácora completa de eventos |
| Micro-SIEM | Sensor de peticiones hostiles, límite de tasa durable, lista de bloqueo con expiración escalada, agregación y detección de anomalías |
| Observabilidad | Motor de sondeos de disponibilidad, incidentes, objetivos de nivel de servicio, certificados TLS y métricas de experiencia real |
| Laboratorio (LAB) | Registro del canal de integración continua, hallazgos de seguridad y accesibilidad, inyección controlada de fallos y bitácora de experimentos |
| Acceso a datos | Esquema único en Drizzle sobre libSQL, con selección de instancia por petición mediante `AsyncLocalStorage` |
| Notificaciones | Envío push y correo. Opcional por diseño: si falta la configuración, no envía y no falla |

---

# 3. RECURSOS HARDWARE

## 3.1 Servidores

**Justificación de la no utilización de servidores propios ni virtuales.**

El sistema **no requiere servidor físico ni máquina virtual**, ni en producción ni
para su operación ordinaria, y por tanto no procede solicitar la creación de
ninguna. La arquitectura es de cómputo gestionado sin servidor: la totalidad del
código se ejecuta en la red de borde del proveedor (Vercel, entorno *Fluid
Compute* sobre Node 22), la persistencia es un servicio gestionado de base de
datos (Turso/libSQL) y los disparadores periódicos provienen de un servicio
externo de tareas programadas, no de un proceso residente.

Esta decisión no es solo económica. Contenerizar o autoalojar la aplicación
supondría perder tres propiedades de las que el sistema depende: la ejecución en
borde, los despliegues de vista previa por *pull request* y la reversión
automática del canal de integración continua ante un fallo de verificación
posterior al despliegue.

En consecuencia, los recursos de cómputo no se dimensionan en procesador y
memoria, sino en los límites del plan del proveedor:

**Cómputo — Vercel (Fluid Compute)**

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Runtime | Node.js 22 | Node.js 22 LTS vigente |
| Memoria por invocación | 1024 MB (por defecto) | 1024 MB |
| Tiempo máximo de ejecución | 60 s | 300 s (por defecto del plan) |
| Regiones | 1 | Región más próxima a Colombia |
| Tamaño del paquete desplegado | < 250 MB | Sin restricción práctica (límite de 5 GB) |

**Base de datos — Turso (libSQL)**

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Instancias | 2 (producción y demostración) | 2, en regiones distintas si se desea réplica |
| Almacenamiento | 500 MB | 1 GB, considerando la purga a 90 días de datos crudos |
| Conexiones concurrentes | Las del plan gratuito | Plan con margen sobre el pico de sondeos |
| Respaldos | Los del proveedor | Los del proveedor más los volcados propios a almacenamiento de objetos |

**Almacenamiento de objetos — Vercel Blob**

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Espacio | 1 GB | 5 GB, considerando respaldos y documentos del portal |
| Visibilidad | Privada para respaldos y documentos | Privada |

**Entorno de desarrollo (estación del desarrollador)**

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Procesador | 2 núcleos x86-64 o ARM64 | 4 núcleos o más |
| Memoria RAM | 4 GB | 8 GB (16 GB si se usan contenedores y navegador de pruebas simultáneamente) |
| Tamaño Almacenamiento | 10 GB libres | 20 GB libres |
| Otros | — | Contenedores habilitados para levantar los dos servidores libSQL locales |

## 3.2 Estaciones cliente

El sistema se consume íntegramente desde un navegador web; no se distribuye
ningún ejecutable ni se instala nada en la estación del usuario.

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Procesador | Cualquiera con soporte del navegador vigente | — |
| Memoria RAM | 2 GB | 4 GB |
| Tamaño Almacenamiento | Sin requisito | Sin requisito |
| Otros | Resolución 360 px de ancho (el panel es operable desde móvil) | 1280 px o superior para las vistas de laboratorio y diagramas |

El panel de administración está diseñado para ser operable desde un teléfono
móvil, con navegación lateral colapsable; la página de cobro de campo está
pensada específicamente para uso móvil.

## 3.3 Conectividad

| Dato | Valor mínimo | Valor recomendado |
|---|---|---|
| Tarjeta de Red | Cualquiera con conectividad a internet | — |
| Tipo de Red | Acceso a internet, 3G o superior | Banda ancha o 4G |
| Otros | Salida HTTPS (puerto 443) sin intercepción de TLS | Resolución DNS sin filtrado del dominio |

**Caminos de comunicación del sistema:**

| Origen | Destino | Protocolo | Detalle |
|---|---|---|---|
| Dispositivo del cliente | Red de borde de Vercel | HTTPS | TLS 1.3, HSTS con precarga |
| cron-job.org | Red de borde de Vercel | HTTPS | `Authorization: Bearer CRON_SECRET` |
| GitHub | Red de borde de Vercel | HTTPS | OAuth 2.0 e ingesta del pipeline |
| Vercel | Turso | libSQL sobre TLS | Persistencia |
| Vercel | Vercel Blob | HTTPS | Respaldos y documentos |
| Vercel | Wompi | HTTPS (bidireccional) | Cobros y avisos de la pasarela |
| Vercel | ntfy.sh | HTTPS | Notificaciones push |

No se requiere conectividad entrante hacia ninguna red propia, ni apertura de
puertos en firewall corporativo alguno: todo el tráfico es saliente sobre HTTPS.

## 3.4 Restricciones

| Restricción | Detalle |
|---|---|
| Sin servidor propio | El sistema no puede desplegarse en un servidor de aplicaciones tradicional sin renunciar al borde, a las vistas previas por *pull request* y a la reversión automática |
| Docker no es runtime de producción | Los contenedores existen únicamente como infraestructura de desarrollo y pruebas |
| Dependencia de disparadores externos | Los sondeos, agregados y respaldos dependen de un servicio externo de tareas programadas; si este deja de disparar, no hay proceso residente que lo supla |
| Un único administrador | La lista de autorización admite varios inicios de sesión, pero no existen roles ni permisos granulares en el panel |
| Pasarela de un solo país | La pasarela de pagos opera en Colombia; no hay soporte multi-pasarela ni multi-región |
| Base de datos compatible con SQLite | El esquema y las consultas asumen semántica de libSQL/SQLite; no es portable a otro motor sin revisión |
| Node.js 22 obligatorio | Un intérprete Node.js 20 presente en el `PATH` rompe la construcción y el servidor de desarrollo |
| Sin secretos en el repositorio | La clave de cifrado de la bóveda y los tokens viven exclusivamente en variables de entorno |

---

# 4. RECURSOS SOFTWARE

## 4.1 Matriz de certificación

**Software base**

| Elemento | Versión certificada | Observaciones |
|---|---|---|
| Sistema operativo (runtime) | Gestionado por el proveedor | El sistema no administra el sistema operativo de ejecución |
| Sistema operativo (desarrollo) | Linux, macOS o Windows con WSL2 | Verificado sobre Linux |
| Servidor de aplicaciones | No aplica — cómputo gestionado sin servidor (Vercel Fluid Compute) | No hay servidor de aplicaciones que instalar ni configurar |
| Máquina virtual | No aplica — no se emplea tecnología Java | — |
| Runtime | Node.js ≥ 22.12.0 | Declarado en `engines` de `package.json`. Node.js 20 **no** es compatible |
| Servidor de base de datos | libSQL, ofrecido como servicio gestionado por Turso | En desarrollo, `sqld` en contenedor, imagen fijada por *digest* |
| Contenedores (desarrollo) | Docker con Docker Compose | Solo desarrollo y pruebas |

**Componentes de la aplicación**

| Componente | Versión |
|---|---|
| Astro (SSR, adaptador de Vercel) | 7.x |
| Drizzle ORM | 0.45.x |
| Cliente libSQL | 0.17.x |
| Auth.js (`@auth/core` + `auth-astro`) | 0.37.x / 4.2.x |
| SimpleWebAuthn (servidor y navegador) | 13.x |
| Tailwind CSS | 4.x |
| Vitest | Versión del repositorio |
| Playwright | 1.61.x |
| Stryker (análisis de mutantes) | Versión del repositorio |

**Dependencias de interfaz de usuario.** Son deliberadamente tres y solo tres:
`lenis` (desplazamiento suave), `gsap` (animaciones de entrada) y `mermaid`
(diagramas de `/docs`). No se emplea ningún framework de frontend adicional.

**Navegadores**

| Navegador | Versión mínima | Observaciones |
|---|---|---|
| Google Chrome / Chromium | Últimas dos versiones estables | Requerido para llaves de acceso (WebAuthn) |
| Mozilla Firefox | Últimas dos versiones estables | — |
| Safari (escritorio e iOS) | 16 o superior | — |
| Microsoft Edge | Últimas dos versiones estables | — |

El sitio se renderiza en el servidor, de modo que el contenido es accesible aun
con JavaScript deshabilitado; las funciones interactivas (actualización en vivo
del portal, control de presentaciones, llaves de acceso) sí lo requieren.

## 4.2 Restricciones técnicas del sistema

| Elemento | Descripción |
|---|---|
| Sistema operativo | En producción, gestionado por el proveedor. En desarrollo, cualquiera capaz de ejecutar Node.js 22 y, opcionalmente, contenedores |
| Servidor de aplicaciones | No aplica. El cómputo es gestionado sin servidor; no existe artefacto desplegable en un servidor de aplicaciones |
| Servidor de base de datos | libSQL. En producción como servicio gestionado (Turso); en desarrollo, `sqld` en contenedor o base en fichero |
| Compilador | No aplica en sentido clásico. La construcción la realiza `astro build` sobre TypeScript, con verificación de tipos mediante `astro check` |
| JVM | No aplica |
| Otros | Cuenta de GitHub con aplicación OAuth registrada; cuenta en el servicio externo de tareas programadas; cuenta en la pasarela de pagos; canal de notificaciones push; servicio de correo transaccional |

---

# 5. INSTALACIÓN Y CONFIGURACIÓN DEL SOFTWARE BASE

El software base a instalar depende del entorno.

## 5.1 Entorno de producción

**No se instala software base.** Los servicios son gestionados y solo requieren
aprovisionamiento:

| Paso | Servicio | Acción |
|---|---|---|
| 1 | Vercel | Crear la organización y el proyecto que servirá el dominio |
| 2 | Turso | Crear dos bases de datos: producción y demostración. Obtener URL y token de cada una |
| 3 | GitHub | Registrar una aplicación OAuth con la URL de retorno del sitio. Obtener identificador y secreto de cliente |
| 4 | Vercel Blob | Habilitar el almacenamiento de objetos en el proyecto |
| 5 | Wompi | Obtener clave pública, secreto de integridad y secreto de eventos |
| 6 | ntfy.sh | Definir el nombre del canal de alertas |
| 7 | Resend | Obtener la clave de API del servicio de correo |
| 8 | cron-job.org | Crear la cuenta desde la que se dispararán las tareas programadas |

## 5.2 Entorno de desarrollo

| Paso | Componente | Acción |
|---|---|---|
| 1 | Node.js 22.12 o superior | Instalar mediante gestor de versiones. Verificar con `node -v` |
| 2 | npm | Incluido con Node.js |
| 3 | Git | Instalar y configurar credenciales |
| 4 | Docker y Docker Compose | Opcional; necesario para los servidores libSQL locales |
| 5 | Navegador de Playwright | `npx playwright install --with-deps chromium` |

**Advertencia sobre la versión de Node.js.** El intérprete por defecto del
sistema puede ser Node.js 20, que rompe tanto `astro build` como `astro dev`.
Debe anteponerse explícitamente el binario correcto:

```bash
source ~/.nvm/nvm.sh && nvm use 22
node -v    # debe reportar v22.12.0 o superior
```

La solución definitiva a este problema es el contenedor de desarrollo incluido en
`.devcontainer/`, que fija la versión exacta de Node.js y el navegador de pruebas.
Sus imágenes están fijadas por *digest* y no por etiqueta: una reproducibilidad
que depende de que nadie mueva la etiqueta `latest` no es reproducibilidad.

---

# 6. CONFIGURACIÓN DEL SISTEMA

## 6.1 Configuración del sistema

**Advertencia previa aplicable a toda la configuración.** El repositorio combina
`import.meta.env` y `process.env`, que **no son equivalentes**: el servidor de
desarrollo carga el fichero `.env` solo en el primero, y la plataforma inyecta
las variables solo en el segundo. Toda lectura de una variable de entorno debe
hacerse a través de `serverEnv()` de `src/lib/env.ts`, que consulta ambas
fuentes.

---

### Configuración: Conexión a base de datos

| | |
|---|---|
| **Efecto** | Establece los parámetros de conexión a las bases de producción y de demostración |
| **Fase** | Previa al primer despliegue; obligatoria |
| **Ubicación** | Variables de entorno del proyecto en Vercel (entornos *Production*, *Preview* y *Development*) y fichero `.env` local |

| Paso | Descripción |
|---|---|
| 1º | Obtener la URL y el token de la base de producción desde el panel de Turso |
| 2º | Definir `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` |
| 3º | Repetir el proceso con la base de demostración y definir `TURSO_DEMO_URL` y `TURSO_DEMO_AUTH_TOKEN` |
| 4º | Guardar y redesplegar para que el runtime tome los valores nuevos |

**Antes de escribir variables mediante la CLI del proveedor, confirmar el
proyecto destino con `cat .vercel/project.json`.** Bajo la misma organización
existen dos proyectos y el que sirve el dominio real es **`dev-portfolio`**; el
proyecto llamado `portfolio` coincide por accidente con el nombre del directorio
local y no tiene relación con el dominio.

---

### Configuración: Autenticación del administrador

| | |
|---|---|
| **Efecto** | Habilita el acceso al panel privado y fija quién puede entrar |
| **Fase** | Previa al primer despliegue; obligatoria |
| **Ubicación** | Variables de entorno del proyecto y aplicación OAuth de GitHub |

| Paso | Descripción |
|---|---|
| 1º | Registrar la aplicación OAuth en GitHub con la URL de retorno `https://<dominio>/api/auth/callback/github` |
| 2º | Definir `GITHUB_CLIENT_ID` y `GITHUB_CLIENT_SECRET` con los valores obtenidos |
| 3º | Generar un secreto aleatorio y definirlo en `AUTH_SECRET` |
| 4º | Definir `AUTH_URL` y `BASE_URL` con la URL pública del sitio |
| 5º | Definir `ALLOWED_GITHUB_LOGINS` con la relación de cuentas autorizadas, separadas por coma |
| 6º | Verificar el acceso: una cuenta fuera de la lista debe ser rechazada aunque su autenticación en GitHub sea correcta |

---

### Configuración: Bóveda de credenciales

| | |
|---|---|
| **Efecto** | Habilita el cifrado en reposo de las credenciales de servicios y de las variables de entorno por proyecto |
| **Fase** | Previa al primer uso de la bóveda; obligatoria |
| **Ubicación** | Variable de entorno del proyecto |

| Paso | Descripción |
|---|---|
| 1º | Generar una clave de 32 bytes en formato hexadecimal o base64 |
| 2º | Definirla en `ENCRYPTION_KEY` |
| 3º | Guardar la clave en un gestor de secretos externo al repositorio |
| 4º | Verificar guardando una credencial de prueba y comprobando en la base de datos que el valor almacenado **no** es texto plano |

Si la clave no está definida, el guardado de credenciales responde con error en
lugar de almacenar el secreto en claro. La pérdida de la clave implica la pérdida
irreversible de los secretos ya cifrados.

---

### Configuración: Tareas programadas

| | |
|---|---|
| **Efecto** | Habilita los sondeos de disponibilidad, la agregación de eventos de seguridad, los respaldos, el control de facturas vencidas y la resiembra de la demostración |
| **Fase** | Posterior al primer despliegue |
| **Ubicación** | Variable de entorno del proyecto y servicio externo cron-job.org |

| Paso | Descripción |
|---|---|
| 1º | Generar un secreto aleatorio y definirlo en `CRON_SECRET` |
| 2º | Crear en cron-job.org un trabajo por cada endpoint: `uptime-check`, `security-rollup`, `domain-check`, `invoices-overdue`, `portal-demo-reseed`, `indexnow` |
| 3º | Configurar cada trabajo como petición `GET` con la cabecera `Authorization: Bearer <CRON_SECRET>` |
| 4º | Fijar la periodicidad; para el sondeo de disponibilidad, aproximadamente cada 5 minutos |
| 5º | Verificar que la primera ejecución devuelve `200` y que aparecen sondeos nuevos en el panel de monitores |

El secreto se compara en tiempo constante. Una petición sin la cabecera correcta
recibe un rechazo sin ejecutar la tarea.

---

### Configuración: Pasarela de pagos

| | |
|---|---|
| **Efecto** | Habilita el cobro real y la verificación de firma de los avisos de la pasarela |
| **Fase** | Posterior al despliegue; opcional en entornos de prueba |
| **Ubicación** | Variables de entorno del proyecto y panel de comercio de Wompi |

| Paso | Descripción |
|---|---|
| 1º | Definir `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET` y `WOMPI_EVENTS_SECRET` |
| 2º | Registrar en el panel de la pasarela la URL de avisos: `https://<dominio>/api/payments/webhook` |
| 3º | Para operar sin claves reales, definir `PAYMENTS_MOCK_ENABLED` y omitir el paso anterior |
| 4º | Verificar reenviando un aviso ya procesado: el sistema debe registrarlo como duplicado sin alterar el estado del pago |

---

### Configuración: Observabilidad de seguridad

| | |
|---|---|
| **Efecto** | Fija el enmascaramiento de direcciones IP en las vistas públicas y las exenciones del enforcement |
| **Fase** | Previa al primer despliegue |
| **Ubicación** | Variables de entorno del proyecto |

| Paso | Descripción |
|---|---|
| 1º | Generar una sal aleatoria y definirla en `SECURITY_IP_SALT` |
| 2º | Definir en `SECURITY_IP_ALLOWLIST` las direcciones exentas, si las hubiera |
| 3º | Verificar que ninguna vista pública muestra direcciones IP completas |

---

### Configuración: Notificaciones (opcional)

| | |
|---|---|
| **Efecto** | Habilita las alertas push y los correos transaccionales |
| **Fase** | Posterior al despliegue; opcional |
| **Ubicación** | Variables de entorno del proyecto |

| Paso | Descripción |
|---|---|
| 1º | Definir `NTFY_TOPIC` con el nombre del canal de alertas |
| 2º | Definir `RESEND_API_KEY` y `ALERT_EMAIL_TO` para el correo |
| 3º | Verificar provocando una alerta de prueba desde el laboratorio |

Si estas variables no se definen, el sistema **no falla**: las funciones de envío
devuelven una omisión silenciosa. Esto es intencionado y debe respetarse en
cualquier integración opcional que se añada.

---

### Configuración: Ingesta del canal de integración continua (opcional)

| | |
|---|---|
| **Efecto** | Permite que el pipeline reporte cada corrida y cada hallazgo al panel del laboratorio |
| **Fase** | Posterior al despliegue |
| **Ubicación** | Variable de entorno del proyecto y secretos del repositorio en GitHub |

| Paso | Descripción |
|---|---|
| 1º | Generar un token y definirlo en `LAB_INGEST_TOKEN` en el proyecto |
| 2º | Registrar el mismo valor como secreto del repositorio en GitHub |
| 3º | Registrar `INGEST_URL` apuntando a `https://<dominio>/api/lab/ingest` |
| 4º | Verificar que tras una corrida aparece la entrada correspondiente en `/admin/lab/pipeline` |

---

# 7. INSTALACIÓN DEL SISTEMA

## 7.1 Requisitos previos

Antes de iniciar el proceso de instalación debe disponerse de:

- **Acceso al código.** Permiso de lectura sobre el repositorio en GitHub.
- **Cuentas aprovisionadas.** Las ocho del apartado 5.1, con sus credenciales
  obtenidas.
- **Software base instalado.** Según el apartado 5.2, para el entorno de
  desarrollo.
- **Variables de entorno resueltas.** Todas las obligatorias del apartado 6.1;
  sin `ENCRYPTION_KEY` la bóveda no opera, y sin las variables de base de datos
  el sistema no arranca.
- **Permisos.** Administración del proyecto en la plataforma de despliegue para
  escribir variables de entorno; propietario del esquema en la base de datos para
  aplicar migraciones.
- **Dominio.** Registrado y con capacidad de modificar sus registros DNS.
- **Sin conflictos previos.** No se requiere desinstalar ni detener sistema
  alguno: el despliegue no comparte servidor con ningún otro producto.

## 7.2 Procedimiento de instalación

### Procedimiento de instalación

**Paso 1**

| | |
|---|---|
| **Tipo** | Obtención de código |
| **Componente** | Repositorio Git |
| **Permisos** | Lectura sobre el repositorio |
| **Descripción** | `git clone <repositorio> && cd portfolio`. Si la instalación es desde cero, todo el software base del apartado 5 debe estar ya instalado |

**Paso 2**

| | |
|---|---|
| **Tipo** | Selección de runtime |
| **Componente** | Node.js 22 |
| **Permisos** | Usuario del sistema |
| **Descripción** | `source ~/.nvm/nvm.sh && nvm use 22`. Verificar con `node -v` que la versión es 22.12.0 o superior. Una versión inferior rompe la construcción |

**Paso 3**

| | |
|---|---|
| **Tipo** | Instalación de dependencias |
| **Componente** | `package.json`, `package-lock.json` |
| **Permisos** | Escritura en el directorio de trabajo |
| **Descripción** | `npm install`. La instalación no debe reportar errores de motor (`engine`) |

**Paso 4**

| | |
|---|---|
| **Tipo** | Configuración |
| **Componente** | Fichero `.env` local y variables del proyecto en la plataforma |
| **Permisos** | Administración del proyecto en la plataforma de despliegue |
| **Descripción** | Diligenciar todas las variables obligatorias según el apartado 6.1. Confirmar previamente el proyecto destino con `cat .vercel/project.json` |

**Paso 5**

| | |
|---|---|
| **Tipo** | Migración de base de datos |
| **Componente** | `drizzle/*.sql`, `src/db/schema.ts` |
| **Permisos** | Propietario del esquema en la base de datos |
| **Descripción** | `export $(grep -E '^TURSO_' .env \| xargs)` seguido de `npx drizzle-kit migrate`. Aplicar sobre ambas bases: producción y demostración. Revisar el SQL generado antes de aplicarlo: en combinaciones de «añadir columnas» con «cambiar nulabilidad», el generador puede producir un `INSERT ... SELECT` que referencia columnas nuevas sobre la tabla antigua |

**Paso 6**

| | |
|---|---|
| **Tipo** | Siembra de datos |
| **Componente** | `scripts/seed-demo.mjs` |
| **Permisos** | Escritura sobre la base de demostración |
| **Descripción** | `npm run seed:demo`. Siembra únicamente la base de demostración con datos ficticios. La base de producción **no se siembra** |

**Paso 7**

| | |
|---|---|
| **Tipo** | Construcción |
| **Componente** | `astro build` con adaptador de Vercel |
| **Permisos** | Escritura en el directorio de trabajo |
| **Descripción** | `npm run build`. Genera `dist/server` y `dist/client`. Debe completar sin errores |

**Paso 8**

| | |
|---|---|
| **Tipo** | Verificación previa al despliegue |
| **Componente** | Suites de pruebas |
| **Permisos** | Usuario del sistema |
| **Descripción** | `npx astro check`, `npm test` y `npm run test:e2e`. Ninguna debe reportar fallos |

**Paso 9**

| | |
|---|---|
| **Tipo** | Despliegue |
| **Componente** | Proyecto `dev-portfolio` en Vercel |
| **Permisos** | Administración del proyecto |
| **Descripción** | Publicar la rama `main`. La plataforma construye y despliega automáticamente. La reversión automática se activa si falla la verificación posterior |

**Paso 10**

| | |
|---|---|
| **Tipo** | Configuración de dominio |
| **Componente** | Registros DNS del dominio |
| **Permisos** | Administración del dominio en el registrador |
| **Descripción** | Apuntar el dominio al proyecto y esperar la emisión del certificado TLS. Comprobar que HSTS responde correctamente |

**Paso 11**

| | |
|---|---|
| **Tipo** | Alta de tareas programadas |
| **Componente** | Trabajos en cron-job.org |
| **Permisos** | Administración de la cuenta del servicio |
| **Descripción** | Crear los trabajos según el apartado 6.1 y verificar que la primera ejecución responde correctamente |

**Paso 12**

| | |
|---|---|
| **Tipo** | Alta de monitores |
| **Componente** | `scripts/register-portal-monitor.mjs` y panel de monitores |
| **Permisos** | Sesión de administrador |
| **Descripción** | Registrar los servicios a vigilar, incluido el chequeo de salud del propio portal, para que aparezca en la página pública de estado |

---

# 8. VERIFICACIÓN DEL PROCESO DE INSTALACIÓN

Comprobaciones mínimas que deben ejecutarse tras el despliegue. La instalación no
se da por correcta hasta que las once resultan satisfactorias.

| # | Comprobación | Resultado esperado |
|---|---|---|
| 1 | Acceso al sitio público (`/`) | Responde `200` sobre HTTPS, con certificado válido y cabecera HSTS presente |
| 2 | Chequeo de salud (`GET /api/health`) | Responde `200` |
| 3 | Chequeo de salud del portal (`GET /api/portal/health`) | Responde `200` con los indicadores booleanos en verdadero y latencias razonables. Este chequeo ejerce la cadena real de dependencias del portal, no solo el renderizado |
| 4 | Acceso a ruta privada sin sesión (`/admin`) | Redirige a la pantalla de acceso; no expone contenido |
| 5 | Inicio de sesión del administrador | Una cuenta de la lista de autorización entra; una cuenta fuera de ella es rechazada |
| 6 | Guardas ciegos al idioma (`/en/admin`) | Devuelve `404`, no una copia del panel |
| 7 | Persistencia | Alta y consulta de un registro de prueba desde el panel; el dato sobrevive a una recarga |
| 8 | Cifrado en reposo | Una credencial guardada en la bóveda aparece cifrada al inspeccionar la base de datos, no en texto plano |
| 9 | Modo demostración (`/demo`) | Las páginas muestran datos ficticios; toda escritura y todo revelado de credenciales responde `403`. Ningún dato real aparece en el HTML servido |
| 10 | Tareas programadas | Una ejecución manual del sondeo responde `200` y genera registros nuevos; la misma petición sin la cabecera de autorización es rechazada |
| 11 | Aislamiento entre clientes | Un usuario de cliente autenticado no obtiene datos de otro cliente al manipular identificadores en la petición |

Comprobaciones adicionales recomendadas:

| # | Comprobación | Resultado esperado |
|---|---|---|
| 12 | Idempotencia de pagos | Dos cobros con la misma clave generan un único pago |
| 13 | Reenvío de aviso de pasarela | El evento se registra como duplicado y el estado del pago no se altera |
| 14 | Notificaciones | Una alerta de prueba llega al canal configurado; sin configuración, el sistema omite el envío sin fallar |
| 15 | Reversión automática | Un fallo forzado en la verificación posterior al despliegue provoca la vuelta a la última versión saludable |
| 16 | Página de estado (`/status`) | Muestra los monitores registrados con datos reales, sin exponer direcciones IP completas |

---

# 9. ANEXOS

## 9.1 Resumen de tareas de configuración

| # | Elemento de configuración | Fase | Obligatorio | Detalle |
|---|---|---|---|---|
| 1 | `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Previa al despliegue | Sí | Apartado 6.1 — Conexión a base de datos |
| 2 | `TURSO_DEMO_URL`, `TURSO_DEMO_AUTH_TOKEN` | Previa al despliegue | No | Requerido solo para `/demo` |
| 3 | `AUTH_SECRET`, `AUTH_URL`, `BASE_URL` | Previa al despliegue | Sí | Apartado 6.1 — Autenticación |
| 4 | `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | Previa al despliegue | Sí | Apartado 6.1 — Autenticación |
| 5 | `ALLOWED_GITHUB_LOGINS` | Previa al despliegue | Sí | Única fuente de autorización del panel |
| 6 | `ENCRYPTION_KEY` | Previa al primer uso de la bóveda | Sí | Su pérdida es irreversible |
| 7 | `CRON_SECRET` + trabajos en cron-job.org | Posterior al despliegue | Sí | Sin ella no hay sondeos, agregados ni respaldos |
| 8 | `SECURITY_IP_SALT`, `SECURITY_IP_ALLOWLIST` | Previa al despliegue | Sí / No | La sal es obligatoria; la lista de exención, opcional |
| 9 | `WOMPI_PUBLIC_KEY`, `WOMPI_INTEGRITY_SECRET`, `WOMPI_EVENTS_SECRET` | Posterior al despliegue | No | Alternativa: `PAYMENTS_MOCK_ENABLED` |
| 10 | `NTFY_TOPIC` | Posterior al despliegue | No | Omisión silenciosa si falta |
| 11 | `RESEND_API_KEY`, `ALERT_EMAIL_TO` | Posterior al despliegue | No | Omisión silenciosa si falta |
| 12 | `LAB_INGEST_TOKEN`, `INGEST_URL` | Posterior al despliegue | No | Ingesta del pipeline |
| 13 | `MONITOR_SITE_URL` | Posterior al despliegue | No | Objetivo por defecto del motor de sondeos |
| 14 | `GITHUB_API_TOKEN`, `GITHUB_USERNAME` | Posterior al despliegue | No | Actividad de repositorios en el sitio público |
| 15 | Registros DNS del dominio | Posterior al despliegue | Sí | Emisión del certificado TLS |
| 16 | Tasas de cambio y moneda base | Operación | No | Ajustable desde el panel, sin redespliegue |
| 17 | Monitores de disponibilidad | Operación | No | Alta desde el panel; incluir el chequeo de salud del portal |

## 9.2 Comandos de referencia

```bash
# Desarrollo
npm run dev                  # servidor de desarrollo
npm run build                # construcción con adaptador de Vercel
npx astro check              # verificación de tipos

# Pruebas
npm test                     # unitarias e integración
npm run test:coverage        # con cobertura
npm run test:e2e             # end-to-end
npm run test:e2e:server      # end-to-end contra sqld en contenedor
npm run test:contracts       # pruebas de contrato
npm run test:mutation        # análisis de mutantes

# Bases de datos locales
npm run db:up                # levanta sqld principal y de demostración
npm run db:seed              # siembra ambas bases locales
npm run db:reset             # borra volúmenes y vuelve a levantar
npm run db:down              # detiene los contenedores

# Migraciones
export $(grep -E '^TURSO_' .env | xargs)
npx drizzle-kit generate     # genera la migración desde el esquema
npx drizzle-kit migrate      # aplica la migración

# Utilidades
npm run seed:demo            # siembra la base de demostración
npm run og:generate          # genera las imágenes de vista previa social
npm run bpmn:export          # exporta los diagramas BPMN a SVG y PNG
npm run seo:indexnow         # notifica la publicación a buscadores
```

El sembrador acepta únicamente destinos locales mediante lista blanca: arrasa el
esquema antes de sembrar, de modo que un error de configuración no degradaría una
prueba, borraría una base de datos.

---

# 10. GLOSARIO

| Término | Descripción |
|---|---|
| Adaptador | Componente que traduce la salida de construcción de Astro al formato que espera la plataforma de despliegue. |
| Astro | Framework web empleado, configurado en modo de renderizado en servidor (SSR). |
| Borde (edge) | Red de puntos de presencia distribuidos geográficamente donde se ejecuta el cómputo, próximos al usuario. |
| Cómputo sin servidor | Modelo de ejecución en el que el proveedor administra la infraestructura y el código se ejecuta por invocación, sin servidor persistente que administrar. |
| Contenedor de desarrollo | Definición como código del entorno de desarrollo, que fija versiones exactas de runtime y herramientas. |
| Digest | Huella criptográfica de una imagen de contenedor. Fijar por digest, y no por etiqueta, garantiza que la imagen no cambie. |
| Drizzle Kit | Herramienta que genera las migraciones SQL a partir del esquema declarado en TypeScript. |
| Fluid Compute | Entorno de ejecución del proveedor que reutiliza instancias entre peticiones concurrentes, reduciendo los arranques en frío. |
| HSTS | *HTTP Strict Transport Security*. Cabecera que obliga al navegador a usar exclusivamente HTTPS con el dominio. |
| CSP | *Content Security Policy*. Política que restringe los orígenes desde los que la página puede cargar recursos. |
| libSQL | Motor de base de datos compatible con SQLite, accesible por red. |
| Migración | Guion SQL versionado que lleva el esquema de un estado al siguiente. En este proyecto son exclusivamente aditivas. |
| Rama `main` | Rama principal del repositorio; su publicación desencadena el despliegue de producción. |
| Reversión automática | Vuelta automática a la última versión saludable cuando falla la verificación posterior al despliegue. |
| Siembra (seeding) | Carga de datos iniciales en una base de datos, empleada aquí para la demostración y las pruebas. |
| sqld | Servidor de libSQL, empleado en contenedor para desarrollo y pruebas. |
| SSR | *Server-Side Rendering*. Construcción del HTML en el servidor en cada petición. |
| Tarea programada (cron) | Disparo periódico de un endpoint desde un servicio externo, autenticado mediante un secreto. |
| Turso | Servicio gestionado que ofrece libSQL. |
| Variable de entorno | Parámetro de configuración inyectado en tiempo de ejecución, fuera del código fuente. |
| Vista previa (preview) | Despliegue temporal generado por cada *pull request*, con URL propia. |

---

# 11. BIBLIOGRAFÍA Y REFERENCIAS

| Referencia | Título | Código / Ubicación |
|---|---|---|
| Ref. 1 | Documentación oficial de Astro — modo servidor y adaptadores | `docs.astro.build` |
| Ref. 2 | Documentación de Drizzle ORM y Drizzle Kit | `orm.drizzle.team` |
| Ref. 3 | Documentación de Turso / libSQL | `docs.turso.tech` |
| Ref. 4 | Documentación de Vercel — Funciones, Fluid Compute y Routing Middleware | `vercel.com/docs` |
| Ref. 5 | Documentación de Auth.js | `authjs.dev` |
| Ref. 6 | Especificación WebAuthn / FIDO2 | W3C Web Authentication Level 2 |
| Ref. 7 | Documentación de la pasarela de pagos Wompi | `docs.wompi.co` |
| Ref. 8 | ISO/IEC 25010 — Modelo de calidad del producto software | Norma internacional |
| Ref. 9 | OWASP Top 10 | `owasp.org` |
| Ref. 10 | WCAG 2.1 nivel AA | W3C |
| Ref. 11 | Manual Técnico del sistema | `docs/manuales-sena/manual-tecnico.md` |
| Ref. 12 | Manual de Usuario del sistema | `docs/manuales-sena/manual-de-usuario.md` |
| Ref. 13 | Documento de Especificación de Arquitectura | `DEA Formato_Documento_de_Arquitectura.docx` |
| Ref. 14 | Plan de contenedorización del entorno de desarrollo | `docs/plan-docker.md` |
| Ref. 15 | Convenciones del repositorio | `CLAUDE.md` |
