# Emberfall updater: lets the campaign owner update the game from the Admin page.
# It can reach the Docker daemon (to rebuild the game container) and the repo checkout (to git pull),
# so it is only reachable from the game container on the private compose network and requires a secret.
FROM docker:27.3.1-cli
RUN apk add --no-cache git nodejs bash \
 && git config --system --add safe.directory '*'
COPY updater/server.mjs /updater/server.mjs
CMD ["node", "/updater/server.mjs"]
