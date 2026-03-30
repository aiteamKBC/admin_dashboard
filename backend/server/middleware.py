# import os
# from django.http import JsonResponse

# class ApiKeyMiddleware:
#     """
#     Require X-API-Key header for /tasks-api/ endpoints.
#     """
#     def __init__(self, get_response):
#         self.get_response = get_response
#         self.api_key = os.getenv("API_KEY", "").strip()

#     def __call__(self, request):
#         if request.path.startswith("/tasks-api/"):
#             if not self.api_key:
#                 return JsonResponse({"detail": "Server API key not configured"}, status=500)

#             provided = request.headers.get("X-API-Key") or request.META.get("HTTP_X_API_KEY", "")
#             if provided != self.api_key:
#                 return JsonResponse({"detail": "Unauthorized"}, status=401)

#         return self.get_response(request)
