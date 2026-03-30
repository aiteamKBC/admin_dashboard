import json
import os
import re
import time
from urllib.parse import urlencode

import jwt
import requests
from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.cache import cache
from django.core import signing
from django.http import HttpResponse
from django.shortcuts import redirect
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken


MS_STATE_SALT = "ms_oauth_state"
MS_STATE_MAX_AGE_SECONDS = 10 * 60
MS_RESULT_CACHE_PREFIX = "ms_oauth_result:"
MS_RESULT_MAX_AGE_SECONDS = 5 * 60


def _split_csv(raw: str) -> list[str]:
    return [item.strip() for item in raw.split(",") if item.strip()]


def _allowed_frontend_origins() -> list[str]:
    origins: list[str] = []
    origins.extend(_split_csv(os.getenv("MS_ALLOWED_ORIGINS", "")))
    origins.extend(_split_csv(os.getenv("CORS_ALLOWED_ORIGINS", "")))

    if settings.DEBUG and "http://localhost:5173" not in origins:
        origins.append("http://localhost:5173")

    # Preserve order but deduplicate.
    unique: list[str] = []
    for origin in origins:
        if origin not in unique:
            unique.append(origin)
    return unique


def _default_frontend_origin() -> str:
    origins = _allowed_frontend_origins()
    if origins:
        return origins[0]
    return "http://localhost:5173"


def _is_allowed_origin(origin: str) -> bool:
    return bool(origin) and origin in _allowed_frontend_origins()


def _is_valid_request_id(request_id: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-z0-9_-]{12,128}", request_id or ""))


def _ms_result_cache_key(request_id: str) -> str:
    return f"{MS_RESULT_CACHE_PREFIX}{request_id}"


def _store_ms_result(
    request_id: str,
    *,
    payload: dict | None = None,
    error: str | None = None,
    pending: bool = False,
) -> None:
    if not _is_valid_request_id(request_id):
        return

    if pending:
        value = {"status": "pending"}
    elif error is not None:
        value = {"status": "error", "detail": error}
    elif payload is not None:
        value = {"status": "success", "payload": payload}
    else:
        return

    cache.set(_ms_result_cache_key(request_id), value, timeout=MS_RESULT_MAX_AGE_SECONDS)


def _consume_ms_result(request_id: str) -> dict | None:
    if not _is_valid_request_id(request_id):
        return None

    key = _ms_result_cache_key(request_id)
    value = cache.get(key)
    if not value:
        return None

    if value.get("status") != "pending":
        cache.delete(key)

    return value


def _ms_oauth_settings() -> dict[str, str]:
    return {
        "client_id": os.getenv("MS_CLIENT_ID", "").strip(),
        "client_secret": os.getenv("MS_CLIENT_SECRET", "").strip(),
        "tenant_id": os.getenv("MS_TENANT_ID", "common").strip() or "common",
        "prompt": os.getenv("MS_AUTH_PROMPT", "select_account").strip() or "select_account",
        "redirect_uri": os.getenv(
            "MS_REDIRECT_URI",
            "http://localhost:8000/auth/callback",
        ).strip()
        or "http://localhost:8000/auth/callback",
    }


def _auth_payload_for_user(user: User) -> dict[str, str | None]:
    profile = getattr(user, "profile", None)
    if not profile:
        raise ValueError("User profile not found (missing role)")

    role = getattr(profile, "role", None)
    coach_id = getattr(profile, "coach_id", None)

    if role not in ("coach", "qa"):
        raise ValueError("User has no valid role")

    refresh = RefreshToken.for_user(user)
    return {
        "access": str(refresh.access_token),
        "refresh": str(refresh),
        "role": role,
        "coach_id": coach_id,
        "username": user.username,
    }


def _oauth_popup_html(frontend_origin: str, *, payload: dict | None = None, error: str | None = None) -> str:
    message = {
        "type": "microsoft-auth-result",
        "ok": error is None,
    }
    if payload is not None:
        message["payload"] = payload
    if error:
        message["error"] = error

    target_origin_json = json.dumps(frontend_origin)
    message_json = json.dumps(message)
    fallback_text_json = json.dumps(
        "Sign-in complete. You can close this window."
        if error is None
        else f"Sign-in failed: {error}. You can close this window."
    )

    return f"""<!doctype html>
<html>
  <head>
    <meta charset=\"utf-8\" />
    <title>Microsoft Sign-in</title>
  </head>
  <body>
    <script>
      (function () {{
        var targetOrigin = {target_origin_json};
        var message = {message_json};
        var fallbackText = {fallback_text_json};

        try {{
          if (window.opener && targetOrigin) {{
            window.opener.postMessage(message, targetOrigin);
          }}
        }} catch (e) {{
          // Ignore and show fallback text.
        }}

        setTimeout(function () {{
                    window.close();

          document.body.innerHTML = "";
          var p = document.createElement("p");
          p.style.fontFamily = "Arial, sans-serif";
          p.style.padding = "16px";
          p.textContent = fallbackText;
          document.body.appendChild(p);
                }}, 300);
      }})();
    </script>
  </body>
</html>
"""


def _popup_html_response(
        frontend_origin: str,
        *,
        payload: dict | None = None,
        error: str | None = None,
        status_code: int = status.HTTP_200_OK,
) -> HttpResponse:
        response = HttpResponse(
                _oauth_popup_html(frontend_origin, payload=payload, error=error),
                status=status_code,
                content_type="text/html",
        )
        # Keep opener available so popup can postMessage back to frontend.
        response["Cross-Origin-Opener-Policy"] = "unsafe-none"
        return response


class LoginView(APIView):
    authentication_classes = []
    permission_classes = []  # allow without auth

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        # Try to authenticate with username first
        user = authenticate(username=username, password=password)
        
        # If authentication fails, try to find user by email and authenticate
        if not user and username:
            try:
                user_obj = User.objects.get(email=username)
                user = authenticate(username=user_obj.username, password=password)
            except User.DoesNotExist:
                pass
        
        if not user:
            return Response(
                {"detail": "Invalid credentials"},
                status=status.HTTP_401_UNAUTHORIZED
            )

        try:
            payload = _auth_payload_for_user(user)
        except ValueError as exc:
            return Response(
                {"detail": str(exc)},
                status=status.HTTP_403_FORBIDDEN
            )

        return Response(payload)


class MicrosoftLoginView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        request_id = request.query_params.get("request_id", "").strip()
        if request_id and not _is_valid_request_id(request_id):
            return _popup_html_response(
                _default_frontend_origin(),
                error="Invalid Microsoft login request id.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        frontend_origin = request.query_params.get("origin", "").strip() or _default_frontend_origin()
        if not _is_allowed_origin(frontend_origin):
            return _popup_html_response(
                _default_frontend_origin(),
                error="Origin is not allowed for Microsoft login.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        cfg = _ms_oauth_settings()
        if not cfg["client_id"]:
            return _popup_html_response(
                frontend_origin,
                error="Microsoft login is not configured (MS_CLIENT_ID is missing).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )
        if not cfg["client_secret"]:
            return _popup_html_response(
                frontend_origin,
                error="Microsoft login is not configured (MS_CLIENT_SECRET is missing).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if request_id:
            _store_ms_result(request_id, pending=True)

        state_payload = {
            "origin": frontend_origin,
            "ts": int(time.time()),
            "request_id": request_id,
        }
        state = signing.dumps(state_payload, salt=MS_STATE_SALT)

        auth_params = {
            "client_id": cfg["client_id"],
            "response_type": "code",
            "redirect_uri": cfg["redirect_uri"],
            "response_mode": "query",
            "scope": "openid profile email offline_access",
            "prompt": cfg["prompt"],
            "state": state,
        }
        auth_url = (
            f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/authorize?"
            f"{urlencode(auth_params)}"
        )
        return redirect(auth_url)


class MicrosoftCallbackView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        default_origin = _default_frontend_origin()

        oauth_error = request.query_params.get("error")
        if oauth_error:
            description = request.query_params.get("error_description", "Microsoft authentication failed.")
            return _popup_html_response(
                default_origin,
                error=description,
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        state = request.query_params.get("state", "")
        code = request.query_params.get("code", "")
        if not state or not code:
            return _popup_html_response(
                default_origin,
                error="Missing login state or authorization code.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        try:
            state_payload = signing.loads(
                state,
                salt=MS_STATE_SALT,
                max_age=MS_STATE_MAX_AGE_SECONDS,
            )
        except signing.BadSignature:
            return _popup_html_response(
                default_origin,
                error="Login state is invalid or expired. Please try again.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        request_id = (state_payload.get("request_id") or "").strip()
        if request_id and not _is_valid_request_id(request_id):
            request_id = ""

        frontend_origin = (state_payload.get("origin") or "").strip()
        if not _is_allowed_origin(frontend_origin):
            if request_id:
                _store_ms_result(request_id, error="Login origin is not allowed.")
            return _popup_html_response(
                default_origin,
                error="Login origin is not allowed.",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        cfg = _ms_oauth_settings()
        if not cfg["client_id"] or not cfg["client_secret"]:
            if request_id:
                _store_ms_result(
                    request_id,
                    error="Microsoft login is not configured on server (MS_CLIENT_ID/MS_CLIENT_SECRET).",
                )
            return _popup_html_response(
                frontend_origin,
                error="Microsoft login is not configured on server (MS_CLIENT_ID/MS_CLIENT_SECRET).",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        token_url = f"https://login.microsoftonline.com/{cfg['tenant_id']}/oauth2/v2.0/token"
        token_payload = {
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": cfg["redirect_uri"],
            "scope": "openid profile email offline_access",
        }

        try:
            token_resp = requests.post(token_url, data=token_payload, timeout=20)
            token_resp.raise_for_status()
            token_data = token_resp.json()
        except requests.RequestException:
            if request_id:
                _store_ms_result(request_id, error="Could not complete Microsoft token exchange.")
            return _popup_html_response(
                frontend_origin,
                error="Could not complete Microsoft token exchange.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        id_token = token_data.get("id_token", "")
        if not id_token:
            if request_id:
                _store_ms_result(request_id, error="Microsoft response did not include an ID token.")
            return _popup_html_response(
                frontend_origin,
                error="Microsoft response did not include an ID token.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        try:
            claims = jwt.decode(
                id_token,
                options={
                    "verify_signature": False,
                    "verify_aud": False,
                },
            )
        except jwt.PyJWTError:
            if request_id:
                _store_ms_result(request_id, error="Could not decode Microsoft ID token.")
            return _popup_html_response(
                frontend_origin,
                error="Could not decode Microsoft ID token.",
                status_code=status.HTTP_502_BAD_GATEWAY,
            )

        email = (
            (claims.get("preferred_username") or "").strip()
            or (claims.get("email") or "").strip()
            or (claims.get("upn") or "").strip()
        )
        if not email:
            if request_id:
                _store_ms_result(request_id, error="No email was returned by Microsoft.")
            return _popup_html_response(
                frontend_origin,
                error="No email was returned by Microsoft.",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        user = User.objects.filter(email__iexact=email).first()
        if not user:
            if request_id:
                _store_ms_result(
                    request_id,
                    error="No dashboard account is linked to this Microsoft email.",
                )
            return _popup_html_response(
                frontend_origin,
                error="No dashboard account is linked to this Microsoft email.",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        try:
            payload = _auth_payload_for_user(user)
        except ValueError as exc:
            if request_id:
                _store_ms_result(request_id, error=str(exc))
            return _popup_html_response(
                frontend_origin,
                error=str(exc),
                status_code=status.HTTP_403_FORBIDDEN,
            )

        if request_id:
            _store_ms_result(request_id, payload=payload)

        return _popup_html_response(
            frontend_origin,
            payload=payload,
            status_code=status.HTTP_200_OK,
        )


class MicrosoftResultView(APIView):
    authentication_classes = []
    permission_classes = []

    def get(self, request):
        request_id = request.query_params.get("request_id", "").strip()
        if not _is_valid_request_id(request_id):
            return Response(
                {"detail": "Invalid Microsoft login request id."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        result = _consume_ms_result(request_id)
        if not result:
            return Response(
                {"detail": "No Microsoft login result found yet."},
                status=status.HTTP_404_NOT_FOUND,
            )

        result_status = result.get("status")
        if result_status == "pending":
            return Response(
                {"detail": "Pending"},
                status=status.HTTP_202_ACCEPTED,
            )

        if result_status == "error":
            return Response(
                {"detail": result.get("detail") or "Microsoft login failed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = result.get("payload")
        if not isinstance(payload, dict):
            return Response(
                {"detail": "Invalid Microsoft login result payload."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(payload, status=status.HTTP_200_OK)
