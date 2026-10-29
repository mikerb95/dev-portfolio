# 11 · IA y agentes

El sitio usa la API de Claude en varios puntos, siempre con las mismas
salvaguardas:

- **La IA no inventa cifras.** Toda cantidad de dinero que escribe una IA debe
  haber salido de una herramienta (guardia de cifras,
  `lib/asistente/guardia.ts`). Los precios salen del tarifario.
- **La IA propone, una persona decide.** Bloqueos de IP, escrituras en el
  panel, propuestas: siempre con aprobación explícita.
- **Topes de gasto diario** por agente (`lib/gasto-diario.ts`, contador en
  `app_settings`): asesor US$1/día por defecto (`ASESOR_TOPE_DIARIO_USD`),
  asistente y analista US$3/día (`ASISTENTE_TOPE_DIARIO_USD`,
  `ANALISTA_TOPE_DIARIO_USD`).
- **Datos personales fuera** antes de enviar texto a la API
  (`lib/asistente/limpieza.ts`); IPs seudonimizadas para el analista.
- **Sin `ANTHROPIC_API_KEY`**, cada función de IA se apaga en silencio.
- Tono: **tuteo colombiano**, nunca voseo (también en los prompts).
- Pruebas e2e con un Anthropic falso (`e2e/fake-anthropic.mjs`); pruebas con el
  modelo real mediante scripts (`scripts/*-prueba-*.ts`, banco de casos).

Modelos en el código (oct 2026): `claude-haiku-4-5` para el asesor público
(barato y rápido, ~US$0,006 por pregunta) y `claude-opus-5-5` para el panel,
el analista, Plano y el vigía.

## Asesor público (burbuja de WhatsApp)

RF-212, RF-213, RF-037. Skill reutilizable: `chat-ia`. Artículo:
`/notes/que-un-asistente-te-recomiende-sin-inventarte-el-precio`.

- Vive dentro de `WhatsappFab.astro` en las páginas comerciales; también es la
  primera vuelta del campo "Cuéntame qué necesitas" del hero de la portada, con
  **traspaso** a la burbuja (`asesor/traspaso.ts`).
- Resuelve dudas de los servicios con un conocimiento acotado
  (`asesor/conocimiento.ts`), calcula un precio estimado con herramientas
  (`asesor/herramientas.ts`) y lleva la conversación a WhatsApp con un resumen
  escrito. WhatsApp sigue siendo el canal principal.
- Endpoint `/api/asesor` (POST limitado a 40 por 10 min por IP).
- **Asesor en vivo** (RF-213): cuando la persona muestra interés o el asesor da
  un precio, avisa a Mike por ntfy con enlace a `/admin/asesor/<id>`, donde
  puede entrar a la conversación. Se guarda 48 h y solo con interés.
  (`wa.me` no sirve para avisar a Mike: abre un chat, no notifica.)
- Botón "Enviarle esto a Mike" puede crear una propuesta en Plano
  (`asesor/propuesta.ts`).
- **Respuestas firmadas** (`asesor/firma.ts`): el navegador reenvía la
  conversación en cada pregunta, así que podría inventar turnos del asesor.
  Cada respuesta sale con una firma HMAC de su texto y vuelve con ella; un turno
  del asesor sin firma válida se guarda y se le pasa al modelo con la marca
  `[No verificado]`, para que Mike no lea como del asesor algo que no dijo.

## Asistente del panel

RF-210, RF-211, RF-219. Plan: [`docs/plan-asistente.md`](../plan-asistente.md)
(todas las fases, 6 oct 2026). Skill reutilizable: `panel-ia`. Artículo:
`/notes/un-asistente-que-escribe-con-permiso`.

- Caja "Pregunta o busca" del dashboard: primero **búsqueda instantánea**
  (`asistente/buscar.ts`, recorre `panel-nav.ts` y fichas de la base), y al
  enviar, el asistente con IA (`asistente/motor-api.ts`).
- **Herramientas de lectura** (`asistente/herramientas/`): negocio (proyectos,
  clientes, cuentas de cobro), bandeja (mensajes pendientes), pagos,
  vencimientos, operación (monitores, caídas, crons), documentación del sitio,
  ubicación en el panel, cotización.
- **Escrituras con aprobación** (`asistente/escrituras/`): crear cuenta de cobro
  en borrador, actualizar hito, cambiar estado/fechas de proyecto, anotar
  seguimiento, marcar mensajes como leídos, convertir el mensaje de un cliente
  en propuesta de Plano. Ninguna se ejecuta sola: Mike ve una **tarjeta con el
  antes y el después** y aprueba (`/api/admin/asistente/decision`).
- Historial en `asistente_conversaciones`.
- Versión de terminal: `npm run asistente` (`agents/asistente/`).

## Analista del micro-SIEM

RF-613. Plan: [`docs/plan-analista-siem.md`](../plan-analista-siem.md).
Artículo: `/notes/un-analista-que-propone-pero-no-decide`.

- Bucle propio (`analista/bucle.ts`) con seis herramientas de lectura del SIEM y
  una de **proponer bloqueo** que **pausa** el bucle hasta que Mike aprueba o
  rechaza (puede esperar horas).
- Nunca ve una IP real: **seudónimos** estables (`analista/seudonimos.ts`).
  Para decidir, Mike ve el detalle real del origen aparte
  (`analista/detalle-origen.ts`).
- Transmisión en vivo por SSE en `/admin/analista`; cada ejecución se guarda en
  `analista_ejecuciones` con su costo.
- Corre solo cada mañana (cron `analista-matutino`) y manda el resumen al
  celular.
- Versión de terminal con el Agent SDK: `npm run analista` (presentado en un
  meetup el 1 oct 2026). Halló un falso positivo real en una regla.
- Credencial: solo `ANTHROPIC_API_KEY` de Claude Platform
  (`analista/credencial.ts`).

## Vigía nocturno del repositorio

RF-510. Plan: [`docs/plan-managed-agents.md`](../plan-managed-agents.md).

- Agente de **Claude Managed Agents** definido en `agents/vigia/` (agente,
  entorno, memoria y deployment versionados; se aplican con `ant apply`; IDs en
  `claude-lock.json`).
- Cada noche revisa el repo (dependencias, tests, tipos, headers del sitio) en
  un contenedor sin credenciales, solo lectura, y deja un `informe.json`
  priorizado.
- Reporta por webhook a `/api/managed/webhook` (requiere
  `ANTHROPIC_WEBHOOK_SIGNING_KEY`, todavía pendiente en producción); el panel lo
  muestra en `/admin/lab/security`.
- Material de workshop en `workshop/managed-agents/`.

## Otras funciones con IA

| Función | Dónde | Qué hace |
|---|---|---|
| Plano: del chat al plano | `lib/plano/ia/chat.ts` | Lee la conversación con el cliente y propone componentes de la tabla. |
| Plano: el cliente difícil | `lib/plano/ia/revision.ts` | Lee la propuesta como el cliente más exigente y señala huecos. |
| Cotiza: IA de alcance | `lib/cotiza/ia.ts` | Del pedido del cliente al alcance en entregables contables. |
| Resumen semanal | `lib/resumen-semanal-ia.ts` | Redacta el resumen de la semana; sin IA se arma igual. |

## AEO: que los asistentes citen bien el sitio

RF-039. Artículo: `/notes/que-un-asistente-te-recomiende-sin-inventarte-el-precio`.

- `llms.txt` y `llms-full.txt` **generados** del mismo contenido del sitio
  (`lib/aeo/llms.ts`), no escritos a mano.
- `robots.txt` generado que deja entrar a los bots de IA.
- JSON-LD del negocio y de las preguntas frecuentes.
- Conteo de visitas de agentes de IA (en el middleware, por user-agent) y de
  referidos desde asistentes (`/api/aeo/referido`) en `aeo_diario`; panel en
  `/admin/aeo`.

## Skills de Claude Code del proyecto

El usuario tiene skills que salieron de este repo y se reutilizan en proyectos
de clientes: `chat-ia` (asesor público), `panel-ia` (asistente del panel) y
`motion-landing` (método de motion verificado con capturas).
