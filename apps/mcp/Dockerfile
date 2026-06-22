# Truss MCP server (hosted Streamable HTTP transport). Build context: apps/mcp
FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY src ./src
ENV MCP_PORT=8765
EXPOSE 8765
USER node
CMD ["node", "src/http.js"]
