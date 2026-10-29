# 08 · Seguridad y micro-SIEM

Plan: [`docs/plan-security-observability.md`](../plan-security-observability.md)
(fases 0-6 implementadas, jul 2026). Multiproyecto (pendiente):
[`docs/plan-siem-multiproyecto.md`](../plan-siem-multiproyecto.md). Artículos:
`/notes/construyendo-un-micro-siem-para-mi-portfolio`,
`/notes/bloqueo-escalado-de-ips-sin-desconectarme-a-mi-mismo`,
`/notes/una-vitrina-de-seguridad-no-puede-mentir-ni-por-accidente`.

## Principio: fail-open

Un sistema de defensa que puede tumbar el sitio que protege es una superficie de
ataque nueva. Por eso el sensor, el rate limiter, la blocklist y el registro de
eventos **dejan pasar el request si fallan**. Excepciones deliberadas (fallan
cerradas porque son **autorización**): revocación de sesiones admin y PIN de
Cotiza.

## Capas

```
Vercel (DDoS automático + WAF con 3 reglas propias, gestionadas con `vercel firewall rules`)
  └─ middleware
       1. Sensor ─ clasificador puro de firmas (OWASP) sobre método, ruta, query y headers
       2. Blocklist ─ 403 seco a IPs bloqueadas (caché en memoria 30 s)
       3. Honeypots ─ rutas señuelo con tarpit y HTML falso; la IP se bloquea en el mismo request
       4. Rate limit de dos capas ─ memoria → Turso solo en zona de peligro
  └─ cron cada ~15 min ─ rollups, anomalías por z-score, auto-block
  └─ panel /admin/security + analista de IA con aprobación humana
  └─ vitrina pública /security (solo agregados)
```

### 1. Sensor (`security/classify.ts`, `sensor.ts`, `events.ts`)

- Función pura que decide si un request es hostil y con qué categoría y
  severidad. Síncrona y no-op para el ~99 % del tráfico; la escritura en
  `security_events` es fire-and-forget (latencia del sensor, RNF-11).
- Las IP se guardan también como **hash con sal** (`SECURITY_IP_SALT`) para lo
  que se publica (RNF-05).

### 2. Blocklist (`security/blocklist.ts`)

- Tabla `blocked_ips`, TTL **obligatorio** (RNF-04: sin bloqueos eternos).
- Escalado por reincidencia: **1 h → 1 día → 7 días**.
- `SECURITY_IP_ALLOWLIST` y las IP de las sesiones admin (`esIpPropia`) nunca se
  bloquean por honeypot. Esto existe por el **autobloqueo del 10 sep 2026**,
  cuando Mike se dejó fuera a sí mismo. Recuperación: borrar su fila en
  `blocked_ips`. Desde el 20 oct el bloqueo inline del middleware también
  consulta `esIpPropia`.
- Un honeypot pedido por un **navegador** (`vieneDeNavegador` en
  `security/sensor.ts`: trae `Sec-Fetch-Mode`, que los escáneres no mandan) se
  registra con su propia regla y menor severidad, pero **no bloquea**, ni inline
  ni en el cron. Antes, una imagen apuntando a una ruta señuelo en cualquier web
  dejaba bloqueado a quien la abriera. Un escáner que finja la cabecera esquiva
  ese bloqueo, no el registro ni el bloqueo por severidad alta (RF-607).

### 3. Honeypots (`security/honeypot.ts`)

- Rutas que ningún usuario legítimo pide. Tocarlas es intención inequívoca: el
  middleware bloquea la IP **en ese mismo request** (sin esperar al cron), pero
  sirve igual el señuelo para no delatar la trampa en el primer contacto.
- Excepción: si la petición la hizo un **navegador** (otra web puede inducirla),
  no se bloquea (hallazgo de la auditoría de oct 2026).
- Las rutas concretas **no se documentan** fuera del código (OPSEC).

### 4. Rate limiting

`security/ratelimit-durable.ts`: contador en memoria; solo consulta/escribe
`rate_limit_buckets` en Turso cuando el contador local entra en la "zona de
peligro" (`deferUntil`). Sobrevive a redeploys (RNF-10).

| Clave | Límite | Por qué |
|---|---|---|
| Login del portal (POST) | 10/min por IP | Un login legítimo es un POST; frena diccionarios antes de scrypt. |
| `/api/auth`, `/login`, `/entrar`, Cotiza | 30/min | JWT y WebAuthn hacen varios roundtrips legítimos. |
| `/c/<code>` (cobros) | 30/min | El código corto es su única protección. |
| `/propuesta/<token>` | 60/min | Cada perilla es una simulación en servidor. |
| `/acuerdo/<token>` | 60/min | Una persona, pocas acciones. |
| Canje de código de capacitación | 10/min | Nadie canjea dos veces. |
| Asesor IA (POST) | 40 por 10 min | Cada POST es una llamada pagada. |
| `/<pin>` de presentación | 90/min | Un salón entero comparte la IP del wifi. |
| Snapshots de presentación | 2.000/min, fuera del paraguas | Toda la sala tras el mismo NAT resincroniza cada 10 s. |
| **Paraguas global** | 600/min por IP en rutas dinámicas | Anti-scraping; no roza usuarios reales. |

### 5. Rollups, anomalías y auto-block

- Cron `security-rollup` (~15 min, cron-job.org): agrega a `security_rollups`,
  detecta anomalías (`security/anomaly.ts`: picos por **z-score** con umbral 3,
  patrones nuevos, anomalías geográficas) con anti-fatiga por tipo, y aplica
  **auto-block** (`autoblock.ts`).
- **Bloqueo masivo** desde el panel con protección del operador (nunca incluye
  IPs propias).
- **Purga de retención** de eventos y checks crudos (RNF-16).

### 6. Auditoría ≠ amenaza

La misma tabla `security_events` guarda ataques y rastro de acciones legítimas
(del admin, clientes, alumnos). Las categorías de rastro viven en
`AUDIT_CATEGORIES` (`security/audit.ts`) y quedan **fuera** de `/security`, del
pulso de la portada, de las anomalías y del bloqueo masivo. Una categoría nueva
de rastro se añade ahí, o se publicará como ataque (y su gráfico delataría
cuándo se usa el panel). Las acciones del panel usan `recordAdminEvent` con
`await`; el resto `recordSecurityEvent`, que nunca lanza.

## Otras defensas

| Riesgo | Defensa | Dónde |
|---|---|---|
| Secretos en reposo | AES-256-GCM con `ENCRYPTION_KEY`; nunca en listados ni HTML SSR; solo por endpoint de revelado bajo sesión admin | `lib/crypto.ts`, `lib/vault.ts`, `/api/admin/services/<id>/secrets` |
| XSS desde la base | `jsonEnScript` para JSON en `<script>`, `urlSegura` para `href` (solo http/https), escape antes de `innerHTML` | `lib/json-script.ts`, `lib/safe-url.ts` (RNF-33) |
| SSRF | `assertPublicHost` resuelve DNS y rechaza redes privadas; `fetchPublico` sigue redirecciones a mano validando cada salto; `lookupPublico` (dispatcher de undici y `tls.connect`) vuelve a rechazar IPs privadas al conectar, lo que cierra el DNS rebinding. Lo usan los monitores y el analizador público | `lib/ssrf-guard.ts` (RNF-34) |
| CSP | Enforce + reporting a `/api/security/csp-report` | `lib/security/private-headers.ts` |
| Llaves repetidas o plantadas | Challenges de un solo uso, aviso al cambiar passkeys | `lib/webauthn.ts` (RNF-31) |
| Privacidad en `/log` | Los repos privados cuentan pero no se publican | `/api/github/activity` (RNF-32) |
| Pagos | Firma de integridad y de eventos Wompi, idempotencia | `lib/payments.ts` |
| Supply chain | `npm audit` + CodeQL semanales y en cada push | `.github/workflows/security.yml` |

## Analista de IA

Agente que lee el registro de ataques, explica y **propone** bloqueos que Mike
aprueba (nunca decide solo). Nunca ve una IP real: trabaja con **seudónimos**.
Corre cada mañana (cron `analista-matutino`) y a demanda en `/admin/analista`.
Detalle en [11](11-ia-y-agentes.md#analista-del-micro-siem).

## OPSEC

En páginas públicas (`/status`, `/security`, `/lab`) **solo agregados**: nunca
IPs completas, nombres exactos de reglas de detección, rutas honeypot ni nada
que sirva de manual de ataque. `/security` calcula sus agregados como mucho cada
3 h y los guarda en `app_settings` (`cache_security_vitrina`); si recalcular
falla, sirve la foto vieja y nunca guarda ceros.

## Auditorías

- **Sep 2026** (22-24 sep): auditoría completa del admin en 4 bloques, cerrada.
  Fuera a propósito: CSP sin `unsafe-inline`, upload de certificaciones en
  Vercel, SSRF en monitores (después resuelto con `ssrf-guard`).
- **Oct 2026** (20 oct): 8 hallazgos en las superficies públicas, ninguno
  crítico. Estado verificado contra el código el 28 oct:

  | # | Hallazgo | Estado |
  |---|---|---|
  | 1 | SSRF en el analizador público: seguía redirecciones y había rebinding | ✅ Cerrado (`fetchPublico`, RNF-34) |
  | 2 | Carrera en el PIN de Cotiza: una ráfaga en paralelo se saltaba los frenos | ✅ Cerrado (intento reservado antes de verificar, RF-220) |
  | 3 | Honeypot disparable desde otra web | ✅ Cerrado (navegador no bloquea, IP propia excluida, RF-607) |
  | 4 | `/decks/<id>.html` sin control de acceso, ids secuenciales | ✅ Cerrado el 28 oct (sesión admin, presentación viva de ese deck o recurso visible del banco; 404 sin permiso, RF-208) |
  | 5 | El asesor acepta del navegador turnos "asesor" que se guardan en el panel y en Plano | ✅ Cerrado el 28 oct (respuestas firmadas; lo que llega sin firma se guarda marcado como no verificado, RF-212) |
  | 6 | `SUSTENTACION_PASSWORD` sigue en producción | Abierto (acción manual) |
  | 7 | `@auth/core` 0.37.4 con avisos | Bloqueado (espera a que `auth-astro` acepte la 0.41) |
  | 8 | Menores del portal y de `mis-pagos` | ✅ Cerrados el 28 oct salvo uno: login del portal atómico y sin enumeración (RF-801), demo que no pisa una sesión real (RF-810), impersonación con ruta canónica (RF-806). Sigue abierto: `/mis-pagos` confirma si un teléfono tiene cobros (RF-307, decisión de Mike) |

  Los abiertos, con su arreglo propuesto, están en
  [`pendientes.md`](../../pendientes.md).
