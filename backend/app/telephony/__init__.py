"""Telephony Integration Plugin — self-contained, additive module.

Nothing in Recruitment, HRM, or core CRM code imports from provider
implementations directly. All access goes through
`app.telephony.services.telephony_service` and
`app.telephony.services.provider_factory`.
"""
