from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from django.contrib.auth.forms import AdminUserCreationForm, UserChangeForm
from django.contrib.auth.models import User
from django import forms

from .models import Profile


class EmailRequiredUserCreationForm(AdminUserCreationForm):
    """Creation form that matches the database's unique email constraint."""

    email = forms.EmailField(required=True)

    class Meta(AdminUserCreationForm.Meta):
        model = User
        fields = ("username", "email")

    def clean_email(self):
        email = self.cleaned_data["email"].strip()
        if User.objects.filter(email__iexact=email).exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email


class EmailRequiredUserChangeForm(UserChangeForm):
    email = forms.EmailField(required=True)

    def clean_email(self):
        email = self.cleaned_data["email"].strip()
        duplicate = User.objects.filter(email__iexact=email).exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise forms.ValidationError("A user with this email already exists.")
        return email


class EmailRequiredUserAdmin(UserAdmin):
    add_form = EmailRequiredUserCreationForm
    form = EmailRequiredUserChangeForm
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("username", "email", "usable_password", "password1", "password2"),
            },
        ),
    )


admin.site.unregister(User)
admin.site.register(User, EmailRequiredUserAdmin)

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "coach_id")
    list_filter = ("role",)
    search_fields = ("user__username", "user__email", "coach_id")
