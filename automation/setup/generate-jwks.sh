#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' 'Hydra owns signing-key generation and rotation. Generate/import JWKs through Hydra Admin API after the local stack is healthy; this script intentionally never writes private keys to the repository.'
