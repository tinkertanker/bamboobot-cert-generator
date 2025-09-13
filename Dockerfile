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
# Ensure Prisma Client is generated after the schema is available
RUN npx prisma generate
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
COPY --from=builder /app/next.config.js ./next.config.js
# Copy Prisma schema and migrations
COPY --from=builder /app/prisma ./prisma

# Create required directories for file uploads and generated PDFs
RUN mkdir -p /app/public/temp_images /app/public/generated /app/public/template_images
# Create directory for SQLite database
RUN mkdir -p /app/prisma
# Create temp directory for formidable uploads with proper permissions
RUN mkdir -p /app/tmp/uploads
# Ensure proper permissions for the directories
RUN chown -R nextjs:nodejs /app
# Make sure the public directories are writable
RUN chmod -R 755 /app/public
RUN chmod -R 775 /app/public/temp_images /app/public/generated /app/public/template_images
# Make temp directory writable for formidable
RUN chmod -R 777 /app/tmp/uploads
# Make prisma directory writable for database
RUN chmod -R 777 /app/prisma

# Switch to non-root user
USER nextjs

# The command to start the application
CMD ["npm", "start"]
