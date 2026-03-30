from django.urls import path
from .views import LoginView, MicrosoftCallbackView, MicrosoftLoginView, MicrosoftResultView
from .evidence_views import GetStudentComponentsView, MarkEvidenceView

urlpatterns = [
    path("login/", LoginView.as_view(), name="login"),
    path("microsoft/login/", MicrosoftLoginView.as_view(), name="microsoft_login"),
    path("microsoft/result/", MicrosoftResultView.as_view(), name="microsoft_result"),
    path("callback", MicrosoftCallbackView.as_view(), name="microsoft_callback_no_slash"),
    path("callback/", MicrosoftCallbackView.as_view(), name="microsoft_callback"),
    path("student-components/", GetStudentComponentsView.as_view(), name="student_components"),
    path("mark-evidence/", MarkEvidenceView.as_view(), name="mark_evidence"),
]
