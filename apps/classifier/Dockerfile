# Build em dois estagios: o venv sai pronto do builder e a imagem final nao
# carrega pip cache nem toolchain de compilacao.
FROM python:3.11-slim AS builder

RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# requirements.txt primeiro e sozinho: essa camada (~250MB de tensorflow-cpu)
# so e refeita quando as dependencias mudam, nao a cada commit no main.py.
COPY apps/classifier/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt


FROM python:3.11-slim

# libgomp1: runtime do OpenMP, exigido pelos kernels de CPU do TensorFlow.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TF_CPP_MIN_LOG_LEVEL=3 \
    MODEL_PATH=/app/model/grama_classifier.keras

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

# Ordem por frequencia de mudanca: modelo (raro) antes do codigo (frequente).
COPY apps/classifier/model model
COPY apps/classifier/main.py .

RUN useradd --system --uid 10001 appuser
USER appuser

EXPOSE 8000

# --workers 1: cada worker carrega uma copia inteira do modelo na RAM. Com
# 2GB de limite no pod, mais de um worker estoura o limite e vira OOMKill.
# --no-access-log: o log de acesso sai pelo middleware em main.py (JSON
# estruturado); sem isso o Uvicorn duplicaria a mesma requisicao em texto puro.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log"]
