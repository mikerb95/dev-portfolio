# 07 · Autenticación y accesos

El sitio tiene **muchas puertas**, cada una con su propia credencial y su propio
alcance. Ninguna comparte cookie ni lógica con otra. La regla de diseño: cuando
una llave es débil (un PIN de 4 dígitos, una contraseña compartida), lo que la
hace aceptable es su **alcance mínimo** y sus **frenos**, no la llave.

## Mapa de puertas

| Puerta | Quién | Credencial | Abre | Falla |
|---|---|---|---|---|
| **Admin** | Mike | GitHub OAuth (allowlist por **id** y login) o llave WebAuthn | `/admin/*`, `/api/admin/*`, `/cobrar`, `/remote/<id>`, `/docs/presentacion` | Cerrada en revocación |
| **Portal** | Clientes | Email + contraseña (scrypt), cookie `portal_session` | `/portal/*`, `/api/portal/*` | - |
| **Demo del panel** | Cualquiera | Pase HMAC en cookie `demo_session` (2 h), emitido en `/demo` | `/admin/*` en solo lectura sobre la base demo | Sin demo configurada, `/demo` da 404 |
| **Demo del portal** | Cualquiera | Pase HMAC propio | `/portal/*` en base demo, solo lectura + pago simulado | - |
| **Respaldo del portal** | Cualquiera (cuando Turso cae) | Pase firmado | Snapshot JSON, solo GET | - |
| **Cotiza por PIN** | Mike sin GitHub a mano | PIN de 4 dígitos, cookie `cotiza_acceso` | Solo las rutas de Cotiza | **Cerrada** |
| **Sustentación por contraseña** | Mike el día de la charla | Contraseña en variable de entorno | Solo 4 rutas de la sustentación | - |
| **PIN de presentador** | Quien presenta | PIN largo | Mover la sustentación desde el celular | - |
| **PIN de público** | La sala | PIN corto (4 caracteres, 6 h) | Ver el deck en sincronía | - |
| **Código de grupo** | Asistentes a una capacitación | Código canjeado por un pase firmado (30 días) | Material restringido del banco | - |
| **Links firmados** | Clientes | Token en la URL | `/propuesta/<token>`, `/acuerdo/<token>`, `/mis-pagos?r&t`, `/c/<code>`, invitaciones, reset | - |
| **Máquinas** | Crons, CI, medidores, webhooks | Bearer o firma | `/api/cron/*`, `/api/lab/ingest`, `/api/computo/ingest`, webhooks | - |

## Admin en detalle

Archivos: [`auth.config.ts`](../../auth.config.ts),
[`src/lib/auth.ts`](../../src/lib/auth.ts),
[`src/lib/webauthn.ts`](../../src/lib/webauthn.ts),
[`src/lib/device-sessions.ts`](../../src/lib/device-sessions.ts),
[`src/middleware.ts`](../../src/middleware.ts).

1. **GitHub OAuth** (Auth.js). En `signIn` se exige que el **id numérico** de
   GitHub esté en `ALLOWED_GITHUB_IDS` (el id no cambia nunca) **y** que el
   login esté en `ALLOWED_GITHUB_LOGINS`. Un rechazo se registra en el SIEM.
   El `issuer` de GitHub se declara a mano por un bug de `@auth/core` 0.37.
2. **WebAuthn/passkeys** (`@simplewebauthn`): puerta **alternativa**, no segundo
   factor. La ceremonia FIDO2 corre en `/api/auth/webauthn/*` y produce un
   *proof* firmado que valida el proveedor `Credentials` de Auth.js. Los
   challenges son de un solo uso (`webauthn_challenges`). Registrar una llave
   exige **login reciente**, porque una llave registrada con un JWT robado
   sobreviviría a la revocación.
3. **Callback** a `/entrar`: interstitial que valida y redirige.
4. **En cada request a `/admin`** el middleware:
   - revalida la allowlist (defensa en profundidad);
   - registra el dispositivo (`sid` del JWT o cookie `device_id`) en
     `admin_sessions`;
   - si la sesión fue **revocada** desde `/admin/sessions`, borra las cookies y
     manda a `/entrar?revoked=1`;
   - si **no puede consultar** si fue revocada (Turso caído), responde **503**.
     Es la excepción deliberada al fail-open: es autorización, no
     observabilidad. **No "arreglarla" de vuelta a fail-open.** Única excepción:
     las rutas de la sustentación (viven en Redis).

Artículo: `/notes/sesiones-revocables-sobre-jwt-stateless`.

## Cotiza por PIN

[`src/lib/cotiza/acceso.ts`](../../src/lib/cotiza/acceso.ts) y `pin-db.ts`.
Existe porque Cotiza se usa en la oficina de un cliente o desde el celular,
donde GitHub o la YubiKey estorban. 4 dígitos (decisión de Mike contra la
recomendación de 6), tolerables por:

1. **Alcance**: solo rutas de Cotiza; bóveda, cobros, finanzas y clientes siguen
   tras GitHub.
2. **Frenos**: uno por IP y otro global entre todas las IP, que apaga la
   puerta del PIN un rato. El intento se anota antes de verificar, así que una
   ráfaga en paralelo no se los salta. El intento se suma
   **antes** de verificar (`reservarIntento`) y se devuelve si acierta
   (`devolverIntento`): así cada intento es un turno atómico y una ráfaga en
   paralelo desde muchas IP no pasa la revisión entera antes de que se cuente
   un fallo (hallazgo de la auditoría del 20 oct 2026).
3. **Falla cerrada**: si no se puede leer el PIN o los contadores, no abre.

El PIN se fija en `/admin/settings`.

## Sustentación por contraseña

[`src/lib/sustentacion/acceso.ts`](../../src/lib/sustentacion/acceso.ts). Abrir
la sesión de sustentación es lo que acuña los PINes, así que no puede
autorizarse con ellos; sin esta puerta, el día de la charla dependería de que
GitHub responda en el wifi del salón. Abre exactamente: `/sustentacion`,
`/admin/sustentacion`, `/api/admin/sustentacion/sesion` y
`/api/admin/sustentacion/diagnostico`.

## Demo del panel

[`src/lib/demo.ts`](../../src/lib/demo.ts). El pase solo abre la puerta; lo que
impide tocar datos reales es que **todas** las consultas salen de otra base
(`AsyncLocalStorage`). Además:

- solo `GET`/`HEAD`;
- rutas sensibles vetadas **por patrón aunque sean GET** (revelado de la bóveda,
  backups, sesiones, cobros…), con 403 JSON `{ demo: true }`;
- nunca aplica si ya hay sesión real ni al deck privado.

`e2e/demo.spec.ts` usa un **centinela** sembrado en la base real para demostrar
que la demo no lo ve.

## Máquinas

| Quién | Cómo se autentica |
|---|---|
| Crons (`/api/cron/*`) | `Authorization: Bearer CRON_SECRET`, comparado con `timingSafeEqual` (`lib/cron-auth.ts`). |
| CI → `/api/lab/ingest` | `LAB_INGEST_TOKEN` (la ingesta filtra rama y URL). |
| Medidores de clientes → `/api/computo/ingest` | Lotes firmados (`lib/computo/firma.ts`). |
| Wompi → `/api/payments/webhook` | Firma de evento verificada (`WOMPI_EVENTS_SECRET`). |
| Managed Agents → `/api/managed/webhook` | `ANTHROPIC_WEBHOOK_SIGNING_KEY` (503 si falta). |

## Rate limits de las puertas

Ver la tabla completa en [08](08-seguridad-micro-siem.md#4-rate-limiting). Las
puertas de credenciales tienen límites propios más estrechos que el paraguas
global.
