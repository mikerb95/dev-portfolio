#!/usr/bin/env bash
# Corre los comandos de cada figura del taller de Docker, uno por numero, para
# tomar la captura sin tener que escribirlos a mano.
#
#   ./docs/manuales-sena/capturas.sh          lista las figuras
#   ./docs/manuales-sena/capturas.sh 1        corre los comandos de la Figura 1
#
# Imprime cada comando antes de ejecutarlo, para que en la captura se vea que
# se corrio y no solo su resultado.

set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

run() {
  printf '\n\033[1;32m$\033[0m %s\n' "$*"
  eval "$@"
}

titulo() {
  clear
  printf '\033[1m===== Figura %s: %s =====\033[0m\n' "$1" "$2"
}

case "${1:-}" in

1)
  titulo 1 "Versiones instaladas y estado del servicio"
  run "docker --version"
  run "docker compose version"
  run "systemctl is-active docker"
  run "systemctl is-enabled docker"
  run "uname -r"
  ;;

2)
  titulo 2 "Docker funcionando sin sudo"
  run "id -nG | tr ' ' '\n' | grep -x docker"
  run "docker ps --format 'table {{.Names}}\t{{.Status}}'"
  ;;

3)
  titulo 3 "Salida de docker info"
  run "docker info | head -32"
  run "docker context ls"
  ;;

4)
  # Se borra la imagen antes para que la captura muestre tambien la descarga,
  # que es la mitad interesante de lo que hace docker run.
  titulo 4 "La imagen de prueba hello-world"
  docker rmi hello-world >/dev/null 2>&1
  run "docker run hello-world"
  ;;

5)
  titulo 5 "Un contenedor con puerto publicado"
  docker rm -f prueba-sena >/dev/null 2>&1
  run "docker run -d --name prueba-sena -p 8085:80 nginx"
  sleep 2
  run "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8085"
  run "docker ps --filter name=prueba-sena --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
  printf '\n(el contenedor queda arriba; para borrarlo: docker rm -f prueba-sena)\n'
  ;;

6)
  # --no-cache porque la imagen ya se construyo antes en este equipo y sin esa
  # bandera saldria todo cacheado, que es justo lo de la Figura 7.
  titulo 6 "Primera construccion de la imagen"
  run "docker build --no-cache -t codebymike-dev:sena .devcontainer/"
  ;;

7)
  titulo 7 "La segunda construccion usa la cache"
  run "docker build -t codebymike-dev:sena .devcontainer/"
  ;;

8)
  titulo 8 "Historial de construcciones, imagen y capas"
  if ! docker image inspect codebymike-dev:sena >/dev/null 2>&1; then
    echo "Falta construir la imagen. Corre primero la figura 6." && exit 1
  fi
  run "docker buildx history ls | head -5"
  run "docker images codebymike-dev"
  run "docker history codebymike-dev:sena --format 'table {{.Size}}\t{{.CreatedBy}}'"
  ;;

9)
  titulo 9 "Los servicios levantados y respondiendo"
  run "docker compose ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'"
  run "curl -s -o /dev/null -w 'principal HTTP %{http_code}\n' http://127.0.0.1:8080/health"
  run "curl -s -o /dev/null -w 'demo HTTP %{http_code}\n' http://127.0.0.1:8081/health"
  ;;

10)
  titulo 10 "La aplicacion abierta en el navegador"
  printf '\nEsta captura es del navegador, no de la terminal.\n'
  printf 'En una terminal aparte:  npm run db:seed && npm run dev:carga\n'
  printf 'Despues abrir http://localhost:4400 y capturar una pagina con datos.\n'
  ;;

11)
  titulo 11 "Variables de entorno sin mostrar los valores secretos"
  printf '\n\033[1;33mRevisa que arriba no haya quedado ninguna clave visible.\033[0m\n'
  run "docker inspect codebymike-libsql-main --format '{{range .Config.Env}}{{println .}}{{end}}'"
  run "docker inspect codebymike-libsql-main --format '{{range .Config.Env}}{{println .}}{{end}}' | cut -d= -f1"
  run "grep -c '^ENCRYPTION_KEY=' .env"
  ;;

12)
  # Recrea libsql-main con bind mount. La base local queda vacia hasta el seed.
  titulo 12 "El montaje cambia de volumen a bind mount"
  printf '\n\033[1;33mEsto recrea codebymike-libsql-main. La base local se vacia;\n'
  printf 'se vuelve a llenar con npm run db:seed.\033[0m\n'
  read -r -p 'Continuar? [s/N] ' ok
  [ "$ok" = "s" ] || exit 0
  run "docker inspect codebymike-libsql-main --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'"
  run "docker compose -f compose.yaml -f docs/manuales-sena/compose.sena-bind.yaml up -d"
  sleep 4
  run "docker inspect codebymike-libsql-main --format '{{range .Mounts}}{{.Type}} {{.Source}}{{println}}{{end}}'"
  run "ls -la .data/libsql-main"
  ;;

13)
  titulo 13 "Los datos siguen ahi despues de reiniciar"
  run "node scripts/prueba-persistencia.mjs escribir"
  run "docker compose restart libsql-main"
  sleep 5
  run "node scripts/prueba-persistencia.mjs leer"
  run "du -sh .data/libsql-main"
  ;;

14)
  titulo 14 "Puerto ocupado, diagnostico y solucion"
  docker rm -f choque >/dev/null 2>&1
  run "docker run -d --name choque -p 127.0.0.1:8080:80 nginx"
  run "docker ps --filter publish=8080 --format '{{.Names}} -> {{.Ports}}'"
  run "ss -ltnp | grep :8080"
  run "docker rm -f choque"
  run "docker run -d --name choque -p 127.0.0.1:8086:80 nginx"
  sleep 2
  run "curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8086"
  run "docker rm -f choque"
  ;;

limpiar)
  docker rm -f prueba-sena choque >/dev/null 2>&1
  docker rmi codebymike-dev:sena >/dev/null 2>&1
  echo "contenedores e imagen de prueba borrados"
  echo "para la carpeta del bind mount:"
  echo '  docker run --rm -v "$PWD/.data:/x" alpine rm -rf /x/libsql-main'
  echo "para volver al modo normal:"
  echo "  docker compose up -d --force-recreate"
  ;;

*)
  cat <<'FIN'
Figuras del taller de Docker. Uso: ./docs/manuales-sena/capturas.sh <numero>

   1  Versiones y estado del servicio
   2  Docker sin sudo
   3  docker info y contextos
   4  hello-world (borra la imagen antes, para que se vea la descarga)
   5  Contenedor con puerto publicado
   6  Primera construccion de la imagen (con --no-cache, tarda ~1 min)
   7  Segunda construccion, todo cacheado
   8  Historial, imagen y capas
   9  Compose levantado y los dos health
  10  Navegador (instrucciones, no corre nada)
  11  Variables de entorno sin valores secretos
  12  Cambio de volumen a bind mount (pregunta antes: recrea el contenedor)
  13  Persistencia despues del reinicio
  14  Puerto ocupado

  limpiar   borra los contenedores y la imagen de prueba
FIN
  ;;
esac
