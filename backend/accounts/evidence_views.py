"""
Google Sheets Evidence Loading
Fetches student components and evidence from Google Sheets
"""
import os
import json
import time
from pathlib import Path

from django.conf import settings
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError


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
    Find student in the spreadsheet and return their row data and sheet info
    Similar to PHP ad_get_student_components_internal logic
    """
    if not student_email and not student_id:
        raise ValueError("Either student_email or student_id is required")
    
    # Normalize search terms
    search_email = student_email.lower().strip() if student_email else None
    search_id = str(student_id).strip() if student_id else None
    
    # Get all sheets
    sheets = get_sheets_list(service, spreadsheet_id)
    
    # Search through sheets to find the student
    found_data = None
    found_sheet = None
    
    for sheet in sheets:
        sheet_title = sheet['title']
        
        # Skip only output sheets (allow target sheets to be searched)
        if 'output' in sheet_title.lower():
            continue
        
        # Fetch sheet data
        range_name = f"{sheet_title}!A:Z"
        try:
            rows = get_sheet_data(service, spreadsheet_id, range_name)
        except:
            continue
        
        if not rows or len(rows) < 2:  # Need at least header + 1 row
            continue
        
        # Search for student in rows
        # Check multiple columns for email (columns 1-5)
        for i, row in enumerate(rows):
            if len(row) < 2:
                continue
            
            # Skip header row if it looks like a header
            if i == 0 and any(isinstance(cell, str) and 
                             cell.lower() in ['email', 'student email', 'id', 'student id', 'name'] 
                             for cell in row[:6]):
                continue
            
            # Match by email - check first 6 columns for email
            match = False
            if search_email:
                for col_idx in range(min(6, len(row))):
                    cell_value = str(row[col_idx]).lower().strip()
                    if cell_value == search_email:
                        match = True
                        break
            
            # Match by ID - check first 2 columns
            if not match and search_id:
                for col_idx in range(min(2, len(row))):
                    cell_value = str(row[col_idx]).strip()
                    if cell_value == search_id:
                        match = True
                        break
            
            if match:
                found_data = {
                    'row': row,
                    'row_index': i,
                    'sheet_title': sheet_title
                }
                found_sheet = sheet
                break
        
        if found_data:
            break
    
    if not found_data:
        # Provide more helpful error message
        sheets_searched = [s['title'] for s in sheets if 'output' not in s['title'].lower()]
        raise ValueError(
            f"Student not found in any sheet. "
            f"Searched for email='{student_email}' or id='{student_id}'. "
            f"Sheets searched: {', '.join(sheets_searched[:5])}..."
        )
    
    # Get group from column 4 (index 4)
    group = found_data['row'][4] if len(found_data['row']) > 4 else None
    
    if not group:
        raise ValueError("Group not found for student")
    
    # Get target sheet based on group mapping
    target_sheet_name = GROUP_SHEET_MAPPING.get(group)
    
    if not target_sheet_name:
        # If no mapping exists, try using the group name directly as sheet name
        target_sheet_name = group
    
    # Verify target sheet exists
    target_exists = any(s['title'] == target_sheet_name for s in sheets)
    if not target_exists:
        available_sheets = [s['title'] for s in sheets if 'output' not in s['title'].lower()]
        raise ValueError(
            f"Target sheet '{target_sheet_name}' for group '{group}' not found. "
            f"Available sheets: {', '.join(available_sheets[:10])}"
        )
    
    return {
        'student_data': found_data,
        'group': group,
        'target_sheet': target_sheet_name,
        'student_email': found_data['row'][1] if len(found_data['row']) > 1 else '',
        'student_id': found_data['row'][0] if len(found_data['row']) > 0 else ''
    }


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
    
    # Fetch target sheet data
    range_name = f"{target_sheet}!A:Z"
    rows = get_sheet_data(service, spreadsheet_id, range_name)
    
    if not rows:
        raise ValueError(f"No data in target sheet: {target_sheet}")
    
    # Detect component column index (search for 'component' in header)
    component_index = None
    evidence_index = None
    
    if rows and len(rows) > 0:
        header_row = rows[0]
        for idx, cell in enumerate(header_row):
            if isinstance(cell, str) and 'component' in cell.lower():
                component_index = idx
            if isinstance(cell, str) and 'evidence' in cell.lower():
                evidence_index = idx
    
    if component_index is None:
        component_index = 3  # Default fallback
    
    if evidence_index is None:
        evidence_index = 4  # Default fallback
    
    # Determine starting row (skip header if it contains 'component')
    start_row = 0
    if rows and len(rows) > 0 and component_index < len(rows[0]):
        if isinstance(rows[0][component_index], str) and 'component' in rows[0][component_index].lower():
            start_row = 1
    
    # Find the student's row in target sheet
    component_name = None
    evidence_data = None
    
    for i in range(start_row, len(rows)):
        row = rows[i]
        
        if len(row) < 2:
            continue
        
        row_id = row[0] if len(row) > 0 else ''
        row_email = row[1] if len(row) > 1 else ''
        
        # Match student
        match = False
        if student_email_found and isinstance(row_email, str) and row_email.lower().strip() == student_email_found.lower().strip():
            match = True
        elif student_id_found and str(row_id).strip() == str(student_id_found).strip():
            match = True
        
        if match:
            # Get component name
            if component_index < len(row):
                component_name = row[component_index]
            
            # Get evidence data
            if evidence_index < len(row):
                evidence_data = row[evidence_index]
            
            break
    
    if not component_name:
        raise ValueError("Component data not found for student in target sheet")
    
    # Parse component JSON if it's a JSON string
    components_parsed = None
    if isinstance(component_name, str):
        try:
            components_parsed = json.loads(component_name)
        except:
            # Not JSON, keep as string
            components_parsed = component_name
    else:
        components_parsed = component_name
    
    return {
        'student_id': student_id_found,
        'student_email': student_email_found,
        'group': student_info['group'],
        'target_sheet': target_sheet,
        'components': components_parsed,
        'evidence': evidence_data,
        'raw_component_name': component_name
    }


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
    API endpoint to mark evidence by submitting to processing sheet
    and waiting for results from output sheet
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        """
        Mark evidence - submit to processing sheet and poll for results
        
        Expected payload:
        {
            "student_id": "...",
            "student_email": "...",
            "group": "PCP",
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
        evidence_id = request.data.get('evidence_id')
        evidence_name = request.data.get('evidence_name')
        evidence_url = request.data.get('evidence_url')
        evidence_status = request.data.get('evidence_status')
        evidence_created_date = request.data.get('evidence_created_date')
        component_id = request.data.get('component_id')
        components = request.data.get('components', [])
        
        # Validate required fields
        if not all([student_id, group, evidence_id, component_id]):
            return Response(
                {'error': 'Missing required fields: student_id, group, evidence_id, component_id'},
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
            
            # Get processing sheet name
            processing_sheet = f"{group} processing sheet"
            
            # Prepare row data for processing sheet
            # Columns: UserId, UserName, ComponentId, ComponentName, EvidenceId, 
            #          EvidenceName, EvidenceUrl, EvidenceStatus, EvidenceCreatedDate
            row_data = [
                str(student_id),
                str(student_name),
                str(component_id),
                str(component_name),
                str(evidence_id),
                str(evidence_name),
                str(evidence_url),
                str(evidence_status),
                str(evidence_created_date),
            ]
            
            # Append to processing sheet
            append_range = f"'{processing_sheet}'!A:I"
            body = {
                'values': [row_data]
            }
            
            result = service.spreadsheets().values().append(
                spreadsheetId=SPREADSHEET_ID,
                range=append_range,
                valueInputOption='RAW',
                insertDataOption='INSERT_ROWS',
                body=body
            ).execute()
            
            # Poll output sheet for results
            output_sheet = f"{group} Output"
            max_polls = 20  # Poll for up to 60 seconds (20 * 3s)
            poll_interval = 3  # seconds
            
            marking_result = None
            for poll_count in range(max_polls):
                time.sleep(poll_interval)
                
                # Read output sheet
                try:
                    output_range = f"'{output_sheet}'!A:Z"
                    output_result = service.spreadsheets().values().get(
                        spreadsheetId=SPREADSHEET_ID,
                        range=output_range
                    ).execute()
                    
                    output_rows = output_result.get('values', [])
                    if not output_rows:
                        continue
                    
                    # First row is headers
                    headers = output_rows[0] if output_rows else []
                    
                    # Find evidence_id column (usually column E - EvidenceId)
                    evidence_id_col = -1
                    for idx, header in enumerate(headers):
                        if header.lower() in ['evidenceid', 'evidence_id', 'evidence id']:
                            evidence_id_col = idx
                            break
                    
                    if evidence_id_col == -1:
                        continue
                    
                    # Search for matching evidence_id in output sheet
                    for row in output_rows[1:]:  # Skip header row
                        if len(row) > evidence_id_col:
                            row_evidence_id = str(row[evidence_id_col])
                            if row_evidence_id == str(evidence_id):
                                # Found result - build result object
                                marking_result = {}
                                for idx, header in enumerate(headers):
                                    if idx < len(row):
                                        marking_result[header] = row[idx]
                                break
                    
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
                    'message': 'Evidence submitted but marking result not ready yet. Please check later.',
                    'data': {
                        'submitted': True,
                        'processing_sheet': processing_sheet,
                        'output_sheet': output_sheet,
                        'evidence_id': evidence_id
                    }
                })
            
        except HttpError as e:
            return Response(
                {'error': f'Google Sheets API error: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        except Exception as e:
            return Response(
                {'error': f'Failed to mark evidence: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
