from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from django.urls import reverse, resolve

from .current_caseload import merge_monitoring, current_assignment
from .models import WellbeingSafeguardingMonitoringSystem as Monitoring
from .views import _check_learner_access


class CurrentCaseloadTests(SimpleTestCase):
    def member(self, **changes):
        return {"id": "source-uuid", "email": "Student@example.com", "full_name": "Student",
                "aptem_id": None, "coach_email": "new@example.com", "coach_name": "New Coach",
                "programme": "Programme", **changes}

    def test_transfer_keeps_reports_answers_and_ids_without_changing_stored_record(self):
        old = Monitoring(id=123, learner_email="student@example.com", coach_email="old@example.com",
                         program_status="Onboarding", submission_json={"answers": [1, 2]},
                         history_json=[{"date": "2026-09-01", "score": 7}], total_score=7)
        before = deepcopy({field.attname: getattr(old, field.attname) for field in old._meta.concrete_fields})
        rows = merge_monitoring([self.member()], [old])
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].id, 123)
        self.assertEqual(rows[0].coach_email, "new@example.com")
        self.assertEqual(rows[0].submission_json, old.submission_json)
        self.assertEqual(rows[0].history_json, old.history_json)
        self.assertEqual(rows[0].total_score, 7)
        self.assertEqual({field.attname: getattr(old, field.attname) for field in old._meta.concrete_fields}, before)

    def test_aptem_id_matches_when_email_changed(self):
        old = Monitoring(id=123, learner_email="old@example.com", total_score=12)
        row = merge_monitoring([self.member(aptem_id=123)], [old])[0]
        self.assertEqual(row.id, 123)
        self.assertEqual(row.total_score, 12)

    def test_summary_does_not_lazy_load_answers_or_other_deferred_fields(self):
        # SimpleTestCase rejects database queries: accessing a deferred field
        # while copying this record would fail (and cause N+1 queries in production).
        old = Monitoring.from_db("wellbeing", ["id", "learner_email", "total_score"],
                                 [123, "student@example.com", 12])
        old._history_summary = [{"date": "2026-09-01", "risk_level": "High"}]
        row = merge_monitoring([self.member()], [old])[0]
        self.assertEqual(row.id, 123)
        self.assertEqual(row.total_score, 12)
        self.assertEqual(row.history_json, old._history_summary)
        self.assertIsNone(row.submission_json)
        self.assertIn("submission_json", old.get_deferred_fields())

    def test_new_learner_shows_without_inventing_survey_data(self):
        row = merge_monitoring([self.member()], [])[0]
        self.assertLess(row.id, 0)
        self.assertIsNone(row.total_score)
        self.assertIsNone(row.submission_json)
        url = reverse("learner-wellbeing-report", kwargs={"learner_id": row.id})
        self.assertEqual(int(resolve(url).kwargs["learner_id"]), row.id)

    def test_old_caseload_does_not_restore_removed_member(self):
        self.assertEqual(merge_monitoring([], [Monitoring(id=123)]), [])

    def test_current_owner_controls_report_access(self):
        old = Monitoring(id=123, learner_email="student@example.com", coach_email="old@example.com")
        with patch("tasks.current_caseload.read_roster", return_value=[self.member()]):
            self.assertEqual(current_assignment(old)["coach_email"], "new@example.com")
            with patch("tasks.views.WellbeingSafeguardingMonitoringSystem.objects") as objects:
                objects.using.return_value.filter.return_value.first.return_value = old
                for email, expected in [("new@example.com", None), ("old@example.com", 403)]:
                    request = SimpleNamespace(user=SimpleNamespace(email=email, profile=SimpleNamespace(role="coach")))
                    learner, error = _check_learner_access(request, 123)
                    self.assertEqual(error.status_code if error is not None else None, expected)

    def test_ambiguous_assignment_does_not_grant_access(self):
        rows = [self.member(), self.member(coach_email="other@example.com")]
        with patch("tasks.current_caseload.read_roster", return_value=rows):
            self.assertEqual(current_assignment(Monitoring(id=123, learner_email="student@example.com"))["coach_email"], "")
