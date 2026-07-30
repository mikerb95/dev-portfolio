---
title: Por qué construí mi propio monitor de uptime
description: UptimeRobot me decía que todo estaba bien mientras producción servía la página equivocada. Así que escribí el motor de checks que necesitaba.
date: 2026-07-05
tags: [observabilidad, astro, sre]
---

Un servicio de uptime genérico responde una sola pregunta: ¿el servidor devolvió 200? Y esa es la pregunta equivocada. Un deploy roto puede responder 200 con una página en blanco, con el bundle sin compilar o con el HTML de otro proyecto. El sitio está "arriba" y a la vez completamente caído para quien lo visita.

Después de encontrarme exactamente ese caso, decidí que el monitoreo de mis proyectos y los de mis clientes lo haría un motor propio. No por deporte: porque las preguntas que yo necesitaba responder no las respondía ninguna capa gratuita de ningún servicio.

## Qué valida cada check

Cada sondeo hace tres validaciones, no una:

1. **Código HTTP esperado** — lo obvio.
2. **Contenido esperado** — la respuesta debe *contener* un texto configurado por monitor. Si el HTML no trae la marca esperada, cuenta como caída aunque el status sea 200. Esto detecta los deploys rotos que un ping jamás ve.
3. **Umbral de latencia** — por encima del umbral (configurable por monitor), el servicio se marca como *degradado*: un estado intermedio que merece atención pero no una alerta de madrugada.

Además, cada ~12 horas el motor revisa la expiración del certificado TLS. Un certificado vencido es una caída perfectamente evitable, y sin embargo es de las más comunes.

## Incidentes, no fallos sueltos

Un check fallido aislado es ruido; lo que importa es la ventana entre el primer fallo y el primer éxito posterior. El motor agrupa los fallos consecutivos en **incidentes** con inicio, resolución y duración. Eso convierte "hubo 14 checks fallidos" en "el servicio estuvo caído 23 minutos el martes", que es la frase que un cliente entiende y la que yo necesito para calcular disponibilidad real.

Las transiciones — caída y recuperación, no cada fallo — disparan una notificación push al móvil vía [ntfy](https://ntfy.sh). Alertar en cada check fallido entrena a ignorar las alertas; alertar en las transiciones las mantiene significativas.

## El detalle del cron

Este sitio corre en Vercel, y el plan Hobby solo permite un cron job diario — inútil para uptime. La solución costó cero: un cron externo (cron-job.org) golpea cada pocos minutos un endpoint autenticado con un token secreto, y ese endpoint ejecuta la ronda de sondeos. Vercel conserva un cron diario propio como red de seguridad por si el externo falla.

Es un buen recordatorio de que la restricción de una plataforma casi nunca es el final del diseño; es el comienzo.

## Lo que salió de ahí

Sobre el historial de checks se calculan SLOs y presupuestos de error ([lo cuento en otra nota](/notes/slos-y-error-budgets-en-un-portfolio)), y los mismos datos alimentan la [página pública de status](/status): lo que ve un visitante es exactamente lo que veo yo en el panel, sin maquillaje. Un monitor propio no es solo una herramienta — es la evidencia verificable de cómo trabajo.
