# 20 · Glosario

Vocabulario propio del proyecto, en orden alfabético.

| Término | Significado |
|---|---|
| **Adicional** | En Cotiza, todo lo que no estaba en el alcance pactado. Entra con precio propio y aprobación escrita previa; nunca reabre el precio base. |
| **AEO** | *Answer Engine Optimization*: que los asistentes de IA (ChatGPT, Claude, Perplexity) citen el sitio con datos correctos. `llms.txt`, JSON-LD, conteo de bots. |
| **Analista** | Agente de IA que lee el micro-SIEM y propone bloqueos que Mike aprueba. Trabaja con IPs seudonimizadas. |
| **Asesor** | Chat público con IA dentro de la burbuja de WhatsApp. Precio estimado sin inventarlo y cierre en WhatsApp. |
| **Asesor en vivo** | Cuando una conversación del asesor muestra interés, Mike recibe un aviso y puede entrar a ella desde `/admin/asesor`. |
| **Asistente** | IA del panel (caja "Pregunta o busca"): lee datos con herramientas y propone escrituras con tarjeta de aprobación. |
| **Auditoría (categoría de)** | Evento legítimo guardado en `security_events` que no debe publicarse como ataque. Listado en `AUDIT_CATEGORIES`. |
| **Beat** | Paso de la sustentación. Vive en Redis; el escenario y los seguidores lo obedecen. También, cada diapositiva de `final.html`. |
| **Bóveda** | Secretos de servicios por proyecto, cifrados con AES-256-GCM. Solo se revelan bajo demanda con sesión admin. |
| **canonicalPath** | Ruta sin prefijo de idioma y sin barra final. La única que usan los guardas del middleware. |
| **Cascarón** | Archivo de 3 líneas en `src/pages/en/` que reexporta la página española. |
| **Centinela** | Fila sembrada en la base real durante e2e para demostrar que la demo no la ve. |
| **Cobro de campo** | Cobro creado desde el celular en `/cobrar`, enviado por WhatsApp sin API, pagado en `/c/<code>`. Es una fila de `payments`. |
| **Cono de incertidumbre** | En Plano, el rango de precio que se cierra con cada respuesta. |
| **Cotiza** | Herramienta para encargos de consultoría (logística, comercio exterior) con cupos, adicionales y acceso por PIN. |
| **Cuenta de cobro** | Documento de cobro de persona natural no responsable de IVA (Colombia). Fila de `invoices` con `docType = 'cuenta_cobro'`. |
| **Cupo** | En Cotiza, cantidad incluida de un entregable que se va descontando. |
| **Demo** | Panel (`/demo`) o portal navegables con datos ficticios de una base aparte, en solo lectura. |
| **Detector de silencio** | Interruptor de hombre muerto: avisa cuando un cron deja de anotar corridas. |
| **Digest** | Objeto mínimo que el portal sondea cada 20 s para saber si hay algo nuevo. |
| **Eco / espejo / puntero** | En la sustentación, lo que la sala ve de lo que el ponente escribe, la página que toca y lo que señala. |
| **Encaje con tu vida** | En Plano, qué significa una propuesta para Mike (carga, gasto), no para el cliente. |
| **EP** | Etapa productiva del SENA (`/ep`). |
| **Escenario** | `/sustentacion`: lo que se proyecta en la sustentación (canvas + paneles). |
| **Escritura** | Acción del asistente que cambia datos. Nunca se ejecuta sin aprobación. |
| **Fail-open / fail-closed** | Si falla, deja pasar / si falla, bloquea. Seguridad y observabilidad son fail-open; autorización es fail-closed. |
| **Foto (caché)** | Resultado JSON guardado en `app_settings` con TTL para no recalcular agregados caros. |
| **Guardia de cifras** | Revisión que impide que una IA escriba una cantidad de dinero que no salió de una herramienta. |
| **Honeypot / señuelo** | Ruta que solo pide un atacante. Tocarla bloquea la IP. No se documenta fuera del código. |
| **Impersonación** | "Ver como cliente": el admin ve el portal de un cliente, en solo lectura. |
| **Instantánea** | `src/data/instantanea.json`: datos públicos reales para servir páginas de marca con la base caída. |
| **LAB** | Módulo de ingeniería (CI/CD, pagos, chaos, SAST/DAST, mutation, carga). También el nombre del plan SENA. |
| **Medidor** | Script portable que se instala en sitios de clientes para medir su consumo de cómputo en Vercel. |
| **Micro-SIEM** | Sistema propio de detección, registro, bloqueo y análisis de tráfico hostil. |
| **Modo respaldo** | El portal sirviendo un snapshot JSON firmado cuando Turso no responde. |
| **Motion** | Animaciones propias (GSAP, WebGL, canvas) que muestran la práctica en vez de describirla. |
| **Paraguas** | Rate limit global por IP (600/min en rutas dinámicas). |
| **Pase** | Cookie HMAC firmada que abre una puerta acotada (demo, respaldo, capacitación, escenario). |
| **PIN de presentador / de público** | Credenciales de la sustentación: la larga mueve, la corta sigue. |
| **Plano** | Constructor de propuestas a la medida con rango que se cierra, versiones congeladas y enlace para el cliente. |
| **Pulso** | Cifras agregadas del propio sitio (cinta bajo el hero, panel del dashboard). |
| **Rastro** | Ver Auditoría. |
| **Rollup** | Tabla precalculada (`monitor_daily`, `security_rollups`) para no escanear datos crudos. |
| **Seudónimo** | Alias estable de una IP para que el analista razone sin verla. |
| **Sustentación** | Defensa académica del proyecto ante el SENA. Tiene su propio sistema de presentación. |
| **Tarifario** | `src/data/tarifario.ts`, única fuente de precios. |
| **Tarpit** | Respuesta deliberadamente lenta de un señuelo. |
| **Vigía (del repo)** | Agente de Managed Agents que revisa el repo cada noche. |
| **Vigía (de agenda)** | Cron que vigila la agenda de Bookings del instructor de EP y avisa citas libres. |
| **Vitrina** | Cara pública de una herramienta interna (`/security`, `/status`, `/lab`), siempre con agregados. |
