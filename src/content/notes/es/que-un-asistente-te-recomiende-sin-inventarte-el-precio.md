---
title: Que un asistente te recomiende sin inventarte el precio
description: Preparé el sitio para que ChatGPT, Claude y Perplexity lo citen con datos correctos. El llms.txt que tenía estaba escrito a mano y ya no decía qué vendo; ahora se genera del mismo tarifario que la página de precios, el robots.txt no puede abrirle el panel a un bot por accidente, y un contador dice qué agentes vienen a leer.
date: 2026-10-20
tags: [seo, ia, observabilidad, arquitectura]
lang: es
translationOf: getting-an-assistant-to-recommend-you-without-making-up-your-price
decision:
  problem: "Los asistentes leían un llms.txt viejo: sin servicios, sin precios, sin notas."
  rejected: "Reescribir el llms.txt a mano"
  chosen: "Generarlo del tarifario y las notas, invitar a los bots y contarlos"
---

Cada vez más gente le pregunta a un asistente lo que antes buscaba en Google: "¿quién me hace una página web en Colombia y cuánto cobra?". El asistente responde con lo que encuentra, y lo que encuentra sobre un sitio pequeño suele ser poco y viejo. Eso tiene nombre, AEO (optimización para motores de respuesta), y casi todo lo que se dice de él es SEO de siempre con otra etiqueta. Lo que sí cambia es a quién le hablas: a un modelo que copia frases, no a una persona que hace clic.

## El problema no era la puerta, era el mensaje

Lo primero fue revisar si los bots de IA podían entrar. Con los User-Agent de GPTBot, ClaudeBot, PerplexityBot y los demás, producción respondía 200 en todas las páginas: ni el micro-SIEM ni el WAF los frenaban.

El problema estaba en lo que leían. El `llms.txt` del sitio, el archivo que los asistentes consultan para entender de qué va una web, lo había escrito a mano en julio. Me presentaba como ingeniero de software con TypeScript y React. No decía que el sitio vende páginas web ni capacitación en IA, no tenía un solo precio y no listaba ninguna de las 23 notas. Un asistente que lo leyera sabría menos de mi negocio que alguien que entra a la portada.

Reescribirlo a mano lo arreglaba por un mes. El mismo archivo ya se había quedado viejo una vez, y se iba a quedar viejo de nuevo con el próximo cambio de tarifas.

## Un solo sitio para cada dato

El sitio ya tenía resuelto ese problema en otro lado: los precios viven en `tarifario.ts`, y de ahí leen la página de precios y el asesor de la burbuja. Si el precio estuviera en dos sitios, la web y el asesor terminarían diciéndole cosas distintas al mismo cliente.

Así que `llms.txt` pasó a ser una ruta que se genera con tres fuentes que ya existían: el tarifario para las cifras, los diccionarios para la descripción de cada página y las preguntas frecuentes, y la colección de notas para los artículos. La sección de datos clave está escrita en frases cortas y completas ("Plan Negocio: desde $1.500.000 COP. Lista en 1 a 2 semanas"), porque un motor de respuesta copia la frase, no el párrafo. Al lado está `llms-full.txt`, con el texto completo de las notas, para que un asistente pueda citar sin rastrear página por página.

Lo mismo con los datos estructurados. Antes el sitio declaraba una Persona con su stack y dos servicios sin precio. Ahora hay un nodo de negocio con identificador fijo, con su catálogo de ofertas y el precio "desde" de cada plan sacado del tarifario (en pesos en español, en dólares en inglés), y las preguntas frecuentes de las dos páginas de servicios marcadas como FAQ.

## El robots.txt que podía abrir el panel

La decisión de fondo fue dejar entrar a todos, incluidos los bots que rastrean para entrenar modelos. Para un sitio que quiere que lo recomienden, que un modelo ya conozca el negocio de memoria suma: lo nombra aunque no busque en la web.

Declararlos en `robots.txt` tiene una trampa. Un bot que encuentra un grupo con su nombre deja de leer el grupo `*`. Si el grupo de GPTBot dice `Allow: /` y nada más, el `Disallow: /admin` de arriba deja de aplicarle. Con el archivo escrito a mano, bastaba que alguien añadiera una ruta vetada solo en el primer grupo para abrirla en silencio a quince bots.

Por eso `robots.txt` también se genera: las rutas vetadas son una lista, y los dos grupos salen de ella. Un test lee el archivo como lo lee un bot, agrupa por User-agent y exige que los dos grupos tengan exactamente los mismos Disallow.

## Saber si vienen

Lo último fue medir, porque optimizar algo que no se ve es fe. Hay dos señales distintas: bots que leen el sitio, y personas que llegan desde un asistente.

Los bots se cuentan en el middleware con una expresión regular en memoria, como el sensor del SIEM, y la escritura no se espera. Aquí hay un límite que conviene decir: las notas y la página de precios están prerenderizadas, el CDN las sirve sin pasar por el servidor, y ahí el middleware no ve nada. El conteo de bots es un piso, no un total. Por eso `llms.txt` y `llms-full.txt` se sirven por SSR: que un agente venga a leer el mapa es la señal que más importa, y esa sí se cuenta.

Las personas se cuentan en el navegador, que sí corre en cualquier página. ChatGPT y Perplexity marcan sus enlaces con `utm_source`; los demás se reconocen por el host del referrer. El navegador manda solo el id del asistente, una vez por sesión, y el servidor acepta únicamente ids de una lista fija.

Todo va a un contador por día y fuente, sin IP ni User-Agent. El panel lee 30 días en unas decenas de filas, que en una base que cobra por filas leídas es la diferencia entre una página barata y una cara.

## Lo que esto no resuelve

Ningún archivo hace que un asistente te recomiende. Los modelos citan lo que otros sitios confirman: un directorio de empresas, un perfil de negocio en Google, un artículo publicado en otra parte que enlace aquí. Esta parte técnica asegura que, cuando un asistente llegue, encuentre datos correctos y no un archivo de julio. Que llegue sigue dependiendo de lo mismo de siempre: publicar cosas que respondan preguntas reales y que otros las enlacen.
