// El GUION: lo que el mando enseña de la diapositiva que se está viendo.
//
// Vive aquí y no dentro de `final.html` por la misma razón que el resto del
// sistema: el bundle se reemplaza entero en cada iteración de la presentación,
// y el discurso no puede irse con él. Estas notas nacieron dentro del mazo y se
// sacaron a este archivo para poder reescribirlas sin tocarlo.
//
// Va por ZONAS, no por número global. Añadir una diapositiva de cierre no
// desplaza el guion de los beats, que es lo que pasaría con una lista plana
// indexada del 1 al 22.
//
// Un hueco no es un error: una zona más corta que el mazo real (beats nuevos
// todavía sin discurso) hace que el mando enseñe "sin notas" en esa posición,
// que es exactamente lo que hay que ver para saber que falta escribirla.

export type NotaGuion = {
  /** Cómo se llama la diapositiva en el mando. */
  titulo: string
  /** Segundos estimados, para saber si se va largo. 0 = sin estimación. */
  dur?: number
  /** La frase que el público está leyendo, para no repetirla en voz alta. */
  enPantalla?: string
  /** El discurso: un párrafo por idea, en el orden en que se dicen. */
  notas: string[]
  /**
   * Estas notas salieron DEL MAZO, no se escribieron como discurso.
   *
   * `npm run guion:sync` lo pone en los beats que aparecieron en una
   * iteración nueva de `final.html`: sirven para no quedarse mudo, pero son
   * contenido de la diapositiva, no indicaciones de cómo darla. Se quita a
   * mano al reescribirlas, y el mando lo enseña para que se note en el
   * ensayo y no delante del jurado.
   */
  delMazo?: boolean
}

/**
 * Capas de entrada, de la primera que se ve a la última. Con el mazo actual:
 * la cita y la portada.
 */
export const GUION_INTRO: NotaGuion[] = [
  {
    titulo: 'Cita de apertura',
    enPantalla: 'Un buen test existe para intentar romper el código. Uno excelente, para saber cómo se recupera.',
    notas: [],
  },
  {
    titulo: 'Portada',
    enPantalla: 'CodeByMike · SCRUM 2',
    notas: [],
  },
]

/**
 * Los beats, en orden. `GUION_BEATS[0]` es el beat 1.
 *
 * GENERADO por `npm run guion:sync` desde `public/final.html`: el orden y el
 * número de entradas salen del mazo, el discurso se conserva de una corrida a
 * otra emparejando por título. Se edita a mano sin miedo: la próxima corrida
 * respeta lo que haya escrito y solo añade lo que el mazo traiga de nuevo.
 */
export const GUION_BEATS: NotaGuion[] = [
  {
    titulo: 'Planteamiento del problema',
    dur: 75,
    enPantalla: '¿Y si la herramienta que opera el negocio fuera la prueba de que sé construirlo?',
    notas: [
      'La pregunta que orienta el proyecto: cómo construir un solo sistema en el que la herramienta que opera el negocio sea, a la vez, la prueba pública y comprobable de la capacidad técnica de quien lo construyó.',
      'Ocho síntomas observados, no supuestos: cada uno tiene documentado cómo se constató y qué cuesta.',
      'S2 es el de peor relación entre probabilidad y daño: por eso el aislamiento entre clientes se verifica con pruebas y no con inspección visual.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Justificación',
    dur: 75,
    enPantalla: 'La operación diaria ES el argumento comercial',
    notas: [
      'Comercial: quien evalúa contratar no tiene que creer una afirmación, abre la página y mira el dato.',
      'Técnica: construir todo dentro del mismo sistema obliga a compartir piezas (cobros reutiliza la máquina de estados de pagos, la vitrina de seguridad reutiliza los eventos del middleware). Esa presión es la que separa un ejercicio de un sistema mantenible.',
      'Económica: monitoreo, SLOs, alertas y observabilidad de seguridad son desarrollo propio sobre capas gratuitas.',
      'Riesgo: desde que un cliente entra al portal, el sistema custodia información que no es propia. El aislamiento y el cifrado no son mejoras del producto, son la condición para poder ofrecerlo.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Objetivo general',
    dur: 75,
    notas: [
      'Las tres condiciones están para que el objetivo se pueda declarar incumplido. Un objetivo que no se puede fallar no dice nada.',
      'Operativo de verdad: no es una maqueta con datos de ejemplo, es el sistema con el que cobro y con el que atiendo clientes.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Objetivos específicos',
    dur: 75,
    enPantalla: 'Siete objetivos, cada uno con su indicador y su meta',
    notas: [
      'Cada objetivo tiene indicador, meta y estado en /docs/planteamiento, y una tabla de trazabilidad que lo enlaza con los requisitos que lo realizan y con cómo se verifica.',
      'OBJ-06 está en parcial y se dice: el rollback automático funciona, pero el laboratorio de carga tiene fases pendientes. Declararlo parcial es más creíble que pintarlo verde.',
      'Los siete objetivos específicos son las secciones que recorre el resto de esta presentación, en el mismo orden en que aparecen.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Hook',
    dur: 60,
    notas: [
      'Abrir con una pregunta, no con una afirmación: \'¿qué garantiza que esto no se caiga el día que más visitas tenga?\'',
      'Dejar el silencio del grafo apagado respirar 2-3 segundos antes de hablar.',
      'No revelar todavía qué es el grafo ni cómo se lee - eso es el beat 3.',
    ],
  },
  {
    titulo: 'El problema',
    dur: 45,
    enPantalla: '¿Qué pasa si esto se cae?',
    notas: [
      'Este nodo es el mismo que se rompe en el beat 11 (breaking_point.node_id = middleware). Foreshadowing real, no decorativo.',
      'No dar el número del quiebre todavía - se gasta en el beat 11, donde tiene la evidencia detrás.',
    ],
  },
  {
    titulo: 'Arquitectura por capas',
    dur: 90,
    enPantalla: 'Un monolito modular, no microservicios',
    notas: [
      'No hay microservicios: los nodos son módulos reales de un solo despliegue Astro SSR en Vercel, no procesos separados.',
      'Los 3 sistemas de auth separados (admin/portal/demo) son decisión deliberada - RNF-03 en la documentación.',
      'src/lib/bpmn-layout.ts y los motores UML generan estos diagramas en el servidor, sin Mermaid (no tiene notación BPMN ni de despliegue).',
    ],
  },
  {
    titulo: 'El viaje de una petición',
    dur: 105,
    enPantalla: 'Bogotá a Virginia, ida y vuelta',
    notas: [
      'El recorrido no es una metáfora: el pulso sigue la ruta física real - Bogotá, Cartagena, Miami, Virginia Beach y Ashburn, donde corre la función. El header x-vercel-id lo confirma: iad1.',
      'iad1 y la base Turso están en la misma región (aws-us-east-1): la consulta de sesión cuesta milisegundos, el viaje caro es el del océano.',
      'Cada punto que se enciende es un nodo real del grafo: vercel-edge, middleware, lib-security, auth-admin y db-turso-main. Se iluminan de uno en uno porque así se ejecutan, en cadena.',
      'El salto a GitHub es de servidor a servidor: la función pide el token y después el perfil. El navegador nunca ve esas dos llamadas.',
      'El login no escribe en la base: la identidad es el login de GitHub contra una allowlist. La fila en admin_sessions se crea en el primer request al panel.',
      'Si preguntan por CSRF: aquí no hay parámetro state. La protección es PKCE (code_verifier) más el csrfToken de Auth.js.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Cadena de defensa',
    dur: 90,
    enPantalla: 'Ninguna capa confía en la anterior',
    notas: [
      'Cada capa hace una cosa. El borde filtra, el middleware fija cabeceras, lib-security aplica rate limiting y CSRF y registra en el SIEM propio, auth valida identidad, la API valida entrada.',
      'Ninguna capa confía en la anterior. Si una falla, las demás siguen.',
      'El SIEM es propio, no una librería de terceros.',
      'Si preguntan por BUG-01: ese defecto nació justo aquí, de dos capas correctas que interactuaron mal.',
      'La autenticación cuelga del middleware, no de la API: la identidad se valida antes de llegar a la lógica de negocio.',
    ],
  },
  {
    titulo: 'Plan de pruebas · malla de cobertura',
    dur: 90,
    enPantalla: 'Cuatro niveles, cuatro preguntas distintas',
    notas: [
      'Cada nivel responde una pregunta que ningún otro puede: unitaria (¿lógica correcta aislada?), integración (¿el SQL real hace lo que digo?), carga (¿cuántos usuarios aguanta?), estrés (¿cómo se rompe y se recupera?).',
      'El plan vive en src/data/testing.ts y se renderiza en /docs/testing - son las mismas cifras que corren en CI.',
    ],
  },
  {
    titulo: 'Los requisitos',
    dur: 75,
    enPantalla: 'Un requisito que no se puede probar, no es requisito',
    notas: [
      'ISO/IEC/IEEE 29148 es el estándar de ingeniería de requisitos. Define qué hace que un requisito sea utilizable.',
      'El atributo clave es verificable: si no puedo escribir una prueba que diga si se cumple o no, no es un requisito, es un deseo.',
      'Por eso este beat va antes del método de pruebas. Sin requisitos verificables, no hay nada contra qué probar.',
      '29148 define QUÉ se pide. 29119 define CÓMO se comprueba. Son la misma cadena.',
      'Si preguntan cuántos de los 186 requisitos tienen prueba asociada: [PENDIENTE - necesito ese dato antes de la sustentación].',
    ],
  },
  {
    titulo: 'Marco normativo - ISO/IEC/IEEE 29119',
    dur: 60,
    enPantalla: 'Marco normativo - ISO/IEC/IEEE 29119',
    notas: [
      'El método no lo inventé: sigue ISO/IEC/IEEE 29119, el estándar internacional de pruebas de software.',
      'Parte 2 define el proceso: planificar, monitorear, controlar, cerrar. Mi plan de pruebas con cuatro niveles sale de ahí.',
      'Parte 3 define la documentación: plan, especificación de casos, reporte de incidentes. Mi matriz de trazabilidad y el reporte de BUG-01 son eso.',
      'Parte 4 define las técnicas de diseño de casos: partición de equivalencia, valores límite, transición de estados. Es lo que apliqué en el taller de caja negra.',
      'Si preguntan por críticas al estándar: la comunidad de testing ágil y exploratorio lo considera pesado en documentación. Reconocerlo, no defenderlo como dogma.',
      'Verificación y validación responden preguntas distintas: la primera contrasta contra la especificación, la segunda contra la necesidad real.',
      'Mi fuerte es verificación: 1258 pruebas automatizadas. La validación vive en las historias de usuario y en el oráculo declarado de cada caso de caja negra.',
      'Si preguntan por el balance: reconocer que el proyecto tiene más verificación que validación, y que eso es una limitación real y conocida, no un descuido.',
    ],
  },
  {
    titulo: 'Unitarias',
    dur: 90,
    enPantalla: '69.79%',
    notas: [
      'Ese porcentaje mide src/lib y src/i18n, NO el proyecto entero: las páginas .astro y los 131 endpoints no entran en el instrumentado de v8 con esta configuración.',
      'Módulos más bajos si preguntan: portal y present rondan 50-60%, security igual. Honestos, no maquillados.',
      '1125 pruebas corren en 10.9s: rápido porque es lógica pura, sin base de datos.',
    ],
  },
  {
    titulo: 'Integración',
    dur: 90,
    enPantalla: 'Contra una base real, no un mock',
    notas: [
      'Ejemplo ancla: tests/portal-isolation.test.ts (26 casos) prueba que un cliente no puede leer la factura de otro - el mismo invariante que TC-06 verificó a mano en el navegador.',
      'Archivo temporal y no :memory:: las transacciones de libSQL abren otra conexión, y una base en memoria no comparte tablas entre conexiones.',
      '133 pruebas son el 11% de los casos pero tardan 25.75s de los 36.65s totales - el coste real de probar contra algo de verdad.',
    ],
  },
  {
    titulo: 'Guardarraíles del laboratorio',
    dur: 75,
    enPantalla: 'La prueba no puede tocar producción',
    notas: [
      'Una prueba de estrés es deliberadamente violenta: bombardea hasta romper. Si apunta al sitio real, lo tumba con clientes adentro.',
      'Por eso k6 tiene bloqueo por diseño contra entornos productivos. No es una precaución al correr: está en el script.',
      'Es una decisión de diseño del laboratorio de pruebas, no de la aplicación.',
      'Si preguntan por qué no medí el punto de quiebre en producción: esta es parte de la respuesta. La otra parte es que en serverless el escalado automático hace que el límite sea el plan contratado, no el código.',
    ],
  },
  {
    titulo: 'Carga',
    dur: 90,
    enPantalla: '62 peticiones por segundo, sostenidas',
    notas: [
      'La escalera: 7 niveles de concurrencia (10 a 1000 VUs), cada uno medido SOLO en su meseta - mezclar rampa con meseta contamina el número.',
      'El umbral (p95<800ms, error<1%) se pone sobre 25 VUs a propósito: el agregado mezcla el nivel sano con el saturado y no describe ningún estado real.',
      'Este es el tráfico NORMAL. El siguiente beat es a propósito romperlo.',
    ],
  },
  {
    titulo: 'Estrés · quiebre y recuperación',
    dur: 120,
    enPantalla: 'Se rompe. La pregunta es cómo vuelve',
    notas: [
      'Host limpio antes de correr (11 contenedores Docker ajenos detenidos, load average 0.37-0.98): el quiebre vuelve a 100 req/s, casi igual a la corrida sin contención del 22 de agosto. La corrida contendida de la mañana (50 req/s) queda como evidencia de cuánto deprime el número la contención de host.',
      'Lo sólido y repetible: la CPU se queda baja incluso en los escalones rotos - el límite es la concurrencia de sockets/handlers, no el cómputo.',
      'H-02: el agregado de la recuperación (120s) da 27.1% de error y parece que no se recuperó. Por tramos de 15s, los primeros ~60s siguen drenando la cola del pico (hasta 2930 VUs), y desde +75s converge del todo: p50 24-26ms, MEJOR que la línea base sana (34ms).',
      'Si preguntan por el umbral formal (p95<1000ms, error<2%): se evalúa sobre los 120s completos, y los primeros 60s todavía son colapso, no recuperación.',
    ],
  },
  {
    titulo: 'Matriz de resultados',
    dur: 90,
    enPantalla: 'Del clic a la fila',
    notas: [
      'Caso ancla: TC-08 (cerrar sesión) falló con un 403 de CSRF de Astro; causa raíz exacta (Referrer-Policy: no-referrer fuerza Origin: null en formularios nativos), se corrigió sin tocar la política de seguridad y se cerró con un test de regresión que falla sin el arreglo y pasa con él.',
      'TC-07 (cambio de contraseña autenticado) se dejó DELIBERADAMENTE sin HU: ninguna de las 41 la describe con precisión. Decirlo es más creíble que forzar un mapeo.',
      'docs/matriz-trazabilidad.md tiene las 37 historias sin cobertura de este taller, aclarando que \'sin cobertura aquí\' no es \'sin ninguna prueba en el proyecto\'.',
      'BUG-01 es el mejor ejemplo de validación del proyecto: el código pasaba todas las unitarias, la función estaba bien construida. Pero el usuario tocaba Cerrar sesión y la sesión no se cerraba. Solo aparece ejecutando el flujo como usuario real. La verificación no lo iba a encontrar.',
    ],
  },
  {
    titulo: 'Demo en vivo',
    dur: 150,
    notas: [
      'Antes de entrar: recordar en voz alta que se corrió npm run sustentacion:precalentar para no arrancar en frío delante del jurado.',
      'Si la base de producción sigue bloqueada por cuota (docs/runbook-cuota-turso.md), el portal cae solo al modo respaldo con datos ficticios versionados - el banner morado lo anuncia. No es un fallo, es el diseño funcionando.',
      'Cerrar diciendo qué NO se mostró: mensajería, documentos, cuenta - fuera del alcance del modo respaldo si la base sigue caída.',
    ],
  },
  {
    titulo: 'Despliegue y CI/CD',
    dur: 90,
    enPantalla: 'El pipeline decide si se queda',
    notas: [
      'El dato que sorprende: el job verify-production espera hasta 8 minutos a que /api/health devuelva el SHA del commit, hace 3 intentos de salud, y si 2 de 3 no son sanos ejecuta vercel rollback solo, sin que nadie lo dispare a mano.',
      'Docker es infraestructura de DESARROLLO (sqld local, Node fijo), nunca el runtime de producción - eso lo sirve Vercel siempre, para no perder edge ni preview deploys.',
      '29 migraciones aplicadas, todas aditivas: nunca se elimina una columna sin pedirlo explícitamente.',
    ],
  },
  {
    titulo: 'El sistema observado',
    dur: 90,
    enPantalla: 'Las pruebas terminan. La observación no',
    notas: [
      'Mis pruebas midieron el sistema en un laboratorio, durante minutos. Esto lo mide en producción, durante 90 días.',
      'El error budget es cuánta indisponibilidad me puedo permitir sin incumplir el objetivo de servicio. Si lo gasto, dejo de desplegar y estabilizo.',
      'No es una página que armé para la sustentación: lleva meses recogiendo datos reales.',
      'Si preguntan por rendimiento en producción: esto es la respuesta. No es una prueba destructiva, es observación continua del sistema real.',
    ],
  },
  {
    titulo: 'Salud de ingeniería',
    dur: 90,
    enPantalla: 'Verde, medido, público',
    notas: [
      'Último pipeline en verde: cada push pasa por las pruebas antes de llegar a producción.',
      'Core Web Vitals mide la experiencia real del usuario en el navegador, no el tiempo de respuesta del servidor. Es la otra mitad del rendimiento.',
      'Disponibilidad consolidada de todos los servicios, medida de forma continua.',
      'Todo esto es público. Cualquiera puede verificarlo ahora mismo.',
    ],
  },
  {
    titulo: 'Diagnóstico público de un sitio',
    dur: 90,
    enPantalla: 'La misma herramienta que uso para auditar, abierta a cualquiera',
    notas: [
      'Es una herramienta pública: cualquiera pega una URL y recibe el mismo informe. No es una captura preparada para hoy.',
      'Sale del mismo módulo de diagnóstico que uso yo, no de un servicio de pago.',
      'Se puede desplazar desde el mando: la página entera es recorrible sin ir al portátil.',
    ],
    delMazo: true,
  },
  {
    titulo: 'Tecnologías',
    dur: 60,
    enPantalla: 'Simple porque tenía que ser trazable\\',
    notas: [
      'El criterio detrás de cada elección fue el mismo: aburrido y probado, no la novedad de moda - cada pieza tiene que justificar por qué está ahí.',
      'Turso está duplicado (main y demo) a propósito: la demo pública nunca toca datos reales de clientes.',
      'Vitest con instrumentación v8 para unitarias/integración; k6 para carga y estrés - por eso el vocabulario de VUs y percentiles del beat 10-11.',
    ],
  },
  {
    titulo: 'Cierre · dossier',
    dur: 60,
    notas: [
      'Los 8 documentos del checklist están completos, incluido el Documento del Producto Final (DEA Formato_Documento_de_Arquitectura.docx): consolida arquitectura, requisitos, modelo de datos e historias de usuario, con 49 diagramas y capturas.',
      'Límite honesto de esa verificación: se revisó y corrigió el TEXTO (6 datos desactualizados: versión de Astro, conteo de tablas, casos de uso, módulos), pero no se inspeccionaron una por una las 49 imágenes embebidas.',
      'Cerrar con una invitación concreta: señalar dónde en /docs puede el jurado seguir verificando cualquier cifra después de la sustentación.',
    ],
  },
]

/** Capas de cierre, de la primera que sale a la última. */
export const GUION_OUTRO: NotaGuion[] = [
  {
    titulo: 'Cierre · ¿Preguntas?',
    enPantalla: '¿Preguntas? · GRACIAS',
    notas: [],
  },
]
