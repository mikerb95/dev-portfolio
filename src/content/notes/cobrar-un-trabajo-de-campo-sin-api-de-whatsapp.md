---
title: Cobrar un trabajo de campo sin API de WhatsApp
description: No todo mi trabajo es código. Necesitaba cobrar soporte técnico desde el celular, en la calle, sin pagar una API de WhatsApp Business ni exponer el monto en un link que cualquiera pudiera tocar.
date: 2026-07-16
tags: [pagos, seguridad, producto]
---

No todo lo que hago es escribir software. También arreglo computadores, instalo redes, hago soporte in situ — trabajo que se cobra al final de la visita, de pie, con el cliente al lado. La forma real de cobrar eso no es un checkout con carrito: es un número, un link, y "págame por aquí". Quería que ese link llegara por WhatsApp, sin pagar la API de WhatsApp Business (pensada para volumen, no para un freelance que manda tres mensajes al día) y sin sacrificar nada de lo que ya construí en [la máquina de estados de pagos](/notes) que corre `/pay`.

## Reutilizar la pasarela, no duplicarla

La tentación fácil era construir un sistema de "cobros" aparte: otra tabla, otro flujo, otra lógica de estados. La resistí. Un cobro de campo *es* un pago — mismo `payments`, misma idempotencia, mismos webhooks de Wompi, misma verificación de firma. Lo único que le agregué a la fila fueron cinco columnas: el teléfono del pagador, de dónde nació (`pay` vs `cobro`), un código corto para el link, un vencimiento opcional, y un vínculo suave con la ficha del cliente si ya existía en el CRM. Cero tablas nuevas, cero máquina de estados paralela. La anulación de un cobro pasa por el mismo `applyGatewayEvent` que procesa un webhook real: la transición `approved → voided` que ya existía para reembolsos manuales es, sin cambiar una línea, también el botón "Anular" de la pantalla de campo.

## El monto nunca viaja en el link

El link que WhatsApp entrega es `/c/AB3K9F` — un código de seis caracteres, nada más. La tentación de meter el monto directamente en la URL (`/c/AB3K9F?amount=150000`) es la que abre la puerta a que alguien lo edite antes de pagar. En vez de eso, el servidor busca el pago por el código y firma los parámetros de Wompi *en el momento del clic* — el mismo patrón de integridad que ya usaba el checkout público, solo que ahora el disparador es un código corto en lugar de un formulario. El cliente nunca ve ni puede tocar una cifra que no sea la que yo configuré.

## Un teléfono no es una contraseña

El segundo problema era el histórico: quería que el cliente pudiera ver sus pagos anteriores sin que yo tuviera que construir un sistema de cuentas. La solución obvia — "consulta por tu número de celular" — tiene un defecto evidente: cualquiera que conozca el número de otra persona vería su historial completo de pagos. Un teléfono se comparte constantemente; no es un secreto.

Así que separé dos niveles de acceso. Cada mensaje de WhatsApp lleva un link con un HMAC del teléfono — una credencial que solo yo puedo generar porque solo yo tengo el secreto del servidor — y ese link muestra el historial completo. Pero también dejé abierta una consulta manual solo por número, para cuando alguien perdió el link: esa vista devuelve fechas y estados reales, pero el monto llega enmascarado (`$ •••.500`) y con un límite de cinco consultas por hora. Suficiente para que el dueño reconozca su propio pago; inútil para que un tercero perfile cuánto le cobro a quién.

## Autorizar sin sesión

Un detalle que no anticipé hasta implementarlo: en el modo de pruebas (sin llaves de Wompi configuradas), el endpoint que simula la pasarela exigía sesión de administrador o ser dueño de una factura del portal de clientes. Ninguna de las dos aplica a alguien que solo recibió un link por WhatsApp. La solución fue tratar el código corto como lo que es — una prueba de posesión, no distinta en espíritu de que un cliente del portal demuestre ser dueño de su factura — y aceptarlo como una vía más de autorización, comparado en tiempo constante para que ni siquiera el timing de la respuesta filtre información sobre si el código es casi correcto.

## Lo que aprendí sobre mezclar convenciones

El bug más molesto no fue de seguridad sino de entorno: parte del código de este repo lee variables con `import.meta.env` y otra parte con `process.env`, y no son intercambiables — el servidor de desarrollo de Astro carga el `.env` solo en el primero, y Vercel en producción solo inyecta en el segundo. Escribí el código leyendo una sola fuente y funcionó perfecto en producción y falló en silencio en local: el link firmado del histórico caía siempre al formulario de respaldo, como si el secreto no existiera. El bug no se manifestó como un error — se manifestó como una degradación educada a un camino secundario, que es la peor clase de bug porque no rompe nada, solo hace que lo bueno nunca se active. La corrección fue un helper que mira ambas fuentes; la lección fue no confiar en que "funciona en mi máquina" y "funciona en producción" midan lo mismo cuando el entorno tiene dos maneras distintas de cargar configuración.
