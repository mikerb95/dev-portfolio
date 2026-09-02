# Planteamiento del problema, justificación y objetivos

> **Archivo generado.** No se edita a mano: sale de
> [`src/data/planteamiento.ts`](../src/data/planteamiento.ts) con
> `npm run planteamiento:export`, y se publica en
> [`/docs/planteamiento`](https://codebymike.tech/docs/planteamiento).
> Para cambiar el texto se cambia el dato tipado y se regenera.

## 1. Planteamiento del problema

Un desarrollador de software independiente vende dos cosas al mismo tiempo: capacidad técnica a quien contrata, y servicio continuado a quien ya contrató. Las dos exigen lo mismo (evidencia de que el trabajo está bajo control) y normalmente se resuelven por caminos separados: un portafolio por un lado, un montón de herramientas genéricas por el otro.

El portafolio de un desarrollador afirma lo que sabe hacer, pero no lo demuestra: quien lo lee no tiene forma de comprobar ninguna de esas afirmaciones. Y mientras tanto la operación real del negocio (clientes, cobros, costos, entrega, soporte, incidentes) queda repartida entre hojas de cálculo, conversaciones de WhatsApp y notas sueltas, donde el dato de un cliente no tiene frontera ni deja rastro de quién lo vio.

**Pregunta que orienta el proyecto.** ¿Cómo construir un solo sistema en el que la herramienta que opera el negocio sea, al mismo tiempo, la prueba pública y comprobable de la capacidad técnica de quien lo construyó, sin depender de servicios de pago para lo que da esa prueba?

### 1.1 Síntomas observados

| ID | Síntoma | Cómo se constató | Lo que cuesta |
|---|---|---|---|
| S1 | El portafolio afirma capacidades que nadie puede verificar: dice "monitoreo", "seguridad" o "CI/CD" y ofrece como prueba una captura de pantalla. | Revisión del portafolio anterior: ninguna de las afirmaciones técnicas tenía detrás una URL que un tercero pudiera abrir y comprobar por su cuenta. | La conversación de venta arranca desde la desconfianza y se gasta en demostrar lo básico, en vez de discutir el problema del cliente. |
| S2 | Los datos de cada cliente viven dispersos entre hojas de cálculo, correo y mensajería, sin una frontera que impida que el material de uno aparezca en la vista de otro. | Antes del portal no existía un lugar único donde el cliente consultara su propio avance: cada consulta se atendía a mano, buscando en varias fuentes. | Un error aquí no degrada una función, expone: entrega los datos de un cliente a otro. Es el riesgo con peor relación entre probabilidad y daño de todo el sistema. |
| S3 | El cobro en campo se hace de memoria: se acuerda un monto por mensajería y no queda ni el estado del cobro ni un comprobante para las dos partes. | Cobros acordados por WhatsApp sin registro asociado al proyecto ni al cliente, reconstruidos después a partir del historial de la conversación. | Pagos que se olvidan, cobros duplicados por reintento, y ninguna base para saber cuánto se facturó de verdad en un periodo. |
| S4 | No se sabe si un proyecto deja dinero: se conoce lo que se cobró, pero no lo que costó sostenerlo mes a mes. | Los costos recurrentes (dominios, servicios, credenciales de terceros) se pagaban sin quedar imputados a ningún proyecto. | Se cotiza a ciegas y se sostienen proyectos con margen negativo sin enterarse hasta que el gasto agregado ya duele. |
| S5 | Una caída se descubre cuando la reporta el cliente, no antes. | Sin sondeos propios no había ninguna señal entre el momento del fallo y la llamada del cliente. | El tiempo de detección lo fija el azar, y la primera noticia de una interrupción llega por el peor canal posible. |
| S6 | El tráfico hostil es invisible: no se sabe qué se está intentando contra el sitio, ni con qué frecuencia, ni si algo llegó a pasar. | Los registros del proveedor muestran peticiones, no intenciones: no distinguen un rastreo legítimo de un barrido buscando rutas de administración. | Sin visibilidad no hay ni defensa proporcionada ni forma de justificar que la que existe sirve para algo. |
| S7 | La documentación de ingeniería se separa del sistema al día siguiente de escribirse. | Documentos ofimáticos con cifras escritas a mano que ya no coincidían con el código en la siguiente iteración. | La documentación deja de servir para mantener el sistema y pasa a ser un trámite que se rehace antes de cada entrega. |
| S8 | Las herramientas comerciales que resolverían cada una de estas piezas cuestan una suscripción mensual por herramienta. | Monitoreo, gestión de clientes, facturación y observabilidad de seguridad como servicios separados superan por sí solos el margen de un proyecto pequeño. | Se descarta el control por su precio, y se opera sin él justo en la etapa en la que el negocio menos puede permitirse un error caro. |

### 1.2 Causas

| ID | Causa | Síntomas que explica |
|---|---|---|
| C1 | Un portafolio es, por formato, una declaración: se construye para ser leído, no para ser puesto a prueba. Nada en él obliga a que lo afirmado exista de verdad en alguna parte. | S1, S7 |
| C2 | La operación se apoya en herramientas genéricas que no conocen el dominio: una hoja de cálculo no sabe qué es un proyecto, un cobro o un cliente, así que no puede imponer ninguna regla sobre ellos. | S2, S3, S4 |
| C3 | No existe una fuente de verdad única: el mismo hecho (un pago, un costo, el estado de un requisito) se anota en varios lugares y ninguno manda sobre los otros. | S3, S4, S7 |
| C4 | Sin sensores propios, el sistema solo se conoce por lo que reportan terceros, y lo que reportan es tráfico, no comportamiento. | S5, S6 |
| C5 | El presupuesto de servicios externos es cercano a cero, así que todo control que dependa de una suscripción queda descartado de entrada. | S5, S6, S8 |
| C6 | Opera una sola persona: no hay a quién delegar la segunda revisión, así que cualquier control que dependa de la disciplina de esa persona a las dos de la mañana no es un control. | S2, S7 |

### 1.3 Delimitación

**Temática.** Sitio público de portafolio, panel de control privado (CRM, finanzas y P&L, bóveda de credenciales), portal de clientes, laboratorio de ingeniería (pipeline con rollback, pagos idempotentes, caos, pruebas), observabilidad propia y micro-SIEM propio.

*Queda fuera:* Multiusuario con roles dentro del panel (hay un único administrador), aplicación móvil nativa, servicios de monitoreo o APM de pago, contenerización del runtime de producción y migraciones destructivas de esquema.

**Espacial.** Un único despliegue en Vercel sirviendo codebymike.tech, con datos en Turso. Público objetivo en Colombia (facturación, retenciones e IVA locales), con el sitio de marca también en inglés bajo /en.

*Queda fuera:* Infraestructura propia o servidores virtuales administrados, y presencia legal o fiscal fuera de Colombia.

**Temporal.** El sistema se construye y opera de forma incremental por iteraciones, cada una con sus historias cerradas y su registro en el tablero del propio proyecto.

*Queda fuera:* Compromisos de soporte o evolución más allá del ciclo del proyecto formativo y de los proyectos de cliente vigentes.

## 2. Justificación

### Comercial: La evidencia hace el argumento de venta

Cada herramienta del sistema se usa de verdad para operar el negocio, y su resultado es público: el estado de los monitores, los intentos de intrusión agregados, el resultado del último pipeline, el panel completo con datos ficticios. Quien evalúa contratar no tiene que creer en una afirmación, puede abrir la página y mirar el dato. Eso convierte la operación diaria en el argumento comercial, en vez de mantener dos esfuerzos separados que compiten por el mismo tiempo.

### Técnica: Un sistema en vez de una colección de demostraciones

Construir cada módulo dentro del mismo sistema obliga a que compartan piezas: el módulo de cobros reutiliza la máquina de estados de pagos, la vitrina de seguridad reutiliza los eventos que ya registra el middleware, el escáner de accesibilidad reutiliza las páginas y el bloqueo de recursos externos de las pruebas de extremo a extremo. Una demostración aislada por tema no habría producido esa presión, y es exactamente la presión que separa un ejercicio de un sistema mantenible.

### Académica: El ciclo de vida completo sobre un caso real, no simulado

El proyecto recorre requerimientos funcionales y no funcionales, casos de uso, historias, diagramas UML y BPMN, cuatro niveles de prueba, implantación y capacitación, pero sobre un sistema que está en producción y tiene usuarios reales. Las cifras de la documentación se calculan desde los datos del propio repositorio, así que la evidencia de sustentación y la evidencia de operación son el mismo artefacto.

### Económica: Control operativo con coste de servicios cercano a cero

Monitoreo, objetivos de nivel de servicio, alertas y observabilidad de seguridad son desarrollo propio sobre capas gratuitas. La alternativa comercial equivalente costaría, por suscripciones, más que el margen de un proyecto pequeño. Construirlo tiene un costo de tiempo que se paga una vez y deja además el conocimiento del mecanismo, que es lo que se vende.

### Riesgo: Hay datos de terceros de por medio

Desde el momento en que un cliente entra al portal, el sistema custodia información que no es propia: facturas, documentos, conversaciones. Eso sube el listón de lo que se considera terminado. El aislamiento entre clientes y el cifrado de credenciales no son características que mejoran el producto, son la condición para poder ofrecerlo, y por eso se verifican con pruebas propias en vez de confiarse a la revisión visual.

## 3. Objetivos

### 3.1 Objetivo general

Desarrollar y poner en operación un sistema web único que funcione a la vez como portafolio verificable, panel de control del negocio y portal de clientes, sostenido por observabilidad, seguridad y documentación construidas dentro del propio sistema, de modo que cada afirmación técnica publicada esté respaldada por un artefacto en producción que un tercero pueda comprobar por su cuenta.

Condiciones que lo vuelven falsable:

- Verificable por un tercero: lo que el sitio afirma se puede comprobar desde fuera, sin credenciales y sin pedir permiso.
- Operativo de verdad: el sistema es la herramienta con la que se gestiona el negocio, no una maqueta con datos de ejemplo.
- Sostenible sin suscripciones: los controles que dan esa verificabilidad son desarrollo propio sobre servicios de capa gratuita.

### 3.2 Objetivos específicos

| ID | Objetivo | Indicador | Meta | Estado |
|---|---|---|---|---|
| OBJ-01 | Publicar una vitrina técnica donde cada capacidad afirmada tenga detrás una página con datos en vivo que cualquier visitante pueda abrir sin autenticarse. | Afirmaciones técnicas del sitio público con artefacto público comprobable. | Ninguna capacidad anunciada sin su página de evidencia. | cumplido |
| OBJ-02 | Centralizar la operación del negocio en un panel privado de un solo administrador: proyectos, clientes, seguimiento comercial, costos, rentabilidad por proyecto y cobros. | Actividades del ciclo comercial que se ejecutan dentro del sistema. | El ciclo completo, del alta del cliente al cobro registrado, sin salir del panel. | cumplido |
| OBJ-03 | Entregar a cada cliente un portal propio con acceso autenticado, cuyo aislamiento respecto de los demás clientes esté verificado por pruebas y no por inspección visual. | Fugas de datos entre clientes detectadas por la suite de aislamiento. | Cero, en cada corrida del pipeline. | cumplido |
| OBJ-04 | Construir observabilidad propia del sistema (disponibilidad, incidentes, objetivos de nivel de servicio, alertas y métricas de experiencia real) sobre servicios de capa gratuita. | Tiempo entre el inicio de una interrupción y su notificación al operador. | Menos de diez minutos, sin intervención humana. | cumplido |
| OBJ-05 | Construir una capa propia de defensa y visibilidad de seguridad que clasifique, limite y bloquee tráfico hostil, siempre bajo política de continuidad ante fallo del propio control. | Eventos sensibles registrados en el micro-SIEM y peticiones perdidas por fallo de la capa de seguridad. | La totalidad de los eventos definidos registrados; ninguna petición legítima rechazada porque el control falle. | cumplido |
| OBJ-06 | Sostener la calidad de las entregas con un pipeline que ejecute los niveles de prueba definidos y revierta por su cuenta un despliegue que no supere la verificación posterior. | Tiempo de recuperación ante un despliegue defectuoso y niveles de prueba en verde antes de promover. | Reversión en menos de diez minutos y suite completa en verde como condición para publicar. | parcial |
| OBJ-07 | Mantener la documentación de ingeniería como dato tipado dentro del repositorio, de modo que cambiarla sea un cambio revisable y no pueda desincronizarse de lo que el sistema hace. | Cifras de la documentación escritas a mano en las páginas de /docs. | Ninguna: toda cifra se calcula desde los datos del repositorio. | cumplido |

### 3.3 Trazabilidad de los objetivos

| ID | Requisitos que lo realizan | Cómo se verifica |
|---|---|---|
| OBJ-01 | RF-001, RF-004, RF-005, RF-007, RF-008, RF-013, RNF-05, RNF-25 | Pruebas de extremo a extremo sobre las páginas públicas y revisión de que /status, /security, /lab y /demo respondan con datos del sistema y no con contenido escrito a mano. |
| OBJ-02 | RF-101, RF-102, RF-201, RF-202, RF-204, RF-301, RF-302, RF-306, RF-308, RNF-01, RNF-02 | Pruebas de integración de cobros y pagos contra libSQL en archivo temporal, y recorrido manual del ciclo comercial documentado en el plan de capacitación. |
| OBJ-03 | RF-801, RF-802, RF-803, RF-804, RF-805, RF-807, RNF-05, RNF-19 | tests/portal-isolation.test.ts, que ejerce cada consulta del portal con el identificador de cliente de la sesión y con uno ajeno. |
| OBJ-04 | RF-401, RF-402, RF-403, RF-404, RF-405, RF-406, RF-407, RNF-09, RNF-26 | Historial de sondeos y de incidentes en producción, y bitácora de ejecuciones de las tareas programadas publicada en /automatizaciones. |
| OBJ-05 | RF-601, RF-602, RF-603, RF-604, RF-605, RF-606, RF-607, RNF-03, RNF-04, RNF-11 | Pruebas del clasificador y del limitador de tasa, más la vitrina pública de agregados en /security con la política de mínima exposición aplicada. |
| OBJ-06 | RF-501, RF-502, RF-503, RF-506, RF-507, RF-508, RNF-06, RNF-08, RNF-23 | Corridas registradas del pipeline con su resultado y duración, informe de ejecución de pruebas en /docs/ejecucion-pruebas y experimentos de caos con su historial. |
| OBJ-07 | RF-703, RF-706, RF-707, RF-709, RF-711, RNF-14, RNF-15, RNF-24 | Pruebas que cruzan las páginas de /docs contra el disco y contra las listas tipadas, y que fallan si una página queda sin registrar o un identificador citado deja de existir. |

