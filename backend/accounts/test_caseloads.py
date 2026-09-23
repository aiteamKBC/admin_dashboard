from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase
from rest_framework.test import APIRequestFactory, force_authenticate

from .caseload_views import build_caseloads, coach_caseloads


class CaseloadTests(SimpleTestCase):
    def learner(self, **changes):
        return {"id": "new-uuid", "full_name": "Student", "email": "student@example.com",
                "coach_name": "New Coach", "coach_email": "new@example.com",
                "aptem_id": None, **changes}

    def test_transfer_preserves_history_without_mutating_stored_student(self):
        original = {"ID": 123, "Email": "STUDENT@example.com", "FullName": "Old name",
                    "CaseOwnerId": 1, "Review Status1": "Completed",
                    "report": {"answers": [1, 2], "ticket_id": 77}, "Overall": 85}
        coaches = [{"case_owner_id": 1, "case_owner": "Old Coach", "students": [original]},
                   {"case_owner_id": 2, "case_owner": "New Coach", "students": []}]
        before = deepcopy(coaches)
        groups = build_caseloads([self.learner()], coaches,
                                [(1, "old@example.com"), (2, "NEW@example.com")], [])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]["coach_ids"], ["2"])
        student = groups[0]["students"][0]
        self.assertEqual(student["ID"], 123)
        self.assertEqual(student["Review Status1"], "Completed")
        self.assertEqual(student["report"], original["report"])
        self.assertNotIn("CaseOwnerId", student)
        self.assertEqual(coaches, before)

    def test_new_student_and_coach_appear_without_legacy_row(self):
        groups = build_caseloads([self.learner()], [], [], [])
        self.assertEqual(len(groups[0]["students"]), 1)
        self.assertLess(groups[0]["display_id"], 0)
        self.assertEqual(groups[0]["students"][0]["ID"], "")
        self.assertEqual(groups[0]["students"][0]["learner_id"], "new-uuid")

    def test_removed_assignment_does_not_fall_back_to_old_students(self):
        coaches = [{"case_owner_id": 1, "case_owner": "Old", "students": [
            {"ID": 5, "Email": "student@example.com"}]}]
        self.assertEqual(build_caseloads([], coaches, [(1, "old@example.com")], []), [])

    def test_aptem_match_preserves_history_when_email_changes(self):
        coaches = [{"case_owner_id": 1, "case_owner": "Old", "students":
                    '[{"ID": 123, "Email": "old@example.com", "Review Status1": "Done"}]'}]
        groups = build_caseloads([self.learner(aptem_id=123)], coaches, [], [])
        self.assertEqual(groups[0]["students"][0]["Review Status1"], "Done")

    def test_ambiguous_name_does_not_combine_coaches(self):
        learners = [self.learner(), self.learner(coach_email="other@example.com", id="other")]
        coaches = [{"case_owner_id": 1, "case_owner": "New Coach", "students": []}]
        groups = build_caseloads(learners, coaches, [], [])
        self.assertTrue(all(not group["coach_ids"] for group in groups))

    def test_endpoint_requires_authentication(self):
        response = coach_caseloads(APIRequestFactory().get("/"))
        self.assertIn(response.status_code, [401, 403])

    def test_endpoint_rejects_other_roles_before_database_access(self):
        request = APIRequestFactory().get("/")
        force_authenticate(request, user=SimpleNamespace(is_authenticated=True,
                           profile=SimpleNamespace(role="learner")))
        with patch("accounts.caseload_views.connections") as connections:
            self.assertEqual(coach_caseloads(request).status_code, 403)
            connections.__getitem__.assert_not_called()
