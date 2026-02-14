# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install deps first for better layer caching.
COPY mid/package.json mid/package-lock.json ./mid/
RUN cd mid && npm ci

COPY front/package.json front/package-lock.json ./front/
RUN cd front && npm ci

COPY mid ./mid
COPY front ./front

RUN cd front && npm run build
RUN cd mid && npm run build

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app/mid

COPY --from=build /app/mid/package.json ./package.json
COPY --from=build /app/mid/package-lock.json ./package-lock.json
COPY --from=build /app/mid/node_modules ./node_modules
COPY --from=build /app/mid/dist ./dist
COPY --from=build /app/mid/migrations ./migrations
COPY --from=build /app/mid/playbook ./playbook
COPY --from=build /app/front/dist /app/front/dist
COPY --from=build /app/front/public /app/front/public
COPY --from=build /app/front/contracts.latest.json /app/front/contracts.latest.json
COPY deployments /app/deployments

USER node

EXPOSE 8787

CMD ["node", "dist/main.js"]
