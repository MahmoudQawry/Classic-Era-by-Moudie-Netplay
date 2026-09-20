#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run this installer as root: sudo bash infra/realtime/install-ubuntu.sh"
  exit 1
fi

read -r -p "Moudie NetPlay API domain (example: netplay.example.com): " API_DOMAIN
read -r -p "Moudie NetPlay LiveKit domain (example: livekit.example.com): " LIVEKIT_DOMAIN
read -r -p "Moudie NetPlay TURN domain (example: turn.example.com): " TURN_DOMAIN

for value in "$API_DOMAIN" "$LIVEKIT_DOMAIN" "$TURN_DOMAIN"; do
  [[ "$value" =~ ^[A-Za-z0-9.-]+$ ]] || { echo "Invalid domain: $value"; exit 1; }
done

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl openssl ufw git

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

PUBLIC_IP="$(curl -4fsS --max-time 10 https://api.ipify.org)"
mkdir -p infra/realtime
ENV_FILE="infra/realtime/.env.production"

if [[ ! -f "$ENV_FILE" ]]; then
  cat > "$ENV_FILE" <<EOF
API_DOMAIN=$API_DOMAIN
LIVEKIT_DOMAIN=$LIVEKIT_DOMAIN
TURN_DOMAIN=$TURN_DOMAIN
REALTIME_REGION=me-central-1
REALTIME_RELEASE=moudie-netplay-1
MYSQL_ROOT_PASSWORD=$(openssl rand -hex 32)
MYSQL_PASSWORD=$(openssl rand -hex 32)
REDIS_PASSWORD=$(openssl rand -hex 32)
LIVEKIT_API_KEY=moudie_live_$(openssl rand -hex 12)
LIVEKIT_API_SECRET=$(openssl rand -hex 32)
TURN_SHARED_SECRET=$(openssl rand -hex 32)
PUBLIC_IP=$PUBLIC_IP
ALLOWED_ORIGINS=https://$API_DOMAIN
EOF
  chmod 600 "$ENV_FILE"
else
  echo "Keeping existing $ENV_FILE"
fi

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw allow 3478/tcp
ufw allow 3478/udp
ufw allow 7881/tcp
ufw allow 50000:60000/udp
ufw allow 49160:49260/udp
ufw --force enable

docker compose --env-file "$ENV_FILE" -f infra/realtime/docker-compose.production.yml up -d --build

for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "http://127.0.0.1:3000/api/health" | grep -q '"ok":true'; then
    echo
    echo "Moudie NetPlay API is healthy."
    echo "API:     https://$API_DOMAIN/api/health"
    echo "LiveKit: wss://$LIVEKIT_DOMAIN"
    echo "TURN:    turn:$TURN_DOMAIN:443 (UDP), turn:$TURN_DOMAIN:3478 (TCP)"
    exit 0
  fi
  sleep 2
done

echo "Moudie NetPlay did not become healthy. Showing recent logs:"
docker compose --env-file "$ENV_FILE" -f infra/realtime/docker-compose.production.yml ps
docker compose --env-file "$ENV_FILE" -f infra/realtime/docker-compose.production.yml logs --tail=120 api livekit coturn caddy
exit 1
