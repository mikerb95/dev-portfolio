---
title: Dos logins en el mismo sitio, y ninguno conoce al otro
description: "Mi panel de admin ya tenía autenticación resuelta con OAuth y JWT. Cuando construí el portal de clientes, la decisión difícil no fue cómo autenticarlos: fue no reutilizar nada de lo que ya funcionaba."
date: 2026-07-24
tags: [seguridad, auth, arquitectura, astro]
---

El panel de administración de este sitio se autentica con OAuth de GitHub, una allowlist de un solo nombre y un JWT de Auth.js. Funciona, está probado y lleva meses en producción. Cuando construí el portal de clientes —donde cada cliente entra a ver sus facturas, sus documentos y el avance de su proyecto— lo obvio era colgarme de esa infraestructura: mismo `auth-astro`, otro provider, un campo de rol en el token y listo.

No lo hice. El portal tiene su propio login, su propia cookie, su propia tabla de sesiones y cero líneas compartidas con el admin.

## Dos poblaciones, dos superficies de riesgo

El motivo no es purismo arquitectónico, es aritmética de fallos.

El admin tiene exactamente un usuario: yo. La autorización es una allowlist de logins de GitHub revalidada en cada request. El portal tiene N usuarios que no controlo, que se registran por invitación, que eligen su propia contraseña y que, por diseño, están **legítimamente autenticados** mientras navegan.

Si ambos comparten el mismo mecanismo de sesión, aparece una clase de bug que en sistemas separados no existe: que una sesión de cliente se convierta en una de admin. No hace falta un ataque sofisticado — basta un callback que asigna mal un claim, una comparación de rol que devuelve `undefined` en vez de `false`, un refactor que mueve una verificación de sitio. En un sistema unificado esos errores son escalada de privilegios. En dos sistemas separados son, en el peor caso, una sesión rota.

La cookie también es otra (`portal_session`, no la de Auth.js), así que ni siquiera viajan juntas en el mismo request. Un bug de manejo de cookies en un sistema no puede tocar al otro porque no las ve.

## Token opaco, no JWT

En el admin, la sesión *es* el JWT: el token lleva la identidad firmada dentro y el servidor no guarda nada. Es cómodo y tiene un punto ciego que ya conté [en otro artículo](/notes/sesiones-revocables-sobre-jwt-stateless): revocar no es inmediato, porque el token sigue siendo criptográficamente válido hasta que expire. Le añadí una capa de revocación por `sid`, pero la naturaleza del JWT sigue ahí.

Para el portal invertí el diseño. El token es **opaco**: 256 bits de aleatoriedad sin significado alguno. La identidad vive en la base de datos, y en la base **solo se guarda el sha-256 del token**, nunca el token.

Eso compra dos cosas concretas:

- Un volcado de la tabla `portal_sessions` no permite suplantar a nadie. Quien se lleve la tabla se lleva hashes; el token en claro solo existe en el navegador del cliente.
- Revocar es un `UPDATE`. Efecto inmediato, sin ventana, sin esperar a que nada expire. Cerrar sesión en un dispositivo, o cortar el acceso a un usuario que ya no trabaja en la empresa del cliente, funciona en el siguiente request.

El precio es honesto: cada request del portal cuesta una consulta a la base, cosa que el JWT no cobraba. Lo asumí, y lo abarataré más abajo.

## Nada se cachea en la cookie

La consulta que resuelve la sesión no lee solo la fila de sesión: hace `JOIN` con el usuario y con el cliente, y verifica en el mismo golpe que la sesión no esté revocada ni vencida, que el usuario siga activo y que el cliente siga con el portal habilitado.

Podría haber metido ese estado en la cookie al hacer login y ahorrarme el `JOIN`. No lo hice a propósito: si el estado viaja en la cookie, deshabilitar un usuario no tiene efecto hasta que su sesión caduque. Quiero que apagar el portal de un cliente sea instantáneo, no una promesa a 30 días.

La renovación es deslizante —cada uso empuja la expiración, cómodo para un cliente que entra una vez al mes a mirar una factura— pero con un throttle de cinco minutos sobre la escritura. Sin él, cada carga de página sería un `UPDATE`. Con él, la mayoría de los requests solo leen.

## Fuerza bruta: dos capas que no se solapan

El middleware ya limita por IP las rutas de autenticación, incluidas las del portal. No basta.

Un atacante distribuido cambia de IP cuando quiera; lo que no puede evitar es que los fallos se acumulen **contra la cuenta**. Así que el login del portal lleva su propio contador por usuario: diez intentos fallidos y la cuenta se bloquea quince minutos. Diez es holgado para un humano que duda de su contraseña y ridículo para un diccionario.

Las dos capas se complementan porque miden cosas distintas: una, el volumen desde un origen; la otra, la presión sobre un objetivo. Y hacia fuera, **todos los fallos son el mismo fallo**: nada en la respuesta permite distinguir "esa cuenta no existe" de "existe pero la contraseña está mal". Un mensaje distinto convierte el login en un enumerador de clientes.

Las contraseñas van con scrypt de la biblioteca estándar de Node, sin dependencias nativas que compliquen el build en Vercel, con N=2^15 y r=8 (~32 MB y ~100 ms por hash). El hash guardado lleva sus propios parámetros embebidos, así que puedo endurecerlos el día que haga falta y los hashes viejos siguen verificando: se re-hashean al vuelo en el siguiente login correcto.

## Lo que casi se me escapa

Desde `/admin` puedo entrar al portal "como" un cliente para dar soporte. Es útil y es peligroso: una sesión de impersonación tiene que ser de solo lectura, porque escribir en nombre de otro con su propia interfaz es indistinguible de que lo haya hecho él.

El corte era simple: si la sesión está impersonada, cualquier método que no sea `GET` o `HEAD` responde 403. Lo puse en el middleware, cubriendo `/api/portal/*`, y me pareció terminado.

No lo estaba. El simulador de pago vive en `/api/payments/mock/pay` — **fuera** del prefijo del portal, porque es infraestructura compartida con la pasarela pública. Mi guard no lo veía. Era, literalmente, el único mutador que un admin impersonando podía alcanzar, y estaba justo en el sitio donde más duele.

La lección no es "revisa los prefijos". Es que **un guard basado en la forma de la URL es tan bueno como el mapa mental que tenías el día que lo escribiste**, y ese mapa envejece en cuanto una ruta compartida entra en escena. Ahora hay dos cortes: el del prefijo y uno explícito en esa ruta concreta. Redundante a propósito.

La única excepción al bloqueo es salir (`POST /api/portal/logout`). Bloquearlo dejaría al admin atrapado en la vista del cliente sin más salida que borrar la cookie a mano — y salir no escribe sobre los datos del cliente, solo revoca la propia fila de sesión.

## Lo que aún no está

El portal no se actualiza solo. Un cliente con la pestaña abierta no ve la respuesta a su mensaje ni que su monitor se cayó hasta que recarga. El dato *es* de tiempo real; la interfaz todavía no. La decisión ya está tomada —polling de un digest barato, no SSE ni WebSockets, porque sin pub/sub en la base el servidor tendría que sondear igual y encima pagaría la conexión abierta— pero está sin construir.

Prefiero decirlo así que fingir que el portal está terminado. Lo que sí está terminado es la parte que, si falla, no se arregla con un deploy: la que decide quién ve qué.
