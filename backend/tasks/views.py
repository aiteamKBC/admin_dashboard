from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated
from rest_framework_simplejwt.views import TokenObtainPairView
from .jwt_serializers import EmailOrUsernameTokenObtainPairSerializer

import uuid

# wellbeing
from datetime import datetime
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# to read the json 
import json
from collections import Counter

from .models import SafeguardingWellbeingAutomation, WellbeingSafeguardingMonitoringSystem, CoachData


from .models import CoachData
from .serializers import CoachTaskCreateSerializer, CoachTaskUpdateSerializer

import os
import traceback
from django.conf import settings
from django.core.files.storage import FileSystemStorage

from django.utils.text import get_valid_filename

class EmailOrUsernameTokenObtainPairView(TokenObtainPairView):
    serializer_class = EmailOrUsernameTokenObtainPairSerializer

def _ensure_list(value):
    return value if isinstance(value, list) else []


def _normalize_tasks(raw_tasks):
    tasks = []
    for t in _ensure_list(raw_tasks):
        if isinstance(t, dict):
            tasks.append(t)
        else:
            tasks.append({
                "id": uuid.uuid4().hex,
                "text": str(t),
                "done": False,
                "created_at": "",
                "updated_at": "",
            })
    return tasks


def _guard_coach_scope(request, coach_id: str):
    """
    QA: allowed for any coach_id
    Coach: only allowed if request.user.profile.coach_id == coach_id
    """
    user = getattr(request, "user", None)
    if not user or not user.is_authenticated:
        return Response({"detail": "Unauthorized"}, status=status.HTTP_401_UNAUTHORIZED)

    profile = getattr(user, "profile", None)
    if not profile:
        return Response({"detail": "User profile not found"}, status=status.HTTP_403_FORBIDDEN)

    role = getattr(profile, "role", None)

    if role == "qa":
        return None  # allowed for any coach

    if role == "coach":
        my_id = getattr(profile, "coach_id", None)
        if str(my_id) != str(coach_id):
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        return None  # allowed

    return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)


class CoachTasksView(APIView):
    """
    GET  /tasks-api/coaches/<coach_id>/tasks
    POST /tasks-api/coaches/<coach_id>/tasks
         body: { "text": "...", "evidence": {...} }   (evidence optional)
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, coach_id: str):
        guard = _guard_coach_scope(request, coach_id)
        if guard:
            return guard

        coach = get_object_or_404(CoachData, case_owner_id=coach_id)

        tasks = _normalize_tasks(coach.tasks)
        tasks_sorted = sorted(tasks, key=lambda t: t.get("created_at") or "", reverse=True)

        return Response(tasks_sorted, status=status.HTTP_200_OK)

    def post(self, request, coach_id: str):
        guard = _guard_coach_scope(request, coach_id)
        if guard:
            return guard

        coach = get_object_or_404(CoachData, case_owner_id=coach_id)

        s = CoachTaskCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)

        now_iso = timezone.now().isoformat()

        new_task = {
            "id": uuid.uuid4().hex,
            "text": s.validated_data["text"],
            "done": False,
            "created_at": now_iso,
            "updated_at": now_iso,
        }

        # evidence optional
        evidence = s.validated_data.get("evidence", None)
        if evidence is not None:
            new_task["evidence"] = evidence

        tasks = _normalize_tasks(coach.tasks)
        tasks.insert(0, new_task)

        coach.tasks = tasks
        coach.save(update_fields=["tasks"])

        return Response(new_task, status=status.HTTP_201_CREATED)


class CoachTaskDetailView(APIView):
    """
    PATCH  /tasks-api/coaches/<coach_id>/tasks/<task_id>
           body: { "text"?: "...", "done"?: true/false, "evidence"?: {...} }
    DELETE /tasks-api/coaches/<coach_id>/tasks/<task_id>
    """
    permission_classes = [IsAuthenticated]

    def patch(self, request, coach_id: str, task_id: str):
        guard = _guard_coach_scope(request, coach_id)
        if guard:
            return guard

        coach = get_object_or_404(CoachData, case_owner_id=coach_id)
        tasks = _normalize_tasks(coach.tasks)

        idx = next((i for i, t in enumerate(tasks) if str(t.get("id")) == str(task_id)), None)
        if idx is None:
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)

        s = CoachTaskUpdateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        data = s.validated_data

        task = tasks[idx]

        if "text" in data:
            task["text"] = data["text"]
        if "done" in data:
            task["done"] = data["done"]

        # allow updating evidence if provided
        if "evidence" in data:
            task["evidence"] = data["evidence"]

        task["updated_at"] = timezone.now().isoformat()

        tasks[idx] = task
        coach.tasks = tasks
        coach.save(update_fields=["tasks"])

        return Response(task, status=status.HTTP_200_OK)

    def delete(self, request, coach_id: str, task_id: str):
        guard = _guard_coach_scope(request, coach_id)
        if guard:
            return guard

        coach = get_object_or_404(CoachData, case_owner_id=coach_id)
        tasks = _normalize_tasks(coach.tasks)

        new_tasks = [t for t in tasks if str(t.get("id")) != str(task_id)]
        if len(new_tasks) == len(tasks):
            return Response({"detail": "Task not found"}, status=status.HTTP_404_NOT_FOUND)

        coach.tasks = new_tasks
        coach.save(update_fields=["tasks"])

        return Response(status=status.HTTP_204_NO_CONTENT)


class EvidenceUploadView(APIView):
    """
    POST /tasks-api/evidence/upload
    FormData:
      - file: image/*
    Returns:
      {
        "url": "/media/evidence/....png",
        "absolute_url": "http://127.0.0.1:5055/media/evidence/....png",
        "path": "evidence/....png"
      }
    """
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        try:
            f = request.FILES.get("file")
            if not f:
                return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

            content_type = str(getattr(f, "content_type", "") or "")
            if not content_type.startswith("image/"):
                return Response({"detail": "only image files allowed"}, status=status.HTTP_400_BAD_REQUEST)

            # Ensure evidence dir exists
            evidence_dir = os.path.join(settings.MEDIA_ROOT, "evidence")
            os.makedirs(evidence_dir, exist_ok=True)

            # Safe filename
            original = get_valid_filename(os.path.basename(getattr(f, "name", "upload")))
            unique_name = f"{uuid.uuid4().hex}_{original}"
            relative_path = os.path.join("evidence", unique_name).replace("\\", "/")

            fs = FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)

            # Save as stream (no f.read())
            saved_path = fs.save(relative_path, f)

            url = fs.url(saved_path)  # "/media/evidence/..."
            absolute_url = request.build_absolute_uri(url)

            return Response(
                {"url": url, "absolute_url": absolute_url, "path": saved_path},
                status=status.HTTP_201_CREATED
            )

        except Exception as e:
            # HTML error page
            return Response(
                {
                    "detail": "Upload failed",
                    "error": str(e),
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# maping for wellbeing 
def map_urgency_to_priority(value):
    value = (value or "").strip().lower()

    if value in ["critical", "urgent"]:
        return "urgent"
    if value in ["high"]:
        return "high"
    if value in ["medium", "moderate"]:
        return "medium"
    return "low"


def map_urgency_to_risk(value, safeguarding_flag=False):
    value = (value or "").strip().lower()

    if safeguarding_flag or value in ["critical", "urgent"]:
        return "red"
    if value in ["high", "medium", "moderate"]:
        return "amber"
    return "green"


def safe_date(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
    except Exception:
        return None

# helper to read the json
def parse_json_field(value, default=None):
    if value is None:
        return default if default is not None else {}

    if isinstance(value, (dict, list)):
        return value

    if isinstance(value, str):
        value = value.strip()
        if not value:
            return default if default is not None else {}
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return default if default is not None else {}

    return default if default is not None else {}

from collections import Counter

def _title_from_email_part(value: str) -> str:
    return " ".join(part.capitalize() for part in value.replace("-", " ").replace("_", " ").split())

def _coach_label_from_name_and_email(name: str, email: str, duplicate_name: bool) -> str:
    base_name = (name or "").strip()
    local = (email or "").split("@")[0].strip().lower()

    parts = [p for p in local.replace("_", ".").split(".") if p]

    if not base_name:
        if len(parts) >= 2:
            return f"{_title_from_email_part(parts[0])} {_title_from_email_part(parts[1])}"
        if len(parts) == 1:
            return _title_from_email_part(parts[0])
        return email

    if not duplicate_name:
        return base_name

    if len(parts) >= 2:
        first_part = _title_from_email_part(parts[0])
        second_part = _title_from_email_part(parts[1])

        # لو الاسم الأساسي مجرد first name زي Omar
        if base_name.strip().lower() == first_part.strip().lower():
            return f"{base_name} {second_part}"

        # fallback
        return f"{base_name} ({second_part})"

    if len(parts) == 1 and parts[0].lower() != base_name.lower():
        return f"{base_name} ({_title_from_email_part(parts[0])})"

    return f"{base_name} ({email})"


def _title_from_local_part(value: str) -> str:
    value = (value or "").strip().lower()
    if not value:
        return ""

    parts = [p for p in value.replace("-", ".").replace("_", ".").split(".") if p]
    return " ".join(part.capitalize() for part in parts)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def coach_options(request):
    rows = (
        WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
        .all()
        .values("coach_name", "coach_email")
        .order_by("coach_email")
    )

    cleaned_rows = []
    seen_emails = set()

    for row in rows:
        email = (row.get("coach_email") or "").strip().lower()
        name = (row.get("coach_name") or "").strip()

        if not email:
            continue

        if email in seen_emails:
            continue

        seen_emails.add(email)

        cleaned_rows.append({
            "coach_name": name,
            "coach_email": email,
        })

    data = []
    for item in cleaned_rows:
        email = item["coach_email"]
        name = item["coach_name"]

        local = email.split("@")[0].strip().lower()
        email_label = _title_from_local_part(local)

        # الأفضل نستخدم الاسم المشتق من الإيميل لأنه أوضح وأدق في حال الداتا فيها أسماء غلط
        label = email_label or name or email

        data.append({
            "value": email,
            "label": label,
        })

    return Response(data)

def safe_int(value, default=0):
    try:
        if value is None or value == "":
            return default
        return int(float(value))
    except Exception:
        return default


def empty_coach_wellbeing_response():
    return {
        "summary": {
            "caseload": 0,
            "atRisk": 0,
            "nonResponders": 0,
            "openTickets": 0,
        },
        "learners": [],
        "trends": [],
        "followUps": [],
        "suggestedActions": [],
    }


def extract_learner_id(*sources):
    possible_keys = [
        "learnerId",
        "learner_id",
        "studentId",
        "student_id",
        "id",
    ]

    for source in sources:
        if not isinstance(source, dict):
            continue

        for key in possible_keys:
            value = source.get(key)
            if value is None:
                continue

            value_str = str(value).strip()
            if value_str:
                return value_str

    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def coach_wellbeing_dashboard(request):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role == "coach":
        requested_coach_email = (getattr(user, "email", "") or "").strip().lower()
        if not requested_coach_email:
            return Response({"detail": "Coach email not found"}, status=status.HTTP_400_BAD_REQUEST)

    elif role == "qa":
        requested_coach_email = (request.query_params.get("coach_email") or "").strip().lower()
        if not requested_coach_email:
            return Response(empty_coach_wellbeing_response())

    else:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    monitoring_qs = WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing").all()

    if requested_coach_email:
        monitoring_qs = monitoring_qs.filter(coach_email__iexact=requested_coach_email)

    monitoring_rows = list(monitoring_qs.order_by("learner_name", "id"))

    automation_rows = list(
        SafeguardingWellbeingAutomation.objects.using("wellbeing")
        .all()
        .order_by("-updated_at", "-wellbeing_record_id")
    )

    latest_automation_by_learner_id = {}

    for row in automation_rows:
        follow = parse_json_field(row.follow_up_by_coach, {})
        suggested = parse_json_field(row.suggested_coach_actions, {})
        apprentice = parse_json_field(row.apprentice_dashboard, {})

        learner_id = extract_learner_id(follow, suggested, apprentice)
        if not learner_id:
            continue

        if learner_id in latest_automation_by_learner_id:
            continue

        latest_automation_by_learner_id[learner_id] = {
            "row": row,
            "follow": follow,
            "suggested": suggested,
            "apprentice": apprentice,
        }

    learners = []
    follow_ups = []
    suggested_actions = []

    caseload = 0
    at_risk = 0
    non_responders = 0
    open_tickets_total = 0

    trend_buckets = {}

    seen_monitoring_ids = set()
    seen_followups = set()
    seen_actions = set()

    for student_meta in monitoring_rows:
        student_unique_key = str(getattr(student_meta, "id", "") or "").strip()
        if not student_unique_key or student_unique_key in seen_monitoring_ids:
            continue

        seen_monitoring_ids.add(student_unique_key)

        row_student_name = (getattr(student_meta, "learner_name", "") or "").strip() or "Unknown learner"
        row_student_email = (getattr(student_meta, "learner_email", "") or "").strip()
        row_coach_name = (getattr(student_meta, "coach_name", "") or "").strip()
        row_coach_email = (getattr(student_meta, "coach_email", "") or "").strip().lower()
        row_programme = (getattr(student_meta, "programme", "") or "").strip()

        matched = latest_automation_by_learner_id.get(student_unique_key)

        if not matched:
            learners.append({
                "studentId": int(student_meta.id),
                "studentName": row_student_name,
                "studentEmail": row_student_email,
                "coachName": row_coach_name,
                "coachEmail": row_coach_email,
                "programme": row_programme,
                "lastSurveyDate": None,
                "wellbeingScore": None,
                "engagementScore": None,
                "providerSupportScore": None,
                "riskLevel": "green",
                "recommendedAction": "No wellbeing data yet",
                "hasOpenTicket": False,
                "nonResponder": False,
                "followUpReason": "",
                "safeguardingFlag": False,
                "flaggedDomains": [],
                "hasWellbeingData": False,
                "countedInSummary": False,
            })
            continue

        row = matched["row"]
        follow = matched["follow"]
        suggested = matched["suggested"]
        apprentice = matched["apprentice"]

        indicators = parse_json_field(follow.get("indicators"), {})
        summary = parse_json_field(follow.get("summary"), {})
        issues = parse_json_field(follow.get("issues"), {})

        learner_name = (
            row_student_name
            or follow.get("learnerName")
            or suggested.get("learnerName")
            or apprentice.get("learnerName")
            or "Unknown learner"
        )

        last_survey_date = safe_date(
            indicators.get("lastSurveyDate")
            or apprentice.get("lastSurveyDate")
        )

        urgency = follow.get("urgency") or ""
        safeguarding_flag = bool(indicators.get("safeguardingFlag"))
        risk_score = safe_int(follow.get("riskScore"), 0)
        open_tickets = safe_int(indicators.get("openTickets"), 0)

        risk_level = map_urgency_to_risk(urgency, safeguarding_flag=safeguarding_flag)

        wellbeing_score = getattr(student_meta, "emotional_stress_resilience_score", None)
        engagement_score = getattr(student_meta, "personal_wellbeing_protective_factors_score", None)
        provider_support_score = getattr(student_meta, "provider_culture_support_score", None)

        caseload += 1
        open_tickets_total += open_tickets

        if risk_level == "red":
            at_risk += 1

        if last_survey_date is None:
            non_responders += 1

        learners.append({
            "studentId": int(student_meta.id),
            "studentName": learner_name,
            "studentEmail": row_student_email,
            "coachName": row_coach_name,
            "coachEmail": row_coach_email,
            "programme": row_programme,
            "lastSurveyDate": last_survey_date,
            "wellbeingScore": wellbeing_score,
            "engagementScore": engagement_score,
            "providerSupportScore": provider_support_score,
            "riskLevel": risk_level,
            "recommendedAction": summary.get("cardTitle") or "Follow up required",
            "hasOpenTicket": open_tickets > 0,
            "nonResponder": last_survey_date is None,
            "followUpReason": summary.get("followUpReason") or "",
            "safeguardingFlag": safeguarding_flag,
            "flaggedDomains": issues.get("flaggedDomains") or [],
            "hasWellbeingData": True,
            "countedInSummary": True,
        })

        followup_key = f"{student_unique_key}|{summary.get('cardTitle') or ''}|{summary.get('followUpReason') or ''}"
        if followup_key not in seen_followups:
            seen_followups.add(followup_key)

            follow_ups.append({
                "id": str(row.wellbeing_record_id),
                "priority": map_urgency_to_priority(urgency),
                "title": summary.get("cardTitle") or "Coach follow-up required",
                "learnerName": learner_name,
                "learnerEmail": row_student_email,
                "coachName": row_coach_name,
                "coachEmail": row_coach_email,
                "dueDate": "Within 24 hours" if str(urgency).strip().lower() == "critical" else "Review soon",
                "reason": summary.get("followUpReason") or "",
            })

        actions = parse_json_field(suggested.get("actions"), [])
        for index, action in enumerate(actions):
            if not isinstance(action, dict):
                continue

            action_key = f"{student_unique_key}|{action.get('title') or ''}|{action.get('reason') or ''}"
            if action_key in seen_actions:
                continue

            seen_actions.add(action_key)

            suggested_actions.append({
                "id": f"{row.wellbeing_record_id}-{index}",
                "priority": map_urgency_to_priority(action.get("urgency")),
                "title": action.get("title") or "Suggested action",
                "description": action.get("reason") or "",
                "learnerName": learner_name,
                "learnerEmail": row_student_email,
                "coachName": row_coach_name,
                "coachEmail": row_coach_email,
                "timeline": action.get("suggestedTimeline") or "",
                "category": action.get("category") or "",
            })

        if last_survey_date:
            month_key = last_survey_date[:7]

            if month_key not in trend_buckets:
                trend_buckets[month_key] = {
                    "count": 0,
                    "risk_total": 0,
                    "red_count": 0,
                    "tickets": 0,
                }

            trend_buckets[month_key]["count"] += 1
            trend_buckets[month_key]["risk_total"] += risk_score
            trend_buckets[month_key]["tickets"] += open_tickets

            if risk_level == "red":
                trend_buckets[month_key]["red_count"] += 1

    learners.sort(
        key=lambda item: (
            0 if item.get("hasWellbeingData") else 1,
            str(item.get("studentName") or "").lower(),
        )
    )

    trends = []
    for month_key in sorted(trend_buckets.keys()):
        item = trend_buckets[month_key]
        count = item["count"] or 1

        trends.append({
            "month": month_key,
            "wellbeing": round(max(0, 10 - (item["risk_total"] / count / 10)), 1),
            "engagement": round(max(0, 10 - (item["red_count"] / count * 5)), 1),
            "providerSupport": round(max(0, 10 - (item["tickets"] / count * 2)), 1),
        })

    return Response({
        "summary": {
            "caseload": caseload,
            "atRisk": at_risk,
            "nonResponders": non_responders,
            "openTickets": open_tickets_total,
        },
        "learners": learners,
        "trends": trends,
        "followUps": follow_ups[:20],
        "suggestedActions": suggested_actions[:20],
    })