# Plan: definición de la oferta principal

> Estado: **propuesta v1, sin validar con el usuario** · Creado: 2026-08-08
> Depende de: `docs/plan-diseno-web.md` (que este documento reordena).

## Decisión de posicionamiento

**La oferta principal es el escalón "A medida" de `/paginas-web`: software para
negocios que venden.** Tiendas, reservas y citas, pagos en línea, paneles,
integraciones.

No es el landing de $650k (ticket bajo, trabajo que el usuario no quiere hacer
en volumen) ni la consultoría de plataforma de 9 semanas que describe hoy la
sección "Proceso" de la home (no existe como producto, y su comprador no llega
por los canales activos).

### Por qué

Contexto declarado por el usuario (ago 2026):

- **Horizonte**: posicionamiento a 6-12 meses, sin urgencia de caja. Cae el
  argumento de liderar con planes baratos para generar efectivo rápido.
- **Trabajo deseado**: software con lógica de negocio. No es consultoría
  técnica para equipos ajenos, y no es volumen de landings.
- **Canales vivos**: referidos locales, búsqueda local en Google, y comunidad
  técnica. "A medida" es el único punto donde los tres empujan al mismo sitio:
  los dos primeros traen dueños de negocio, el tercero da la credibilidad que
  justifica el precio.

### Consecuencia para el resto del sitio

- **Presencia / Negocio**: no desaparecen, bajan a puerta de entrada. Alimentan
  el canal de búsqueda local y producen los primeros testimonios y los ascensos
  al escalón principal.
- **La marca técnica** (`/lab`, `/status`, `/security`, `/notes`): deja de ser
  el plato principal y pasa a ser capa de credibilidad y de precio. Es la
  respuesta a "¿por qué te pago 5 veces más que al que hace páginas?", no la
  portada.
- **Sección "Proceso" de la home**: obsoleta tal como está. Describe 9+ semanas
  con mentoring al equipo del cliente. El comprador de esta oferta no tiene
  equipo técnico.

### El argumento de venta que habilita todo el laboratorio

Este es el único encuadre en el que el aparato técnico del repo le importa a
alguien que no es ingeniero:

> Tu tienda va a cobrar dinero de verdad. Si un pago se duplica o el sitio se
> cae un sábado, eso te cuesta plata. Yo mido el uptime, garantizo que ningún
> cobro se duplique, y te doy un panel donde ves tu proyecto.

Idempotencia en pagos (`src/lib/payments.ts`), monitoreo (`/status`), portal de
clientes (`/portal`): dejan de ser exhibición técnica y pasan a ser gestión de
riesgo de un negocio que factura.

---

## 1. Nombre

El problema de "A medida" es que nombra una ausencia de producto, no un
producto. La serie actual son sustantivos que describen una etapa del negocio:
Presencia (existes) → Negocio (te encuentran) → ?

**Propuesta: `Operación`.**
Bajada: *"Vende, cobra y agenda desde tu propia web."*

Mantiene la serie, y nombra lo que el cliente compra: que su negocio **opere**
en línea, no que exista en línea.

**Alternativa si "Operación" se siente abstracta para el comprador:
`Ventas`**, con la bajada *"Tu tienda o tu agenda, cobrando en línea."* Más
concreto y más buscable, pero deja fuera al que solo quiere reservas y no
vende productos.

---

## 2. Alcance

La clave para que sea un producto y no un presupuesto abierto: **una sola
capacidad transaccional en el precio base**. Tienda **o** reservas, no ambas.

### Incluye siempre

- **Sesión de descubrimiento**: cómo vende o agenda hoy, qué se automatiza y
  qué no. Es el "Diagnóstico" del proceso viejo, comprimido a días.
- **La web completa**: todo lo del plan Negocio (secciones, catálogo, SEO
  local, móvil, dominio).
- **Una capacidad transaccional**: tienda en línea **o** sistema de
  reservas/citas.
- **Pagos en línea**: Wompi (tarjeta, PSE, Nequi), con idempotencia real.
- **Panel del cliente**: ve sus pedidos o reservas y el estado del proyecto.
  Ya construido (`/portal`).
- **Monitoreo con alerta**: si el sitio se cae, se entera él y me entero yo.
  Ya construido.
- **Capacitación**: una sesión grabada para que su equipo lo use.
- **30 días de ajustes** incluidos tras la entrega.

**Tiempo de entrega: 3 a 6 semanas.**

### Se cotiza aparte

- Segunda capacidad transaccional (tienda **y** reservas en el mismo proyecto).
- Integraciones a terceros: facturación electrónica, inventario, ERP,
  WhatsApp Business API.
- Migración masiva de catálogo o de datos históricos.
- Contenido: fotos, textos, copywriting.
- Mantenimiento continuo (ver §4).

---

## 3. Precio piso

**Hipótesis: `desde $4.500.000 COP` · `from $1.500 USD` para `/en`.**

Cómo sale el número, para poder discutirlo:

- Negocio está en $1.5M por 1-2 semanas de trabajo.
- Operación son 3-6 semanas, más pagos reales, más panel, más monitoreo.
  Aproximadamente 3x el esfuerzo, de ahí el 3x del precio.
- Deja espacio suficiente por encima para que los proyectos grandes se coticen
  sin que el piso parezca mentira.

**El número lo fija el usuario.** Lo que no es negociable para la conversión es
que haya un piso visible: un botón que dice "Cotización" en la oferta principal
es fricción máxima y filtra al revés (espanta al que sí paga, atrae al que
quiere regatear).

---

## 4. El pedazo recurrente (la pieza que falta)

Vender proyectos de una sola vez desperdicia el activo más caro que ya está
construido: todo el aparato de monitoreo, SLOs y observabilidad **es un
producto de mantenimiento**, no de entrega.

**Propuesta: plan mensual, desde `$300.000 COP/mes`.** Incluye:

- Monitoreo y alertas del sitio (ya operando, coste marginal cercano a cero).
- Respaldos y actualizaciones de seguridad.
- Una bolsa mensual de cambios pequeños (por ejemplo 2 horas).
- Acceso al panel con el estado real del servicio.

Esto convierte trabajo técnico ya hecho y ya pagado en ingreso recurrente, y es
lo que hace que el horizonte de 6-12 meses se acumule en vez de reiniciarse con
cada proyecto.

---

## 5. El hueco que ninguna de estas tres cosas tapa

**No hay un solo caso con un número de negocio detrás.** Nombre, alcance y
precio hacen que la oferta exista; un caso real es lo que la hace creíble. Es
la pieza de mayor impacto pendiente, y solo se consigue entregando.

Hasta tenerlo, la prueba social honesta sigue siendo la que ya está en
`/paginas-web`: "Tu negocio aquí · Próximamente".

---

## 6. Qué se toca cuando esto se apruebe

Nada de esto está hecho. Orden sugerido:

1. `src/i18n/es.ts` + `en.ts`: renombrar el plan, alcance nuevo, bajada.
2. `src/pages/paginas-web.astro`: precio piso en `PRICES`, mover `destacado` al
   plan principal, CTA sin "Cotización".
3. Página propia para la oferta principal (hoy es un tercio de sección).
4. Home: hero con oferta concreta, reemplazo de la sección "Proceso",
   badge de disponibilidad, CTA de respaldo que no caiga en "Certificaciones".
5. Plan mensual: definir si es página, sección, o solo argumento de venta.
6. `docs/plan-diseno-web.md`: actualizar, que hoy dice "dos puertas, una casa"
   con `/paginas-web` como puerta secundaria.
