"""
Google Sheets Evidence Loading
Fetches student components and evidence from Google Sheets
"""
import json
import time
import os
from pathlib import Path

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import requests


# Spreadsheet ID from the URL
SPREADSHEET_ID = "1K5gdYpM3ULvMZ-5SisQZjXSSdtoT1p3Fl6gS-rxMuCg"

# Group to sheet name mapping (from PHP code)
# Extended to support more groups
GROUP_SHEET_MAPPING = {
    "A": "Level 3 CM",
    "B": "Level 5 LO",
    "C": "Level 5 HRM",
    "D": "Level 5 Business Management",
    "E": "Top-up",
    "PCP": "PCP",  # PCP maps to PCP sheet
    "ME": "ME",    # ME maps to ME sheet  
    "PDF": "PDF",  # PDF maps to PDF sheet
}

PROGRAM_TABS = ["PCP", "PCP-fanar", "ME", "MM", "MRE"]

PROGRAM_WEBHOOK_ENV = {
    "PCP": "N8N_WEBHOOK_URL_PCP",
    "PCP-FANAR": "N8N_WEBHOOK_URL_PCP_FANAR",
    "ME": "N8N_WEBHOOK_URL_ME",
    "MM": "N8N_WEBHOOK_URL_MM",
    "MRE": "N8N_WEBHOOK_URL_MRE",
}

PROGRAM_OUTPUT_SHEET_ENV = {
    "PCP": "OUTPUT_SHEET_PCP",
    "PCP-FANAR": "OUTPUT_SHEET_PCP_FANAR",
    "ME": "OUTPUT_SHEET_ME",
    "MM": "OUTPUT_SHEET_MM",
    "MRE": "OUTPUT_SHEET_MRE",
}


def normalize_program(value):
    """Normalize program/group values to a canonical label."""
    raw = str(value or "").strip()
    if not raw:
        return ""

    low = raw.lower().replace("_", "-").replace(" ", "-")
    if low in {"pcp-fanar", "pcpfanar"}:
        return "PCP-fanar"
    if low == "pcp":
        return "PCP"
    if low == "me":
        return "ME"
    if low == "mm":
        return "MM"
    if low == "mre":
        return "MRE"

    return raw


def get_program_webhook_url(program):
    """Resolve webhook URL from environment based on student program."""
    canonical = normalize_program(program)
    key = canonical.upper()
    env_name = PROGRAM_WEBHOOK_ENV.get(key)

    if env_name:
        return os.getenv(env_name) or None

    # Backward-compatible fallback.
    return os.getenv("N8N_WEBHOOK_URL") or None


def get_output_sheet_name(program):
    """Resolve output sheet name from environment based on student program."""
    canonical = normalize_program(program)
    key = canonical.upper()
    env_name = PROGRAM_OUTPUT_SHEET_ENV.get(key)

    if env_name:
        sheet = os.getenv(env_name)
        if sheet:
            return sheet

    if canonical:
        return f"{canonical} output"

    return ""


def find_marking_report_in_output_sheet(service, spreadsheet_id, program, evidence_id):
    """Check output sheet and return marking report for evidence_id if ready."""
    output_sheet = get_output_sheet_name(program)
    if not output_sheet:
        raise ValueError(f"Output sheet not configured for program: {program}")

    output_range = f"'{output_sheet}'!A:J"
    output_result = service.spreadsheets().values().get(
        spreadsheetId=spreadsheet_id,
        range=output_range
    ).execute()

    output_rows = output_result.get('values', [])
    if len(output_rows) < 2:
        return None

    for row in output_rows[1:]:
        if len(row) <= 4:
            continue

        row_evidence_id = str(row[4]).strip()
        if row_evidence_id != str(evidence_id).strip():
            continue

        report_text = row[9] if len(row) > 9 else ''
        if not str(report_text).strip():
            return None

        return {
            'evidence_id': str(evidence_id),
            'program': normalize_program(program),
            'output_sheet': output_sheet,
            'marking_report': report_text,
            'raw_output_row': row,
        }

    return None


def find_student_in_program_tabs(service, spreadsheet_id, student_email=None, student_id=None):
    """Search program tabs by email in column D (index 3) or by ID in column A (index 0)."""
    if not student_email and not student_id:
        return None

    search_email = str(student_email).lower().strip() if student_email else None
    search_id = str(student_id).strip() if student_id else None

    sheets = get_sheets_list(service, spreadsheet_id)
    sheet_by_lower = {s["title"].lower(): s for s in sheets}

    for sheet_name in PROGRAM_TABS:
        sheet = sheet_by_lower.get(sheet_name.lower())
        if not sheet:
            continue

        rows = get_sheet_data(service, spreadsheet_id, f"'{sheet['title']}'!A:Z")
        if not rows or len(rows) < 2:
            continue

        for row_index, row in enumerate(rows[1:], start=1):
            if len(row) <= 0:
                continue

            match = False
            
            if search_email and len(row) > 3:
                row_email = str(row[3]).lower().strip()
                if row_email == search_email:
                    match = True
            
            if not match and search_id and len(row) > 0:
                row_id = str(row[0]).strip()
                if row_id == search_id:
                    match = True

            if not match:
                continue

            return {
                "student_data": {
                    "row": row,
                    "row_index": row_index,
                    "sheet_title": sheet["title"],
                },
                "group": normalize_program(sheet["title"]),
                "target_sheet": sheet["title"],
                "student_email": row[3] if len(row) > 3 else "",
                "student_id": row[0] if len(row) > 0 else "",
            }

    return None


def get_service_account_path():
    """Get path to service account JSON file"""
    # Try backend directory first
    backend_dir = Path(settings.BASE_DIR)
    sa_path = backend_dir / "ai-marking-tool-480910-1f3c7a43f500.json"
    
    if sa_path.exists():
        return str(sa_path)
    
    return None


def get_sheets_service():
    """Create authenticated Google Sheets service"""
    sa_path = get_service_account_path()
    
    if not sa_path:
        raise ValueError("Service account file not found")
    
    credentials = service_account.Credentials.from_service_account_file(
        sa_path,
        scopes=['https://www.googleapis.com/auth/spreadsheets']
    )
    
    service = build('sheets', 'v4', credentials=credentials)
    return service


def get_sheets_list(service, spreadsheet_id):
    """Get list of all sheets in the spreadsheet"""
    try:
        spreadsheet = service.spreadsheets().get(
            spreadsheetId=spreadsheet_id,
            fields='sheets.properties'
        ).execute()
        
        sheets = []
        for sheet in spreadsheet.get('sheets', []):
            props = sheet.get('properties', {})
            sheets.append({
                'title': props.get('title'),
                'sheetId': props.get('sheetId'),
                'index': props.get('index')
            })
        
        return sheets
    except HttpError as e:
        raise ValueError(f"Failed to get sheets list: {e}")


def get_sheet_data(service, spreadsheet_id, range_name):
    """Fetch data from a specific sheet range"""
    try:
        result = service.spreadsheets().values().get(
            spreadsheetId=spreadsheet_id,
            range=range_name
        ).execute()
        
        return result.get('values', [])
    except HttpError as e:
        raise ValueError(f"Failed to get sheet data: {e}")


def find_student_in_sheets(service, spreadsheet_id, student_email=None, student_id=None):
    """
    Find student only in the specified program tabs.
    """
    if not student_email and not student_id:
        raise ValueError("Either student_email or student_id is required")
    
    # Normalize search terms
    search_email = student_email.lower().strip() if student_email else None
    search_id = str(student_id).strip() if student_id else None

    # Search student email or ID ONLY in program tabs.
    program_match = find_student_in_program_tabs(service, spreadsheet_id, search_email, search_id)
    if program_match:
        return program_match
        
    raise ValueError(
        f"Student not found in Program tabs ({', '.join(PROGRAM_TABS)}). "
        f"Searched for email='{student_email}' or id='{student_id}'. "
        f"Please ensure they exist in one of these tabs."
    )


def get_student_components(service, spreadsheet_id, student_email=None, student_id=None):
    """
    Main function to get student components from Google Sheets
    Returns component name and evidence data
    """
    # Find student and get group/target sheet
    student_info = find_student_in_sheets(service, spreadsheet_id, student_email, student_id)
    
    target_sheet = student_info['target_sheet']
    student_email_found = student_info['student_email']
    student_id_found = student_info['student_id']
    program = normalize_program(student_info['group'] or target_sheet)

    # Primary flow: student located by email in column D from program tabs.
    # Reflect row data from column E directly.
    matched_row = student_info.get('student_data', {}).get('row') or []
    if student_email_found and matched_row:
        evidence_col_e = matched_row[4] if len(matched_row) > 4 else ''

        if not str(evidence_col_e).strip():
            raise ValueError("No evidence data found in column E for this student")

        evidence_parsed = evidence_col_e
        if isinstance(evidence_col_e, str):
            try:
                evidence_parsed = json.loads(evidence_col_e)
            except:
                evidence_parsed = evidence_col_e

        return {
            'student_id': student_id_found,
            'student_email': student_email_found,
            'group': program,
            'program': program,
            'target_sheet': target_sheet,
            'components': evidence_parsed if isinstance(evidence_parsed, list) else [],
            'evidence': evidence_col_e,
            'raw_component_name': None,
            'source_column': 'E'
        }

    raise ValueError(f"Student data improperly formatted in program tab.")


class GetStudentComponentsView(APIView):
    """
    API endpoint to fetch student components from Google Sheets
    GET /api/accounts/student-components/?student_email=xxx@xxx.com
    or
    GET /api/accounts/student-components/?student_id=1234
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        student_email = request.GET.get('student_email', '').strip()
        student_id = request.GET.get('student_id', '').strip()
        
        if not student_email and not student_id:
            return Response(
                {'error': 'Either student_email or student_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get authenticated Sheets service
            service = get_sheets_service()
            
            # Fetch student components
            result = get_student_components(
                service,
                SPREADSHEET_ID,
                student_email=student_email if student_email else None,
                student_id=student_id if student_id else None
            )
            
            return Response({
                'success': True,
                'data': result
            })
            
        except ValueError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to fetch student components: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class MarkEvidenceView(APIView):
    """
    API endpoint to mark evidence using a program-specific webhook,
    then read the output sheet and return marking report (column J).
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Mark evidence via webhook and poll output sheet for results
        
        Expected payload:
        {
            "student_id": "...",
            "student_email": "...",
            "group": "PCP",
            "program": "PCP",
            "evidence_id": 15009,
            "evidence_name": "...",
            "evidence_url": "...",
            "evidence_status": "PendingAssessment",
            "evidence_created_date": "2025-11-16T15:46:14.556909Z",
            "component_id": 19129,
            "components": [{"componentId": 19129, "componentName": "Managing Portfolios"}]
        }
        """
        # Extract data from request
        student_id = request.data.get('student_id')
        student_email = request.data.get('student_email')
        student_name = request.data.get('student_name', student_email)
        group = request.data.get('group')
        program = request.data.get('program') or group
        program = normalize_program(program)
        evidence_id = request.data.get('evidence_id')
        evidence_name = request.data.get('evidence_name')
        evidence_url = request.data.get('evidence_url')
        evidence_status = request.data.get('evidence_status')
        evidence_created_date = request.data.get('evidence_created_date')
        component_id = request.data.get('component_id')
        components = request.data.get('components', [])
        
        # Validate required fields
        if not all([program, evidence_id]):
            return Response(
                {'error': 'Missing required fields: program/group, evidence_id'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Get authenticated Sheets service
            service = get_sheets_service()
            
            # Find component name from components array
            component_name = "Unknown Component"
            if isinstance(components, list):
                for comp in components:
                    comp_id = comp.get('componentId') or comp.get('ComponentId')
                    comp_name = comp.get('componentName') or comp.get('ComponentName')
                    if comp_id == component_id and comp_name:
                        component_name = comp_name
                        break
            elif isinstance(components, str):
                # Try to parse if it's a JSON string
                try:
                    components_list = json.loads(components)
                    for comp in components_list:
                        comp_id = comp.get('componentId') or comp.get('ComponentId')
                        comp_name = comp.get('componentName') or comp.get('ComponentName')
                        if comp_id == component_id and comp_name:
                            component_name = comp_name
                            break
                except:
                    pass
            
            webhook_url = get_program_webhook_url(program)
            if not webhook_url:
                return Response(
                    {'error': f'Webhook URL not configured for program: {program}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            webhook_payload = {
                'student_id': student_id,
                'student_email': student_email,
                'student_name': student_name,
                'group': group,
                'program': program,
                'evidence_id': evidence_id,
                'evidence_name': evidence_name,
                'evidence_url': evidence_url,
                'evidence_status': evidence_status,
                'evidence_created_date': evidence_created_date,
                'component_id': component_id,
                'component_name': component_name,
                'components': components,
            }

            webhook_response = requests.post(webhook_url, json=webhook_payload, timeout=20)
            webhook_response.raise_for_status()

            output_sheet = get_output_sheet_name(program)
            if not output_sheet:
                return Response(
                    {'error': f'Output sheet not configured for program: {program}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            max_polls = 20  # Poll for up to 60 seconds (20 * 3s)
            poll_interval = 3  # seconds
            
            marking_result = None
            for poll_count in range(max_polls):
                time.sleep(poll_interval)
                
                # Read output sheet
                try:
                    marking_result = find_marking_report_in_output_sheet(
                        service,
                        SPREADSHEET_ID,
                        program,
                        evidence_id,
                    )
                    
                    if marking_result:
                        break
                        
                except HttpError as e:
                    # Output sheet might not exist yet
                    if poll_count < max_polls - 1:
                        continue
                    else:
                        raise
            
            if marking_result:
                return Response({
                    'success': True,
                    'message': 'Evidence marked successfully',
                    'data': marking_result
                })
            else:
                return Response({
                    'success': False,
                    'message': 'Evidence submitted to webhook but marking result is not ready yet. Please check later.',
                    'data': {
                        'submitted': True,
                        'program': program,
                        'output_sheet': output_sheet,
                        'evidence_id': evidence_id
                    }
                })
            
        except HttpError as e:
            return Response(
                {'error': f'Google Sheets API error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except requests.RequestException as e:
            return Response(
                {'error': f'Webhook request failed: {str(e)}'},
                status=status.HTTP_502_BAD_GATEWAY
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to mark evidence: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class PollMarkingReportView(APIView):
    """Poll output sheet for an evidence marking report."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        evidence_id = str(request.GET.get('evidence_id', '')).strip()
        program = request.GET.get('program') or request.GET.get('group')
        program = normalize_program(program)

        if not evidence_id or not program:
            return Response(
                {'error': 'evidence_id and program are required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            service = get_sheets_service()
            result = find_marking_report_in_output_sheet(
                service,
                SPREADSHEET_ID,
                program,
                evidence_id,
            )

            if result:
                return Response({'found': True, 'data': result})

            return Response({'found': False, 'message': 'Report not ready yet'})

        except ValueError as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except HttpError as e:
            return Response(
                {'error': f'Google Sheets API error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to poll marking report: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
