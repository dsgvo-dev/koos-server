FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# Quelldateien sind auf dem Mac nur für den Besitzer lesbar (600). Ohne diese
# Zeile kann ein Nicht-root-Nutzer /app nicht lesen (PermissionError main.py,
# nodeyard 02.10.2026).
RUN chmod -R a+rX /app
# Nicht als root laufen (PLAN-2026-10-01, Schritt 10). UID/GID 1000 = Besitzer
# des Datenverzeichnisses auf nodeyard (gemessen 02.10.2026). Damit gehören
# Datenverzeichnis und .git demselben Nutzer — kein "dubious ownership".
USER 1000:1000
ENV HOME=/tmp
ENV KOOS_HOST=0.0.0.0
EXPOSE 8090
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", \
     "--port", "8090", "--workers", "2"]