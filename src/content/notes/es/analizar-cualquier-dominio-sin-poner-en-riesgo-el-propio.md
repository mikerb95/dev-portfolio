---
title: Analizar cualquier dominio sin poner en riesgo el propio
description: Convertir un endpoint de diagnóstico que solo yo podía usar en una herramienta pública para mis compañeros — y por qué eso obliga a resolver primero el abuso y el SSRF, no el análisis en sí.
date: 2026-07-17
tags: [seguridad, ssrf, rate-limiting, accesibilidad, lab]
---

Un compañero de clase pidió algo simple: un lugar donde pegar la URL de su proyecto y ver qué tan bien está armado — cabeceras, TLS, SEO, accesibilidad. Yo ya tenía casi todo eso escrito. Vivía en `src/lib/diagnostics.ts`, detrás del panel de administración, usado solo para diagnosticar mis propios monitores. La tentación fue copiar el endpoint, quitarle el `middleware` de auth y llamarlo terminado. No lo hice, porque ahí es donde empieza el problema real: en cuanto un endpoint acepta una URL arbitraria de un visitante anónimo, deja de ser una herramienta de diagnóstico y pasa a ser una superficie de ataque.

## El endpoint no es el riesgo, ser un proxy sí

La pregunta que importa no es "¿puedo analizar `google.com`?" — eso siempre funcionó. Es "¿qué pasa si alguien pone `169.254.169.254` o una IP `10.x` de mi propia red interna?". Sin nada que lo impida, el servidor con gusto abre esa conexión: hace `fetch`, abre un socket TLS, resuelve DNS — todo desde dentro de mi infraestructura. Eso es SSRF: usar mi servidor como intermediario para sondear redes a las que un atacante no tiene acceso directo. Revisé todo el repo buscando algo que ya filtrara IPs privadas antes de conectar. No había nada — ni en el motor de diagnósticos, ni en el de monitoreo de uptime que hace algo muy similar. Tuve que escribirlo: resolver el hostname, revisar cada IP devuelta contra los rangos reservados (`10.0.0.0/8`, `127.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`, y el resto), y rechazar antes de la primera conexión.

Junto con eso, un límite de 5 análisis por minuto por IP, reutilizando el mismo `enforceLimit` que ya protege el formulario de contacto. Ninguna de las dos cosas hace el análisis "mejor" — solo evitan que la herramienta se convierta en algo que yo no autoricé.

## Decir que no a axe-core, por ahora

Quería que la accesibilidad se revisara con un motor real — el mismo axe-core que ya corre contra mi propio sitio en CI. El problema es que ese scanner necesita un navegador headless de verdad, y hoy solo existe como dependencia de desarrollo, invocado desde GitHub Actions con Playwright instalado explícitamente. Meterlo en una función serverless pública implica empaquetar Chromium (`@sparticuz/chromium`, decenas de megabytes), aceptar cold starts de varios segundos, y acercarse al límite de duración de las funciones del plan gratuito de Vercel — todo eso por cada visitante que pegue una URL.

En vez de eso, la prueba de accesibilidad corre heurísticas sobre el HTML ya descargado: `<img>` sin `alt`, campos de formulario sin `label` ni `aria-label`, ausencia de `<h1>` o de atributo `lang`. Es deliberadamente menos preciso que axe-core, y el resultado lo dice explícitamente en el resumen — "no reemplaza una auditoría axe-core" — porque la peor versión de esta herramienta sería una que finge una auditoría completa y no lo es.

## Reutilizar, no reinventar

De las once pruebas que corre el analizador, ocho ya existían tal cual en `diagnosticSuite()` — disponibilidad, TLS, redirección HTTPS, cabeceras, DNS, vencimiento de dominio, robots.txt, sitemap.xml. Solo hicieron falta tres nuevas (metadatos SEO, rendimiento básico, accesibilidad heurística), y las tres comparten una sola descarga del HTML en vez de pedirlo tres veces al sitio ajeno — algo que vale la pena cuidar cuando el dominio que estás analizando no es el tuyo.

La lección que se repite en este laboratorio: cuando algo ya resuelve el 80% del problema nuevo, la disciplina no es escribir otra versión desde cero — es notar qué le falta y estirarlo ahí exactamente.
