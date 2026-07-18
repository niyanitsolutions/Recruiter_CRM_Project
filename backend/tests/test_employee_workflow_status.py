"""Tests for the employee status automation (Part 2).

Covers the reported bug: an employee whose background check is Verified must no
longer show 'Pending HR Review' — the derived workflow status advances to
'ready_for_approval' automatically.
"""
import pytest

from app.models.company.employee import compute_workflow_status, EmploymentStatus


def _complete(**over):
    e = {
        "phone": "9999999999", "date_of_birth": "1990-01-01", "gender": "male",
        "blood_group": "O+", "pan_number": "ABCDE1234F", "aadhaar_number": "123412341234",
        "address_info": {"street": "1 St", "city": "BLR", "state": "KA", "zip_code": "560001"},
        "department_name": "Eng", "designation_name": "SDE", "date_of_joining": "2026-01-01",
        "bank_details": {"bank_name": "HDFC", "account_number": "1", "ifsc_code": "HDFC0001",
                         "account_holder_name": "X"},
        "emergency_contacts": [{"name": "Mom", "relationship": "Parent", "phone": "9111111111"}],
        "qualifications": [{"title": "B.Tech"}],
        "background_check": {"status": "pending"},
        "documents": [{"doc_type": "id", "doc_name": "a", "file_url": "/x"}],
        "employment_status": "pending_hr_review",
    }
    e.update(over)
    return e


class TestWorkflowStatus:
    def test_bug_verified_bgv_advances(self):
        assert compute_workflow_status(_complete(background_check={"status": "verified"})) == "ready_for_approval"

    def test_complete_pending_bgv(self):
        assert compute_workflow_status(_complete()) == "pending_hr_review"

    def test_incomplete_profile(self):
        assert compute_workflow_status(_complete(bank_details={})) == "profile_incomplete"

    @pytest.mark.parametrize("s", ["active", "probation", "notice_period", "terminated", "resigned",
                                   "inactive", "on_leave"])
    def test_finalized_returned_as_is(self, s):
        assert compute_workflow_status(_complete(employment_status=s)) == s

    def test_enum_status_normalized(self):
        assert compute_workflow_status(_complete(employment_status=EmploymentStatus.ACTIVE)) == "active"

    def test_missing_status_treated_as_pipeline(self):
        e = _complete(background_check={"status": "verified"})
        e.pop("employment_status")
        assert compute_workflow_status(e) == "ready_for_approval"
