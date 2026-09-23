from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from .learner_views import _coach_learner_scope, _learner_email_allowed


class WhoIAmCaseloadTests(SimpleTestCase):
    def test_current_roster_controls_list_history_and_review_scope(self):
        user = SimpleNamespace(email=" New.Coach@example.com ")
        members = [{"email": " Student@example.com ", "full_name": " Learner Name "}]
        with patch("accounts.learner_views.read_roster", return_value=members) as read:
            self.assertEqual(_coach_learner_scope(user), ({"student@example.com"}, {"learner name"}))
            read.assert_called_with("new.coach@example.com")
            self.assertTrue(_learner_email_allowed(user, "coach", "STUDENT@example.com"))
            self.assertFalse(_learner_email_allowed(user, "coach", "other@example.com"))

    def test_removed_assignment_does_not_fall_back_to_historical_owner(self):
        with patch("accounts.learner_views.read_roster", return_value=[]):
            self.assertFalse(_learner_email_allowed(SimpleNamespace(email="old@example.com"), "coach", "student@example.com"))

    def test_missing_coach_email_does_not_read_all_learners(self):
        with patch("accounts.learner_views.read_roster") as read:
            self.assertEqual(_coach_learner_scope(SimpleNamespace(email="")), (set(), set()))
            read.assert_not_called()
