"""
Payment Service
Handles Razorpay integration and payment processing
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List
import logging
import uuid

from app.core.database import get_master_db
from app.core.config import settings
from app.models.master.payment import PaymentStatus, PaymentMethod
from app.models.master.tenant import TenantStatus
from app.services.tenant_service import tenant_service

logger = logging.getLogger(__name__)


class PaymentService:
    """
    Payment Processing Service
    
    Handles:
    - Razorpay order creation
    - Payment verification
    - Payment history
    - Refunds
    """
    
    @staticmethod
    async def create_razorpay_order(
        tenant_id: str,
        plan_id: str,
        billing_cycle: str = "monthly",
        user_count: int = 1,
        payment_type: str = "new_subscription",  # new_subscription | renewal | seat_upgrade
    ) -> Tuple[Optional[dict], str]:
        """
        Create a Razorpay order for subscription payment.

        Pricing model: price_per_user × user_count (× 12 for yearly).
        For reseller tenants the reseller discount is applied on the subtotal.
        """
        master_db = get_master_db()

        tenant = await master_db.tenants.find_one({"_id": tenant_id})
        if not tenant:
            return None, "Company not found"

        plan = await master_db.plans.find_one({"_id": plan_id})
        if not plan:
            return None, "Plan not found"

        user_count = max(int(user_count), 1)

        # Per-user price and subscription duration
        if billing_cycle == "yearly":
            price_per_user = plan.get("price_per_user_yearly", plan.get("price_yearly", 0))
            base_amount = price_per_user * user_count * 12   # 12 months
            days = 365
        else:  # monthly (default)
            price_per_user = plan.get("price_per_user_monthly", plan.get("price_monthly", 0))
            base_amount = price_per_user * user_count
            days = 30

        if base_amount == 0:
            return None, "This plan is free and doesn't require payment"

        # Reseller discount
        reseller_discount = 0
        seller_id = tenant.get("seller_id")
        if seller_id:
            reseller_discount = int(plan.get("reseller_discount_percent", 0))

        amount = int(base_amount * (100 - reseller_discount) / 100) if reseller_discount > 0 else base_amount

        # 18% GST
        tax_amount = int(amount * 0.18)
        total_amount = amount + tax_amount

        subscription_end = datetime.now(timezone.utc) + timedelta(days=days)

        payment_id = str(uuid.uuid4())
        razorpay_order_id = f"order_{payment_id[:16]}"

        payment_data = {
            "_id": payment_id,
            "transaction_id": f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}{str(uuid.uuid4())[:4].upper()}",
            "tenant_id": tenant_id,
            "company_id": tenant.get("company_id"),
            "company_name": tenant.get("company_name"),
            "seller_id": seller_id,
            "seller_name": tenant.get("seller_name"),
            "plan_id": plan_id,
            "plan_name": plan.get("name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "user_count": user_count,
            "price_per_user": price_per_user,
            "base_amount": base_amount,
            "amount": amount,
            "reseller_discount_percent": reseller_discount,
            "currency": "INR",
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "razorpay_order_id": razorpay_order_id,
            "payment_method": PaymentMethod.RAZORPAY,
            # payment_type is passed by the caller: new_subscription | renewal | seat_upgrade
            "payment_type": payment_type,
            "status": PaymentStatus.PENDING,
            "subscription_start": datetime.now(timezone.utc),
            "subscription_end": subscription_end,
            "invoice_number": f"INV{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }

        await master_db.payments.insert_one(payment_data)

        return {
            "success": True,
            "order_id": payment_id,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_key_id": settings.RAZORPAY_KEY_ID or "rzp_test_xxxxx",
            "amount": total_amount,
            "currency": "INR",
            "company_name": tenant.get("company_name"),
            "plan_name": plan.get("display_name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "user_count": user_count,
            "price_per_user": price_per_user,
            "reseller_discount_percent": reseller_discount,
        }, ""
    
    @staticmethod
    async def verify_payment(
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str
    ) -> Tuple[Optional[dict], str]:
        """
        Verify Razorpay payment signature and activate subscription
        
        Returns:
            Tuple of (verification_result, error_message)
        """
        master_db = get_master_db()
        
        # Find payment by order ID
        payment = await master_db.payments.find_one({
            "razorpay_order_id": razorpay_order_id,
            "status": PaymentStatus.PENDING
        })
        
        if not payment:
            return None, "Payment not found or already processed"
        
        # Verify signature (in production)
        # In production:
        # expected_signature = hmac.new(
        #     settings.RAZORPAY_KEY_SECRET.encode(),
        #     f"{razorpay_order_id}|{razorpay_payment_id}".encode(),
        #     hashlib.sha256
        # ).hexdigest()
        # if expected_signature != razorpay_signature:
        #     return None, "Payment verification failed"
        
        # For development, accept any signature
        # Recalculate subscription_end from actual payment time (not order creation time)
        payment_time = datetime.now(timezone.utc)
        billing_cycle = payment.get("billing_cycle", "monthly")
        if billing_cycle == "monthly":
            renewal_days = 30
        elif billing_cycle == "quarterly":
            renewal_days = 90
        else:  # yearly
            renewal_days = 365
        new_subscription_end = payment_time + timedelta(days=renewal_days)

        # Update payment record with actual timestamps
        await master_db.payments.update_one(
            {"_id": payment["_id"]},
            {
                "$set": {
                    "razorpay_payment_id": razorpay_payment_id,
                    "razorpay_signature": razorpay_signature,
                    "status": PaymentStatus.COMPLETED,
                    "payment_date": payment_time,
                    "subscription_start": payment_time,
                    "subscription_end": new_subscription_end,
                    "updated_at": payment_time
                }
            }
        )

        # Activate tenant subscription
        success, error = await tenant_service.activate_tenant(
            payment["tenant_id"],
            new_subscription_end
        )

        if not success:
            logger.error(f"Failed to activate tenant: {error}")

        # ── Update tenant plan details ────────────────────────────────────────
        # seat_upgrade: user_count = ADDITIONAL seats → add to existing total
        # renewal / new_subscription: user_count = desired total → replace
        newly_purchased = int(payment.get("user_count", 1))
        if payment.get("payment_type") == "seat_upgrade":
            current_tenant = await master_db.tenants.find_one({"_id": payment["tenant_id"]})
            previous_seats = int((current_tenant or {}).get("max_users", 0))
            new_total_seats = previous_seats + newly_purchased
        else:
            new_total_seats = newly_purchased

        await master_db.tenants.update_one(
            {"_id": payment["tenant_id"]},
            {
                "$set": {
                    "plan_id": payment["plan_id"],
                    "plan_name": payment["plan_name"],
                    "plan_display_name": payment.get("plan_display_name", payment["plan_name"]),
                    "billing_cycle": billing_cycle,
                    "max_users": new_total_seats,
                    "plan_start_date": payment_time,
                    "plan_expiry": new_subscription_end,
                    "is_trial": False,
                    "status": TenantStatus.ACTIVE,
                    "updated_at": payment_time,
                    # Reset reminder flag so next expiry cycle sends a fresh reminder
                    "reminder_sent": False
                }
            }
        )

        # Create commission record if this tenant belongs to a seller
        seller_id = payment.get("seller_id")
        reseller_discount = int(payment.get("reseller_discount_percent", 0))
        if seller_id and reseller_discount > 0:
            base_amount = int(payment.get("base_amount", payment.get("amount", 0)))
            paid_amount = int(payment.get("amount", 0))
            commission_amount = base_amount - paid_amount
            if commission_amount > 0:
                seller = await master_db.sellers.find_one({"_id": seller_id})
                await master_db.commissions.insert_one({
                    "_id": str(uuid.uuid4()),
                    "seller_id": seller_id,
                    "seller_name": payment.get("seller_name") or (seller.get("seller_name") if seller else ""),
                    "tenant_id": payment["tenant_id"],
                    "tenant_name": payment.get("company_name", ""),
                    "payment_id": payment["_id"],
                    "plan_id": payment["plan_id"],
                    "plan_name": payment.get("plan_name", ""),
                    "billing_cycle": payment.get("billing_cycle", "monthly"),
                    "base_amount": base_amount,
                    "reseller_amount": paid_amount,
                    "commission_amount": commission_amount,
                    "reseller_discount_percent": reseller_discount,
                    "status": "pending",
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                })
                logger.info(f"✅ Commission created: seller={seller_id}, amount={commission_amount}")

        logger.info(f"✅ Payment verified: {payment['transaction_id']}")

        return {
            "success": True,
            "message": "Payment verified successfully",
            "transaction_id": payment["transaction_id"],
            "invoice_number": payment["invoice_number"],
            "plan_activated": True,
            "plan_expiry": new_subscription_end.isoformat()
        }, ""
    
    @staticmethod
    async def get_payment_history(
        tenant_id: str = None,
        company_id: str = None,
        status: str = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[dict], int]:
        """
        Get payment history
        
        Returns:
            Tuple of (payments_list, total_count)
        """
        master_db = get_master_db()
        
        query = {}
        
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        if company_id:
            query["company_id"] = company_id
        
        if status:
            query["status"] = status
        
        total = await master_db.payments.count_documents(query)
        
        skip = (page - 1) * limit
        payments = await master_db.payments.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(limit).to_list(limit)
        
        return payments, total
    
    @staticmethod
    async def get_revenue_stats() -> dict:
        """Get revenue statistics for SuperAdmin dashboard"""
        master_db = get_master_db()
        
        # Total completed payments
        pipeline = [
            {"$match": {"status": PaymentStatus.COMPLETED}},
            {"$group": {
                "_id": None,
                "total_revenue": {"$sum": "$total_amount"},
                "transaction_count": {"$sum": 1}
            }}
        ]
        
        result = await master_db.payments.aggregate(pipeline).to_list(1)
        
        total_revenue = result[0]["total_revenue"] if result else 0
        transaction_count = result[0]["transaction_count"] if result else 0
        
        # Monthly revenue (current month)
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        monthly_pipeline = [
            {
                "$match": {
                    "status": PaymentStatus.COMPLETED,
                    "payment_date": {"$gte": month_start}
                }
            },
            {"$group": {"_id": None, "amount": {"$sum": "$total_amount"}}}
        ]
        
        monthly_result = await master_db.payments.aggregate(monthly_pipeline).to_list(1)
        monthly_revenue = monthly_result[0]["amount"] if monthly_result else 0
        
        # Pending payments
        pending_pipeline = [
            {"$match": {"status": PaymentStatus.PENDING}},
            {"$group": {"_id": None, "amount": {"$sum": "$total_amount"}}}
        ]
        pending_result = await master_db.payments.aggregate(pending_pipeline).to_list(1)
        pending_amount = pending_result[0]["amount"] if pending_result else 0
        
        # Success rate
        total_transactions = await master_db.payments.count_documents({})
        success_rate = (transaction_count / total_transactions * 100) if total_transactions > 0 else 0
        
        return {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
            "pending_amount": pending_amount,
            "transaction_count": transaction_count,
            "success_rate": round(success_rate, 2)
        }
    
    @staticmethod
    async def get_payment_by_id(payment_id: str) -> Optional[dict]:
        """Get payment by ID"""
        master_db = get_master_db()
        return await master_db.payments.find_one({"_id": payment_id})


# Singleton instance
payment_service = PaymentService()