"""Tests for the Probation & Notice Period workflow (employment_policy helpers)."""
from datetime import date, timedelta

import pytest

from app.models.company.employee import EmploymentStatus, EmployeeModel
from app.models.company.settings import EmploymentDefaults, CompanySettings
from app.services.employment_policy import (
    resolve_probation_days, resolve_notice_days, compute_probation_end_date,
    compute_probation_on_save, is_on_probation, is_on_notice,
)

D_ON = {"probation_enabled": True, "probation_days": 90, "notice_enabled": True, "notice_days": 30}
D_OFF = {"probation_enabled": False, "probation_days": 90, "notice_enabled": False, "notice_days": 30}


class TestSchema:
    def test_new_statuses(self):
        assert EmploymentStatus.PROBATION.value == "probation"
        assert EmploymentStatus.NOTICE_PERIOD.value == "notice_period"

    def test_settings_has_defaults(self):
        assert "employment_defaults" in CompanySettings.model_fields
        assert EmploymentDefaults().probation_days == 90
        assert EmploymentDefaults().notice_days == 30

    def test_old_employee_backward_compatible(self):
        e = EmployeeModel(company_id="c", employee_id="EMP1", full_name="X",
                          email="x@y.com", phone="9999999999")
        assert e.probation_use_company_default is True
        assert e.probation_end_date is None


class TestResolution:
    def test_default_disabled_no_probation(self):
        assert resolve_probation_days({"probation_use_company_default": True}, D_OFF) is None

    def test_default_enabled(self):
        assert resolve_probation_days({"probation_use_company_default": True}, D_ON) == 90

    def test_custom_override(self):
        assert resolve_probation_days(
            {"probation_use_company_default": False, "probation_days": 180}, D_ON) == 180

    def test_custom_zero_is_none(self):
        assert resolve_probation_days(
            {"probation_use_company_default": False, "probation_days": 0}, D_ON) is None

    @pytest.mark.parametrize("emp,defaults,exp", [
        ({"notice_use_company_default": True}, D_ON, 30),
        ({"notice_use_company_default": True}, D_OFF, 0),
        ({"notice_use_company_default": False, "notice_days": 45}, D_ON, 45),
        ({"notice_use_company_default": False, "notice_days": 0}, D_ON, 0),
    ])
    def test_notice(self, emp, defaults, exp):
        assert resolve_notice_days(emp, defaults) == exp


class TestDatesAndStatus:
    def test_end_date(self):
        assert compute_probation_end_date(date(2026, 1, 1), 90) == date(2026, 4, 1)

    def test_end_date_none_without_days(self):
        assert compute_probation_end_date(date(2026, 1, 1), None) is None

    def test_status_within_probation(self):
        emp = {"date_of_joining": date.today() - timedelta(days=10),
               "probation_use_company_default": True, "employment_status": "active"}
        _, end, status = compute_probation_on_save(emp, D_ON)
        assert status == "probation" and end is not None

    def test_status_after_probation(self):
        emp = {"date_of_joining": date.today() - timedelta(days=200),
               "probation_use_company_default": True, "employment_status": "active"}
        _, _, status = compute_probation_on_save(emp, D_ON)
        assert status == "active"

    def test_locked_status_preserved(self):
        emp = {"date_of_joining": date.today() - timedelta(days=5),
               "probation_use_company_default": True, "employment_status": "notice_period"}
        _, _, status = compute_probation_on_save(emp, D_ON)
        assert status == "notice_period"


class TestFlags:
    def test_on_probation_true(self):
        assert is_on_probation({"probation_end_date": date.today() + timedelta(days=5),
                                "employment_status": "probation"}) is True

    def test_on_probation_false_after_end(self):
        assert is_on_probation({"probation_end_date": date.today() - timedelta(days=1),
                                "employment_status": "active"}) is False

    def test_on_probation_false_when_on_notice(self):
        # Notice takes precedence — probation no longer gates.
        assert is_on_probation({"probation_end_date": date.today() + timedelta(days=5),
                                "employment_status": "notice_period"}) is False

    def test_on_notice_enum_and_string(self):
        assert is_on_notice({"employment_status": EmploymentStatus.NOTICE_PERIOD}) is True
        assert is_on_notice({"employment_status": "notice_period"}) is True
        assert is_on_notice({"employment_status": "active"}) is False
