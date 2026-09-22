"""Inference policy independent of FastAPI and TensorFlow."""
import math


def validate_thresholds(attention: float, urgent: float) -> None:
    if not (math.isfinite(attention) and math.isfinite(urgent) and 0 < attention < urgent < 1):
        raise ValueError("thresholds must satisfy 0 < attention < urgent < 1")


def classify_probability(probability: float, attention: float, urgent: float) -> tuple[str, float]:
    validate_thresholds(attention, urgent)
    if not math.isfinite(probability) or not 0 <= probability <= 1:
        raise ValueError("model probability must be finite and between 0 and 1")
    if probability < attention:
        return "ok", 1 - probability
    if probability < urgent:
        return "attention", probability
    return "urgent", probability
