import { z } from 'zod'

// Esquemas del "shape" de respuesta de los endpoints públicos/clave. No
// validan valores de negocio (eso lo hacen los tests unitarios de cada lib) —
// validan que el CONTRATO no cambie sin que alguien se entere. Un campo que
// desaparece, cambia de tipo o se renombra rompe el test correspondiente en
// tests/contracts.test.ts.
//
// Front y API viven en el mismo repo: un cambio de forma se detecta en CI
// antes de llegar a producción, sin necesitar Pact ni un consumidor separado.
// Si algún día SlideHub u otro servicio consume estas respuestas desde fuera
// del repo, ahí sí valdría la pena Pact (consumer-driven, entre repos).

export const HealthResponseSchema = z.object({
  ok: z.boolean(),
  sha: z.string().nullable(),
  env: z.string(),
  region: z.string().nullable(),
  checks: z.object({
    db: z.object({
      ok: z.boolean(),
      ms: z.number(),
      error: z.string().nullable(),
    }),
  }),
  ts: z.string(),
})

export const CheckoutResponseSchema = z.object({
  replayed: z.boolean(),
  payment: z.object({
    reference: z.string(),
    status: z.enum(['created', 'pending', 'approved', 'declined', 'error', 'voided']),
    amountCents: z.number().int(),
    currency: z.string(),
    provider: z.enum(['wompi', 'mock']),
  }),
  checkout: z.union([
    z.object({
      provider: z.literal('wompi'),
      publicKey: z.string(),
      reference: z.string(),
      amountInCents: z.number().int(),
      currency: z.string(),
      signatureIntegrity: z.string(),
      'redirect-url': z.string(),
    }),
    z.object({
      provider: z.literal('mock'),
      confirmUrl: z.string(),
    }),
  ]),
})

export const StatusLatencyResponseSchema = z.object({
  series: z.record(
    z.string(),
    z.array(z.object({ ms: z.number(), ok: z.boolean() }))
  ),
  status: z.record(
    z.string(),
    z.object({
      status: z.enum(['up', 'degraded', 'down', 'unknown']),
      checkedAt: z.number().nullable(),
      ms: z.number().nullable(),
    })
  ),
  ts: z.number(),
})

export const SloResponseSchema = z.object({
  objective: z.number(),
  days: z.number(),
  results: z.array(
    z.object({
      monitor: z.object({ id: z.number(), name: z.string(), url: z.string() }),
      slo: z.object({
        sliPct: z.number().nullable(),
        meetsObjective: z.boolean(),
        budgetRemainingPct: z.number().nullable(),
        remainingMinutes: z.number().nullable(),
      }),
      health: z.enum(['healthy', 'warning', 'critical', 'exhausted']),
    })
  ),
})
