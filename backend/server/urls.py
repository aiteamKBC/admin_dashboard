from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

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
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)