"""Request-scoped dependencies.

This layer's only job is to get the token out of the request and hand it to the
verifier. All the cryptography, the JWKS cache and the error mapping live in
main/auth.py — if a try/except shows up here, something is in the wrong place.
"""

from dataclasses import dataclass
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from main.auth import verify_and_decode_token

security_scheme = HTTPBearer(auto_error=False)

@dataclass(frozen=True)
class CurrentUser:
    user_id : str
    email : str | None
    is_anonymous : bool

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
) -> CurrentUser:
    """The signed-in user's token claims, or 401/503.

    Note the parameter: the TYPE is `HTTPAuthorizationCredentials | None` and the
    DEFAULT is `Depends(...)`. Writing `Depends(security_scheme) | None` puts the
    union on the value instead, which Python evaluates at import time as a
    bitwise or between a Depends object and None — a TypeError before the app can
    even start.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not signed in.")

    payload =  verify_and_decode_token(credentials.credentials)
    return CurrentUser(
        user_id=payload["sub"],
        email=payload.get("email"),
        is_anonymous=payload.get("is_anonymous", False),
    )