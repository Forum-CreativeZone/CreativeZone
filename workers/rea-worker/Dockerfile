FROM node:24-bookworm-slim

ENV NODE_ENV=production
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates procps \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --global rea-agents@6.5.0

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./

RUN mkdir -p /tmp/rea-work && chown -R node:node /app /tmp/rea-work
USER node

EXPOSE 8080
CMD ["node","server.mjs"]
