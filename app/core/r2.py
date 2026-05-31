import hashlib
import hmac
from datetime import datetime, timezone
from urllib.parse import quote

from app.core.config import settings


R2_REGION = "auto"
R2_SERVICE = "s3"


def _sign(key: bytes, message: str) -> bytes:
    return hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()


def _signature_key(secret_key: str, date_stamp: str) -> bytes:
    date_key = _sign(("AWS4" + secret_key).encode("utf-8"), date_stamp)
    region_key = _sign(date_key, R2_REGION)
    service_key = _sign(region_key, R2_SERVICE)
    return _sign(service_key, "aws4_request")


def _canonical_uri(bucket: str, object_key: str) -> str:
    parts = [bucket, *[part for part in object_key.split("/") if part]]
    return "/" + "/".join(quote(part, safe="") for part in parts)


def create_presigned_put_url(
    *,
    object_key: str,
    expires_seconds: int | None = None,
) -> str:
    if not settings.R2_ACCOUNT_ID:
        raise RuntimeError("R2_ACCOUNT_ID is not configured")
    if not settings.R2_ACCESS_KEY_ID:
        raise RuntimeError("R2_ACCESS_KEY_ID is not configured")
    if not settings.R2_SECRET_ACCESS_KEY:
        raise RuntimeError("R2_SECRET_ACCESS_KEY is not configured")
    if not settings.R2_BUCKET:
        raise RuntimeError("R2_BUCKET is not configured")

    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
    expires = expires_seconds or settings.R2_PRESIGN_EXPIRES_SECONDS
    host = f"{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    credential_scope = f"{date_stamp}/{R2_REGION}/{R2_SERVICE}/aws4_request"
    credential = f"{settings.R2_ACCESS_KEY_ID}/{credential_scope}"

    query_params = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
        "X-Amz-Credential": credential,
        "X-Amz-Date": amz_date,
        "X-Amz-Expires": str(expires),
        "X-Amz-SignedHeaders": "host",
    }
    canonical_query = "&".join(
        f"{quote(key, safe='')}={quote(value, safe='')}"
        for key, value in sorted(query_params.items())
    )
    canonical_headers = f"host:{host}\n"
    signed_headers = "host"
    payload_hash = "UNSIGNED-PAYLOAD"
    canonical_request = "\n".join(
        [
            "PUT",
            _canonical_uri(settings.R2_BUCKET, object_key),
            canonical_query,
            canonical_headers,
            signed_headers,
            payload_hash,
        ]
    )
    string_to_sign = "\n".join(
        [
            "AWS4-HMAC-SHA256",
            amz_date,
            credential_scope,
            hashlib.sha256(canonical_request.encode("utf-8")).hexdigest(),
        ]
    )
    signing_key = _signature_key(settings.R2_SECRET_ACCESS_KEY, date_stamp)
    signature = hmac.new(
        signing_key,
        string_to_sign.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return (
        f"https://{host}{_canonical_uri(settings.R2_BUCKET, object_key)}"
        f"?{canonical_query}&X-Amz-Signature={signature}"
    )
