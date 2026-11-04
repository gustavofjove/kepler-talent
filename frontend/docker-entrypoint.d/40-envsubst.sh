#!/bin/sh
set -eu

envsubst '${API_BASE_URL} ${SUPABASE_URL} ${SUPABASE_ANON_KEY} ${APP_ENV} ${AUTH_MODE} ${APP_VERSION}' \
  < /usr/share/nginx/html/env.template.js \
  > /usr/share/nginx/html/env.js
