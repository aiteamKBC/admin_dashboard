from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import Profile
import requests

class Command(BaseCommand):
    help = 'Sync coach_id with actual case_owner_id from analytics API'

    def handle(self, *args, **options):
        API_URL = "http://127.0.0.1:5055/api/coaches/all"
        API_KEY = "1d1296c572361241a2935363bac9aee3e6054252a24b9de076485d2c58829b21"
        
        self.stdout.write("Fetching coach data from analytics API...")
        
        try:
            response = requests.get(API_URL, headers={"x-api-key": API_KEY})
            response.raise_for_status()
            data = response.json()
            
            coaches_data = data.get("rows", [])
            
            self.stdout.write(f"Found {len(coaches_data)} coaches in API")
            
            # Create mapping: coach_name -> case_owner_id
            name_to_id = {}
            for coach in coaches_data:
                case_owner_id = coach.get("id") or coach.get("case_owner_id")
                case_owner = coach.get("case_owner", "").strip()
                
                if case_owner_id and case_owner:
                    name_to_id[case_owner] = str(case_owner_id)
            
            self.stdout.write(f"\nCreated mapping for {len(name_to_id)} coaches")
            
            # Update user profiles
            updated = 0
            not_found = 0
            
            users = User.objects.filter(profile__role='coach').exclude(username='coach_demo')
            
            for user in users:
                coach_name = user.username
                
                if coach_name in name_to_id:
                    new_coach_id = name_to_id[coach_name]
                    old_coach_id = user.profile.coach_id
                    
                    user.profile.coach_id = new_coach_id
                    user.profile.save()
                    
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'✓ {coach_name:20} | {old_coach_id:5} → {new_coach_id:5}'
                        )
                    )
                    updated += 1
                else:
                    self.stdout.write(
                        self.style.WARNING(
                            f'✗ {coach_name:20} | NOT FOUND in API'
                        )
                    )
                    not_found += 1
            
            self.stdout.write(
                self.style.SUCCESS(
                    f'\n✓ Updated {updated} coaches, {not_found} not found in API'
                )
            )
            
        except Exception as e:
            self.stdout.write(
                self.style.ERROR(f'Error: {e}')
            )
