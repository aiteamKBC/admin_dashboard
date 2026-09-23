from django.contrib.auth.models import User
from django.test import TestCase

from .admin import EmailRequiredUserChangeForm, EmailRequiredUserCreationForm


class EmailRequiredUserCreationFormTests(TestCase):
    def test_email_is_required(self):
        form = EmailRequiredUserCreationForm(
            data={
                "username": "Youmna",
                "email": "",
                "password1": "A-secure-test-password-123",
                "password2": "A-secure-test-password-123",
            }
        )

        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)

    def test_existing_user_can_keep_their_email(self):
        user = User.objects.create_user(
            username="existing-user",
            email="Youmna@kentbusinesscollege.com",
            password="A-secure-test-password-123",
        )
        form = EmailRequiredUserChangeForm(
            instance=user,
            data={
                "username": user.username,
                "email": user.email,
                "is_active": True,
            },
        )

        self.assertNotIn("email", form.errors)

    def test_duplicate_email_is_rejected_case_insensitively(self):
        User.objects.create_user(
            username="existing-user",
            email="Youmna@kentbusinesscollege.com",
            password="A-secure-test-password-123",
        )
        form = EmailRequiredUserCreationForm(
            data={
                "username": "another-user",
                "email": "youmna@kentbusinesscollege.com",
                "password1": "Another-secure-test-password-123",
                "password2": "Another-secure-test-password-123",
            }
        )

        self.assertFalse(form.is_valid())
        self.assertIn("email", form.errors)

# Create your tests here.
