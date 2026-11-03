import { createClient } from '@libsql/client';
import { resumenVigilancia, semanasTerminadas, fraseVigilancia, fmtSemanaCompleta } from './src/lib/ep-agenda';
const c = createClient({ url: process.env.TURSO_DATABASE_URL ?? process.env.TURSO_URL!, authToken: process.env.TURSO_AUTH_TOKEN });
const est = JSON.parse(String((await c.execute("select value from app_settings where key='ep_agenda_estado'")).rows[0].value));
for (const l of semanasTerminadas(est.inicio, Date.now())) {
  const r = await c.execute({ sql: "select ok, detail, created_at from cron_runs where created_at >= ? and created_at < ? and job='ep-agenda'", args: [l/1000, (l+7*86400000)/1000] });
  const s = resumenVigilancia(l, est.inicio, r.rows.map(x => ({ en: Number(x.created_at)*1000, ok: !!x.ok, detalle: x.detail as string })), []);
  console.log(`Semana del ${fmtSemanaCompleta(l)}. ${fraseVigilancia(s)}`);
}
