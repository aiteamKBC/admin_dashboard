from rest_framework import serializers


class CoachTaskCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=5000, allow_blank=False, trim_whitespace=True)
    evidence = serializers.JSONField(required=False)


class CoachTaskUpdateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=5000, required=False, allow_blank=False, trim_whitespace=True)
    done = serializers.BooleanField(required=False)
    evidence = serializers.JSONField(required=False)


class InclusionTicketCreateSerializer(serializers.Serializer):
    ticket_id = serializers.UUIDField()
    source_report_id = serializers.UUIDField(required=False)
    roster_learner_id = serializers.CharField(max_length=100, required=False)
    subject = serializers.CharField(max_length=200)
    details = serializers.CharField(max_length=20000)
    category = serializers.ChoiceField(choices=[
        "General inclusion", "Technology", "Visual & Hearing", "Dyslexia",
        "ADHD", "Social Anxiety", "Mood & Learning", "Other",
    ])
    risk_level = serializers.ChoiceField(choices=["Low", "Moderate", "High"])
    preferred_contact = serializers.ChoiceField(choices=["email", "phone"])
    incident_date = serializers.DateField(required=False)
    incident_time = serializers.TimeField(required=False)
    evidence_description = serializers.CharField(max_length=2000, required=False, allow_blank=True)

    def validate(self, attrs):
        if bool(attrs.get("source_report_id")) == bool(attrs.get("roster_learner_id")):
            raise serializers.ValidationError("Choose one learner from the current caseload.")
        if attrs.get("incident_time") and not attrs.get("incident_date"):
            raise serializers.ValidationError({"incident_date": "Choose a date for the incident time."})
        return attrs
