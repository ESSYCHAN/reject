# ============================================
# REJECT Server Dockerfile
# ============================================
# This file tells Docker how to build the Express backend
#
# LEARNING POINTS:
# - Each instruction creates a "layer" (cached for speed)
# - Order matters: put things that change LEAST at the top
# - Multi-stage builds: build in one image, run in another (smaller final image)

# ----- STAGE 1: BUILD -----
# Start from official Node.js 20 image (Alpine = small Linux)
FROM node:20-alpine AS builder

# Set working directory inside the container
# All following commands run from here
WORKDIR /app

# Copy ONLY package files first
# Why? Docker caches layers. If package.json hasn't changed,
# it won't re-run npm install (saves time!)
COPY server/package*.json ./

# Install dependencies
# --frozen-lockfile = use exact versions from lock file
RUN npm ci --frozen-lockfile

# NOW copy the rest of the code
# (This layer changes often, so it's AFTER npm install)
COPY server/ ./

# Build TypeScript to JavaScript
RUN npm run build


# ----- STAGE 2: PRODUCTION -----
# Start fresh with a clean image (smaller!)
FROM node:20-alpine AS production

WORKDIR /app

# Copy only what we need from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Security: Don't run as root
# Create a non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001
USER nodejs

# Tell Docker this container listens on port 8787
EXPOSE 8787

# The command to run when container starts
CMD ["node", "dist/index.js"]
