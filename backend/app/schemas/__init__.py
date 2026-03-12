"""
API Schemas
Request/Response schemas for all API endpoints
"""

from app.schemas.auth import (
    LoginRequest,
    SuperAdminLoginRequest,
    TokenResponse,
    LoginResponse,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    VerifyEmailRequest,
    MessageResponse,
    ErrorResponse
)
from app.schemas.tenant import (
    Step1CompanyDetails,
    Step2OwnerDetails,
    Step3PlanSelection,
    CompleteRegistration,
    RegistrationResponse,
    ValidateFieldRequest,
    ValidateFieldResponse
)
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    PaymentHistoryItem,
    PaymentHistoryResponse,
    InvoiceResponse,
    RefundRequest,
    RefundResponse
)

__all__ = [
    # Auth
    "LoginRequest",
    "SuperAdminLoginRequest",
    "TokenResponse",
    "LoginResponse",
    "RefreshTokenRequest",
    "ForgotPasswordRequest",
    "ResetPasswordRequest",
    "ChangePasswordRequest",
    "VerifyEmailRequest",
    "MessageResponse",
    "ErrorResponse",
    # Tenant
    "Step1CompanyDetails",
    "Step2OwnerDetails",
    "Step3PlanSelection",
    "CompleteRegistration",
    "RegistrationResponse",
    "ValidateFieldRequest",
    "ValidateFieldResponse",
    # Payment
    "CreateOrderRequest",
    "CreateOrderResponse",
    "VerifyPaymentRequest",
    "VerifyPaymentResponse",
    "PaymentHistoryItem",
    "PaymentHistoryResponse",
    "InvoiceResponse",
    "RefundRequest",
    "RefundResponse"
]