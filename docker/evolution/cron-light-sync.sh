#!/usr/bin/env bash
# Sync leve → PoliticRank na Vercel.
# Uso na Contabo (crontab): a cada 30 minutos
#   */30 * * * * /opt/politirank-evolution/cron-light-sync.sh >> /var/log/politirank-light-sync.log 2>&1
#
# Requer arquivo /opt/politirank-evolution/cron.env com:
#   CRON_SECRET=sua-chave-longa
#   APP_URL=https://politirank-app.vercel.app

set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck disable=SC1091
source "${DIR}/cron.env"

if [[ -z "${CRON_SECRET:-}" || -z "${APP_URL:-}" ]]; then
  echo "Defina CRON_SECRET e APP_URL em ${DIR}/cron.env"
  exit 1
fi

curl -fsS -X GET \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL%/}/api/cron/whatsapp-light-sync"
echo
