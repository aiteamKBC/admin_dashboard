from unittest.mock import patch

from django.contrib.auth.models import User
from django.test import TestCase
from rest_framework.test import APIClient

from .models import Profile


class AddUserTests(TestCase):
    def setUp(self):
        self.qa = User.objects.create_user("qa", "qa@example.com")
        self.qa.profile.role = "qa"
        self.qa.profile.save()
        self.client = APIClient()
        self.client.force_authenticate(self.qa)
        self.payload = {"username": "NewCoach", "email": "New.Coach@example.com", "role": "coach"}

    def test_create_coach_with_microsoft_login_and_no_admin_privileges(self):
        response = self.client.post("/api/accounts/users/", {
            **self.payload, "is_superuser": True, "is_staff": True,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username="NewCoach")
        self.assertEqual(user.email, "new.coach@example.com")
        self.assertEqual(user.profile.role, "coach")
        self.assertTrue(user.is_active)
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(Profile.objects.filter(user=user).count(), 1)

    def test_create_qa(self):
        response = self.client.post("/api/accounts/users/", {**self.payload, "role": "qa"}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(User.objects.get(username="NewCoach").profile.role, "qa")

    def test_duplicates_are_rejected_case_insensitively(self):
        User.objects.create_user("Existing", "Existing@example.com")
        for field, value in [("username", "existing"), ("email", "EXISTING@example.com")]:
            with self.subTest(field=field):
                response = self.client.post("/api/accounts/users/", {**self.payload, field: value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(User.objects.count(), 2)

    def test_invalid_inputs_do_not_create_accounts(self):
        for field, value in [("username", "bad username"), ("email", "not-email"), ("role", "admin"), ("email", "")]:
            with self.subTest(field=field, value=value):
                response = self.client.post("/api/accounts/users/", {**self.payload, field: value}, format="json")
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
        self.assertEqual(User.objects.count(), 1)

    def test_coach_and_anonymous_cannot_create_users(self):
        coach = User.objects.create_user("coach", "coach@example.com")
        self.client.force_authenticate(coach)
        self.assertEqual(self.client.post("/api/accounts/users/", self.payload).status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post("/api/accounts/users/", self.payload).status_code, 401)
        self.assertEqual(User.objects.count(), 2)

    def test_profile_failure_rolls_back_new_account(self):
        with patch("accounts.user_management.Profile.objects.update_or_create", side_effect=RuntimeError("Failed")):
            with self.assertRaises(RuntimeError):
                self.client.post("/api/accounts/users/", self.payload, format="json")
        self.assertFalse(User.objects.filter(username="NewCoach").exists())
