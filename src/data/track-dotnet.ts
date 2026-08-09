// Temario semilla del track .NET / C#. Es solo la PLANTILLA con la que se
// crea el track la primera vez: una vez sembrado, los hitos viven en
// skill_milestones y se editan desde el panel. Cambiar este archivo no toca
// un track ya existente (la siembra es idempotente por título).

export type TrackSeed = {
  slug: string
  name: string
  tagline: string
  motivation: string
  accent: string
  weeklyGoalMinutes: number
  milestones: { area: string; title: string; description: string }[]
}

export const DOTNET_TRACK: TrackSeed = {
  slug: 'dotnet',
  name: '.NET y C#',
  tagline: 'De TypeScript a un backend tipado, compilado y con runtime propio.',
  motivation:
    'Especializarme en .NET para competir por trabajo backend serio: banca, salud y empresa en Colombia corren sobre C#, y ahí el portafolio de TypeScript solo abre la mitad de las puertas.',
  accent: 'violet',
  weeklyGoalMinutes: 360, // 6 h/semana: sostenible junto al trabajo real
  milestones: [
    {
      area: 'C# fundamentos',
      title: 'Tipos, structs vs clases y el modelo de memoria',
      description: 'Value types en stack, reference types en heap, y por qué eso cambia cómo escribís un método.',
    },
    {
      area: 'C# fundamentos',
      title: 'Nullable reference types y el compilador como red',
      description: 'Activar <Nullable>enable</Nullable> y aprender a leer las advertencias en vez de silenciarlas con !.',
    },
    {
      area: 'C# fundamentos',
      title: 'Interfaces, genéricos y restricciones',
      description: 'where T : class, new() y por qué los genéricos de C# no son los de TypeScript (existen en runtime).',
    },
    {
      area: 'C# fundamentos',
      title: 'Records, pattern matching y switch expressions',
      description: 'C# moderno: inmutabilidad por defecto y expresiones donde antes había 20 líneas de if.',
    },
    {
      area: 'Async y concurrencia',
      title: 'async/await, Task y el SynchronizationContext',
      description: 'Por qué .Result es un deadlock esperando pasar y qué hace ConfigureAwait(false).',
    },
    {
      area: 'Async y concurrencia',
      title: 'CancellationToken de punta a punta',
      description: 'Propagar la cancelación del request hasta la query: el equivalente a no dejar invocaciones colgadas.',
    },
    {
      area: 'LINQ',
      title: 'IEnumerable vs IQueryable',
      description: 'Dónde se ejecuta cada operador y cómo se traduce (o no) a SQL. La fuente #1 de N+1 en .NET.',
    },
    {
      area: 'LINQ',
      title: 'Ejecución diferida y materialización',
      description: 'ToList() en el sitio correcto: enumerar dos veces la misma query es dos viajes a la base.',
    },
    {
      area: 'EF Core',
      title: 'DbContext, entidades y configuración fluida',
      description: 'El equivalente a definir el schema en Drizzle, pero con change tracking encima.',
    },
    {
      area: 'EF Core',
      title: 'Migraciones aditivas y control del SQL generado',
      description: 'dotnet ef migrations add / database update, revisando el SQL antes de aplicarlo. Mismo criterio que en este repo.',
    },
    {
      area: 'EF Core',
      title: 'Relaciones, carga (Include) y proyecciones',
      description: 'Traer solo lo que se pinta: Select a un DTO en vez de arrastrar el grafo entero.',
    },
    {
      area: 'EF Core',
      title: 'Transacciones, concurrencia optimista e idempotencia',
      description: 'Reproducir en EF Core lo que ya resuelve payments.ts: una operación que cobra no se ejecuta dos veces.',
    },
    {
      area: 'ASP.NET Core',
      title: 'Minimal APIs y el pipeline de middleware',
      description: 'El paralelo directo a src/middleware.ts: orden de los middleware y terminación temprana.',
    },
    {
      area: 'ASP.NET Core',
      title: 'Inyección de dependencias y ciclos de vida',
      description: 'Singleton, Scoped y Transient: capturar un Scoped en un Singleton es el bug clásico.',
    },
    {
      area: 'ASP.NET Core',
      title: 'Configuración, opciones y secretos',
      description: 'IOptions, appsettings por entorno y user-secrets. El equivalente a serverEnv().',
    },
    {
      area: 'ASP.NET Core',
      title: 'Autenticación y autorización con JWT y policies',
      description: 'Claims, policies y handlers propios; contrastar con los tres sistemas de auth de este portafolio.',
    },
    {
      area: 'ASP.NET Core',
      title: 'Validación, ProblemDetails y manejo global de errores',
      description: 'Respuestas de error consistentes en vez de un try/catch por endpoint.',
    },
    {
      area: 'ASP.NET Core',
      title: 'Rate limiting, health checks y logging estructurado',
      description: 'Lo que aquí es micro-SIEM propio, en .NET viene de fábrica: compararlos y saber cuándo cada uno.',
    },
    {
      area: 'Testing',
      title: 'xUnit: fixtures, teorías y aserciones',
      description: 'El Vitest de .NET. [Theory] con [InlineData] es la tabla de casos que aquí se hace con it.each.',
    },
    {
      area: 'Testing',
      title: 'Dobles de prueba con NSubstitute o Moq',
      description: 'Mockear la frontera, no el módulo propio: mismo criterio que se usa en tests/ de este repo.',
    },
    {
      area: 'Testing',
      title: 'Tests de integración con WebApplicationFactory',
      description: 'Levantar la API completa en memoria y golpearla de verdad, con SQLite o Testcontainers detrás.',
    },
    {
      area: 'Arquitectura',
      title: 'Capas, Clean Architecture y CQRS con MediatR',
      description: 'Cuándo la separación paga y cuándo es ceremonia. Criterio, no dogma.',
    },
    {
      area: 'Arquitectura',
      title: 'Blazor o MVC: renderizado del lado servidor',
      description: 'Ver el equivalente a Astro SSR dentro del ecosistema .NET y quedarse con el que aplique.',
    },
    {
      area: 'Despliegue',
      title: 'Publicar y contenerizar (dotnet publish, Dockerfile multi-stage)',
      description: 'Runtime vs SDK image, trimming y AOT: el tamaño del contenedor es dinero en producción.',
    },
    {
      area: 'Despliegue',
      title: 'CI en GitHub Actions para .NET',
      description: 'restore, build, test y publish del artefacto: replicar lo que ya hace ci.yml de este repo.',
    },
    {
      area: 'Despliegue',
      title: 'Desplegar una API real a Azure App Service o Container Apps',
      description: 'Cerrar el ciclo: un endpoint público, con base de datos y logs, escrito en C#.',
    },
    {
      area: 'Proyecto insignia',
      title: 'Portar un módulo real de este portafolio a .NET',
      description: 'Reescribir un módulo acotado (cobros, monitores) como API en C# y contrastar decisión por decisión.',
    },
    {
      area: 'Proyecto insignia',
      title: 'Artículo en /notes: "TypeScript → C#, lo que cambia de verdad"',
      description: 'La regla del repo: cada etapa mayor termina con su caso de estudio publicado.',
    },
  ],
}

export const TRACK_SEEDS: TrackSeed[] = [DOTNET_TRACK]
