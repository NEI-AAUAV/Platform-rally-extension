FROM node:26-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN npm install -g pnpm@9.12.0

WORKDIR /web_rally
RUN chown node:node /web_rally
USER node

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --silent

# Explicit copies (not `COPY . .`) so local secrets or artifacts never leak
# into the image. compose.yml bind-mounts the full tree over this in dev.
COPY --chown=node:node index.html vite.config.ts tsconfig.json tsconfig.node.json \
     postcss.config.js tailwind.config.js components.json openapi-ts.config.ts ./
COPY --chown=node:node public ./public
COPY --chown=node:node src ./src

EXPOSE 3003
CMD  pnpm dev --port 3003 --host
