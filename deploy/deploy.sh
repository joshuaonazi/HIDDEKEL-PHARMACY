#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/hiddekel-pharmacy}"
BRANCH="${DEPLOY_BRANCH:-main}"

if [[ "$(id -un)" != "hiddekel" ]]; then
  echo "Run this script as the hiddekel deployment user, not as root." >&2
  exit 1
fi

cd "$APP_DIR"
if [[ "$(git branch --show-current)" != "$BRANCH" ]]; then
  echo "The checkout must be on branch '$BRANCH'." >&2
  exit 1
fi

git fetch origin "$BRANCH"
git merge --ff-only "origin/$BRANCH"

npm --prefix server ci --omit=dev
npm --prefix client ci
npm --prefix client run build

sudo -n /usr/bin/systemctl restart hiddekel-api

for attempt in {1..15}; do
  if curl --fail --silent http://127.0.0.1:5000/api/health; then
    printf '\nDeployment completed successfully.\n'
    exit 0
  fi
  sleep 1
done

echo "The API did not become healthy. Check: sudo journalctl -u hiddekel-api -n 80 --no-pager" >&2
exit 1
