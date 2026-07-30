---
title: Tests e2e que prueban lo que de verdad importa
description: Cerrar la pirámide de testing con Playwright sin volverla frágil — bases de datos desechables, un centinela que demuestra el aislamiento de la demo, y por qué cada test necesita su propia IP.
date: 2026-07-16
tags: [testing, playwright, e2e, calidad]
---

Tengo más de 400 tests unitarios sobre la lógica de este sitio: idempotencia de pagos, cálculo de P&L, clasificación de amenazas, detección de anomalías. Todos corren en milisegundos y ninguno abre un navegador. Son excelentes para lo que hacen — y ciegos para lo que no.

Un test unitario verifica que una función devuelve lo correcto. No ve que el middleware deja pasar un request que debería bloquear, que una página revienta en el render del servidor, o que la demo del panel filtra un dato real. Eso vive en la costura entre las piezas, y la única forma de probar la costura es ejercer el sistema entero desde fuera. Para eso son los tests end-to-end.

El problema de los e2e es su fama: lentos, frágiles, esos que el equipo acaba desactivando "hasta que tengamos tiempo de arreglarlos". Casi siempre por las mismas tres razones. Vale la pena diseñar en contra de cada una.

## Los datos de prueba no pueden ser los datos reales

El primer instinto —apuntar los tests a la base de datos de siempre— es también el más peligroso. Estos tests **escriben**: envían el formulario de contacto, crean pagos. Contra la base real eso significa basura acumulada, cuota gastada y, si algo sale mal, datos de verdad tocados.

Así que cada corrida arranca dos bases libsql en archivo, desechables, que se siembran desde cero y se tiran al terminar. Nunca tocan producción. El detalle que importa es *cuándo* se siembran: Playwright levanta el servidor de pruebas **antes** de ejecutar su `globalSetup`, así que sembrar en el setup llega tarde — el servidor arranca contra una base que todavía no existe. La siembra tiene que ser parte del propio arranque del servidor. Es el tipo de cosa que cuesta una tarde de errores confusos y una línea de código entenderlo.

## Un centinela que prueba el aislamiento de verdad

La demo pública de mi panel deja a cualquiera recorrer `/admin` con datos ficticios. Su garantía central es que **nunca** muestra datos reales, porque salen de una base distinta. ¿Cómo se prueba una negación así?

No basta con comprobar que aparecen los datos ficticios: eso no dice nada sobre si además se cuela algo real. La técnica es sembrar la base "real" de prueba con un centinela — un prefijo reconocible en cada nombre, `CENTINELA-REAL`— y luego recorrer todas las páginas de la demo afirmando que ese texto **no aparece por ningún lado**. Si el aislamiento se rompe alguna vez, el centinela aflora en el HTML y el test grita. Se prueba la ausencia haciendo visible lo que debería estar ausente.

## Cada test necesita su propia IP

Este me costó un rato de desconcierto. Los tests empezaron a fallar de forma intermitente, según el orden en que corrían. La causa: el sitio limita peticiones por IP, y toda la suite sale de `localhost`. El test que a propósito satura el límite de envíos —para comprobar que el rate limiting funciona— dejaba el contador agotado, y el siguiente test que enviaba algo se comía el `429` heredado.

La cabecera `x-forwarded-for` lo resuelve: cada test se inventa una IP y la usa en todas sus peticiones. El que prueba el rate limit satura *su* IP; los demás viven en las suyas, aislados. Un test que depende del orden de ejecución no es un test, es una moneda al aire.

## Qué cubren, al final

Cinco archivos, treinta y seis pruebas. Que las páginas públicas rendericen sin errores de consola y con sus cabeceras de seguridad. Que `/admin` esté cerrado a los anónimos por todas las puertas —páginas, APIs, el deck privado—. Que la demo aísle datos, rechace toda escritura y vete las rutas sensibles aunque sean `GET`. Que el formulario de contacto valide y limite. Que un pago con la misma clave de idempotencia devuelva el mismo pago y no cobre dos veces.

Ninguna de esas afirmaciones la puede hacer un test unitario, porque todas viven en la frontera entre las piezas. Corren en cada push, contra bases que nadie extraña, y fallan ruidosamente si alguna costura se abre. Que es exactamente lo que le pido a un test: que me despierte antes que un usuario.
