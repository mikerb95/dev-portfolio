// Endpoints señuelo (honeypots). Ningún usuario legítimo los toca; un hit es
// intención inequívocamente maliciosa. El middleware ya registra el evento
// `honeypot`/`critical` (las rutas están en HONEYPOT_PATHS del clasificador),
// así que estas respuestas NO vuelven a registrar (evita doble conteo): solo
// aplican un tarpit acotado y devuelven contenido plausible-pero-falso para
// hacer perder tiempo al scanner sin delatar que es una trampa.

export type HoneypotKind = 'wp' | 'admin' | 'apitoken'

const MIN_DELAY_MS = 800
const MAX_DELAY_MS = 2000

/** Retardo del tarpit, acotado para no retener conexiones demasiado tiempo. */
export function honeypotDelayMs(rand: () => number = Math.random): number {
  const span = MAX_DELAY_MS - MIN_DELAY_MS
  return MIN_DELAY_MS + Math.floor(rand() * span)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const WP_LOGIN_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Log In</title></head>
<body class="login">
<form name="loginform" id="loginform" action="wp-login.php" method="post">
<p><label>Username or Email Address<br><input type="text" name="log" class="input"></label></p>
<p><label>Password<br><input type="password" name="pwd" class="input"></label></p>
<p class="submit"><input type="submit" name="wp-submit" class="button button-primary" value="Log In"></p>
</form>
</body></html>`

const ADMIN_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Admin</title></head>
<body>
<form method="post" action="admin.php">
<input type="text" name="username" placeholder="Username">
<input type="password" name="password" placeholder="Password">
<button type="submit">Sign in</button>
</form>
</body></html>`

/**
 * Sirve la respuesta señuelo tras un tarpit. Nunca lanza. No añade headers que
 * delaten la trampa (parece un endpoint real).
 */
export async function serveHoneypot(kind: HoneypotKind): Promise<Response> {
  try {
    await sleep(honeypotDelayMs())
  } catch {
    // Ignorar: si el sleep falla por lo que sea, respondemos igual.
  }
  if (kind === 'apitoken') {
    return new Response(JSON.stringify({ error: 'invalid_token', message: 'The access token is invalid or has expired.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  const html = kind === 'wp' ? WP_LOGIN_HTML : ADMIN_HTML
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
