# Propuesta: workshop de Claude Managed Agents

Comunidad Claude Bogotá · sábado 24 oct 2026 · enviar al organizador por
privado antes del domingo 11 oct. Duración supuesta: 3 horas (el anuncio no la
dice; si es otra, se ajustan los bloques de la dinámica).

## Versión para WhatsApp (copiar y pegar)

> Hola, te mando mi propuesta para el workshop de Managed Agents del 24.
>
> **1. Título**
> Tu primer agente que trabaja de noche: Claude Managed Agents de cero a producción
>
> **2. Propuesta**
> Cada asistente sale con un agente desplegado que revisa su propio repositorio cada noche (dependencias vulnerables, tests, tipos, headers de seguridad del sitio), le deja un informe priorizado y le pide permiso antes de abrir un issue o un PR. Veremos agentes versionados, entornos con red cerrada, sesiones con tope de gasto, credenciales en vault, aprobación humana, ejecución programada y memoria entre corridas.
>
> Por qué yo: ya lo tengo corriendo sobre mi sitio en producción (codebymike.net). En la primera corrida, por US$1,91 y unos 10 minutos de contenedor, el agente encontró un bug que yo no había visto: el deck de mi sustentación publicaba "NaN commits"; además probó en una copia una actualización de dependencias que quitaba un aviso crítico y encontró headers de seguridad que faltaban en las redirecciones del panel. Lo arreglé y lo dejé en PRs públicos. En el meetup del 1 de octubre mostré un analista de seguridad hecho con Agent SDK; en el workshop pongo los dos lado a lado para que se vea qué resuelve la plataforma y qué decisiones siguen siendo nuestras (permisos, costos, qué no dejarle hacer).
>
> **3. Dinámica (3 h, 25% explicación y 75% práctica)**
> - 0:00-0:25 Conceptos: Messages API vs Agent SDK vs Managed Agents, y cuándo NO usar un agente.
> - 0:25-0:40 Demo en vivo: el informe real del vigía y el mismo agente en las dos versiones.
> - 0:40-1:30 Práctica 1: definir el agente y el entorno como archivos, `ant apply`, primera sesión sobre tu repo con tope de gasto.
> - 1:30-1:40 Pausa.
> - 1:40-2:20 Práctica 2: credenciales en vault, aprobación humana antes de escribir, rúbrica de calidad del informe.
> - 2:20-2:45 Práctica 3: programarlo cada noche con tope y memoria.
> - 2:45-3:00 Muestra de 2 o 3 agentes de los asistentes y preguntas.
>
> Comparto un repo plantilla antes del taller para que nadie pierda tiempo instalando. Lo que necesitaría coordinar contigo: cómo consiguen los asistentes créditos de API (cada sesión de práctica cuesta entre US$0,50 y US$2).

## Evidencia para adjuntar

- PR del agente: https://github.com/mikerb95/dev-portfolio/pull/4
- PR con los arreglos de lo que encontró: https://github.com/mikerb95/dev-portfolio/pull/5
- Captura sugerida: la sesión en la Console (`sesn_01SQcrKSjaDPKkgB9WtDL8k3`) o
  el encabezado del informe con el estado amarillo.

## Logística a resolver con el organizador

1. **Créditos de API.** Es el bloqueo principal: sin créditos no hay práctica.
   Opciones: que cada asistente traiga cuenta con saldo (avisar una semana
   antes), créditos de la comunidad, o pedirlos a Anthropic para el evento.
2. **Duración y sala.** Confirmar las 3 horas, wifi capaz de soportar a todos
   haciendo `npm ci` a la vez (los contenedores corren en la nube, pero la CLI
   y la Console sí usan la red del salón), y enchufes.
3. **Requisitos previos** para el anuncio: cuenta en platform.claude.com, la
   CLI `ant` instalada (binario de GitHub releases, no está en npm) y un repo
   propio en GitHub (público para la práctica 1).
4. **Plan B por ser beta.** Si la API cambia antes del 24, ensayo el 22 o el
   23; si algo falla en vivo, la demo grabada y el informe real sostienen la
   parte conceptual.
