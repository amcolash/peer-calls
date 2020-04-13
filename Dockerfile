FROM node:12-alpine
WORKDIR /app
RUN chown node:node /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build
RUN rm -rf node_modules build/index.prod.js

FROM node:12-alpine
WORKDIR /app
RUN chown node:node /app
COPY package.json .
RUN npm install --production && rm -rf ~/.npm
COPY --from=0 /app .
RUN chown -R root:root .
EXPOSE 3000
STOPSIGNAL SIGINT
ENTRYPOINT ["node", "lib/index.js"]
