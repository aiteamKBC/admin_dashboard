from django.urls import path
from . import lms_sso
from .views import LoginView, MicrosoftCallbackView, MicrosoftLoginView, MicrosoftResultView
from .evidence_views import GetStudentComponentsView, MarkEvidenceView, PollMarkingReportView
from .learner_views import learner_result_tickets, update_learner_review, learner_history
from .user_management import AddUserView

urlpatterns = [
    path("lms/config/", lms_sso.config),
    path("lms/start/", lms_sso.start),
    path("lms/complete/", lms_sso.complete),
    path("users/", AddUserView.as_view(), name="add-dashboard-user"),
    path("learner-result-tickets/", learner_result_tickets, name="learner_result_tickets"),
    path("learner-result-tickets/review/", update_learner_review, name="update_learner_review"),
    path("learner-result-tickets/history/", learner_history, name="learner_history"),
    path("login/", LoginView.as_view(), name="login"),
    path("microsoft/login/", MicrosoftLoginView.as_view(), name="microsoft_login"),
    path("microsoft/result/", MicrosoftResultView.as_view(), name="microsoft_result"),
    path("callback", MicrosoftCallbackView.as_view(), name="microsoft_callback_no_slash"),
    path("callback/", MicrosoftCallbackView.as_view(), name="microsoft_callback"),
    path("student-components/", GetStudentComponentsView.as_view(), name="student_components"),
    path("mark-evidence/", MarkEvidenceView.as_view(), name="mark_evidence"),
    path("poll-marking-report/", PollMarkingReportView.as_view(), name="poll_marking_report"),
    path("poll-marking-result/", PollMarkingReportView.as_view(), name="poll_marking_result"),
]
