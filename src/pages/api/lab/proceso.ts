import type { APIRoute } from 'astro'
import os from 'node:os'

// Métricas de proceso para las pruebas de carga/estrés de `lab/k6`: el ritmo
// de peticiones no dice nada de cuánta CPU o memoria le cuesta al proceso
// servirlas, y esa era la columna que faltaba junto a p95 y % error para
// completar el mismo cuadro que un escalón de un taller clásico de pruebas
// de estrés (throughput, p95, % error, CPU/heap, observación).
//
// Solo existe en `astro dev`: en producción esto sería un endpoint público
// filtrando el estado interno del proceso, y el LAB nunca corre carga contra
// producción de todas formas (`objetivo()` en lab/k6/lib/perfil.js lo
// prohíbe). `import.meta.env.DEV` es `false` en cualquier build desplegado
// a Vercel, así que no depende de un flag aparte que alguien pueda olvidar
// apagar.

let ultimaMuestra: { enMs: number; cpu: NodeJS.CpuUsage } | null = null

export const GET: APIRoute = async () => {
  if (!import.meta.env.DEV) {
    return new Response('not found', { status: 404 })
  }

  const ahora = Date.now()
  const cpuAbs = process.cpuUsage()

  // % de CPU desde la muestra anterior, normalizado por número de núcleos:
  // sin esto, un proceso con varios hilos activos marcaría fácilmente más de
  // 100 % y el número dejaría de leerse como un porcentaje.
  let cpuPct = 0
  if (ultimaMuestra) {
    const usoUs = (cpuAbs.user - ultimaMuestra.cpu.user) + (cpuAbs.system - ultimaMuestra.cpu.system)
    const wallUs = (ahora - ultimaMuestra.enMs) * 1000
    const nucleos = os.cpus().length || 1
    cpuPct = wallUs > 0 ? (usoUs / wallUs / nucleos) * 100 : 0
  }
  ultimaMuestra = { enMs: ahora, cpu: cpuAbs }

  const mem = process.memoryUsage()
  const body = {
    ok: true,
    cpuPct: Number(Math.max(0, cpuPct).toFixed(1)),
    heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(1)),
    heapTotalMb: Number((mem.heapTotal / 1024 / 1024).toFixed(1)),
    rssMb: Number((mem.rss / 1024 / 1024).toFixed(1)),
  }

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}
