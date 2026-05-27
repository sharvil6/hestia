"""Word-key generation, encoding, hashing, lookup-id derivation.

Design notes:
- A key is 16 raw bytes of entropy (128 bits). Encoded for humans as a 12-word
  BIP39 mnemonic. The mnemonic and the bytes are equivalent — the wordlist's
  checksum gives us free client-side typo detection.
- The key id is the first 8 bytes of sha256(raw_key) formatted as 12 lowercase
  base32 chars in three dash-separated groups. It's a public lookup handle —
  knowing it does NOT let you derive the secret.
- We hash the raw bytes at rest with Argon2id. Login: client sends words →
  server derives bytes + key_id → look up row by key_id → Argon2 verify.
"""

import base64
import hashlib
import hmac
import secrets
from typing import List, Tuple

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from mnemonic import Mnemonic


_MNEMONIC = Mnemonic("english")
_HASHER = PasswordHasher()

WORD_COUNT = 12
KEY_BYTES = 16  # 128 bits → exactly 12 BIP39 words


def generate_key() -> bytes:
    """Generate a fresh 16-byte key."""
    return secrets.token_bytes(KEY_BYTES)


def key_to_words(raw: bytes) -> List[str]:
    """Encode raw bytes as a 12-word BIP39 mnemonic."""
    if len(raw) != KEY_BYTES:
        raise ValueError(f"key must be {KEY_BYTES} bytes, got {len(raw)}")
    return _MNEMONIC.to_mnemonic(raw).split()


def words_to_key(words: List[str] | str) -> bytes:
    """Decode a 12-word BIP39 mnemonic to raw bytes. Raises ValueError on bad checksum."""
    if isinstance(words, list):
        phrase = " ".join(w.strip().lower() for w in words)
    else:
        phrase = " ".join(words.strip().lower().split())
    if not _MNEMONIC.check(phrase):
        raise ValueError("invalid BIP39 phrase (bad checksum or unknown word)")
    return _MNEMONIC.to_entropy(phrase)


def derive_key_id(raw: bytes) -> str:
    """Public lookup handle: sha256(raw)[:8] → base32 → xxxx-xxxx-xxxx."""
    digest = hashlib.sha256(raw).digest()[:8]
    b32 = base64.b32encode(digest).decode("ascii").rstrip("=").lower()
    # 8 bytes → 13 base32 chars; group as 4-4-5 with dashes for readability.
    return f"{b32[0:4]}-{b32[4:8]}-{b32[8:13]}"


def hash_key(raw: bytes) -> str:
    """Argon2id hash of the raw bytes for at-rest storage."""
    # PasswordHasher hashes strings; encode bytes to a urlsafe string first so the
    # internal length and entropy are preserved.
    return _HASHER.hash(base64.urlsafe_b64encode(raw).decode("ascii"))


def verify_key(raw: bytes, hashed: str) -> bool:
    try:
        _HASHER.verify(hashed, base64.urlsafe_b64encode(raw).decode("ascii"))
        return True
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def qr_payload(words: List[str]) -> str:
    """Wire form for the QR code. Custom URL scheme so the OS camera could deep-link."""
    return "hestia://auth?w=" + "+".join(words)


def parse_qr_payload(payload: str) -> List[str]:
    """Inverse of qr_payload. Raises ValueError on bad format."""
    prefix = "hestia://auth?w="
    if not payload.startswith(prefix):
        raise ValueError("not a Hestia auth QR payload")
    words = payload[len(prefix):].split("+")
    if len(words) != WORD_COUNT:
        raise ValueError(f"expected {WORD_COUNT} words, got {len(words)}")
    return words


# ----- Session tokens (used by deps.py) ----------------------------------------
# Same shape as keys but separate purpose: per-browser opaque tokens.

SESSION_PREFIX_BYTES = 6  # 8 base64 chars
SESSION_SECRET_BYTES = 26  # 35 base64 chars; combined ~43 chars


def generate_session_token() -> Tuple[str, str, str]:
    """Returns (raw_token, prefix, hash). Cookie stores raw_token; DB stores prefix + hash."""
    raw = secrets.token_bytes(SESSION_PREFIX_BYTES + SESSION_SECRET_BYTES)
    raw_b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
    prefix = raw_b64[:8]
    return raw_b64, prefix, _HASHER.hash(raw_b64)


def verify_session_token(raw_token: str, hashed: str) -> bool:
    try:
        _HASHER.verify(hashed, raw_token)
        return True
    except VerifyMismatchError:
        return False
    except Exception:
        return False


def session_prefix(raw_token: str) -> str:
    return raw_token[:8]


# ----- Invite codes ------------------------------------------------------------
# Short, unambiguous alphabet (no 0/O/1/I/L). 10 chars → 10**~7.6 entropy.

_INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
INVITE_CODE_LEN = 10


def generate_invite_code() -> str:
    return "".join(secrets.choice(_INVITE_ALPHABET) for _ in range(INVITE_CODE_LEN))


def constant_time_eq(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)
