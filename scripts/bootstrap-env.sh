#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_EXAMPLE="${ROOT_DIR}/.env.example"
ENV_FILE="${ROOT_DIR}/.env"

if [[ ! -f "${ENV_EXAMPLE}" ]]; then
  echo "ERROR: ${ENV_EXAMPLE} not found"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  cp "${ENV_EXAMPLE}" "${ENV_FILE}"
  echo "Created ${ENV_FILE} from .env.example"
fi

rand_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "${bytes}"
  else
    od -An -N "${bytes}" -tx1 /dev/urandom | tr -d ' \n'
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"

  if grep -qE "^${key}=" "${ENV_FILE}"; then
    sed -i "s#^${key}=.*#${key}=${value}#" "${ENV_FILE}"
  else
    printf '\n%s=%s\n' "${key}" "${value}" >> "${ENV_FILE}"
  fi
}

ensure_generated_secret() {
  local key="$1"
  local bytes="$2"
  local current

  current="$(grep -E "^${key}=" "${ENV_FILE}" | head -n1 | cut -d= -f2- || true)"

  if [[ -z "${current}" || "${current}" == replace_with_* ]]; then
    local generated
    generated="$(rand_hex "${bytes}")"
    set_env_value "${key}" "${generated}"
    echo "Generated ${key}"
  fi
}

ensure_generated_secret "CREDS_KEY" 32
ensure_generated_secret "CREDS_IV" 16
ensure_generated_secret "JWT_SECRET" 32
ensure_generated_secret "JWT_REFRESH_SECRET" 32
ensure_generated_secret "MEILI_MASTER_KEY" 32

while IFS= read -r line; do
  [[ -z "${line}" ]] && continue
  key="${line%%=*}"

  if ! grep -qE "^${key}=" "${ENV_FILE}"; then
    printf '\n%s\n' "${line}" >> "${ENV_FILE}"
    echo "Added missing variable from .env.example: ${key}"
  fi
done < <(grep -E '^[A-Z0-9_]+=' "${ENV_EXAMPLE}")

missing=0
while IFS= read -r key; do
  [[ -z "${key}" ]] && continue
  if ! grep -qE "^${key}=" "${ENV_FILE}"; then
    echo "Missing required variable in .env: ${key}"
    missing=1
  fi
done < <(grep -E '^[A-Z0-9_]+=' "${ENV_EXAMPLE}" | cut -d= -f1)

if [[ "${missing}" -ne 0 ]]; then
  echo "ERROR: .env is missing one or more variables from .env.example"
  exit 1
fi

echo "Environment bootstrap complete."
echo "Next step: edit ${ENV_FILE} and set real API keys manually before startup."
