"""Browser-bound, expiring, single-use LMS sign-in for QA and coaches."""
import hashlib
import secrets
from datetime import timedelta
from urllib.parse import urlencode, urlsplit

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .models import LMSLoginAttempt, Profile
from .views import _auth_payload_for_user

SALT = "kbc-inclusion-sso-v1"


def configured():
    return settings.LMS_SSO_ENABLED and len(settings.LMS_SSO_SECRET) >= 32 and settings.LMS_BASE_URL


def provision_user(claims):
    """Link once by unique email; later logins use the stable LMS account ID."""
    profile = Profile.objects.select_for_update().filter(lms_account_id=claims["account_id"]).first()
    email = claims["email"].strip().lower()
    if profile is None:
        users = list(User.objects.select_for_update().filter(email__iexact=email)[:2])
        if len(users) > 1:
            raise ValueError("Multiple dashboard accounts use this email. Contact your administrator.")
        if users:
            user = users[0]
            profile = Profile.objects.select_for_update().get(user=user)
            if profile.lms_account_id is not None:
                raise ValueError("This dashboard account is linked to another LMS identity.")
        else:
            user = User.objects.create_user(username=f"lms_{claims['account_id']}", email=email, password=None)
            profile, _ = Profile.objects.get_or_create(user=user, defaults={"role": claims["role"]})
    user = profile.user
    if not user.is_active:
        raise ValueError("This dashboard account is disabled.")
    user.email = email
    user.save(update_fields=["email"])
    profile.lms_account_id = claims["account_id"]
    profile.role = claims["role"]
    # Preserve legacy coach IDs; Inclusion caseloads resolve by verified email.
    profile.save(update_fields=["lms_account_id", "role"])
    return user


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def config(request):
    response = Response({"enabled": settings.LMS_SSO_ENABLED})
    response["Cache-Control"] = "no-store"
    return response


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def start(request):
    if not configured():
        return Response({"detail": "LMS sign-in is not configured."}, status=503)
    try:
        destination = urlsplit(settings.LMS_BASE_URL)
        current = urlsplit(request.build_absolute_uri("/"))
        valid = (destination.scheme in ("http", "https") and destination.hostname
                 and not destination.username and not destination.password
                 and not destination.query and not destination.fragment
                 and destination.path in ("", "/")
                 and destination.hostname != "admin.kentbusinesscollege.net"
                 and destination.netloc.lower() != current.netloc.lower())
    except ValueError:
        valid = False
    if not valid:
        return Response({"detail": "Invalid LMS_BASE_URL. Set it to the LMS origin, not the dashboard login URL."}, status=503)
    verifier = secrets.token_urlsafe(32)
    state = hashlib.sha256(verifier.encode()).hexdigest()
    LMSLoginAttempt.objects.filter(expires_at__lte=timezone.now()).delete()
    LMSLoginAttempt.objects.create(state=state, expires_at=timezone.now() + timedelta(minutes=10))
    response = Response({"verifier": verifier, "url": settings.LMS_BASE_URL.rstrip("/") + "/login?" + urlencode({"inclusion_state": state})})
    response["Cache-Control"] = "no-store"
    return response


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def complete(request):
    if not configured():
        return Response({"detail": "LMS sign-in is not configured."}, status=503)
    assertion, verifier = request.data.get("assertion"), request.data.get("verifier")
    if not isinstance(assertion, str) or not isinstance(verifier, str) or not 40 <= len(verifier) <= 128:
        return Response({"detail": "Invalid login response."}, status=400)
    try:
        claims = signing.loads(assertion, key=settings.LMS_SSO_SECRET, salt=SALT, max_age=60, fallback_keys=[])
    except signing.BadSignature:
        return Response({"detail": "LMS sign-in expired or is invalid. Please try again."}, status=401)
    state = hashlib.sha256(verifier.encode()).hexdigest()
    if (not isinstance(claims, dict) or claims.get("aud") != "inclusion-dashboard"
            or claims.get("state") != state or type(claims.get("account_id")) is not int
            or claims["account_id"] <= 0 or claims.get("role") not in ("qa", "coach")
            or not isinstance(claims.get("email"), str) or not claims["email"].strip()):
        return Response({"detail": "Invalid login response."}, status=401)
    try:
        with transaction.atomic():
            consumed, _ = LMSLoginAttempt.objects.filter(state=state, expires_at__gt=timezone.now()).delete()
            if not consumed:
                return Response({"detail": "Login expired or already used. Please try again."}, status=401)
            user = provision_user(claims)
            payload = _auth_payload_for_user(user)
    except (ValueError, IntegrityError, Profile.DoesNotExist):
        return Response({"detail": "Unable to link your dashboard account. Contact your administrator."}, status=403)
    response = Response(payload)
    response["Cache-Control"] = "no-store"
    return response
