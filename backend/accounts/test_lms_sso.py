import hashlib
from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth.models import User
from django.core import signing
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIRequestFactory

from . import lms_sso
from .models import LMSLoginAttempt, Profile
from .views import LoginView, MicrosoftLoginView, MicrosoftCallbackView

urlpatterns = []


class LMSLoginTests(TestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
        self.verifier = "v" * 43
        self.state = hashlib.sha256(self.verifier.encode()).hexdigest()
        LMSLoginAttempt.objects.create(state=self.state, expires_at=timezone.now() + timedelta(minutes=10))

    def complete(self, **changes):
        claims = {"aud": "inclusion-dashboard", "state": self.state, "account_id": 12,
                  "email": "coach@example.test", "role": "coach", **changes}
        assertion = signing.dumps(claims, key=settings.LMS_SSO_SECRET, salt=lms_sso.SALT)
        return lms_sso.complete(self.factory.post("/", {"assertion": assertion, "verifier": self.verifier}, format="json"))

    def test_coach_created_and_assertion_cannot_be_replayed(self):
        result = self.complete()
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["role"], "coach")
        self.assertFalse(User.objects.get(email="coach@example.test").has_usable_password())
        self.assertEqual(self.complete().status_code, 401)

    def test_existing_account_preserves_id_and_coach_mapping(self):
        user = User.objects.create_user(username="existing", email="COACH@example.test")
        Profile.objects.filter(user=user).update(coach_id="legacy-45")
        result = self.complete(role="qa")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["coach_id"], "legacy-45")
        self.assertEqual(result.data["username"], "existing")
        self.assertEqual(result.data["role"], "qa")
        self.assertEqual(User.objects.count(), 1)

    def test_denies_other_roles_audiences_and_browser_states(self):
        for changes in [{"role": "learner"}, {"role": "admin"}, {"aud": "safeguarding"}, {"state": "x" * 64}, {"account_id": True}]:
            self.assertEqual(self.complete(**changes).status_code, 401)
        self.assertEqual(User.objects.count(), 0)

    def test_denies_expired_attempt(self):
        LMSLoginAttempt.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.complete().status_code, 401)

    def test_denies_expired_signature(self):
        with patch("django.core.signing.time.time", return_value=1):
            assertion = signing.dumps({}, key=settings.LMS_SSO_SECRET, salt=lms_sso.SALT)
        result = lms_sso.complete(self.factory.post("/", {"assertion": assertion, "verifier": self.verifier}))
        self.assertEqual(result.status_code, 401)

    def test_denies_disabled_or_ambiguous_accounts(self):
        User.objects.create_user(username="disabled", email="coach@example.test", is_active=False)
        self.assertEqual(self.complete().status_code, 403)
        User.objects.create_user(username="duplicate", email="coach@example.test")
        self.assertEqual(self.complete().status_code, 403)

    def test_stable_identity_tracks_email_and_role_changes(self):
        self.assertEqual(self.complete(role="qa").status_code, 200)
        LMSLoginAttempt.objects.create(state=self.state, expires_at=timezone.now() + timedelta(minutes=10))
        result = self.complete(email="changed@example.test")
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data["role"], "coach")
        self.assertEqual(User.objects.count(), 1)

    def test_start_uses_configured_lms_and_browser_verifier(self):
        result = lms_sso.start(self.factory.post("/", {"url": "https://attacker.test"}))
        self.assertEqual(result.status_code, 200)
        state = hashlib.sha256(result.data["verifier"].encode()).hexdigest()
        self.assertEqual(result.data["url"], f"https://lms.example.test/login?inclusion_state={state}")

    def test_old_login_entrypoints_are_disabled(self):
        for view, method in [(LoginView, "post"), (MicrosoftLoginView, "get"), (MicrosoftCallbackView, "get")]:
            self.assertEqual(view.as_view()(getattr(self.factory, method)("/")).status_code, 403)

    @override_settings(LMS_SSO_SECRET="")
    def test_missing_configuration_fails_closed(self):
        self.assertEqual(lms_sso.start(self.factory.post("/")).status_code, 503)
