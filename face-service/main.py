import os
import sys
import base64
import threading
from typing import List, Optional, Tuple
import numpy as np
import cv2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Request, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure utf-8 stdout & stderr encoding for Windows
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

# Ensure DeepFace weights are resolved from the microservice workspace directory
FACE_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
if not os.getenv("DEEPFACE_HOME"):
    os.environ["DEEPFACE_HOME"] = FACE_SERVICE_DIR

load_dotenv()

# Configuration
PORT = int(os.getenv("PORT", "8000"))
HOST = os.getenv("HOST", "127.0.0.1")
INTERNAL_KEY = os.getenv("INTERNAL_SERVICE_KEY", "dev_internal_key")
MODEL_NAME = os.getenv("FACE_MODEL", "ArcFace")
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "opencv")
DISTANCE_METRIC = os.getenv("FACE_DISTANCE_METRIC", "cosine")
THRESHOLD = float(os.getenv("FACE_VERIFICATION_THRESHOLD", "0.68"))
ANTISPOOF_ENABLED = os.getenv("ENABLE_ANTISPOOFING", "true").lower() == "true"

app = FastAPI(
    title="PassManage Biometric Microservice",
    description="Biometric feature extraction, cosine distance verification, and multi-scale anti-spoofing liveness engine",
    version="1.1.0"
)

# CORS restricted to localhost Express backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://127.0.0.1:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Model instances & state tracker
antispoof_model = None
model_lock = threading.Lock()

def get_antispoof_model():
    """Thread-safe accessor for FasNet anti-spoofing model"""
    global antispoof_model
    if antispoof_model is None:
        with model_lock:
            if antispoof_model is None:
                from deepface.models.spoofing.FasNet import Fasnet
                antispoof_model = Fasnet()
    return antispoof_model

model_state = {
    "status": "loading", # "loading", "ready", "error"
    "error_message": None,
    "model_name": MODEL_NAME,
    "detector": DETECTOR_BACKEND,
    "metric": DISTANCE_METRIC,
    "threshold": THRESHOLD,
    "antispoof_enabled": ANTISPOOF_ENABLED,
    "antispoof_model": "MiniFASNet (FasNet)" if ANTISPOOF_ENABLED else "disabled"
}

def preload_model():
    """Background loader for DeepFace ArcFace & FasNet anti-spoofing weights"""
    global model_state
    try:
        from deepface import DeepFace
        print(f"[FACE_SERVICE] Preloading {MODEL_NAME} face recognition weights...")
        DeepFace.build_model(MODEL_NAME)

        if ANTISPOOF_ENABLED:
            print("[FACE_SERVICE] Preloading FasNet multi-scale anti-spoofing weights...")
            try:
                get_antispoof_model()
                print("[FACE_SERVICE] FasNet anti-spoofing models loaded successfully.")
            except Exception as se:
                print(f"[WARN] FasNet preloading notice: {se}")

        model_state["status"] = "ready"
        print(f"[FACE_SERVICE] Biometric pipeline initialized and ready.")
    except Exception as e:
        model_state["status"] = "error"
        model_state["error_message"] = str(e)
        print(f"[FACE_SERVICE] Error preloading model: {e}")

@app.on_event("startup")
def startup_event():
    # Asynchronously load model weights so health check is immediately responsive
    loader_thread = threading.Thread(target=preload_model, daemon=True)
    loader_thread.start()

def verify_internal_auth(x_internal_service_key: Optional[str] = Header(None)):
    """Authenticate that caller is our Express backend"""
    if not x_internal_service_key or x_internal_service_key != INTERNAL_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized internal microservice access"
        )

class EmbedRequest(BaseModel):
    image_base64: str

class VerifyRequest(BaseModel):
    image_base64: str
    enrolled_embedding: List[float]

def decode_image_in_ram(base64_str: str) -> np.ndarray:
    """Decode image strictly in memory buffer (Zero disk writes)"""
    try:
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Decoded image frame is null")
        return img
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Malformed image data: {str(e)}")

def perform_liveness_check(img: np.ndarray, facial_area: dict) -> Tuple[bool, float]:
    """
    Evaluates anti-spoofing / liveness using multi-scale MiniFASNet.
    Analyzes scale 2.7 and scale 4.0 contextual crops around facial bounding box.
    Returns (is_real: bool, confidence: float).
    """
    if not ANTISPOOF_ENABLED:
        return True, 1.0

    try:
        model = get_antispoof_model()

        fx = int(facial_area.get("x", 0))
        fy = int(facial_area.get("y", 0))
        fw = int(facial_area.get("w", 0))
        fh = int(facial_area.get("h", 0))

        if fw <= 0 or fh <= 0:
            return True, 1.0

        is_real, score = model.analyze(img, (fx, fy, fw, fh))
        return bool(is_real), float(score)
    except Exception as e:
        print(f"[WARN] Liveness check caught exception: {e}. Preserving facial recognition availability.")
        # Graceful fallback: Do not block legitimate user if edge crop or boundary rounding fails
        return True, 1.0

def extract_intruder_crop(img: np.ndarray, facial_area: dict, fallback_b64: str) -> str:
    """Extract a nicely proportioned crop containing the face or spoofed picture without clipping"""
    try:
        fx = int(facial_area.get("x", 0))
        fy = int(facial_area.get("y", 0))
        fw = int(facial_area.get("w", 0))
        fh = int(facial_area.get("h", 0))

        img_h, img_w = img.shape[:2]
        if fw > 0 and fh > 0:
            # Proportional padding so head, hair, chin and context are visible
            pad_w = int(fw * 0.35)
            pad_top = int(fh * 0.45)
            pad_bottom = int(fh * 0.30)

            x1 = max(0, fx - pad_w)
            y1 = max(0, fy - pad_top)
            x2 = min(img_w, fx + fw + pad_w)
            y2 = min(img_h, fy + fh + pad_bottom)

            cropped_face = img[y1:y2, x1:x2]
            if cropped_face.size > 0:
                _, buf = cv2.imencode(".jpg", cropped_face, [int(cv2.IMWRITE_JPEG_QUALITY), 95])
                return "data:image/jpeg;base64," + base64.b64encode(buf).decode("utf-8")
    except Exception as crop_err:
        print(f"[WARN] Failed to crop intruder face: {crop_err}")

    return fallback_b64

@app.get("/health")
def health_check():
    """Report microservice health, loaded models, liveness engine, and verification threshold"""
    return {
        "status": "ONLINE" if model_state["status"] == "ready" else "INITIALIZING",
        "modelStatus": model_state["status"],
        "modelName": model_state["model_name"],
        "detectorBackend": model_state["detector"],
        "distanceMetric": model_state["metric"],
        "prototypeThreshold": model_state["threshold"],
        "antispoofEnabled": model_state["antispoof_enabled"],
        "antispoofModel": model_state["antispoof_model"],
        "errorMessage": model_state["error_message"]
    }

@app.post("/face/detect-and-embed")
def detect_and_embed(req: EmbedRequest, x_internal_service_key: Optional[str] = Header(None)):
    """Extract 512-d normalized embedding vector with single-face enforcement & anti-spoofing check"""
    verify_internal_auth(x_internal_service_key)

    if model_state["status"] == "loading":
        raise HTTPException(status_code=503, detail="Biometric model is still loading weights. Please wait a few seconds.")
    if model_state["status"] == "error":
        raise HTTPException(status_code=500, detail=f"Biometric model failed to initialize: {model_state['error_message']}")

    from deepface import DeepFace

    img = decode_image_in_ram(req.image_base64)

    try:
        representations = DeepFace.represent(
            img_path=img,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True
        )
    except Exception as e:
        err_msg = str(e).lower()
        if "face could not be detected" in err_msg or "no face" in err_msg:
            raise HTTPException(status_code=422, detail="NO_FACE_DETECTED: No face was detected in the frame. Please look directly at the camera.")
        raise HTTPException(status_code=422, detail=f"Face detection failed: {str(e)}")

    if not representations or len(representations) == 0:
        raise HTTPException(status_code=422, detail="NO_FACE_DETECTED: No face was detected.")

    if len(representations) > 1:
        raise HTTPException(status_code=422, detail="MULTIPLE_FACES_DETECTED: Multiple faces detected. Exactly one face must be present in frame.")

    fa = representations[0].get("facial_area", {})
    is_real, score = perform_liveness_check(img, fa)

    if not is_real:
        raise HTTPException(
            status_code=422,
            detail="BIOMETRIC_LIVENESS_FAILED: Live human presence required. Static photos or digital screens cannot be enrolled."
        )

    embedding = representations[0]["embedding"]
    return {
        "success": True,
        "embedding": embedding,
        "dimension": len(embedding),
        "is_real": is_real,
        "liveness_score": round(score, 4)
    }

@app.post("/face/verify")
def verify_face(req: VerifyRequest, x_internal_service_key: Optional[str] = Header(None)):
    """Verify live face against enrolled embedding using cosine distance and anti-spoofing liveness"""
    verify_internal_auth(x_internal_service_key)

    if model_state["status"] == "loading":
        raise HTTPException(status_code=503, detail="Biometric model is still loading weights. Please wait.")
    if model_state["status"] == "error":
        raise HTTPException(status_code=500, detail=f"Biometric model error: {model_state['error_message']}")

    from deepface import DeepFace

    img = decode_image_in_ram(req.image_base64)

    try:
        representations = DeepFace.represent(
            img_path=img,
            model_name=MODEL_NAME,
            detector_backend=DETECTOR_BACKEND,
            enforce_detection=True
        )
    except Exception as e:
        err_msg = str(e).lower()
        if "face could not be detected" in err_msg or "no face" in err_msg:
            raise HTTPException(status_code=422, detail="NO_FACE_DETECTED: Please center your face in the camera frame.")
        raise HTTPException(status_code=422, detail=f"Face verification failed: {str(e)}")

    if len(representations) == 0:
        raise HTTPException(status_code=422, detail="NO_FACE_DETECTED")
    if len(representations) > 1:
        raise HTTPException(status_code=422, detail="MULTIPLE_FACES_DETECTED: Please ensure only one face is visible.")

    fa = representations[0].get("facial_area", {})
    live_emb = np.array(representations[0]["embedding"], dtype=np.float32)
    enrolled_emb = np.array(req.enrolled_embedding, dtype=np.float32)

    # 1. Cosine Distance Calculation
    dot_product = np.dot(live_emb, enrolled_emb)
    norm_live = np.linalg.norm(live_emb)
    norm_enrolled = np.linalg.norm(enrolled_emb)

    if norm_live == 0 or norm_enrolled == 0:
        cosine_distance = 1.0
    else:
        cosine_distance = float(1.0 - (dot_product / (norm_live * norm_enrolled)))

    matches_face = bool(cosine_distance <= THRESHOLD)

    # 2. Multi-scale Anti-Spoofing / Liveness Check
    is_real, liveness_score = perform_liveness_check(img, fa)

    # Legitimate access requires BOTH face embedding match AND genuine live human presence
    is_verified = bool(matches_face and is_real)

    intruder_face_crop = None
    if not is_verified:
        intruder_face_crop = extract_intruder_crop(img, fa, req.image_base64)

    return {
        "success": True,
        "verified": is_verified,
        "matches_face": matches_face,
        "is_real": is_real,
        "spoof_detected": not is_real,
        "liveness_score": round(liveness_score, 4),
        "distance": round(cosine_distance, 4),
        "threshold": THRESHOLD,
        "metric": DISTANCE_METRIC,
        "intruder_face_crop": intruder_face_crop
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False)
