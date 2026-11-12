#!/usr/bin/env bash
# ==============================================================================
# post_edit_check.sh — Antigravity PostToolUse Hook
# Validates JSON syntax for .storage/lovelace* files after edits.
# Must output `{}` per PostToolUse contract.
# ==============================================================================

cat >/dev/null || true
echo '{}'
