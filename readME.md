# Desk Booking System

A modern workspace booking system that allows users to book desks in real-time with features like desk holding, instant notifications, and PDF generation of booking confirmations.

## Prerequisites

Before you begin, ensure you have the following installed:
- [Git](https://git-scm.com/downloads)
- [Docker](https://www.docker.com/products/docker-desktop/)
- [Docker Compose](https://docs.docker.com/compose/install/)
- Bash shell (recommended for running the start script)

## Port Requirements

Make sure the following ports are available on your system:
- 3000 (Frontend)
- 5000 (Backend)
- 5001 (AI Service)

## System Setup

1. Clone the repository:
```bash
git clone <your-repository-url>
cd Desk-Booking-BE
```

2. Start the system:

### For Windows (using Git Bash or WSL):
```bash
# Using Git Bash (recommended)
./start.sh

# Using PowerShell
bash start.sh
```

### For macOS/Linux:
```bash
# Make the script executable (first time only)
chmod +x start.sh

# Run the script
./start.sh
```

The start script will:
1. Stop any running containers
2. Rebuild the Docker images
3. Start all services (Frontend, Backend, and AI)

## System Components

The system consists of three main components:
- Frontend (Next.js) - Running on port 3000
- Backend (Flask) - Running on port 5000
- AI Service (Python) - Running on port 5001

## Accessing the Application

1. Wait for all containers to start successfully. You should see output similar to:
```
[+] Running 4/4
 ✔ Network desk-booking-be_app-net  Created
 ✔ Container sena_ai                Started
 ✔ Container sena_backend           Started
 ✔ Container sena_frontend          Started
```

2. Open your web browser and navigate to:
```
http://localhost:3000/
```

## Troubleshooting

If you encounter any issues:

1. Check if all required ports are available:
```bash
# Windows (PowerShell)
netstat -ano | findstr "3000 5000 5001"

# macOS/Linux
lsof -i :3000,5000,5001
```

2. Ensure Docker is running:
```bash
docker ps
```

3. Check container logs:
```bash
docker-compose logs
```

4. If you need to rebuild from scratch:
```bash
docker-compose down
docker system prune -a  # Remove all unused containers, networks, images
./start.sh
```

## Development

- Frontend code is located in the `FrontEnd` directory
- Backend code is located in the `BackEnd` directory
- AI service code is located in the `AI` directory

