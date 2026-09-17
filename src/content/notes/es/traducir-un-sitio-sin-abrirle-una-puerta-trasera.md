---
title: Traducir un sitio sin abrirle una puerta trasera
description: "Poner el sitio en inglés parecía trabajo de redacción. Lo que descubrí al planearlo es que un prefijo de idioma le da un segundo nombre a cada ruta, y que todos mis guardas de seguridad autorizan comparando nombres."
date: 2026-09-16
tags: [seguridad, i18n, arquitectura, astro]
lang: es
translationOf: translating-a-site-without-opening-a-back-door
---

Traducir el sitio al inglés empezó como una tarea de contenido: extraer los textos a diccionarios, montar las rutas bajo `/en/` y ponerse a escribir. El plan se torció en la primera hora, antes de traducir una sola frase, cuando fui a mirar cómo clasificaba las rutas el middleware.

Porque un prefijo de idioma no añade páginas. **Añade un segundo nombre para cada página que ya existe.** Y toda mi autorización estaba escrita comparando nombres.

## El guarda no compara lo que uno cree

En este repo hay una docena de funciones que reciben un pathname y devuelven un booleano. Deciden cosas serias:

- Si la ruta está vetada en la demo pública (la bóveda de credenciales, las variables de entorno).
- Si es un login, que lleva un rate limit estrecho para que no se pueda hacer fuerza bruta.
- Si es un link de cobro, limitado a 30 por minuto.
- Si entra en el paraguas global de rate limiting.
- Si es del panel de admin y exige sesión con allowlist.
- Si es del portal de clientes.

Todas comparan contra rutas literales: `/admin`, `/portal`, `/api/portal/login`. Ninguna sabe nada de idiomas, y no tienen por qué: se escribieron cuando el sitio tenía un solo juego de URLs.

El día que existe `/en/`, `isDemoBlockedPath('/en/admin/backup')` devuelve `false`. No falla, no lanza, no registra nada raro. Contesta con toda tranquilidad que esa ruta no está vetada, porque es verdad: `/en/admin/backup` no está en su lista. Lo que está en su lista es `/admin/backup`.

Ese es el fallo entero, y es de los que no se ven: un veto que se convierte en un permiso sin que nadie escriba una línea de código nueva.

## Lo que se rompe no es cosmético

Vale la pena separar los dos tipos de daño, porque tienen urgencias distintas.

Un enlace que apunta a una página en inglés que no existe es un 404. Molesto, se arregla, no le pasa nada a nadie.

Un guarda ciego al prefijo es otra cosa. El login sin su rate limit estrecho es fuerza bruta viable. La demo pública sin sus rutas vetadas es la bóveda de secretos servida a cualquiera que sepa escribir tres letras antes de la ruta. El gate de admin ciego sería, directamente, el panel abierto.

Por eso esto no fue una fase del plan de traducción. Fue la Fase 0, la que bloquea a todas las demás: **mientras no estuviera resuelto, cada página nueva en inglés era una puerta trasera potencial.**

## Normalizar una sola vez, arriba del todo

El arreglo cabe en una línea, y su valor está en dónde vive esa línea:

```
const canonicalPath = delocalizePath(pathname)
```

A partir de ahí, ningún guarda del middleware vuelve a ver el pathname crudo. Todos reciben la ruta canónica, la misma que tendría en español. `/notes` y `/en/notes` reciben trato idéntico porque, para efectos de seguridad, **son la misma ruta con dos nombres**.

La regla que lo sostiene es que la normalización ocurra una sola vez y lo más arriba posible. Normalizar dentro de cada guarda habría sido peor que no normalizar: doce lugares donde acordarse, y el guarda número trece, escrito dentro de seis meses por alguien con prisa, no se acuerda.

## Las rutas privadas no se normalizan: se cortan

Normalizar resuelve el problema de clasificación, pero deja una pregunta abierta: ¿qué debería *pasar* con `/en/admin`?

La respuesta es que esa URL no debe existir nunca. El panel no es contenido traducible, y tampoco lo son la API, el portal, los cobros ni los tres gates de login. Así que antes de normalizar nada, el middleware corta:

```
if (isLocalizedPrivateRequest(pathname)) return new Response('Not Found', { status: 404 })
```

Un 404 seco, y va **antes que todo lo demás**: antes del redirect al dominio canónico, antes del chaos engineering del laboratorio, antes del sensor de seguridad. No hay ningún escenario en el que esa combinación deba ejecutar código.

Podría haber redirigido `/en/admin` a `/admin`, que es lo que hago con las páginas públicas todavía sin traducir. Sería un error: un redirect confirma que la ruta existe, y me obligaría a pasear un request hostil por media cadena de middleware para acabar en el mismo sitio. Para lo privado, la respuesta correcta es la que no dice nada.

Las públicas sin traducir sí se redirigen, con un detalle: **302, no 308**. La página va a existir en inglés algún día, y un permanente cacheado en el navegador y en los buscadores sería un regalo envenenado de mi yo de hoy a mi yo de dentro de tres meses.

## El prefijo no se quita con un `slice`

La función que normaliza es de tres líneas y aun así es la parte que más tests tiene, porque recortar un prefijo es justo el tipo de operación que parece trivial y se come casos.

La versión ingenua (`pathname.startsWith('/en')` y un `slice(3)`) convierte `/entrar` en `trar` y `/enterprise` en `terprise`. Lo segundo es un 404 raro. Lo primero es peor: `/entrar` es uno de mis gates de login, así que la operación que pretendía neutralizar el prefijo acaba de esconder un login de los guardas que lo vigilaban.

Por eso el prefijo se reconoce con un ancla y un límite de segmento (`/^\/(en)(\/|$)/`), y por eso los casos de prueba son adversariales antes que felices: `/en//admin` con el doble slash, `/EN/admin` en mayúsculas, `/en` a secas, y `/english/algo`, que no debe tocarse.

Con `/EN/admin` la decisión fue dejarlo caer: el prefijo es sensible a mayúsculas, como el sistema de archivos, así que esa URL no es "el panel en inglés", es una ruta que no existe. Nunca llega a un guarda porque nunca llega a una página.

## El test que afirma la vulnerabilidad

La red que sostiene todo esto son dos tests, y el segundo es el que más me gusta.

El primero es de paridad: recorre cada guarda del repo contra una lista de rutas reales y afirma que el veredicto de `/x` y el de `/en/x` normalizado coinciden. Es aburrido y es el que tiene que seguir en verde.

El segundo hace lo contrario. Afirma que el guarda **sí es ciego**:

```
expect(isDemoBlockedPath('/en/admin/backup')).toBe(false)
expect(isDemoBlockedPath(delocalizePath('/en/admin/backup'))).toBe(true)
```

Escrito así parece que estoy certificando un bug. Lo que estoy haciendo es fijar por escrito de dónde viene la seguridad: no del guarda, sino de la normalización que ocurre antes. Si alguien arreglara el guarda "por las buenas", añadiéndole conocimiento de idiomas, este test se pondría rojo y obligaría a leer el comentario de arriba. Y si alguien quita la normalización del middleware, el primer test cae.

Un test que documenta por qué algo es frágil vale más que uno que finge que no lo es.

## Lo que me llevo

El prefijo de idioma no tiene nada de especial. Cualquier capa que reescriba URLs crea alias: un prefijo de tenant, una versión de API, una barra final opcional, mayúsculas, una codificación porcentual. Todas producen el mismo patrón - el mismo recurso con varios nombres - y todas hacen daño en el mismo sitio, que es cualquier decisión de autorización tomada comparando cadenas.

La regla que saqué, y que me aplico ya fuera de la i18n, es corta: **si autorizas por el nombre de una ruta, canonicaliza antes, hazlo en un solo lugar, y que ese lugar esté por encima de todo lo que decide.**

Lo caro no fue implementarlo. Fue darme cuenta a tiempo de que traducir un sitio es, técnicamente, duplicarle el espacio de nombres.
