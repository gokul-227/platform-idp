FROM python:3.13-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
EXPOSE 9931
CMD ["gunicorn", "--bind", "0.0.0.0:9931", "--workers", "2", "app:app"]
