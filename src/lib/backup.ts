import { put } from '@vercel/blob'
import { db } from '../db'
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
} from '../db/schema'

// Volcado de las tablas de negocio a un JSON en Vercel Blob.
//
// Vive aquí y no dentro de una ruta porque lo disparan dos: el cron
// (`/api/cron/backup`) y el botón manual del panel (`/api/admin/backup`). Antes
// eran el mismo archivo bajo `/api/admin/`, y esa ubicación era el bug: el
// middleware exige sesión a todo lo que cuelga de `/api/admin/`, así que el
// cron de Vercel (que manda Bearer CRON_SECRET pero ninguna cookie) se comía un
// 302 a /login sin llegar nunca al handler.

export type BackupResult = { url: string; size: number; pathname: string }

/** Vuelca las tablas de negocio y sube el JSON. Lanza si algo falla. */
export async function runBackup(): Promise<BackupResult> {
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
