from django.core.management.base import BaseCommand
from django.contrib.auth.models import User
from accounts.models import Profile


class Command(BaseCommand):
    help = 'Create individual coach accounts with restricted access'

    def handle(self, *args, **options):
        # List of coach names with emails - each can log in with name or email
        coaches = [
            {"name": "Omar Elshafey", "email": "Omar.Elshafey@kentbusinesscollege.com"},
            {"name": "Radwa Samir", "email": "Radwa.Samir@kentbusinesscollege.com"},
            {"name": "Omar Badr", "email": "Omar.Badr@kentbusinesscollege.com"},
            {"name": "Ahmed Maher", "email": "Ahmed.Maher@kentbusinesscollege.com"},
            {"name": "Femi Falodun", "email": "Femi.Falodun@kentbusinesscollege.com"},
            {"name": "Nathan Shields", "email": "nathan.shields@kentbusinesscollege.com"},
            {"name": "Hannen Mostafa", "email": "Hannen.Mostafa@kentbusinesscollege.com"},
            {"name": "Nouran Abdalla", "email": "Nouran.Abdalla@kentbusinesscollege.com"},
            {"name": "Afaan Khan", "email": "Afaan.khan@kentbusinesscollege.com"},
            {"name": "Adeyemi Adeshina", "email": "adeyemi.adeshina@kentbusinesscollege.com"},
            {"name": "Marwa Mahmoud", "email": "Marwa.Mahmoud@kentbusinesscollege.com"},
            {"name": "Mahinor Hesham", "email": "Mahinor.Hesham@kentbusinesscollege.com"},
            {"name": "Omar Ham", "email": "Omar.Ham@kentbusinesscollege.com"},
            {"name": "Aryan Harikumar", "email": "Aryan.Harikumar@kentbusinesscollege.com"},
            {"name": "Elaf Mansour", "email": "Elaf.Mansour@kentbusinesscollege.com"},
            {"name": "Olivia Evans", "email": "Olivia.Evans@kentbusinesscollege.com"},
            {"name": "Patryk Zajac", "email": "Patryk.Zajac@kentbusinesscollege.com"},
        ]

        password = "123456789"
        created_count = 0
        updated_count = 0

        for idx, coach_data in enumerate(coaches, start=1):
            # Use coach_id as the sequential number
            coach_id = str(idx)
            coach_name = coach_data["name"]
            coach_email = coach_data["email"]

            # Check if user already exists
            user, created = User.objects.get_or_create(
                username=coach_name,
                defaults={
                    'first_name': coach_name.split()[0],
                    'last_name': ' '.join(coach_name.split()[1:]) if len(coach_name.split()) > 1 else '',
                    'email': coach_email,
                }
            )

            # Set password and email (will update if user already exists)
            user.set_password(password)
            user.email = coach_email
            user.save()

            # Create or update profile
            profile, profile_created = Profile.objects.get_or_create(
                user=user,
                defaults={
                    'role': 'coach',
                    'coach_id': coach_id,
                }
            )

            # Update profile if it already exists
            if not profile_created:
                profile.role = 'coach'
                profile.coach_id = coach_id
                profile.save()
                updated_count += 1
            else:
                created_count += 1

            status = "created" if created else "updated"
            self.stdout.write(
                self.style.SUCCESS(
                    f'✓ {status.capitalize()} coach account: {coach_name} | Email: {coach_email} (coach_id: {coach_id})'
                )
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'\n✓ Done! Created {created_count} new accounts, updated {updated_count} existing accounts.'
            )
        )
        self.stdout.write(
            self.style.SUCCESS(
                f'Password for all coach accounts: {password}'
            )
        )
