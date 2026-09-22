"""Run inside the built image: exercises the real model through HTTP."""
import concurrent.futures
import io
import json
import math
import subprocess
import sys
import time
import urllib.error
import urllib.request

from PIL import Image

BASE = "http://127.0.0.1:8000"


def request(path, data=None, content_type=None):
    headers = {"Content-Type": content_type} if content_type else {}
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data, headers), timeout=60) as response:
            return response.status, json.load(response)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)


def classify(data, content_type="image/jpeg"):
    boundary = "motiva-smoke-boundary"
    body = (f'--{boundary}\r\nContent-Disposition: form-data; name="photo"; filename="sample.jpg"\r\n'
            f"Content-Type: {content_type}\r\n\r\n").encode() + data + f"\r\n--{boundary}--\r\n".encode()
    return request("/classify", body, f"multipart/form-data; boundary={boundary}")


def main():
    server = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--limit-concurrency", "16", "--no-access-log"])
    try:
        deadline = time.monotonic() + 90
        while True:
            if server.poll() is not None:
                raise RuntimeError("Classifier exited during model loading")
            try:
                if request("/health")[0] == 200:
                    break
            except OSError:
                pass
            if time.monotonic() >= deadline:
                raise TimeoutError("Classifier did not become ready")
            time.sleep(0.2)

        photo = io.BytesIO()
        Image.new("RGB", (320, 240), (35, 100, 45)).save(photo, "JPEG")
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            predictions = [executor.submit(classify, photo.getvalue()) for _ in range(2)]
            assert executor.submit(request, "/health/live").result()[0] == 200
            results = [prediction.result() for prediction in predictions]
        for status, result in results:
            assert status == 200, result
            assert result["classification"] in ("ok", "attention", "urgent")
            for key in ("confidence", "rawProbability"):
                assert math.isfinite(result[key]) and 0 <= result[key] <= 1, result
            assert result["modelVersion"].startswith("sha256:")
            assert result["preprocessingVersion"] == "rgb-224-normalized-v1"
        assert results[0][1] == results[1][1], "Repeated inference must be deterministic"
        assert classify(b"not a jpeg")[0] == 400
        assert classify(photo.getvalue(), "image/png")[0] == 400
        assert classify(b"x" * (5 * 1024 * 1024 + 1))[0] == 413
        print(json.dumps({"result": "passed", "checks": ["model readiness", "concurrent inference", "determinism", "invalid format", "invalid bytes", "size limit"], "modelVersion": results[0][1]["modelVersion"]}))
    finally:
        server.terminate()
        try:
            server.wait(timeout=10)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()


if __name__ == "__main__":
    main()
