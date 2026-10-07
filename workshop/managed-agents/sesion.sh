#!/usr/bin/env bash
# Práctica 1: lanza una sesión del vigía con tope de gasto y abre el visor.
# Uso: ./sesion.sh [tope_en_centavos]   (por defecto 150 = US$1,50)
set -euo pipefail
cd "$(dirname "$0")"

tope="${1:-150}"
agente=$(jq -r '.resources["./agents/vigia/agent.md"].id' claude-lock.json)
entorno=$(jq -r '.resources["./agents/vigia/environment.yaml"].id' claude-lock.json)

if [ "$agente" = "null" ] || [ "$entorno" = "null" ]; then
  echo "Primero: ant apply agents/vigia/agent.md agents/vigia/environment.yaml" >&2
  exit 1
fi

sesion=$(ant beta:sessions create --transform id -r <<YAML
agent: $agente
environment_id: $entorno
title: Vigía, corrida manual
budget:
  type: limit
  max_list_cost: {amount: "$tope", currency: USD}
initial_events:
  - type: user.message
    content:
      - type: text
        text: Haz la revisión completa según tus instrucciones y deja informe.md e informe.json en /mnt/session/outputs/.
YAML
)

echo "Sesión: $sesion"
echo "Para verla en vivo (y aprobar o interrumpir): ant beta:sessions connect $sesion"
echo "Al terminar, los informes:"
echo "  ant beta:files list --scope-id $sesion --beta managed-agents-2026-04-01"
