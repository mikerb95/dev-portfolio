---
title: El clientId nunca viene de la URL
description: Construí un portal donde cada cliente ve sus proyectos, sus facturas y sus documentos. El riesgo número uno no era que alguien entrara sin permiso: era que alguien entrara con el suyo y viera lo de otro.
date: 2026-07-24
tags: [seguridad, multi-tenant, arquitectura, astro]
---

Un portal de clientes tiene una superficie de ataque incómoda: casi todo el que lo usa está **legítimamente autenticado**. El login puede ser perfecto — contraseñas con scrypt, sesiones revocables, rate limiting — y aun así basta un `WHERE` mal escrito para que una empresa vea la factura de otra. Ese fallo no dispara ninguna alarma de seguridad, porque desde fuera parece una consulta normal de un usuario normal.

Así que el diseño entero gira alrededor de una regla sola.

## La regla

**El identificador del cliente sale siempre de la sesión. Nunca de la URL, nunca del body, nunca de un campo oculto.**

Hay un único helper que resuelve cookie → sesión → usuario → empresa → rol, y es la única puerta por la que ese identificador puede entrar al código. Ningún endpoint lo acepta como parámetro. No es que esté validado: es que **no existe la forma de pasarlo**.

Suena obvio escrito así. Deja de serlo en cuanto llega la segunda pantalla y alguien necesita `/facturas/482`. Ese `482` sí viene de la URL — y ahí es donde empieza el trabajo real.

## Defensa en profundidad, o por qué el filtro va dos veces

Cuando pido los hitos de un proyecto, el `WHERE` lleva el id del proyecto **y** el del cliente, aunque el id del proyecto ya sea suficiente para encontrar la fila:

```
where projectId = ? and projects.clientId = ?
```

El segundo filtro es redundante en el camino feliz. No lo es en el camino donde alguien cambia el número de la URL. Sin él, la consulta encuentra el proyecto de otra empresa y lo devuelve encantada, porque el gate de sesión ya dijo que sí — el gate contesta "hay sesión", que es una pregunta distinta de "estos datos son suyos".

La consecuencia práctica es que **la seguridad no vive en el middleware**. El middleware dice quién eres; cada consulta decide qué es tuyo. Un gate que se salta no debería poder mostrar nada.

## 404, no 403

Cuando pides un recurso que existe pero es de otro, la respuesta es **404, no 403**.

Un 403 confirma que el recurso existe. Recorriendo `/facturas/1`, `/facturas/2`, `/facturas/3`, un 403 dibuja el mapa: cuántos clientes hay, cuántas facturas emito, cuándo empecé. Cada respuesta "no puedes ver esto" es una respuesta.

Con 404 uniforme, un recurso ajeno y uno inexistente son indistinguibles. Es la misma lógica que usa el formulario de recuperar contraseña, que responde lo mismo exista o no la cuenta: si dijera "ese correo no está registrado", sería una herramienta para averiguar quiénes son mis clientes.

## Tres logins que no se conocen

En el mismo dominio conviven tres sistemas de autenticación, y **ninguno comparte cookie, tabla ni código** con los otros:

- El **panel de admin**, con OAuth de GitHub y una allowlist revalidada en cada request.
- El **portal de clientes**, con email y contraseña, cookie propia y sesiones en su propia tabla.
- La **demo pública**, con un pase firmado de vida corta y sin login.

Reutilizar el sistema del admin para los clientes habría sido menos código. También habría significado que un bug en un callback de OAuth pudiera, en el peor caso, convertir una sesión de cliente en una de administrador. Son dos poblaciones con dos perfiles de riesgo distintos: los mantengo separados a nivel de cookie para que ni siquiera viajen juntas en la misma petición.

Las sesiones del portal son opacas: 256 bits de aleatoriedad de los que la base solo guarda el sha-256. Un volcado de la tabla de sesiones no permite suplantar a nadie, y revocar es un `UPDATE` con efecto inmediato — sin la ventana de "el token sigue siendo válido hasta que expire".

## El detalle que casi se me escapa

Puedo entrar al portal de un cliente para ver exactamente lo que él ve. Es utilísimo para soporte y es peligrosísimo: son datos reales, y una acción mía desde ahí quedaría registrada como suya.

Esa sesión nace marcada, y el middleware la vuelve de solo lectura: cualquier método que no sea `GET` recibe un 403.

El problema es que ese corte cubría las rutas del portal, y la pasarela de pago **no vive ahí** — es infraestructura compartida con el cobro público, en otro prefijo. Un administrador viendo el portal como cliente podía alcanzar el único mutador que todo el resto del código bloqueaba.

Es el fallo típico de las listas por prefijo: proteges un espacio de nombres y la excepción está fuera de él. La solución fue un segundo corte explícito en esa ruta concreta, y la lección es más general — **cada vez que la autorización se apoya en "las rutas que empiezan por", hay que ir a buscar qué quedó fuera**. Casi siempre hay algo.

## Lo que lo mantiene honesto

Nada de esto sirve si se erosiona con el tiempo. Lo que lo sostiene son los tests que intentan romperlo: una sesión perfectamente válida pidiendo recursos de otra empresa, y una comprobación de que recibe vacío o 404, nunca datos. Es la clase de test que no falla nunca hasta el día que alguien añade un endpoint nuevo con un `WHERE` de menos.

Ese día es exactamente para lo que está.
