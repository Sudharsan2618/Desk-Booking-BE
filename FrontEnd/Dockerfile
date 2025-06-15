
# 1. Base image for building the app
FROM node:18-alpine AS builder

# 2. Set working directory
WORKDIR /app

# 3. Copy package files and install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# 4. Copy all application files
COPY . .

# 6. Build the Next.js app
RUN npm run build

# 7. Production image
FROM node:18-alpine AS runner

# 8. Set working directory
WORKDIR /app

# 9. Static runtime env vars (non-sensitive)
ENV NODE_ENV=production
ENV PORT=3000

# 10. Install only production dependencies
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules

# 11. Copy built files and static assets
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public

# 12. Expose port and start app
EXPOSE 3000
CMD ["npm", "start"]

