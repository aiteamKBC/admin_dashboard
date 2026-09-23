from django.contrib.auth.models import User
from django.contrib.auth.validators import UnicodeUsernameValidator
from django.db import IntegrityError, transaction
from rest_framework import serializers, status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Profile


class CanAddUsers(BasePermission):
    message = "Only QA users can add dashboard users."

    def has_permission(self, request, view):
        return getattr(getattr(request.user, "profile", None), "role", None) == "qa"


class NewUserSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150, validators=[UnicodeUsernameValidator()])
    email = serializers.EmailField(max_length=254)
    role = serializers.ChoiceField(choices=Profile.ROLE_CHOICES)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value):
        value = value.strip().lower()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value


class AddUserView(APIView):
    permission_classes = [IsAuthenticated, CanAddUsers]

    def post(self, request):
        serializer = NewUserSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            with transaction.atomic():
                # Microsoft sign-in uses the registered email. No shared or
                # default password, staff access, or superuser privileges.
                user = User.objects.create_user(username=data["username"], email=data["email"], password=None)
                Profile.objects.update_or_create(user=user, defaults={"role": data["role"]})
        except IntegrityError:
            return Response({"detail": "A user with this username or email already exists."},
                            status=status.HTTP_409_CONFLICT)
        return Response({"id": user.pk, "username": user.username, "email": user.email,
                         "role": data["role"]}, status=status.HTTP_201_CREATED)
