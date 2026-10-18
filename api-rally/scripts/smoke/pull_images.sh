#!/usr/bin/env bash
# Acquire every base image the smoke stack needs, before `docker compose up`.
#
# Why this exists: pulling the same public, anonymous reference repeatedly is
# not reliable from shared GitHub runner IPs — Docker Hub answers
# "unauthorized: authentication required" and public.ecr.aws answers
# "toomanyrequests: Data limit exceeded" once the IP's quota is spent, and
# retrying the same registry cannot help. So each image is pinned by digest
# and tried, in order, from:
#
#   1. ghcr.io/nei-aauav/rally-ci/*  — the org's own mirror, pulled with the
#      workflow's GITHUB_TOKEN (populated by .github/workflows/mirror-ci-images.yml)
#   2. mirror.gcr.io                 — Google's Docker Hub pull-through cache
#   3. public.ecr.aws/docker/library — AWS's Docker Hub mirror
#   4. docker.io                     — the upstream itself
#
# A digest reference is content-addressed, so every source is guaranteed to
# serve byte-identical content; the image is then tagged under the plain name
# docker-compose.smoke.yml / the Dockerfile use, and CI runs
# `docker compose up --pull never` so nothing is ever pulled implicitly.
#
# To bump an image: update its digest here (the same digest in every
# registry — check with `docker buildx imagetools inspect <ref>`), then re-run
# the mirror workflow.
set -euo pipefail

MIRROR="${SMOKE_IMAGE_MIRROR:-ghcr.io/nei-aauav/rally-ci}"
ATTEMPTS_PER_SOURCE="${SMOKE_PULL_ATTEMPTS:-2}"

# local tag | digest | Docker Hub library name
LIBRARY_IMAGES=(
  "postgres:15|sha256:724292da1f2e50bdccfc3302ce75bbba7f4a6076701b588cc795fcac65683550|postgres"
  "redis:7-alpine|sha256:858f009f9709ce576febc734aa78b8f6d624b82571f9ddb6bda4377c833b3499|redis"
  "python:3.12-slim|sha256:f77ac9e44ae96ef2c90b8053ea08c31f8be030f824196b0ae4db6d462c84e51f|python"
)

# Pulled exactly as docker-compose.smoke.yml references them (already
# digest-pinned, single source — see the comment on the minio service).
COMPOSE_FILE="$(dirname "$0")/../../docker-compose.smoke.yml"
DIRECT_IMAGES=()
while IFS= read -r ref; do
  DIRECT_IMAGES+=("$ref")
done < <(grep -oE 'cgr\.dev/[^ "]+@sha256:[0-9a-f]{64}' "$COMPOSE_FILE")
if ((${#DIRECT_IMAGES[@]} != 2)); then
  echo "::error::expected the 2 digest-pinned minio images in $COMPOSE_FILE, found ${#DIRECT_IMAGES[@]}" >&2
  exit 1
fi

pull_with_retry() {
  local ref=$1 attempt
  for ((attempt = 1; attempt <= ATTEMPTS_PER_SOURCE; attempt++)); do
    if docker pull --quiet "$ref" >/dev/null; then
      return 0
    fi
    echo "  pull of $ref failed (attempt $attempt/$ATTEMPTS_PER_SOURCE)" >&2
    if ((attempt < ATTEMPTS_PER_SOURCE)); then
      sleep 5
    fi
  done
  return 1
}

acquire_library_image() {
  local local_tag=$1 digest=$2 name=$3 src
  for src in \
    "$MIRROR/$name" \
    "mirror.gcr.io/library/$name" \
    "public.ecr.aws/docker/library/$name" \
    "docker.io/library/$name"; do
    if pull_with_retry "$src@$digest"; then
      docker tag "$src@$digest" "$local_tag"
      echo "ok  $local_tag <- $src@$digest"
      return 0
    fi
  done
  echo "::error::could not acquire $local_tag ($digest) from any registry" >&2
  return 1
}

failed=0
for entry in "${LIBRARY_IMAGES[@]}"; do
  IFS='|' read -r local_tag digest name <<<"$entry"
  acquire_library_image "$local_tag" "$digest" "$name" || failed=1
done
for ref in "${DIRECT_IMAGES[@]}"; do
  if pull_with_retry "$ref"; then
    echo "ok  $ref"
  else
    echo "::error::could not acquire $ref" >&2
    failed=1
  fi
done
exit "$failed"
