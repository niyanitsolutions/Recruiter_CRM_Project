"""
Partner Payout Service - Phase 4
Handles partner commissions, invoices, and payments
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional
from bson import ObjectId
import math

from app.models.company.partner_payout import (
    PartnerPayoutCreate, PartnerPayoutResponse,
    PartnerPayoutListResponse, PayoutStatus, InvoiceStatus,
    InvoiceCreate, InvoiceApprove, InvoiceReject, PaymentRecord,
    InvoiceResponse, InvoiceListResponse, InvoiceItem,
    PartnerPayoutStats, AccountsPayoutDashboard,
    PayoutCalculation
)


class PartnerPayoutService:
    """Service for partner payout operations"""
    
    def __init__(self, db):
        self.db = db
        self.payouts_collection = db.partner_payouts
        self.invoices_collection = db.partner_invoices
    
    # ============== Payout CRUD ==============
    
    async def create_payout(
        self,
        data: PartnerPayoutCreate,
        company_id: str,
        created_by: str
    ) -> PartnerPayoutResponse:
        """Create payout record"""
        # Calculate payout
        calculation = PayoutCalculation.calculate(
            ctc=data.candidate_ctc,
            rule=data.commission_rule
        )
        
        payout_eligible_date = data.joined_date + timedelta(days=data.payout_days_required)
        
        # Get partner details
        partner = await self.db.users.find_one({"id": data.partner_id})
        candidate = await self.db.candidates.find_one({"id": data.candidate_id})
        job = await self.db.jobs.find_one({"id": data.job_id})
        client = await self.db.clients.find_one({"id": data.client_id})
        
        payout_data = {
            **data.model_dump(),
            "id": str(ObjectId()),
            "company_id": company_id,
            "payout_eligible_date": payout_eligible_date.isoformat(),
            "calculation": calculation.model_dump(),
            "status": PayoutStatus.PENDING.value,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": created_by,
            "is_deleted": False,
            # Denormalized
            "partner_name": partner.get("full_name") if partner else None,
            "candidate_name": candidate.get("full_name") if candidate else None,
            "job_title": job.get("title") if job else None,
            "client_name": client.get("name") if client else None
        }
        
        # Convert date objects to strings
        payout_data["joined_date"] = data.joined_date.isoformat()
        payout_data["commission_rule"] = data.commission_rule.model_dump()
        
        await self.payouts_collection.insert_one(payout_data)
        return PartnerPayoutResponse(**payout_data)
    
    async def get_payout_by_id(
        self,
        payout_id: str,
        company_id: str
    ) -> Optional[PartnerPayoutResponse]:
        """Get payout by ID"""
        payout = await self.payouts_collection.find_one({
            "id": payout_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if payout:
            # Calculate days remaining
            payout_eligible_date = payout.get("payout_eligible_date")
            if payout_eligible_date:
                if isinstance(payout_eligible_date, str):
                    payout_eligible_date = date.fromisoformat(payout_eligible_date)
                days_remaining = (payout_eligible_date - date.today()).days
                payout["days_remaining"] = max(0, days_remaining)
            
            return PartnerPayoutResponse(**payout)
        return None
    
    async def list_payouts(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        partner_id: Optional[str] = None,
        status: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> PartnerPayoutListResponse:
        """List payouts with filters"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if partner_id:
            query["partner_id"] = partner_id
        if status:
            query["status"] = status
        if from_date:
            query["joined_date"] = {"$gte": from_date.isoformat()}
        if to_date:
            if "joined_date" in query:
                query["joined_date"]["$lte"] = to_date.isoformat()
            else:
                query["joined_date"] = {"$lte": to_date.isoformat()}
        
        total = await self.payouts_collection.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.payouts_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for payout in cursor:
            # Calculate days remaining
            payout_eligible_date = payout.get("payout_eligible_date")
            if payout_eligible_date:
                if isinstance(payout_eligible_date, str):
                    payout_eligible_date = date.fromisoformat(payout_eligible_date)
                days_remaining = (payout_eligible_date - date.today()).days
                payout["days_remaining"] = max(0, days_remaining)
            items.append(PartnerPayoutResponse(**payout))
        
        return PartnerPayoutListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total > 0 else 1
        )
    
    # ============== Payout Status ==============
    
    async def update_payout_eligibility(self, company_id: str) -> int:
        """Update payout eligibility for all pending payouts (run daily)"""
        today = date.today()
        updated_count = 0
        
        cursor = self.payouts_collection.find({
            "company_id": company_id,
            "status": PayoutStatus.PENDING.value,
            "is_deleted": False
        })
        
        async for payout in cursor:
            payout_eligible_date = payout.get("payout_eligible_date")
            if payout_eligible_date:
                if isinstance(payout_eligible_date, str):
                    payout_eligible_date = date.fromisoformat(payout_eligible_date)
                
                if today >= payout_eligible_date:
                    await self.payouts_collection.update_one(
                        {"id": payout["id"]},
                        {
                            "$set": {
                                "status": PayoutStatus.ELIGIBLE.value,
                                "updated_at": datetime.now(timezone.utc)
                            }
                        }
                    )
                    updated_count += 1
        
        return updated_count
    
    # ============== Invoice Management ==============
    
    async def raise_invoice(
        self,
        data: InvoiceCreate,
        company_id: str,
        partner_id: str,
        created_by: str
    ) -> InvoiceResponse:
        """Raise invoice for eligible payouts"""
        # Get all payouts for this invoice
        payouts = []
        async for payout in self.payouts_collection.find({
            "id": {"$in": data.payout_ids},
            "company_id": company_id,
            "partner_id": partner_id,
            "status": PayoutStatus.ELIGIBLE.value,
            "is_deleted": False
        }):
            payouts.append(payout)
        
        if not payouts:
            raise ValueError("No eligible payouts found")
        
        # Get partner details
        partner = await self.db.users.find_one({"id": partner_id})
        
        # Build invoice items
        items = []
        subtotal = 0
        total_gst = 0
        
        for payout in payouts:
            calc = payout.get("calculation", {})
            item = InvoiceItem(
                onboard_id=payout.get("onboard_id"),
                candidate_id=payout.get("candidate_id"),
                candidate_name=payout.get("candidate_name", ""),
                job_title=payout.get("job_title", ""),
                client_name=payout.get("client_name", ""),
                joined_date=date.fromisoformat(payout.get("joined_date")) if payout.get("joined_date") else date.today(),
                ctc=payout.get("candidate_ctc", 0),
                commission_amount=calc.get("gross_amount", 0),
                gst_amount=calc.get("gst_amount", 0),
                total_amount=calc.get("gross_amount", 0) + calc.get("gst_amount", 0)
            )
            items.append(item)
            subtotal += calc.get("gross_amount", 0)
            total_gst += calc.get("gst_amount", 0)
        
        # Generate invoice number
        invoice_count = await self.invoices_collection.count_documents({"company_id": company_id})
        invoice_number = f"INV-{company_id[:6].upper()}-{str(invoice_count + 1).zfill(6)}"
        
        # Calculate TDS
        tds_amount = subtotal * 0.10  # 10% TDS
        total_amount = subtotal + total_gst - tds_amount
        
        invoice_data = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "partner_id": partner_id,
            "invoice_number": invoice_number,
            "invoice_date": data.invoice_date.isoformat(),
            "due_date": (data.invoice_date + timedelta(days=30)).isoformat(),
            "payout_ids": data.payout_ids,
            "items": [item.model_dump() for item in items],
            "subtotal": round(subtotal, 2),
            "gst_amount": round(total_gst, 2),
            "tds_amount": round(tds_amount, 2),
            "total_amount": round(total_amount, 2),
            "status": InvoiceStatus.SUBMITTED.value,
            "notes": data.notes,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": created_by,
            "is_deleted": False,
            # Denormalized
            "partner_name": partner.get("full_name") if partner else None,
            "partner_email": partner.get("email") if partner else None,
            "partner_mobile": partner.get("mobile") if partner else None
        }
        
        await self.invoices_collection.insert_one(invoice_data)
        
        # Update payout statuses
        await self.payouts_collection.update_many(
            {"id": {"$in": data.payout_ids}},
            {
                "$set": {
                    "status": PayoutStatus.INVOICE_RAISED.value,
                    "invoice_number": invoice_number,
                    "invoice_date": data.invoice_date.isoformat(),
                    "invoice_status": InvoiceStatus.SUBMITTED.value,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return InvoiceResponse(**invoice_data)
    
    async def get_invoice_by_id(
        self,
        invoice_id: str,
        company_id: str
    ) -> Optional[InvoiceResponse]:
        """Get invoice by ID"""
        invoice = await self.invoices_collection.find_one({
            "id": invoice_id,
            "company_id": company_id,
            "is_deleted": False
        })
        return InvoiceResponse(**invoice) if invoice else None
    
    async def list_invoices(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        partner_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> InvoiceListResponse:
        """List invoices with filters"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if partner_id:
            query["partner_id"] = partner_id
        if status:
            query["status"] = status
        
        total = await self.invoices_collection.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.invoices_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [InvoiceResponse(**doc) async for doc in cursor]
        
        return InvoiceListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total > 0 else 1
        )
    
    async def approve_invoice(
        self,
        invoice_id: str,
        data: InvoiceApprove,
        company_id: str,
        approved_by: str
    ) -> Optional[InvoiceResponse]:
        """Approve invoice (Accounts team)"""
        invoice = await self.invoices_collection.find_one({
            "id": invoice_id,
            "company_id": company_id,
            "status": InvoiceStatus.SUBMITTED.value,
            "is_deleted": False
        })
        
        if not invoice:
            return None
        
        result = await self.invoices_collection.find_one_and_update(
            {"id": invoice_id, "company_id": company_id},
            {
                "$set": {
                    "status": InvoiceStatus.APPROVED.value,
                    "approved_by": approved_by,
                    "approved_at": datetime.now(timezone.utc),
                    "approved_amount": data.approved_amount or invoice.get("total_amount"),
                    "accounts_notes": data.notes,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        # Update payout statuses
        await self.payouts_collection.update_many(
            {"id": {"$in": invoice.get("payout_ids", [])}},
            {
                "$set": {
                    "status": PayoutStatus.INVOICE_APPROVED.value,
                    "invoice_status": InvoiceStatus.APPROVED.value,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return InvoiceResponse(**result) if result else None
    
    async def reject_invoice(
        self,
        invoice_id: str,
        data: InvoiceReject,
        company_id: str,
        rejected_by: str
    ) -> Optional[InvoiceResponse]:
        """Reject invoice (Accounts team)"""
        invoice = await self.invoices_collection.find_one({
            "id": invoice_id,
            "company_id": company_id,
            "status": InvoiceStatus.SUBMITTED.value,
            "is_deleted": False
        })
        
        if not invoice:
            return None
        
        result = await self.invoices_collection.find_one_and_update(
            {"id": invoice_id, "company_id": company_id},
            {
                "$set": {
                    "status": InvoiceStatus.REJECTED.value,
                    "rejected_by": rejected_by,
                    "rejected_at": datetime.now(timezone.utc),
                    "rejection_reason": data.rejection_reason,
                    "accounts_notes": data.notes,
                    "updated_at": datetime.now(timezone.utc)
                }
            },
            return_document=True
        )
        
        # Revert payout statuses to eligible (can re-raise)
        await self.payouts_collection.update_many(
            {"id": {"$in": invoice.get("payout_ids", [])}},
            {
                "$set": {
                    "status": PayoutStatus.ELIGIBLE.value,
                    "invoice_status": InvoiceStatus.REJECTED.value,
                    "rejection_reason": data.rejection_reason,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return InvoiceResponse(**result) if result else None
    
    async def record_payment(
        self,
        invoice_id: str,
        data: PaymentRecord,
        company_id: str,
        recorded_by: str
    ) -> Optional[InvoiceResponse]:
        """Record payment for approved invoice (Accounts team)"""
        invoice = await self.invoices_collection.find_one({
            "id": invoice_id,
            "company_id": company_id,
            "status": InvoiceStatus.APPROVED.value,
            "is_deleted": False
        })
        
        if not invoice:
            return None
        
        result = await self.invoices_collection.find_one_and_update(
            {"id": invoice_id, "company_id": company_id},
            {
                "$set": {
                    "status": InvoiceStatus.PAID.value,
                    "paid_at": datetime.now(timezone.utc),
                    "payment_details": data.model_dump(),
                    "updated_at": datetime.now(timezone.utc),
                    "updated_by": recorded_by
                }
            },
            return_document=True
        )
        
        # Update payout statuses
        await self.payouts_collection.update_many(
            {"id": {"$in": invoice.get("payout_ids", [])}},
            {
                "$set": {
                    "status": PayoutStatus.PAID.value,
                    "payment_date": data.payment_date.isoformat(),
                    "payment_method": data.payment_method.value,
                    "payment_reference": data.payment_reference,
                    "payment_notes": data.notes,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        return InvoiceResponse(**result) if result else None
    
    # ============== Partner Stats ==============
    
    async def get_partner_stats(
        self,
        partner_id: str,
        company_id: str
    ) -> PartnerPayoutStats:
        """Get payout statistics for a partner"""
        today = date.today()
        first_of_month = today.replace(day=1)
        
        # Get status counts
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "partner_id": partner_id,
                "is_deleted": False
            }},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1},
                "amount": {"$sum": "$calculation.net_amount"}
            }}
        ]
        
        status_data = {}
        async for doc in self.payouts_collection.aggregate(pipeline):
            status_data[doc["_id"]] = {
                "count": doc["count"],
                "amount": doc["amount"]
            }
        
        # Calculate totals
        total_placements = sum(d["count"] for d in status_data.values())
        pending = status_data.get(PayoutStatus.PENDING.value, {"count": 0, "amount": 0})
        eligible = status_data.get(PayoutStatus.ELIGIBLE.value, {"count": 0, "amount": 0})
        invoice_raised = status_data.get(PayoutStatus.INVOICE_RAISED.value, {"count": 0, "amount": 0})
        invoice_approved = status_data.get(PayoutStatus.INVOICE_APPROVED.value, {"count": 0, "amount": 0})
        paid = status_data.get(PayoutStatus.PAID.value, {"count": 0, "amount": 0})
        
        # This month earnings
        this_month_pipeline = [
            {"$match": {
                "company_id": company_id,
                "partner_id": partner_id,
                "status": PayoutStatus.PAID.value,
                "payment_date": {"$gte": first_of_month.isoformat()},
                "is_deleted": False
            }},
            {"$group": {
                "_id": None,
                "total": {"$sum": "$calculation.net_amount"}
            }}
        ]
        
        this_month = 0
        async for doc in self.payouts_collection.aggregate(this_month_pipeline):
            this_month = doc.get("total", 0)
        
        # Pending invoices
        invoices_pending = await self.invoices_collection.count_documents({
            "company_id": company_id,
            "partner_id": partner_id,
            "status": {"$in": [InvoiceStatus.SUBMITTED.value, InvoiceStatus.APPROVED.value]},
            "is_deleted": False
        })
        
        return PartnerPayoutStats(
            total_placements=total_placements,
            pending_payouts=pending["count"],
            eligible_payouts=eligible["count"],
            invoices_raised=invoice_raised["count"],
            invoices_approved=invoice_approved["count"],
            invoices_pending=invoices_pending,
            total_paid=paid["amount"],
            total_pending_amount=pending["amount"] + eligible["amount"],
            this_month_earnings=this_month
        )
    
    async def get_accounts_dashboard(
        self,
        company_id: str
    ) -> AccountsPayoutDashboard:
        """Get payout dashboard for accounts team"""
        today = date.today()
        first_of_month = today.replace(day=1)
        first_of_quarter = today.replace(month=((today.month - 1) // 3) * 3 + 1, day=1)
        
        # Pending approvals
        pending_approvals = await self.invoices_collection.count_documents({
            "company_id": company_id,
            "status": InvoiceStatus.SUBMITTED.value,
            "is_deleted": False
        })
        
        # Pending payments
        pending_payments = await self.invoices_collection.count_documents({
            "company_id": company_id,
            "status": InvoiceStatus.APPROVED.value,
            "is_deleted": False
        })
        
        # Total pending amount
        pending_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": {"$in": [InvoiceStatus.SUBMITTED.value, InvoiceStatus.APPROVED.value]},
                "is_deleted": False
            }},
            {"$group": {
                "_id": None,
                "total": {"$sum": "$total_amount"}
            }}
        ]
        
        total_pending = 0
        async for doc in self.invoices_collection.aggregate(pending_pipeline):
            total_pending = doc.get("total", 0)
        
        # Paid this month
        paid_month_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": InvoiceStatus.PAID.value,
                "paid_at": {"$gte": datetime.combine(first_of_month, datetime.min.time())},
                "is_deleted": False
            }},
            {"$group": {
                "_id": None,
                "total": {"$sum": "$total_amount"}
            }}
        ]
        
        paid_month = 0
        async for doc in self.invoices_collection.aggregate(paid_month_pipeline):
            paid_month = doc.get("total", 0)
        
        # Paid this quarter
        paid_quarter_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": InvoiceStatus.PAID.value,
                "paid_at": {"$gte": datetime.combine(first_of_quarter, datetime.min.time())},
                "is_deleted": False
            }},
            {"$group": {
                "_id": None,
                "total": {"$sum": "$total_amount"}
            }}
        ]
        
        paid_quarter = 0
        async for doc in self.invoices_collection.aggregate(paid_quarter_pipeline):
            paid_quarter = doc.get("total", 0)
        
        # Overdue payments (approved but not paid for 30+ days)
        overdue_date = today - timedelta(days=30)
        overdue = await self.invoices_collection.count_documents({
            "company_id": company_id,
            "status": InvoiceStatus.APPROVED.value,
            "approved_at": {"$lte": datetime.combine(overdue_date, datetime.min.time())},
            "is_deleted": False
        })
        
        # Partners with pending
        partners_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": {"$in": [InvoiceStatus.SUBMITTED.value, InvoiceStatus.APPROVED.value]},
                "is_deleted": False
            }},
            {"$group": {
                "_id": "$partner_id"
            }},
            {"$count": "total"}
        ]
        
        partners_with_pending = 0
        async for doc in self.invoices_collection.aggregate(partners_pipeline):
            partners_with_pending = doc.get("total", 0)
        
        return AccountsPayoutDashboard(
            pending_approvals=pending_approvals,
            pending_payments=pending_payments,
            total_pending_amount=total_pending,
            paid_this_month=paid_month,
            paid_this_quarter=paid_quarter,
            overdue_payments=overdue,
            partners_with_pending=partners_with_pending
        )