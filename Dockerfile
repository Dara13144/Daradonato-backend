FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5005
ENV PORT=5005
CMD ["npm", "start"]
