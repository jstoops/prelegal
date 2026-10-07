#!/usr/bin/env sh
# Stop and remove the Prelegal container (its database goes with it).
set -eu

if [ -n "$(docker ps -aq --filter name=^prelegal$)" ]; then
  docker rm -f prelegal >/dev/null
  echo "Prelegal stopped."
else
  echo "Prelegal is not running."
fi
