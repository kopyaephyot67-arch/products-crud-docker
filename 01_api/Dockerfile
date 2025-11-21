FROM node:20-alpine

# Install netcat (nc) for the wait-for-it script to check the port
RUN apk add --no-cache netcat-openbsd

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN npm ci --only=production

# Copy application files and the new wait script
COPY . .

# Ensure the wait script is executable
RUN chmod +x wait-for-it.sh

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 4000

# 💡 CRITICAL CHANGE: Use wait-for-it.sh to ensure DB is ready before starting index.js
CMD ["./wait-for-it.sh", "node", "index.js"]