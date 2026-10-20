import os
import sys
import math
from PIL import Image, ImageDraw, ImageFont

def create_system_architecture():
    # High resolution canvas for publication-grade crispness
    width = 2400
    height = 1680
    
    # Clean white background
    bg_color = (255, 255, 255)
    img = Image.new("RGBA", (width, height), bg_color)
    draw = ImageDraw.Draw(img)

    # Fonts
    font_dir = r"C:\Windows\Fonts"
    try:
        font_title = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 38)
        font_section = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 26)
        font_box_header = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 22)
        font_sub = ImageFont.truetype(os.path.join(font_dir, "segoeui.ttf"), 17)
        font_bold = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 17)
        font_label = ImageFont.truetype(os.path.join(font_dir, "segoeuib.ttf"), 15)
        font_tag = ImageFont.truetype(os.path.join(font_dir, "consola.ttf"), 15)
    except:
        font_title = ImageFont.load_default()
        font_section = font_title
        font_box_header = font_title
        font_sub = font_title
        font_bold = font_title
        font_label = font_title
        font_tag = font_title

    # Palette
    c_text_dark = (15, 23, 42)
    c_text_muted = (71, 85, 105)
    c_arrow = (51, 65, 85)

    def draw_card(x1, y1, x2, y2, fill, border, r=14, border_w=2):
        draw.rounded_rectangle([x1, y1, x2, y2], radius=r, fill=fill, outline=border, width=border_w)

    def draw_arrow(x1, y1, x2, y2, label="", color=c_arrow, width=3, is_bidirectional=False):
        draw.line([x1, y1, x2, y2], fill=color, width=width)
        angle = math.atan2(y2 - y1, x2 - x1)
        arrow_len = 15
        arrow_w = 6
        
        # End arrow
        px1 = x2 - arrow_len * math.cos(angle) + arrow_w * math.sin(angle)
        py1 = y2 - arrow_len * math.sin(angle) - arrow_w * math.cos(angle)
        px2 = x2 - arrow_len * math.cos(angle) - arrow_w * math.sin(angle)
        py2 = y2 - arrow_len * math.sin(angle) + arrow_w * math.cos(angle)
        draw.polygon([(x2, y2), (px1, py1), (px2, py2)], fill=color)

        if is_bidirectional:
            # Start arrow
            px1 = x1 + arrow_len * math.cos(angle) + arrow_w * math.sin(angle)
            py1 = y1 + arrow_len * math.sin(angle) - arrow_w * math.cos(angle)
            px2 = x1 + arrow_len * math.cos(angle) - arrow_w * math.sin(angle)
            py2 = y1 + arrow_len * math.sin(angle) + arrow_w * math.cos(angle)
            draw.polygon([(x1, y1), (px1, py1), (px2, py2)], fill=color)

        if label:
            mx = (x1 + x2) / 2
            my = (y1 + y2) / 2
            bbox = font_label.getbbox(label)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            draw.rectangle([mx - tw/2 - 10, my - th/2 - 5, mx + tw/2 + 10, my + th/2 + 5], fill=(255, 255, 255, 250), outline=(203, 213, 225), width=1)
            draw.text((mx - tw/2, my - th/2 - 2), label, fill=c_text_dark, font=font_label)

    # ==================== MAIN TITLE HEADER ====================
    title_text = "PassManage: High-Assurance Zero-Knowledge System Architecture"
    subtitle_text = "Progressive-Trust Multi-Modal Authorization Pipeline (ArcFace Biometrics + FIDO2 WebAuthn + AES-256-GCM)"
    draw.text((80, 35), title_text, fill=(15, 23, 42), font=font_title)
    draw.text((80, 85), subtitle_text, fill=(100, 116, 139), font=font_sub)

    # ==================== TIER 1: CLIENT LAYER ====================
    client_y1, client_y2 = 135, 450
    draw_card(80, client_y1, 2320, client_y2, (248, 250, 252), (186, 230, 253), r=16, border_w=2)
    draw.text((115, client_y1 + 16), "CLIENT TRUST DOMAIN (Chromium Host Environment)", fill=(3, 105, 161), font=font_section)

    # Box 1A: React Web App
    draw_card(115, client_y1 + 58, 1170, client_y2 - 20, (255, 255, 255), (56, 189, 248), r=12, border_w=2)
    draw.text((140, client_y1 + 72), "React.js + Tailwind CSS Web Application", fill=(14, 116, 144), font=font_box_header)
    draw.text((140, client_y1 + 104), "Vite Dev Server (Port 5173) | Responsive Dark Enterprise UI", fill=c_text_muted, font=font_tag)
    
    app_items = [
        ("• Onboarding & Enrollment:", "WebRTC video capture & FIDO2 passkey attestation ceremony"),
        ("• Empty-Vault Baseline:", "Strict zero-dummy data architecture; authentic user credentials only"),
        ("• Categorized Vault CRUD:", "Shareable, Restricted, and High-Sensitivity category assignment"),
        ("• Verification Bridge (/verify):", "Dedicated secure iframe/tab for biometric & passkey step-up")
    ]
    cur_y = client_y1 + 138
    for heading, desc in app_items:
        draw.text((140, cur_y), heading, fill=c_text_dark, font=font_bold)
        draw.text((430, cur_y), desc, fill=c_text_muted, font=font_sub)
        cur_y += 32

    # Box 1B: Chrome Extension MV3
    draw_card(1230, client_y1 + 58, 2285, client_y2 - 20, (255, 255, 255), (14, 165, 233), r=12, border_w=2)
    draw.text((1255, client_y1 + 72), "Chrome Extension (Manifest V3 Companion)", fill=(2, 132, 199), font=font_box_header)
    draw.text((1255, client_y1 + 104), "Service Worker Architecture | Decoupled Zero-Knowledge Transport", fill=c_text_muted, font=font_tag)
    
    ext_items = [
        ("• In-Page Dropdown:", "Floating account selector anchored to input focus (Google-style)"),
        ("• Top Floating Banner:", "Automatic matching notification pill with one-click autofill prompt"),
        ("• Service Worker Coordinator:", "Target-tab tracking, challenge pairing, and post-auth injection"),
        ("• Native Prototype Setter:", "Object.getOwnPropertyDescriptor injection for React/Vue compatibility")
    ]
    cur_y = client_y1 + 138
    for heading, desc in ext_items:
        draw.text((1255, cur_y), heading, fill=c_text_dark, font=font_bold)
        draw.text((1545, cur_y), desc, fill=c_text_muted, font=font_sub)
        cur_y += 32

    # Arrows Client -> Backend
    draw_arrow(640, client_y2, 640, 540, label="HTTPS REST: Vault Management & Bridge Sessions", color=(14, 165, 233), width=3, is_bidirectional=True)
    draw_arrow(1760, client_y2, 1760, 540, label="HTTPS REST: Metadata-Only Matching & Authorized Release", color=(2, 132, 199), width=3, is_bidirectional=True)

    # ==================== TIER 2: BACKEND API GATEWAY ====================
    gw_y1, gw_y2 = 540, 1040
    draw_card(80, gw_y1, 2320, gw_y2, (248, 250, 252), (100, 116, 139), r=16, border_w=2)
    draw.text((115, gw_y1 + 16), "BACKEND API GATEWAY & CRYPTOGRAPHIC ENGINE (Node.js & Express - Port 5000)", fill=(30, 41, 59), font=font_section)

    # Box 2A: Centralized Policy Engine (Top banner inside backend)
    draw_card(115, gw_y1 + 54, 2285, gw_y1 + 160, (241, 245, 249), (71, 85, 105), r=12, border_w=2)
    draw.text((140, gw_y1 + 68), "Centralized Authorization Policy Engine (Non-Bypassable Trust Boundary)", fill=(15, 23, 42), font=font_box_header)
    draw.text((140, gw_y1 + 98), "Enforces access rules server-side: Client-supplied categories are strictly untrusted. Single-use 30s tokens issued only upon full policy satisfaction.", fill=c_text_muted, font=font_sub)
    draw.text((140, gw_y1 + 126), "• Tier 1 (Shareable): Active Session  |  • Tier 2 (Restricted): ArcFace Biometrics  |  • Tier 3 (High Sensitivity): ArcFace + FIDO2 Hardware Passkey", fill=(30, 58, 138), font=font_bold)

    # 3 Sub-Service Cards Inside Gateway
    sub_y1, sub_y2 = gw_y1 + 180, gw_y2 - 25
    box_w = 690
    
    # Sub 1: CryptoService
    s1_x1 = 115
    s1_x2 = s1_x1 + box_w
    draw_card(s1_x1, sub_y1, s1_x2, sub_y2, (255, 255, 255), (99, 102, 241), r=12, border_w=2)
    draw.text((s1_x1 + 20, sub_y1 + 16), "CryptoService (Vault Security)", fill=(67, 56, 202), font=font_box_header)
    crypto_lines = [
        ("Single-Payload AES-256-GCM:", "{user, pass, notes} sealed with 1 fresh 96-bit IV"),
        ("HKDF-SHA256 Derivation:", "Per-user User Vault Key (UVK) isolation"),
        ("Argon2id Master Hashing:", "m=64 MiB, t=3, p=4; GPU/ASIC resistant"),
        ("Biometric Vector Encryption:", "512-d ArcFace float arrays encrypted at rest")
    ]
    cy = sub_y1 + 52
    for title, val in crypto_lines:
        draw.text((s1_x1 + 20, cy), title, fill=c_text_dark, font=font_bold)
        draw.text((s1_x1 + 20, cy + 22), val, fill=c_text_muted, font=font_tag)
        cy += 46

    # Sub 2: WebAuthn Service
    s2_x1 = s1_x2 + 35
    s2_x2 = s2_x1 + box_w
    draw_card(s2_x1, sub_y1, s2_x2, sub_y2, (255, 255, 255), (168, 85, 247), r=12, border_w=2)
    draw.text((s2_x1 + 20, sub_y1 + 16), "WebAuthn / FIDO2 Service", fill=(126, 34, 206), font=font_box_header)
    webauthn_lines = [
        ("@simplewebauthn Library:", "FIDO2 Level 3 compliant server engine"),
        ("Hardware-Bound Attestation:", "Windows Hello, Touch ID & Security Keys (TPM)"),
        ("Replay-Protected Counter:", "Monotonic authenticator signature counter check"),
        ("Cryptographic Origin Binding:", "Prevents AiTM phishing proxies & relay attacks")
    ]
    cy = sub_y1 + 52
    for title, val in webauthn_lines:
        draw.text((s2_x1 + 20, cy), title, fill=c_text_dark, font=font_bold)
        draw.text((s2_x1 + 20, cy + 22), val, fill=c_text_muted, font=font_tag)
        cy += 46

    # Sub 3: UrlService & Audit
    s3_x1 = s2_x2 + 35
    s3_x2 = s3_x1 + box_w
    draw_card(s3_x1, sub_y1, s3_x2, sub_y2, (255, 255, 255), (14, 165, 233), r=12, border_w=2)
    draw.text((s3_x1 + 20, sub_y1 + 16), "UrlService & Audit Engine", fill=(3, 105, 161), font=font_box_header)
    url_lines = [
        ("Strict Hostname Matching:", "Matches login subpaths; prevents cross-domain leaks"),
        ("Downgrade Prevention:", "Blocks releasing HTTPS creds over cleartext HTTP"),
        ("Single-Use Authorization:", "30-sec TTL tokens; destroyed immediately on use"),
        ("Append-Only Security Audit:", "Real client IP, user-agent & tamper event logging")
    ]
    cy = sub_y1 + 52
    for title, val in url_lines:
        draw.text((s3_x1 + 20, cy), title, fill=c_text_dark, font=font_bold)
        draw.text((s3_x1 + 20, cy + 22), val, fill=c_text_muted, font=font_tag)
        cy += 46

    # ==================== TIER 3: LOWER ENGINES ====================
    bot_y1, bot_y2 = 1130, 1620

    # Box 3A: Python Biometric Engine (Left)
    bio_x1, bio_x2 = 80, 1170
    draw_card(bio_x1, bot_y1, bio_x2, bot_y2, (254, 242, 242), (239, 68, 68), r=16, border_w=2)
    draw.text((bio_x1 + 35, bot_y1 + 18), "ISOLATED BIOMETRIC MICROSERVICE (Python FastAPI - Port 8000)", fill=(185, 28, 28), font=font_section)
    draw.text((bio_x1 + 35, bot_y1 + 52), "Localhost Trust Boundary (X-Internal-Service-Key) | Strict Single-Face Enforcement", fill=c_text_muted, font=font_tag)

    bio_cards = [
        ("RAM-Only In-Memory Decoding (Zero Disk Writes)", "Incoming base64 frames decoded directly via cv2.imdecode buffer; no image files ever saved to disk"),
        ("OpenCV 4.11 Cascade Classifier & Eye Alignment", "haarcascade_frontalface_default.xml + haarcascade_eye.xml leveling (rotational affine transform)"),
        ("DeepFace ArcFace Deep CNN Backbone (512-d)", "L2-normalized 512-dimensional embedding projection on hypersphere with additive angular margin"),
        ("Cosine Similarity Verification Engine", "Calculates D_cos(live, enrolled) <= 0.68 prototype decision threshold; rejects 0 faces or multiple faces")
    ]
    by = bot_y1 + 88
    for title, desc in bio_cards:
        draw_card(bio_x1 + 30, by, bio_x2 - 30, by + 82, (255, 255, 255), (252, 165, 165), r=10, border_w=1)
        draw.text((bio_x1 + 48, by + 12), title, fill=(153, 27, 27), font=font_bold)
        draw.text((bio_x1 + 48, by + 42), desc, fill=c_text_muted, font=font_sub)
        by += 96

    # Box 3B: PostgreSQL Database (Right)
    db_x1, db_x2 = 1230, 2320
    draw_card(db_x1, bot_y1, db_x2, bot_y2, (240, 253, 244), (34, 197, 94), r=16, border_w=2)
    draw.text((db_x1 + 35, bot_y1 + 18), "DATABASE PERSISTENCE TIER (PostgreSQL 18 - Port 5432 / WSL)", fill=(21, 128, 61), font=font_section)
    draw.text((db_x1 + 35, bot_y1 + 52), "Relational Integrity | Idempotent Migrations | Zero Pre-Seeded Dummy Records", fill=c_text_muted, font=font_tag)

    tables = [
        ("users", "id (UUID), email (UNIQUE), password_hash (Argon2id), security_setup_completed"),
        ("credentials", "id, user_id, website_name, target_hostname, category, encrypted_payload, iv, auth_tag"),
        ("face_templates", "id, user_id (UNIQUE), model_name ('ArcFace'), encrypted_embedding (BYTEA), iv, auth_tag"),
        ("webauthn_credentials", "id, user_id, credential_id (UNIQUE), public_key (COSE BYTEA), counter, transports"),
        ("release_authorizations", "id, user_id, credential_id, release_token_hash, expires_at (30s TTL), is_used"),
        ("security_events", "Append-only audit trail: timestamp, user_id, event_type, ip_address, user_agent, details")
    ]
    dy = bot_y1 + 86
    for tname, tfields in tables:
        draw_card(db_x1 + 30, dy, db_x2 - 30, dy + 62, (255, 255, 255), (187, 247, 208), r=8, border_w=1)
        draw.text((db_x1 + 48, dy + 18), tname, fill=(22, 101, 52), font=font_bold)
        draw.text((db_x1 + 260, dy + 19), tfields, fill=c_text_muted, font=font_tag)
        dy += 72

    # Arrows Gateway -> Biometric & DB
    draw_arrow(620, gw_y2, 620, bot_y1, label="Internal TCP / RAM Buffer (Embedding & Cosine Distance Request)", color=(239, 68, 68), width=3, is_bidirectional=True)
    draw_arrow(1780, gw_y2, 1780, bot_y1, label="PostgreSQL Pool Client: Encrypted Rows & 30s Release Tokens", color=(34, 197, 94), width=3, is_bidirectional=True)

    # Save outputs
    out_png = r"C:\24BBS0147\passmanage\system_architecture.png"
    img.save(out_png, "PNG", dpi=(300, 300))
    print(f"Flawless architecture diagram generated successfully: {out_png}")

if __name__ == "__main__":
    create_system_architecture()
