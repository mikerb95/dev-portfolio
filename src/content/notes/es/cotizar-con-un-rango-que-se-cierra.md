---
title: Cotizar con un rango que se cierra
description: Construí Plano, el cotizador con el que armo cada propuesta. El precio arranca como un rango y se cierra con cada respuesta, el cliente recibe su proyecto dibujado como un plano, y la IA lee la conversación sin poder escribir una sola cifra.
date: 2026-10-06
tags: [arquitectura, ia, pagos, producto]
lang: es
translationOf: quoting-with-a-closing-range
decision:
  problem: "Cada cotización salía de cero, con un precio que era una corazonada."
  rejected: "Una plantilla con precio fijo por paquete"
  chosen: "Un rango que se cierra con preguntas, con el mismo motor del sitio"
---

Cotizar era la parte de mi trabajo que peor hacía. Cada propuesta salía de cero: una conversación de WhatsApp, una hoja de cálculo, una cifra que se sentía razonable y un PDF armado a mano. Después venía lo difícil de verdad: cuándo se paga, cuántos pagos, qué pasa si el cliente desaparece tres semanas, quién aprueba el diseño. Todo eso quedaba en el aire hasta que hacía falta, que es justo el peor momento para decidirlo.

Construí Plano para dejar de improvisar. Tiene tres ideas que no había visto juntas en ninguna herramienta de cotización, y las tres salieron de mirar con honestidad qué me salía mal.

## El precio es un rango, no una cifra

Cuando un cliente dice "quiero una tienda", no sé cuánto cuesta. Sé que una tienda en mi tabla va de 20 a 35 horas, y que la diferencia depende de cosas que todavía no me ha dicho: si son 30 productos o 800, si lleva inventario, si tiene tallas y colores.

Las herramientas que conocía me obligaban a escoger una cifra desde el principio. Plano hace lo contrario: cada componente arranca con su rango completo, y cada uno trae dos o tres preguntas. Cada respuesta elige una franja dentro de ese rango. "Menos de 50 productos" se queda con la parte baja; "más de 500 o con variantes" con la alta. Las franjas se solapan a propósito, porque una respuesta reduce la incertidumbre, no la elimina.

El detalle que hace que esto sea seguro es que **ninguna respuesta puede sacar un componente de la tabla**. La franja se expresa como fracciones del rango aprobado, de 0 a 1, y el motor rechaza cualquier cosa fuera de ahí. En el peor caso el rango es el de la tabla; en el mejor, una franja estrecha dentro de ella.

Lo que le ofrezco al cliente es el techo del rango. Y eso convierte las preguntas en algo que me conviene hacer: con todo abierto tengo que cobrar el peor caso para cubrirme; con cada respuesta, el techo baja y la propuesta se vuelve más competitiva. El medidor del constructor lo muestra como un cono que se estrecha, con un porcentaje de certeza al lado.

## Un solo motor de precios

La tentación obvia era escribir el cálculo de Plano desde cero. No lo hice, y es probablemente la decisión más importante del proyecto.

El sitio ya calcula precios en tres sitios: la página de diseño web, el asesor con IA de la burbuja y el cotizador del asistente. Los tres leen el mismo tarifario y el mismo motor. Si Plano tuviera su propio cálculo, tarde o temprano el sitio le diría una cifra a un cliente y la propuesta otra. Así que Plano solo le agregó al motor la posibilidad de afinar la franja de cada componente, con pruebas que comprueban que sin franja el resultado es idéntico al de antes.

Encima del precio, Plano arma el resto con módulos puros: el plan de pagos según el monto, las fechas en días hábiles colombianos (festivos con Ley Emiliani incluidos), las cuotas con recargo en cuota fija, y las cláusulas que aplican según lo que lleva el proyecto. Que sean puros no es un capricho: la misma función corre en el navegador para que el constructor se recalcule en vivo, y en el servidor cuando la versión se congela. Si las dos dieran resultados distintos lo sabría, porque cada versión enviada guarda su huella SHA-256 sobre un JSON canónico.

## La IA lee, pero no escribe cifras

El primer paso de una propuesta casi siempre es una conversación desordenada. Plano tiene un botón para pegarla y que Claude arme el borrador. Le di a la IA un trabajo acotado y le quité todo lo que podía salir mal:

- Solo puede elegir componentes de mi tabla. El esquema de salida es un enum con los identificadores válidos, y el código descarta cualquier otro.
- El esquema no tiene ningún campo donde poner un precio. No es una instrucción en el prompt: es que no hay dónde escribirlo.
- Por cada componente tiene que citar la frase exacta del cliente que lo justifica. Después, el código busca esa frase en la conversación. Si no aparece tal cual, la cita se borra y se cuenta como descartada. Una trazabilidad que no se puede creer no sirve de nada.

La segunda función de IA es la que más uso: "el cliente difícil". Claude lee la propuesta como la vería el cliente más quisquilloso y me devuelve dónde se presta a dos lecturas, por dónde puede crecer el alcance sin que nadie lo pague y un pre-mortem. Todo lo que escribe pasa por la misma guardia de cifras del asistente: si un hallazgo menciona dinero que no sale del cálculo, el hallazgo entero se descarta.

## El cliente recibe un plano, no un PDF

La parte que más disfruté construir es lo que ve el cliente. Su propuesta llega como un enlace privado, y lo primero que encuentra es su proyecto dibujado como la planta de una casa: cada componente es una habitación, lo incluido está construido con muros sólidos y lo que se puede agregar aparece punteado.

Si le habilité esa perilla, toca una habitación punteada, la habitación se construye, el precio cuenta hacia el nuevo valor y la fecha de entrega se corre. También puede elegir entre las tres versiones (esencial, recomendada, completa) y entre pagar por entregas o en cuotas. El navegador del cliente nunca tiene mis reglas ni mis horas: cada perilla es una simulación en el servidor, que recalcula desde la versión que le envié, no desde el borrador que yo pueda estar editando.

Las condiciones se leen en cristiano, con el texto formal a un clic. Al aceptar, con nombre y documento, el servidor recalcula una vez más y solo acepta si el total coincide con el que el cliente vio. Queda una constancia con la huella de la versión exacta. Si el cliente movió perillas, esa elección se congela como una versión nueva, marcada como suya.

## De "sí" a proyecto sin tocar nada

El anticipo se paga con Wompi desde el mismo enlace, con la clave de idempotencia derivada de la propuesta y la versión aceptada: dos clics, un cobro. Cuando el webhook confirma el pago, Plano reclama la propuesta con un UPDATE condicional y crea el cliente, el proyecto, los hitos con sus fechas, las cuentas de cobro en borrador de los pagos que faltan y la invitación al portal. Los webhooks se repiten por diseño; el UPDATE condicional hace que solo el primero convierta.

La prueba de integración que más me tranquiliza recorre todo eso contra una base libSQL temporal creada con las migraciones reales: versiones que no se duplican, perillas que solo cambian lo que habilité, una aceptación rechazada porque el precio no cuadra, el anticipo pedido dos veces y una sola conversión aunque el webhook llegue dos veces.

## Lo que todavía no sé

Hoy no tengo historial de horas reales, así que la tabla de componentes es una estimación honesta y nada más. Plano ya tiene dónde anotar cuánto me tomó cada componente en los proyectos aceptados y, con tres mediciones por componente, me dirá si la tabla se queda corta o larga respecto del colchón. Nunca la cambia sola: sugiere, y yo decido. Dentro de unos meses sabré si mis rangos eran buenos, y esa va a ser la segunda parte de esta nota.
