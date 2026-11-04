FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@9.12.0

WORKDIR /web_rally
RUN chown node:node /web_rally
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --silent

COPY --chown=node:node . .

EXPOSE 3003
CMD  pnpm dev --port 3003 --host
