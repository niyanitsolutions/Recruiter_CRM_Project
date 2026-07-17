"""Tests for the Internal Hiring applicant-edit enhancement (Part 1, section 1).

Pure-schema tests: verify HR can edit the full set of applicant fields the
feature requires, that the new current_salary field exists on the model, and
that Reject/Withdraw stage transitions are accepted by the update schema.
"""
import pytest

from app.models.company.hrm_candidate import (
    HRMCandidateModel,
    HRMCandidateCreate,
    HRMCandidateUpdate,
    HiringStage,
)


# Fields Section 1 requires HR to be able to edit (model attribute names).
EDITABLE_FIELDS = {
    "full_name", "email", "phone", "current_company", "current_designation",
    "total_experience_years", "skills", "resume_url", "current_salary",
    "expected_salary", "notice_period_days", "notes",
}


class TestCurrentSalaryField:
    def test_current_salary_on_model(self):
        assert "current_salary" in HRMCandidateModel.model_fields

    def test_current_salary_on_create(self):
        assert "current_salary" in HRMCandidateCreate.model_fields

    def test_create_accepts_current_salary(self):
        c = HRMCandidateCreate(
            full_name="A B", email="a@b.com", phone="+911234567890",
            current_salary=1500000,
        )
        assert c.current_salary == 1500000


class TestApplicantEditSchema:
    def test_all_required_editable_fields_present(self):
        missing = EDITABLE_FIELDS - set(HRMCandidateUpdate.model_fields)
        assert not missing, f"edit schema missing fields: {missing}"

    def test_full_edit_payload_round_trips(self):
        u = HRMCandidateUpdate(
            full_name="New Name",
            email="new@example.com",
            phone="+919999999999",
            current_company="Acme",
            current_designation="SDE2",
            total_experience_years=6.5,
            skills=["python", "fastapi"],
            resume_url="/api/v1/uploads/resumes/x.pdf",
            current_salary=1800000,
            expected_salary=2400000,
            notice_period_days=30,
            location="Bengaluru",
            notes="strong react",
        )
        dumped = u.model_dump(exclude_none=True)
        for f in EDITABLE_FIELDS:
            assert f in dumped

    def test_partial_edit_only_sends_provided_fields(self):
        u = HRMCandidateUpdate(phone="+911111111111", notes="edited")
        dumped = u.model_dump(exclude_none=True)
        assert dumped == {"phone": "+911111111111", "notes": "edited"}

    def test_invalid_email_rejected(self):
        with pytest.raises(Exception):
            HRMCandidateUpdate(email="not-an-email")

    @pytest.mark.parametrize("stage", ["rejected", "withdrawn"])
    def test_reject_and_withdraw_stages_accepted(self, stage):
        u = HRMCandidateUpdate(current_stage=stage)
        assert u.current_stage == HiringStage(stage)

    def test_empty_update_is_valid(self):
        # A no-op update must not raise (frontend may submit unchanged form).
        assert HRMCandidateUpdate().model_dump(exclude_none=True) == {}
