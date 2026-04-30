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

from .models import SafeguardingWellbeingAutomation, WellbeingSafeguardingMonitoringSystem, CoachData, SupportTicket


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

            # Ensure media root and evidence subdir exist
            evidence_dir = os.path.join(str(settings.MEDIA_ROOT), "evidence")
            try:
                os.makedirs(evidence_dir, exist_ok=True)
            except PermissionError as perm_err:
                return Response(
                    {
                        "detail": "Server storage not writable. Please contact the administrator.",
                        "hint": f"Run: sudo mkdir -p {evidence_dir} && sudo chown -R <web-user>:<web-user> {settings.MEDIA_ROOT}",
                        "error": str(perm_err),
                    },
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

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

def safe_dt_iso(value):
    if not value:
        return None
    try:
        return value.isoformat()
    except Exception:
        return str(value)


def map_db_risk_level(db_value):
    """Maps DB risk_level (High/Medium/Low) to frontend RiskLevel (red/amber/green)."""
    v = (db_value or "").strip().lower()
    if v == "high":
        return "red"
    if v == "medium":
        return "amber"
    if v == "low":
        return "green"
    return None


def compute_trend(history_json):
    """Returns dict with trend ('up'/'down'/'stable'), delta, and last 2 overall scores."""
    if not history_json:
        return {"trend": None, "delta": None}

    entries = history_json if isinstance(history_json, list) else []

    parsed = []
    for e in entries:
        if isinstance(e, str):
            try:
                e = json.loads(e)
            except Exception:
                continue
        if isinstance(e, dict):
            parsed.append(e)

    parsed.sort(key=lambda e: e.get("submitted_at") or e.get("date") or e.get("timestamp") or "")

    scores = []
    for e in parsed:
        s = e.get("scores") or {}
        overall = s.get("overall")
        if overall is not None:
            try:
                scores.append(round(float(overall), 2))
            except Exception:
                pass

    if len(scores) < 2:
        # First survey — no previous data to compare against
        return {"trend": None, "delta": None}

    delta = round(scores[-1] - scores[-2], 2)
    if delta > 0.3:
        trend = "up"
    elif delta < -0.3:
        trend = "down"
    else:
        trend = "stable"

    return {"trend": trend, "delta": delta}

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_support_ticket(request):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role not in ["coach", "qa"]:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    wellbeing_record_id = request.data.get("wellbeing_record_id") or request.data.get("studentId")
    wellbeing_record_id = str(wellbeing_record_id or "").strip()

    if not wellbeing_record_id:
        return Response(
            {"detail": "wellbeing_record_id is required"},
            status=status.HTTP_400_BAD_REQUEST
        )

    learner = (
        WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
        .filter(id=wellbeing_record_id)
        .first()
    )

    if not learner:
        return Response({"detail": "Learner not found"}, status=status.HTTP_404_NOT_FOUND)

    if role == "coach":
        request_coach_email = (getattr(user, "email", "") or "").strip().lower()
        learner_coach_email = (getattr(learner, "coach_email", "") or "").strip().lower()

        if not request_coach_email or request_coach_email != learner_coach_email:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    ticket_type = (request.data.get("ticket_type") or "wellbeing").strip().lower()
    if ticket_type not in ["wellbeing", "safeguarding"]:
        ticket_type = "wellbeing"

    subject = (request.data.get("subject") or "").strip()
    if not subject:
        return Response({"detail": "subject is required"}, status=status.HTTP_400_BAD_REQUEST)

    details = (request.data.get("details") or "").strip()

    urgency = (request.data.get("urgency") or "medium").strip().lower()
    if urgency not in ["low", "medium", "high", "urgent"]:
        urgency = "medium"

    preferred_contact = (request.data.get("preferred_contact") or "email").strip().lower()
    if preferred_contact not in ["email", "phone"]:
        preferred_contact = "email"

    # Custom incident date/time (optional — defaults to now)
    incident_date_str = (request.data.get("incident_date") or "").strip()
    incident_time_str = (request.data.get("incident_time") or "").strip()
    now = timezone.now()
    if incident_date_str:
        try:
            from datetime import date as _date, time as _time
            d = _date.fromisoformat(incident_date_str)
            t = _time.fromisoformat(incident_time_str) if incident_time_str else _time(0, 0)
            import datetime as _dt
            naive = _dt.datetime.combine(d, t)
            created_at = timezone.make_aware(naive) if timezone.is_naive(naive) else naive
        except (ValueError, TypeError):
            created_at = now
    else:
        created_at = now

    # Who created the ticket (frontend can send it; fallback to logged-in user email)
    created_by = (request.data.get("created_by") or "").strip()
    if not created_by:
        created_by = (getattr(request.user, "email", "") or getattr(request.user, "username", "") or "").strip()

    ticket = SupportTicket.objects.using("wellbeing").create(
        wellbeing_record_id=learner.id,
        ticket_type=ticket_type,
        full_name=(getattr(learner, "learner_name", "") or "").strip(),
        email=(getattr(learner, "learner_email", "") or "").strip(),
        subject=subject,
        details=details,
        urgency=urgency,
        preferred_contact=preferred_contact,
        status="open",
        created_at=created_at,
        updated_at=now,
        created_by=created_by,
    )

    return Response(
        {
            "id": ticket.id,
            "wellbeing_record_id": learner.id,
            "status": ticket.status,
            "message": "Support ticket created successfully",
        },
        status=status.HTTP_201_CREATED,
    )


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

    open_ticket_rows = list(
        SupportTicket.objects.using("wellbeing")
        .filter(status__iexact="open")
        .values("wellbeing_record_id", "email")
    )

    open_ticket_counts = Counter()

    for ticket in open_ticket_rows:
        record_id = str(ticket.get("wellbeing_record_id") or "").strip()
        if record_id:
            open_ticket_counts[record_id] += 1
            continue

        email_key = (ticket.get("email") or "").strip().lower()
        if email_key:
            open_ticket_counts[email_key] += 1

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

        row_open_tickets = open_ticket_counts.get(student_unique_key, 0)

        if not row_open_tickets and row_student_email:
            row_open_tickets = open_ticket_counts.get(row_student_email.strip().lower(), 0)

        open_tickets_total += row_open_tickets

        matched = latest_automation_by_learner_id.get(student_unique_key)

        if not matched:
            db_risk = map_db_risk_level(getattr(student_meta, "risk_level", None))
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
                "totalScore": getattr(student_meta, "total_score", None),
                "safeguardingScore": getattr(student_meta, "safeguarding_vulnerability_score", None),
                "riskLevel": db_risk or "green",
                "trend": None,
                "trendDelta": None,
                "recommendedAction": "No wellbeing data yet",
                "hasOpenTicket": row_open_tickets > 0,
                "openTicketCount": row_open_tickets,
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

        # Prefer DB risk_level; fall back to computed value from urgency
        db_risk = map_db_risk_level(getattr(student_meta, "risk_level", None))
        risk_level = db_risk or map_urgency_to_risk(urgency, safeguarding_flag=safeguarding_flag)

        wellbeing_score = getattr(student_meta, "emotional_stress_resilience_score", None)
        engagement_score = getattr(student_meta, "personal_wellbeing_protective_factors_score", None)
        provider_support_score = getattr(student_meta, "provider_culture_support_score", None)
        safeguarding_score = getattr(student_meta, "safeguarding_vulnerability_score", None)

        trend_data = compute_trend(getattr(student_meta, "history_json", None))

        caseload += 1

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
            "totalScore": getattr(student_meta, "total_score", None),
            "safeguardingScore": safeguarding_score,
            "trend": trend_data["trend"],
            "trendDelta": trend_data["delta"],
            "riskLevel": risk_level,
            "recommendedAction": summary.get("cardTitle") or "Follow up required",
            "hasOpenTicket": row_open_tickets > 0,
            "openTicketCount": row_open_tickets,
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
                    "red_count": 0,
                    "amber_count": 0,
                    "green_count": 0,
                    "risk_total": 0,
                    "tickets": 0,
                }

            trend_buckets[month_key]["count"] += 1
            trend_buckets[month_key]["risk_total"] += risk_score
            trend_buckets[month_key]["tickets"] += row_open_tickets

            if risk_level == "red":
                trend_buckets[month_key]["red_count"] += 1
            elif risk_level == "amber":
                trend_buckets[month_key]["amber_count"] += 1
            else:
                trend_buckets[month_key]["green_count"] += 1

    learners.sort(
        key=lambda item: (
            0 if item.get("hasWellbeingData") else 1,
            str(item.get("studentName") or "").lower(),
        )
    )

    trends = []
    for month_key in sorted(trend_buckets.keys()):
        item = trend_buckets[month_key]
        trends.append({
            "month": month_key,
            "total": item["count"],
            "red": item["red_count"],
            "amber": item["amber_count"],
            "green": item["green_count"],
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

@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_support_ticket(request, ticket_id):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role not in ["coach", "qa"]:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    ticket = SupportTicket.objects.using("wellbeing").filter(id=ticket_id).first()
    if not ticket:
        return Response({"detail": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

    if role == "coach":
        coach_email = (getattr(user, "email", "") or "").strip().lower()
        learner_ids = list(
            WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
            .filter(coach_email__iexact=coach_email)
            .values_list("id", flat=True)
        )
        if ticket.wellbeing_record_id not in learner_ids:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    valid_statuses = [
        "open", "new", "under review", "assigned", "awaiting information",
        "action in progress", "follow-up scheduled", "support plan active",
        "escalated", "external referral made", "outcome recorded",
        "closed", "reopened",
    ]
    new_status = (request.data.get("status") or "").strip().lower()

    if not new_status:
        return Response({"detail": "status is required"}, status=status.HTTP_400_BAD_REQUEST)

    if new_status not in valid_statuses:
        return Response(
            {"detail": f"Invalid status. Valid: {', '.join(valid_statuses)}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ticket.status = new_status
    ticket.updated_at = timezone.now()
    ticket.save(update_fields=["status", "updated_at"])

    return Response({"id": ticket.id, "status": ticket.status})


# get tickets
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_tickets_list(request):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role not in ["qa", "coach"]:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    selected_coach_email = ""

    if role == "coach":
        selected_coach_email = (getattr(user, "email", "") or "").strip().lower()
    else:
        selected_coach_email = (request.query_params.get("coach_email") or "").strip().lower()

    qs = SupportTicket.objects.using("wellbeing").all().order_by("-created_at", "-id")

    if selected_coach_email:
        learner_ids = list(
            WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
            .filter(coach_email__iexact=selected_coach_email)
            .values_list("id", flat=True)
        )

        qs = qs.filter(wellbeing_record_id__in=learner_ids)

    rows = list(qs)

    tickets = []
    total = 0
    open_count = 0
    red_risk = 0
    escalated = 0
    closed = 0

    for row in rows:
        urgency = (getattr(row, "urgency", "") or "").strip().lower()
        status_value = (getattr(row, "status", "") or "").strip().lower()
        ticket_type = (getattr(row, "ticket_type", "") or "").strip()

        risk = "green"
        if urgency in ["urgent", "high"]:
            risk = "red"
        elif urgency in ["medium", "moderate"]:
            risk = "amber"

        if status_value == "open":
            open_count += 1
        if status_value == "escalated":
            escalated += 1
        if status_value == "closed":
            closed += 1
        if risk == "red":
            red_risk += 1

        total += 1

        tickets.append({
            "id": row.id,
            "ticketCode": f"TKT-{row.id:03d}",
            "learnerName": (getattr(row, "full_name", "") or "").strip(),
            "learnerEmail": (getattr(row, "email", "") or "").strip(),
            "type": ticket_type or "Support",
            "risk": risk,
            "source": "Coach",
            "createdAt": safe_dt_iso(getattr(row, "created_at", None)),
            "createdBy": (getattr(row, "created_by", "") or "").strip(),
            "status": status_value or "open",
            "daysOpen": 0,
            "subject": (getattr(row, "subject", "") or "").strip(),
            "details": (getattr(row, "details", "") or "").strip(),
            "urgency": urgency or "medium",
            "preferredContact": (getattr(row, "preferred_contact", "") or "").strip(),
            "notes": _ensure_list(getattr(row, "notes", None)),
            "evidence": _ensure_list(getattr(row, "evidence", None)),
        })

    now = timezone.now().date()
    for item in tickets:
        created_at = item.get("createdAt")
        try:
            created_date = datetime.fromisoformat(created_at.replace("Z", "+00:00")).date() if created_at else now
        except Exception:
            created_date = now

        item["daysOpen"] = max((now - created_date).days, 0)

    return Response({
        "summary": {
            "total": total,
            "open": open_count,
            "redRisk": red_risk,
            "escalated": escalated,
            "closed": closed,
        },
        "tickets": tickets,
    })


def _check_ticket_access(request, ticket_id):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role not in ["coach", "qa"]:
        return None, Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    ticket = SupportTicket.objects.using("wellbeing").filter(id=ticket_id).first()
    if not ticket:
        return None, Response({"detail": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

    if role == "coach":
        coach_email = (getattr(user, "email", "") or "").strip().lower()
        learner_ids = list(
            WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
            .filter(coach_email__iexact=coach_email)
            .values_list("id", flat=True)
        )
        if ticket.wellbeing_record_id not in learner_ids:
            return None, Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    return ticket, None


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def ticket_notes(request, ticket_id):
    ticket, err = _check_ticket_access(request, ticket_id)
    if err:
        return err

    notes = _ensure_list(ticket.notes)

    if request.method == "GET":
        return Response(notes)

    note_text = (request.data.get("note") or "").strip()
    if not note_text:
        return Response({"detail": "note is required"}, status=status.HTTP_400_BAD_REQUEST)

    new_note = {
        "id": uuid.uuid4().hex,
        "note": note_text,
        "created_by": (getattr(request.user, "email", "") or "").strip(),
        "created_at": timezone.now().isoformat(),
    }
    notes.append(new_note)
    ticket.notes = notes
    ticket.updated_at = timezone.now()
    ticket.save(update_fields=["notes", "updated_at"])

    return Response(new_note, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def ticket_evidence(request, ticket_id):
    ticket, err = _check_ticket_access(request, ticket_id)
    if err:
        return err

    evidence = _ensure_list(ticket.evidence)

    if request.method == "GET":
        return Response(evidence)

    description = (request.data.get("description") or "").strip()
    file_url = (request.data.get("file_url") or "").strip()
    file_name = (request.data.get("file_name") or "").strip()

    new_ev = {
        "id": uuid.uuid4().hex,
        "description": description,
        "file_url": file_url,
        "file_name": file_name,
        "created_by": (getattr(request.user, "email", "") or "").strip(),
        "created_at": timezone.now().isoformat(),
    }
    evidence.append(new_ev)
    ticket.evidence = evidence
    ticket.updated_at = timezone.now()
    ticket.save(update_fields=["evidence", "updated_at"])

    return Response(new_ev, status=status.HTTP_201_CREATED)