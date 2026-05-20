import { defineMiddleware } from 'astro:middleware'
import { getSession } from 'auth-astro/server'

export const onRequest = defineMiddleware(async (context, next) => {
  if (context.url.pathname.startsWith('/admin') || context.url.pathname.startsWith('/api/admin')) {
    const session = await getSession(context.request)
    if (!session) return context.redirect('/api/auth/signin')
  }
  return next()
})
