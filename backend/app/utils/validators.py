"""
Input Validators
Common validation utilities
"""

import re
from typing import Optional


def validate_email(email: str) -> bool:
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_mobile(mobile: str) -> bool:
    """Validate mobile number format"""
    # Remove spaces and dashes
    cleaned = re.sub(r'[\s\-]', '', mobile)
    pattern = r'^\+?[1-9]\d{9,14}$'
    return bool(re.match(pattern, cleaned))


def validate_username(username: str) -> bool:
    """
    Validate username format
    - 3-50 characters
    - Alphanumeric and underscores only
    - Cannot start with underscore
    """
    if len(username) < 3 or len(username) > 50:
        return False
    pattern = r'^[a-zA-Z][a-zA-Z0-9_]*$'
    return bool(re.match(pattern, username))


def validate_password(password: str) -> tuple[bool, str]:
    """
    Validate password strength
    
    Requirements:
    - At least 8 characters
    - At least one uppercase
    - At least one lowercase
    - At least one digit
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters"
    
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    
    return True, ""


def validate_gst(gst_number: str) -> bool:
    """Validate Indian GST number format"""
    if not gst_number:
        return True  # GST is optional
    
    pattern = r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'
    return bool(re.match(pattern, gst_number.upper()))


def sanitize_string(value: str) -> str:
    """Sanitize string input"""
    if not value:
        return ""
    # Remove leading/trailing whitespace
    value = value.strip()
    # Remove multiple spaces
    value = re.sub(r'\s+', ' ', value)
    return value


def validate_phone(phone: str) -> bool:
    """Validate phone number"""
    return validate_mobile(phone)


def clean_mobile(mobile: str) -> str:
    """Clean and standardize mobile number"""
    # Remove spaces, dashes, parentheses
    cleaned = re.sub(r'[\s\-\(\)]', '', mobile)
    return cleaned


def mask_email(email: str) -> str:
    """Mask email for privacy (e.g., j***@example.com)"""
    if not email or '@' not in email:
        return email
    
    local, domain = email.split('@')
    if len(local) <= 2:
        masked_local = local[0] + '*'
    else:
        masked_local = local[0] + '*' * (len(local) - 2) + local[-1]
    
    return f"{masked_local}@{domain}"


def mask_mobile(mobile: str) -> str:
    """Mask mobile number for privacy (e.g., +91****1234)"""
    if not mobile or len(mobile) < 6:
        return mobile
    
    visible_start = 3 if mobile.startswith('+') else 2
    visible_end = 4
    
    return mobile[:visible_start] + '*' * (len(mobile) - visible_start - visible_end) + mobile[-visible_end:]