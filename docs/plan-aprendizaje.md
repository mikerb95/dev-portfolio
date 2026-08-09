# Plan: tracker de especialización técnica (`/admin/aprendizaje`)

Estado: **implementado** (8 ago 2026). Estrenado con el track **.NET y C#**.

## Por qué existe

El panel ya tenía dos piezas cercanas y ninguna resolvía esto:

- **`/admin/certifications`** (tabla `education_milestones`): cursos y
  certificaciones, con estado y fecha. Es un inventario de lo terminado.
- **`/admin/education`, el Evolution Path** (`src/lib/education-paths.ts` +
  `education_lab_progress`): rutas de labs con contenido estático y un
  checkbox por lab.

Las dos responden "qué hice". Ninguna responde **"cuánto tiempo llevo
invirtiendo de verdad y si el hábito se sostiene"**, que es la única pregunta
que importa cuando lo que se quiere es especializarse en un stack nuevo
mientras se trabaja en otro. Un checkbox marcado en enero no distingue entre
alguien que practica cuarenta minutos diarios y alguien que abrió el tema una
tarde.

De ahí el nombre real del feature: no es un gestor de cursos, es un
**instrumento de medición del hábito**.

## Decisiones de diseño

### 1. Multi-track desde el día uno, aunque hoy solo haya uno

El modelo no sabe nada de .NET. Hay `skill_tracks`, y el track de .NET es una
fila con su temario en `skill_milestones`. Añadir Rust, Azure o Go es sembrar
otra fila, no escribir otra página ni otra migración.

El coste de esta generalidad fue casi nulo (un `trackId` en dos tablas y un
selector en la cabecera), y la alternativa - tablas `dotnet_sessions` /
`dotnet_milestones` - garantizaba un copy-paste completo la primera vez que
apareciera una segunda tecnología.

### 2. El día es una clave de calendario, no un timestamp

`skill_sessions.day` es un `text` con formato `'YYYY-MM-DD'` resuelto en zona
`America/Bogota` (constante `TRACKER_TZ` en `src/lib/skills.ts`).

Esto no es una preferencia de formato, es correctitud. El servidor corre en
UTC en Vercel: una sesión registrada a las 8 de la noche en Colombia son las
01:00 UTC del día siguiente. Guardando timestamps, esa sesión rompería la
racha del día en que realmente ocurrió, y lo haría justo en el escenario más
común (estudiar de noche, después del trabajo). Un tracker motivacional que
castiga por practicar tarde es peor que no tener tracker.

Además, una racha **es** un hecho del calendario. Guardar el instante obliga a
reinterpretar la zona en cada consulta y en cada test; guardar el día no.

### 3. Los logros se derivan, no se persisten

No hay tabla de badges. `computeAchievements()` recalcula los diez logros en
cada render sobre las sesiones y los hitos ya cargados.

Una tabla de logros desbloqueados tiene dos problemas: hay que escribir en
cada `POST` de sesión (con la lógica de "¿este insert desbloqueó algo?"
duplicada en el endpoint), y se desincroniza en cuanto se borra una sesión mal
registrada, dejando badges concedidos por datos que ya no existen. Recalcular
cuesta nada sobre datos que ya están en memoria y siempre dice la verdad.

El detalle que hace esto no trivial: cada logro se fecha en **el día en que se
cumplió**, no en el día en que se consulta. El umbral de 10 horas se fecha
recorriendo las sesiones en orden y viendo en cuál cruzó la suma acumulada; la
racha de 7 días, en el día que la cerró. Cubierto por tests.

### 4. Racha con un día de gracia

Si la última sesión fue **ayer**, la racha sigue contando y se marca `atRisk`.
Solo se corta a los dos días.

Cortarla a las 00:00 significaría abrir el panel un martes por la mañana y ver
la racha de doce días en cero por no haber estudiado todavía en un día que
lleva ocho horas de existir. El campo `atRisk` es lo que alimenta el mensaje de
cabecera ("racha en juego"), que es el empujón real.

### 5. Los niveles del mapa de calor son relativos, no absolutos

La intensidad de cada celda se calcula contra el mejor día de la ventana de 26
semanas, no contra umbrales fijos. Treinta minutos significan cosas distintas
en una semana floja que en una intensa, y una escala fija haría que todo el
mapa se viera igual de pálido durante el arranque, que es justo cuando hace
falta ver progreso.

### 6. Público solo el agregado

`skill_tracks.is_public` es `false` por defecto. Al activarlo, `/certifications`
publica **nombre, horas acumuladas, porcentaje del temario y mejor racha**. La
bitácora, las fechas de cada sesión y el estado de cada hito no salen del
panel: misma regla de OPSEC que `/status`, donde lo público son agregados y
nada más.

Un track sembrado sin sesiones se filtra en público. Cero horas y cero por
ciento no dicen nada bueno de nadie.

## Arquitectura

```
/admin/aprendizaje (SSR)
  └─ src/lib/skills.ts          módulo PURO: racha, meta, mapa de calor,
                                 progreso del temario, logros derivados
  └─ src/data/track-dotnet.ts   plantilla del temario (solo para sembrar)
  └─ /api/admin/skills/
       tracks.ts      POST crea + siembra (idempotente) · PATCH ajustes
       sessions.ts    POST registra · DELETE borra
       milestones.ts  POST crea · PATCH estado/evidencia · DELETE borra

/certifications (público)  ← agregado de los tracks con is_public = true
```

Tablas (migración `drizzle/0026_kind_wraith.sql`, aditiva):

| Tabla | Qué guarda |
|---|---|
| `skill_tracks` | slug, nombre, motivo, meta semanal en minutos, visibilidad |
| `skill_sessions` | trackId, día, minutos, tema, bitácora, hito relacionado |
| `skill_milestones` | trackId, área, título, posición, estado, fecha de cierre, evidencia |

`src/lib/skills.ts` no importa `../db` ni `node:*`. Eso permite testearlo sin
base de datos y, si más adelante conviene recalcular la racha en el cliente sin
recargar, sirve tal cual desde un `<script>`.

## Fases

- [x] **Fase 0** - Modelo y motor puro. Tres tablas, `src/lib/skills.ts` con
      aritmética de calendario, racha, meta semanal, mapa de calor, progreso
      del temario y logros derivados. `tests/skills.test.ts`, 31 casos.
- [x] **Fase 1** - Temario semilla de .NET/C#: 28 hitos en 8 áreas
      (fundamentos, async, LINQ, EF Core, ASP.NET Core, testing, arquitectura,
      despliegue) más dos de proyecto insignia, uno de ellos portar un módulo
      real de este repositorio a C#. Siembra idempotente por título.
- [x] **Fase 2** - Tablero en `/admin/aprendizaje`: pulso del día, cuatro
      métricas, formulario de registro, mapa de calor, temario por área,
      logros y bitácora. Enlace en el Sidebar bajo "Perfil".
- [x] **Fase 3** - Endpoints con validación (minutos entre 1 y 960, meta entre
      30 y 2400, `trackId` siempre en el `WHERE` de borrado) y ajustes del
      track desde la propia página.
- [x] **Fase 4** - Resumen público opcional en `/certifications`, con claves en
      los dos diccionarios (`es.ts` / `en.ts`).
- [x] **Fase 5** - Documentación: `RF-708` en `src/data/documentacion.ts`,
      iteración `pf-tracker-aprendizaje` (Fase 35) en
      `src/data/iteraciones-portfolio.ts`, este plan y el artículo en `/notes`.

### Pendiente / ideas

- [ ] Recalcular racha y meta en el cliente tras registrar una sesión, en vez
      de `location.reload()`. El módulo ya es puro, así que es cambiar el
      script de la página, no la lógica.
- [ ] Recordatorio por ntfy cuando la racha está en riesgo y quedan pocas horas
      del día. Reutilizaría `src/lib/notify.ts` (no-op silencioso si falta la
      env var) y un cron existente, sin infraestructura nueva.
- [ ] Enlazar un hito cerrado con el proyecto o el repositorio que lo demuestra
      (el campo `evidence_url` ya existe, falta exponerlo en la UI).

## Notas de operación

- La migración `0026` arrastró también las tablas `training_*`, que llevaban
  tiempo en `schema.ts` sin migrar (drift previo, ajeno a este feature). Todo
  es `CREATE TABLE` aditivo. Aplicada el 8 ago 2026 a las **dos** bases Turso
  (principal y demo); si solo se aplica a la principal, `/admin/aprendizaje`
  revienta en modo demo.
- El track se siembra desde la propia página con el botón "Sembrar track .NET y
  C#", que llama a `POST /api/admin/skills/tracks` con `{ seed: 'dotnet' }`.
