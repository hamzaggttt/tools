FROM node:20
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
RUN mkdir -p uploads output && chmod 777 uploads output
EXPOSE 3000
CMD [ "node", "server.js" ]
