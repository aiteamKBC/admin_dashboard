import tempfile
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.parse import urlsplit

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIRequestFactory, force_authenticate

from . import views
from .models import InclusionTicket, LearnerInclusivenessReport


class InclusionTicketTests(TestCase):
    databases = {"default", "wellbeing"}

    def setUp(self):
        self.factory = APIRequestFactory()
        self.user = SimpleNamespace(email="coach@example.com", username="coach", is_authenticated=True,
                                    is_staff=False, is_superuser=False, profile=SimpleNamespace(role="coach"))
        self.source = LearnerInclusivenessReport(
            id=str(uuid.uuid4()), learner_name="Test Learner", learner_email="learner@example.com",
            learner_id=123, programme="Programme", organization_name="Employer", coach_email="old@example.com",
            notes=[{"note": "Existing report note"}], evidence=[{"file_name": "existing.pdf"}],
        )
        self.index = ({"learner@example.com": {("coach@example.com", "Current Coach")}}, {})
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings_override = override_settings(MEDIA_ROOT=self.temp.name)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        self.owner_patch = patch("tasks.views.inclusion_assignment_index", return_value=self.index)
        self.owner_patch.start()
        self.addCleanup(self.owner_patch.stop)
        self.source_patch = patch("tasks.views.LearnerInclusivenessReport.objects")
        self.sources = self.source_patch.start()
        self.addCleanup(self.source_patch.stop)

        def get_source(**kwargs):
            if str(kwargs["id"]) == self.source.id:
                return self.source
            raise LearnerInclusivenessReport.DoesNotExist

        self.sources.using.return_value.get.side_effect = get_source
        self.sources.using.return_value.only.return_value.get.side_effect = get_source

    def call(self, view, method="get", data=None, user=None, **kwargs):
        request = getattr(self.factory, method)("/tasks-api/", data or {}, format="multipart" if method == "post" else "json")
        force_authenticate(request, user=user or self.user)
        return view(request, **kwargs)

    def payload(self, **changes):
        return {"ticket_id": str(uuid.uuid4()), "source_report_id": self.source.id,
                "subject": "Support needed", "details": "Concern and actions already taken.",
                "category": "Technology", "risk_level": "High", "preferred_contact": "email",
                "incident_date": "2026-10-07", "incident_time": "10:30", **changes}

    def create(self, **changes):
        response = self.call(views.create_inclusion_ticket, "post", self.payload(**changes))
        self.assertEqual(response.status_code, 201, response.data)
        return response.data["report"]

    def test_creation_persists_details_multiple_files_and_current_owner(self):
        report = self.create(files=[SimpleUploadedFile("image.png", b"image-bytes", "image/png"),
                                   SimpleUploadedFile("notes.txt", b"Evidence text", "text/plain")],
                             evidence_description="Incident evidence")
        ticket = InclusionTicket.objects.using("wellbeing").get(id=report["id"])
        self.assertEqual(ticket.coach_email, "coach@example.com")
        self.assertEqual(ticket.created_by, self.user.email)
        self.assertEqual(ticket.source_report_id, self.source.id)
        self.assertEqual(ticket.details, "Concern and actions already taken.")
        self.assertEqual(report["evidence_count"], 2)
        self.assertIsNone(report["overall_score"])
        self.assertIsNone(report["expected_reports"])
        for evidence in ticket.evidence:
            self.assertTrue((Path(self.temp.name) / urlsplit(evidence["file_url"]).path.removeprefix("/media/")).is_file())
            self.assertEqual(evidence["description"], "Incident evidence")
            self.assertEqual(evidence["created_by"], self.user.email)
        self.assertEqual(self.source.notes, [{"note": "Existing report note"}])
        self.assertEqual(self.source.evidence, [{"file_name": "existing.pdf"}])
        self.sources.using.return_value.create.assert_not_called()

    def test_retries_do_not_duplicate_but_same_learner_can_have_multiple_tickets(self):
        payload = self.payload()
        first = self.call(views.create_inclusion_ticket, "post", payload)
        retry = self.call(views.create_inclusion_ticket, "post", payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(retry.status_code, 200)
        self.assertEqual(first.data["report"]["id"], retry.data["report"]["id"])
        self.create(subject="A separate concern")
        self.assertEqual(InclusionTicket.objects.using("wellbeing").count(), 2)

    def test_required_fields_risk_date_and_file_limits(self):
        cases = [{"subject": " "}, {"details": ""}, {"risk_level": "invalid"},
                 {"incident_date": "not-a-date"}, {"incident_date": ""},
                 {"files": [SimpleUploadedFile("script.html", b"<script></script>", "text/html")]},
                 {"files": [SimpleUploadedFile("empty.txt", b"", "text/plain")]},
                 {"files": [SimpleUploadedFile("big.txt", b"x" * (10 * 1024 * 1024 + 1), "text/plain")]},
                 {"files": [SimpleUploadedFile(f"{i}.txt", b"x", "text/plain") for i in range(11)]}]
        for changes in cases:
            with self.subTest(fields=list(changes)):
                response = self.call(views.create_inclusion_ticket, "post", self.payload(**changes))
                self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(InclusionTicket.objects.using("wellbeing").count(), 0)
        self.assertFalse(list(Path(self.temp.name).rglob("*.*")))

    def test_permissions_before_writing_and_manual_ticket_access(self):
        report = self.create()
        self.user.email = "other-coach@example.com"
        self.assertEqual(self.call(views.create_inclusion_ticket, "post", self.payload()).status_code, 403)
        for view in (views.onboarding_report_detail, views.onboarding_report_evidence, views.onboarding_report_notes):
            self.assertEqual(self.call(view, report_id=report["id"]).status_code, 403)
        self.assertEqual(self.call(views.update_onboarding_report, "patch", {"status": "closed"}, report_id=report["id"]).status_code, 403)
        self.user.profile.role = "learner"
        self.assertEqual(self.call(views.create_inclusion_ticket, "post", self.payload()).status_code, 403)
        self.assertEqual(InclusionTicket.objects.using("wellbeing").count(), 1)

    def test_failed_upload_rolls_back_ticket_and_cleans_written_files(self):
        original_save = views.FileSystemStorage.save
        calls = []

        def fail_second(storage, name, content, **kwargs):
            calls.append(name)
            if len(calls) == 2:
                raise OSError("Simulated storage failure")
            return original_save(storage, name, content, **kwargs)

        with patch.object(views.FileSystemStorage, "save", autospec=True, side_effect=fail_second), \
             patch("tasks.views.logger.exception"):
            response = self.call(views.create_inclusion_ticket, "post", self.payload(files=[
                SimpleUploadedFile("one.txt", b"one", "text/plain"), SimpleUploadedFile("two.txt", b"two", "text/plain")]))
        self.assertEqual(response.status_code, 500)
        self.assertEqual(InclusionTicket.objects.using("wellbeing").count(), 0)
        self.assertFalse([path for path in Path(self.temp.name).rglob("*") if path.is_file()])

    def test_detail_notes_evidence_status_archive_and_restore(self):
        report = self.create()
        report_id = report["id"]
        detail = self.call(views.onboarding_report_detail, report_id=report_id)
        self.assertEqual(detail.data["report"]["manual_ticket"]["details"], "Concern and actions already taken.")
        self.assertEqual(self.call(views.onboarding_report_notes, "post", {"note": "Follow up"}, report_id=report_id).status_code, 201)
        self.assertEqual(self.call(views.onboarding_report_evidence, "post", {"description": "Meeting evidence"}, report_id=report_id).status_code, 201)
        self.assertEqual(len(self.call(views.onboarding_report_notes, report_id=report_id).data["notes"]), 1)
        self.assertEqual(len(self.call(views.onboarding_report_evidence, report_id=report_id).data["evidence"]), 1)
        result = self.call(views.update_onboarding_report, "patch", {"status": "closed", "progress_tier": 2}, report_id=report_id)
        self.assertEqual(result.status_code, 200, result.data)
        ticket = InclusionTicket.objects.using("wellbeing").get(id=report_id)
        self.assertEqual((ticket.status, ticket.progress_tier), ("closed", 2))
        self.assertEqual(self.call(views.archive_onboarding_report, "post", report_id=report_id).status_code, 200)
        ticket.refresh_from_db(using="wellbeing")
        self.assertTrue(ticket.is_archived)
        self.assertEqual(self.call(views.restore_onboarding_report, "post", report_id=report_id).status_code, 200)
        ticket.refresh_from_db(using="wellbeing")
        self.assertFalse(ticket.is_archived)

    def test_dashboard_list_includes_ticket_and_applies_current_coach_and_archive_filters(self):
        report = self.create()
        # The existing screening query uses PostgreSQL JSON operators; leave it empty
        # while exercising the real ticket query and database in isolation.
        source_query = MagicMock()
        for method in ("filter", "only", "annotate", "order_by"):
            getattr(source_query, method).return_value = source_query
        source_query.values.return_value = []
        with patch("tasks.views._exclude_inclusion_internal_org", return_value=source_query):
            response = self.call(views.onboarding_reports_list)
            self.assertEqual([row["id"] for row in response.data["reports"]], [report["id"]])
            self.user.email = "other-coach@example.com"
            self.assertEqual(self.call(views.onboarding_reports_list).data["total"], 0)
            self.user.email = "coach@example.com"
            self.call(views.archive_onboarding_report, "post", report_id=report["id"])
            self.assertEqual(self.call(views.onboarding_reports_list).data["total"], 0)
            self.assertEqual(self.call(views.onboarding_reports_list, data={"archived": "1"}).data["total"], 1)
