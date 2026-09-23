from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .current_caseload import inclusion_assignment
from .models import LearnerInclusivenessReport
from .views import _check_onboarding_report_access


class InclusionCaseloadTests(SimpleTestCase):
    def setUp(self):
        self.owner = ("new@example.com", "New Coach")
        self.index = ({"student@example.com": {self.owner}}, {"123": {self.owner}})

    def test_current_assignment_ignores_stored_coach_and_preserves_report(self):
        report = {"learner_email": " STUDENT@example.com ", "coach_email": "old@example.com",
                  "notes": [{"created_by": "Old Coach", "note": "Follow up"}],
                  "evidence": [{"file_url": "original.pdf"}], "master_report": {"answers": [1, 2]}}
        before = deepcopy(report)
        owner = inclusion_assignment(report, self.index)
        self.assertEqual(owner["coach_email"], "new@example.com")
        self.assertEqual(report, before)

    def test_academic_email_id_and_previous_email_fallbacks(self):
        for report in [{"academic_email": "Student@example.com"}, {"learner_id": 123},
                       {"previous_emails": "old@example.com; STUDENT@example.com"}]:
            with self.subTest(report=report):
                self.assertEqual(inclusion_assignment(report, self.index)["coach_email"], "new@example.com")

    def test_unknown_or_ambiguous_membership_does_not_grant_access(self):
        self.assertIsNone(inclusion_assignment({"coach_email": "new@example.com"}, self.index))
        self.index[0]["student@example.com"].add(("other@example.com", "Other Coach"))
        self.assertIsNone(inclusion_assignment({"learner_email": "student@example.com"}, self.index))

    def test_current_owner_can_open_archived_report_without_saving_or_syncing(self):
        report = LearnerInclusivenessReport(id="report", learner_email="student@example.com",
                                            coach_email="old@example.com", is_archived=True,
                                            notes=[{"note": "Existing note"}], organization_name="Employer")
        with patch("tasks.views.LearnerInclusivenessReport.objects") as objects, \
             patch("tasks.views.inclusion_assignment_index", return_value=self.index), \
             patch("tasks.views.sync_inclusion_report_coach_snapshots") as sync, \
             patch.object(report, "save") as save:
            objects.using.return_value.get.return_value = report
            request = SimpleNamespace(user=SimpleNamespace(email="new@example.com", profile=SimpleNamespace(role="coach")))
            result, error = _check_onboarding_report_access(request, "report")
            self.assertIsNone(error)
            self.assertEqual(result.coach_email, "new@example.com")
            self.assertTrue(result.is_archived)
            self.assertEqual(result.notes, [{"note": "Existing note"}])
            save.assert_not_called()
            sync.assert_not_called()
            request.user.email = "old@example.com"
            _, error = _check_onboarding_report_access(request, "report")
            self.assertEqual(error.status_code, 403)
