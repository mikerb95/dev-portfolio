# Plan: cómputo por proyecto en Vercel (cuota gratis y cotización)

Plan vivo. Se actualiza al implementar: fases marcadas ✅ y decisiones nuevas
documentadas aquí, no en un documento aparte.

## 1. Decisión del 22 sep 2026

El diseño original (7 sep) era **facturar el cómputo pass-through**: medir lo
que cada proyecto de cliente consume en Vercel y cobrarle costo más margen. Se
reencauzó al confirmar tres hechos:

| Hecho | Fuente, fecha de consulta |
| --- | --- |
| El equipo `codebymike` está en plan **Hobby** y se queda ahí. | `vercel api /v2/teams/...` → `billing.plan = "hobby"`, 22 sep 2026 |
| Hobby **no factura excedente, lo corta**: 4 h de CPU activa, 360 GB-h de memoria, 1 M de invocaciones, 100 GB de transferencia y 10 GB de transferencia de origen al mes, **por cuenta** (todos los proyectos comparten la misma bolsa). | vercel.com/docs/limits/fair-use-guidelines (actualizada 14 sep 2026); catálogo `VERCEL` de `src/lib/infra-stack.ts` |
| En Hobby no hay API de costos: `vercel usage` devuelve `Costs not found (404)` porque no hay cargos. | `vercel usage --group-by project`, 22 sep 2026 |

Consecuencia: en Hobby el cómputo cuesta **cero dólares** hasta el tope y
después tumba el sitio. Cobrar "lo que costó más margen" daría siempre cero.
El riesgo real no es de dinero sino de **disponibilidad compartida**: un
cliente con mucho tráfico agota la cuota y se apagan todos los proyectos de la
cuenta, codebymike.net incluido.

El sistema pasa a responder dos preguntas:

1. **¿Cuánto le cobro a un cliente por hospedarle el sitio?** Una cuota fija
   mensual, cotizada con el simulador (sección 5).
2. **¿Cuánto de la cuota gratis se come cada proyecto y cuándo se agota?**
   Medición propia con avisos antes del tope (secciones 3 y 4).

### Lo que queda fuera del código

Las condiciones de Vercel restringen Hobby a uso personal no comercial, y
definen como comercial "recibir pago por crear, actualizar u hospedar el
sitio". Hospedar sitios de clientes cobrados en esta cuenta es una decisión
del dueño de la cuenta, no del sistema: el panel mide y avisa, no la resuelve.
Si algún día se pasa a Pro, ver la sección 8.

## 2. Estado previo (7 sep 2026) ✅

Construido para el modelo de facturación y reutilizado tal cual:

- `src/lib/computo/calculo.ts`: aritmética pura de consumo a dinero (6
  dimensiones, margen, cuota incluida, mínimo, factor de reconciliación) y
  `usoDesdeEstimacion` para cotizar.
- `src/lib/computo/tarifas.ts`: tarifas bajo demanda de Pro, versionadas por
  fecha. Coinciden con iad1/cle1/pdx1 según vercel.com/docs/functions/usage-and-pricing
  (consultada 22 sep 2026: $0.128 por hora de CPU, $0.0106 por GB-h, $0.60 por
  millón de invocaciones). Varían por región.
- `POST /api/computo/ingest`: lotes firmados con HMAC por proyecto, validados
  (`lote.ts`), con marca de lote para no contar dos veces un reintento.
- `GET /api/cron/computo-rollup`: consolida `compute_usage_hourly` en
  `compute_periods` a diario (06:00 UTC, cron de Vercel).
- Migración `0031` (tablas `compute_*`), aplicada en producción. Al 22 sep las
  cinco tablas estaban vacías y el cron había corrido 14 veces sin datos.

## 3. El medidor (`instrumentacion/medidor.ts`)

Archivo único, sin dependencias ni imports, que se copia al proyecto del
cliente. TypeScript solo con sintaxis borrable, para que lo acepten tal cual
Vite (Astro), el builder de Vercel (Express) y el `strip-types` de Node.

Para proyectos en JavaScript puro hay dos versiones **generadas** desde el
`.ts` con `npm run medidor:build` (`scripts/build-medidor.mjs`, usa
`ts.transpileModule` de la dependencia `typescript`): `medidor.mjs` para los
que usan `import` y `medidor.cjs` para los que usan `require`. Existen porque
Node 20 no entiende TypeScript y un proyecto CommonJS no puede cargar un
módulo con `export`. Solo se edita el `.ts`: `tests/medidor-js.test.ts`
regenera en memoria y falla si los archivos del repo quedaron desalineados, y
además pasa lo que envía cada versión por `verificarLote` y `validarLote`.
Llevan `/* eslint-disable */` porque son código generado: el lint del
proyecto que los copia no tiene nada que corregir ahí.

### Qué mide y qué no

Modelo de cobro de Vercel Fluid (vercel.com/docs/functions/usage-and-pricing,
22 sep 2026): la CPU activa se cobra solo mientras el código ejecuta; la
memoria aprovisionada se cobra **por vida de la instancia mientras tiene al
menos una petición en curso**, no por petición; la instancia se pausa sin
cargos cuando no hay peticiones.

| Dimensión | Cómo la mide el medidor | Precisión |
| --- | --- | --- |
| CPU activa | Delta de `process.cpuUsage()` del proceso entero entre marcas | Por arriba: incluye GC y runtime. Ve varias peticiones concurrentes sin contarlas dos veces porque mide el proceso, no la petición. |
| Memoria | Unión de los intervalos con peticiones en curso × memoria configurada (2 GB fijos en Hobby) | Buena. Dos peticiones solapadas cuentan el tiempo una vez, igual que Vercel. |
| Invocaciones | Una por petición que atraviesa el medidor | Exacta para lo que pasa por la función. |
| Transferencia de origen | Bytes del cuerpo de respuesta + `content-length` de la petición | Por abajo: no cuenta cabeceras. |
| Transferencia al visitante | Bytes del cuerpo de respuesta de la función | **Cota inferior**: no ve estáticos ni respuestas servidas desde la caché del CDN. |
| Peticiones al edge | Igual a las invocaciones | **Cota inferior**, por la misma razón. |

**Punto ciego conocido:** lo que el CDN sirve sin despertar la función
(imágenes, JS, CSS, páginas prerenderizadas, aciertos de caché). En un sitio
con muchas imágenes, la transferencia al visitante puede ser la primera cuota
en agotarse y el medidor no la ve. Mientras no exista la Fase 6, esa dimensión
se contrasta a mano en el dashboard Usage de Vercel.

### Envío

- Acumula por hora en la memoria del proceso y envía cada **10 minutos**
  (`intervaloMs`). Cada envío es una invocación del portafolio que sale de la
  misma cuota gratis: 10 min son, como mucho, ~4.300 invocaciones al mes por
  instancia siempre ocupada (0,4 % del millón). Bajar a 1 min multiplicaría
  eso por diez.
- Cada lote sella su cuerpo y su `batchId` al crearse; un reintento reenvía el
  mismo cuerpo con timestamp y firma nuevos, y la ingesta lo descarta si ya lo
  aplicó.
- Respuesta 2xx: entregado. 4xx (salvo 408/429): el lote se descarta y se
  registra en consola, porque reintentarlo no lo arregla. 5xx, 408, 429 o red
  caída: se reintenta en el siguiente envío. Cola tope de 48 lotes (8 h).
- `SIGTERM`: Vercel da 500 ms antes de matar la instancia; el medidor vacía la
  cola con un timeout de 400 ms. Solo se engancha en Vercel (`VERCEL=1`): fuera
  de ahí, un listener de `SIGTERM` cambiaría cómo se apaga la app del cliente.
- Petición abierta más de 15 min: se cierra a la fuerza. Es un cuerpo que nadie
  leyó ni canceló, y dejarla abierta contaría memoria para siempre.
- **Fail-open**: cualquier error del medidor deja pasar la petición intacta. Lo
  que es fail-closed es la ingesta (su comentario explica por qué).

### Uso en el proyecto del cliente

```ts
// Astro: src/middleware.ts
import { medidorDesdeEnv } from './lib/medidor'
export const onRequest = medidorDesdeEnv().astro()

// Express
import { medidorDesdeEnv } from './medidor'
app.use(medidorDesdeEnv().express())
```

Variables de entorno en el proyecto del cliente: `COMPUTO_PROYECTO` (slug en el
panel) y `COMPUTO_SECRETO` (se genera en `/admin/computo` y se muestra una
sola vez). Opcionales: `COMPUTO_ENDPOINT` (por defecto la ingesta de
codebymike.net), `COMPUTO_MEMORIA_MB` (por defecto 2048). Sin proyecto o sin
secreto, o fuera de Vercel, el medidor es un no-op silencioso.

## 4. Cuota gratis compartida (`src/lib/computo/cuota.ts`)

- Suma el mes en curso de todos los proyectos medidos contra la cuota Hobby
  del catálogo `VERCEL` de `infra-stack.ts`: una sola fuente para las cuotas,
  la misma que usa `/admin/infra`.
- Por dimensión: consumido, porcentaje, reparto por proyecto y proyección
  lineal a fin de mes. La dimensión que manda es la de mayor proyección.
- Avisos por ntfy al cruzar 70 %, 90 % y 100 % de lo consumido, o cuando la
  proyección supera el 100 %. Uno por umbral y dimensión en cada mes; el estado
  vive en `app_settings`, igual que el detector de crons en silencio.
- Se evalúa en `computo-rollup`, una vez al día. Una cuota mensual no se agota
  en horas salvo un ataque, y los ataques ya los ve el micro-SIEM; revisar cada
  hora costaría 24 veces más lecturas de Turso.
- El mes es calendario UTC (`periodo.ts`). **Pendiente de contrastar** si el
  ciclo de Hobby coincide con el mes calendario.

## 5. Cotizador de hosting fijo

En `/admin/computo`. Parte de una estimación humana (visitas al mes, CPU y
duración por visita, peso de la respuesta) y responde:

- Consumo estimado del cliente por dimensión y **qué parte de la cuota gratis
  se comería**.
- **Si cabe** junto a lo que ya se midió este mes.
- **Costo equivalente en Pro**: lo que costaría ese tráfico si hubiera que
  pagarlo. Para un sitio pequeño son centavos.
- **Cuota sugerida**: `calcularCobro` con margen y mínimo, la misma función que
  habría facturado. Si el cómputo son centavos, manda el mínimo, y la página lo
  dice en vez de esconderlo.

## 6. Fases

- ✅ **Fase 0** (7 sep): cálculo, tarifas, ingesta, rollup, migración 0031.
- ✅ **Fase 1** (22 sep): medidor con adaptadores Astro, Express y `fetch`
  (`tests/medidor.test.ts`, 28 casos, con el contrato contra `validarLote` y
  `verificarLote`), y de punta a punta contra la ingesta real con libSQL
  temporal (`tests/medidor-ingesta.test.ts`). Ingesta atómica: marca de lote y
  horas en un solo `db.batch`, y un error que no sea UNIQUE responde 503 para
  que el medidor reintente. Antes cualquier fallo se tomaba como "duplicado" y
  el lote se perdía; la prueba de atomicidad falla contra esa versión.
- ✅ **Fase 2** (22 sep): alta de proyectos medidos en
  `POST/PATCH /api/admin/computo/proyectos` (`tests/computo-alta.test.ts`) y
  panel `/admin/computo` con la cuota compartida.
- ✅ **Fase 3** (22 sep): avisos de cuota por ntfy desde `computo-rollup`
  (`src/lib/computo/avisos.ts`; decisión pura en `cuota.ts`,
  `tests/computo-cuota.test.ts`).
- ✅ **Fase 4** (22 sep): cotizador de hosting fijo (`cotizador.ts`,
  `e2e/computo.spec.ts`).
- **Fase 5** (en curso): instalar el medidor en los sitios de cliente y
  en el propio portafolio, y contrastar una semana contra el dashboard de
  Vercel. Sin el portafolio medido, el porcentaje de la cuota excluye a
  codebymike.net.
  - ✅ Código instalado el 23 sep en tres repos locales, sin commits ni
    despliegues (eso es del dueño):
    - **toledo-producciones** (Astro 5 en modo servidor): `src/lib/medidor.ts`
      y `src/middleware.ts` con `sequence(medidor, auth)`, así el login queda
      igual. Build y `astro check` limpios. Probado con `astro dev` y el
      medidor forzado: el logout sigue borrando su cookie y el 404 sale igual.
    - **dobleyo** (Astro 5 con páginas `prerender = false` + API Express 4
      en Node 20): `src/lib/medidor.ts` con un `src/middleware.ts` nuevo, y
      `server/medidor.mjs` enganchado primero en `api/index.js`. El
      `middleware.ts` de la raíz es el de enrutamiento de Vercel
      (subdominio en.) y no se tocó. Build limpio y ESLint sin errores; los
      974 errores de `astro check` son previos y de otras páginas.
    - **gorillaz-motorbikes** (Express 5 + EJS en CommonJS): `medidor.cjs`
      enganchado primero en `app.js`. No tiene pruebas; se verificó la
      sintaxis y que el `require` resuelve.
    - Prueba de humo de las dos APIs con SU Express real (4.22 en Node 20 y
      5.1 en Node 22) y una ingesta falsa que verifica la firma: respuestas
      intactas, incluidos 500 y 404, y bytes exactos (3572 y 3529).
  - Pendiente del dueño: generar el secreto de cada uno en `/admin/computo`
    y poner `COMPUTO_PROYECTO` y `COMPUTO_SECRETO` en cada proyecto de Vercel.
    Sin esas dos variables el medidor no hace nada.
  - **Sin medir, conscientemente:** el middleware de enrutamiento de DobleYo
    (corre en cada página del subdominio en. y es una invocación propia) y
    sus funciones Python de `api/ml/`. Si la cuota muestra algo que no
    cuadra con el tablero de Vercel, esos son los primeros sospechosos.
  - Arreglos del medidor que salieron al revisar esos repos: el adaptador de
    Astro ignora los renders del prerender (Astro corre el middleware también
    en el build, y se habrían contado como visitas), y el listener de
    `SIGTERM` se engancha con la primera petición real y no al crear el
    medidor, para que el proceso del build no quede escuchando la señal.
- **Fase 6** (pendiente, solo si la Fase 5 muestra que importa): punto ciego de
  estáticos con un beacon en el navegador (Resource Timing: peticiones y
  `transferSize` del mismo origen por página vista).

### Decisiones que surgieron al implementar

- **El cotizador estima desde visitas, no desde invocaciones.** `Estimacion` y
  `usoDesdeEstimacion` de `calculo.ts` parten de las invocaciones y no pueden
  representar un sitio estático, que tiene cero invocaciones y es justo el que
  más transferencia gasta. `usoDesdeVisitas` (`cotizador.ts`) las reemplaza en
  el panel; las viejas se dejaron donde estaban porque tienen pruebas propias.
- **La cuota sugerida sale del asiento Pro.** Con el cómputo a cero, el piso
  defendible es la parte de cada cliente en los 20 USD del asiento Pro que el
  uso comercial exigiría (`ASIENTO_PRO_USD` del catálogo de `infra-stack.ts`,
  repartido entre el número de clientes). Para el sitio SSR de la plantilla el
  cómputo equivalente en Pro es ~1 USD al mes, casi todo transferencia, y manda
  el asiento.
- **El reinicio del mes se pinta en UTC** ("1 oct (UTC)"): el corte vive en
  UTC en `periodo.ts`, y en hora de Bogotá las 00:00 UTC del 1 de octubre
  todavía son 30 de septiembre.
- **Verificación en vivo** (22 sep): un servidor `http` de Node 24 cargando
  `medidor.ts` sin compilar, con el adaptador Express, contra la ingesta del
  servidor de desarrollo sobre una base libSQL en archivo. 5 peticiones (2
  concurrentes) llegaron como 5 invocaciones, 150 bytes y 784 ms de memoria
  ocupada: las concurrentes contaron el tiempo una vez.

## 7. Seguridad

- Secreto por proyecto, cifrado con AES-256-GCM (`lib/crypto.ts`) en
  `compute_terms.ingest_secret`. Se muestra una sola vez al generarlo o
  rotarlo, nunca en listados ni en HTML SSR. Generarlo o rotarlo queda en el
  micro-SIEM.
- La ingesta es la excepción consciente al fail-open: lo que escribe no se
  puede dejar pasar "por si acaso".
- En modo demo el alta es `POST` y el middleware ya la bloquea.

## 8. Si algún día se pasa a Pro

- La fuente de verdad por proyecto pasa a ser `/v1/billing/charges`
  (`vercel usage --group-by project`), que da lo que Vercel cobra de verdad. El
  medidor queda como contraste y como vista por hora.
- Desde el 8 sep 2026 los equipos Pro nuevos traen **Flat Rate CDN** por
  defecto: transferencia al visitante y peticiones al CDN van a tarifa plana.
  Habría que cargar en `compute_rates` una fila con esas dos tarifas en cero,
  y lo que sigue por uso es CPU, memoria, invocaciones y transferencia de
  origen, justo lo que el medidor sí ve.

## 9. Dudas abiertas

- Ciclo de la cuota Hobby frente al mes calendario (sección 4).
- La CPU de `process.cpuUsage()` incluye el trabajo del runtime; el sesgo real
  frente al dashboard se mide en la Fase 5.
- La memoria configurada se toma de `COMPUTO_MEMORIA_MB` o 2048: Vercel no
  documenta una variable de entorno que la exponga.
