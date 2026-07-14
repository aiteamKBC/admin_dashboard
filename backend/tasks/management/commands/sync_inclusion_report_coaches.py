from django.core.management.base import BaseCommand

from tasks.views import sync_inclusion_report_coach_snapshots


class Command(BaseCommand):
    help = "Sync inclusion report coach_name/coach_email from current learner data and add activity notes for transfers."

    def handle(self, *args, **options):
        updated = sync_inclusion_report_coach_snapshots()
        self.stdout.write(self.style.SUCCESS(
            f"Synced inclusion report coach snapshots. Updated {updated} report(s)."
        ))
