// Contenido de /docs/docker: cómo se usa Docker en este proyecto y qué hay que
// entender para sustentarlo.
//
// Misma convención que testing.ts y vyv.ts: la prosa curada vive aquí tipada y
// la página solo renderiza. Ninguna cifra ni ruta se escribe a mano en el
// .astro.
//
// El material está escrito para defenderse en voz alta: cada bloque responde
// una pregunta que un jurado puede hacer, y las decisiones llevan su porqué,
// no solo su qué.

export type Acento = 'cyan' | 'violet' | 'lime' | 'ember'

// ── 1. La tesis ─────────────────────────────────────────────────────────────

/**
 * El argumento central de la sustentación. Si solo se recuerda un párrafo de
 * toda la página, es este.
 */
export const TESIS = {
  titulo: 'Docker aquí no despliega la aplicación: reproduce el entorno y da fidelidad a las pruebas',
  cuerpo:
    'Este proyecto se despliega en Vercel, no en contenedores. Meter la aplicación Astro en un contenedor para producción sería un retroceso: se perderían el edge, los despliegues de previsualización por cada Pull Request y el rollback automático del pipeline, a cambio de nada. El uso profesional de Docker en un stack como este no es empaquetar la aplicación, sino controlar tres cosas que la plataforma no da: el entorno de desarrollo, la infraestructura de pruebas y la cadena de suministro.',
  remate:
    'Saber dónde NO aplicar una herramienta es parte de la competencia técnica. Un contenedor para producción aquí sería una respuesta memorizada; esto es una decisión de arquitectura.',
}

// ── 2. Conceptos que hay que dominar ────────────────────────────────────────

export type Concepto = {
  id: string
  termino: string
  /** Definición corta, la que se dice en voz alta. */
  definicion: string
  /** Dónde aparece exactamente en ESTE proyecto. */
  enElProyecto: string
  /** El malentendido típico que conviene poder corregir. */
  confusionComun?: string
  acento: Acento
}

export const CONCEPTOS: Concepto[] = [
  {
    id: 'imagen-contenedor',
    termino: 'Imagen vs. contenedor',
    definicion:
      'La imagen es una plantilla inmutable de solo lectura: un sistema de archivos congelado más metadatos de cómo arrancarlo. El contenedor es una instancia en ejecución de esa imagen, con una capa de escritura propia encima.',
    enElProyecto:
      'La imagen del devcontainer se construye una vez desde .devcontainer/Dockerfile; cada vez que se abre el proyecto se crea un contenedor a partir de ella.',
    confusionComun:
      'La analogía correcta no es «imagen = ISO, contenedor = máquina virtual». Un contenedor no virtualiza hardware ni arranca un kernel: comparte el kernel del anfitrión y solo aísla su vista del sistema.',
    acento: 'cyan',
  },
  {
    id: 'aislamiento',
    termino: 'Namespaces y cgroups',
    definicion:
      'Los dos mecanismos del kernel de Linux que hacen posible un contenedor. Los namespaces aíslan lo que el proceso VE (su tabla de procesos, su red, sus puntos de montaje); los cgroups limitan lo que CONSUME (CPU, memoria).',
    enElProyecto:
      'Es la razón de que los dos servidores libSQL puedan escuchar ambos en el puerto 8080 dentro de su propio namespace de red, y se publiquen fuera como 8080 y 8081.',
    confusionComun:
      'Un contenedor no es una máquina virtual ligera: no hay hipervisor ni kernel invitado. Por eso arranca en milisegundos, y también por eso el aislamiento es más débil que el de una VM.',
    acento: 'cyan',
  },
  {
    id: 'capas',
    termino: 'Capas y caché de construcción',
    definicion:
      'Cada instrucción del Dockerfile produce una capa apilada sobre la anterior. Si una instrucción y todo lo previo no cambian, Docker reutiliza la capa en vez de reconstruirla.',
    enElProyecto:
      'Por eso la instalación de Chromium va en su propia instrucción y no mezclada con otras: rehacer la imagen por un cambio menor no vuelve a descargar 114 MB de navegador.',
    confusionComun:
      'Borrar un archivo en una capa posterior no lo elimina de la imagen: sigue presente en la capa donde se creó. Por eso un secreto que entra al contexto de construcción puede quedar en la imagen aunque el Dockerfile parezca no copiarlo.',
    acento: 'violet',
  },
  {
    id: 'digest',
    termino: 'Tag vs. digest',
    definicion:
      'Un tag (:latest, :22.12) es una etiqueta móvil: quien publica la imagen puede reapuntarla a otro contenido cuando quiera. El digest (sha256:…) es el hash del contenido: identifica una imagen exacta e irrepetible.',
    enElProyecto:
      'Las tres imágenes del proyecto están fijadas por digest. El comentario deja el número de versión legible al lado, pero quien manda es el hash.',
    confusionComun:
      'Fijar :22.12 en vez de :latest parece suficiente y no lo es: ese mismo tag se reconstruye con parches distintos. Una reproducibilidad que depende de que nadie mueva un tag no es reproducibilidad.',
    acento: 'violet',
  },
  {
    id: 'volumen',
    termino: 'Volumen y bind mount',
    definicion:
      'La capa de escritura de un contenedor muere con él. Un volumen es almacenamiento gestionado por Docker que sobrevive; un bind mount expone directamente una carpeta del anfitrión dentro del contenedor.',
    enElProyecto:
      'El código fuente entra por bind mount (se edita en el anfitrión y se ve dentro al instante); los datos de las bases y node_modules van en volúmenes con nombre.',
    confusionComun:
      'node_modules va deliberadamente en volumen y no en el bind mount: montarlo desde el anfitrión mezclaría binarios compilados para dos sistemas distintos, y esos fallos no se parecen en nada a su causa.',
    acento: 'lime',
  },
  {
    id: 'red',
    termino: 'Red de Compose y resolución por nombre',
    definicion:
      'Compose crea una red privada donde cada servicio es alcanzable por su nombre. La publicación de puertos (8080:8080) es un puente hacia afuera, no cómo se hablan los servicios entre sí.',
    enElProyecto:
      'Desde dentro del devcontainer la base es http://libsql-main:8080; desde el anfitrión es http://127.0.0.1:8080. Es la misma base vista desde dos lados.',
    confusionComun:
      'Dentro de un contenedor, «localhost» es ese contenedor, no la máquina. Apuntar a localhost para hablar con otro servicio es el error más común al empezar con Compose.',
    acento: 'lime',
  },
  {
    id: 'capabilities',
    termino: 'Capacidades (capabilities)',
    definicion:
      'Linux parte los privilegios de root en unidades independientes. En vez de «root o no root», se puede conceder exactamente la facultad que hace falta: cambiar dueños de archivo, saltarse permisos, bajar de usuario.',
    enElProyecto:
      'Los contenedores de base de datos arrancan con cap_drop: ALL y solo cuatro capacidades reañadidas, medidas una por una.',
    confusionComun:
      'Ante un «permission denied» la salida fácil es --privileged. Eso devuelve todos los privilegios de golpe y convierte la herramienta en una superficie de ataque nueva.',
    acento: 'ember',
  },
  {
    id: 'compose',
    termino: 'Compose y devcontainer',
    definicion:
      'Compose declara en un archivo un conjunto de servicios, sus redes y volúmenes, y los levanta juntos. Un devcontainer es un estándar abierto que le dice al editor: «abre este proyecto DENTRO de este contenedor».',
    enElProyecto:
      'compose.yaml declara las dos bases; .devcontainer/compose.yaml lo reutiliza con include y añade el servicio de desarrollo. Una sola definición de la infraestructura, no dos que acaban divergiendo.',
    acento: 'cyan',
  },
]

// ── 3. Anatomía: qué archivo hace qué ───────────────────────────────────────

export type Pieza = {
  archivo: string
  rol: string
  detalle: string
  /** Lo que hay que poder responder si preguntan «¿y por qué así?». */
  porque: string
}

export const ANATOMIA: Pieza[] = [
  {
    archivo: 'compose.yaml',
    rol: 'Declara dos servidores libSQL (sqld): el principal y el de la demo',
    detalle:
      'Cada uno con su volumen, su puerto publicado solo en 127.0.0.1 y su configuración de seguridad. Un ancla YAML (&libsql) evita repetir la configuración común en los dos servicios.',
    porque:
      'Son dos instancias separadas porque en producción también lo son: el aislamiento de la demo es por construcción, no por filtrar consultas. Si aquí fueran una sola, las pruebas que afirman que la demo nunca filtra datos reales pasarían por accidente.',
  },
  {
    archivo: '.devcontainer/Dockerfile',
    rol: 'Construye el entorno de desarrollo',
    detalle:
      'Parte de Node 22.12 fijado por digest, instala las dependencias de sistema de Chromium como root, y luego los navegadores de Playwright como usuario sin privilegios.',
    porque:
      'La versión de Playwright se pasa como argumento y debe coincidir con la del package.json: Playwright se niega a usar navegadores instalados por otra versión, y descubrirlo en el pipeline es tarde. Se instala solo Chromium porque es el único navegador declarado en la configuración de pruebas.',
  },
  {
    archivo: '.devcontainer/compose.yaml',
    rol: 'Une el entorno de desarrollo con las bases',
    detalle:
      'Incluye el compose raíz y añade el servicio de desarrollo, con el código montado desde el anfitrión y las variables de entorno apuntando a las bases por nombre de servicio.',
    porque:
      'Usa include en vez de copiar la definición de las bases. Dos definiciones de la misma infraestructura acaban divergiendo, y la que se rompe siempre es la que nadie mira.',
  },
  {
    archivo: '.devcontainer/devcontainer.json',
    rol: 'Le dice al editor cómo abrir el proyecto dentro del contenedor',
    detalle:
      'Servicio a usar, usuario, carpeta de trabajo, extensiones, puertos reenviados y el npm ci posterior a la creación.',
    porque:
      'El npm ci es obligatorio: el volumen de node_modules nace vacío y sin él el primer arranque deja el proyecto sin dependencias, fallando con un error que no las menciona.',
  },
  {
    archivo: '.dockerignore',
    rol: 'Excluye archivos del contexto de construcción',
    detalle: 'Variables de entorno, .git, node_modules, artefactos de compilación y documentos binarios.',
    porque:
      'No es solo peso. Es higiene de cadena de suministro: un secreto que llega al contexto puede quedar en una capa de la imagen aunque el Dockerfile no lo copie nunca.',
  },
  {
    archivo: 'scripts/wait-libsql.mjs',
    rol: 'Espera a que las bases acepten conexiones',
    detalle: 'Sondea el endpoint de salud de cada servidor hasta que responde o se agota el plazo.',
    porque:
      'Compose devuelve el control cuando el contenedor arrancó, no cuando el proceso de dentro está listo. Sembrar en ese hueco falla de forma intermitente, que es el peor tipo de fallo en una suite de pruebas. Se hace desde el anfitrión con Node y no con un healthcheck de Compose para no depender de qué binarios trae la imagen de sqld.',
  },
  {
    archivo: 'playwright.config.ts',
    rol: 'Elige el modo de base de datos de las pruebas end-to-end',
    detalle:
      'Con E2E_DB_MODE=server apunta a los contenedores; sin esa variable, a bases en archivo. La suite de pruebas es exactamente la misma.',
    porque:
      'El modo por archivo sigue siendo el predeterminado a propósito. Obligar a levantar contenedores para correr las pruebas sería cambiar una prueba que funciona por una que además hay que administrar. El pipeline no cambia.',
  },
]

// ── 4. Decisiones defendibles ───────────────────────────────────────────────

export type Decision = {
  id: string
  pregunta: string
  respuesta: string
  acento: Acento
}

export const DECISIONES: Decision[] = [
  {
    id: 'no-produccion',
    pregunta: '¿Por qué no se despliega el proyecto en un contenedor?',
    respuesta:
      'Porque la plataforma de despliegue ya resuelve mejor ese problema. Contenerizar la aplicación costaría el edge, los despliegues de previsualización por Pull Request y el rollback automático del pipeline, sin ganar portabilidad real: la base de datos es un servicio gestionado y el resto del sistema es código. El contenedor entra donde sí hay un problema abierto - el entorno y las pruebas.',
    acento: 'cyan',
  },
  {
    id: 'por-que-libsql',
    pregunta: '¿Qué gana una prueba corriendo contra un servidor en contenedor en vez de un archivo?',
    respuesta:
      'Fidelidad de protocolo. La base de producción se habla por HTTP, no por sistema de archivos. Un archivo local no ejerce la misma ruta de código del cliente, ni el mismo manejo de conexiones, ni la misma semántica de transacciones concurrentes. Las pruebas donde eso importa son justamente las de pagos y aislamiento del portal, que son las que más caro salen si dan un falso positivo.',
    acento: 'lime',
  },
  {
    id: 'capacidades',
    pregunta: '¿Por qué esas cuatro capacidades y no simplemente --privileged?',
    respuesta:
      'Porque se midieron. Con todas las capacidades retiradas, el servidor moría en bucle; se fueron reañadiendo de una en una hasta encontrar el mínimo que funciona. El resultado explica la secuencia de arranque del programa: crea su directorio de datos en un volumen ajeno, se adueña de él y baja de privilegios antes de ejecutarse. Una quinta capacidad candidata resultó innecesaria y no se incluyó.',
    acento: 'ember',
  },
  {
    id: 'lista-blanca',
    pregunta: '¿Por qué el sembrador solo acepta destinos locales?',
    respuesta:
      'Porque borra el esquema del destino antes de sembrarlo. Mientras solo aceptaba rutas de archivo, un error de configuración estropeaba una prueba; al admitir direcciones HTTP, el mismo error podría borrar una base real. La restricción enumera lo permitido y no lo prohibido: una lista de permitidos falla cerrada, una de prohibidos falla abierta en cuanto aparece un caso que nadie previó.',
    acento: 'ember',
  },
  {
    id: 'default-archivo',
    pregunta: '¿Por qué el modo con contenedores no es el predeterminado?',
    respuesta:
      'Porque tendría un coste permanente para todos y un beneficio concentrado en unas pocas pruebas. El modo por archivo no necesita Docker, arranca antes y es lo que ya corre en el pipeline. El modo servidor está disponible con una variable de entorno para cuando la pregunta que se investiga es de concurrencia o de transacciones.',
    acento: 'violet',
  },
]

// ── 5. Hallazgos de la implementación ───────────────────────────────────────

export type Hallazgo = {
  id: string
  titulo: string
  sintoma: string
  causa: string
  /** Por qué este hallazgo enseña algo más allá del bug concreto. */
  leccion: string
}

export const HALLAZGOS: Hallazgo[] = [
  {
    id: 'capacidades-minimas',
    titulo: 'El mínimo de privilegios se mide, no se supone',
    sintoma:
      'Con todas las capacidades retiradas, los dos contenedores de base de datos entraban en bucle de reinicio y no llegaban a escuchar.',
    causa:
      'El arranque del servidor crea su directorio de datos dentro de un volumen que no le pertenece, se adueña de él y luego baja de privilegios: tres operaciones que necesitan capacidades distintas.',
    leccion:
      'La reacción natural ante un fallo de permisos es devolver todos los privilegios. Ese reflejo es exactamente cómo los contenedores acaban corriendo abiertos en producción. Buscar el mínimo cuesta unos minutos y deja la configuración explicada.',
  },
  {
    id: 'sonda-defectuosa',
    titulo: 'Una prueba mal escrita afirma menos de lo que parece',
    sintoma:
      'La primera medición de capacidades dio por bueno un conjunto que en realidad no funcionaba, y el fallo reapareció al levantar el entorno de verdad.',
    causa:
      'La sonda buscaba el texto «Permission denied» en los registros, pero el fallo real decía «Operation not permitted». Un mensaje distinto para el mismo problema bastó para que la prueba mintiera.',
    leccion:
      'Es un caso de estudio de testing perfecto: un aserto sobre un mensaje de error es un aserto sobre una cadena de texto, no sobre el comportamiento. El criterio correcto era el que se usó después - comprobar que el servidor respondiera.',
  },
  {
    id: 'servidor-singleton',
    titulo: 'Un fallo que sale con código de éxito',
    sintoma:
      'Con un servidor de desarrollo abierto en otra terminal, las pruebas end-to-end morían con «el proceso del servidor web terminó antes de tiempo», sin más explicación.',
    causa:
      'El framework mantiene un bloqueo global de servidor de desarrollo. El segundo arranque no fallaba por puerto ocupado: imprimía «ya hay un servidor corriendo» y terminaba con código de éxito, así que el corredor de pruebas solo veía un proceso que se fue.',
    leccion:
      'Un proceso que falla pero devuelve código 0 es invisible para quien lo orquesta. El arreglo destraba las pruebas locales con Docker y sin él, y no tiene nada que ver con contenedores: apareció porque montar la infraestructura nueva obligó a ejercer un camino que nadie ejercía.',
  },
]

// ── 6. Comandos ─────────────────────────────────────────────────────────────

export type Comando = {
  cmd: string
  que: string
}

export const COMANDOS: Comando[] = [
  { cmd: 'npm run db:up', que: 'Levanta los dos servidores libSQL y espera a que ambos respondan antes de devolver el control.' },
  { cmd: 'npm run db:seed', que: 'Aplica las migraciones y siembra datos ficticios en ambas bases.' },
  { cmd: 'npm run db:reset', que: 'Elimina los volúmenes y vuelve a levantar desde cero. El comando para cuando el estado local es sospechoso.' },
  { cmd: 'npm run db:down', que: 'Detiene los contenedores conservando los datos.' },
  { cmd: 'npm run test:e2e', que: 'Suite end-to-end en el modo predeterminado, con bases en archivo y sin Docker.' },
  { cmd: 'npm run test:e2e:server', que: 'La misma suite contra los servidores en contenedor.' },
  { cmd: 'docker compose ps', que: 'Estado de los servicios: cuáles están arriba y desde cuándo.' },
  { cmd: 'docker compose logs libsql-main', que: 'Registros del servidor principal. El primer sitio donde mirar cuando un contenedor reinicia en bucle.' },
]

// ── 7. Qué estudiar para sustentar ──────────────────────────────────────────

export type TemaEstudio = {
  tema: string
  porQue: string
  nivel: 'imprescindible' | 'recomendado' | 'para destacar'
}

export const RUTA_ESTUDIO: TemaEstudio[] = [
  {
    tema: 'Imagen, contenedor, capas y caché de construcción',
    porQue: 'Es el vocabulario mínimo. Sin esto no se puede explicar por qué una reconstrucción tarda 2 segundos o 3 minutos.',
    nivel: 'imprescindible',
  },
  {
    tema: 'Diferencia real entre contenedor y máquina virtual (kernel compartido)',
    porQue: 'Es la pregunta de examen más frecuente y donde más se nota si el concepto está memorizado o entendido.',
    nivel: 'imprescindible',
  },
  {
    tema: 'Volúmenes, bind mounts y persistencia',
    porQue: 'Explica por qué los datos sobreviven a un reinicio pero no a un db:reset, y por qué node_modules no se monta desde el anfitrión.',
    nivel: 'imprescindible',
  },
  {
    tema: 'Redes de Compose y resolución por nombre de servicio',
    porQue: 'Permite responder por qué la misma base es libsql-main:8080 por dentro y 127.0.0.1:8080 por fuera.',
    nivel: 'imprescindible',
  },
  {
    tema: 'Capacidades de Linux y principio de mínimo privilegio',
    porQue: 'Es el punto donde esta implementación se separa de un uso escolar de Docker. Hay un hallazgo propio que contar.',
    nivel: 'para destacar',
  },
  {
    tema: 'Fijación por digest y reproducibilidad',
    porQue: 'Distingue «sé usar Docker» de «entiendo por qué mi construcción es o no reproducible».',
    nivel: 'para destacar',
  },
  {
    tema: 'Namespaces y cgroups por encima',
    porQue: 'No hace falta dominarlos, pero nombrarlos correctamente sostiene la respuesta sobre contenedor vs. máquina virtual.',
    nivel: 'recomendado',
  },
  {
    tema: 'Cadena de suministro: SBOM, escaneo de vulnerabilidades, firma de imágenes',
    porQue: 'Es el estado del arte actual y las fases pendientes del plan. Mencionarlo con criterio marca el techo de la exposición.',
    nivel: 'para destacar',
  },
]

// ── 8. Preguntas probables del jurado ───────────────────────────────────────

export type Pregunta = {
  q: string
  a: string
}

export const PREGUNTAS: Pregunta[] = [
  {
    q: '¿Un contenedor es una máquina virtual ligera?',
    a: 'No. Una máquina virtual emula hardware y arranca su propio kernel; un contenedor comparte el kernel del anfitrión y solo aísla su vista del sistema mediante namespaces, limitando recursos con cgroups. De ahí que arranque en milisegundos, y también que su aislamiento sea más débil: una vulnerabilidad del kernel afecta a todos los contenedores de la máquina.',
  },
  {
    q: 'Si no despliegan en Docker, ¿para qué lo usan?',
    a: 'Para tres cosas que la plataforma de despliegue no da: un entorno de desarrollo idéntico en cualquier máquina, una infraestructura de pruebas con el mismo protocolo de base de datos que producción, y herramientas de análisis aisladas y con versión fija. El despliegue lo resuelve mejor la plataforma; el entorno y las pruebas no los resolvía nadie.',
  },
  {
    q: '¿Qué pasa si borro un contenedor? ¿Pierdo los datos?',
    a: 'Depende de dónde estén. La capa de escritura del contenedor muere con él, pero los datos de las bases viven en volúmenes con nombre gestionados por Docker, así que sobreviven. Solo se pierden al eliminar los volúmenes explícitamente, que es lo que hace el comando de reinicio limpio.',
  },
  {
    q: '¿Por qué fijan las imágenes por digest y no por versión?',
    a: 'Porque un tag es una etiqueta móvil: quien publica la imagen puede reapuntarla a otro contenido, y el mismo tag de versión se reconstruye con parches distintos. El digest es el hash del contenido, así que identifica una imagen exacta. Si la reproducibilidad depende de que nadie mueva un tag, no es reproducibilidad.',
  },
  {
    q: '¿Cómo sabes que las pruebas realmente corren contra el contenedor?',
    a: 'Porque las migraciones del ORM y el sembrador completo se aplican sobre él por HTTP, sin ningún cambio de código: 51 tablas migradas y miles de registros sembrados. Si estuviera hablando con un archivo local, el protocolo sería otro y el servidor no registraría esas operaciones.',
  },
  {
    q: 'Ese contenedor corre como root. ¿No es un riesgo?',
    a: 'El proceso del servidor baja de privilegios durante su arranque; lo que se controló es qué puede hacer antes de bajarlos. Se retiraron todas las capacidades y se reañadieron solo las cuatro que se midieron como imprescindibles, se prohíbe la escalada de privilegios y los puertos se publican únicamente en la interfaz local, no en la red.',
  },
  {
    q: '¿Qué falta por hacer?',
    a: 'Tres fases planificadas: llevar las herramientas de análisis del laboratorio a contenedores con versión fija, inyectar fallos de red reales entre la aplicación y la base para validar la política de degradación elegante, y cerrar la cadena de suministro con inventario de dependencias, escaneo de vulnerabilidades y firma de imágenes.',
  },
]

// ── 9. Lo que sigue ─────────────────────────────────────────────────────────

export type Fase = {
  n: number
  titulo: string
  estado: 'hecho' | 'pendiente'
  resumen: string
}

export const FASES: Fase[] = [
  {
    n: 1,
    titulo: 'Entorno de desarrollo reproducible',
    estado: 'hecho',
    resumen:
      'Devcontainer con Node y navegador de pruebas fijados por digest. Elimina la clase de fallo en que la versión del entorno rompe la compilación.',
  },
  {
    n: 2,
    titulo: 'Base de datos real en las pruebas',
    estado: 'hecho',
    resumen:
      'Dos servidores libSQL en contenedor, con la suite end-to-end capaz de correr contra ellos mediante una variable de entorno.',
  },
  {
    n: 3,
    titulo: 'Herramientas del laboratorio en contenedor',
    estado: 'pendiente',
    resumen:
      'Análisis dinámico de seguridad, pruebas de carga y escaneo de dependencias como imágenes con versión fija, idénticas en local y en el pipeline.',
  },
  {
    n: 4,
    titulo: 'Inyección de fallos de red',
    estado: 'pendiente',
    resumen:
      'Un intermediario entre la aplicación y la base que introduce latencia y cortes que el código no sabe que están ocurriendo. Es lo que valida de verdad la política de degradación elegante.',
  },
  {
    n: 5,
    titulo: 'Cadena de suministro verificable',
    estado: 'pendiente',
    resumen:
      'Inventario de dependencias por imagen, escaneo de vulnerabilidades integrado al panel del laboratorio, y firma con procedencia verificable.',
  },
]
