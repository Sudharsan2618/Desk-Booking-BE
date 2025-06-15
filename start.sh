#!/bin/bash

# Stop any running containers
echo "Stopping running containers..."
docker-compose down

# Rebuild the images
echo "Rebuilding images..."
docker-compose build --no-cache

# Start the containers
echo "Starting containers..."
docker-compose up -d
