---
title: Bloqueo escalado de IPs sin desconectarme a mí mismo
description: Detectar amenazas ya no bastaba. El micro-SIEM del portfolio gana enforcement de verdad — TTL que escala con la reincidencia y honeypots que se bloquean en el propio request, no en el próximo cron.
date: 2026-07-19
tags: [seguridad, observabilidad, sre]
---

[El micro-SIEM de este sitio](/notes/construyendo-un-micro-siem-para-mi-portfolio) llevaba semanas detectando y clasificando tráfico hostil, pero se quedaba corto en la parte que más importa: actuar. Un scanner que tocaba un honeypot generaba un evento, el evento esperaba al cron de auto-block, y entre que el cron corría y decidía bloquear podían pasar minutos en los que la misma IP seguía golpeando el sitio sin fricción. Detectar sin bloquear es la mitad del trabajo.

## El disparador que nunca se disparó

Cuando fui a revisar por qué una misma IP aparecía tocando un endpoint señuelo varios días seguidos sin que nada la bloqueara, el diagnóstico fue más incómodo que "el cron llega tarde": el cron no llegaba nunca. El auto-block vivía enteramente dentro de una tarea programada que dependía de un disparador externo, y ese disparador jamás se había dado de alta — además, la entrada que lo habría ejecutado desde la plataforma se había caído en una edición previa. El motor de bloqueo estaba escrito, probado y desplegado, y no se ejecutaba una sola vez.

Esa es la lección que me llevo, y no es sobre latencia: **una defensa que depende de un disparador externo que nadie activó no es una defensa lenta, es una defensa ausente.** El panel mostraba los eventos, las reglas clasificaban bien, los tests pasaban en verde — todo daba la sensación de un sistema que funcionaba, y ninguna de esas señales tocaba la única pregunta que importaba: *¿alguien está llamando a esto?* Un componente de seguridad que solo corre cuando algo externo lo invoca hereda la fiabilidad de ese algo externo, no la del código que escribiste. Por eso la parte más confiable de reaccionar — la señal sin ambigüedad — no podía seguir viviendo ahí.

## Un solo TTL no representa la realidad

La primera versión del bloqueo usaba un TTL fijo: se bloqueaba una IP, y a la hora volvía a tener vía libre. Eso trata igual a un scanner que pasó una sola vez que a uno que vuelve cada semana religiosamente. La solución fue escalar el TTL con la reincidencia — 1 hora la primera vez, 24 horas la segunda, 7 días de ahí en adelante — leyendo el contador `hits` de la fila persistente en `blocked_ips`. La fila sobrevive aunque el bloqueo anterior haya expirado (solo el cron de purga la borra), así que ese contador es memoria real de cuántas veces ya se bloqueó esa IP, no un valor que se resetea solo.

```ts
export function escalatedTtlSec(priorHits: number): number {
  const i = Math.min(Math.max(priorHits, 0), BLOCK_TTL_STEPS_SEC.length - 1)
  return BLOCK_TTL_STEPS_SEC[i]!
}
```

Es una función pura de un array de tres pasos — nada de curvas exponenciales ni configuración por IP. La reincidencia real casi nunca pasa del tercer bloqueo, y cuando pasa, una semana ya es suficiente fricción para que dejar de intentarlo salga más barato que seguir.

## Bloquear en el propio request, no en el próximo cron

El auto-block sigue viviendo en el cron por la misma razón que documenté en la nota anterior: agregar eventos y decidir bloqueos es trabajo que no debería competir con el camino caliente de un request. Pero los honeypots son la excepción que ya identifiqué como la única señal sin ambigüedad — nadie legítimo pide `/wp-login.php` en este sitio — y esperar al cron para una señal 100% confiable es regalarle a un scanner una ventana gratis para seguir escaneando.

Por eso el middleware ahora bloquea inline en cuanto detecta un honeypot, reutilizando la misma `blockIpEscalated` que usa el cron:

```ts
if (threat?.category === 'honeypot' && ip) {
  await blockIpEscalated(
    { ip, reason: 'honeypot tocado', ruleId: 'honeypot.inline', source: 'auto' }
  ).catch(() => {})
}
```

El request que toca el honeypot sí sigue su curso — recibe el señuelo con su tarpit y su HTML falso, para no delatar la trampa en el primer contacto. Es la *siguiente* petición de esa IP, a cualquier ruta, la que se encuentra con un 403 seco. Compartir `blockIpEscalated` entre el cron y el middleware fue deliberado: dos caminos que deciden el mismo TTL con lógica distinta es la clase de divergencia silenciosa que termina en un bug que nadie nota hasta que alguien pregunta por qué dos IPs con el mismo historial recibieron bloqueos distintos.

## Las mismas salvaguardas, ahora en el camino caliente

Meter una escritura a base de datos dentro del request que sirve el enforcement es exactamente el tipo de decisión que puede convertir una defensa en el propio incidente, así que hereda las salvaguardas que ya existían para el cron sin duplicarlas:

- **Allowlist primero.** `blockIpEscalated` delega en `blockIp`, que nunca bloquea una IP de la allowlist — ni siquiera si toca un honeypot por accidente (un escáner interno de monitoreo, por ejemplo).
- **Fail-open explícito.** El `.catch(() => {})` no es un descuido: si el insert de la escalada falla, el request que ya estaba en curso sigue su camino igual. Un fallo en el bloqueo nunca debe convertirse en un 500 para quien lo disparó.
- **Lectura cacheada, no la escritura.** `isBlocked` sigue leyendo de una caché en memoria de 30 segundos — eso no cambia. Lo nuevo es solo la escritura inline para honeypots, que es infrecuente por diseño: un visitante legítimo nunca la dispara.

## Por qué esto no se convierte en un cañón contra mí mismo

El miedo obvio con cualquier bloqueo automático es bloquearme a mí mismo, o a un servicio legítimo, por una falsa alarma. Tres cosas lo evitan en conjunto: la allowlist (mi propia IP y rangos de confianza nunca entran en la ecuación, ni por honeypot ni por ráfaga), que la única señal con bloqueo inline sea la de cero falsos positivos conocidos (los honeypots), y que todo lo demás — ráfagas de eventos de severidad alta — siga pasando por el cron con su umbral y su tope de bloqueos activos. El enforcement inline es una excepción quirúrgica para un caso sin ambigüedad, no la regla general.

El resultado es un sistema donde la parte más rápida de reaccionar (el request en curso) es también la más conservadora en qué bloquea, y la parte con más contexto para decidir (el cron, con agregados de varios minutos) es la que maneja los casos grises. Detectar ya no basta si el bloqueo llega tarde; pero bloquear rápido tampoco sirve si no se puede confiar en que la señal es real.
