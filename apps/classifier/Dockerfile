FROM python:3.11-slim

WORKDIR /app

COPY apps/classifier/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/classifier/main.py .
COPY apps/classifier/model model

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
