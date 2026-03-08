from django.contrib.auth import authenticate, get_user_model
from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = User.USERNAME_FIELD

    def validate(self, attrs):
        username_or_email = attrs.get("username")
        password = attrs.get("password")

        if not username_or_email or not password:
            raise serializers.ValidationError("username and password are required")

        # لو دخل email, حوله لـ username
        lookup = username_or_email.strip()
        if "@" in lookup:
            u = User.objects.filter(email__iexact=lookup).first()
            if u:
                attrs["username"] = u.get_username()  # actual username in DB

        # authenticate normal
        user = authenticate(
            request=self.context.get("request"),
            username=attrs.get("username"),
            password=password,
        )

        if not user:
            raise serializers.ValidationError("No active account found with the given credentials")

        if not user.is_active:
            raise serializers.ValidationError("Account is disabled")

        # خليه يكمل SimpleJWT الطبيعي
        return super().validate({"username": user.get_username(), "password": password})