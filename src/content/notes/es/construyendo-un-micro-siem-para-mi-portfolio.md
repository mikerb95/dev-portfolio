---
title: Construyendo un micro-SIEM para mi portfolio
description: Los scanners atacan cualquier sitio con IP pública, incluido este. En vez de ignorar el ruido, construí un motor propio que lo detecta, lo clasifica, lo bloquea y lo muestra en público.
date: 2026-07-10
tags: [seguridad, observabilidad, sre]
---

Cualquier sitio con una IP pública recibe tráfico hostil desde el primer minuto, portfolio personal incluido. Scanners automáticos prueban `/wp-login.php`, `/.env`, `/.git/config`, inyecciones en cada parámetro de query — no porque te hayan elegido, sino porque escanean internet entero y tú simplemente estás en el rango. La reacción normal es ignorarlo: son 404, no rompen nada, ¿para qué mirar?

Porque esos 404 son información. Qué te sondean, con qué frecuencia, desde dónde, con qué herramientas — eso es la superficie de ataque real de tu sitio, y descartarla es tirar una señal gratis. Así que construí un motor propio de observabilidad de seguridad: en la industria esto vive en un SIEM (Security Information & Event Management); aquí es una versión a escala de portfolio, pero con los mismos principios.

## Un clasificador, no una lista negra

El corazón es una función pura: recibe método, ruta, query y user-agent, y devuelve una categoría alineada con OWASP Top 10 si el request matchea alguna firma — reconocimiento de CMS, búsqueda de secretos, path traversal, inyección, bots ofensivos conocidos por su user-agent. Si no matchea nada, devuelve `null` y el request sigue su camino sin fricción.

La decisión de diseño que más pesó fue la contraria a la intuitiva: **preferir falsos negativos a falsos positivos**. Es tentador escribir reglas agresivas que detecten todo, pero una regla demasiado amplia acaba clasificando tráfico legítimo como ataque, y un sitio que se defiende de sus propios visitantes es peor que uno sin defensa. Cada regla es conservadora a propósito, y las 58 pruebas del clasificador dedican más casos a confirmar qué *no* debe dispararse que a confirmar qué sí.

## Fail-open, en cada capa

Si algo he aprendido escribiendo [el motor de chaos engineering](/notes/chaos-engineering-que-no-puede-hacerte-dano) de este mismo sitio es que un sistema de defensa nunca puede convertirse en el incidente. Aplica el mismo principio aquí, en cada punto:

- Si registrar un evento falla, el request sigue — nunca se espera la escritura para responder.
- Si la base de datos no responde al consultar la lista de bloqueo, se **permite** el request, no se bloquea.
- Si el detector de anomalías lanza una excepción, el cron sigue con la purga y el auto-block; no aborta todo el pipeline por un fallo aislado.

Un sensor de seguridad que puede tumbar el sitio que protege no es un sensor, es una superficie de ataque nueva.

## Ráfagas sin inflar la base de datos

Un scanner típico prueba cientos de rutas en segundos, todas desde la misma IP. Escribir una fila por request bajo ese patrón amplificaría el propio ataque: cuantas más rutas prueben, más escrituras genera mi base de datos. La solución fue deduplicar ráfagas idénticas (misma IP, misma regla, ventana de un segundo) en una sola fila que acumula un contador de repeticiones. El coste de un scan de 500 rutas pasa de 500 inserts a, en el peor caso, unas pocas decenas.

## Honeypots: la única señal sin ambigüedad

Casi toda la clasificación de amenazas es probabilística — una firma sugiere intención maliciosa, no la prueba. Los endpoints señuelo son la excepción. Rutas como un login de WordPress falso no existen en el sitio real y ningún usuario legítimo tiene motivo para tocarlas; `robots.txt` incluso le pide a los crawlers que las eviten. Si algo llega ahí, la intención es inequívoca.

Por eso son la única categoría que dispara un bloqueo automático con un solo hit, sin necesitar un umbral de repetición. Sirven además una respuesta falsa plausible tras un retardo de menos de dos segundos — ni tan rápido que delate la trampa, ni tan lento que retenga la conexión más de la cuenta.

## Bloquear sin quedarse sin salida

El auto-block corre en un cron, no en el camino del request — así un ataque no puede forzar escrituras síncronas en el momento más caro. Y cada bloqueo tiene TTL obligatorio con escalado por reincidencia: una hora la primera vez, un día la segunda, una semana de ahí en adelante. Nunca eterno por defecto, porque un bloqueo permanente mal aplicado es un error que se corrige solo con una intervención manual, y ese es exactamente el tipo de fallo silencioso que prefiero no tener que descubrir por accidente.

## Anomalías con estadística que se puede explicar

Para detectar patrones fuera de lo normal usé z-score sobre una baseline de 30 días de la misma hora del día, no un modelo entrenado. Es deliberado: en una conversación técnica puedo explicar exactamente por qué algo se marcó como anómalo — "40 eventos de inyección contra una media histórica de 2, con una desviación de 47 sobre la media" es una frase completa, no una caja negra. Con anti-fatiga incluido: una anomalía del mismo tipo no vuelve a alertar mientras haya una abierta sin reconocer, para que el cron horario no termine entrenándome a ignorar sus propias alertas — el mismo error que ya evité con [las transiciones de estado del monitor de uptime](/notes/por-que-construi-mi-propio-monitor).

## Lo que se muestra en público, y lo que no

La [página de seguridad](/security) expone agregados reales — cuántos intentos se detectaron este mes, desglose por categoría OWASP, origen geográfico, tendencia de 14 días — porque mostrar el nivel real de instrumentación es parte del punto. Pero hay una línea que no cruzo: nunca IPs completas, nunca el nombre exacto de una regla, nunca la lista de qué rutas son señuelo. Publicar el manual de juego completo le regala información al próximo atacante a cambio de nada. La vitrina demuestra que el sistema existe y funciona; no necesita enseñar cómo evadirlo.

Ese equilibrio — evidencia verificable sin manual de ataque — es, en el fondo, la misma idea detrás de todo lo que documento en público en este sitio: lo que ves es real, pero lo que necesitas para operar con seguridad nunca es lo mismo que lo que necesitas para atacarla.
