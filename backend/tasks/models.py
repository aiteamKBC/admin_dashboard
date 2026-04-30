from django.db import models

# Create your models here.
# import uuid

class CoachData(models.Model):
    # id
    case_owner_id = models.IntegerField(primary_key=True)
    # json
    tasks = models.JSONField(null=True, blank=True, default=list)

    class Meta:
        db_table = "coaches_data"
        managed = False

    def __str__(self):
        return str(self.case_owner_id)

# for wellbeing

#for analyzied data from safeguarding_wellbeing_automation table
class SafeguardingWellbeingAutomation(models.Model):
    wellbeing_record_id = models.BigIntegerField(primary_key=True)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)

    apprentice_dashboard = models.TextField(null=True, blank=True, db_column="apprentice_dashboard")
    follow_up_by_coach = models.TextField(null=True, blank=True, db_column="Follow-up_by_Coach")
    suggested_coach_actions = models.TextField(null=True, blank=True, db_column="Suggested_Coach_Actions")
    line_manager_actions = models.TextField(null=True, blank=True, db_column="Line_Manager_Actions")

    class Meta:
        managed = False
        db_table = "safeguarding_wellbeing_automation"

#to bring coach & learner data
class WellbeingSafeguardingMonitoringSystem(models.Model):
    id = models.BigIntegerField(primary_key=True)
    learner_name = models.TextField(null=True, blank=True)
    learner_email = models.TextField(null=True, blank=True)
    learner_phone = models.TextField(null=True, blank=True)
    learner_address = models.TextField(null=True, blank=True)
    programme = models.TextField(null=True, blank=True)
    manager_name = models.TextField(null=True, blank=True)
    manager_email = models.TextField(null=True, blank=True)
    coach_name = models.TextField(null=True, blank=True)
    coach_email = models.TextField(null=True, blank=True)

    total_score = models.FloatField(null=True, blank=True)
    personal_wellbeing_protective_factors_score = models.FloatField(null=True, blank=True)
    emotional_stress_resilience_score = models.FloatField(null=True, blank=True)
    provider_culture_support_score = models.FloatField(null=True, blank=True)
    safeguarding_vulnerability_score = models.FloatField(null=True, blank=True)
    trigger_count = models.IntegerField(null=True, blank=True)
    risk_level = models.TextField(null=True, blank=True)
    history_json = models.JSONField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "wellbeing_safeguarding_monitoring_system"

# safeguarding
class SupportTicket(models.Model):
    id = models.BigAutoField(primary_key=True)
    wellbeing_record_id = models.BigIntegerField(null=True, blank=True)
    ticket_type = models.TextField(null=True, blank=True)
    full_name = models.TextField(null=True, blank=True)
    email = models.TextField(null=True, blank=True)
    subject = models.TextField(null=True, blank=True)
    details = models.TextField(null=True, blank=True)
    urgency = models.TextField(null=True, blank=True)
    preferred_contact = models.TextField(null=True, blank=True)
    status = models.TextField(null=True, blank=True)
    notes = models.JSONField(null=True, blank=True, default=list)
    evidence = models.JSONField(null=True, blank=True, default=list)
    created_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(null=True, blank=True)
    created_by = models.TextField(null=True, blank=True)

    class Meta:
        managed = False
        db_table = "support_tickets"