FROM node:22-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

EXPOSE 4173
CMD ["node", "dist-cli/cli/run.js", "--host", "0.0.0.0", "--port", "4173"]
