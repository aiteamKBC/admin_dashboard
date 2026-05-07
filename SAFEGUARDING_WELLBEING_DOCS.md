# Safeguarding & Wellbeing Dashboard — Developer Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Models](#database-models)
4. [API Endpoints](#api-endpoints)
5. [Frontend Services](#frontend-services)
6. [Frontend Types](#frontend-types)
7. [Frontend Components](#frontend-components)
8. [User Flows](#user-flows)
9. [Role-Based Access Control](#role-based-access-control)
10. [PDF & Excel Export](#pdf--excel-export)
11. [Support Tickets Table Setup](#support-tickets-table-setup)

---

## Overview

The Safeguarding & Wellbeing Dashboard is a monitoring and case management tool for coaches and QA staff at Kent Business College. It allows coaches to view learner wellbeing data, identify at-risk learners, and manage support tickets for safeguarding and wellbeing cases.

**Two roles access this dashboard:**
- **Coach** — sees only their own learners and tickets
- **QA** — sees all coaches via a dropdown selector, full admin access

---

## Architecture

```
Frontend (React + TypeScript)
  └── CoachWellbeingPage.tsx          ← main component
       ├── services/coachWellbeing.ts ← API calls
       └── types/coachWellbeing.ts    ← shared types

Backend (Django REST Framework)
  ├── tasks/views.py                  ← all view functions
  ├── tasks/urls.py                   ← URL routing
  └── tasks/models.py                 ← DB models

Databases
  ├── default        → coaches_data table
  └── wellbeing      → all other tables (read from monitoring system + support tickets)
```

**Authentication:** JWT (Bearer token). Every request goes through `fetchWithAuth` which handles proactive token refresh and session expiry.

---

## Database Models

All models have `managed = False` — Django does **not** auto-create or migrate these tables. They must exist in the database already.

### `WellbeingSafeguardingMonitoringSystem`
**Database:** `wellbeing` | **Table:** `wellbeing_safeguarding_monitoring_system`

Read-only. Source of learner + coach data from the external monitoring system.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigIntegerField (PK) | Learner record ID |
| `learner_name` | TextField | Full name |
| `learner_email` | TextField | |
| `learner_phone` | TextField | |
| `learner_address` | TextField | |
| `programme` | TextField | Apprenticeship programme |
| `manager_name` | TextField | |
| `manager_email` | TextField | |
| `coach_name` | TextField | |
| `coach_email` | TextField | Used to link learners to coaches |
| `total_score` | FloatField | Overall wellbeing score |
| `personal_wellbeing_protective_factors_score` | FloatField | Dimension 1 |
| `emotional_stress_resilience_score` | FloatField | Dimension 2 |
| `provider_culture_support_score` | FloatField | Dimension 3 |
| `safeguarding_vulnerability_score` | FloatField | Safeguarding score |
| `trigger_count` | IntegerField | Number of triggered questions |
| `triggered_questions` | JSONField | `{ "high": [{question_text, normalized_score, trigger_note}], "medium": [...], "low": [...] }` |
| `risk_level` | TextField | `"High"` / `"Medium"` / `"Low"` — mapped to `red/amber/green` in frontend |
| `history_json` | JSONField | Array of past survey records for trend calculation |

---

### `SafeguardingWellbeingAutomation`
**Database:** `wellbeing` | **Table:** `safeguarding_wellbeing_automation`

Read-only. AI-generated analysis data per learner record.

| Field | Type | DB Column |
|-------|------|-----------|
| `wellbeing_record_id` | BigIntegerField (PK) | `wellbeing_record_id` |
| `created_at` | DateTimeField | `created_at` |
| `updated_at` | DateTimeField | `updated_at` |
| `apprentice_dashboard` | TextField (JSON string) | `apprentice_dashboard` |
| `follow_up_by_coach` | TextField | `Follow-up_by_Coach` |
| `suggested_coach_actions` | TextField | `Suggested_Coach_Actions` |
| `line_manager_actions` | TextField | `Line_Manager_Actions` |

The `apprentice_dashboard` field is a JSON string that gets parsed and rendered in the Analysis modal. It can contain nested objects, arrays, and `{text, type}` patterns that the PDF export renders as two-column layouts.

---

### `SupportTicket`
**Database:** `wellbeing` | **Table:** `support_tickets`

The main operational table. Created and updated by coaches and QA staff.

| Field | Type | Notes |
|-------|------|-------|
| `id` | BigAutoField (PK) | Auto-incremented |
| `wellbeing_record_id` | BigIntegerField | Links to `WellbeingSafeguardingMonitoringSystem.id` |
| `ticket_type` | TextField | `"wellbeing"` or `"safeguarding"` |
| `full_name` | TextField | Learner name (copied at creation) |
| `email` | TextField | Learner email (copied at creation) |
| `subject` | TextField | Ticket subject (required) |
| `details` | TextField | Full description |
| `urgency` | TextField | `"low"` / `"medium"` / `"high"` / `"urgent"` |
| `preferred_contact` | TextField | `"email"` or `"phone"` |
| `status` | TextField | See [ticket statuses](#ticket-statuses) below |
| `notes` | JSONField | Array of `{id, note, created_by, created_at}` |
| `evidence` | JSONField | Array of `{id, description, file_url, file_name, created_by, created_at}` |
| `created_at` | DateTimeField | |
| `updated_at` | DateTimeField | |
| `created_by` | TextField | Encoded as `"Name\|\|Role"` — split on `\|\|` to get name (left) and source/role (right) |
| `days_to_close` | IntegerField | Auto-computed when ticket first moved to a closed status |
| `submitted_by` | TextField | Used when `created_by` is empty (learner self-submission). Falls back to this field for display. |

#### `created_by` Encoding Logic

The `created_by` field uses `\|\|` as a separator:

| Stored Value | `createdBy` (display) | `source` (display) |
|---|---|---|
| `"Alice Smith\|\|Coach"` | `Alice Smith` | `Coach` |
| `"alice.smith@kbc.com\|\|QA"` | `Alice Smith` | `QA` |
| `"system"` | `System` | `Automatic` |
| `""` (empty) + `submitted_by = "learner"` | learner full name | `Learner` |

#### Ticket Statuses

`"open"` → `"new"` → `"under review"` → `"assigned"` → `"awaiting information"` → `"action in progress"` → `"follow-up scheduled"` → `"support plan active"` → `"escalated"` → `"external referral made"` → `"outcome recorded"` → `"closed"` → `"reopened"`

Risk mapping from urgency: `urgent/high` → `red`, `medium/moderate` → `amber`, `low` → `green`

---

### `CoachData`
**Database:** `default` | **Table:** `coaches_data`

Stores coach tasks. Not directly used by the wellbeing dashboard.

---

## API Endpoints

Base path: `/tasks-api/`

### `GET /coach-wellbeing-dashboard/`

Returns full dashboard data for a coach.

**Query Params:**
| Param | Required | Notes |
|-------|----------|-------|
| `coach_email` | QA only | Filter by coach. Coach role uses their own email automatically. |

**Response:**
```json
{
  "summary": {
    "caseload": 12,
    "atRisk": 3,
    "nonResponders": 1,
    "openTickets": 2
  },
  "learners": [ ...CoachLearnerRow[] ],
  "trends": [ { "month": "2026-04", "total": 12, "red": 2, "amber": 5, "green": 5 } ],
  "followUps": [ ...CoachFollowUpItem[] ],
  "suggestedActions": [ ...CoachSuggestedActionItem[] ]
}
```

**Key logic:**
- Joins `WellbeingSafeguardingMonitoringSystem` with `SafeguardingWellbeingAutomation`
- Computes trend (up/down/stable) from `history_json` score deltas
- Maps `risk_level` (High/Medium/Low) → `red/amber/green`
- Counts open tickets per learner via `wellbeing_record_id`
- Returns max 20 follow-ups and 20 suggested actions

---

### `GET /coach-options/`

Returns a list of all coaches for the QA dropdown.

**Response:**
```json
[ { "value": "coach.email@kbc.com", "label": "Coach Name" } ]
```

Label is derived from the email local part if `coach_name` is missing or ambiguous.

---

### `POST /support-tickets/`

Creates a new support ticket.

**Request Body:**
```json
{
  "wellbeing_record_id": 123,
  "ticket_type": "wellbeing",
  "subject": "Learner showing signs of stress",
  "details": "...",
  "urgency": "medium",
  "preferred_contact": "email",
  "incident_date": "2026-05-07",
  "incident_time": "14:30",
  "created_by": "Alice Smith",
  "creator_role": "Coach",
  "days_to_close": null
}
```

**Response:**
```json
{ "id": 42, "wellbeing_record_id": 123, "status": "open", "message": "Support ticket created successfully" }
```

**Validation:**
- `wellbeing_record_id` must exist in `WellbeingSafeguardingMonitoringSystem`
- Coach can only create tickets for their own learners
- `subject` is required

---

### `GET /support-tickets/list/`

Returns all tickets (QA) or coach's own learner tickets (Coach).

**Query Params:**
| Param | Required | Notes |
|-------|----------|-------|
| `coach_email` | QA only | Filter by coach's learners |

**Response:**
```json
{
  "summary": {
    "total": 10, "open": 4, "redRisk": 2,
    "escalated": 1, "closed": 3,
    "avgCloseDays": 5.2, "avgCloseDelta": -1.3
  },
  "tickets": [ ...SupportTicketRow[] ]
}
```

---

### `PATCH /support-tickets/<id>/`

Updates a ticket's fields.

**Request Body (all optional):**
```json
{
  "status": "under review",
  "urgency": "high",
  "subject": "Updated subject",
  "details": "...",
  "ticket_type": "safeguarding",
  "preferred_contact": "phone"
}
```

Auto-computes `days_to_close` when transitioning to `"closed"` or `"outcome recorded"` for the first time.

---

### `DELETE /support-tickets/<id>/`

QA only. Permanently deletes a ticket.

---

### `GET /support-tickets/<id>/notes/`

Returns all notes for a ticket as an array.

```json
[ { "id": "uuid", "note": "Spoke with learner...", "created_by": "alice@kbc.com", "created_at": "2026-05-07T10:00:00Z" } ]
```

---

### `POST /support-tickets/<id>/notes/`

Adds a note to a ticket.

**Request Body:** `{ "note": "Note text here" }`

---

### `GET /support-tickets/<id>/evidence/`

Returns all evidence items for a ticket.

```json
[ { "id": "uuid", "description": "...", "file_url": "/media/evidence/abc_file.pdf", "file_name": "file.pdf", "created_by": "alice@kbc.com", "created_at": "..." } ]
```

---

### `POST /support-tickets/<id>/evidence/`

Attaches an evidence record (use `EvidenceUploadView` first if uploading a file).

**Request Body:**
```json
{ "description": "Incident report", "file_url": "/media/evidence/abc_report.pdf", "file_name": "report.pdf" }
```

---

### `POST /evidence/upload/`

Uploads a file and returns its URL. Call this before `POST /support-tickets/<id>/evidence/`.

**Request:** `multipart/form-data` with field `file`.

**Allowed types:** JPEG, PNG, GIF, WebP, PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, TXT, CSV.

**Response:**
```json
{ "url": "/media/evidence/uuid_filename.pdf", "absolute_url": "https://...", "path": "evidence/uuid_filename.pdf" }
```

---

## Frontend Services

File: `frontend/src/services/coachWellbeing.ts`

All functions use `fetchWithAuth` which automatically handles JWT refresh.

| Function | Description |
|----------|-------------|
| `getCoachWellbeing(coachEmail?)` | Fetch dashboard data |
| `getCoachOptions()` | Fetch coach dropdown options |
| `createSupportTicket(payload)` | Create a new ticket |
| `getSupportTickets(coachEmail?)` | Fetch tickets list with summary |
| `updateSupportTicket(id, payload)` | PATCH ticket fields |
| `deleteTicket(id)` | DELETE ticket (QA only) |
| `getTicketNotes(id)` | Get all notes for a ticket |
| `createTicketNote(id, note)` | Add a note |
| `getTicketEvidence(id)` | Get all evidence for a ticket |
| `uploadEvidenceFile(file)` | Upload a file, returns URL |
| `createTicketEvidence(id, payload)` | Attach evidence record |

---

## Frontend Types

File: `frontend/src/types/coachWellbeing.ts`

### Core Types

```typescript
type RiskLevel    = "green" | "amber" | "red";
type PriorityLevel = "low" | "medium" | "high" | "urgent";
type TicketStatus  = "open" | "new" | "under review" | "assigned" | "awaiting information"
                   | "action in progress" | "follow-up scheduled" | "support plan active"
                   | "escalated" | "external referral made" | "outcome recorded"
                   | "closed" | "reopened";
```

### `CoachLearnerRow`

One row in the learner table. Populated from the backend `learners` array.

| Field | Type | Notes |
|-------|------|-------|
| `studentId` | string \| number | |
| `studentName` | string | |
| `studentEmail` | string | |
| `totalScore` | number \| null | 0–10 overall score |
| `safeguardingScore` | number \| null | |
| `wellbeingScore` | number \| null | Dimension 1 |
| `engagementScore` | number \| null | Dimension 2 |
| `providerSupportScore` | number \| null | Dimension 3 |
| `riskLevel` | RiskLevel | `green/amber/red` |
| `trend` | `"up"\|"down"\|"stable"\|null` | Computed from history |
| `trendDelta` | number \| null | Score change vs previous |
| `recommendedAction` | string | AI-generated suggestion |
| `hasOpenTicket` | boolean | |
| `openTicketCount` | number | |
| `nonResponder` | boolean | Has not submitted recent survey |
| `safeguardingFlag` | boolean | Has high safeguarding score |
| `triggerCount` | number | Number of triggered questions |
| `triggeredQuestions` | array | `{text, score, level, note}[]` |
| `apprenticeDashboard` | object | AI analysis data for the report modal |
| `programme` | string | |
| `coachEmail` | string | |

### `SupportTicketRow`

One row in the tickets table.

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | |
| `ticketCode` | string | `TKT-001` format |
| `learnerName` | string | |
| `learnerEmail` | string | |
| `type` | string | `"wellbeing"` / `"safeguarding"` |
| `risk` | RiskLevel | Computed from urgency |
| `source` | string | Role part from `created_by` |
| `createdAt` | string | ISO8601 |
| `createdBy` | string | Name part from `created_by` |
| `status` | TicketStatus | |
| `daysOpen` | number | Days since creation (or days_to_close) |
| `daysToClose` | number \| null | Set on first closure |
| `closedAt` | string \| null | |
| `subject` | string | |
| `details` | string | |
| `urgency` | string | |
| `preferredContact` | string | |
| `notes` | TicketNoteRow[] | |
| `evidence` | TicketEvidenceRow[] | |

---

## Frontend Components

File: `frontend/src/components/wellbeing/CoachWellbeingPage.tsx`

All components are defined in this single file.

### Sub-components

| Component | Purpose |
|-----------|---------|
| `StatCard` | Summary metric card with icon, value, delta |
| `TrendBadge` | Shows `↑ +0.5` / `↓ -0.3` / `→` with color |
| `SafeguardingCell` | Score cell with color dot and tooltip |
| `TriggeredQuestionsPopover` | Portal popover listing triggered questions by risk level |
| `CoachSelect` | Coach email dropdown (QA only) |
| `LearnerTable` | Main learner data table |
| `ApprenticeReportModal` | Slide-in panel with AI analysis sections and PDF export |
| `TicketsManagementView` | Full tickets list with filters, search, actions |
| `TicketActionsDropdown` | Dropdown menu with case action groups |
| `ActionModal` | Multi-type modal for all ticket actions (notes, evidence, escalation, closure, etc.) |
| `TicketNotesPopover` | Portal popover with notes timeline |
| `TicketEvidencePopover` | Portal popover with evidence list and file previews |
| `FiltersPanel` | Filter panel for status / type / risk |
| `CreateTicketModal` | Form to create ticket (from tickets view, with learner selector) |
| `OpenTicketModal` | Form to create ticket (from dashboard, learner pre-selected) |
| `TicketDetailPanel` | Side panel with full ticket detail |
| `EditTicketModal` | Edit ticket fields modal |

---

## User Flows

### 1. View Dashboard

```
Page load
  → role = coach: fetch /coach-wellbeing-dashboard/
  → role = qa:    fetch /coach-options/ → user selects coach → fetch /coach-wellbeing-dashboard/?coach_email=...
  → Render: summary cards, trend chart, learner table, follow-ups, suggested actions
```

### 2. Open Support Ticket (from Dashboard)

```
Click "Open ticket" on learner row
  → Pre-fill form (type, subject, details, urgency based on risk level)
  → User edits and submits
  → POST /support-tickets/
  → Refresh dashboard data (open ticket count updates)
```

### 3. View Analysis Report (Apprentice Modal)

```
Click "View" (report icon) on learner row
  → Slide-in panel opens
  → Renders apprentice_dashboard JSON as sections:
      - Key-value objects → label/value table
      - {text, type}[] arrays → two-column Concerns/Positives
      - Objects with aiInsights + recommendedActions → two-column layout
      - Arrays of {title, reason, ...} → styled recommendation list
  → "Export PDF" → exportApprenticeToPDF() → downloads PDF
```

### 4. Switch to Tickets View

```
Click "Tickets" button (top-right)
  → activeView = "tickets"
  → Fetch /support-tickets/list/
  → Render: summary cards, ticket table with search + filters
```

### 5. Create Ticket (from Tickets View)

```
Click "+ Create Ticket"
  → CreateTicketModal opens with learner search
  → User searches and selects learner, fills form
  → POST /support-tickets/
  → Refresh ticket list
```

### 6. Update Ticket Status

```
Click Actions dropdown on ticket
  → Select action (e.g. "Start Review", "Escalate Case", "Close Case")
  → For modal actions: user fills details, submits
      → PATCH /support-tickets/<id>/ (update status)
      → POST /support-tickets/<id>/notes/ (add case note)
  → Ticket row + detail panel update
```

### 7. Add Evidence

```
Actions → "Add Evidence"
  → If file selected: POST /evidence/upload/ → get file URL
  → POST /support-tickets/<id>/evidence/ with {description, file_url, file_name}
  → Evidence popover updates
```

### 8. Close Case

```
Actions → "Close Case"
  → Modal with 3 required checkboxes
  → All checked → submit
  → POST /support-tickets/<id>/notes/ ("🔒 Case closed")
  → PATCH /support-tickets/<id>/ (status = "closed")
  → days_to_close auto-computed on backend
```

---

## Role-Based Access Control

| Action | Coach | QA |
|--------|-------|----|
| View own learners | ✅ | ✅ (via coach selector) |
| View all coaches' data | ❌ | ✅ |
| Create ticket for own learner | ✅ | ✅ |
| Create ticket for any learner | ❌ | ✅ |
| Update ticket (own learner) | ✅ | ✅ |
| Delete ticket | ❌ | ✅ |
| View coach dropdown | ❌ | ✅ |
| Export all tickets | ❌ | ✅ |

Roles are stored in `localStorage` as `"role"` and in the user's `profile.role` on the backend.

---

## PDF & Excel Export

### Learner Analysis PDF (`exportApprenticeToPDF`)

Generates a professional single-learner report.

**Layout:**
- Header: shield indicator + "LEARNER SAFEGUARDING REPORT", KBC logo top-right
- Student name, email, generated date
- Two stat cards: RISK LEVEL (color-coded) + TOTAL SCORE
- Sections from `apprenticeDashboard` with purple left accent bars
- Two-column layouts for AI Insights / Recommended Actions and Concerns / Positives
- Dark-purple confidential footer with KBC website

**Filename:** `learner-safeguarding-report-{learner-name}.pdf`

### Tickets PDF (`exportTicketsToPDF`)

Landscape A4 with summary + full ticket table.

**Filename:** `tickets-{coach-label}-{date}.pdf`

### Tickets Excel (`exportTicketsToExcel`)

Columns: Ticket, Learner, Email, Type, Risk, Urgency, Source, Created, Closed, Created By, Status, Days Open, Subject, Details.

**Filename:** `tickets-{coach-label}-{date}.xlsx`

---

## Support Tickets Table Setup

The `support_tickets` table has `managed = False` so Django does **not** auto-create it. If the table is missing columns (e.g. `submitted_by` was added after initial creation), run:

```bash
python manage.py create_support_tickets_table
```

This command (located at `backend/tasks/management/commands/create_support_tickets_table.py`) does:
1. `CREATE TABLE IF NOT EXISTS support_tickets (...)` — creates the full table if not present
2. `ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS ...` — adds any missing columns safely without touching existing data

**Full table DDL:**
```sql
CREATE TABLE IF NOT EXISTS support_tickets (
    id                  BIGSERIAL PRIMARY KEY,
    wellbeing_record_id BIGINT,
    ticket_type         TEXT,
    full_name           TEXT,
    email               TEXT,
    subject             TEXT,
    details             TEXT,
    urgency             TEXT,
    preferred_contact   TEXT,
    status              TEXT,
    notes               JSONB DEFAULT '[]'::jsonb,
    evidence            JSONB DEFAULT '[]'::jsonb,
    created_at          TIMESTAMP WITH TIME ZONE,
    updated_at          TIMESTAMP WITH TIME ZONE,
    created_by          TEXT,
    days_to_close       INTEGER,
    submitted_by        TEXT
);
```
