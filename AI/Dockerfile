# Use an official Python runtime as the base image
FROM python:3.11-slim
 
# Set work directory
WORKDIR /app
 
# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
 
# Copy the application code
COPY . .
 
# Define the command to run your app
CMD ["gunicorn", "--bind", "0.0.0.0:5002", "--timeout", "10000", "main:app","--worker-class","uvicorn.workers.UvicornWorker"]

 
 