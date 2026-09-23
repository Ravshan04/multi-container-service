#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ACTIVE_FILE="state/active-color"
SLOT_FILE="state/slots.env"
PROXY_FILE="nginx/default.conf"
PROXY_TEMPLATE="nginx/default.conf.template"
mkdir -p state

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  DOCKER=(sudo docker)
fi
compose() { "${DOCKER[@]}" compose --env-file .env --env-file "$SLOT_FILE" "$@"; }
docker_cmd() { "${DOCKER[@]}" "$@"; }

release_image="$(sed -n 's/^API_IMAGE=//p' .env | tail -n 1)"
release_version="$(sed -n 's/^APP_VERSION=//p' .env | tail -n 1)"
release_image="${release_image:-multi-container-service:local}"
release_version="${release_version:-local}"

slot_value() {
  local key="$1"
  [[ -f "$SLOT_FILE" ]] && awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$SLOT_FILE"
}

blue_image="$(slot_value BLUE_IMAGE)"
blue_version="$(slot_value BLUE_VERSION)"
green_image="$(slot_value GREEN_IMAGE)"
green_version="$(slot_value GREEN_VERSION)"
blue_image="${blue_image:-multi-container-service:local}"
blue_version="${blue_version:-local}"
green_image="${green_image:-multi-container-service:local}"
green_version="${green_version:-local}"

if [[ -f "$ACTIVE_FILE" ]]; then
  current="$(<"$ACTIVE_FILE")"
  [[ "$current" == blue || "$current" == green ]] || {
    echo "Invalid active color in $ACTIVE_FILE: $current" >&2
    exit 1
  }
  target="$([[ "$current" == blue ]] && printf green || printf blue)"
else
  current=""
  target=blue
fi

if [[ "$target" == blue ]]; then
  blue_image="$release_image"
  blue_version="$release_version"
else
  green_image="$release_image"
  green_version="$release_version"
fi
printf 'BLUE_IMAGE=%s\nBLUE_VERSION=%s\nGREEN_IMAGE=%s\nGREEN_VERSION=%s\n' \
  "$blue_image" "$blue_version" "$green_image" "$green_version" > "$SLOT_FILE"

write_proxy() {
  local color="$1"
  sed -E "s/(proxy_pass http:\/\/api-)(blue|green)(:3000;)/\\1${color}\\3/" "$PROXY_TEMPLATE" > "$PROXY_FILE.tmp"
  if [[ -e "$PROXY_FILE" ]]; then
    cat "$PROXY_FILE.tmp" > "$PROXY_FILE"
    rm -f "$PROXY_FILE.tmp"
  else
    mv "$PROXY_FILE.tmp" "$PROXY_FILE"
  fi
}

wait_healthy() {
  local service="$1"
  local deadline=$((SECONDS + 180))
  local container status

  while (( SECONDS < deadline )); do
    container="$(compose ps -q "$service")"
    if [[ -n "$container" ]]; then
      status="$(docker_cmd inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
      case "$status" in
        healthy) return 0 ;;
        unhealthy|exited|dead)
          compose logs --tail=100 "$service"
          echo "$service failed its health check (state: $status)" >&2
          return 1
          ;;
      esac
    fi
    sleep 2
  done

  compose logs --tail=100 "$service"
  echo "Timed out waiting for $service to become healthy" >&2
  return 1
}

wait_proxy() {
  local expected_version="$1"
  local attempt
  for attempt in {1..20}; do
    if curl --fail --silent http://127.0.0.1/health \
      | grep --fixed-strings --quiet "\"version\":\"$expected_version\""; then
      return 0
    fi
    sleep 2
  done
  return 1
}

compose pull mongo nginx blackbox node-exporter mongodb-exporter prometheus grafana
if [[ -n "$(sed -n 's/^API_IMAGE=//p' .env | tail -n 1)" ]]; then
  compose pull "api-$target"
fi
compose up -d mongo blackbox node-exporter mongodb-exporter prometheus grafana
wait_healthy mongo

if [[ -n "$current" ]]; then
  write_proxy "$current"
  compose up -d --no-deps --no-recreate "api-$current" nginx
  wait_healthy "api-$current"
else
  current=""
  target=blue
  if [[ -e "$PROXY_FILE" && ! -e state/legacy-nginx.conf ]]; then
    cp "$PROXY_FILE" state/legacy-nginx.conf
  fi
fi

compose up -d --no-deps "api-$target"
wait_healthy "api-$target"
target_container="$(compose ps -q "api-$target")"
expected_version="$(docker_cmd exec "$target_container" printenv APP_VERSION)"

if [[ -n "$current" ]]; then
  write_proxy "$target"
  if ! compose exec -T nginx nginx -s reload; then
    write_proxy "$current"
    compose exec -T nginx nginx -s reload || true
    exit 1
  fi
else
  write_proxy "$target"
  compose up -d --no-deps --no-recreate nginx
  if ! compose exec -T nginx nginx -s reload; then
    if [[ -e state/legacy-nginx.conf ]]; then
      cat state/legacy-nginx.conf > "$PROXY_FILE"
      compose exec -T nginx nginx -s reload || true
    fi
    exit 1
  fi
fi

if ! wait_proxy "$expected_version"; then
  echo "Traffic check failed after switching to $target; rolling back" >&2
  if [[ -n "$current" ]]; then
    write_proxy "$current"
    compose exec -T nginx nginx -s reload || true
  elif [[ -e state/legacy-nginx.conf ]]; then
    cat state/legacy-nginx.conf > "$PROXY_FILE"
    compose exec -T nginx nginx -s reload || true
  fi
  exit 1
fi

printf '%s\n' "$target" > "$ACTIVE_FILE"
if [[ -n "$current" ]]; then
  compose stop "api-$current"
fi

legacy_api="$(docker_cmd ps -q --filter label=com.docker.compose.project=multi-container-service --filter label=com.docker.compose.service=api)"
if [[ -n "$legacy_api" ]]; then
  # Retire the pre-blue-green API only after the new proxy route has passed its check.
  while IFS= read -r container; do
    [[ -n "$container" ]] && docker_cmd stop "$container"
  done <<< "$legacy_api"
fi

echo "Blue-green deployment complete: api-$target is receiving traffic"
