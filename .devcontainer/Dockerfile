# Entorno de desarrollo reproducible. Resuelve un fallo concreto y documentado
# en CLAUDE.md: el shell por defecto puede traer Node 20 y eso rompe
# `astro build`. Aquí Node es 22.12 siempre, para todo el mundo, sin nvm.
#
# Pineado por digest y no por tag: `node:22.12-bookworm` puede reconstruirse con
# parches distintos mañana. Si la reproducibilidad depende de que nadie mueva un
# tag, no es reproducibilidad.
FROM node:22.12-bookworm@sha256:0e910f435308c36ea60b4cfd7b80208044d77a074d16b768a81901ce938a62dc

# Debe coincidir con @playwright/test en package.json: Playwright se niega a
# usar navegadores instalados por otra versión, y descubrirlo en CI es tarde.
ARG PLAYWRIGHT_VERSION=1.61.1

# Las dependencias de sistema de Chromium necesitan root; los navegadores en sí
# se instalan como `node` para que queden en su HOME y no haya que corregir
# permisos después.
RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install-deps chromium \
    && rm -rf /var/lib/apt/lists/*

USER node

RUN npx --yes playwright@${PLAYWRIGHT_VERSION} install chromium

# Solo chromium: es el único proyecto declarado en playwright.config.ts. Bajar
# firefox y webkit sería triplicar la imagen para navegadores que nadie ejecuta.
ENV PLAYWRIGHT_BROWSERS_PATH=/home/node/.cache/ms-playwright

WORKDIR /workspace
