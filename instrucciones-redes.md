# Distribución automática de notas — lo que debes hacer de tu lado

Cuando haces `git push` a `main` con una nota nueva en `src/content/notes/`, el
workflow **Distribuir nota** (`.github/workflows/distribute-note.yml`) la publica
solo en blogs/redes y avisa a los buscadores.

**Todo funciona sin configurar nada** — pero cada plataforma está apagada hasta
que añadas sus secrets. No configuras secrets = esa plataforma se salta con
gracia (el resto sigue). Ve activando una por una.

## Dónde se ponen los secrets

GitHub → tu repo → **Settings → Secrets and variables → Actions → New repository
secret**. El nombre debe ser exacto (los de abajo).

Para probar sin publicar una nota real: pestaña **Actions → Distribuir nota →
Run workflow**, y pega la ruta de una nota existente.

---

## 1. IndexNow — ✅ ya funciona, no hagas nada

Avisa a Bing, Yandex, Seznam, Naver y Yep. La clave es pública por diseño (ya
está en el repo). Cero configuración.

---

## 2. dev.to — el más fácil y el de más valor SEO

Cross-postea el artículo completo con `canonical_url` → codebymike.tech. Backlink
de un dominio con autoridad, sin penalización por duplicado.

1. Entra a https://dev.to/settings/extensions
2. Baja a **DEV Community API Keys** → genera una key.
3. Secret:
   - `DEVTO_API_KEY` = esa key

---

## 3. Hashnode — otro backlink de autoridad

1. Token: https://hashnode.com/settings/developer → **Generate new token** (PAT).
2. Publication ID: entra a tu blog de Hashnode → Dashboard. El ID sale en la URL
   del dashboard o en Settings. (Si no lo encuentras, avísame y lo sacamos por la
   API de Hashnode.)
3. Secrets:
   - `HASHNODE_TOKEN` = el PAT
   - `HASHNODE_PUBLICATION_ID` = el ID de tu publicación

---

## 4. X (Twitter) — el más engorroso de configurar (una vez)

Necesitas una **app** en el portal de desarrolladores con permisos de escritura.

1. https://developer.x.com/en/portal/dashboard → crea un Project + App.
2. En la App: **User authentication settings** → activa OAuth 1.0a con permiso
   **Read and write**.
3. En **Keys and tokens** genera:
   - API Key y API Key Secret (de la app)
   - Access Token y Access Token Secret (de tu usuario) — **regenéralos DESPUÉS
     de poner permiso Read and write**, o el token será de solo lectura.
4. Secrets:
   - `X_API_KEY`
   - `X_API_SECRET`
   - `X_ACCESS_TOKEN`
   - `X_ACCESS_SECRET`

> El tier gratis permite ~500 posts/mes de escritura. De sobra.

---

## 5. LinkedIn — el que hay que renovar cada ~60 días

Requiere una app aprobada con el producto **Share on LinkedIn** / **Sign In**.

1. https://www.linkedin.com/developers/apps → crea una app (asóciala a una
   página de empresa; sirve la tuya).
2. Products → añade **Share on LinkedIn** (y **Sign In with LinkedIn using
   OpenID Connect** para obtener tu URN).
3. Genera un **access token** con scope `w_member_social` (OAuth). El token de
   usuario **caduca a los ~60 días** → toca regenerarlo (te avisaré cuando falle).
4. Tu URN de autor: es `urn:li:person:XXXX` donde `XXXX` es tu member id (lo
   devuelve el endpoint `/v2/userinfo` como `sub`).
5. Secrets:
   - `LINKEDIN_TOKEN` = el access token
   - `LINKEDIN_AUTHOR_URN` = `urn:li:person:XXXX`

---

## 6. Instagram — opcional y quisquilloso (déjalo para el final)

Instagram **no permite posts de solo texto**: se publica con una imagen (usamos
tu `og-default.png`). Requiere:

- Cuenta de Instagram **Business o Creator** (no personal).
- Conectada a una **página de Facebook**.
- Una **app de Meta** (https://developers.facebook.com) con el producto
  **Instagram Graph API**.
- Un **token de larga duración** y el **IG user id**.

Secrets:
- `IG_USER_ID`
- `IG_ACCESS_TOKEN`

> Si te interesa Instagram de verdad, el siguiente paso sería generar una imagen
> por nota (no la OG genérica) para que no salgan todas iguales. Dímelo y lo
> montamos.

---

## 7. Google Indexing API — indexa en Google en horas, no días

Complementa a IndexNow (que Google no usa).

1. https://console.cloud.google.com → crea un proyecto (o usa uno).
2. Habilita **Web Search Indexing API**.
3. Crea una **Service Account** → **Keys** → **Add key → JSON**. Descarga el JSON.
4. En **Google Search Console** → tu propiedad codebymike.tech → Settings →
   **Users and permissions** → añade el email de la service account
   (`...@...iam.gserviceaccount.com`) como **Owner**.
5. Secret:
   - `GOOGLE_INDEXING_SA` = **pega el contenido completo del JSON** descargado.

---

## 8. Aviso si algo falla (opcional)

Si una publicación es rechazada, te llega push a tu teléfono (reusa tu ntfy).

- `NTFY_TOPIC` = tu topic de ntfy (probablemente ya lo tienes de los otros
  workflows).

---

## Resumen: prioridad recomendada

| Prioridad | Plataforma | Esfuerzo | Por qué |
|-----------|-----------|----------|---------|
| 1 | dev.to | Bajo | Máximo SEO, 2 minutos |
| 2 | Google Indexing | Medio | Indexación rápida en Google |
| 3 | Hashnode | Bajo | Otro backlink de autoridad |
| 4 | X | Alto (una vez) | Alcance social |
| 5 | LinkedIn | Alto + mantenimiento | Alcance profesional |
| 6 | Instagram | Alto | Opcional, requiere imagen |

Empieza por dev.to: añade `DEVTO_API_KEY`, ve a Actions → Run workflow con una
nota existente, y mira que aparezca publicada. Cuando eso funcione, sumas las
demás.
