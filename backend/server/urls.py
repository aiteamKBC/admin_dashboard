from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve

from rest_framework_simplejwt.views import TokenRefreshView
from tasks.views import EmailOrUsernameTokenObtainPairView

urlpatterns = [
    path("admin/", admin.site.urls),

    # tasks API
    path("tasks-api/", include("tasks.urls")),

    # accounts API (auth endpoints)
    path("auth/", include("accounts.urls")),

    # accounts API (evidence endpoints)
    path("api/accounts/", include("accounts.urls")),

    # JWT authentication
    path("api/token/", EmailOrUsernameTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    

    # Media files — served by Django in all environments (DEBUG=True or False)
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
]