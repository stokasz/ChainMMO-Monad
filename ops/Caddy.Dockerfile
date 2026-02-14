FROM caddy:2

# Bake the Caddyfile into the image so Coolify deployments don't rely on bind-mounting
# local files (Coolify's docker-compose parser treats unknown bind mounts as directories).
COPY Caddyfile /etc/caddy/Caddyfile

