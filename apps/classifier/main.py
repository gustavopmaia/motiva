import io
import os

import numpy as np
import tensorflow as tf
from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

MODEL_PATH = os.environ.get("MODEL_PATH", "model/grama_classifier.keras")
IMG_SIZE = 224

ATTENTION_THRESHOLD = float(os.environ.get("ATTENTION_THRESHOLD", "0.4"))
URGENT_THRESHOLD = float(os.environ.get("URGENT_THRESHOLD", "0.7"))

app = FastAPI(title="Cultiva Vegetation Classifier")
model = tf.keras.models.load_model(MODEL_PATH)


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

    probability = float(model.predict(batch, verbose=0)[0][0])
    classification, confidence = classify(probability)

    return {
        "classification": classification,
        "confidence": confidence,
        "rawProbability": probability,
    }
