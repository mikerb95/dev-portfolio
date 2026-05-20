import type { APIRoute } from 'astro'
import { put, list } from '@vercel/blob'
import { db } from '../../../db'
import {
  clients,
  projects,
  messages,
  finances,
  projectEnvVars,
  projectServices,
  projectContacts,
  projectAdrs,
  educationMilestones,
  briefings,
} from '../../../db/schema'

const CRON_SECRET = import.meta.env.CRON_SECRET

async function runBackup(): Promise<{ url: string; size: number; pathname: string }> {
  const [
    clientsData,
    projectsData,
    messagesData,
    financesData,
    envVarsData,
    servicesData,
    contactsData,
    adrsData,
    educationData,
    briefingsData,
  ] = await Promise.all([
    db.select().from(clients),
    db.select().from(projects),
    db.select().from(messages),
    db.select().from(finances),
    db.select().from(projectEnvVars),
    db.select().from(projectServices),
    db.select().from(projectContacts),
    db.select().from(projectAdrs),
    db.select().from(educationMilestones),
    db.select().from(briefings),
  ])

  const dump = {
    meta: { createdAt: new Date().toISOString(), version: 1 },
    clients: clientsData,
    projects: projectsData,
    messages: messagesData,
    finances: financesData,
    projectEnvVars: envVarsData,
    projectServices: servicesData,
    projectContacts: contactsData,
    projectAdrs: adrsData,
    educationMilestones: educationData,
    briefings: briefingsData,
  }

  const json = JSON.stringify(dump, null, 2)
  const date = new Date().toISOString().slice(0, 10)
  const pathname = `backups/portfolio-${date}-${Date.now()}.json`

  const blob = await put(pathname, json, {
    access: 'private',
    contentType: 'application/json',
  })

  return { url: blob.url, size: json.length, pathname }
}

// Called by Vercel cron (Authorization: Bearer CRON_SECRET)
export const POST: APIRoute = async ({ request }) => {
  const auth = request.headers.get('authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return new Response(JSON.stringify({ error: 'no autorizado' }), { status: 401 })
  }

  try {
    const result = await runBackup()
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 })
  } catch (err) {
    console.error('[backup]', err)
    return new Response(JSON.stringify({ error: 'backup fallido' }), { status: 500 })
  }
}

// Called manually from /admin/backup (session-protected by middleware)
export const PUT: APIRoute = async () => {
  try {
    const result = await runBackup()
    return new Response(JSON.stringify({ ok: true, ...result }), { status: 200 })
  } catch (err) {
    console.error('[backup]', err)
    return new Response(JSON.stringify({ error: 'backup fallido' }), { status: 500 })
  }
}

// List existing backups
export const GET: APIRoute = async () => {
  try {
    const { blobs } = await list({ prefix: 'backups/' })
    const sorted = blobs
      .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
      .slice(0, 30)
    return new Response(JSON.stringify(sorted), { status: 200 })
  } catch (err) {
    return new Response(JSON.stringify([]), { status: 200 })
  }
}
