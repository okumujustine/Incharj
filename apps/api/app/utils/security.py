from __future__ import annotations

import hashlib
import hmac
import json
import os
import struct
import time
from typing import Any

import bcrypt as _bcrypt
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding
from jose import JWTError, jwt

from app.core.config import settings


def _get_fernet_key_bytes() -> bytes:
    key = settings.encryption_key
    try:
        import base64
        decoded = base64.urlsafe_b64decode(key + "==")
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass
    return hashlib.sha256(key.encode("utf-8")).digest()


def _get_key_material() -> tuple[bytes, bytes]:
    key_bytes = _get_fernet_key_bytes()
    signing_key = key_bytes[:16]
    encryption_key = key_bytes[16:32]
    return signing_key, encryption_key


def encrypt_credentials(creds: dict[str, Any]) -> str:
    import base64

    signing_key, encryption_key = _get_key_material()
    iv = os.urandom(16)
    plaintext = json.dumps(creds).encode("utf-8")

    padder = crypto_padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()

    cipher = Cipher(algorithms.AES(encryption_key), modes.CBC(iv))
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()

    ts = int(time.time())
    timestamp = struct.pack(">Q", ts)
    payload = bytes([0x80]) + timestamp + iv + ciphertext

    signature = hmac.new(signing_key, payload, hashlib.sha256).digest()
    token = payload + signature
    return base64.urlsafe_b64encode(token).rstrip(b"=").decode("ascii")


def decrypt_credentials(encrypted: str) -> dict[str, Any]:
    import base64

    signing_key, encryption_key = _get_key_material()

    padding = (4 - len(encrypted) % 4) % 4
    token = base64.urlsafe_b64decode(encrypted + "=" * padding)

    payload = token[:-32]
    signature = token[-32:]
    expected = hmac.new(signing_key, payload, hashlib.sha256).digest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError("Invalid credential signature")

    iv = payload[9:25]
    ciphertext = payload[25:]

    cipher = Cipher(algorithms.AES(encryption_key), modes.CBC(iv))
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()

    unpadder = crypto_padding.PKCS7(128).unpadder()
    decrypted = unpadder.update(padded) + unpadder.finalize()
    return json.loads(decrypted.decode("utf-8"))


def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode("utf-8"), _bcrypt.gensalt(rounds=10)).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    return _bcrypt.checkpw(password.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict[str, str]) -> str:
    now = int(time.time())
    payload = {
        **data,
        "type": "access",
        "iat": now,
        "exp": now + settings.access_token_expire_minutes * 60,
    }
    return jwt.encode(payload, settings.app_secret, algorithm="HS256")


def create_refresh_token() -> str:
    return os.urandom(48).hex()


def decode_access_token(token: str) -> dict[str, Any] | None:
    try:
        payload = jwt.decode(token, settings.app_secret, algorithms=["HS256"])
        if payload.get("type") != "access":
            return None
        return payload
    except JWTError:
        return None


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()
