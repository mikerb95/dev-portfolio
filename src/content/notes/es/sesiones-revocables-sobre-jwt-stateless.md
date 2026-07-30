---
title: Sesiones revocables sobre un JWT stateless
description: Mi panel de admin usaba JWT puro; una cookie robada era imparable hasta expirar. Así le añadí lista de dispositivos, revocación remota y alertas sin abandonar el JWT.
date: 2026-07-09
tags: [seguridad, auth, astro]
---

El panel de administración de este sitio se autentica con OAuth de GitHub y una sesión JWT. Es un diseño cómodo — sin store de sesiones, sin estado en el servidor — pero tiene un punto ciego incómodo: **el servidor no sabe cuántas sesiones existen ni dónde**. Si alguien roba la cookie (un dispositivo perdido, una laptop compartida, un descuido), esa sesión es invisible e imparable hasta que el token expire por sí solo.

La solución clásica es migrar a sesiones en base de datos. No quise: el JWT stateless me da logins que no tocan la DB y cero infraestructura de sesión. Lo que hice fue añadir la parte que faltaba — visibilidad y revocación — encima del JWT, sin cambiar la estrategia.

## Un `sid` firmado dentro del token

En el callback de login, cada sesión nueva recibe un identificador único (`sid`) que viaja **firmado dentro del propio JWT**. Ese detalle importa: la identidad de la sesión no depende de ninguna cookie auxiliar que un atacante pueda borrar o falsificar. Si el token es válido, el `sid` es auténtico; no hay forma de evadir una revocación limpiando cookies.

El middleware del panel, que ya validaba sesión y allowlist en cada request, ahora además registra el dispositivo en una tabla propia: `sid`, navegador y sistema operativo (parseados del User-Agent), IP (de los headers del proxy) y marcas de primera y última actividad.

## El costo: una lectura por request, escrituras cada 5 minutos

Un registro de sesiones ingenuo mete un *write* a la base de datos en cada navegación. El mío separa los dos caminos:

- **Lectura en cada request** — barata, y es lo que hace que revocar una sesión tenga efecto inmediato: el dispositivo revocado pierde el acceso en su siguiente clic, se le borra el JWT y vuelve al login.
- **Escritura con throttle** — `lastSeen` solo se reescribe si el registro tiene más de 5 minutos. Para una ventana de expiración de 24 horas, una precisión de ±5 minutos es irrelevante.

Todo el camino es *fail-open*: si el registro de sesiones falla, el panel sigue funcionando. Un sistema de seguridad secundario nunca debería ser el que tumba el acceso legítimo.

## Defensa activa, no solo visibilidad

Una lista de dispositivos que nadie mira es teatro. Dos piezas la convierten en defensa:

1. **Push al instante por dispositivo nuevo.** La primera vez que un dispositivo desconocido abre sesión de admin, me llega una notificación al móvil vía [ntfy](https://ntfy.sh) con navegador, sistema operativo e IP — la misma tubería que ya usaba [mi monitor de uptime](/notes/por-que-construi-mi-propio-monitor). Si el login no fui yo, lo sé en segundos y lo revoco desde el teléfono.
2. **Expiración por inactividad de 24 horas.** Una sesión sin actividad en un día se revoca sola, en dos capas: al momento si el dispositivo vuelve (lo comprueba el middleware) y por barrido del cron que ya corría cada pocos minutos, para que la lista del panel refleje la realidad aunque el dispositivo nunca regrese.

## Lo que no cambia

Ninguna de estas piezas reduce la probabilidad de intrusión: la puerta sigue siendo OAuth de GitHub con allowlist de un solo usuario, y la mejor defensa ahí es el 2FA de la cuenta de GitHub. Lo que cambia es el **tiempo de respuesta ante un compromiso**: antes, una cookie robada vivía hasta su expiración; ahora vive hasta que me llega el push. Esa diferencia — de horas o días a segundos — es la métrica que de verdad importa en la respuesta a incidentes.
