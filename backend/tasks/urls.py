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
    support_tickets_list,
    update_support_ticket,
    ticket_notes,
    ticket_evidence,
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
    path("support-tickets/list/", support_tickets_list, name="support-tickets-list"),
    path("support-tickets/<int:ticket_id>/", update_support_ticket, name="update-support-ticket"),
    path("support-tickets/<int:ticket_id>/notes/", ticket_notes, name="ticket-notes"),
    path("support-tickets/<int:ticket_id>/evidence/", ticket_evidence, name="ticket-evidence"),
]
