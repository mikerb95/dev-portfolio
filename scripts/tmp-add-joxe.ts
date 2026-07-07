import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../src/db/schema'
import { projects, projectServices } from '../src/db/schema'
import { fetchDomainExpiry } from '../src/lib/domains'
import { eq } from 'drizzle-orm'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})
const db = drizzle(client, { schema })

async function main() {
  let [project] = await db.select().from(projects).where(eq(projects.slug, 'joxe'))
  if (!project) {
    ;[project] = await db
      .insert(projects)
      .values({
        slug: 'joxe',
        title: 'joxe',
        repoUrl: 'https://github.com/mikerb95/joxe',
        visible: false,
        status: 'activo',
        createdAt: new Date(),
      })
      .returning()
    console.log('Proyecto creado:', project)
  } else {
    console.log('Proyecto ya existía:', project)
  }

  const expiry = await fetchDomainExpiry('joxe.app')

  const [service] = await db
    .insert(projectServices)
    .values({
      projectId: project.id,
      name: 'joxe.app',
      category: 'domain',
      url: 'joxe.app',
      cost: 15,
      currency: 'USD',
      billingCycle: 'annual',
      renewalDate: expiry ?? undefined,
      autoRenew: true,
      active: true,
      payer: 'me',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning()

  console.log('Servicio de dominio creado:', { ...service, secrets: undefined })
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
