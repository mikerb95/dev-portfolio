# CodeByMike — Portafolio, Panel de Control y Portal de Clientes

## Manual de Usuario

**Versión:** 0100
**Fecha:** 03/08/2026

---

## HOJA DE CONTROL

| | | | |
|---|---|---|---|
| **Organismo** | SENA — Centro de Servicios Financieros, Regional Distrito Capital | | |
| **Proyecto** | CodeByMike — Portafolio, Panel de Control y Portal de Clientes (codebymike.tech) | | |
| **Entregable** | Manual de Usuario | | |
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

# 1. DESCRIPCIÓN DEL SISTEMA

## 1.1 Objeto

El objetivo de este manual es facilitar el conocimiento, uso y aprendizaje del
sistema desarrollado, describiendo paso a paso cómo cada perfil de usuario
accede a la aplicación y ejecuta las tareas que le corresponden.

El documento está dirigido a los dos perfiles que operan el sistema con
credenciales:

- **Administrador**, que gestiona la totalidad del negocio desde el panel
  privado `/admin`.
- **Cliente**, que consulta el avance, las facturas y los documentos de sus
  proyectos desde el portal `/portal`.

El visitante del sitio público no requiere instrucción alguna y por tanto queda
fuera del alcance de este manual, salvo en los puntos donde su acción
desencadena trabajo para el administrador (por ejemplo, el envío del formulario
de contacto).

## 1.2 Alcance

Este manual describe el acceso a la aplicación, la guía de instrucciones para la
interacción con cada una de las funcionalidades del sistema, una sección de
preguntas frecuentes con su forma de resolverlas y un glosario de los términos
empleados.

No forman parte de este documento los procedimientos de instalación y
configuración —recogidos en el *Manual de Instalación*—, ni el detalle interno de
módulos, base de datos y arquitectura —recogido en el *Manual Técnico*—.

## 1.3 Funcionalidad

El sistema es una plataforma integrada que cumple simultáneamente tres funciones:
vitrina profesional pública, herramienta operativa diaria de gestión de proyectos
y clientes, y laboratorio de prácticas de ingeniería con evidencia trazable.

Desde el punto de vista de los perfiles de usuario, la funcionalidad se agrupa en
los siguientes subsistemas:

| Subsistema | Perfil | Qué permite hacer |
|---|---|---|
| Acceso y sesiones | Administrador | Iniciar sesión con GitHub o llave de acceso, revisar dispositivos conectados y revocarlos |
| CRM | Administrador | Gestionar proyectos, clientes, mensajes, seguimiento comercial, briefings y decisiones de arquitectura |
| Finanzas | Administrador | Registrar ingresos y costos, calcular rentabilidad, custodiar credenciales cifradas y vigilar vencimientos de dominios |
| Cobros de campo | Administrador | Generar y enviar un cobro por WhatsApp desde el celular |
| Observabilidad | Administrador | Configurar monitores de disponibilidad, revisar incidentes y evaluar objetivos de nivel de servicio |
| Seguridad | Administrador | Revisar eventos hostiles, anomalías y bloqueos de direcciones IP |
| LAB | Administrador | Consultar el estado del pipeline, los hallazgos de seguridad, los experimentos de caos y los objetivos de nivel de servicio |
| Portal de clientes (administración) | Administrador | Invitar usuarios de cliente, publicar hitos, emitir facturas, responder mensajes y curar el feed de actividad |
| Portal de clientes | Cliente | Consultar avance, facturas, documentos, mensajes, notificaciones y actividad de sus proyectos |

---

# 2. DESCRIPCIÓN DE LAS FUNCIONALIDADES

Las capturas de pantalla que ilustran este apartado corresponden al entorno de
demostración público del panel (`/demo`), que reproduce la interfaz real con datos
ficticios. Ninguna imagen de este manual contiene información de clientes reales.

## 2.1 Subsistema de acceso y sesiones

### 2.1.1 Iniciar sesión como administrador

El panel de control no admite registro de usuarios. El acceso está restringido a
las cuentas de GitHub incluidas explícitamente en la lista de autorización del
sistema; cualquier otra cuenta, aun autenticándose correctamente en GitHub, es
rechazada.

Para iniciar sesión, el administrador debe:

1. Navegar a `https://codebymike.tech/admin`. Al no existir sesión activa, el
   sistema redirige automáticamente a la pantalla de acceso.
2. Pulsar el botón **Continuar con GitHub**. El navegador se dirige al
   proveedor de identidad.
3. Autorizar la aplicación en GitHub, si es la primera vez.
4. El sistema comprueba que el nombre de usuario devuelto está en la lista de
   autorización y, en caso afirmativo, crea la sesión y muestra el panel.

> **Figura 1 — Pantalla de acceso al panel de administración**
> `imagenes/figura-01-admin-login.png`

Como alternativa al proveedor externo, el sistema admite el acceso mediante
**llave de acceso (passkey)**, basado en el estándar WebAuthn/FIDO2. La llave de
acceso es una puerta de entrada equivalente, no un segundo factor: quien
disponga de una llave registrada entra sin contraseña ni redirección a GitHub.
El registro de llaves se realiza desde **Passkeys** dentro del panel, con la
sesión ya iniciada.

### 2.1.2 Revisar y revocar dispositivos

El apartado **Sesiones** muestra los dispositivos con sesión activa,
identificados por dirección IP, agente de usuario y fecha de última actividad.

Para retirar el acceso a un dispositivo que no se reconoce, el administrador
pulsa **Revocar** en la fila correspondiente. La revocación es inmediata: en la
siguiente petición, ese dispositivo pierde el acceso y es enviado de vuelta a la
pantalla de inicio de sesión.

> **Figura 2 — Listado de sesiones activas por dispositivo**
> `imagenes/figura-02-admin-sessions.png`

### 2.1.3 Cerrar sesión

El enlace **Cerrar sesión**, disponible en la barra lateral de cualquier página
del panel, elimina la sesión actual. Tras pulsarlo, cualquier intento de acceder
a una ruta privada vuelve a exigir autenticación.

## 2.2 Subsistema CRM

### 2.2.1 Gestionar proyectos

El apartado **Proyectos** concentra el ciclo de vida de cada trabajo. Para crear
un proyecto, el administrador pulsa **Nuevo proyecto** y diligencia el
formulario:

| Campo | Obligatorio | Descripción |
|---|---|---|
| Título | Sí | Nombre visible del proyecto |
| Slug | Sí | Identificador único para la URL pública; el sistema rechaza duplicados |
| Descripción | No | Resumen del trabajo |
| Stack | No | Tecnologías empleadas |
| URL de repositorio | No | Enlace al código fuente |
| URL de vista previa | No | Enlace al despliegue |
| Estado | Sí | `activo`, `pausado`, `completado` o `archivado` |
| Visible | Sí | Determina si el proyecto aparece en el sitio público |
| Cliente | No | Vínculo opcional a un cliente registrado |

Si el título o el identificador único faltan, el sistema no guarda y devuelve un
mensaje de error indicando el campo pendiente.

Desde el detalle de un proyecto, el administrador accede además a sus contactos,
sus decisiones de arquitectura, sus presentaciones y sus servicios contratados.

> **Figura 3 — Listado de proyectos en el panel**
> `imagenes/figura-03-admin-projects.png`

### 2.2.2 Gestionar clientes

El apartado **Clientes** permite dar de alta y editar clientes con nombre, correo
electrónico, empresa y notas internas. Un cliente puede vincularse a varios
proyectos, mensajes y registros financieros.

Las notas internas del cliente **no** son visibles para el cliente en el portal:
son un campo de uso exclusivo del administrador.

### 2.2.3 Atender la bandeja de mensajes

Los mensajes enviados desde el formulario público de contacto llegan al apartado
**Mensajes**. Cada mensaje muestra nombre, correo, asunto y cuerpo, y puede
marcarse como leído.

Cuando el correo del remitente coincide exactamente con el de un cliente
registrado, el sistema asocia el mensaje a ese cliente de forma automática. La
coincidencia es por correo exacto: una variación del dominio o un alias distinto
generan un mensaje sin cliente asociado, que el administrador puede vincular
manualmente.

### 2.2.4 Registrar seguimiento comercial

El apartado **Seguimiento** registra llamadas, reuniones, notas y tareas
pendientes asociadas a un cliente o a un proyecto. Cada interacción admite una
**próxima acción** y una **fecha de vencimiento**, que sirven de recordatorio.

Una interacción se cierra marcándola como resuelta; el sistema conserva la fecha
de cierre para el histórico.

### 2.2.5 Elaborar un briefing

El apartado **Briefings** documenta el alcance de un proyecto antes de
iniciarlo. Un briefing recoge objetivo, presupuesto estimado, presupuesto
acordado, horas previstas y una lista de ítems, cada uno clasificado como:

- **Requerimiento** — lo que el cliente necesita.
- **Entregable** — lo que se va a entregar.
- **Exclusión** — lo que explícitamente no forma parte del trabajo.

La sección de exclusiones es la que evita discusiones posteriores de alcance y
debe diligenciarse con el mismo cuidado que las otras dos.

### 2.2.6 Documentar decisiones de arquitectura

Desde el detalle de un proyecto, el apartado de **decisiones de arquitectura**
(ADR) registra cada decisión técnica relevante con su contexto, la decisión
tomada, su justificación y las alternativas consideradas.

Cada decisión tiene un interruptor de **publicación**. Al activarlo, la decisión
aparece en la ficha pública del proyecto; al desactivarlo, vuelve a ser interna.

## 2.3 Subsistema de finanzas

### 2.3.1 Registrar ingresos

El apartado **Finanzas** registra los movimientos de ingreso con descripción,
monto, estado y fecha límite, y vínculos opcionales a proyecto y cliente. El
estado admite tres valores, que reflejan el ciclo real del cobro:

`proyectado` → `pendiente` → `cobrado`

La vista muestra un resumen de totales agrupado por estado, de modo que el
administrador distingue de un vistazo lo facturado de lo efectivamente recibido.

### 2.3.2 Registrar costos y consultar la rentabilidad

El apartado **Costos** registra los servicios contratados por proyecto
(alojamiento, dominio, base de datos y similares) indicando el costo, **quién lo
paga** y **cuánto se le factura al cliente** por él. Con esos tres datos el
sistema calcula la rentabilidad real (P&L) de cada proyecto.

Cuando un costo está en una moneda para la que no se ha configurado tasa de
cambio, el sistema **lo excluye del total y lo señala como advertencia** en lugar
de fallar el cálculo. Ver un total acompañado de una advertencia significa que
ese total está incompleto; la tasa se configura en **Ajustes**.

> **Figura 4 — Costos y rentabilidad por proyecto**
> `imagenes/figura-04-admin-costs.png`

### 2.3.3 Custodiar credenciales en la bóveda

Las credenciales de servicios (claves de API, tokens) se guardan cifradas en la
bóveda asociada a cada servicio de un proyecto. El comportamiento que el usuario
debe conocer es el siguiente:

- El valor **nunca** se muestra en los listados ni viaja en el HTML de la página.
- Para verlo, el administrador pulsa **Revelar** en la credencial concreta; el
  valor se solicita en ese momento al servidor y se muestra en pantalla.
- Si el sistema no tiene configurada la clave de cifrado, el guardado **falla con
  un error** en lugar de almacenar el secreto en texto plano.

### 2.3.4 Vigilar vencimientos de dominios

El apartado **Dominios** descubre automáticamente la fecha de expiración de cada
dominio registrado y avisa por correo y notificación push antes del
vencimiento. El administrador solo debe dar de alta el dominio; el descubrimiento
de la fecha y la alerta son automáticos.

### 2.3.5 Emitir un cobro de campo por WhatsApp

La página `/cobrar` está pensada para usarse desde el celular, delante del
cliente. El procedimiento es:

1. Abrir `/cobrar` con la sesión de administrador iniciada.
2. Introducir el **monto** y el **número de teléfono** del cliente.
3. Revisar la **previsualización** del mensaje que se va a enviar.
4. Pulsar el botón de envío. Se abre WhatsApp en el propio celular con el mensaje
   ya redactado, que incluye un enlace corto de pago.
5. El cliente abre el enlace y paga en la pasarela.

El monto se firma siempre en el servidor y **nunca viaja en la URL del mensaje**:
modificar el enlace no cambia lo que se cobra.

El mensaje incluye además un enlace firmado al histórico de pagos del cliente. Si
el cliente entra a esa página consultando su número de teléfono en lugar de usar
el enlace, los datos se muestran enmascarados: el número de teléfono no es una
credencial de acceso.

> **Figura 5 — Pantalla de cobro de campo**
> `imagenes/figura-05-cobrar.png`

## 2.4 Subsistema de observabilidad

### 2.4.1 Configurar un monitor

El apartado **Monitores** da de alta los servicios cuya disponibilidad se desea
vigilar. Cada monitor se configura con la URL a sondear, el umbral de latencia a
partir del cual el servicio se considera degradado y, opcionalmente, un texto que
debe aparecer en la respuesta para darla por buena.

Los sondeos no los ejecuta el navegador ni el propio panel: los dispara un
servicio de tareas programadas externo, aproximadamente cada cinco minutos. El
administrador no necesita mantener ninguna pestaña abierta.

### 2.4.2 Revisar incidentes

Cuando un monitor falla, el sistema agrupa los fallos consecutivos en un
**incidente**, que se abre en el primer fallo y se cierra en el primer éxito
posterior, registrando causa y duración. El histórico de incidentes es la
evidencia de disponibilidad del servicio y alimenta la página pública `/status`.

> **Figura 6 — Monitores e incidentes**
> `imagenes/figura-06-admin-monitors.png`

### 2.4.3 Evaluar objetivos de nivel de servicio

El apartado **SLO** del LAB permite fijar un objetivo de disponibilidad (por
defecto 99,5 %) y una ventana de evaluación (por defecto 30 días) por monitor. El
sistema calcula el cumplimiento real y el **presupuesto de error restante**, es
decir, cuánto tiempo más puede estar caído el servicio dentro de la ventana sin
incumplir el objetivo.

### 2.4.4 Recibir alertas

Ante una caída de monitor, un vencimiento próximo de dominio o una anomalía de
seguridad, el sistema envía una notificación push al canal configurado. Las
notificaciones son opcionales: si el canal no está configurado, el sistema no
falla, simplemente no notifica.

## 2.5 Subsistema de seguridad

### 2.5.1 Revisar eventos y anomalías

El apartado **Seguridad** consolida los eventos que el sensor del sistema ha
clasificado como hostiles, las anomalías detectadas estadísticamente (picos de
tráfico, patrones nuevos, ráfagas de error) y las acciones de respuesta
disponibles.

Cada anomalía puede marcarse como **revisada**, lo que la retira de la vista
activa sin borrarla del histórico.

### 2.5.2 Bloquear una dirección IP

Desde el mismo apartado, el administrador puede bloquear manualmente una
dirección IP. Todo bloqueo exige un **tiempo de vida**: el sistema no admite
bloqueos permanentes y libera la dirección automáticamente al vencer el plazo.

Cuando el bloqueo lo aplica el sistema de forma automática, la duración escala
con la reincidencia: una hora la primera vez, veinticuatro horas la segunda y
siete días a partir de la tercera.

> **Figura 7 — Panel de seguridad**
> `imagenes/figura-07-admin-security.png`

## 2.6 Subsistema LAB

El apartado **LAB** agrupa las vistas de ingeniería. Su uso es de consulta: el
administrador observa resultados producidos por procesos automáticos.

| Vista | Qué muestra |
|---|---|
| Pipeline | Estado de cada corrida de integración continua: pruebas, cobertura, verificación posterior al despliegue y si hubo reversión automática |
| Seguridad (hallazgos) | Vulnerabilidades de dependencias, hallazgos de análisis estático y dinámico, y violaciones de accesibilidad, cada uno con estado abierto, resuelto o aceptado |
| Chaos | Inyección controlada de fallos |
| SLO | Objetivos de disponibilidad y presupuesto de error |
| Pagos (laboratorio) | Reenvío de eventos de pasarela para comprobar idempotencia |
| Descargas de CV | Histórico de descargas del currículum y detección de revisitas del mismo dispositivo |

### 2.6.1 Ejecutar un experimento de caos

La vista **Chaos** inyecta fallos reales (error 500, error 503 o latencia) en una
ruta concreta para comprobar que el monitoreo los detecta. El procedimiento es:

1. Seleccionar la ruta afectada y el tipo de fallo.
2. Fijar el **tiempo de vida** del experimento, obligatorio y con un máximo de 15
   minutos.
3. Activar el experimento y observar en **Monitores** cómo se abre el incidente.
4. Desactivarlo manualmente, o esperar a que expire solo.

Las rutas `/admin`, `/api/admin` y `/api/auth` están excluidas por código y no
pueden ser objeto de un experimento: la exclusión evita que el administrador se
deje a sí mismo fuera del panel. La vista dispone además de un **interruptor de
pánico** que desactiva de golpe todos los experimentos activos.

> **Figura 8 — Consola de chaos engineering**
> `imagenes/figura-08-admin-chaos.png`

## 2.7 Subsistema de administración del portal de clientes

### 2.7.1 Invitar a un usuario de cliente

El cliente no se registra por su cuenta: es el administrador quien lo invita.
Desde **Portal → Usuarios**, el administrador introduce el correo del contacto y
elige su rol:

| Rol | Alcance |
|---|---|
| `owner` | Todo lo del portal, y además gestiona los usuarios de su propia empresa |
| `member` | Proyectos, mensajes y documentos; ve las facturas pero no puede pagarlas |
| `billing` | Facturas y pagos; sin acceso a mensajes ni a documentos técnicos |

El sistema envía una invitación con un enlace de un solo uso. El usuario queda en
estado `invitado` hasta que abre el enlace y elige su contraseña, momento en el
que pasa a `activo`. Un usuario puede pasarse a `deshabilitado` para retirarle el
acceso sin borrar su histórico.

### 2.7.2 Publicar hitos de avance

La barra de avance que ve el cliente se alimenta de los **hitos** del proyecto,
que el administrador edita manualmente desde **Portal → Hitos**. Conviene tener
presente que el avance no se mueve solo: entre la edición de un hito y la
siguiente, la barra permanece igual aunque haya habido despliegues.

### 2.7.3 Emitir una factura

Desde **Portal → Facturas** el administrador crea la factura con su número
correlativo, sus ítems, moneda, subtotal, impuestos y fecha de vencimiento. El
estado de la factura sigue el ciclo:

`draft` (borrador) → `sent` (enviada) → `paid` (pagada)

con dos desvíos posibles: `overdue` (vencida) si pasa la fecha límite sin pago, y
`void` (anulada) si se deja sin efecto.

Cuando el cliente paga a través de la pasarela, es el aviso de la pasarela el que
cierra el círculo y marca la factura como pagada; el administrador no necesita
hacerlo a mano.

Los importes se manejan internamente en unidades enteras de la moneda menor
(centavos): esto evita los errores de redondeo propios de los números decimales
en operaciones contables.

### 2.7.4 Responder mensajes del cliente

**Portal → Mensajes** muestra los hilos de conversación por proyecto. El
administrador responde desde la misma vista y el cliente ve la respuesta en su
portal, con marca de leído.

### 2.7.5 Curar el feed de actividad

**Portal → Actividad** lista los eventos que el cliente ve en su línea de tiempo
(hitos, facturas, mensajes). Una entrada que no deba mostrarse **se apaga**, no se
borra: el registro se conserva y solo deja de ser visible para el cliente.

### 2.7.6 Ver el portal como un cliente (soporte)

Para dar soporte, el administrador puede ver el portal exactamente como lo ve un
cliente concreto. Esta vista es de **solo lectura**: el sistema impide cualquier
escritura en nombre del cliente, incluido el pago de facturas. El corte está
aplicado en dos puntos independientes del sistema, de modo que la vista de
soporte no puede convertirse accidentalmente en una suplantación.

## 2.8 Subsistema portal de clientes (perfil cliente)

Este apartado está redactado para el usuario final del portal y puede entregarse
al cliente de forma independiente.

### 2.8.1 Activar la cuenta

El cliente recibe por correo una invitación con un enlace. Al abrirlo:

1. El sistema solicita elegir una contraseña.
2. Al confirmarla, la cuenta queda activa y la sesión se inicia
   automáticamente.
3. El enlace de invitación queda consumido: no sirve una segunda vez.

Si el enlace ha caducado, el cliente debe solicitar una nueva invitación al
administrador; no es posible reutilizar el anterior.

### 2.8.2 Iniciar sesión y recuperar la contraseña

El acceso se realiza en `https://codebymike.tech/portal/login` con correo y
contraseña. Tras varios intentos fallidos consecutivos, la cuenta se bloquea
temporalmente; un inicio de sesión correcto limpia el contador.

Si el cliente ha olvidado su contraseña, el enlace **¿Olvidó su contraseña?**
envía un correo con un enlace de restablecimiento de un solo uso, con el mismo
mecanismo que la invitación.

> **Figura 9 — Acceso al portal de clientes**
> `imagenes/figura-09-portal-login.png`

### 2.8.3 Consultar el avance del proyecto

La pantalla inicial del portal muestra, para cada proyecto del cliente, el avance
por hitos, el estado del proyecto y un resumen de lo pendiente.

La información se actualiza sola mientras la pestaña está visible, sin necesidad
de recargar. Al pasar a otra pestaña, la actualización se pausa y se reanuda al
volver.

> **Figura 10 — Pantalla inicial del portal de clientes**
> `imagenes/figura-10-portal-inicio.png`

### 2.8.4 Consultar y descargar facturas

El apartado **Facturas** lista las facturas del cliente con su número, estado,
importe y fecha de vencimiento. Desde el detalle de cada una, el cliente puede
**descargarla en PDF**.

Los clientes con rol `owner` o `billing` pueden además iniciar el pago desde la
propia factura.

### 2.8.5 Consultar documentos

El apartado **Documentos** contiene los archivos que el administrador ha
compartido con el cliente. Los documentos son de solo lectura: el cliente los
consulta y descarga, pero no sube archivos desde el portal.

### 2.8.6 Escribir y leer mensajes

El apartado **Mensajes** contiene los hilos de conversación por proyecto. El
cliente escribe en el hilo y recibe la respuesta en el mismo lugar. Los mensajes
nuevos se marcan como no leídos hasta que se abre el hilo.

Los usuarios con rol `billing` no tienen acceso a este apartado.

### 2.8.7 Revisar notificaciones y actividad

La **campana de notificaciones**, presente en todas las páginas del portal,
avisa de mensajes nuevos, facturas emitidas y cambios de hito. El contador se
actualiza solo mientras la pestaña está visible.

El apartado **Actividad** muestra la línea de tiempo completa de lo que ha
ocurrido en los proyectos del cliente, con filtro por tipo de evento y carga
progresiva de los eventos más antiguos.

Desde **Cuenta**, el cliente ajusta qué notificaciones desea recibir por correo.

---

# 3. FAQ

**¿Por qué el sistema rechaza el inicio de sesión aunque las credenciales de
GitHub son correctas?**
Porque la cuenta no está en la lista de autorización del panel. El sistema
autentica contra GitHub, pero autoriza contra su propia lista; autenticarse
correctamente no basta. La lista se modifica en la configuración del despliegue,
no desde la interfaz.

**¿Por qué el total de costos muestra una advertencia?**
Porque hay al menos un costo registrado en una moneda sin tasa de cambio
configurada. Ese costo queda excluido del total, de modo que la cifra mostrada es
menor que la real. La tasa se configura en **Ajustes**.

**¿Por qué la barra de avance del cliente no se mueve si el proyecto avanza?**
Porque el avance se calcula sobre los hitos que el administrador publica
manualmente, no sobre la actividad del repositorio. Para que el cliente vea
progreso hay que actualizar los hitos.

**¿Por qué no aparece el valor de una credencial en el listado de la bóveda?**
Por diseño: los valores cifrados nunca se incluyen en los listados ni en el HTML
de la página. Se obtienen uno a uno pulsando **Revelar**, en una petición
independiente y autenticada.

**¿Qué ocurre si se bloquea una dirección IP por error?**
Todo bloqueo tiene un tiempo de vida obligatorio y expira solo. Además puede
retirarse manualmente desde el panel de seguridad, sin esperar al vencimiento.

**¿Puede un experimento de caos dejar el panel inaccesible?**
No. Las rutas del panel de administración y de autenticación están excluidas por
código, no por configuración, de modo que no es posible seleccionarlas. Además
todo experimento tiene un tiempo de vida máximo de 15 minutos y existe un
interruptor de pánico que los desactiva todos.

**¿Por qué no llegan las notificaciones push?**
Las notificaciones son opcionales por diseño: si el canal no está configurado en
el entorno, el sistema no falla, simplemente no envía. Conviene comprobar la
configuración del canal antes de suponer que hay un fallo.

**¿Puede un cliente ver los datos de otro cliente?**
No. Ninguna consulta del portal acepta el identificador de cliente desde la
petición: siempre se toma de la sesión activa. Esta condición está cubierta por
pruebas automáticas que intentan explícitamente leer datos de otro cliente y
comprueban que el sistema los niega.

**¿El número de teléfono sirve para consultar el histórico de pagos?**
No como credencial. La consulta manual por número muestra los datos
enmascarados y está fuertemente limitada en frecuencia. El histórico completo
solo se abre con el enlace firmado que se envía en el mensaje de WhatsApp.

**¿Qué pasa si el cliente paga dos veces por un fallo de red?**
No se genera un doble cargo. Cada cobro lleva una clave de idempotencia: repetir
la operación con la misma clave devuelve el cobro ya existente en lugar de crear
uno nuevo.

**¿Los datos que se ven en `/demo` son reales?**
No. El modo de demostración consulta una base de datos distinta, sembrada con
datos ficticios, y solo admite operaciones de lectura. Las rutas sensibles —
bóveda, respaldos, sesiones y cobros — están vetadas incluso en modo lectura.

**¿Se puede recuperar un dato borrado por error?**
El sistema realiza respaldos periódicos automáticos y permite generar uno manual
desde el apartado **Respaldos**. La recuperación no es una operación de la
interfaz: requiere el procedimiento descrito en el *Manual Técnico*.

---

# 4. GLOSARIO

| Término | Descripción |
|---|---|
| ADR | *Architecture Decision Record*. Registro de una decisión técnica con su contexto, la decisión, su justificación y las alternativas consideradas. |
| Anomalía | Desviación estadística del comportamiento habitual del tráfico, detectada de forma automática contra una línea base de 30 días. |
| Bóveda | Almacén cifrado de credenciales de servicios. Los valores se guardan cifrados y solo se revelan bajo petición autenticada. |
| Briefing | Documento de alcance de un proyecto: objetivo, presupuesto, horas, requerimientos, entregables y exclusiones. |
| Chaos engineering | Práctica consistente en inyectar fallos controlados en un sistema en funcionamiento para comprobar que se detectan y se responden correctamente. |
| Cobro de campo | Cobro generado desde el celular y enviado al cliente por WhatsApp mediante un enlace corto de pago. |
| CRM | *Customer Relationship Management*. Conjunto de funciones de gestión de clientes, proyectos, seguimiento y comunicaciones. |
| Hito | Punto de control con nombre y fecha dentro de un proyecto; el conjunto de hitos determina el avance que ve el cliente. |
| Idempotencia | Propiedad por la cual repetir una operación con los mismos parámetros produce el mismo resultado que ejecutarla una sola vez. Evita cobros duplicados. |
| Incidente | Agrupación de fallos consecutivos de un mismo monitor, desde el primer fallo hasta el primer éxito posterior. |
| Llave de acceso (passkey) | Credencial criptográfica ligada al dispositivo que permite iniciar sesión sin contraseña, conforme al estándar WebAuthn/FIDO2. |
| Lista de autorización | Relación explícita de cuentas de GitHub con permiso para acceder al panel. Autenticarse no implica estar en ella. |
| Monitor | Definición de un servicio a vigilar: URL, umbral de latencia y contenido esperado. |
| P&L | *Profit & Loss*. Rentabilidad de un proyecto, calculada contrastando los ingresos cobrados contra los costos de los servicios asociados. |
| Pasarela de pagos | Servicio externo que procesa las transacciones y comunica su resultado al sistema mediante avisos automáticos. |
| Portal de clientes | Área privada donde cada cliente consulta el avance, las facturas, los documentos y los mensajes de sus proyectos. |
| Rol del portal | Nivel de acceso de un usuario de cliente dentro del portal: `owner`, `member` o `billing`. |
| SIEM | *Security Information and Event Management*. Sistema de recolección, correlación y respuesta ante eventos de seguridad. |
| SLO | *Service Level Objective*. Objetivo de disponibilidad de un servicio en una ventana de tiempo, con un presupuesto de error asociado. |
| Tiempo de vida (TTL) | Plazo tras el cual un dato temporal —un bloqueo de IP, un experimento de caos, una sesión— expira automáticamente. |
| Web Vitals | Métricas de experiencia de carga e interacción medidas sobre visitantes reales del sitio público. |
