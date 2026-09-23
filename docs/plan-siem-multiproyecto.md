# Plan: micro-SIEM multiproyecto (sensor portable e ingesta de eventos)

Plan vivo. Se actualiza al implementar: fases marcadas ✅ y decisiones nuevas
documentadas aquí, no en un documento aparte.

Continúa `docs/plan-security-observability.md` (Fases 0-6, implementadas entre
el 9 y el 10 de julio de 2026), que construyó el micro-SIEM para **este** sitio.
Este plan lo abre a los demás proyectos sin mover la factura de Vercel.

## 1. El problema

El micro-SIEM actual solo ve `codebymike.net`, y lo ve por dos puertas, las dos
dentro de este runtime:

- `observeRequest(...)` en `src/middleware.ts:170`, que únicamente alcanza
  peticiones que ya llegaron a esta función de Vercel.
- Trece llamadas directas a `recordSecurityEvent` repartidas en doce endpoints
  propios (login del portal, cobros, cuentas de cobro, capacitación, sesiones de
  presentación, informe CSP, `/api/computo/ingest`).

No existe ninguna entrada de eventos externos. Las tablas lo confirman:
`security_events`, `security_rollups`, `security_anomalies` y `blocked_ips` no
tienen columna de proyecto, así que toda fila es implícitamente este sitio.

Lo que se pierde por eso no es cosmético. Una IP que sondea `/wp-login.php` en
un sitio de cliente y luego viene aquí llega **como desconocida**, aunque ya se
haya delatado hace una hora. El honeypot solo defiende la superficie donde está
plantado, y el valor de un honeypot crece con el número de superficies que
comparten la misma lista.

## 2. Estado auditado (22-23 sep 2026)

El reparto de responsabilidades ya está hecho para esto. Lo que está atado a
este sitio es la recolección, no el motor de firmas:

| Módulo | Acoplamiento a este sitio | ¿Sirve tal cual? |
| --- | --- | --- |
| `security/classify.ts` | Ninguno. Puro, sin `node:crypto` ni `../db` | Sí, incluso en el navegador |
| `security/anomaly.ts`, parte pura de `rollup.ts` | Ninguno | Sí |
| `security/events.ts`, `blocklist.ts`, `ratelimit-durable.ts` | Escriben en el `db` global | Necesitan `projectId` |
| `security/sensor.ts` | Lee cabeceras que pone Vercel (`x-vercel-ip-country`, `x-vercel-ip-as-number`) | Parcial |
| `security/honeypot.ts`, `src/middleware.ts` | Total | No |

El clasificador, que es la parte con valor, ya es portable. Fue escrito puro
para poder probarlo con Vitest (`tests/security-classify.test.ts`), y esa
decisión es la que ahora permite sacarlo del repo sin tocarlo.

### Hallazgo: el sensor puede estar perdiendo eventos

`observeRequest` acepta un `waitUntil` opcional y documenta para qué sirve
(`src/lib/security/sensor.ts:29-34`), pero el middleware lo llama sin él
(`src/middleware.ts:170`), así que la escritura queda en `void promise`. Con
Fluid Compute la instancia suele sobrevivir a la respuesta y en la práctica casi
siempre completa, pero no está garantizado: se pueden estar perdiendo eventos
justo en los picos, que es cuando importan.

La vía no es la que parecía. El entrypoint serverless de `@astrojs/vercel` v11
construye `locals` solo desde la cabecera `x-astro-locals`, y el
`ctx.locals.waitUntil` que menciona el paquete pertenece a la ruta de edge
middleware, deprecada. El camino real es `waitUntil` de `@vercel/functions`, ya
presente como dependencia transitiva, que resuelve
`globalThis[Symbol.for('@vercel/request-context')]?.get?.() ?? {}`: **fuera de
Vercel es un no-op silencioso**, así que en `npm run dev`, en Vitest y en
Playwright no cambia nada. Requiere subirlo a dependencia directa.

Se arregla **antes** de montar nada encima. Un colector que pierde filas bajo
carga falsea las baselines de anomalías, y todo lo que se construya después
hereda ese error sin que se note.

## 3. La decisión: clasificar en el origen

El cambio de forma es que **el clasificador se muda al proyecto vigilado y aquí
solo llega el veredicto ya agregado**.

```
Hoy:    petición → middleware de ESTE sitio → classify → recordSecurityEvent → Turso

Plan:   petición → middleware del proyecto X → classify (copia local, pura)
                                             → agrega en memoria 10 min
                                             → 1 POST firmado → /api/security/ingest → Turso
```

La alternativa obvia, y la equivocada, sería proxyear el tráfico de los otros
proyectos a través de este sitio. Eso convierte cada petición ajena en una
invocación propia y multiplica el consumo por el tráfico agregado de todos.

### Por qué esto no mueve la cuota de Vercel

El equipo está en plan **Hobby**, que no factura excedente sino que **corta**:
4 h de CPU activa, 360 GB-h de memoria, 1 M de invocaciones, 100 GB de
transferencia y 10 GB de transferencia de origen al mes, **por cuenta**, con
todos los proyectos compartiendo la misma bolsa (catálogo `VERCEL` de
`src/lib/infra-stack.ts`; ver `docs/plan-computo-clientes.md` §1). El riesgo no
es una factura: es que un proyecto vigilado agote la cuota y se apaguen todos,
codebymike.net incluido.

Cuatro propiedades mantienen el consumo plano:

1. **El trabajo caro corre donde ya está el tráfico.** Clasificar la petición
   del proyecto X en el runtime del proyecto X no añade una sola invocación: esa
   petición ya existía y ya pagaba su función. Añadirle diez expresiones
   regulares es ruido estadístico frente a renderizar la respuesta.
2. **Se agrega antes de enviar, no después de recibir.** Un escaneo de 500 rutas
   desde una IP produce **una fila**, no 500, porque el dedupe por
   `(ip, ruleId)` de `events.ts` viaja al sensor. Esa lógica ya existe y ya está
   probada.
3. **La cadencia la fija el medidor, no la intuición.** 10 minutos, el mismo
   `intervaloMs` de `instrumentacion/medidor.ts`, y por el motivo que su propio
   comentario explica: cada envío es una invocación del portafolio que sale de
   la misma cuota gratis que se quiere proteger. Son ~4.300 invocaciones al mes
   por instancia siempre ocupada, un 0,4 % del millón. A un minuto serían diez
   veces más. **El sensor comparte instancia y cadencia con el medidor cuando
   ambos están instalados**, así que dos sistemas de telemetría cuestan un solo
   envío.
4. **El análisis pesado sigue en el cron externo.** `security-rollup` ya hace
   auto-block, purga, rollups y anomalías en **una invocación por hora**,
   disparada desde cron-job.org y no desde Vercel Cron. Multiproyecto no cambia
   el número de invocaciones, solo el tamaño de las consultas.

### El techo real es Turso, no Vercel

Vercel factura CPU activa; Turso factura **filas escaneadas**. El
`docs/runbook-cuota-turso.md` documenta el mismo patrón agotando la cuota tres
veces: un `count(*)` que devuelve un número había leído 86.000 filas. Con N
proyectos escribiendo en `security_events`, ese incidente se multiplica por N.
Tres reglas, que son las del runbook aplicadas aquí:

- Ninguna consulta de `/admin/security` ni de la vitrina `/security` agrega
  `security_events` sobre ventanas de más de 24 h. Para lo demás están
  `security_rollups`, que ya existen.
- El índice `(project_id, at)` es obligatorio, no una optimización: sin él,
  agregar un proyecto escanea las filas de todos.
- La retención del crudo baja de 90 a **30 días** cuando entre el segundo
  proyecto, y el histórico lo sostienen los rollups. Es el mismo movimiento que
  hizo `monitor_daily` con `monitor_checks`.

## 4. El sensor (`instrumentacion/sensor.ts`)

Archivo único sin dependencias ni imports, que se copia al proyecto vigilado,
hermano de `medidor.ts` y con sus mismas restricciones: TypeScript solo con
sintaxis borrable (nada de enums ni namespaces) para que lo acepten Vite, el
builder de Vercel y el `strip-types` de Node sin configuración.

### Qué lleva dentro

- Una copia de las reglas de `classify.ts`. **Copia, no import**: el proyecto
  vigilado no puede depender de este repo. El riesgo es que las dos copias
  diverjan, y se acota con un test aquí que compara ambos conjuntos de reglas y
  falla cuando se separan (igual que `tests/medidor.test.ts` sostiene el
  contrato del medidor contra `validarLote` y `verificarLote`).
- El dedupe por `(ip, ruleId)` de `events.ts`, con su ventana y su tope de
  claves, que es lo que hace que un escaneo masivo quepa en una fila.
- La cola de reintentos, el manejo de `SIGTERM` y el fail-open del medidor,
  reutilizados sin cambios.

### Qué no lleva

- **Ninguna decisión de bloqueo propia.** El sensor observa y reporta; bloquear
  es competencia de la blocklist compartida (§6), y esa llega por otra vía.
- **Ningún honeypot.** Plantar señuelos en el sitio de un cliente cambia lo que
  su sitio responde, y eso no es observabilidad: es una decisión suya.
- **Ninguna carga útil cruda.** Se envían `path`, `query` y `user-agent`
  truncados con los mismos topes de `buildEventRow`, nunca cuerpos.

### Uso en el proyecto vigilado

Variables de entorno: `SIEM_PROYECTO` (slug) y `SIEM_SECRETO` (se genera en
`/admin/security`, se muestra una sola vez). Opcional `SIEM_ENDPOINT`. Sin
proyecto o sin secreto, no-op silencioso, exactamente como el medidor.

## 5. La ingesta (`POST /api/security/ingest`)

Clon estructural de `/api/computo/ingest`, que ya resolvió este problema:

- Secreto **por proyecto**, cifrado con AES-256-GCM en la bóveda. Filtrar el de
  un cliente no debe permitir inyectar eventos en el panel de otro.
- HMAC-SHA256 sobre `timestamp.cuerpoCrudo` (`lib/computo/firma.ts`), firmando
  el cuerpo crudo y no el objeto parseado porque `JSON.stringify` no garantiza
  el mismo orden de claves en dos runtimes distintos.
- Ventana de frescura de 5 minutos contra replay, y marca de lote para que un
  reintento no cuente dos veces.
- Tope de bytes **antes** de leer el cuerpo: sin él, un lote de 50 MB pasaría
  por el parser antes de descubrir que la firma no valida.
- Comparación en tiempo constante con `timingSafeEqual`.

Hereda también la excepción consciente del cómputo: **la ingesta no es
fail-open**. Un lote con firma inválida se rechaza. Lo que sí es fail-open es
todo lo que ocurre en el proyecto vigilado.

## 6. Alcance de los datos

### Migración aditiva (`0036`)

`project_id` nullable en `security_events`, `security_rollups` y
`security_anomalies`, más el índice `(project_id, at)`. Nullable significa "este
sitio", así que ninguna consulta existente cambia de comportamiento ni de
resultado. Revisar el SQL generado antes de aplicarlo: en combinaciones de
añadir columnas y cambiar nullable, drizzle-kit puede generar un
`INSERT...SELECT` que referencia columnas nuevas en la tabla vieja.

### `blocked_ips` se queda global, y eso es la funcionalidad

Su clave primaria es `ip`, y así se queda. Que una IP delatada en un proyecto
quede bloqueada en los demás no es un efecto colateral: es la razón de ser del
sistema.

Con un límite deliberado: **solo se propagan entre proyectos las categorías
`honeypot` y `critical`**, donde la tasa de falso positivo es cero por diseño
porque nadie legítimo pide `/wp-login.php`. Un `recon_cms` en un sitio no debe
dejar sin servicio a un usuario de otro. Las salvaguardas ya existentes siguen
aplicando: TTL obligatorio con escalado 1h → 24h → 7d, y `SECURITY_IP_ALLOWLIST`
leída con `serverEnv()` desde el incidente del 10 de septiembre de 2026, cuando
un bloqueo masivo se llevó por delante la IP del admin porque la allowlist se
leía de una sola fuente y en producción quedaba vacía.

## 7. Decisión abierta: cómo llega la blocklist a los proyectos

Para que un proyecto vigilado **bloquee** y no solo observe, necesita la lista.
Y aquí hay un conflicto real con las reglas del repo.

Preguntar por petición ("¿esta IP está bloqueada?") multiplica las invocaciones
por el tráfico de todos los proyectos, que es justo lo que este plan evita. Lo
que escala es un `GET` del snapshot completo con `Cache-Control: s-maxage=60` y
`ETag`: diez sensores tirando cada minuto colapsan en ~1 acierto de origen por
minuto y por región, y el resto lo sirve el CDN. El sensor se guarda el conjunto
en memoria y consulta contra él sin red, igual que hace `blocklist.ts` aquí con
su caché de 30 s.

El problema es que eso publica IPs completas, y la regla de OPSEC del repo dice
lo contrario para cualquier ruta pública. Y firmarlo con HMAC lo saca del CDN,
que era el punto.

Salida posible, **pendiente de decidir**: servir `ip_hash` en vez de `ip`,
columna que ya existe en `security_events`, y que el sensor hashee la IP
entrante y compare hashes. Conserva la cacheabilidad y la OPSEC a la vez. El
precio es repartir `SECURITY_IP_SALT` entre los proyectos, lo que debilita el
hash frente a un atacante que obtenga la sal de cualquiera de ellos. Mientras no
se decida, **los proyectos vigilados solo observan**, que ya es la mayor parte
del valor.

## 8. Fases

- ✅ **Fase 0** (23 sep 2026): auditoría del alcance actual y de la portabilidad
  módulo por módulo (§2), y este plan.
- **Fase 1**: arreglar el `waitUntil` del sensor (§2). Va primero y sola, porque
  es lo único que cambia comportamiento en producción hoy y conviene poder
  atribuirle cualquier efecto sin ruido de otros cambios.
- **Fase 2**: `instrumentacion/sensor.ts` con su test de contrato contra
  `classify.ts`. Archivo nuevo que no importa nadie de `src/`: no puede afectar
  al build ni al runtime de este sitio.
- **Fase 3**: migración `0036` e índice. Aditiva y sin lectores todavía.
- **Fase 4**: `POST /api/security/ingest`, con tests de firma, de rechazo por
  replay y de punta a punta contra libSQL temporal, siguiendo
  `tests/medidor-ingesta.test.ts`.
- **Fase 5**: alta de proyectos vigilados en `/admin/security` (generar y rotar
  secreto) y filtro por proyecto en el panel. Aquí baja la retención del crudo a
  30 días.
- **Fase 6**: instalar el sensor en un sitio real y contrastar una semana. Sin
  esto, todo lo anterior es teoría.
- **Fase 7** (solo si la 6 muestra que hace falta): distribución de la blocklist,
  con la decisión de §7 ya tomada.
- **Fase 8**: artículo en `src/content/notes/` como caso de estudio, por la regla
  transversal del roadmap.

## 9. Seguridad

- Secreto por proyecto en la bóveda cifrada, mostrado una sola vez. Generarlo o
  rotarlo queda registrado en el micro-SIEM, como el del cómputo.
- La vitrina pública `/security` sigue publicando **solo agregados**: sin IPs
  completas, sin nombres exactos de reglas, sin rutas de honeypot. Añadir
  proyectos no cambia esa regla, y en particular **la vitrina no revela qué
  proyectos están vigilados**: un atacante que sepa qué sitios comparten
  blocklist sabe también dónde probar primero.
- El alta de proyectos es `POST`, así que el modo demo ya la bloquea por método.
- Un proyecto vigilado comprometido puede inyectar eventos falsos en su propio
  alcance. No puede hacerlo en el de otro (secreto por proyecto) ni provocar
  bloqueos ajenos mientras la propagación se limite a `honeypot` y `critical`
  y el auto-block conserve su tope con aviso de desbordamiento.

## 10. Dudas abiertas

- La decisión de §7 sobre la blocklist.
- Cuánto se desvía la clasificación hecha en el origen de la que haría el
  middleware de aquí. El sensor no ve las cabeceras `x-vercel-ip-*` si el
  proyecto no está en Vercel, así que `country` y `asn` pueden llegar vacíos y
  las anomalías geográficas quedarían ciegas para esos proyectos.
- Si conviene que el sensor reporte también peticiones **limpias** en forma de
  contador agregado. Sin denominador, "50 ataques" no dice si es mucho o poco,
  pero añadir el contador significa tocar el camino de toda petición y no solo
  el de las hostiles.
- Qué pasa con un proyecto que no corra JavaScript (un WordPress, un estático).
  El sensor no aplica, y la única vía sin tocar su runtime es enviar registros,
  que es otro diseño.
