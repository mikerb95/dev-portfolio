# Plan: Observabilidad de Seguridad (SecOps) — CodeByMike

> Objetivo: construir un módulo de **observabilidad de seguridad** de nivel profesional que
> registre, agregue y visualice la actividad hostil contra codebymike.tech (endpoints
> sondeados por atacantes, patrones de ataque, rate limiting, anomalías de comportamiento),
> con alertas en tiempo real, SLOs de seguridad, y una **vitrina pública** (`/security` +
> tarjetas en `/status` y `/tools`) que demuestre el nivel técnico sin filtrar información
> sensible.
>
> Nombres técnicos del dominio (para hablar con propiedad en la vitrina y entrevistas):
> **Security Observability / Attack Surface Monitoring**, con piezas de **WAF** (Web
> Application Firewall), **IDS ligero** (Intrusion Detection), **honeypots HTTP**,
> **threat intelligence** básica y **anomaly detection**. En la industria esto vive en un
> SIEM (Security Information & Event Management); aquí construimos un "micro-SIEM" propio.
>
> Decisiones: prioridad a desarrollo propio; terceros solo en capa free y sin acoplarse
> (mismo patrón no-op de `notify.ts`). Todo corre dentro del proyecto (Astro + Turso).

---

## Estado actual (auditado 2026-07-09)

| Área | Estado |
|---|---|
| Middleware | `src/middleware.ts`: auth de `/admin`, headers de seguridad (HSTS, CSP en admin), chaos LAB, registro de sesiones de dispositivo |
| Rate limiting | `src/lib/ratelimit.ts`: ventana fija **en memoria, por instancia** — se pierde entre cold starts y no comparte estado entre instancias. Usado solo en `contact`, `checkout`, `mock/pay` |
| Registro de actividad hostil | **Cero.** Los 404 de scanners (p. ej. `/wp-login.php`, `/.env`) no se registran en ninguna parte |
| Firewall de plataforma | Vercel plan Hobby: DDoS mitigation automática incluida; WAF con **3 custom rules gratis** y challenge/deny sin costo — disponible pero sin configurar |
| Observabilidad existente | Motor propio de uptime (`monitors.ts`), SLO (`slo.ts`), Web Vitals, ntfy + Resend (`notify.ts`), `/status` público |
| Auth/sesiones | Auth.js + allowlist GitHub, tabla `admin_sessions` con revocación, IP y user-agent ya capturados |
| Base de datos | Turso/libSQL + Drizzle, migraciones aditivas con `drizzle-kit generate` |

Ventaja clave: ya existe el patrón completo a replicar — tabla de eventos + cron de
agregación + panel admin + página pública filtrada + alertas ntfy. El módulo de seguridad
es estructuralmente análogo al de monitores.

---

## Arquitectura

```
                    ┌─────────────────────────────────────────────┐
 request entrante → │ Vercel (DDoS mitigation + WAF 3 reglas free)│  capa 0: plataforma
                    └───────────────────┬─────────────────────────┘
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │ src/middleware.ts                           │  capa 1: detección
                    │  · clasificador de amenazas (propio)        │
                    │  · rate limiter durable (Turso, fail-open)  │
                    │  · bloqueo por IP (lista en Turso, cache)   │
                    └───────────────────┬─────────────────────────┘
                          ▼ (async, no bloquea la respuesta)
                    ┌─────────────────────────────────────────────┐
                    │ security_events (Turso)                     │  capa 2: registro
                    │ 404.astro + endpoints honeypot también      │
                    │ escriben aquí                               │
                    └───────────────────┬─────────────────────────┘
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │ cron /api/cron/security-rollup              │  capa 3: análisis
                    │  · agregados horarios/diarios               │
                    │  · detección de anomalías (z-score sobre    │
                    │    baseline de 30 días)                     │
                    │  · auto-block de IPs reincidentes           │
                    │  · alertas ntfy/email si severidad ≥ alta   │
                    └───────────────────┬─────────────────────────┘
                          ▼                            ▼
              /admin/security (privado)      /security (vitrina pública)
```

Principios (mismos del LAB, no negociables):

1. **Fail-open absoluto**: ningún fallo del pipeline de seguridad puede tumbar o
   ralentizar el sitio. Toda escritura de eventos es *fire-and-forget* con `catch`
   silencioso; toda lectura de listas de bloqueo tiene cache en memoria con TTL y
   fallback a "permitir".
2. **Presupuesto de latencia**: la capa 1 añade **≤ 5 ms p99** al request (una lectura
   cacheada de la blocklist cada ~30 s; la clasificación es regex/lookup en memoria; la
   escritura del evento no se espera con `await` en el camino de respuesta —
   `context.waitUntil` si está disponible, o promesa suelta con catch).
3. **Aditivo**: tablas nuevas, rutas nuevas, un solo punto de contacto con código
   existente (el middleware, extendido con el mismo cuidado que `maybeChaos`).
4. **Privacidad y OPSEC de la vitrina**: la página pública muestra **agregados y
   tendencias**, jamás IPs completas (se muestran enmascaradas `181.xx.xx.xx` o
   hasheadas), ni rutas internas reales del admin, ni reglas de detección exactas
   (no darle el playbook al atacante).
5. **Retención**: eventos crudos 90 días, agregados horarios 13 meses, diarios
   indefinido. Purga en el mismo cron. Turso free (5 GB) sobra: un evento pesa ~300
   bytes; incluso 50k eventos/mes son ~15 MB/año.

---

## Nuevas tablas (Drizzle, migración aditiva)

```
security_events        — evento crudo por request sospechoso
  id, at (unixepoch), ip (texto), ipHash (sha-256 truncado, para públicos),
  method, path, query (truncado 200 chars), userAgent (truncado 300),
  country (header x-vercel-ip-country), asn (x-vercel-ip-as-number, si llega),
  category (enum abajo), severity ('low'|'medium'|'high'|'critical'),
  action ('logged'|'rate_limited'|'blocked'|'honeypot'), statusCode,
  ruleId (qué regla del clasificador disparó)

security_rollups       — agregado horario/diario para dashboards y baseline
  id, bucket ('hour'|'day'), at, category, count, uniqueIps, topPath, topCountry

blocked_ips            — lista de bloqueo con TTL (nunca bloqueos eternos por defecto)
  ip (pk), reason, ruleId, hits, createdAt, expiresAt (obligatorio; escalado:
  1h → 24h → 7d por reincidencia), source ('auto'|'manual')

rate_limit_buckets     — estado durable del rate limiter (clave, ventana, contador)
  key (pk), count, resetAt   — con purga perezosa en el cron

security_anomalies     — hallazgos del detector (para timeline y alertas)
  id, at, kind ('spike'|'new_pattern'|'geo_anomaly'|'auth_probing'|'error_burst'),
  zScore, baseline, observed, detail (json), notified, acknowledged
```

### Taxonomía de categorías del clasificador (`ruleId` por regla)

Alineada con **OWASP Top 10** para que la vitrina hable el idioma de la industria:

| Categoría | Detecta | Ejemplos de firmas |
|---|---|---|
| `recon_cms` | Scanners de CMS/paneles ajenos | `/wp-login.php`, `/wp-admin`, `/xmlrpc.php`, `/administrator`, `/phpmyadmin` |
| `secrets_probing` | Búsqueda de secretos/config | `/.env*`, `/.git/*`, `/config.json`, `/.aws/credentials`, `/id_rsa`, `/backup.sql` |
| `path_traversal` | LFI/traversal (OWASP A01/A03) | `../`, `%2e%2e`, `/etc/passwd`, null bytes |
| `injection` | SQLi/XSS/cmd en query o path (A03) | `union select`, `<script`, `' or 1=1`, `;wget`, `${jndi:` |
| `auth_probing` | Fuerza sobre auth propia | ráfagas a `/api/auth/*`, `/login`, callbacks manipulados |
| `bad_bot` | UAs de herramientas ofensivas | `sqlmap`, `nikto`, `nuclei`, `masscan`, `zgrab`, UA vacío en rutas API |
| `api_abuse` | Rate limit excedido en APIs públicas | `contact`, `checkout`, vitals |
| `honeypot` | Tocó un endpoint trampa | ver honeypots abajo |
| `protocol_anomaly` | Métodos raros, hosts falsos | `TRACE`, `CONNECT`, Host header spoofing |

El clasificador vive en `src/lib/security/classify.ts`: tabla de reglas puras
(regex precompiladas + listas), **100% testeable con Vitest** (esto alimenta la Fase 5
del LAB: la suite de seguridad suma coverage real).

---

## Fases

### Fase 0 — Fundamento: telemetría de eventos (el "sensor") ~1 sesión

1. Migración con las 5 tablas.
2. `src/lib/security/classify.ts` + `src/lib/security/events.ts` (`recordSecurityEvent`,
   fire-and-forget, dedupe en memoria de ráfagas idénticas: máx 1 escritura/seg por
   `ip+ruleId` para que un scan de 500 rutas no haga 500 inserts — se acumula `hits`).
3. Hook en `middleware.ts`: clasificar el request; si matchea, registrar. **Sin bloquear
   todavía** (fase de solo observación — igual que se despliega un WAF real: primero
   `log`, luego `enforce`). El middleware ve TODAS las rutas (incluidas las que acaban en
   404), así que un scanner de `/wp-login.php`, `/.env`, etc. ya queda registrado aquí —
   no hace falta un hook aparte en `404.astro` (evita doble conteo). Un hook de 404 solo
   añadiría valor para medir volumen de escaneo de rutas SIN firma; se deja para una fase
   posterior si interesa esa métrica.
4. Tests Vitest del clasificador y de la redacción (tabla de casos: ruta → categoría/
   severidad esperada; IP → hash/máscara).

**Criterio de salida**: eventos reales acumulándose en prod durante ≥ 72 h para tener
datos antes de encender el enforcement (evita bloquear tráfico legítimo por una regla
mal calibrada).

### Fase 1 — Rate limiting durable + enforcement ~1 sesión

1. `src/lib/security/ratelimit-durable.ts`: sliding window sobre `rate_limit_buckets`
   (un `INSERT ... ON CONFLICT` atómico por check), con **cache de primer nivel en
   memoria** para no ir a Turso en cada request: solo consulta la DB cuando el contador
   local se acerca al límite. Fail-open si Turso no responde en 150 ms.
2. Política por defecto (documentada en el plan y en la vitrina):
   - APIs públicas de escritura (`contact`, `checkout`): 5 req/min/IP, durable.
   - `api/auth/*`: 10 req/min/IP → al exceder, evento `auth_probing` severidad alta.
   - Global por IP: 300 req/min (paraguas anti-scraping agresivo).
3. Enforcement de blocklist en middleware: cache en memoria (TTL 30 s) de `blocked_ips`
   vigentes; IP bloqueada → `403` + evento `action='blocked'`. Respuesta mínima, sin
   pistas.
4. Migrar los 3 usos actuales de `ratelimit.ts` al nuevo módulo (manteniendo la
   versión en memoria como primera capa barata).

**SLO propio del limiter**: overhead p99 ≤ 5 ms, tasa de falsos positivos objetivo
< 0.1% de requests legítimos (medible: eventos `rate_limited` cuya IP luego navega
normalmente).

### Fase 2 — Honeypots + auto-block ~1 sesión

1. Endpoints trampa que ningún usuario legítimo toca: `/wp-login.php`, `/.env`,
   `/admin.php`, `/api/v1/token` (rutas Astro reales que responden 200 con contenido
   plausible-pero-falso tras un delay aleatorio de 1–3 s — un *tarpit* suave — y
   registran `honeypot`/`critical`). Añadir `Disallow` de esas rutas en `robots.txt`
   (los crawlers legítimos las respetan; los atacantes no — filtro adicional).
2. Auto-block escalonado (corre en el cron, no inline): IP con evento `honeypot` o ≥ N
   eventos `high` en 10 min → insert en `blocked_ips` con TTL 1 h; reincidencia → 24 h
   → 7 días. **Salvaguardas**: nunca auto-bloquear IPs de rangos de Vercel/cron-job.org
   ni la IP del admin (allowlist en `app_settings`); tope de 500 IPs bloqueadas
   simultáneas (si se excede, alerta en vez de bloquear — señal de ataque distribuido
   que se maneja en capa 0).
3. Panel de gestión manual: bloquear/desbloquear desde `/admin/security`.

### Fase 3 — Cron de análisis, anomalías y alertas ~1–2 sesiones

1. `/api/cron/security-rollup` (vercel.json, cada hora + respaldo cron-job.org como los
   monitores): agrega la hora anterior a `security_rollups`, ejecuta auto-block, purga
   retención, actualiza baseline.
2. **Detección de anomalías** (propia, estadística simple y explicable — vende más en
   una sustentación que una caja negra):
   - *Spike*: eventos/hora por categoría vs media+desviación de la misma hora en los
     últimos 30 días; z-score > 3 → anomalía.
   - *New pattern*: `ruleId` genérico con path nunca visto que se repite ≥ 10 veces.
   - *Geo anomaly*: país nuevo entrando al top-3 de origen de eventos high/critical.
   - *Auth probing*: > X fallos de auth en la ventana.
   - *Error burst*: correlación con `monitor_checks` (¿el ataque coincide con
     degradación de uptime? — esto une los dos sistemas de observabilidad).
3. Alertas vía `notify.ts` existente: `critical` inmediato (push prioridad 5),
   `high` agrupado por hora, resumen diario por email. Anti-fatiga: una anomalía
   abierta no re-alerta hasta que se reconozca o pasen 24 h.

### Fase 4 — Panel privado `/admin/security` ~1–2 sesiones

Nueva entrada en el sidebar (grupo Sistema, junto a Monitores):

```
/admin/security            → Dashboard: eventos 24h/7d, top categorías, top países,
                             top paths atacados, IPs bloqueadas activas, anomalías abiertas
/admin/security/events     → Explorador con filtros (categoría, severidad, IP, rango)
/admin/security/blocklist  → Gestión de bloqueos (manual + auto, con TTL visible)
/admin/security/rules      → Estado del clasificador: hits por regla, últimos matches
                             (para calibrar reglas ruidosas)
```

Gráficas con el mismo enfoque server-rendered de `/status` (SVG/tablas, sin librerías
cliente pesadas). Acciones de mutación con el mismo guard auth + CSRF de las APIs admin.

### Fase 5 — Vitrina pública ~1 sesión

1. **`/security` (rediseño de la página existente)** → "Security Operations":
   - Contadores agregados: "N intentos de intrusión detectados y bloqueados este mes",
     desglose por categoría OWASP, top 5 rutas-señuelo más atacadas, mapa/lista de
     países de origen, tendencia de 90 días.
   - Sección "Cómo funciona": diagrama de las 4 capas, presupuesto de latencia, política
     de retención, filosofía fail-open — el texto técnico es la pieza de marketing.
   - SLA/SLO publicados: overhead del pipeline, tiempo de detección→bloqueo (objetivo:
     auto-block en ≤ 60 min vía cron, inmediato para rate limit), falsos positivos.
   - **OPSEC**: solo agregados; IPs enmascaradas; sin nombres de reglas exactos; sin
     revelar cuáles endpoints son honeypots (decir "endpoints señuelo" sin listarlos).
2. Tarjeta "Security" en `/status` (junto a uptime) y entrada en `/tools`.
3. Artículo en `/notes`: *"Construyendo un micro-SIEM para mi portfolio"* — el formato
   que ya usas para mostrar conocimiento.
4. OG image propia, identidad CodeByMike.

### Fase 6 — Capa 0 (Vercel WAF free) + endurecimiento ~1 sesión

1. Configurar en el dashboard de Vercel las 3 custom rules gratis (complemento, no
   sustituto, del motor propio): p. ej. deny a paths `wp-*`/`.git` **excepto** los
   honeypots propios, challenge a UAs ofensivas conocidas, rate limit de respaldo en
   `/api/*`. Documentar que existen dos capas y por qué.
2. Extender headers de seguridad al sitio público (hoy CSP solo cubre admin): CSP
   report-only primero → los reportes (`report-to` apuntando a un endpoint propio
   `/api/security/csp-report`) se registran como eventos `csp_violation` → tras 2
   semanas limpias, enforce. Añadir `Permissions-Policy` y `X-Content-Type-Options`
   globales.
3. `security.txt` (RFC 9116) en `/.well-known/security.txt` con contacto de disclosure
   — detalle pequeño que los técnicos reconocen al instante.

---

## Métricas y SLOs del módulo (los que se publican)

| Métrica | Objetivo | Medición |
|---|---|---|
| Overhead del pipeline (p99) | ≤ 5 ms | timestamps en middleware, muestreado 1% |
| Tiempo detección → bloqueo (auto) | ≤ 60 min | `blocked_ips.createdAt` − primer evento |
| Tiempo detección → alerta (critical) | ≤ 60 s | evento → push ntfy |
| Falsos positivos de bloqueo | < 0.1% | revisión de desbloqueos manuales |
| Disponibilidad del sitio bajo scan activo | SLO 99.5% existente sin degradar | correlación con `monitor_checks` |
| Cobertura de tests del clasificador | ≥ 95% líneas | Vitest coverage (suma al LAB) |

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Regla mal calibrada bloquea usuarios reales | Fase 0 en modo solo-log 72 h; TTL obligatorio en bloqueos; allowlist; página `/admin/security/rules` para ver ruido por regla |
| Escrituras a Turso amplifican un ataque (el ataque genera writes) | Dedupe 1 write/s por ip+regla; tope de eventos/min global con degradación a solo-contador en memoria |
| Auto-block se vuelve arma de DoS contra terceros (IP spoofing en XFF) | En Vercel `x-forwarded-for` lo pone la plataforma (no falsificable en la primera IP); aún así, TTLs cortos y tope de 500 IPs |
| Vitrina filtra inteligencia al atacante | Reglas de OPSEC de la Fase 5 (solo agregados, sin firmas, sin lista de honeypots) |
| Cron de Vercel Hobby limitado (1 ejecución/día por cron en Hobby) | Igual que los monitores: cron-job.org (free) como disparador horario del endpoint, protegido por token — patrón ya probado en el repo |
| Crecimiento de datos | Retención por capas + purga en cron; estimación 15 MB/año vs 5 GB free |

## Terceros (todos free tier, todos opcionales/no-op si faltan)

- **Vercel WAF free** (3 reglas + DDoS automático) — capa 0, ya incluido en el plan Hobby.
- **cron-job.org** — disparador horario (ya en uso para monitores).
- **ntfy.sh + Resend** — alertas (ya integrados vía `notify.ts`).
- Opcional futuro, no en el MVP: enriquecimiento de IPs con listas públicas gratuitas
  (p. ej. feed de AbuseIPDB free o listas de Tor exit nodes descargadas por el cron y
  cacheadas en `app_settings`) para marcar "IP con reputación conocida" en el panel.

## Orden y estimación

Fase 0 (sensor) → **72 h de datos** → Fase 1 (limiter) → Fase 2 (honeypots/auto-block)
→ Fase 3 (cron/anomalías/alertas) → Fase 4 (panel) → Fase 5 (vitrina) → Fase 6 (WAF/CSP).
Total: ~7–9 sesiones de trabajo. Las fases 0–3 son backend puro y se pueden verificar
con `curl` + Vitest; las 4–5 reutilizan patrones de UI ya existentes (monitores/status).
