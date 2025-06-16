# Use an official Python runtime as the base image
FROM python:3.11-slim
 
# Set work directory
WORKDIR /app
 
# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
 
# Copy the application code
COPY . .

ENV OPENAI_API_KEY=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
 
# Define the command to run your app
CMD ["gunicorn", "--bind", "0.0.0.0:5001", "--timeout", "10000", "main:app","--worker-class","uvicorn.workers.UvicornWorker"]

 
 