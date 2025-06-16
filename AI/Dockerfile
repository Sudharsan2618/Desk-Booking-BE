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

 
 