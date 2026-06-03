#!/bin/bash
# PingHermesAgent launcher — delegates to portable/Start PingHermesAgent.command
exec "$(cd "$(dirname "$0")" && pwd)/portable/Start PingHermesAgent.command" "$@"
