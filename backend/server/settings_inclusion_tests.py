"""Isolated ticket tests: SQLite and temporary uploads, no external services."""
from .settings_test import *  # noqa: F403

INSTALLED_APPS = [*INSTALLED_APPS, "tasks"]  # noqa: F405
DATABASES = {
    "default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"},
    "wellbeing": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"},
}
MIGRATION_MODULES = {"tasks": None}
ROOT_URLCONF = "tasks.urls"
ALLOWED_HOSTS = ["testserver"]
MEDIA_URL = "/media/"

