# Dockerfile

# ---- Base Stage ----
# Use a specific Node.js version for reproducibility. Alpine versions are smaller.
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# ---- Builder Stage ----
# This stage builds the Next.js application.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Production Stage ----
# This is the final, lean image that will run the application.
FROM node:20-alpine AS runner
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Set environment variables
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000
ENV PORT=3000

# Copy necessary files from the builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Create required directories for file uploads and generated PDFs
RUN mkdir -p /app/public/temp_images /app/public/generated
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# The command to start the application
CMD ["npm", "start"]
