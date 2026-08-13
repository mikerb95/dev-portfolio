# Taller de Docker (SENA) resuelto sobre Linux y sobre este proyecto

> Guía de referencia: *Instalación y uso de Docker* (SENA, 30 páginas). Los
> ejercicios de la página 27 (sección 16) se desarrollan aquí contra el stack
> real de CodeByMike en vez de contra la app de ejemplo Dino Run.
>
> Entorno de trabajo verificado: Ubuntu 24.04.4 LTS, kernel 7.0.0-28-generic,
> Docker Engine 29.6.2, Docker Compose v5.3.1, daemon `active` y `enabled`.

## 0. Por qué esta entrega no sigue la guía al pie de la letra

La guía está escrita para **Windows + Docker Desktop + WSL 2 + Gordon**. Este
equipo es Linux, y ahí buena parte del procedimiento no es que sea difícil: es
que **no existe**, porque el problema que resuelve no se presenta.

Docker nació en Linux y el motor corre nativo sobre el kernel del anfitrión.
WSL 2 es exactamente el mecanismo que Windows necesita para *tener* un kernel
Linux donde arrancar contenedores. En Linux ese kernel ya es el del sistema, así
que no hay nada que subsistemar.

| Paso de la guía (Windows) | Qué pasa en Linux | Qué se entrega en su lugar |
|---|---|---|
| Instalar Docker Desktop (§4) | No aplica. Docker Desktop en Linux es opcional y solo añade una GUI y una VM intermedia. Aquí se usa Docker Engine nativo | `docker --version`, `docker info` mostrando el motor nativo |
| Activar WSL 2 (§5.1) | No existe. El kernel Linux es el propio del sistema | `uname -r` como prueba del kernel que comparten los contenedores |
| Habilitar virtualización en BIOS/UEFI (§5.2) | No hace falta. Los contenedores son procesos aislados con namespaces y cgroups, no máquinas virtuales | `docker info` mostrando `cgroupns`, `apparmor`, `seccomp` |
| Dashboard "Engine running" (§5.3, §15 fase 3) | El equivalente es el servicio del sistema | `systemctl is-active docker` → `active` |
| Vistas GUI Builds / Images / Containers / Logs / Bind mounts | No hay GUI, pero cada vista tiene su comando y da **más** información que la pantalla | Tabla de equivalencias de §1.3 |
| Gordon (asistente IA de Docker Desktop) | No está disponible sin Docker Desktop | Los comandos que Gordon habría ejecutado, escritos explícitamente. La guía misma los documenta como "la acción equivalente que realiza Docker" |
| `iniciar_juego.bat` | Archivo por lotes de Windows | No aplica; los scripts equivalentes son los `npm run db:*` del `package.json` |

Un detalle que conviene decir en la sustentación, porque es el fondo del asunto
y no un tecnicismo: **en Windows la app de la guía tampoco corre en Windows.**
Corre en un Linux dentro de WSL 2. Docker Desktop es la capa que oculta eso. Al
trabajar directo sobre Linux se ve el mismo motor sin intermediarios, y por eso
las evidencias de este taller son más directas, no menos.

### Sustitución de la app de ejemplo

La guía usa Dino Run (Flask + SQLite) porque necesita *algo* que contenerizar.
Este proyecto ya usa Docker en serio, y con una decisión de arquitectura
documentada en `compose.yaml` y en `docs/plan-docker.md`:

> Docker **no** es el runtime de producción de este proyecto y no debe llegar a
> serlo. El sitio lo construye y ejecuta Vercel (SSR sobre Fluid Compute);
> contenerizar la app Astro para desplegarla perdería edge, preview deploys por
> PR y el rollback automático de `ci.yml`, a cambio de nada.

Lo que sí está contenerizado, y es donde está el uso profesional de la
herramienta:

1. **`compose.yaml`** levanta dos servidores **libSQL (`sqld`)**, la misma base
   que corre en producción vía Turso. Sirve para probar transacciones, `UNIQUE`
   y concurrencia contra el protocolo real en vez de contra un archivo.
2. **`.devcontainer/Dockerfile`** fija el entorno de desarrollo: Node 22.12
   exacto y el Chromium de Playwright, resolviendo un fallo real (un Node 20
   suelto en el `PATH` rompe `astro build`).

Los seis ejercicios se resuelven contra estos dos artefactos. El mapeo de
conceptos es uno a uno: imagen, contenedor, Dockerfile, `.dockerignore`,
puertos publicados, variables de entorno, bind mount, persistencia, logs y
Compose. Solo cambia la aplicación de ejemplo.

| Concepto de la guía | En Dino Run | En este proyecto |
|---|---|---|
| Imagen | `sena-docker-flask-app-app` | `ghcr.io/tursodatabase/libsql-server` (pineada por digest) y la imagen del devcontainer |
| Contenedor | `dino-game` | `codebymike-libsql-main`, `codebymike-libsql-demo` |
| Puerto publicado | `5000:5000` | `127.0.0.1:8080:8080` y `127.0.0.1:8081:8080` |
| Persistencia | bind mount `./data:/app/data` (SQLite) | volumen `libsql-main-data:/var/lib/sqld` (y bind mount en el ejercicio 5) |
| Variables de entorno | `DATABASE_PATH`, `SECRET_KEY` | `SQLD_NODE`, `SQLD_DB_PATH`, y `TURSO_DATABASE_URL` / `TURSO_DEMO_URL` del lado de la app |
| Compose | un servicio `app` | dos servicios con bloque reutilizable (ancla YAML `x-libsql`) |

---

## 1. Parte A: dejar Docker corriendo y comprobado en Linux

Esto reemplaza a las secciones 4, 5 y 15.1 de la guía. Son los pasos que **sí**
se hacen en Linux, en orden.

### 1.1 Instalación (si hubiera que rehacerla desde cero)

En este equipo Docker ya está instalado desde el repositorio oficial. El
procedimiento completo, para documentarlo en la entrega:

```bash
# 1. Retirar paquetes viejos de la distro, que suelen ser una versión antigua
sudo apt remove docker docker-engine docker.io containerd runc

# 2. Clave GPG y repositorio oficial de Docker
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 3. Motor + CLI + Compose v2 (plugin, no el docker-compose de Python)
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
```

Documentación oficial: <https://docs.docker.com/engine/install/ubuntu/>

### 1.2 Los dos pasos post-instalación que sí son propios de Linux

Este es el equivalente real de "esperar a que Docker Desktop muestre Running".
En Linux el motor es un **servicio del sistema** y el acceso es por **socket**.

**a) Que el servicio arranque solo con el equipo:**

```bash
sudo systemctl enable --now docker
systemctl is-active docker    # -> active
systemctl is-enabled docker   # -> enabled
```

`active` es "el motor está corriendo ahora". `enabled` es "vuelve a arrancar
después de reiniciar". Son cosas distintas y la evidencia debe mostrar las dos.

**b) Usar Docker sin `sudo`:**

```bash
sudo usermod -aG docker $USER
newgrp docker          # o cerrar sesión y volver a entrar
id -nG | tr ' ' '\n' | grep -x docker   # -> docker
```

El daemon expone `/var/run/docker.sock`, propiedad del grupo `docker`. Sin
pertenecer al grupo, cada comando exige `sudo`.

> **Nota de seguridad que vale mencionar en la sustentación:** pertenecer al
> grupo `docker` equivale prácticamente a tener root, porque quien habla con el
> socket puede montar `/` dentro de un contenedor privilegiado. No es un fallo
> de configuración: es el modelo del daemon. La alternativa endurecida es
> **rootless mode** (`dockerd-rootless-setuptool.sh install`), que corre el
> motor con el uid del usuario. En Windows este matiz queda tapado detrás de
> Docker Desktop.

### 1.3 Verificación del motor (equivale a §5.3)

Los cuatro comandos que pide la guía funcionan idénticos en Linux:

```bash
docker --version           # Docker version 29.6.2, build dfc4efb
docker compose version     # Docker Compose version v5.3.1
docker info
docker run hello-world
```

Y para las evidencias específicas de Linux, que en Windows no tendrían sentido:

```bash
uname -r                     # kernel compartido con los contenedores
systemctl status docker --no-pager | head -12
docker info --format 'Server: {{.ServerVersion}} | Root: {{.DockerRootDir}} | Driver: {{.Driver}}'
docker info --format 'Seguridad: {{.SecurityOptions}}'
```

**Tabla de equivalencias GUI → CLI.** Esta tabla es la pieza central de la
entrega: demuestra que no se saltó ningún paso, solo que se hizo por otra vía.

| Vista de Docker Desktop | Comando equivalente en Linux |
|---|---|
| Dashboard "Engine running" | `systemctl is-active docker` |
| Images | `docker images` |
| Containers | `docker ps -a` |
| Builds | `docker buildx history ls` |
| Build → Logs | `docker buildx history logs <BUILD_ID>` |
| Build → Source (Dockerfile) | `docker buildx history inspect <BUILD_ID>` |
| Container → Logs | `docker logs <nombre>` / `docker compose logs -f` |
| Container → Inspect | `docker inspect <nombre>` |
| Container → Files | `docker exec -it <nombre> sh` |
| Container → Stats | `docker stats` |
| Container → Bind mounts | `docker inspect --format '{{json .Mounts}}' <nombre>` |
| Volumes | `docker volume ls` / `docker volume inspect` |
| Capas de una imagen | `docker history <imagen>` |
| Grupo de Compose | `docker compose ps` |

---

## 2. Parte B: los seis ejercicios de la página 27

Todos los comandos de esta sección se ejecutan desde la raíz del repositorio y
están verificados en este equipo.

### Ejercicio 1. Verificación inicial del motor

> *Guía: comprobar mediante la GUI que el motor funciona y puede ejecutar
> imágenes.*

Sin GUI, el ciclo completo es descargar una imagen, crear un contenedor,
ejecutarlo y comprobarlo:

```bash
docker run hello-world
docker images | head
docker ps -a | head
```

Para que la evidencia sea más completa que un `hello-world` (que se muere al
instante y no deja mucho que ver), conviene además levantar algo con puerto:

```bash
docker run -d --name prueba-sena -p 8085:80 nginx
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8085   # HTTP 200
docker ps --filter name=prueba-sena
docker logs prueba-sena
docker rm -f prueba-sena
```

**Qué explicar:** `docker run` no es un solo paso. Busca la imagen local, si no
está la descarga del registro (`pull`), crea el contenedor y lo arranca. El
`hello-world` demuestra las cuatro cosas de golpe, y por eso la guía lo usa como
prueba de vida del motor.

**Capturas:** salida de `docker run hello-world`; salida de `docker --version`,
`docker compose version` y `systemctl is-active docker` en la misma terminal.

### Ejercicio 2. Construcción y revisión de la imagen

> *Guía: construir la app y comprender el resultado desde Images y Builds.*

Aquí se construye el `.devcontainer/Dockerfile` del proyecto, que es un
Dockerfile real y no un ejemplo:

```bash
docker build -t codebymike-dev:sena .devcontainer/
```

Revisión posterior, que cubre exactamente lo que la GUI muestra en Builds e
Images:

```bash
# Vista "Builds": historial de construcciones, estado y duración
docker buildx history ls

# Vista "Build -> Logs" y "Build -> Source"
docker buildx history logs <BUILD_ID>
docker buildx history inspect <BUILD_ID>

# Vista "Images"
docker images codebymike-dev

# Capas de la imagen: esto la GUI lo enseña peor
docker history codebymike-dev:sena --format 'table {{.Size}}\t{{.CreatedBy}}'
```

Y la demostración de la **caché de capas**, que es el concepto que la guía
explica en §6.2 al justificar por qué se copia `requirements.txt` antes que el
código: repetir el mismo `docker build` una segunda vez debe terminar en
segundos con `CACHED` en todos los pasos.

```bash
docker build -t codebymike-dev:sena .devcontainer/   # ahora todo CACHED
```

**Qué explicar sobre este Dockerfile concreto**, contrastándolo con el de Dino
Run instrucción por instrucción:

| Instrucción | Qué hace aquí | Paralelo en la guía |
|---|---|---|
| `FROM node:22.12-bookworm@sha256:0e910f...` | Imagen base **pineada por digest**, no por tag | La guía usa `FROM python:3.12-slim`. El digest es un paso más estricto: un tag es mutable, un digest no. Es reproducibilidad real |
| `ARG PLAYWRIGHT_VERSION=1.61.1` | Fija la versión del navegador de pruebas | La guía no lo usa; aquí evita que Playwright rechace un Chromium instalado por otra versión |
| `RUN npx playwright install-deps chromium` | Dependencias de sistema, como root | Equivale al `RUN pip install -r requirements.txt` |
| `USER node` | Baja privilegios antes de ejecutar | Idéntico a `USER appuser` de Dino Run, con la misma razón: limitar el impacto de una vulnerabilidad |
| `ENV PLAYWRIGHT_BROWSERS_PATH=...` | Variable de entorno horneada en la imagen | La guía prefiere pasar variables desde Compose; esta es de las que sí pertenece a la imagen porque no cambia entre entornos |
| `WORKDIR /workspace` | Directorio de trabajo | Igual que `WORKDIR /app` |

También conviene enseñar el **`.dockerignore` del proyecto**, que responde al
"¿por qué se debe crear?" de §6.3 con un argumento que la guía menciona de
pasada y aquí está escrito como comentario en el archivo:

> Además de peso, esto es higiene de cadena de suministro: un secreto que llega
> al contexto puede quedar en una capa de la imagen aunque el Dockerfile no lo
> copie nunca.

```bash
cat .dockerignore
```

Excluye `.env`, `.env.*`, `.vercel`, `.git`, `node_modules`, `dist`, `.astro`,
`coverage`, reportes de pruebas y los `*.pdf` / `*.docx` de la documentación,
que es la misma lógica que el `.dockerignore` de Dino Run.

**Capturas:** primer `docker build` completo; segundo build mostrando `CACHED`;
`docker buildx history ls`; `docker images`; `docker history`.

### Ejercicio 3. Ejecución y comprobación con Docker Compose

> *Guía: ejecutar la app mediante Compose y acceder desde el navegador sin
> configurar manualmente cada opción de `docker run`.*

El proyecto ya tiene esto envuelto en scripts de npm, que es la versión adulta
del `iniciar_juego.bat` de la guía:

```bash
npm run db:up      # docker compose up -d + espera activa a que /health responda
docker compose ps
```

O directamente, para que se vea el comando que corre debajo:

```bash
docker compose up -d
docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
```

Comprobación por el puerto publicado (el equivalente de "pulsar 5000:5000"):

```bash
curl -s -o /dev/null -w 'main HTTP %{http_code}\n' http://127.0.0.1:8080/health
curl -s -o /dev/null -w 'demo HTTP %{http_code}\n' http://127.0.0.1:8081/health
```

Y la app real hablando con esas bases:

```bash
npm run db:seed
npm run dev:carga    # Astro contra sqld en 8080/8081, puerto 4400
```

**Qué explicar del `compose.yaml`**, que va bastante más allá del de la guía:

- **`x-libsql: &libsql` + `<<: *libsql`** son un *ancla* y un *merge* de YAML:
  el bloque común se declara una vez y los dos servicios lo heredan. La guía
  solo tiene un servicio y no llega a este problema.
- **`image: ...@sha256:07d5da35...`** fija la imagen por digest. Ver arriba.
- **`ports: '127.0.0.1:8080:8080'`** publica **solo en loopback**. La guía
  escribe `"5000:5000"`, que en Linux se abre en *todas* las interfaces y deja
  el servicio visible desde la red local. Es una diferencia de seguridad real,
  no cosmética.
- **`cap_drop: ALL` + `cap_add: [DAC_OVERRIDE, CHOWN, SETUID, SETGID]`** dejan
  el contenedor con el mínimo exacto de capacidades del kernel que `sqld`
  necesita para arrancar. El propio archivo documenta cómo se midieron (quitando
  una a una hasta que `/health` dejó de responder) y el error metodológico que
  hubo en la primera medición. Esto no tiene equivalente en la guía y es un
  buen punto para la sustentación.
- **`restart: unless-stopped`** es idéntico al de la guía.
- La **espera activa** de `scripts/wait-libsql.mjs` cumple el papel del
  `healthcheck` de Dino Run: no dar por arrancado el servicio hasta que
  responde de verdad.

**Capturas:** `docker compose ps` con los dos contenedores `Up`; los dos `curl`
con HTTP 200; el navegador en `http://localhost:4400` con la app sirviendo datos
de las bases en contenedor.

### Ejercicio 4. Variables de entorno y el secreto

> *Guía: distinguir variables predeterminadas, opcionales y sensibles, y
> definirlas correctamente para Compose. Comprobar en Inspect solamente que la
> variable existe, sin mostrar ni capturar su valor real.*

Este ejercicio encaja especialmente bien con este proyecto, porque el manejo de
variables es una regla escrita del repositorio.

**a) Las variables del contenedor**, declaradas en `compose.yaml`:

```bash
docker inspect codebymike-libsql-main \
  --format '{{range .Config.Env}}{{println .}}{{end}}'
# SQLD_NODE=primary
# SQLD_DB_PATH=/var/lib/sqld/main.db
```

`SQLD_DB_PATH` es el paralelo exacto de `DATABASE_PATH=/app/data/dino.db`: le
dice al servicio dónde escribir, y la ruta coincide con el punto de montaje. Si
una de las dos cambia sin la otra, los datos se escriben fuera del volumen y se
pierden al recrear el contenedor.

**b) Las variables de la aplicación**, que es donde está lo sensible. El
`CLAUDE.md` del repositorio fija el criterio:

> El repo mezcla `import.meta.env` y `process.env`, que **no son equivalentes**:
> el dev server carga `.env` solo en el primero, Vercel inyecta solo en el
> segundo. Para leer una env var nueva usar siempre `serverEnv()` de
> `src/lib/env.ts`, que mira ambas fuentes.

Clasificación pedida por el ejercicio, con ejemplos reales del proyecto:

| Tipo | Ejemplo | Dónde vive |
|---|---|---|
| Predeterminada | `TURSO_DATABASE_URL=http://127.0.0.1:8080` en local | `package.json`, script `dev:carga`. Valor conocido y publicable |
| Opcional | `NTFY_TOPIC`, `RESEND_API_KEY` | Si falta, `src/lib/notify.ts` hace no-op silencioso y **nunca lanza**. Igual que la `FLASK_ENV` "opcional" de la guía, pero con la degradación diseñada a propósito |
| Sensible | `ENCRYPTION_KEY`, `AUTH_SECRET`, `CRON_SECRET`, `COBRO_HISTORY_SECRET` | `.env` local (excluido por `.gitignore` y por `.dockerignore`) y variables de entorno de Vercel en producción. Nunca en `compose.yaml`, nunca en una captura |

**c) La demostración pedida**: comprobar que existe sin revelar el valor. La
guía dice literalmente "sin mostrar ni capturar su valor real", así que la
captura debe verse así:

```bash
# Correcto: se prueba la existencia, no se expone el valor
grep -c '^ENCRYPTION_KEY=' .env          # -> 1
docker inspect codebymike-libsql-main \
  --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1
# SQLD_NODE
# SQLD_DB_PATH
# PATH
```

El `cut -d= -f1` recorta el valor y deja solo el nombre. Es la forma correcta de
capturar variables de entorno en un documento que se entrega.

Merece la pena señalar en la sustentación que la guía comete en su propio
ejemplo el error que después advierte: publica
`SECRET_KEY=tu-clave-secreta-mejor-cambiar-en-produccion` dentro del
`compose.yaml` del documento. Ella misma lo corrige en §12 recomendando
interpolación desde un `.env` local:

```yaml
environment:
  - SECRET_KEY=${SECRET_KEY}    # el valor viene del .env, no del compose
```

Este proyecto ya sigue esa regla: ningún secreto está escrito en `compose.yaml`.

**Capturas:** `docker inspect` con nombres de variables (sin valores); el
`.dockerignore` y el `.gitignore` mostrando que `.env` está excluido; el
fragmento de `src/lib/env.ts` con `serverEnv()`.

### Ejercicio 5. Persistencia con bind mount

> *Guía: conservar los datos mediante el bind mount declarado en
> `compose.yaml`; registrar datos, reiniciar y comprobar que permanecen.*

El proyecto usa **volúmenes gestionados** (`libsql-main-data`), no bind mounts,
y esa es la decisión correcta para datos de servicio: Docker controla permisos y
ciclo de vida, y no ensucian el árbol del repositorio. Para el ejercicio hay un
override que cambia solo eso, sin tocar el modo por defecto:

`docs/manuales-sena/compose.sena-bind.yaml`

```yaml
services:
  libsql-main:
    volumes:
      - ./.data/libsql-main:/var/lib/sqld
```

**Procedimiento** (el mecanismo se probó sobre una copia aislada de `sqld`, no
sobre los contenedores en marcha; ejecutarlo recrea `codebymike-libsql-main` y
su base local queda vacía hasta el siguiente `npm run db:seed`):

```bash
# 1. Estado actual: volumen gestionado
docker inspect codebymike-libsql-main \
  --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}'
# volume /var/lib/docker/volumes/codebymike_libsql-main-data/_data -> /var/lib/sqld

# 2. Levantar con el override de bind mount
docker compose -f compose.yaml -f docs/manuales-sena/compose.sena-bind.yaml up -d

# 3. Confirmar el cambio de tipo de montaje (equivale a la pestaña Bind mounts)
docker inspect codebymike-libsql-main \
  --format '{{range .Mounts}}{{.Type}} {{.Source}} -> {{.Destination}}{{println}}{{end}}'
# bind /home/mike/dev/work/github.com/portfolio/.data/libsql-main -> /var/lib/sqld

# 4. La carpeta aparece en el host, que es la gracia del bind mount
ls -la .data/libsql-main

# 5. Escribir datos
npm run db:seed

# 6. Reiniciar el contenedor
docker compose restart libsql-main

# 7. Comprobar que los datos siguen ahí
du -sh .data/libsql-main
```

Para una comprobación de persistencia más explícita que un `du`, el equivalente
de "registrar un usuario y ver que el récord permanece":

```bash
node -e "
const {createClient} = require('@libsql/client');
const c = createClient({url:'http://127.0.0.1:8080'});
(async () => {
  await c.execute('CREATE TABLE IF NOT EXISTS prueba_sena(id INTEGER PRIMARY KEY, nota TEXT)');
  await c.execute(\"INSERT INTO prueba_sena(nota) VALUES('antes del restart')\");
  console.log('filas:', (await c.execute('SELECT count(*) n FROM prueba_sena')).rows[0].n);
})();"

docker compose restart libsql-main && sleep 5

node -e "
const {createClient} = require('@libsql/client');
createClient({url:'http://127.0.0.1:8080'})
  .execute('SELECT count(*) n, max(nota) nota FROM prueba_sena')
  .then(r => console.log('tras el restart:', r.rows[0].n, '|', r.rows[0].nota));"
```

Salida esperada, y verificada en este equipo:

```
filas: 1
tras el restart: 1 | antes del restart
```

**Volver al modo normal:**

```bash
docker compose up -d --force-recreate    # sin el -f del override
```

> **Gotcha propio de Linux, y buen material para el informe.** Los archivos que
> `sqld` crea dentro de `.data/` quedan con el **uid del usuario del
> contenedor** (666), no con el tuyo. Borrarlos desde el host falla:
>
> ```
> rm: cannot remove '.data/libsql-main/main.db/dbs/default/data': Permission denied
> ```
>
> La solución es borrarlos desde un contenedor, que sí corre como root:
>
> ```bash
> docker run --rm -v "$PWD/.data:/x" alpine rm -rf /x/libsql-main
> ```
>
> Esto **no pasa en Windows con Docker Desktop**, porque el sistema de archivos
> va por una traducción que aplana la propiedad de los archivos. Es una de las
> diferencias reales entre las dos plataformas, y explica por qué en equipos
> Linux se prefieren volúmenes gestionados para datos de servicio y los bind
> mounts se reservan para código fuente en desarrollo.

**Capturas:** los dos `docker inspect` (antes `volume`, después `bind`);
`ls -la .data/libsql-main`; la salida de las dos consultas alrededor del
`restart`; el error de `Permission denied` y su solución.

### Ejercicio 6. Diagnóstico: puerto ocupado

> *Guía: diagnosticar un puerto ocupado y adaptar el puerto del host en
> `compose.yaml`.*

Este error se reproduce a voluntad, sin esperar a que ocurra. Con
`codebymike-libsql-main` ya ocupando el 8080, basta pedir el mismo puerto:

```bash
docker run -d --name choque -p 127.0.0.1:8080:80 nginx
```

Error obtenido, verificado en este equipo:

```
Error response from daemon: failed to set up container networking: driver failed
programming external connectivity on endpoint choque: Bind for 127.0.0.1:8080
failed: port is already allocated
```

**Diagnóstico** (equivale a "abra Containers e identifique qué servicio usa el
puerto"):

```bash
# Quién lo ocupa, si es un contenedor
docker ps --filter publish=8080 --format '{{.Names}} -> {{.Ports}}'
# codebymike-libsql-main -> 5001/tcp, 127.0.0.1:8080->8080/tcp

# Quién lo ocupa, si es un proceso del sistema (esto la GUI no lo puede ver)
ss -ltnp | grep :8080
```

Ese `ss -ltnp` es la ventaja de trabajar en Linux: si el puerto lo ocupa un
proceso nativo del anfitrión y no un contenedor, Docker Desktop no lo encuentra
y el diagnóstico se queda a medias.

**Solución**, la que propone la guía: cambiar el puerto del anfitrión, no el del
contenedor.

```bash
docker rm -f choque
docker run -d --name choque -p 127.0.0.1:8086:80 nginx
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8086   # HTTP 200
docker rm -f choque
```

O en Compose, exactamente como dice la guía (`"5001:5000"` en su caso):

```yaml
ports:
  - '127.0.0.1:8085:8080'   # solo cambia el lado izquierdo
```

**Qué explicar:** en `HOST:CONTENEDOR`, el lado del contenedor lo fija la
aplicación (`sqld` escucha en 8080 y no negocia), mientras que el lado del
anfitrión es libre. Por eso la solución siempre es mover el izquierdo. Es
también el motivo de que `EXPOSE` no publique nada: solo documenta el puerto
interno.

**Capturas:** el error `port is already allocated`; `docker ps --filter
publish=8080`; `ss -ltnp | grep :8080`; el contenedor funcionando en el puerto
alterno.

---

## 3. Actividades de aprendizaje (§17) con respuestas del proyecto

**17.1 Reflexión inicial.** *"Empaquetar una aplicación"* es entregar el
programa junto con todo lo que necesita para correr (intérprete, librerías,
configuración, comando de arranque) en una unidad que no depende de cómo esté
configurada la máquina de destino.

El caso real de este proyecto está escrito en `CLAUDE.md` y es exactamente el
"en mi computador sí funciona" de la introducción de la guía: **el shell por
defecto trae Node 20, y `astro build` exige ≥22.12**. El mismo repositorio, el
mismo comando, resultado distinto según la máquina. El `.devcontainer/` es la
respuesta: fija Node 22.12 dentro de una imagen y esa clase entera de fallo
desaparece.

**17.2 Imagen, contenedor y Dockerfile.**

- **Dockerfile**: la receta. `.devcontainer/Dockerfile`, texto plano versionado.
- **Imagen**: el resultado de cocinar la receta. Inmutable, en capas, apilada y
  cacheada. `docker images`.
- **Contenedor**: una instancia en ejecución de esa imagen, con su capa
  escribible propia. De una imagen salen muchos contenedores;
  `codebymike-libsql-main` y `codebymike-libsql-demo` corren **la misma imagen**
  con configuración distinta, y eso se ve en un `docker ps`.

**17.3 Apropiación.** Cubierta por los ejercicios 2 (capas y caché), 3 (Compose)
y 5 (persistencia). El punto "cambie un elemento visual y reconstruya" se
traduce aquí a modificar el `ARG PLAYWRIGHT_VERSION` del devcontainer y observar
en el segundo build qué capas se invalidan y cuáles siguen `CACHED`: cambia esa
línea y todo lo posterior se rehace, pero el `FROM` no se vuelve a descargar.

---

## 4. Checklist de capturas para el documento de entrega

Diez capturas cubren las evidencias de desempeño de §18.2 y los criterios de
evaluación de §19.

| # | Captura | Comando | Criterio de §19 que cubre |
|---|---|---|---|
| 1 | Motor instalado y activo | `docker --version`, `docker compose version`, `systemctl is-active docker`, `systemctl is-enabled docker`, `uname -r` | Instala Docker y se orienta en el entorno |
| 2 | Usuario sin `sudo` | `id -nG \| tr ' ' '\n' \| grep -x docker` y un `docker ps` sin `sudo` | Instalación completa |
| 3 | Prueba de vida | `docker run hello-world` | Ejecuta imágenes |
| 4 | Build del Dockerfile del proyecto | `docker build -t codebymike-dev:sena .devcontainer/` | Construye la imagen |
| 5 | Caché de capas | segundo build con todos los pasos `CACHED` | Analiza el proceso de construcción |
| 6 | Builds e Images | `docker buildx history ls`, `docker images`, `docker history` | Analiza el proceso desde Builds |
| 7 | Compose arriba | `docker compose ps` + los dos `curl /health` con 200 | Ejecuta y comprueba por el puerto publicado |
| 8 | Variables de entorno | `docker inspect ... \| cut -d= -f1` + `.dockerignore` con `.env` | Distingue variables opcionales y sensibles |
| 9 | Bind mount y persistencia | `docker inspect` (`volume` → `bind`), `ls -la .data/`, consulta antes y después del `restart` | Configura y verifica la persistencia |
| 10 | Diagnóstico | error `port is already allocated`, `docker ps --filter publish=8080`, `ss -ltnp`, contenedor en puerto alterno | Interpreta logs y corrige errores |

Añadir al documento la **tabla de equivalencias GUI → CLI de §1.3** y la **tabla
de §0**. Con eso queda demostrado que ningún paso de la guía se omitió: cada uno
tiene su equivalente en Linux o una razón técnica por la que no aplica.

**Antes de entregar:** revisar que ninguna captura muestre el valor de una
variable sensible. El propio criterio de evaluación lo pide ("entrega evidencias
completas sin exponer información sensible") y en este proyecto es además una
regla de arquitectura.

---

## 5. Comandos de limpieza al terminar

```bash
docker rm -f prueba-sena choque 2>/dev/null
docker rmi codebymike-dev:sena
docker run --rm -v "$PWD/.data:/x" alpine rm -rf /x/libsql-main   # ver ejercicio 5
docker compose up -d --force-recreate                              # volver al modo normal
```

No usar `docker system prune -a` en este equipo: hay contenedores de otros
proyectos corriendo (Supabase, entre otros) y ese comando borra imágenes que
después habría que volver a descargar.
