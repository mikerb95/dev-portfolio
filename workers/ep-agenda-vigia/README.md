# ep-agenda-vigia

Revisa la agenda del instructor (Microsoft Bookings) cada minuto desde un
Cloudflare Worker gratuito y solo llama a Vercel (`/api/cron/ep-agenda`) cuando
cambian las citas libres. Contexto en `src/index.ts` y en RF-040.

## Puesta en marcha (una vez)

```bash
cd workers/ep-agenda-vigia
npx wrangler login
npx wrangler secret put TURSO_URL     # el mismo TURSO_DATABASE_URL del sitio (base principal, no la demo)
npx wrangler secret put TURSO_TOKEN   # mejor un token propio: turso db tokens create <base>
npx wrangler secret put CRON_SECRET   # el mismo CRON_SECRET de Vercel
npx wrangler deploy
npx wrangler tail                     # ver las corridas en vivo
```

Después, en cron-job.org: **desactivar `ep-agenda-aperturas`** (el Worker ya
cubre cada minuto) y **dejar `ep-agenda`** (cada 10 min, respaldo).

Plan gratuito de Workers: crons de 1 min sin costo, 100.000 peticiones/día y
10 ms de CPU por corrida (esperar a Bookings no cuenta).
