# Página de Facebook: CodeByMike

Kit para crear y alimentar la página de Facebook. Público: negocios no técnicos
que necesitan página web (el mismo de `/paginas-web`). Todos los precios y
plazos salen de `src/data/tarifario.ts` y de `paginasWeb` en `src/i18n/es.ts`:
si cambian allá, hay que corregirlos aquí y en las imágenes.

Las imágenes están en `imagenes/` y se regeneran con
`node docs/facebook/fuente/render.mjs` (textos y diseño en `fuente/piezas.html`;
la marca es la M del favicon con el cursor cyan).

## 1. Datos de la página

| Campo | Valor |
| --- | --- |
| Nombre | Codebymike (id 61569418932008; "CodeByMike" chocaba con otra página propia) |
| Usuario | `@codebymike` (si está ocupado: `@codebymike.web`) |
| Categorías | Software · Diseñador web · Empresa de tecnología de la información |
| Intro (bio corta, máx. 101) | Páginas web para negocios en Colombia. Tú me cuentas, yo la construyo. Desde $650.000. |
| Sitio web | https://codebymike.net/paginas-web |
| WhatsApp | +57 310 464 1228 |
| Correo | mikedrb@proton.me (el de @codebymike.net todavía no recibe correo) |
| Área de servicio | Bogotá, Medellín y Cali (Facebook no acepta el país entero), sin dirección física |
| Horario | Facebook solo lo permite con dirección física, así que queda sin horario |
| Botón principal | Enviar mensaje por WhatsApp |
| Foto de perfil | `imagenes/perfil.png` (1080×1080) |
| Portada | `imagenes/portada.png` (1640×624, lo importante queda en la franja que se ve en el celular) |

### Descripción larga (sección "Información")

> Hago páginas web para negocios locales, profesionales independientes,
> emprendedores y pymes en Colombia.
>
> Tú me cuentas qué haces y yo me encargo de todo lo demás: diseño, dominio,
> publicación y que aparezcas en Google. Sin palabras raras y sin plantillas:
> cada página la construye un ingeniero de software.
>
> Planes:
> • Presencia, $650.000: una página con tu dominio, botón de WhatsApp y Google
>   Maps. Lista en 3 a 5 días.
> • Negocio, $1.500.000: varias secciones, catálogo y SEO local. Lista en 1 a 2
>   semanas.
> • A medida, desde $4.500.000: tienda en línea o reservas con pagos en línea.
>   Lista en 3 a 6 semanas.
>
> El primer año de dominio y hosting va incluido. Pagas la mitad para empezar
> y la otra mitad cuando la página está lista.
>
> Escríbeme por WhatsApp y te respondo el mismo día.

### Respuesta automática de Messenger

> ¡Hola! Gracias por escribir. Soy Mike y hago páginas web para negocios.
> Para responderte más rápido, escríbeme por WhatsApp al 310 464 1228 o
> cuéntame aquí qué tipo de negocio tienes y qué te gustaría lograr con tu
> página. Te respondo el mismo día.

Preguntas frecuentes sugeridas para Messenger:

1. ¿Cuánto cuesta una página? → Desde $650.000 el plan Presencia. Los tres planes están en codebymike.net/paginas-web.
2. ¿Cuánto se demora? → Desde 3 días la más sencilla, hasta 6 semanas para una tienda o un sistema de reservas.
3. ¿Tengo que saber algo técnico? → No. Tú me mandas fotos, textos y datos, yo hago el resto.

## 2. Calendario de los primeros 12 posts

Tres por semana (lunes, miércoles, viernes), a las 7:00 p. m., hora en que más
gente revisa Facebook después del trabajo. Se pueden programar todos de una vez
desde Meta Business Suite.

| # | Fecha | Imagen | Tema |
| --- | --- | --- | --- |
| 1 | lun 26 oct | `01-presentacion.png` | Quién soy |
| 2 | mié 28 oct | `02-para-ti.png` | ¿Esto es para ti? |
| 3 | vie 30 oct | `05-caso-dobleyo.png` | Caso: DobleYo Café |
| 4 | lun 2 nov | `04-planes.png` | Planes y precios |
| 5 | mié 4 nov | `03-lo-que-consigues.png` | Lo que consigues |
| 6 | vie 6 nov | `08-caso-gorillaz.png` | Caso: Gorillaz Motorbikes |
| 7 | lun 9 nov | `07-redes-y-web.png` | Redes vs. página propia |
| 8 | mié 11 nov | `06-como-funciona.png` | Cómo funciona |
| 9 | vie 13 nov | `11-caso-toledo.png` | Caso: Toledo Producciones |
| 10 | lun 16 nov | `10-google.png` | Busca tu negocio en Google |
| 11 | mié 18 nov | `09-de-quien-es.png` | ¿De quién es la página? |
| 12 | vie 20 nov | `12-como-se-paga.png` | Cuentas claras |

Los casos van alternados con los posts de venta para que la página no parezca
un catálogo. Antes de publicar cada caso conviene avisarle al cliente (y, si
tiene página de Facebook, etiquetarlo: eso multiplica el alcance).

## 3. Textos de los posts

### 1. Presentación

> Hola, soy Mike 👋
>
> Soy ingeniero de software y hago páginas web para negocios en Colombia.
>
> Mi trabajo es simple de explicar: tú me cuentas qué haces y qué quieres
> lograr, y yo me encargo del diseño, del dominio, de dejarla en línea y de que
> aparezcas en Google. Tú no tienes que tocar nada técnico.
>
> En esta página vas a ver los negocios con los que ya trabajé, los precios
> (sin letra pequeña) y consejos para que tu negocio se vea bien en internet.
>
> ¿Tienes un negocio y todavía no tienes página? Escríbeme por WhatsApp al
> 310 464 1228 y lo conversamos, sin compromiso.
>
> #PáginasWeb #Emprendimiento #NegociosColombia

### 2. ¿Esto es para ti?

> ¿Te reconoces en alguno de estos? 👇
>
> 1️⃣ Tienes un negocio local y la gente te encuentra en redes, pero no tienes
> a dónde mandarlos.
> 2️⃣ Eres profesional independiente: te recomiendan de boca en boca, pero no hay
> nada en internet que dé confianza.
> 3️⃣ Estás emprendiendo: tienes la idea y las ganas, pero no un lugar propio en
> internet.
> 4️⃣ Ya tienes una empresa y tu web se ve vieja o no vende.
>
> Si dijiste "ese soy yo", hablemos. Cuéntame en los comentarios cuál es tu
> caso o escríbeme al 310 464 1228.
>
> #PáginasWeb #Pymes #Emprendedores

### 3. Caso: DobleYo Café

> ☕ Ya en línea: DobleYo Café
>
> Café de especialidad colombiano con tienda en línea propia. Sus clientes
> pueden comprar, suscribirse para recibir café cada mes, mandar regalos y
> conocer la historia de cada lote, desde la finca hasta la taza.
>
> Una tienda así es el plan A medida: catálogo, pagos en línea y un panel para
> manejarla sin depender de nadie.
>
> Míralo tú mismo: https://dobleyo.cafe
>
> ¿Vendes un producto y quieres tu propia tienda? Escríbeme al 310 464 1228.
>
> #TiendaEnLínea #CaféColombiano #PáginasWeb

### 4. Planes y precios

> 💰 Precios claros, sin letra pequeña.
>
> 🔹 Presencia, $650.000
> Una página con tu dominio propio (tunegocio.com), botón de WhatsApp y Google
> Maps. Lista en 3 a 5 días.
>
> 🔹 Negocio, $1.500.000 (el más elegido)
> Varias secciones, catálogo o lista de servicios, formulario de contacto y SEO
> local. Lista en 1 a 2 semanas.
>
> 🔹 A medida, desde $4.500.000
> Tienda en línea o reservas, con pagos por tarjeta, PSE o Nequi. Lista en 3 a
> 6 semanas.
>
> El primer año de dominio y hosting va incluido en todos.
>
> ¿No sabes cuál te conviene? Escríbeme al 310 464 1228 y en 5 minutos te digo.
> Todos los detalles: https://codebymike.net/paginas-web
>
> #PáginasWeb #DiseñoWeb #NegociosColombia

### 5. Lo que consigues

> Una página web no es para "estar en internet". Es para que te lleguen
> clientes mientras tú atiendes tu negocio.
>
> ✅ Apareces en Google cuando alguien busca lo que ofreces.
> ✅ Te escriben por WhatsApp con un solo botón.
> ✅ Se ve profesional en el celular y en el computador.
> ✅ Tú no tocas nada técnico: dominio, diseño y publicación corren por mi
> cuenta.
>
> ¿Cuánto cliente se te está yendo porque no te encuentra? Hablemos:
> 310 464 1228.
>
> #PáginasWeb #MarketingDigital #Emprendimiento

### 6. Caso: Gorillaz Motorbikes

> 🏍️ Ya en línea: Gorillaz Motorbikes
>
> Taller de motos en Bogotá. En su página muestran los servicios del taller,
> tienen un club para sus clientes y, lo mejor, el cliente puede agendar o
> consultar el estado de su moto sin tener que llamar.
>
> Menos llamadas para el taller, más tranquilidad para el cliente.
>
> Míralo: https://gorillazmotorbikes.com
>
> ¿Tu negocio vive contestando las mismas preguntas por teléfono? Una página
> puede responderlas por ti. 310 464 1228.
>
> #TallerDeMotos #Bogotá #PáginasWeb

### 7. Redes vs. página propia

> Algo que poca gente te dice 👇
>
> Las redes sociales son buenísimas para que te conozcan. Pero cuando alguien
> ya está interesado, en redes tiene que buscar el precio entre comentarios,
> esperar a que respondas un mensaje o adivinar cómo comprarte.
>
> En tu página encuentra de una vez qué vendes, cuánto cuesta y un botón para
> escribirte. Y el dominio es tuyo: no depende de que una aplicación cambie
> sus reglas o te cierre la cuenta.
>
> Redes para que te encuentren, página para que te compren.
>
> #MarketingDigital #Emprendedores #PáginasWeb

### 8. Cómo funciona

> ¿Cómo es trabajar conmigo? Tres pasos 👇
>
> 1️⃣ Me cuentas. Me dices qué haces y qué quieres lograr. Yo te guío, no
> necesitas saber nada técnico.
>
> 2️⃣ Yo diseño. Armo tu página, escojo colores, ordeno la información y te la
> muestro. Tienes dos rondas de cambios incluidas.
>
> 3️⃣ Publicamos. Me encargo del dominio y de dejarla en línea. Tú solo la
> compartes y recibes clientes.
>
> El primer paso es un mensaje: 310 464 1228.
>
> #PáginasWeb #Pymes #NegociosColombia

### 9. Caso: Toledo Producciones

> 🎉 Ya en línea: Toledo Producciones
>
> Productora de eventos en Bogotá. Su página está en español y en inglés,
> muestra sus paquetes con precio y la galería de eventos, y tiene un panel
> propio para que el equipo la actualice sin pedirle ayuda a nadie.
>
> Míralo: https://toledoproducciones.org
>
> ¿Quieres poder cambiar tus textos y fotos tú mismo? Eso viene en el plan A
> medida. Escríbeme al 310 464 1228.
>
> #Eventos #Bogotá #PáginasWeb

### 10. Busca tu negocio en Google

> Haz esta prueba ahora: busca tu negocio en Google. ¿Qué aparece? 🔍
>
> ❌ Nada, o aparece tu competencia. El cliente que te buscaba ya le está
> escribiendo a otro.
> ❌ Solo un perfil de red social, sin precios a la vista ni forma rápida de
> contactarte.
> ✅ Tu página, con tu información y tu WhatsApp.
>
> Si te salió alguna de las dos primeras, el plan Presencia es para ti: desde
> $650.000, lista en 3 a 5 días y con Google Maps incluido.
>
> Cuéntame en los comentarios qué te salió 👇
>
> #Google #NegociosLocales #PáginasWeb

### 11. ¿De quién es la página?

> Pregunta que me hacen mucho: "Mike, ¿la página es mía o tuya?"
>
> Tuya. 🔑
>
> El dominio queda a tu nombre desde el principio, y el código y el diseño son
> tuyos cuando la pagas completa. Si un día quieres seguir con otra persona, te
> llevas todo. Nada de quedar amarrado.
>
> ¿Tienes otra duda? Pregúntame en los comentarios o al 310 464 1228.
>
> #PáginasWeb #Emprendimiento #ConsejosDeNegocio

### 12. Cuentas claras

> Sin sorpresas en la factura 🧾
>
> 💳 Pagas la mitad para empezar y la otra mitad cuando tu página está lista.
> Tarjeta, PSE, Nequi o transferencia.
> 🌐 El primer año de dominio y hosting va incluido. Desde el segundo año:
> $250.000 al año en Presencia y $400.000 en Negocio.
> 🛠️ 30 días de garantía: si algo no funciona como lo acordamos, lo arreglo sin
> costo.
> 📄 La cotización que te mando vale 15 días.
>
> ¿Arrancamos? 310 464 1228.
>
> #PáginasWeb #Pymes #NegociosColombia

## 4. Después de crearla

- Invitar a contactos propios a darle "Me gusta" (Facebook lo ofrece al crear
  la página); los primeros 50 a 100 seguidores le dan credibilidad.
- Compartir cada post en el perfil personal y en grupos de emprendedores de la
  ciudad, respetando las reglas de cada grupo.
- Responder comentarios y mensajes el mismo día: el algoritmo premia las
  páginas que responden rápido y la página muestra el tiempo de respuesta.
- Enlazar la página desde el sitio (footer y `sameAs` del JSON-LD de
  `src/pages/index.astro`) cuando ya tenga URL.
