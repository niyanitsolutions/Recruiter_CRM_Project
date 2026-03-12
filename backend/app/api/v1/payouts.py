"""
Partner Payout API Routes - Phase 4
Handles partner commissions, invoices, and payments
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from datetime import date

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions,
    require_role
)
from app.models.company.partner_payout import (
    PartnerPayoutCreate, PartnerPayoutResponse, PartnerPayoutListResponse,
    InvoiceCreate, InvoiceApprove, InvoiceReject, PaymentRecord,
    InvoiceResponse, InvoiceListResponse,
    PartnerPayoutStats, AccountsPayoutDashboard, PayoutStatus
)
from app.services.partner_payout_service import PartnerPayoutService

router = APIRouter(prefix="/payouts", tags=["Partner Payouts"])


# ============== Payout Endpoints ==============

@router.get("", response_model=PartnerPayoutListResponse)
async def list_payouts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    partner_id: Optional[str] = None,
    payout_status: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["payouts:view"])),
    db = Depends(get_company_db)
):
    """List payouts with filters"""
    service = PartnerPayoutService(db)
    
    # Partners can only see their own payouts
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    return await service.list_payouts(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        partner_id=partner_id,
        status=payout_status,
        from_date=from_date,
        to_date=to_date
    )


@router.get("/my-payouts", response_model=PartnerPayoutListResponse)
async def get_my_payouts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    payout_status: Optional[str] = None,
    current_user: dict = Depends(require_role(["partner"])),
    db = Depends(get_company_db)
):
    """Get current partner's payouts"""
    service = PartnerPayoutService(db)
    return await service.list_payouts(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        partner_id=current_user["id"],
        status=payout_status
    )


@router.get("/my-stats", response_model=PartnerPayoutStats)
async def get_my_payout_stats(
    current_user: dict = Depends(require_role(["partner"])),
    db = Depends(get_company_db)
):
    """Get current partner's payout statistics"""
    service = PartnerPayoutService(db)
    return await service.get_partner_stats(
        partner_id=current_user["id"],
        company_id=current_user["company_id"]
    )


@router.get("/eligible")
async def get_eligible_payouts(
    current_user: dict = Depends(require_role(["partner"])),
    db = Depends(get_company_db)
):
    """Get payouts eligible for invoice (Partner)"""
    service = PartnerPayoutService(db)
    result = await service.list_payouts(
        company_id=current_user["company_id"],
        partner_id=current_user["id"],
        status=PayoutStatus.ELIGIBLE.value,
        page_size=100
    )
    return result.items


@router.get("/accounts-dashboard", response_model=AccountsPayoutDashboard)
async def get_accounts_dashboard(
    current_user: dict = Depends(require_permissions(["payouts:view"])),
    db = Depends(get_company_db)
):
    """Get accounts team payout dashboard"""
    service = PartnerPayoutService(db)
    return await service.get_accounts_dashboard(current_user["company_id"])


@router.get("/{payout_id}", response_model=PartnerPayoutResponse)
async def get_payout(
    payout_id: str,
    current_user: dict = Depends(require_permissions(["payouts:view"])),
    db = Depends(get_company_db)
):
    """Get payout by ID"""
    service = PartnerPayoutService(db)
    payout = await service.get_payout_by_id(payout_id, current_user["company_id"])
    
    if not payout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payout not found"
        )
    
    # Partners can only see their own payouts
    if current_user.get("role") == "partner" and payout.partner_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return payout


@router.post("/update-eligibility")
async def update_payout_eligibility(
    current_user: dict = Depends(require_permissions(["payouts:edit"])),
    db = Depends(get_company_db)
):
    """Update payout eligibility for all pending payouts (scheduler/admin)"""
    service = PartnerPayoutService(db)
    count = await service.update_payout_eligibility(current_user["company_id"])
    return {"message": f"Updated {count} payouts to eligible"}


# ============== Invoice Endpoints ==============

@router.post("/invoices", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
async def raise_invoice(
    data: InvoiceCreate,
    current_user: dict = Depends(require_role(["partner"])),
    db = Depends(get_company_db)
):
    """Raise invoice for eligible payouts (Partner)"""
    service = PartnerPayoutService(db)
    
    try:
        return await service.raise_invoice(
            data=data,
            company_id=current_user["company_id"],
            partner_id=current_user["id"],
            created_by=current_user["id"]
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/invoices", response_model=InvoiceListResponse)
async def list_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    partner_id: Optional[str] = None,
    invoice_status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["invoices:view"])),
    db = Depends(get_company_db)
):
    """List invoices with filters"""
    service = PartnerPayoutService(db)
    
    # Partners can only see their own invoices
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    return await service.list_invoices(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        partner_id=partner_id,
        status=invoice_status
    )


@router.get("/invoices/my-invoices", response_model=InvoiceListResponse)
async def get_my_invoices(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    invoice_status: Optional[str] = None,
    current_user: dict = Depends(require_role(["partner"])),
    db = Depends(get_company_db)
):
    """Get current partner's invoices"""
    service = PartnerPayoutService(db)
    return await service.list_invoices(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        partner_id=current_user["id"],
        status=invoice_status
    )


@router.get("/invoices/pending-approval")
async def get_pending_approval_invoices(
    current_user: dict = Depends(require_permissions(["invoices:approve"])),
    db = Depends(get_company_db)
):
    """Get invoices pending approval (Accounts)"""
    service = PartnerPayoutService(db)
    result = await service.list_invoices(
        company_id=current_user["company_id"],
        status="submitted",
        page_size=100
    )
    return result.items


@router.get("/invoices/pending-payment")
async def get_pending_payment_invoices(
    current_user: dict = Depends(require_permissions(["invoices:approve"])),
    db = Depends(get_company_db)
):
    """Get invoices pending payment (Accounts)"""
    service = PartnerPayoutService(db)
    result = await service.list_invoices(
        company_id=current_user["company_id"],
        status="approved",
        page_size=100
    )
    return result.items


@router.get("/invoices/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    current_user: dict = Depends(require_permissions(["invoices:view"])),
    db = Depends(get_company_db)
):
    """Get invoice by ID"""
    service = PartnerPayoutService(db)
    invoice = await service.get_invoice_by_id(invoice_id, current_user["company_id"])
    
    if not invoice:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found"
        )
    
    # Partners can only see their own invoices
    if current_user.get("role") == "partner" and invoice.partner_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return invoice


@router.post("/invoices/{invoice_id}/approve", response_model=InvoiceResponse)
async def approve_invoice(
    invoice_id: str,
    data: InvoiceApprove,
    current_user: dict = Depends(require_permissions(["invoices:approve"])),
    db = Depends(get_company_db)
):
    """Approve invoice (Accounts)"""
    service = PartnerPayoutService(db)
    result = await service.approve_invoice(
        invoice_id=invoice_id,
        data=data,
        company_id=current_user["company_id"],
        approved_by=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or not in submitted status"
        )
    
    return result


@router.post("/invoices/{invoice_id}/reject", response_model=InvoiceResponse)
async def reject_invoice(
    invoice_id: str,
    data: InvoiceReject,
    current_user: dict = Depends(require_permissions(["invoices:approve"])),
    db = Depends(get_company_db)
):
    """Reject invoice (Accounts)"""
    service = PartnerPayoutService(db)
    result = await service.reject_invoice(
        invoice_id=invoice_id,
        data=data,
        company_id=current_user["company_id"],
        rejected_by=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or not in submitted status"
        )
    
    return result


@router.post("/invoices/{invoice_id}/record-payment", response_model=InvoiceResponse)
async def record_payment(
    invoice_id: str,
    data: PaymentRecord,
    current_user: dict = Depends(require_permissions(["invoices:approve"])),
    db = Depends(get_company_db)
):
    """Record payment for invoice (Accounts)"""
    service = PartnerPayoutService(db)
    result = await service.record_payment(
        invoice_id=invoice_id,
        data=data,
        company_id=current_user["company_id"],
        recorded_by=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invoice not found or not in approved status"
        )
    
    return result


# ============== Partner Stats ==============

@router.get("/partner/{partner_id}/stats", response_model=PartnerPayoutStats)
async def get_partner_stats(
    partner_id: str,
    current_user: dict = Depends(require_permissions(["payouts:view"])),
    db = Depends(get_company_db)
):
    """Get payout statistics for a partner"""
    service = PartnerPayoutService(db)
    return await service.get_partner_stats(
        partner_id=partner_id,
        company_id=current_user["company_id"]
    )