"""
auth.py  (admin-dashboard backend)

The single admin-auth check for this backend's routes (reports, calendar and
schedule overrides, exclusions). Replaces three copies that had drifted; one of
them preferred VITE_DBS_ADMIN_TOKEN, which belongs to damaged-books-service.

Token: VITE_ADMIN_TOKEN only, sent as `Authorization: Bearer <token>`.
`?token=` was accepted only for the signed-copy campaign screens; it was removed
when the campaign was retired (tokens in URLs end up in logs and history).
"""

import os

from fastapi import HTTPException, Request


def validate_admin_token(request: Request) -> None:
    header = request.headers.get("Authorization", "")
    provided = header.split(" ", 1)[1].strip() if header.lower().startswith("bearer ") else ""
    expected = os.getenv("VITE_ADMIN_TOKEN")
    if not expected or provided != expected:
        raise HTTPException(status_code=403, detail="Unauthorized")
