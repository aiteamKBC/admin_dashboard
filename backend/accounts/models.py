from django.db import models

# Create your models here.

from django.contrib.auth.models import User

class Profile(models.Model):
    ROLE_CHOICES = (
        ("coach", "Coach"),
        ("qa", "QA"),
    )

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)

    # case_owner_id
    coach_id = models.CharField(max_length=64, null=True, blank=True)
    lms_account_id = models.BigIntegerField(null=True, blank=True, unique=True)

    def __str__(self):
        return f"{self.user.username} ({self.role})"


class LMSLoginAttempt(models.Model):
    state = models.CharField(max_length=64, primary_key=True)
    expires_at = models.DateTimeField(db_index=True)
