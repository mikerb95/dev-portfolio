# Requisitos No Funcionales — Portfolio CodeByMike

## RNF-01 — Rendimiento

| ID | Requisito | Métrica objetivo |
|----|-----------|-----------------|
| RNF-01.1 | Las páginas públicas deben cargar en menos de 3 segundos en conexión media (4G). | LCP < 2.5s |
| RNF-01.2 | El Time to First Byte (TTFB) en páginas estáticas no debe superar 200ms. | TTFB < 200ms |
| RNF-01.3 | El Cumulative Layout Shift (CLS) debe mantenerse por debajo del umbral recomendado. | CLS < 0.1 |
| RNF-01.4 | Las APIs del panel admin deben responder en menos de 500ms bajo carga normal. | P95 < 500ms |
| RNF-01.5 | Las imágenes deben optimizarse y servirse en formato moderno (WebP/AVIF) con lazy loading. | — |

---

## RNF-02 — Seguridad

| ID | Requisito |
|----|-----------|
| RNF-02.1 | Los valores de variables de entorno deben almacenarse cifrados en la base de datos (AES-256 o equivalente). |
| RNF-02.2 | Todas las rutas `/admin/*` y `/api/*` privadas deben verificar autenticación en el servidor, no solo en el cliente. |
| RNF-02.3 | El sistema debe protegerse contra inyección SQL utilizando queries parametrizadas (Drizzle ORM). |
| RNF-02.4 | El sistema debe protegerse contra XSS sanitizando cualquier entrada de usuario antes de renderizarla. |
| RNF-02.5 | Los tokens de sesión deben ser HttpOnly y Secure. |
| RNF-02.6 | Las APIs públicas (ej. formulario de contacto) deben implementar rate limiting para prevenir abuso. |
| RNF-02.7 | El sitio debe servirse exclusivamente sobre HTTPS. |
| RNF-02.8 | Los errores de servidor no deben exponer stack traces ni información sensible al cliente. |

---

## RNF-03 — Disponibilidad y confiabilidad

| ID | Requisito | Métrica objetivo |
|----|-----------|-----------------|
| RNF-03.1 | El sitio público debe tener una disponibilidad mínima del 99.5% mensual. | Uptime ≥ 99.5% |
| RNF-03.2 | La plataforma de despliegue (Vercel) debe manejar failover automático. | — |
| RNF-03.3 | Los deployments deben ser zero-downtime (sin cortes durante actualizaciones). | — |
| RNF-03.4 | La base de datos debe tener backups automáticos periódicos. | — |

---

## RNF-04 — Usabilidad y accesibilidad

| ID | Requisito |
|----|-----------|
| RNF-04.1 | El sitio debe ser completamente navegable con teclado. |
| RNF-04.2 | El contraste de texto debe cumplir el estándar WCAG 2.1 AA (ratio mínimo 4.5:1 para texto normal). |
| RNF-04.3 | Todos los elementos interactivos deben tener estados de foco visibles. |
| RNF-04.4 | Las imágenes deben incluir atributos `alt` descriptivos. |
| RNF-04.5 | El sitio debe ser completamente responsive y funcional en móvil (≥ 320px), tablet y desktop. |
| RNF-04.6 | El panel admin debe ser funcional en pantallas desde 768px de ancho. |
| RNF-04.7 | El sistema debe soportar modo claro y oscuro, siguiendo la preferencia del sistema operativo. |

---

## RNF-05 — Mantenibilidad

| ID | Requisito |
|----|-----------|
| RNF-05.1 | El código debe estar escrito en TypeScript con tipado estricto (`strict: true`). |
| RNF-05.2 | El esquema de base de datos debe gestionarse a través de migraciones versionadas con Drizzle Kit. |
| RNF-05.3 | La estructura del proyecto debe seguir las convenciones de Astro (páginas en `src/pages/`, componentes en `src/components/`). |
| RNF-05.4 | Las variables de entorno sensibles no deben estar en el repositorio; deben gestionarse a través de Vercel o `.env` local excluido del VCS. |
| RNF-05.5 | El proyecto debe incluir un `README.md` actualizado con instrucciones de setup y comandos disponibles. |

---

## RNF-06 — Escalabilidad

| ID | Requisito |
|----|-----------|
| RNF-06.1 | La arquitectura debe soportar el agregado de nuevos módulos admin sin refactorizar los existentes. |
| RNF-06.2 | El sistema de cifrado de variables de entorno debe ser reemplazable sin cambios en la interfaz de usuario. |
| RNF-06.3 | El sitio debe poder manejar picos de tráfico aprovechando el CDN de Vercel para activos estáticos. |

---

## RNF-07 — SEO y metadatos

| ID | Requisito |
|----|-----------|
| RNF-07.1 | Cada página pública debe tener etiquetas `<title>` y `<meta description>` únicas y descriptivas. |
| RNF-07.2 | El sitio debe incluir un `sitemap.xml` generado automáticamente. |
| RNF-07.3 | El sitio debe incluir etiquetas Open Graph para compartir correctamente en redes sociales. |
| RNF-07.4 | Las URLs deben ser semánticas, en minúsculas y sin caracteres especiales. |

---

## RNF-08 — Compatibilidad de navegadores

| ID | Requisito |
|----|-----------|
| RNF-08.1 | El sitio debe funcionar correctamente en las dos últimas versiones de: Chrome, Firefox, Safari y Edge. |
| RNF-08.2 | El panel admin puede requerir navegadores modernos (últimas 2 versiones); no es necesario soporte para IE. |

---

## RNF-09 — Despliegue y entorno

| ID | Requisito |
|----|-----------|
| RNF-09.1 | El proyecto debe desplegarse en Vercel como plataforma principal. |
| RNF-09.2 | El entorno de producción, preview y desarrollo deben poder configurarse de forma independiente. |
| RNF-09.3 | El build de producción no debe incluir logs de debug ni herramientas de desarrollo. |
| RNF-09.4 | El tiempo de build no debe superar 3 minutos en condiciones normales. |
