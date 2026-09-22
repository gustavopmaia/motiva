import io
import asyncio
import hashlib
from contextlib import asynccontextmanager
import logging
import os
import time

import numpy as np
import structlog
import tensorflow as tf
from asgi_correlation_id import CorrelationIdMiddleware, correlation_id
from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from PIL import Image
from starlette.concurrency import run_in_threadpool
from policy import classify_probability, validate_thresholds
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

validate_thresholds(ATTENTION_THRESHOLD, URGENT_THRESHOLD)
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
INFERENCE_CONCURRENCY = int(os.environ.get("INFERENCE_CONCURRENCY", "1"))
if not 1 <= INFERENCE_CONCURRENCY <= 8:
    raise ValueError("INFERENCE_CONCURRENCY must be between 1 and 8")


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = await run_in_threadpool(tf.keras.models.load_model, MODEL_PATH)
    with open(MODEL_PATH, "rb") as model_file:
        app.state.model_version = "sha256:" + hashlib.file_digest(model_file, "sha256").hexdigest()
    app.state.inference_slots = asyncio.Semaphore(INFERENCE_CONCURRENCY)
    yield
    app.state.model = None


app = FastAPI(title="Cultiva Vegetation Classifier", lifespan=lifespan)

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
    image = Image.open(io.BytesIO(image_bytes))
    if image.format != "JPEG" or image.width * image.height > MAX_IMAGE_PIXELS:
        raise ValueError("image must be JPEG with at most 20 million pixels")
    image = image.convert("RGB")
    image = image.resize((IMG_SIZE, IMG_SIZE))
    array = np.asarray(image, dtype=np.float32) / 255.0
    return np.expand_dims(array, axis=0)


def classify(probability: float) -> tuple[str, float]:
    return classify_probability(probability, ATTENTION_THRESHOLD, URGENT_THRESHOLD)


@app.get("/health")
def health():
    if getattr(app.state, "model", None) is None:
        raise HTTPException(status_code=503, detail="model is not ready")
    return {"status": "ok"}


@app.get("/health/live")
def live():
    return {"status": "ok"}


@app.post("/classify")
async def classify_photo(photo: UploadFile = File(...)):
    if photo.content_type != "image/jpeg":
        raise HTTPException(status_code=400, detail="photo must be a JPEG image")

    image_bytes = await photo.read(MAX_PHOTO_BYTES + 1)
    if len(image_bytes) > MAX_PHOTO_BYTES:
        raise HTTPException(status_code=413, detail="photo exceeds 5 MiB")

    def infer():
        try:
            batch = preprocess(image_bytes)
        except Exception as error:
            raise HTTPException(status_code=400, detail="invalid JPEG image") from error
        with inference_duration_seconds.time():
            return float(app.state.model.predict(batch, verbose=0)[0][0])

    async with app.state.inference_slots:
        probability = await run_in_threadpool(infer)
    classification, confidence = classify(probability)
    predictions_total.labels(classification=classification).inc()
    return {
        "classification": classification,
        "confidence": confidence,
        "rawProbability": probability,
        "modelVersion": app.state.model_version,
        "preprocessingVersion": "rgb-224-normalized-v1",
    }
