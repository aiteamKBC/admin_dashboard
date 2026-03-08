from django.urls import path
from .views import CoachTasksView, CoachTaskDetailView, EvidenceUploadView
from rest_framework_simplejwt.views import TokenRefreshView
from .views import EmailOrUsernameTokenObtainPairView
urlpatterns = [
    path("coaches/<str:coach_id>/tasks/", CoachTasksView.as_view()),
    path("coaches/<str:coach_id>/tasks/<str:task_id>/", CoachTaskDetailView.as_view()),
    path("evidence/upload/", EvidenceUploadView.as_view()),
    path("api/token/", EmailOrUsernameTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
]
