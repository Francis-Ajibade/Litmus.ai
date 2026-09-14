"""Token verification — the boundary between "a request arrived" and "we know who
sent it".

Verification is ASYMMETRIC (ES256): Supabase signs with a private key it never
shares, and we verify with the matching public key fetched from its JWKS
endpoint. Nothing here is a secret, which is why no key lives in .env — the
public half is public by design.
"""

import os

from fastapi import HTTPException
import jwt
from jwt import PyJWKClient

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
if not SUPABASE_URL:
    raise RuntimeError("SUPABASE_URL is not set — token verification cannot run.")

JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
ISSUER = f"{SUPABASE_URL}/auth/v1"

jwk_client = PyJWKClient(JWKS_URL)

def verify_and_decode_token(token: str) -> dict:
    """Return the token's claims, or raise. Never returns a falsy value.

    A verification function that can return None is one a caller will eventually
    forget to check, and the failure mode of that mistake is letting someone in.
    """
    try:
        signing_key = jwk_client.get_signing_key_from_jwt(token)

        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["ES256"],          # ECC P-256. RS256 is RSA — a different family.
            audience="authenticated",      # Supabase stamps this on every token; omitting
            issuer=ISSUER,
        )

    except jwt.exceptions.PyJWKClientError as e:
        print(f"[auth] could not fetch signing key: {e}")
        raise HTTPException(status_code=503, detail="Could not verify sign-in right now.")

    except jwt.exceptions.InvalidTokenError as e:
        print(f"[auth] token rejected: {e}")
        raise HTTPException(status_code=401, detail="Not signed in.")
