import sys
import os
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pytest
from fastapi.testclient import TestClient
import numpy as np
from main import app, THRESHOLD, DISTANCE_METRIC, model_state, perform_liveness_check

client = TestClient(app)
model_state["status"] = "ready"

def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["modelName"] == "ArcFace"
    assert data["prototypeThreshold"] == THRESHOLD
    assert data["distanceMetric"] == DISTANCE_METRIC
    assert data["antispoofEnabled"] is True
    assert "MiniFASNet" in data["antispoofModel"]

def test_unauthorized_internal_access():
    response = client.post("/face/detect-and-embed", json={"image_base64": "invalid"})
    assert response.status_code == 401

def test_malformed_image():
    response = client.post(
        "/face/detect-and-embed",
        json={"image_base64": "not_a_valid_base64_image_content!!!"},
        headers={"X-Internal-Service-Key": "dev_internal_key"}
    )
    assert response.status_code == 400

def test_cosine_distance_logic():
    # Unit test distance logic mathematically
    u = np.ones(512, dtype=np.float32)
    v = np.ones(512, dtype=np.float32)

    dot = np.dot(u, v)
    dist = 1.0 - (dot / (np.linalg.norm(u) * np.linalg.norm(v)))
    assert abs(dist) < 1e-6
    assert dist <= THRESHOLD

    # Opposite vectors
    v_opp = -np.ones(512, dtype=np.float32)
    dot_opp = np.dot(u, v_opp)
    dist_opp = 1.0 - (dot_opp / (np.linalg.norm(u) * np.linalg.norm(v_opp)))
    assert dist_opp > THRESHOLD

def test_liveness_detection_synthetic_rejection():
    # Synthetic flat image should not be recognized as a live human
    dummy_img = np.zeros((300, 300, 3), dtype=np.uint8)
    dummy_fa = {"x": 50, "y": 50, "w": 100, "h": 100}
    is_real, score = perform_liveness_check(dummy_img, dummy_fa)
    assert is_real is False
    assert score > 0.5
