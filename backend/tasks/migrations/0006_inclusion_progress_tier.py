from django.db import migrations, models


SQL_UP = """
DO $$
BEGIN
    IF to_regclass('learner_inclusiveness_reports') IS NOT NULL THEN
        ALTER TABLE learner_inclusiveness_reports
            ADD COLUMN IF NOT EXISTS progress_tier SMALLINT;

        BEGIN
            ALTER TABLE learner_inclusiveness_reports
                ADD CONSTRAINT learner_inclusiveness_progress_tier_check
                CHECK (progress_tier IS NULL OR progress_tier BETWEEN 1 AND 4);
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END $$;
"""

SQL_DOWN = """
DO $$
BEGIN
    IF to_regclass('learner_inclusiveness_reports') IS NOT NULL THEN
        ALTER TABLE learner_inclusiveness_reports
            DROP CONSTRAINT IF EXISTS learner_inclusiveness_progress_tier_check;
        ALTER TABLE learner_inclusiveness_reports
            DROP COLUMN IF EXISTS progress_tier;
    END IF;
END $$;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0005_coach_microsoftconnection_microsoftoauthstate"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(SQL_UP, SQL_DOWN),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="learnerinclusivenessreport",
                    name="progress_tier",
                    field=models.IntegerField(blank=True, null=True),
                ),
            ],
        ),
    ]
