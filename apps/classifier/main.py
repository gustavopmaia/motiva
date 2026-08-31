import io
import logging
import os
import time

import numpy as np
import structlog
import tensorflow as tf
from asgi_correlation_id import CorrelationIdMiddleware, correlation_id
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from PIL import Image
from prometheus_client import Counter, Histogram
from prometheus_fastapi_instrumentator import Instrumentator

MODEL_PATH = os.environ.get("MODEL_PATH", "model/grama_classifier.keras")
IMG_SIZE = 224

ATTENTION_THRESHOLD = float(os.environ.get("ATTENTION_THRESHOLD", "0.4"))
URGENT_THRESHOLD = float(os.environ.get("URGENT_THRESHOLD", "0.7"))

# debug so em dev: em producao enche o Loki de ruido e custa disco.
LOG_LEVEL = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

structlog.configure(
    processors=[
        # Permite bindar campos extras por requisicao via
        # structlog.contextvars.bind_contextvars(...) sem precisar passar
        # esses campos em toda chamada de log manualmente.
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(LOG_LEVEL),
    logger_factory=structlog.PrintLoggerFactory(),
)
logger = structlog.get_logger()

app = FastAPI(title="Cultiva Vegetation Classifier")

# /metrics com as metricas HTTP padrao (latencia, contagem, status por rota).
Instrumentator().instrument(app).expose(app)

inference_duration_seconds = Histogram(
    "classifier_inference_duration_seconds",
    "Duracao da inferencia do modelo (so o predict, sem pre-processar a imagem)",
)
predictions_total = Counter(
    "classifier_predictions_total",
    "Total de predicoes por classificacao",
    ["classification"],
)

model = tf.keras.models.load_model(MODEL_PATH)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    # Uvicorn roda com --no-access-log (ver Dockerfile): sem isto o log de
    # acesso sairia em texto puro do proprio Uvicorn, duplicando esta linha
    # em outro formato.
    start = time.perf_counter()
    response = await call_next(request)
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_seconds=round(time.perf_counter() - start, 4),
        request_id=correlation_id.get(),
    )
    return response


# Middleware do Starlette e pilha (o ultimo add_middleware() vira o mais
# externo): precisa vir DEPOIS do @app.middleware("http") acima para que o
# request id ja exista quando log_requests roda - senao request_id sai
# sempre None no log.
app.add_middleware(CorrelationIdMiddleware)


def preprocess(image_bytes: bytes) -> np.ndarray:
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image = image.resize((IMG_SIZE, IMG_SIZE))
    array = np.asarray(image, dtype=np.float32) / 255.0
    return np.expand_dims(array, axis=0)


def classify(probability: float) -> tuple[str, float]:
    if probability < ATTENTION_THRESHOLD:
        return "ok", 1 - probability
    if probability < URGENT_THRESHOLD:
        return "attention", probability
    return "urgent", probability


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/classify")
async def classify_photo(photo: UploadFile = File(...)):
    if photo.content_type != "image/jpeg":
        raise HTTPException(status_code=400, detail="photo must be a JPEG image")

    image_bytes = await photo.read()
    try:
        batch = preprocess(image_bytes)
    except Exception as error:
        raise HTTPException(status_code=400, detail=f"invalid image: {error}") from error

    with inference_duration_seconds.time():
        probability = float(model.predict(batch, verbose=0)[0][0])
    classification, confidence = classify(probability)
    predictions_total.labels(classification=classification).inc()

    return {
        "classification": classification,
        "confidence": confidence,
        "rawProbability": probability,
    }
