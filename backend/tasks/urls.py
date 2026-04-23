from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CoachTasksView,
    CoachTaskDetailView,
    EvidenceUploadView,
    EmailOrUsernameTokenObtainPairView,
    coach_wellbeing_dashboard,
    coach_options,
    create_support_ticket,
)

urlpatterns = [
    path("coaches/<str:coach_id>/tasks/", CoachTasksView.as_view()),
    path("coaches/<str:coach_id>/tasks/<str:task_id>/", CoachTaskDetailView.as_view()),
    path("evidence/upload/", EvidenceUploadView.as_view()),
    path("api/token/", EmailOrUsernameTokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("coach-wellbeing-dashboard/", coach_wellbeing_dashboard, name="coach-wellbeing-dashboard"),
    path("coach-options/", coach_options, name="coach-options"),
    path("support-tickets/", create_support_ticket, name="support-tickets"),
]
