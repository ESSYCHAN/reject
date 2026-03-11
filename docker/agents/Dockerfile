# ============================================
# REJECT Agents Dockerfile (Python/FastAPI)
# ============================================
# This builds Maya and the AI agents
#
# LEARNING POINTS:
# - Python uses pip instead of npm
# - requirements.txt = Python's package.json
# - Virtual environments not needed in Docker (container IS the isolation)

# Start from Python 3.11 (slim = smaller than full image)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
# Some Python packages need these to compile
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for layer caching)
COPY agents/requirements.txt ./

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the code
COPY agents/ ./

# Create non-root user for security
RUN useradd -m -u 1001 appuser
USER appuser

# Tell Docker this container listens on 8080
EXPOSE 8080

# Run the FastAPI server
CMD ["python", "server.py"]
