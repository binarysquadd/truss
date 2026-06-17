FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

COPY src ./src
COPY db ./db

EXPOSE 8787

USER node

CMD ["node", "src/index.js"]
