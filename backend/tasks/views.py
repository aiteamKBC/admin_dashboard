from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.views import TokenObtainPairView
from .jwt_serializers import EmailOrUsernameTokenObtainPairSerializer

import uuid

# wellbeing
from datetime import datetime
from rest_framework.decorators import api_view, permission_classes
from django.db.models import Q

# to read the json 
import json
from collections import Counter

from .models import SafeguardingWellbeingAutomation, WellbeingSafeguardingMonitoringSystem, CoachData, SupportTicket, LearnerInclusivenessReport, SafeguardingQuestion
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


ALLOWED_EVIDENCE_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain", "text/csv",
}

class EvidenceUploadView(APIView):
    """
    POST /tasks-api/evidence/upload
    FormData:
      - file: image or document
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
            if content_type not in ALLOWED_EVIDENCE_TYPES:
                return Response(
                    {"detail": "File type not allowed. Supported: images, PDF, Word, Excel, PowerPoint, CSV, TXT."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

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


class TicketFileUploadView(APIView):
    """
    POST /tasks-api/tickets/<ticket_id>/upload-file/
    Learner-facing. Validates X-API-Key header.
    FormData: file (image or document)
    Saves to media/tickets/<ticket_id>/ and appends entry to ticket evidence JSON.
    """
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, ticket_id):
        api_key = request.headers.get("X-API-Key", "").strip()
        expected = (os.getenv("API_KEY") or "").strip()
        if not api_key or api_key != expected:
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "file is required"}, status=status.HTTP_400_BAD_REQUEST)

        content_type = str(getattr(f, "content_type", "") or "")
        if content_type not in ALLOWED_EVIDENCE_TYPES:
            return Response({"detail": "File type not allowed."}, status=status.HTTP_400_BAD_REQUEST)

        ticket = SupportTicket.objects.using("wellbeing").filter(id=ticket_id).first()
        if not ticket:
            return Response({"detail": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            ticket_dir = os.path.join(str(settings.MEDIA_ROOT), "tickets", str(ticket_id))
            os.makedirs(ticket_dir, exist_ok=True)

            original_name = get_valid_filename(os.path.basename(getattr(f, "name", "upload")))
            ext = os.path.splitext(original_name)[1]
            stored_name = f"{uuid.uuid4().hex}{ext}"
            relative_path = os.path.join("tickets", str(ticket_id), stored_name).replace("\\", "/")

            fs = FileSystemStorage(location=settings.MEDIA_ROOT, base_url=settings.MEDIA_URL)
            saved_path = fs.save(relative_path, f)
            file_url = fs.url(saved_path)
            file_size = f.size if hasattr(f, "size") else 0

            evidence_entry = {
                "id": uuid.uuid4().hex,
                "url": file_url,
                "filename": stored_name,
                "original_name": original_name,
                "mime_type": content_type,
                "size": file_size,
                "uploaded_by": "learner",
                "created_at": timezone.now().isoformat(),
            }

            evidence_list = _ensure_list(ticket.evidence)
            evidence_list.append(evidence_entry)
            ticket.evidence = evidence_list
            ticket.updated_at = timezone.now()
            ticket.save(update_fields=["evidence", "updated_at"])

            return Response(evidence_entry, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"detail": "Upload failed", "error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


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


CLOSED_TICKET_STATUSES = {"closed", "outcome recorded"}


def is_active_ticket_status(value):
    value = (value or "").strip().lower()
    return value not in CLOSED_TICKET_STATUSES


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


def _email_lookup_values(emails):
    values = set()
    for email in emails or []:
        cleaned = (email or "").strip()
        if not cleaned:
            continue
        values.add(cleaned)
        values.add(cleaned.lower())
    return sorted(values)


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


def derive_frontend_risk_level(total_score, safeguarding_score, trigger_count):
    total = _number_or_none(total_score) or 0
    safeguarding = _number_or_none(safeguarding_score) or 0
    triggers = int(trigger_count or 0)
    max_score = max(total, safeguarding)

    if triggers >= 5 or max_score >= 8:
        return "red"
    if triggers >= 1 or max_score >= 6:
        return "amber"
    return "green"


def derive_ticket_urgency(total_score, safeguarding_score, trigger_count):
    total = _number_or_none(total_score) or 0
    safeguarding = _number_or_none(safeguarding_score) or 0
    triggers = int(trigger_count or 0)
    max_score = max(total, safeguarding)

    if triggers >= 8 or max_score >= 8:
        return "urgent"
    if triggers >= 5:
        return "high"
    if triggers >= 1 or max_score >= 6:
        return "medium"
    return "low"


def risk_label_from_frontend(value):
    if value == "red":
        return "High"
    if value == "amber":
        return "Medium"
    return "Low"


def compute_trend(history_json, current_overall_score=None):
    """Returns dict with trend ('up'/'down'/'stable') and delta for overall risk score."""

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

    current_score = _number_or_none(current_overall_score)
    if current_score is not None and scores:
        # Some feeds keep the latest score in columns and previous scores in history_json.
        if abs(scores[-1] - current_score) > 0.001:
            scores.append(round(float(current_score), 2))

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


def latest_history_date(history_json):
    entries = history_json if isinstance(history_json, list) else []
    latest = None

    for entry in entries:
        if isinstance(entry, str):
            try:
                entry = json.loads(entry)
            except Exception:
                continue

        if not isinstance(entry, dict):
            continue

        item_date = safe_date(
            entry.get("submitted_at") or entry.get("date") or entry.get("timestamp")
        )
        if item_date and (latest is None or item_date > latest):
            latest = item_date

    return latest


def _number_or_none(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _compact_number(value):
    number = _number_or_none(value)
    if number is None:
        return value
    if number.is_integer():
        return int(number)
    return round(number, 2)


def _question_trigger_label(question):
    rule = (getattr(question, "trigger_rule", "") or "").strip().lower()
    if "low" in rule:
        return "low"
    if "high" in rule:
        return "high"
    return "low" if getattr(question, "is_reverse_scored", False) else "high"


def _trigger_reason_for_label(label):
    if label == "low":
        return "low answer on a positive question"
    return "high answer on a risk question"


SAME_DAY_SAFEGUARDING_CODES = {
    "i_feel_unsafe_at_the_moment",
    "i_need_urgent_support_right_now",
    "i_feel_pressured_by_someone_to_do_things_i_do_not_want_to_do",
    "someone_in_my_personal_life_makes_me_feel_controlled_or_afraid",
    "i_feel_physically_safe_in_my_workplace",
}

ACTIVE_SAFEGUARDING_CODES = SAME_DAY_SAFEGUARDING_CODES | {
    "i_believe_someone_may_be_taking_advantage_of_me",
    "i_have_experienced_bullying_at_work",
    "i_have_experienced_harassment_or_bullying_online",
    "i_have_felt_pressured_to_share_personal_information_or_images_online",
    "i_have_been_exposed_to_extremist_or_harmful_ideological_content_that_concerns_me",
}


def _trigger_code(item):
    return (
        item.get("code")
        or item.get("questionCode")
        or item.get("question_code")
        or ""
    ).strip()


def _trigger_risk_score(item):
    return _number_or_none(item.get("riskScore") or item.get("risk_score") or item.get("score"))


def _has_active_trigger_for_codes(triggered_questions, codes):
    for item in triggered_questions or []:
        if _trigger_code(item) in codes and (_trigger_risk_score(item) or 0) >= 8:
            return True
    return False


def derive_auto_ticket_context(learner, triggered_questions):
    triggered_questions = triggered_questions or []
    has_same_day_safeguarding = _has_active_trigger_for_codes(
        triggered_questions,
        SAME_DAY_SAFEGUARDING_CODES,
    )
    has_active_safeguarding = _has_active_trigger_for_codes(
        triggered_questions,
        ACTIVE_SAFEGUARDING_CODES,
    )
    high_trigger_count = sum(1 for item in triggered_questions if (_trigger_risk_score(item) or 0) >= 8)
    follow_up_count = sum(1 for item in triggered_questions if 6 <= (_trigger_risk_score(item) or 0) < 8)
    max_score = max(
        _number_or_none(getattr(learner, "total_score", None)) or 0,
        _number_or_none(getattr(learner, "safeguarding_vulnerability_score", None)) or 0,
    )

    if has_same_day_safeguarding:
        urgency = "urgent"
    elif has_active_safeguarding or high_trigger_count > 0 or max_score >= 8:
        urgency = "high"
    elif follow_up_count > 0 or max_score >= 6:
        urgency = "medium"
    else:
        urgency = "low"

    learner_name = (getattr(learner, "learner_name", "") or "learner").strip()
    if has_active_safeguarding:
        ticket_type = "safeguarding"
        subject = f"[AUTO] Safeguarding follow-up flagged - {learner_name}"
    else:
        ticket_type = "wellbeing"
        subject = f"[AUTO] Wellbeing and engagement follow-up - {learner_name}"

    return {
        "ticket_type": ticket_type,
        "urgency": urgency,
        "subject": subject,
        "has_active_safeguarding": has_active_safeguarding,
        "has_same_day_safeguarding": has_same_day_safeguarding,
    }


def _risk_score_from_answer(answer, question):
    raw_score = _number_or_none(answer.get("raw_answer"))
    if raw_score is None:
        raw_score = _number_or_none(answer.get("score"))
    if raw_score is None:
        raw_score = _number_or_none(answer.get("answer"))

    if raw_score is not None:
        if question is not None:
            min_score = _number_or_none(getattr(question, "min_score", None))
            max_score = _number_or_none(getattr(question, "max_score", None))
            is_reverse_scored = getattr(question, "is_reverse_scored", False)
        else:
            min_score = _number_or_none(answer.get("min_score"))
            max_score = _number_or_none(answer.get("max_score"))
            is_reverse_scored = answer.get("is_reverse_scored") is True

        if min_score is None:
            min_score = 1
        if max_score is None:
            max_score = 10

        if is_reverse_scored:
            return max_score + min_score - raw_score
        return raw_score

    normalised_score = _number_or_none(
        answer.get("normalized_score")
        if answer.get("normalized_score") is not None
        else answer.get("risk_score")
    )
    if normalised_score is not None:
        return normalised_score

    return raw_score


def _active_question_map():
    questions = SafeguardingQuestion.objects.using("wellbeing").exclude(is_active=False)
    return {int(q.id): q for q in questions}


def compute_true_triggered_questions_from_submission(submission_json, question_map=None):
    if not submission_json:
        return []

    data = submission_json
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return []

    if not isinstance(data, dict):
        return []

    answers = data.get("answers")
    if not isinstance(answers, list):
        return []

    if question_map is None:
        question_map = _active_question_map()

    result = []
    for answer in answers:
        if not isinstance(answer, dict):
            continue

        try:
            question_id = int(answer.get("question_id"))
        except (TypeError, ValueError):
            continue

        question = question_map.get(question_id)
        if not question or not getattr(question, "is_trigger", False):
            continue

        risk_score = _risk_score_from_answer(answer, question)
        if risk_score is None or risk_score < 6:
            continue

        raw_score = (
            answer.get("raw_answer")
            if answer.get("raw_answer") is not None
            else answer.get("score")
        )
        text = (
            answer.get("question_text")
            or getattr(question, "question_text", "")
            or answer.get("question")
            or answer.get("text")
            or ""
        ).strip()
        if not text:
            continue

        label = _question_trigger_label(question)
        reason = _trigger_reason_for_label(label)
        result.append({
            "questionId": question_id,
            "code": answer.get("question_code") or getattr(question, "question_code", "") or "",
            "text": text,
            "score": _compact_number(raw_score),
            "answer": _compact_number(raw_score),
            "riskScore": _compact_number(risk_score),
            "level": label,
            "note": (answer.get("trigger_note") or "").strip() or reason,
            "sortKey": (
                getattr(question, "category_no", None) or 999,
                getattr(question, "question_order", None) or 999,
                question_id,
            ),
        })

    result.sort(key=lambda item: item["sortKey"])
    for item in result:
        item.pop("sortKey", None)
    return result


def extract_survey_responses_for_report(submission_json, question_map=None):
    if not submission_json:
        return []

    data = submission_json
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return []

    if not isinstance(data, dict):
        return []

    answers = data.get("answers")
    if not isinstance(answers, list):
        current_result = data.get("current_result")
        if isinstance(current_result, dict):
            answers = current_result.get("responses")

    if not isinstance(answers, list):
        return []

    if question_map is None:
        question_map = _active_question_map()

    responses = []

    for answer in answers:
        if isinstance(answer, str):
            try:
                answer = json.loads(answer)
            except Exception:
                continue

        if not isinstance(answer, dict):
            continue

        raw_score = (
            answer.get("raw_answer")
            if answer.get("raw_answer") is not None
            else answer.get("score")
        )
        question = None
        try:
            question_id = int(answer.get("question_id"))
            question = question_map.get(question_id)
        except (TypeError, ValueError):
            question = None

        risk_score = _risk_score_from_answer(answer, question)

        if risk_score is None:
            concern_level = ""
        elif risk_score >= 8:
            concern_level = "High"
        elif risk_score >= 6:
            concern_level = "Follow-up"
        else:
            concern_level = "Low"

        question_text = (
            answer.get("question_text")
            or answer.get("question")
            or answer.get("text")
            or answer.get("question_code")
            or ""
        ).strip()

        if not question_text and raw_score is None and risk_score is None:
            continue

        responses.append({
            "questionCode": answer.get("question_code") or answer.get("questionCode") or "",
            "questionText": question_text,
            "categoryName": answer.get("category_name") or answer.get("categoryName") or "",
            "constructType": answer.get("construct_type") or answer.get("constructType") or "",
            "answer": _compact_number(raw_score),
            "concernLevel": concern_level,
        })

    return responses


def format_trigger_detail_line(item):
    answer = item.get("answer", item.get("score"))
    risk_score = item.get("riskScore")
    level = item.get("level") or "high"
    reason = (item.get("note") or _trigger_reason_for_label(level)).strip()

    if level == "low" and answer is not None and risk_score is not None and answer != risk_score:
        score_text = f"(Answer: {_compact_number(answer)} -> Risk: {_compact_number(risk_score)} - {reason})"
    elif answer is not None and risk_score is not None:
        score_text = f"(Answer: {_compact_number(answer)}, Risk: {_compact_number(risk_score)} - {reason})"
    elif answer is not None:
        score_text = f"(Answer: {_compact_number(answer)} - {reason})"
    else:
        score_text = ""

    return f"{item.get('text', '').strip()} {score_text} [{level}]".strip()


def build_auto_ticket_details_from_monitoring(learner, triggered_questions):
    trigger_count = len(triggered_questions)
    risk_label = risk_label_from_frontend(
        derive_frontend_risk_level(
            getattr(learner, "total_score", None),
            getattr(learner, "safeguarding_vulnerability_score", None),
            trigger_count,
        )
    )
    programme = (getattr(learner, "programme", "") or "").strip() or "-"
    coach = (getattr(learner, "coach_name", "") or "").strip() or "-"
    total_score = _compact_number(getattr(learner, "total_score", None))
    if total_score is None:
        total_score = "-"

    lines = [
        "Auto-generated ticket from wellbeing survey.",
        "",
        f"Risk Level:    {risk_label}",
        f"Total Score:   {total_score}",
        f"Trigger Count: {trigger_count}",
        f"Programme:     {programme}",
        f"Coach:         {coach}",
    ]

    if triggered_questions:
        lines.extend(["", "Triggered Questions:"])
        lines.extend(format_trigger_detail_line(item) for item in triggered_questions)

    return "\n".join(lines)


def extract_triggered_questions(triggered_questions_json):
    """
    Parse triggered_questions column (dict keyed by risk level, e.g. {"high": [...], "medium": [...]}).
    Returns list of {text, score, level} dicts sorted high → medium → low.
    """
    if not triggered_questions_json:
        return []

    data = triggered_questions_json
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except Exception:
            return []

    if not isinstance(data, dict):
        return []

    level_order = {"high": 0, "medium": 1, "low": 2}
    result = []

    for level, questions in data.items():
        if not isinstance(questions, list):
            continue
        for q in questions:
            if not isinstance(q, dict):
                continue
            text = (
                q.get("question_text")
                or q.get("question")
                or q.get("text")
                or q.get("label")
                or ""
            ).strip()
            if not text:
                continue
            score = q.get("normalized_score")
            result.append({
                "text": text,
                "score": score,
                "level": level.lower(),
                "note": (q.get("trigger_note") or "").strip(),
            })

    result.sort(key=lambda x: (level_order.get(x["level"], 9), -(x["score"] or 0)))
    return result


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

    # Who created the ticket (frontend can send it; fallback to logged-in user name)
    created_by = (request.data.get("created_by") or "").strip()
    if not created_by:
        first = (getattr(request.user, "first_name", "") or "").strip()
        last  = (getattr(request.user, "last_name",  "") or "").strip()
        full_name = f"{first} {last}".strip()
        created_by = (
            full_name
            or (getattr(request.user, "username", "") or "").strip()
            or (getattr(request.user, "email", "") or "").strip()
        )

    # Encode source/role into created_by using "||" separator: "Name||Role"
    # Source column in frontend splits on "||" to display role; Created By shows the name part
    creator_role = (request.data.get("creator_role") or "").strip()
    if role == "coach" and not creator_role:
        creator_role = "Coach"
    elif not creator_role:
        creator_role = "QA"

    created_by_encoded = f"{created_by}||{creator_role}" if created_by else f"||{creator_role}"

    days_to_close_raw = request.data.get("days_to_close")
    try:
        days_to_close = int(days_to_close_raw) if days_to_close_raw is not None and str(days_to_close_raw).strip() != "" else None
    except (ValueError, TypeError):
        days_to_close = None

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
        created_by=created_by_encoded,
        days_to_close=days_to_close,
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

    else:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    monitoring_qs = WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing").only(
        "id",
        "learner_name",
        "learner_email",
        "coach_name",
        "coach_email",
        "programme",
        "risk_level",
        "history_json",
        "total_score",
        "emotional_stress_resilience_score",
        "personal_wellbeing_protective_factors_score",
        "provider_culture_support_score",
        "safeguarding_vulnerability_score",
        "submission_json",
        "triggered_questions",
        "trigger_count",
    )

    if requested_coach_email:
        monitoring_qs = monitoring_qs.filter(coach_email__iexact=requested_coach_email)

    monitoring_rows = list(monitoring_qs.order_by("learner_name", "id"))
    monitoring_ids = [row.id for row in monitoring_rows]
    monitoring_emails = [
        (getattr(row, "learner_email", "") or "").strip()
        for row in monitoring_rows
        if (getattr(row, "learner_email", "") or "").strip()
    ]

    automation_qs = SafeguardingWellbeingAutomation.objects.using("wellbeing").only(
        "wellbeing_record_id",
        "follow_up_by_coach",
        "suggested_coach_actions",
        "apprentice_dashboard",
        "updated_at",
    )
    if monitoring_ids:
        automation_qs = automation_qs.filter(wellbeing_record_id__in=monitoring_ids)
    else:
        automation_qs = automation_qs.none()

    automation_rows = list(automation_qs.order_by("-updated_at", "-wellbeing_record_id"))

    latest_automation_by_learner_id = {}

    ticket_qs = SupportTicket.objects.using("wellbeing").all()
    ticket_filter = Q()
    if monitoring_ids:
        ticket_filter |= Q(wellbeing_record_id__in=monitoring_ids)
    monitoring_email_values = _email_lookup_values(monitoring_emails)
    if monitoring_email_values:
        ticket_filter |= Q(email__in=monitoring_email_values)
    ticket_qs = ticket_qs.filter(ticket_filter) if ticket_filter else ticket_qs.none()

    open_ticket_rows = list(ticket_qs.values("wellbeing_record_id", "email", "status"))

    open_ticket_counts = Counter()

    for ticket in open_ticket_rows:
        if not is_active_ticket_status(ticket.get("status")):
            continue

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

        learner_id = extract_learner_id(follow, suggested, apprentice) or str(
            getattr(row, "wellbeing_record_id", "") or ""
        ).strip()
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

    question_map = _active_question_map()

    learners = []
    follow_ups = []
    suggested_actions = []

    caseload = 0
    at_risk = 0
    green_risk = 0
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
        stored_risk = map_db_risk_level(getattr(student_meta, "risk_level", None))
        history_raw = getattr(student_meta, "history_json", None) or []
        last_monitoring_survey_date = latest_history_date(history_raw)
        trend_data = compute_trend(history_raw, getattr(student_meta, "total_score", None))
        wellbeing_score = getattr(student_meta, "emotional_stress_resilience_score", None)
        engagement_score = getattr(student_meta, "personal_wellbeing_protective_factors_score", None)
        provider_support_score = getattr(student_meta, "provider_culture_support_score", None)
        safeguarding_score = getattr(student_meta, "safeguarding_vulnerability_score", None)
        total_score = getattr(student_meta, "total_score", None)
        submission_json_raw = getattr(student_meta, "submission_json", None)
        survey_responses = extract_survey_responses_for_report(submission_json_raw, question_map)
        triggered_questions = compute_true_triggered_questions_from_submission(
            submission_json_raw,
            question_map,
        )
        if submission_json_raw:
            trigger_count = len(triggered_questions)
        else:
            triggered_questions = extract_triggered_questions(getattr(student_meta, "triggered_questions", None))
            trigger_count = getattr(student_meta, "trigger_count", None) or len(triggered_questions)
        has_score_data = any(
            value is not None
            for value in [
                total_score,
                wellbeing_score,
                engagement_score,
                provider_support_score,
                safeguarding_score,
            ]
        ) or trigger_count > 0 or bool(triggered_questions)
        db_risk = derive_frontend_risk_level(total_score, safeguarding_score, trigger_count) if has_score_data else stored_risk
        has_monitoring_data = has_score_data or db_risk is not None or bool(history_raw)

        caseload += 1

        if db_risk == "red":
            at_risk += 1
        elif db_risk == "green":
            green_risk += 1

        if not matched:
            if last_monitoring_survey_date is None:
                non_responders += 1

            learners.append({
                "studentId": int(student_meta.id),
                "studentName": row_student_name,
                "studentEmail": row_student_email,
                "coachName": row_coach_name,
                "coachEmail": row_coach_email,
                "programme": row_programme,
                "lastSurveyDate": last_monitoring_survey_date,
                "wellbeingScore": wellbeing_score,
                "engagementScore": engagement_score,
                "providerSupportScore": provider_support_score,
                "totalScore": total_score,
                "safeguardingScore": safeguarding_score,
                "riskLevel": db_risk or "green",
                "trend": trend_data["trend"],
                "trendDelta": trend_data["delta"],
                "recommendedAction": (
                    "Immediate safeguarding review required" if db_risk == "red"
                    else "Wellbeing follow-up recommended" if db_risk == "amber"
                    else "Routine monitoring" if has_monitoring_data
                    else "No wellbeing data yet"
                ),
                "hasOpenTicket": row_open_tickets > 0,
                "openTicketCount": row_open_tickets,
                "nonResponder": last_monitoring_survey_date is None,
                "followUpReason": "",
                "safeguardingFlag": False,
                "flaggedDomains": [],
                "hasWellbeingData": has_monitoring_data,
                "countedInSummary": has_monitoring_data,
                "triggerCount": trigger_count,
                "triggeredQuestions": triggered_questions,
                "surveyResponses": survey_responses,
                "apprenticeDashboard": {},
            })

            if last_monitoring_survey_date:
                mk = last_monitoring_survey_date[:7]
                if mk not in trend_buckets:
                    trend_buckets[mk] = {
                        "count": 0, "red_count": 0,
                        "amber_count": 0, "green_count": 0,
                    }

                trend_buckets[mk]["count"] += 1
                if db_risk == "red":
                    trend_buckets[mk]["red_count"] += 1
                elif db_risk == "amber":
                    trend_buckets[mk]["amber_count"] += 1
                elif db_risk == "green":
                    trend_buckets[mk]["green_count"] += 1

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
        risk_level = db_risk or map_urgency_to_risk(urgency, safeguarding_flag=safeguarding_flag)

        if risk_level == "red":
            if db_risk is None:
                at_risk += 1
        elif risk_level == "green":
            if db_risk is None:
                green_risk += 1

        if last_survey_date is None and last_monitoring_survey_date is not None:
            last_survey_date = last_monitoring_survey_date

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
            "totalScore": total_score,
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
            "triggerCount": trigger_count,
            "triggeredQuestions": triggered_questions,
            "surveyResponses": survey_responses,
            "apprenticeDashboard": apprentice or {},
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
        valid_actions = [a for a in actions if isinstance(a, dict)]
        if valid_actions and student_unique_key not in seen_actions:
            seen_actions.add(student_unique_key)
            top_urgency = (suggested.get("urgency") or follow.get("urgency") or urgency or "").strip().lower()
            suggested_actions.append({
                "id": str(row.wellbeing_record_id),
                "urgency": top_urgency,
                "priority": map_urgency_to_priority(top_urgency),
                "learnerName": learner_name,
                "learnerEmail": row_student_email,
                "coachName": row_coach_name,
                "coachEmail": row_coach_email,
                "actions": [
                    {
                        "id": a.get("id") or f"{row.wellbeing_record_id}-{i}",
                        "title": a.get("title") or a.get("bulletTitle") or "Action",
                        "description": a.get("reason") or a.get("bulletText") or "",
                        "priority": map_urgency_to_priority(a.get("urgency") or a.get("priority") or top_urgency),
                        "actionType": a.get("actionType") or "",
                        "recommendedOwner": a.get("recommendedOwner") or "",
                        "timeline": a.get("suggestedTimeline") or "",
                        "category": a.get("category") or a.get("actionType") or "",
                    }
                    for i, a in enumerate(valid_actions)
                ],
            })

        # Build per-month buckets from history_json (one entry per student per month)
        history_raw = getattr(student_meta, "history_json", None) or []
        history_entries = history_raw if isinstance(history_raw, list) else []

        parsed_history = []
        for e in history_entries:
            if isinstance(e, str):
                try:
                    e = json.loads(e)
                except Exception:
                    continue
            if isinstance(e, dict):
                parsed_history.append(e)

        if parsed_history:
            # Group by month, keep latest entry per month to avoid duplicates
            month_entries: dict = {}
            for entry in parsed_history:
                entry_date = safe_date(
                    entry.get("submitted_at") or entry.get("date") or entry.get("timestamp")
                )
                if not entry_date:
                    continue
                mk = entry_date[:7]
                existing = month_entries.get(mk)
                existing_date = safe_date(
                    (existing or {}).get("submitted_at") or
                    (existing or {}).get("date") or
                    (existing or {}).get("timestamp")
                ) if existing else ""
                if not existing or entry_date > (existing_date or ""):
                    month_entries[mk] = entry

            for mk, entry in month_entries.items():
                entry_risk = (
                    map_db_risk_level(entry.get("risk_level"))
                    or map_urgency_to_risk(entry.get("urgency") or "", safeguarding_flag=False)
                    or risk_level
                )

                if mk not in trend_buckets:
                    trend_buckets[mk] = {
                        "count": 0, "red_count": 0,
                        "amber_count": 0, "green_count": 0,
                    }

                trend_buckets[mk]["count"] += 1
                if entry_risk == "red":
                    trend_buckets[mk]["red_count"] += 1
                elif entry_risk == "amber":
                    trend_buckets[mk]["amber_count"] += 1
                else:
                    trend_buckets[mk]["green_count"] += 1

        elif last_survey_date:
            # Fallback: no history — use last known survey date + current risk
            mk = last_survey_date[:7]
            if mk not in trend_buckets:
                trend_buckets[mk] = {
                    "count": 0, "red_count": 0,
                    "amber_count": 0, "green_count": 0,
                }
            trend_buckets[mk]["count"] += 1
            if risk_level == "red":
                trend_buckets[mk]["red_count"] += 1
            elif risk_level == "amber":
                trend_buckets[mk]["amber_count"] += 1
            else:
                trend_buckets[mk]["green_count"] += 1

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
            "greenRisk": green_risk,
            "nonResponders": non_responders,
            "openTickets": open_tickets_total,
        },
        "learners": learners,
        "trends": trends,
        "followUps": follow_ups[:20],
        "suggestedActions": suggested_actions[:20],
    })

@api_view(["PATCH", "DELETE"])
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

    if request.method == "DELETE":
        if role != "qa":
            return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)
        ticket.delete(using="wellbeing")
        return Response({"detail": "Ticket deleted"}, status=status.HTTP_204_NO_CONTENT)

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
    valid_urgencies = ["low", "medium", "high", "urgent"]
    valid_ticket_types = ["wellbeing", "safeguarding"]
    valid_contacts = ["email", "phone"]

    update_fields = []
    response_data = {"id": ticket.id}

    CLOSED_STATUSES = {"closed", "outcome recorded"}

    new_status = (request.data.get("status") or "").strip().lower()
    if new_status:
        if new_status not in valid_statuses:
            return Response(
                {"detail": f"Invalid status. Valid: {', '.join(valid_statuses)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        ticket.status = new_status
        update_fields.append("status")
        response_data["status"] = new_status

        # Auto-compute days_to_close when ticket is closed for the first time
        if new_status in CLOSED_STATUSES and ticket.days_to_close is None:
            created = ticket.created_at
            if created:
                delta = (timezone.now() - created).days
                ticket.days_to_close = max(delta, 0)
                update_fields.append("days_to_close")
                response_data["daysToClose"] = ticket.days_to_close

    new_urgency = (request.data.get("urgency") or "").strip().lower()
    if new_urgency:
        if new_urgency not in valid_urgencies:
            return Response({"detail": f"Invalid urgency."}, status=status.HTTP_400_BAD_REQUEST)
        ticket.urgency = new_urgency
        update_fields.append("urgency")
        response_data["urgency"] = new_urgency

    new_subject = (request.data.get("subject") or "").strip()
    if new_subject:
        ticket.subject = new_subject
        update_fields.append("subject")
        response_data["subject"] = new_subject

    new_details = request.data.get("details")
    if new_details is not None:
        ticket.details = new_details.strip()
        update_fields.append("details")
        response_data["details"] = ticket.details

    new_ticket_type = (request.data.get("ticket_type") or "").strip().lower()
    if new_ticket_type:
        if new_ticket_type not in valid_ticket_types:
            return Response({"detail": "Invalid ticket_type."}, status=status.HTTP_400_BAD_REQUEST)
        ticket.ticket_type = new_ticket_type
        update_fields.append("ticket_type")
        response_data["ticket_type"] = new_ticket_type

    new_preferred_contact = (request.data.get("preferred_contact") or "").strip().lower()
    if new_preferred_contact:
        if new_preferred_contact not in valid_contacts:
            return Response({"detail": "Invalid preferred_contact."}, status=status.HTTP_400_BAD_REQUEST)
        ticket.preferred_contact = new_preferred_contact
        update_fields.append("preferred_contact")
        response_data["preferred_contact"] = new_preferred_contact

    if not update_fields:
        return Response({"detail": "No valid fields to update."}, status=status.HTTP_400_BAD_REQUEST)

    ticket.updated_at = timezone.now()
    update_fields.append("updated_at")
    ticket.save(update_fields=update_fields)

    return Response(response_data)


# get tickets
@api_view(["GET"])
@permission_classes([IsAuthenticated])
def support_tickets_list(request):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role not in ["qa", "coach"]:
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    qs = SupportTicket.objects.using("wellbeing").all().order_by("-created_at", "-id")

    if role == "coach":
        # Coaches only see tickets for their own learners
        coach_email = (getattr(user, "email", "") or "").strip().lower()
        if coach_email:
            learner_qs = WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing").filter(
                coach_email__iexact=coach_email
            )
            learner_ids = list(learner_qs.values_list("id", flat=True))
            learner_emails = [
                (email or "").strip()
                for email in learner_qs.values_list("learner_email", flat=True)
                if (email or "").strip()
            ]
            ticket_filter = Q()
            if learner_ids:
                ticket_filter |= Q(wellbeing_record_id__in=learner_ids)
            learner_email_values = _email_lookup_values(learner_emails)
            if learner_email_values:
                ticket_filter |= Q(email__in=learner_email_values)
            qs = qs.filter(ticket_filter) if ticket_filter else qs.none()
    else:
        # QA sees all tickets (admin-level). Optional filter by coach_email from query params.
        coach_email_filter = (request.query_params.get("coach_email") or "").strip().lower()
        if coach_email_filter:
            learner_qs = WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing").filter(
                coach_email__iexact=coach_email_filter
            )
            learner_ids = list(learner_qs.values_list("id", flat=True))
            learner_emails = [
                (email or "").strip()
                for email in learner_qs.values_list("learner_email", flat=True)
                if (email or "").strip()
            ]
            ticket_filter = Q()
            if learner_ids:
                ticket_filter |= Q(wellbeing_record_id__in=learner_ids)
            learner_email_values = _email_lookup_values(learner_emails)
            if learner_email_values:
                ticket_filter |= Q(email__in=learner_email_values)
            qs = qs.filter(ticket_filter) if ticket_filter else qs.none()

    rows = list(qs)
    ticket_record_ids = [
        row.wellbeing_record_id
        for row in rows
        if getattr(row, "wellbeing_record_id", None)
    ]
    ticket_emails = [
        (getattr(row, "email", "") or "").strip()
        for row in rows
        if (getattr(row, "email", "") or "").strip()
    ]
    monitoring_filter = Q()
    if ticket_record_ids:
        monitoring_filter |= Q(id__in=ticket_record_ids)
    ticket_email_values = _email_lookup_values(ticket_emails)
    if ticket_email_values:
        monitoring_filter |= Q(learner_email__in=ticket_email_values)
    monitoring_records = (
        list(
            WellbeingSafeguardingMonitoringSystem.objects.using("wellbeing")
            .filter(monitoring_filter)
            .order_by("-id")
        )
        if monitoring_filter
        else []
    )
    monitoring_by_id = {item.id: item for item in monitoring_records}
    monitoring_by_email = {}
    for item in monitoring_records:
        email = (getattr(item, "learner_email", "") or "").strip().lower()
        if email and email not in monitoring_by_email:
            monitoring_by_email[email] = item
    question_map = _active_question_map() if monitoring_records else {}

    tickets = []
    total = 0
    open_count = 0
    red_risk = 0
    escalated = 0
    closed = 0
    computed_triggers_by_record_id = {}

    for row in rows:
        learner_record = monitoring_by_id.get(getattr(row, "wellbeing_record_id", None))
        if not learner_record:
            learner_record = monitoring_by_email.get((getattr(row, "email", "") or "").strip().lower())
        computed_triggered_questions = []
        if learner_record:
            learner_cache_key = getattr(learner_record, "id", None)
            if learner_cache_key in computed_triggers_by_record_id:
                computed_triggered_questions = computed_triggers_by_record_id[learner_cache_key]
            else:
                computed_triggered_questions = compute_true_triggered_questions_from_submission(
                    getattr(learner_record, "submission_json", None),
                    question_map,
                )
                computed_triggers_by_record_id[learner_cache_key] = computed_triggered_questions

        urgency = (getattr(row, "urgency", "") or "").strip().lower()
        ticket_type = (getattr(row, "ticket_type", "") or "").strip()
        subject = (getattr(row, "subject", "") or "").strip()
        is_auto_wellbeing_ticket = (
            learner_record
            and (getattr(row, "details", "") or "").strip().startswith("Auto-generated ticket from wellbeing survey.")
        )
        if is_auto_wellbeing_ticket:
            ticket_context = derive_auto_ticket_context(learner_record, computed_triggered_questions)
            urgency = ticket_context["urgency"]
            ticket_type = ticket_context["ticket_type"]
            subject = ticket_context["subject"]
        status_value = (getattr(row, "status", "") or "").strip().lower()

        risk = "green"
        if urgency in ["urgent", "high"]:
            risk = "red"
        elif urgency in ["medium", "moderate"]:
            risk = "amber"

        if is_active_ticket_status(status_value):
            open_count += 1
        if status_value == "escalated":
            escalated += 1
        if status_value in CLOSED_TICKET_STATUSES:
            closed += 1
        if risk == "red":
            red_risk += 1

        total += 1

        # Decode "Name||Role" from created_by field
        raw_created_by = (getattr(row, "created_by", "") or "").strip()
        submitted_by = (getattr(row, "submitted_by", "") or "").strip()
        learner_full_name = (getattr(row, "full_name", "") or "").strip()

        if not raw_created_by and submitted_by:
            # Ticket submitted by the learner themselves — created_by is empty
            display_source = submitted_by.capitalize()
            display_created_by = learner_full_name or submitted_by.capitalize()
        elif raw_created_by.lower() in ("system", "automatic"):
            display_created_by = raw_created_by.capitalize()
            display_source = "System"
        elif "||" in raw_created_by:
            cb_parts = raw_created_by.split("||", 1)
            name_part = cb_parts[0].strip()
            role_part = cb_parts[1].strip() if len(cb_parts) > 1 else "Coach"
            # If stored name is an email, show just the local part formatted as a name
            if "@" in name_part:
                name_part = name_part.split("@")[0].replace(".", " ").replace("_", " ").title()
            display_created_by = name_part or "-"
            display_source = role_part or "Coach"
        else:
            name_part = raw_created_by
            if "@" in name_part:
                name_part = name_part.split("@")[0].replace(".", " ").replace("_", " ").title()
            display_created_by = name_part or "-"
            display_source = "Coach" if name_part else "-"

        details = (getattr(row, "details", "") or "").strip()
        if is_auto_wellbeing_ticket and details.startswith("Auto-generated ticket from wellbeing survey."):
            details = build_auto_ticket_details_from_monitoring(
                learner_record,
                computed_triggered_questions,
            )

        tickets.append({
            "id": row.id,
            "ticketCode": f"TKT-{row.id:03d}",
            "learnerName": (getattr(row, "full_name", "") or "").strip(),
            "learnerEmail": (getattr(row, "email", "") or "").strip(),
            "type": ticket_type or "Support",
            "risk": risk,
            "createdAt": safe_dt_iso(getattr(row, "created_at", None)),
            "createdBy": display_created_by,
            "source": display_source,
            "status": status_value or "open",
            "daysOpen": 0,
            "daysToClose": getattr(row, "days_to_close", None),
            "closedAt": safe_dt_iso(getattr(row, "updated_at", None)) if status_value in {"closed", "outcome recorded"} else None,
            "subject": subject,
            "details": details,
            "urgency": urgency or "medium",
            "preferredContact": (getattr(row, "preferred_contact", "") or "").strip(),
            "notes": _ensure_list(getattr(row, "notes", None)),
            "evidence": _ensure_list(getattr(row, "evidence", None)),
        })

    now_dt = timezone.now()
    now = now_dt.date()

    cur_month = now_dt.month
    cur_year  = now_dt.year
    last_month      = cur_month - 1 if cur_month > 1 else 12
    last_month_year = cur_year if cur_month > 1 else cur_year - 1

    # AVG CLOSE TIME: days from created_at to close, per month bucket
    # all_close_vals  — every closed ticket (for overall avg shown on card)
    # close_buckets   — grouped by month (for delta: this month vs last month)
    all_close_vals = []
    close_buckets  = {}   # {YYYY-MM: [days, ...]}

    CLOSED_STATUSES = {"closed", "outcome recorded"}

    for item in tickets:
        created_at_str = item.get("createdAt")
        try:
            created_date = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")).date() if created_at_str else now
        except Exception:
            created_date = now

        status_val = (item.get("status") or "").strip().lower()
        if status_val in CLOSED_STATUSES:
            # Freeze days counter: prefer days_to_close, then updated_at-created_at, never today
            frozen = item.get("daysToClose")
            if frozen is None:
                closed_at_str = item.get("closedAt")
                if closed_at_str:
                    try:
                        closed_date = datetime.fromisoformat(closed_at_str.replace("Z", "+00:00")).date()
                        frozen = max((closed_date - created_date).days, 0)
                    except Exception:
                        frozen = 0
                else:
                    frozen = 0
            item["daysOpen"] = frozen
        else:
            item["daysOpen"] = max((now - created_date).days, 0)

        if status_val not in CLOSED_STATUSES:
            continue

        # Prefer explicit days_to_close field; fall back to updated_at - created_at
        dtc = item.get("daysToClose")
        if dtc is not None and dtc >= 0:
            close_val = dtc
        else:
            raw_row = rows[tickets.index(item)] if item in tickets else None
            updated_at_raw = getattr(raw_row, "updated_at", None) if raw_row else None
            if updated_at_raw:
                try:
                    updated_date = updated_at_raw.date() if hasattr(updated_at_raw, "date") else \
                        datetime.fromisoformat(str(updated_at_raw).replace("Z", "+00:00")).date()
                    close_val = max((updated_date - created_date).days, 0)
                except Exception:
                    close_val = None
            else:
                close_val = None

        if close_val is None:
            continue

        all_close_vals.append(close_val)
        mk = f"{created_date.year}-{created_date.month:02d}"
        close_buckets.setdefault(mk, []).append(close_val)

    def _avg_list(vals):
        return round(sum(vals) / len(vals), 1) if vals else None

    def _avg_bucket(bucket, year, month):
        key = f"{year}-{month:02d}"
        vals = bucket.get(key, [])
        return round(sum(vals) / len(vals), 1) if vals else None

    def _delta(cur, last):
        if cur is None or last is None:
            return None
        return round(cur - last, 1)

    avg_close_all  = _avg_list(all_close_vals)
    avg_close_cur  = _avg_bucket(close_buckets, cur_year,        cur_month)
    avg_close_last = _avg_bucket(close_buckets, last_month_year, last_month)

    return Response({
        "summary": {
            "total":         total,
            "open":          open_count,
            "redRisk":       red_risk,
            "escalated":     escalated,
            "closed":        closed,
            "avgCloseDays":  avg_close_all,
            "avgCloseDelta": _delta(avg_close_cur, avg_close_last),
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


def _parse_json_field(value):
    """Safely parse a JSON field that may be a string, dict, or None."""
    if value is None:
        return {}
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            result = json.loads(value)
            return result if isinstance(result, dict) else {}
        except (json.JSONDecodeError, ValueError):
            return {}
    return {}


def _first_present(*values):
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _normalise_onboarding_risk(value):
    v = (str(value or "").strip().lower()).replace("_", " ")
    if v == "very high":
        return "Very High"
    if v in {"high", "red"}:
        return "High"
    if v in {"moderate", "medium", "amber"}:
        return "Moderate"
    if v in {"low", "green"}:
        return "Low"
    return ""


def _onboarding_risk_rank(level):
    v = _normalise_onboarding_risk(level)
    if v == "Very High":
        return 4
    if v == "High":
        return 3
    if v == "Moderate":
        return 2
    if v == "Low":
        return 1
    return 0


def _onboarding_risk_from_percentage(value):
    pct = _number_or_none(value)
    if pct is None:
        return ""
    if pct >= 75:
        return "Very High"
    if pct >= 50:
        return "High"
    if pct >= 25:
        return "Moderate"
    return "Low"


def _score_display_parts(value):
    text = str(value or "").strip()
    if "/" not in text:
        return None, None
    left, right = text.split("/", 1)
    return _number_or_none(left.strip()), _number_or_none(right.strip())


def _onboarding_section_metrics(section):
    data = section.get("data") if isinstance(section, dict) else {}
    if not isinstance(data, dict):
        data = {}
    score = data.get("score") if isinstance(data.get("score"), dict) else {}
    ui = data.get("ui") if isinstance(data.get("ui"), dict) else {}
    raw = data.get("raw") if isinstance(data.get("raw"), dict) else {}
    raw_ai = raw.get("aiOutput") if isinstance(raw.get("aiOutput"), dict) else {}
    display_score, display_max = _score_display_parts(
        _first_present(ui.get("scoreDisplay"), data.get("scoreDisplay"), raw_ai.get("scoreDisplay"))
    )

    total = _number_or_none(_first_present(
        score.get("total"),
        score.get("score"),
        score.get("overallScore"),
        score.get("overall_score"),
        data.get("total"),
        data.get("score"),
        data.get("overallScore"),
        data.get("overall_score"),
        raw_ai.get("total"),
        raw_ai.get("score"),
        raw_ai.get("overallScore"),
        raw_ai.get("overall_score"),
        display_score,
    ))
    max_score = _number_or_none(_first_present(
        score.get("max"),
        score.get("maxScore"),
        score.get("max_score"),
        score.get("overallMaxScore"),
        score.get("overall_max_score"),
        data.get("max"),
        data.get("maxScore"),
        data.get("max_score"),
        data.get("overallMaxScore"),
        data.get("overall_max_score"),
        raw_ai.get("max"),
        raw_ai.get("maxScore"),
        raw_ai.get("max_score"),
        raw_ai.get("overallMaxScore"),
        raw_ai.get("overall_max_score"),
        display_max,
    ))
    pct = _number_or_none(_first_present(
        score.get("adjustedPercentage"),
        score.get("adjusted_percentage"),
        score.get("rawPercentage"),
        score.get("raw_percentage"),
        score.get("percentage"),
        data.get("adjustedPercentage"),
        data.get("adjusted_percentage"),
        data.get("rawPercentage"),
        data.get("raw_percentage"),
        data.get("percentage"),
        raw_ai.get("adjustedPercentage"),
        raw_ai.get("adjusted_percentage"),
        raw_ai.get("rawPercentage"),
        raw_ai.get("raw_percentage"),
        raw_ai.get("percentage"),
    ))
    if pct is None and total is not None and max_score:
        pct = round((total / max_score) * 100)

    risk = _normalise_onboarding_risk(_first_present(
        score.get("riskLevel"),
        score.get("risk_level"),
        score.get("overallRiskLevel"),
        score.get("overall_risk_level"),
        score.get("risk"),
        data.get("riskLevel"),
        data.get("risk_level"),
        data.get("overallRiskLevel"),
        data.get("overall_risk_level"),
        ui.get("badge"),
        ui.get("riskBadge"),
        ui.get("riskLevel"),
        raw_ai.get("riskLevel"),
        raw_ai.get("risk_level"),
        raw_ai.get("overallRiskLevel"),
        raw_ai.get("overall_risk_level"),
        raw_ai.get("risk"),
        data.get("badge"),
        section.get("badge") if isinstance(section, dict) else None,
    )) or _onboarding_risk_from_percentage(pct)

    return {
        "score": total,
        "max": max_score,
        "percentage": pct,
        "risk": risk,
    }


def _derive_onboarding_overview(overview, section_progress):
    done_sections = [
        section for section in section_progress
        if isinstance(section, dict) and section.get("done") and section.get("data")
    ]
    metrics = [_onboarding_section_metrics(section) for section in done_sections]
    scored = [
        item for item in metrics
        if item.get("score") is not None and item.get("max")
    ]

    total_score = None
    max_score = None
    percentage = None
    if scored:
        total_score = sum(float(item["score"]) for item in scored)
        max_score = sum(float(item["max"]) for item in scored)
        percentage = round((total_score / max_score) * 100) if max_score else None

    highest_risk = ""
    for item in metrics:
        risk = item.get("risk") or ""
        if _onboarding_risk_rank(risk) > _onboarding_risk_rank(highest_risk):
            highest_risk = risk

    overview = overview if isinstance(overview, dict) else {}
    risk = _normalise_onboarding_risk(_first_present(
        overview.get("overallRiskLevel"),
        overview.get("riskLevel"),
        highest_risk,
    ))

    return {
        "overallRiskLevel": risk,
        "overallScore": _compact_number(_first_present(overview.get("overallScore"), total_score)),
        "overallMaxScore": _compact_number(_first_present(overview.get("overallMaxScore"), max_score)),
        "percentage": _compact_number(_first_present(
            overview.get("rawPercentage"),
            overview.get("adjustedPercentage"),
            overview.get("percentage"),
            percentage,
        )),
    }


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def onboarding_reports_list(request):
    user = request.user
    profile = getattr(user, "profile", None)
    role = (getattr(profile, "role", "") or "").strip().lower()

    if role != "qa":
        return Response({"detail": "Forbidden"}, status=status.HTTP_403_FORBIDDEN)

    SECTION_COLS = [
        ("technology_report",          "Technology"),
        ("visual_hearing_report",      "Visual & Hearing"),
        ("dyslexia_report",            "Dyslexia"),
        ("adhd_report",                "ADHD"),
        ("social_anxiety_report",      "Social Anxiety"),
        ("mood_learning_capacity_report", "Mood & Learning"),
    ]
    EXPECTED = len(SECTION_COLS)

    try:
        coach_email_filter = (request.query_params.get("coach_email") or "").strip().lower()
        qs = LearnerInclusivenessReport.objects.using("wellbeing").only(
            "id",
            "learner_id",
            "learner_name",
            "learner_email",
            "academic_email",
            "programme",
            "organization_name",
            "coach_name",
            "coach_email",
            "manager_name",
            "manager_email",
            "master_report",
            "technology_report",
            "visual_hearing_report",
            "dyslexia_report",
            "adhd_report",
            "social_anxiety_report",
            "mood_learning_capacity_report",
            "status",
            "notes",
            "evidence",
            "created_at",
            "updated_at",
        )
        if coach_email_filter:
            qs = qs.filter(coach_email__iexact=coach_email_filter)
        qs = qs.order_by("-created_at", "-id")
        rows = []

        for r in qs:
            master = _parse_json_field(r.master_report)
            overview = master.get("overview", {}) if isinstance(master, dict) else {}
            if not isinstance(overview, dict):
                overview = {}

            # Count completed sections directly from DB columns
            section_progress = []
            completed_count = 0
            for col, label in SECTION_COLS:
                raw = getattr(r, col, None)
                if raw:
                    completed_count += 1
                    parsed = _parse_json_field(raw)
                    ui = parsed.get("ui", {}) if isinstance(parsed, dict) else {}
                    badge = ui.get("badge", "") if isinstance(ui, dict) else ""
                    summary_text = ui.get("summary", "") or ui.get("shortSummary", "") if isinstance(ui, dict) else ""
                    section_progress.append({
                        "label": label,
                        "badge": badge,
                        "summary": summary_text,
                        "done": True,
                        "data": parsed,
                    })
                else:
                    section_progress.append({
                        "label": label,
                        "badge": None,
                        "summary": None,
                        "done": False,
                        "data": None,
                    })

            derived_overview = _derive_onboarding_overview(overview, section_progress)

            rows.append({
                "id": r.id,
                "learner_id": r.learner_id,
                "learner_name": r.learner_name or "",
                "learner_email": r.learner_email or "",
                "academic_email": r.academic_email or "",
                "programme": r.programme or "",
                "organization_name": r.organization_name or "",
                "coach_name": r.coach_name or "",
                "coach_email": r.coach_email or "",
                "manager_name": r.manager_name or "",
                "manager_email": r.manager_email or "",
                "overall_risk_level": derived_overview.get("overallRiskLevel") or "",
                "overall_score": derived_overview.get("overallScore"),
                "overall_max_score": derived_overview.get("overallMaxScore"),
                "percentage": derived_overview.get("percentage"),
                "completed_reports": completed_count,
                "expected_reports": EXPECTED,
                "section_progress": section_progress,
                "master_report": master,
                "status": r.status or "active",
                "notes_count": len(r.notes) if isinstance(r.notes, list) else 0,
                "evidence_count": len(r.evidence) if isinstance(r.evidence, list) else 0,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "updated_at": r.updated_at.isoformat() if r.updated_at else None,
            })

        return Response({"reports": rows, "total": len(rows)})

    except Exception as exc:
        return Response({"detail": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def onboarding_report_notes(request, report_id: str):
    try:
        report = LearnerInclusivenessReport.objects.using("wellbeing").get(id=report_id)
    except LearnerInclusivenessReport.DoesNotExist:
        return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response({"notes": list(report.notes or [])})

    note_text = (request.data.get("note") or "").strip()
    if not note_text:
        return Response({"detail": "Note is required"}, status=status.HTTP_400_BAD_REQUEST)

    notes = list(report.notes or [])
    new_note = {
        "id": str(uuid.uuid4()),
        "note": note_text,
        "created_by": getattr(request.user, "email", "") or request.user.username,
        "created_at": timezone.now().isoformat(),
    }
    notes.append(new_note)
    LearnerInclusivenessReport.objects.using("wellbeing").filter(id=report_id).update(notes=notes)
    return Response(new_note, status=status.HTTP_201_CREATED)


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def onboarding_report_evidence(request, report_id: str):
    try:
        report = LearnerInclusivenessReport.objects.using("wellbeing").get(id=report_id)
    except LearnerInclusivenessReport.DoesNotExist:
        return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response({"evidence": list(report.evidence or [])})

    evidence_list = list(report.evidence or [])
    new_entry = {
        "id": str(uuid.uuid4()),
        "description": (request.data.get("description") or "").strip(),
        "file_url": request.data.get("file_url") or "",
        "file_name": request.data.get("file_name") or "",
        "created_by": getattr(request.user, "email", "") or request.user.username,
        "created_at": timezone.now().isoformat(),
    }
    evidence_list.append(new_entry)
    LearnerInclusivenessReport.objects.using("wellbeing").filter(id=report_id).update(evidence=evidence_list)
    return Response(new_entry, status=status.HTTP_201_CREATED)


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_onboarding_report(request, report_id: str):
    try:
        LearnerInclusivenessReport.objects.using("wellbeing").get(id=report_id)
    except LearnerInclusivenessReport.DoesNotExist:
        return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)

    update_kwargs = {}
    if "status" in request.data:
        update_kwargs["status"] = request.data["status"]

    if update_kwargs:
        LearnerInclusivenessReport.objects.using("wellbeing").filter(id=report_id).update(**update_kwargs)

    return Response({"id": report_id, **update_kwargs})

