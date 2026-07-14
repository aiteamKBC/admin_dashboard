from django.core.management.base import BaseCommand

from tasks.views import sync_support_ticket_coach_snapshots


class Command(BaseCommand):
    help = "Sync support ticket coach_name/coach_email from current learner data and add activity notes for transfers."

    def handle(self, *args, **options):
        updated = sync_support_ticket_coach_snapshots()
        self.stdout.write(self.style.SUCCESS(
            f"Synced support ticket coach snapshots. Updated {updated} ticket(s)."
        ))
