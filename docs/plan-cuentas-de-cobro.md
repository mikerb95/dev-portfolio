# Plan: cuentas de cobro en el panel admin

Emisión, numeración, PDF y seguimiento de **cuentas de cobro** (persona
natural no responsable de IVA) desde `/admin`. Documento distinto de la
factura del portal (`invoices`, serie `INV-`), aunque comparte casi toda la
fontanería.

Estado: **implementado** (1 sep 2026). Fases 0-3 y 5 entregadas; la Fase 4
(envío por email/WhatsApp) queda fuera por ahora, ver §7.

---

## 1. Marco normativo colombiano

> Aviso: esto es investigación de ingeniería, no asesoría contable. Las
> tarifas y bases se guardan en `app_settings`, no en el código, precisamente
> para que un contador pueda corregirlas sin un deploy. Antes de emitir la
> primera cuenta de cobro real hay que validar la parametrización con un
> contador.

### 1.1 Qué es (y qué no es) una cuenta de cobro

La cuenta de cobro **no tiene una forma prescrita por la DIAN**. No es factura
de venta, no es documento equivalente y no es título valor. Es el soporte con
el que una persona natural **no obligada a facturar** solicita el pago de un
servicio prestado.

Quien no está obligado a expedir factura de venta ni documento equivalente son,
entre otros, los sujetos del **art. 616-2 del Estatuto Tributario**, y en
particular las personas naturales **no responsables de IVA** (art. 437,
parágrafo 3 ET: ingresos brutos del año anterior o del año en curso inferiores
a **3.500 UVT**, un solo establecimiento, no franquiciado, sin contratos de
venta de bienes/servicios gravados superiores a 3.500 UVT, consignaciones
bancarias inferiores a 3.500 UVT, entre otros topes). Con la **UVT 2026 =
$52.374**, 3.500 UVT ≈ **$183.309.000**.

La consecuencia de diseño más importante: **el documento con peso fiscal no es
mi cuenta de cobro, es el "Documento Soporte en Adquisiciones efectuadas a no
obligados a facturar" que genera y transmite el pagador** (Resolución DIAN
000167 de 2021, en desarrollo del art. 616-1 ET y del DUR 1625 de 2016). Ese
documento soporte se genera por cada operación el mismo día, o acumulado
semanalmente por proveedor; generarlo fuera de plazo o sin requisitos le cuesta
al pagador sanciones de los arts. 651 y 652 ET.

De ahí la regla de producto: **la cuenta de cobro debe traer exactamente los
datos que el pagador necesita para armar su documento soporte.** Si le falta el
NIT/cédula, la dirección, la fecha de la operación o la descripción del
servicio, el área contable la devuelve. Una cuenta de cobro "bonita" pero
incompleta es una cuenta de cobro rechazada, y ese es el fallo que este módulo
existe para evitar.

Segunda regla: **nunca titular el documento "FACTURA"**. Quien no es facturador
electrónico y titula "factura" está emitiendo un documento que no puede emitir.
El encabezado es literalmente `CUENTA DE COBRO`.

### 1.2 Contenido mínimo

Consolidado de lo que exigen en la práctica las áreas de pagos, y de lo que el
pagador necesita para su documento soporte:

| # | Campo | Por qué |
|---|-------|---------|
| 1 | Título `CUENTA DE COBRO` | No es factura; el título es parte del documento |
| 2 | Número consecutivo (`CC-2026-001`) | Trazabilidad; serie propia, distinta de `INV-` |
| 3 | Ciudad y fecha de expedición | La fecha de la operación alimenta el documento soporte del pagador |
| 4 | Emisor: nombre completo, cédula, dirección, ciudad, teléfono, email | Identifica al no obligado a facturar |
| 5 | Deudor: nombre o razón social, NIT/CC, dirección, ciudad | Sin NIT no hay documento soporte |
| 6 | `DEBE A` / `LA SUMA DE` (fórmula clásica) | Formato que las áreas contables reconocen sin fricción |
| 7 | Valor **en letras** y en números | Requisito de forma universal en la práctica colombiana |
| 8 | Concepto detallado del servicio | Descripción genérica = devolución |
| 9 | Periodo del servicio (si es contrato por meses) | "servicios prestados durante agosto de 2026" |
| 10 | Referencia de contrato / orden de compra | Casi siempre exigida por empresas |
| 11 | Leyenda: `No soy responsable del Impuesto sobre las Ventas - IVA` | Explica por qué no hay IVA ni factura electrónica |
| 12 | Leyenda de no obligado a facturar, con norma citada (art. 616-2 ET) | Blinda al pagador ante la DIAN |
| 13 | Retenciones aplicables (informativas) y neto a pagar | Evita la llamada "¿por qué me pagaron menos?" |
| 14 | Datos bancarios: banco, tipo de cuenta, número, titular | Sin esto no hay pago |
| 15 | Firma del emisor | Autoría del documento |
| 16 | Anexos declarados: RUT, planilla PILA, certificación bancaria | El paquete que suele exigirse junto al documento |

### 1.3 Retención en la fuente

El pagador agente retenedor (casi toda persona jurídica) descuenta la retención
y me paga el neto. La cuenta de cobro se emite por el **valor bruto**; el neto
se muestra como información, no como el valor cobrado.

Tarifas y bases vigentes 2026 (UVT 2026 = **$52.374**):

| Concepto | Tarifa | Base mínima |
|----------|--------|-------------|
| Honorarios y servicios personales - PN **declarante** | 11 % | desde $0 |
| Honorarios y servicios personales - PN **no declarante** | 10 % | desde $0 |
| Servicios generales - declarante | 4 % | 2 UVT (ver nota) |
| Servicios generales - no declarante | 6 % | 2 UVT (ver nota) |
| ReteICA (municipal, Bogotá y otros) | por mil, según actividad | según acuerdo municipal |

> **Nota crítica y motivo de diseño.** Las bases mínimas de servicios se
> movieron durante 2025-2026 con el Decreto 572 de 2025 y sus modificaciones
> (fuentes que consulté dan 2 UVT y 4 UVT según la vigencia que citan). Un
> número así, incrustado en el código, es un bug con temporizador. **Tarifas,
> bases en UVT y el valor de la UVT viven en `app_settings` y se versionan por
> año**; la cuenta de cobro emitida guarda un *snapshot* de lo que se aplicó,
> para que reimprimir un documento de hace ocho meses no lo recalcule con las
> tarifas de hoy.

La retención se calcula sobre el valor del servicio **sin IVA** (aquí no hay
IVA de todos modos).

### 1.4 Seguridad social del contratista

Decreto 1273 de 2018 y art. 244 de la Ley 1955 de 2019: el contratista
independiente cotiza sobre un **IBC del 40 % del valor mensualizado del
contrato** (descontando IVA), nunca inferior a **1 SMMLV**, y paga **mes
vencido** por PILA. Cuando el contratante es persona jurídica, patrimonio
autónomo, consorcio o unión temporal con al menos una persona jurídica, **debe
retener y girar los aportes**. Muchos pagadores exigen adjuntar la planilla PILA
del mes como condición para pagar.

Diseño: campos `ssPlanilla` y `ssPeriodo` en la cuenta de cobro, más una
calculadora informativa del IBC 40 % en el formulario. No liquidamos aportes:
solo se declara la planilla y se calcula el IBC de referencia.

### 1.5 Cuándo este módulo deja de ser válido

Si en el año supero los topes del art. 437 par. 3 ET, dejo de ser no
responsable de IVA y paso a estar obligado a **facturación electrónica**; la
cuenta de cobro deja de ser el soporte correcto. El panel debe avisar, no
descubrirlo el contador en marzo.

**Fase 3 incluye un semáforo de tope**: suma de cuentas de cobro emitidas en el
año en curso contra `3.500 UVT`, con aviso en el panel al 70 % y al 90 %. Es la
pieza que convierte el módulo en una herramienta de cumplimiento en vez de un
generador de PDFs.

### Fuentes

- [Cuenta de cobro para una persona natural no responsable de IVA - actualicese.com](https://actualicese.com/cuenta-de-cobro-para-una-persona-que-presta-servicios-y-no-es-responsable-de-iva/)
- [Cuentas de cobro en Colombia: guía práctica y requisitos - El Tiempo](https://www.eltiempo.com/economia/finanzas-personales/cuentas-de-cobro-en-colombia-guia-practica-y-requisitos-para-que-no-la-devuelvan-775760)
- [Resolución DIAN 000167 de 2021 (documento soporte)](https://normograma.dian.gov.co/dian//compilacion/docs/resolucion_dian_0167_2021.htm)
- [Documento soporte en adquisiciones a no obligados a facturar - Gerencie.com](https://www.gerencie.com/documento-soporte-en-adquisiciones-efectuadas-a-no-obligados-a-facturar.html)
- [Soporte adquisiciones no obligados - micrositio DIAN](https://micrositios.dian.gov.co/sistema-de-facturacion-electronica/soporte-adquisiciones-no-obligados/)
- [Generar el documento soporte fuera de plazo invalida su efecto fiscal - INCP](https://incp.org.co/agendatributariaincp/noticias/2025/06/generar-el-documento-soporte-con-no-obligados-a-facturar-fuera-de-los-plazos-establecidos-invalida-su-efecto-fiscal/)
- [Tabla de retención en la fuente 2026 - Gerencie.com](https://www.gerencie.com/tabla-de-retencion-en-la-fuente-2026.html)
- [Retención en la fuente por servicios 2026 - actualicese.com](https://actualicese.com/retencion-en-la-fuente-por-servicios-2026/)
- [Tabla de retención en la fuente 2026: Decreto 572 - Siempre al día](https://siemprealdia.co/colombia/impuestos/tabla-de-retencion-en-la-fuente-2026/)
- [Decreto 1273 de 2018 - Función Pública](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=87624)
- [Facturación electrónica DIAN 2026 - Siempre al día](https://siemprealdia.co/colombia/impuestos/sistema-de-facturacion-electronica-en-colombia/)

---

## 2. Decisión de arquitectura: extender `invoices`, no crear una tabla paralela

Una cuenta de cobro y una factura del portal comparten: cliente, proyecto,
líneas con cantidad y precio, totales en centavos, numeración correlativa
UNIQUE, máquina de estados borrador→emitida→pagada→anulada, inmutabilidad al
cerrar, PDF de una página, y el vínculo con `payments`.

Se diferencian en: el título, la serie de numeración, la ausencia de IVA, las
retenciones, el valor en letras, las leyendas legales, el snapshot del emisor y
los anexos.

**Decisión: una columna `docType` en `invoices` más las columnas específicas,
todas nullables.** Es el mismo precedente ya establecido en este repo con
`payments.source` ("Un cobro NO es otra entidad: es un pago con estos campos").
Una tabla `cuentas_cobro` paralela duplicaría `computeTotals`, la numeración,
la inmutabilidad y el PDF, y dejaría dos sitios donde arreglar el mismo bug de
redondeo.

Riesgo asumido y su mitigación: `invoices` se vuelve una tabla con dos formas.
Se controla en el borde, no en la base: `src/lib/cuentas-cobro.ts` valida que un
`docType: 'cuenta_cobro'` traiga emisor, concepto y datos bancarios, y que un
`docType: 'factura'` no traiga retenciones. Cubierto por tests.

### 2.1 Migración (aditiva, `drizzle/0030_*.sql`)

Sobre `invoices`:

| Columna | Tipo | Nota |
|---------|------|------|
| `doc_type` | text, default `'factura'` | enum `factura` \| `cuenta_cobro`. Default preserva las filas existentes |
| `issuer_snapshot` | text (JSON) | Nombre, cédula, dirección, ciudad, teléfono, email, banco, tipo y número de cuenta **en el momento de emitir**. Cambiar de banco no debe reescribir un documento ya entregado |
| `payer_snapshot` | text (JSON) | Razón social, NIT, dirección, ciudad del deudor al emitir. Misma razón |
| `concept` | text | Concepto detallado del servicio |
| `period_start` / `period_end` | integer timestamp | Periodo del servicio, opcional |
| `contract_ref` | text | Contrato u orden de compra |
| `city` | text | Ciudad de expedición |
| `retentions` | text (JSON) | Snapshot: `[{ concepto, tarifa, baseUvt, uvtCents, baseCents, valueCents }]` |
| `retentions_cents` | integer, default 0 | Suma de retenciones (redundante a propósito: es lo que se agrega y ordena) |
| `net_cents` | integer, default 0 | `total_cents - retentions_cents` |
| `ss_planilla` | text | Número de planilla PILA declarada |
| `ss_periodo` | text | Periodo cotizado (`2026-08`) |
| `signature_url` | text | Firma escaneada en Blob, si se usa |

Ninguna columna existente cambia de tipo ni de nullabilidad: no hay riesgo del
`INSERT...SELECT` que drizzle-kit genera al mezclar "añadir columnas + cambiar
nullable". Aun así, revisar el SQL generado antes de aplicar.

Claves nuevas en `app_settings` (todas opcionales, con fallback en código):

```
emisor_nombre, emisor_cedula, emisor_direccion, emisor_ciudad,
emisor_telefono, emisor_email, emisor_banco, emisor_tipo_cuenta,
emisor_numero_cuenta, emisor_declarante          ('true' | 'false')
uvt_2026                                          (5237400, en centavos)
ret_honorarios_declarante / ret_honorarios_no_declarante
ret_servicios_declarante  / ret_servicios_no_declarante
ret_servicios_base_uvt
reteica_por_mil                                   (opcional, por municipio)
```

---

## 3. Módulos

### `src/lib/cuentas-cobro.ts` (puro, sin BD, isomorfo)

El módulo con toda la lógica que merece tests. **No importa `../db` ni
`node:crypto`**: el formulario del panel lo usa también en el navegador para
previsualizar el neto mientras se teclea, igual que `cobros.ts` en `/cobrar`.

- `numeroALetras(pesos: number): string` → `'UN MILLÓN QUINIENTOS MIL PESOS M/CTE'`.
  Es la función más traicionera del módulo: `21` es `veintiuno` pero `21.000` es
  `veintiún mil`; `100` es `cien` y `101` es `ciento uno`; `500` es `quinientos`,
  `700` `setecientos`, `900` `novecientos`; `1.000.000` es `un millón` y
  `2.000.000` `dos millones`. Va con una tabla de casos en los tests, no con
  confianza.
- `RETENCION_CONCEPTOS` y `parseRetencionConfig(rows)` desde `app_settings`,
  con el mismo patrón que `parseRates()` de `money.ts`.
- `computeRetentions(baseCents, conceptos, cfg): Retencion[]` - aplica base
  mínima en UVT, redondea a centavo entero por concepto (nunca acumula
  decimales) y devuelve el snapshot que se persiste.
- `computeCuentaCobro(items, cfg)` → `{ subtotalCents, retentionsCents, totalCents, netCents }`.
  Sin IVA: `taxCents` queda en 0 por construcción, y validado.
- `ibcSeguridadSocial(baseMensualCents, smmlvCents)` - 40 % con piso de 1 SMMLV.
  Informativo, no liquida aportes.
- `LEYENDA_NO_RESPONSABLE_IVA`, `LEYENDA_NO_OBLIGADO_FACTURAR` - textos legales
  como constantes, no strings sueltos en el `.astro`.
- `validateCuentaCobro(input)` - la guarda de forma descrita en §2: emisor,
  concepto y datos bancarios obligatorios; retenciones prohibidas en facturas.

### `src/lib/portal/invoices.ts` (extensión)

- `nextNumber(docType)` - serie `CC-YYYY-NNN` separada de `INV-YYYY-NNN`. El
  `UNIQUE` de `number` ya cubre el caso patológico; la serie por tipo evita que
  se solapen.
- `createCuentaCobro()` / `issueCuentaCobro()` - al emitir se congelan
  `issuer_snapshot`, `payer_snapshot` y `retentions`. Antes de emitir, esos
  campos se recalculan en cada vista; después, jamás.
- `allInvoices({ docType })` y `invoiceCountByStatus({ docType })` reciben el
  filtro, para que `/admin/portal/facturas` no empiece a listar cuentas de cobro
  de golpe.
- `emitidoEnAnio(year)` - suma para el semáforo de 3.500 UVT.

### `src/lib/cuenta-cobro-pdf.ts`

pdf-lib, mismo enfoque que `portal/invoice-pdf.ts` (nada de HTML→PDF: no hay
Chromium en la función serverless). Función pura: recibe el registro y devuelve
bytes, sin tocar red ni BD.

Layout de una página A4, en el orden de §1.2: título `CUENTA DE COBRO` y número;
ciudad y fecha; bloque emisor; `DEBE A` con el bloque deudor; `LA SUMA DE` con
el valor en letras y en números; tabla de conceptos; retenciones y neto;
leyendas legales; datos bancarios; firma; anexos declarados.

Cuidado conocido: `StandardFonts.Helvetica` codifica en WinAnsi. Las tildes y la
ñ pasan, pero cualquier carácter fuera de WinAnsi (un guion largo, comillas
tipográficas, un emoji pegado desde WhatsApp) revienta `drawText` en tiempo de
ejecución. El texto se sanea antes de dibujar, y hay un test con una descripción
sucia de propósito.

El PDF se genera bajo demanda y se cachea en Blob una vez emitida la cuenta,
igual que las facturas del portal.

### Páginas y endpoints

- `src/pages/admin/cuentas-cobro.astro` - listado con totales por estado
  (por cobrar / pagadas / borradores) y el semáforo de 3.500 UVT, siguiendo el
  patrón visual de `admin/portal/facturas.astro`.
- `src/pages/admin/cuentas-cobro/[id].astro` - detalle, edición del borrador,
  previsualización del PDF, botón de emitir.
- `src/pages/api/admin/cuentas-cobro/index.ts` - POST crea borrador, PATCH
  actualiza líneas, POST `?action=issue` emite, POST `?action=void` anula.
  Importes en pesos en el borde, centavos hacia dentro, totales recalculados
  siempre en el servidor: exactamente el contrato de `api/admin/portal/facturas.ts`.
- `src/pages/api/admin/cuentas-cobro/[id]/pdf.ts` - descarga con
  `Cache-Control: no-store` (lleva cédula, dirección y cuenta bancaria).
- `src/pages/admin/settings.astro` - sección "Datos del emisor" y "Retenciones",
  reutilizando el upsert clave-valor que ya existe.

Rutas nuevas: añadir `/admin/cuentas-cobro` al matcher `isAdmin` de
`src/middleware.ts` (no crear un gate paralelo) y vetarlas por patrón en
`src/lib/demo.ts`: el PDF es un GET que revela cédula y número de cuenta, y
"solo lectura" no lo detiene. Es el mismo hallazgo que ya cambió el diseño de la
demo con los reveladores de la bóveda.

Todo evento de emisión y anulación se registra con `recordSecurityEvent`
(fire-and-forget, nunca bloquea el response).

---

## 4. Fases

**Fase 0 - Parametrización.** ✅ Migración `0030` (14 `ALTER TABLE ADD` y un
índice, sin un solo `INSERT...SELECT`), claves de `app_settings`, y dos secciones
nuevas en `/admin/settings`: datos del emisor, y tarifas de retención con UVT y
SMMLV. La UVT y el SMMLV se teclean en pesos y se guardan en centavos; la
conversión pasa una sola vez, en el borde.

**Fase 1 - Lógica pura y tests.** ✅ `src/lib/cuentas-cobro.ts`, 71 tests sin
base de datos. Se cerró antes de que existiera una sola página.

**Fase 2 - CRUD y emisión.** ✅ `src/lib/cuentas-cobro-db.ts`, endpoints,
listado y detalle. 23 tests de integración con libSQL en archivo temporal.

**Fase 3 - PDF y semáforo de tope.** ✅ `src/lib/cuenta-cobro-pdf.ts` y el
semáforo de 3.500 UVT en el listado. 11 tests de PDF. Sin caché en Blob: el
documento se genera bajo demanda (unos milisegundos con pdf-lib) y cachearlo
obligaría a invalidar el blob en cada corrección del borrador, que es más
maquinaria de la que ahorra.

**Fase 4 - Envío y ciclo de cobro.** ⏸️ Fuera de alcance por ahora. El PDF se
descarga y se manda a mano; automatizar el envío antes de saber cómo lo pide
cada cliente es construir sobre una suposición. Ver §7.

**Fase 5 - Documentación.** ✅ **RF-308** (emisión), **RF-309** (retenciones
parametrizables) y **RF-310** (semáforo de tope) en el módulo Finanzas de
`src/data/documentacion.ts`; iteración `pf-cuentas-de-cobro` (Fase 42) en
`src/data/iteraciones-portfolio.ts`.

## 4 bis. Lo que cambió al implementar

Tres cosas que el plan no anticipaba y que salieron al escribir los tests:

1. **El reintento de numeración no funcionaba, ni aquí ni en las facturas del
   portal.** El detector de colisiones comparaba `String(e)` buscando "unique",
   pero drizzle envuelve el error del driver y su `message` es solo
   `Failed query: insert into …`. El texto del constraint vive en la cadena de
   `cause` (`LibsqlError`, `SQLITE_CONSTRAINT`). El test de carrera lo destapó.
   `esConflictoUnique` (en `lib/portal/invoices.ts`, donde nació el patrón)
   recorre esa cadena, y la corrección arregla de paso `createInvoice`, que
   arrastraba el mismo defecto desde el principio.

2. **El semáforo de tope devolvía cero en silencio.** La comparación de fechas
   iba en una plantilla `sql` cruda; ahí drizzle no conoce la conversión de una
   columna `timestamp` (segundos) y ata el `Date` con otra unidad. No lanza:
   simplemente no encuentra filas. En un semáforo de cumplimiento, "cero" es
   exactamente la respuesta tranquilizadora y equivocada. Corregido con
   `gte`/`lt` sobre la columna.

3. **El extractor del NIT borraba las tildes en vez de plegarlas.** `billing_info`
   es un JSON sin esquema que he ido llenando a mano, así que las claves se
   normalizan antes de comparar; con `[^a-z]` a secas, `Dirección` se convertía
   en `direccin` y no casaba con nada. Ahora se normaliza en NFD y se quitan los
   diacríticos.

Y una decisión que el plan dejaba abierta y se resolvió sola: **no hace falta
caché del PDF en Blob** (ver Fase 3).

## 5. Tests

| Qué | Dónde | Por qué así |
|-----|-------|-------------|
| `numeroALetras` con tabla de casos (0, 1, 21, 100, 101, 500, 900, 1.000, 21.000, 1.000.000, 2.500.000, tope de 3.500 UVT) | `tests/cuentas-cobro.test.ts` | Es donde de verdad se rompe |
| Retenciones: bajo base mínima → 0; declarante vs no declarante; redondeo a centavo | idem | Lógica pura, sin BD |
| Totales: sin IVA por construcción; neto = total - retenciones | idem | El invariante del documento |
| `validateCuentaCobro`: rechaza sin emisor, sin concepto, sin datos bancarios | idem | Es la guarda que sustituye a la restricción en base |
| Numeración `CC-` correlativa y sin colisión bajo concurrencia | `tests/cuentas-cobro-db.test.ts` | libSQL en archivo temporal (`tmpdir()`), nunca `:memory:` |
| Inmutabilidad: emitida o anulada no acepta UPDATE de líneas | idem | |
| Snapshot: cambiar los datos del emisor no altera una cuenta ya emitida | idem | El bug más silencioso de todo el módulo |
| PDF: se genera, tiene una página, sobrevive a texto con caracteres fuera de WinAnsi | `tests/cuenta-cobro-pdf.test.ts` | pdf-lib revienta en runtime, no en compilación |
| `/admin/cuentas-cobro` y su PDF dan 403 en modo demo | `e2e/demo.spec.ts` | El PDF es un GET con cédula y cuenta bancaria |

---

## 6. Decisiones que se tomaron

1. **Declarante o no declarante**: en `app_settings` (`emisor_declarante`), no en
   el código. Cambia honorarios de 11 % a 10 % y servicios de 4 % a 6 %.
2. **ReteICA**: un concepto de retención más, configurable en por mil y **apagado
   por defecto**. Sin tarifa configurada no se practica nada, en vez de inventar
   un número que depende del municipio y de la actividad.
3. **Firma**: por ahora el nombre impreso sobre la línea, más la cédula. La
   columna `signature_url` existe en el schema para la imagen escaneada, sin usar
   todavía: se añade el día que un pagador la exija, no antes.
4. **Caché del PDF**: descartada (Fase 3).

## 7. Pendiente

- **Validación contable de la parametrización.** Lo único que bloquea el uso
  real. El módulo está completo y probado, pero las tarifas, las bases en UVT y
  el valor de la UVT los tiene que confirmar un contador antes de emitir la
  primera cuenta de cobro a un cliente. Es la razón por la que todo eso es
  configuración y no código.
- **Datos del emisor en producción.** `/admin/settings` está vacío hasta que se
  llenen: el panel avisa arriba del listado y bloquea el botón de emitir.
- **Fase 4 (envío).** Reutilizaría `lib/notify.ts` o la plantilla de WhatsApp de
  `cobros.ts` y el vínculo opcional con un pago de `/cobrar`.
- **Artículo en `/notes`.** El ángulo interesante no es el CRUD: es *por qué el
  documento con validez fiscal es el del pagador y no el mío*, y cómo esa
  inversión decide qué campos son obligatorios.
