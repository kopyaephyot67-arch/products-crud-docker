#!/usr/bin/env bash
# wait-for-it.sh

# Get DB_HOST and DB_PORT from environment variables (set in docker-compose.yml)
host="$DB_HOST"
port="$DB_PORT"
cmd="$@"

echo "Waiting for $host:$port to be available..."

while ! nc -z "$host" "$port"; do  
  sleep 0.5
done

echo "$host:$port is ready. Executing command..."

exec $cmd