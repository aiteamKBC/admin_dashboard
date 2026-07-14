from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tasks", "0006_inclusion_progress_tier"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.AddField(
                    model_name="supportticket",
                    name="coach_name",
                    field=models.TextField(blank=True, null=True),
                ),
                migrations.AddField(
                    model_name="supportticket",
                    name="coach_email",
                    field=models.TextField(blank=True, null=True),
                ),
            ],
        ),
    ]
