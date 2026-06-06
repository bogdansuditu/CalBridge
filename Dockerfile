# --- Base Stage ---
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache sqlite openssl

# --- Backend Dev Stage ---
FROM base AS backend-dev
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
EXPOSE 5000
# Run database push to update SQLite, then start the dev server
CMD ["sh", "-c", "npx prisma db push && npm run dev"]

# --- Frontend Dev Stage ---
FROM base AS frontend-dev
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src ./src
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Frontend Production Build Stage ---
FROM base AS build-frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/tsconfig.json ./
COPY frontend/vite.config.ts ./
COPY frontend/index.html ./
COPY frontend/src ./src
RUN npm run build

# --- Backend Production Build Stage ---
FROM base AS build-backend
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend/tsconfig.json ./
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/src ./src
RUN npm run build

# --- Production Runtime Stage ---
FROM base AS production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY backend/prisma ./prisma
RUN npx prisma generate

# Copy built backend files from build-backend stage
COPY --from=build-backend /app/backend/dist ./dist

# Copy React build assets to backend public directory
COPY --from=build-frontend /app/frontend/dist /app/backend/public

ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

# Directory for persistent SQLite database
RUN mkdir -p /app/data
VOLUME /app/data

# Run db push to setup SQLite schema and start production server
CMD ["sh", "-c", "npx prisma db push && npm start"]
