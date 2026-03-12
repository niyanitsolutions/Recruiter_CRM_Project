"""
Notification Service - Phase 4
Handles notifications, auto-reminders, and scheduled tasks
"""
from datetime import datetime, date, timedelta
from typing import Optional, List
from bson import ObjectId

from app.models.company.notification import (
    NotificationCreate, NotificationResponse,
    NotificationListResponse, NotificationType, NotificationChannel,
    NotificationPriority, NotificationStatus,
    ScheduledReminderCreate, ScheduledReminderInDB,
    ScheduledReminderType, ScheduledReminderStatus,
    NotificationPreference, NotificationPreferenceUpdate
)


class NotificationService:
    """Service for notification operations"""
    
    def __init__(self, db):
        self.db = db
        self.notifications_collection = db.notifications
        self.reminders_collection = db.scheduled_reminders
        self.preferences_collection = db.notification_preferences
    
    # ============== Notification CRUD ==============
    
    async def create_notification(
        self,
        data: NotificationCreate,
        company_id: str
    ) -> NotificationResponse:
        """Create a notification"""
        # Initialize channel status
        channel_status = {
            channel.value: NotificationStatus.PENDING.value
            for channel in data.channels
        }
        
        notification_data = {
            **data.model_dump(),
            "id": str(ObjectId()),
            "company_id": company_id,
            "channels": [c.value for c in data.channels],
            "channel_status": channel_status,
            "is_read": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "is_deleted": False
        }
        
        await self.notifications_collection.insert_one(notification_data)
        
        # Send via channels (async task in production)
        await self._send_notification(notification_data)
        
        return NotificationResponse(**notification_data)
    
    async def create_bulk_notifications(
        self,
        notifications: List[NotificationCreate],
        company_id: str
    ) -> List[NotificationResponse]:
        """Create multiple notifications"""
        results = []
        for data in notifications:
            result = await self.create_notification(data, company_id)
            results.append(result)
        return results
    
    async def get_notification_by_id(
        self,
        notification_id: str,
        company_id: str
    ) -> Optional[NotificationResponse]:
        """Get notification by ID"""
        notification = await self.notifications_collection.find_one({
            "id": notification_id,
            "company_id": company_id,
            "is_deleted": False
        })
        return NotificationResponse(**notification) if notification else None
    
    async def list_notifications(
        self,
        user_id: str,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        is_read: Optional[bool] = None,
        notification_type: Optional[str] = None
    ) -> NotificationListResponse:
        """List notifications for a user"""
        query = {
            "company_id": company_id,
            "user_id": user_id,
            "is_deleted": False
        }
        
        if is_read is not None:
            query["is_read"] = is_read
        if notification_type:
            query["type"] = notification_type
        
        total = await self.notifications_collection.count_documents(query)
        unread_count = await self.notifications_collection.count_documents({
            **query,
            "is_read": False
        })
        
        skip = (page - 1) * page_size
        cursor = self.notifications_collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [NotificationResponse(**doc) async for doc in cursor]
        
        return NotificationListResponse(
            items=items,
            total=total,
            unread_count=unread_count,
            page=page,
            page_size=page_size
        )
    
    async def mark_as_read(
        self,
        notification_id: str,
        user_id: str,
        company_id: str
    ) -> bool:
        """Mark notification as read"""
        result = await self.notifications_collection.update_one(
            {
                "id": notification_id,
                "user_id": user_id,
                "company_id": company_id
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
    async def mark_all_as_read(
        self,
        user_id: str,
        company_id: str
    ) -> int:
        """Mark all notifications as read"""
        result = await self.notifications_collection.update_many(
            {
                "user_id": user_id,
                "company_id": company_id,
                "is_read": False
            },
            {
                "$set": {
                    "is_read": True,
                    "read_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count
    
    async def delete_notification(
        self,
        notification_id: str,
        user_id: str,
        company_id: str
    ) -> bool:
        """Soft delete notification"""
        result = await self.notifications_collection.update_one(
            {
                "id": notification_id,
                "user_id": user_id,
                "company_id": company_id
            },
            {
                "$set": {
                    "is_deleted": True,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        return result.modified_count > 0
    
    # ============== Scheduled Reminders ==============
    
    async def create_scheduled_reminder(
        self,
        data: ScheduledReminderCreate,
        company_id: str,
        created_by: str
    ) -> ScheduledReminderInDB:
        """Create a scheduled reminder"""
        reminder_data = {
            **data.model_dump(),
            "id": str(ObjectId()),
            "company_id": company_id,
            "channels": [c.value for c in data.channels],
            "status": ScheduledReminderStatus.SCHEDULED.value,
            "created_at": datetime.utcnow(),
            "created_by": created_by,
            "is_deleted": False
        }
        
        await self.reminders_collection.insert_one(reminder_data)
        return ScheduledReminderInDB(**reminder_data)
    
    async def get_due_reminders(
        self,
        company_id: str
    ) -> List[ScheduledReminderInDB]:
        """Get reminders that are due to be sent"""
        now = datetime.utcnow()
        
        cursor = self.reminders_collection.find({
            "company_id": company_id,
            "status": ScheduledReminderStatus.SCHEDULED.value,
            "scheduled_date": {"$lte": now},
            "is_deleted": False
        })
        
        return [ScheduledReminderInDB(**doc) async for doc in cursor]
    
    async def process_due_reminders(
        self,
        company_id: str
    ) -> int:
        """Process and send all due reminders (run by scheduler)"""
        due_reminders = await self.get_due_reminders(company_id)
        processed_count = 0
        
        for reminder in due_reminders:
            try:
                # Create notifications for each recipient
                for recipient_id in reminder.recipient_ids:
                    notification = NotificationCreate(
                        user_id=recipient_id,
                        user_type="user",
                        type=NotificationType.SYSTEM_ALERT,
                        title=reminder.title,
                        message=reminder.message,
                        data={
                            "reminder_type": reminder.reminder_type.value,
                            "reference_id": reminder.reference_id,
                            "reference_type": reminder.reference_type
                        },
                        channels=[NotificationChannel(c) for c in reminder.channels],
                        priority=NotificationPriority.MEDIUM
                    )
                    await self.create_notification(notification, company_id)
                
                # Update reminder status
                update_data = {
                    "status": ScheduledReminderStatus.SENT.value,
                    "sent_at": datetime.utcnow()
                }
                
                # Handle recurring reminders
                if reminder.is_recurring and reminder.recurrence_pattern:
                    next_date = self._calculate_next_occurrence(
                        reminder.scheduled_date,
                        reminder.recurrence_pattern
                    )
                    update_data["next_occurrence"] = next_date
                    update_data["status"] = ScheduledReminderStatus.SCHEDULED.value
                    update_data["scheduled_date"] = next_date
                
                await self.reminders_collection.update_one(
                    {"id": reminder.id},
                    {"$set": update_data}
                )
                processed_count += 1
                
            except Exception as e:
                # Log error and mark as failed
                await self.reminders_collection.update_one(
                    {"id": reminder.id},
                    {
                        "$set": {
                            "status": ScheduledReminderStatus.FAILED.value,
                            "failure_reason": str(e)
                        }
                    }
                )
        
        return processed_count
    
    async def cancel_reminder(
        self,
        reminder_id: str,
        company_id: str
    ) -> bool:
        """Cancel a scheduled reminder"""
        result = await self.reminders_collection.update_one(
            {
                "id": reminder_id,
                "company_id": company_id,
                "status": ScheduledReminderStatus.SCHEDULED.value
            },
            {
                "$set": {
                    "status": ScheduledReminderStatus.CANCELLED.value
                }
            }
        )
        return result.modified_count > 0
    
    # ============== Onboarding Reminders ==============
    
    async def schedule_onboard_reminders(
        self,
        onboard_id: str,
        expected_doj: date,
        actual_doj: Optional[date],
        payout_days: int,
        coordinator_ids: List[str],
        partner_id: Optional[str],
        company_id: str,
        created_by: str
    ) -> List[ScheduledReminderInDB]:
        """Schedule all reminders for an onboard"""
        reminders = []
        recipients = coordinator_ids.copy()
        if partner_id:
            recipients.append(partner_id)
        
        # DOJ reminder (2 days before)
        if expected_doj:
            doj_reminder_date = datetime.combine(
                expected_doj - timedelta(days=2),
                datetime.min.time().replace(hour=9)
            )
            if doj_reminder_date > datetime.utcnow():
                reminder = await self.create_scheduled_reminder(
                    ScheduledReminderCreate(
                        reminder_type=ScheduledReminderType.DOJ_UPCOMING,
                        reference_id=onboard_id,
                        reference_type="onboard",
                        scheduled_date=doj_reminder_date,
                        recipient_ids=recipients,
                        recipient_types=["coordinator", "partner"],
                        title="Upcoming DOJ Reminder",
                        message=f"Candidate is expected to join on {expected_doj}",
                        channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL]
                    ),
                    company_id,
                    created_by
                )
                reminders.append(reminder)
        
        # Day 10, 30, and payout day reminders (scheduled when candidate joins)
        if actual_doj:
            for days, reminder_type in [
                (10, ScheduledReminderType.DAY_10_CHECK),
                (30, ScheduledReminderType.DAY_30_CHECK),
                (payout_days, ScheduledReminderType.PAYOUT_ELIGIBLE)
            ]:
                reminder_date = datetime.combine(
                    actual_doj + timedelta(days=days),
                    datetime.min.time().replace(hour=9)
                )
                if reminder_date > datetime.utcnow():
                    reminder = await self.create_scheduled_reminder(
                        ScheduledReminderCreate(
                            reminder_type=reminder_type,
                            reference_id=onboard_id,
                            reference_type="onboard",
                            scheduled_date=reminder_date,
                            recipient_ids=recipients,
                            recipient_types=["coordinator", "partner", "accounts"],
                            title=f"Day {days} Reminder",
                            message=f"Candidate has completed {days} days at client",
                            channels=[NotificationChannel.IN_APP, NotificationChannel.EMAIL]
                        ),
                        company_id,
                        created_by
                    )
                    reminders.append(reminder)
        
        return reminders
    
    # ============== Notification Preferences ==============
    
    async def get_user_preferences(
        self,
        user_id: str,
        company_id: str
    ) -> NotificationPreference:
        """Get user notification preferences"""
        prefs = await self.preferences_collection.find_one({
            "user_id": user_id,
            "company_id": company_id
        })
        
        if prefs:
            return NotificationPreference(**prefs)
        
        # Return defaults
        return NotificationPreference(user_id=user_id)
    
    async def update_user_preferences(
        self,
        user_id: str,
        data: NotificationPreferenceUpdate,
        company_id: str
    ) -> NotificationPreference:
        """Update user notification preferences"""
        update_data = data.model_dump(exclude_unset=True)
        
        result = await self.preferences_collection.find_one_and_update(
            {"user_id": user_id, "company_id": company_id},
            {
                "$set": update_data,
                "$setOnInsert": {
                    "user_id": user_id,
                    "company_id": company_id
                }
            },
            upsert=True,
            return_document=True
        )
        
        return NotificationPreference(**result)
    
    # ============== Event-Based Notifications ==============
    
    async def notify_offer_released(
        self,
        onboard: dict,
        company_id: str
    ) -> None:
        """Send notification when offer is released"""
        # Notify candidate (if candidate user exists)
        # Notify partner (if applicable)
        # Notify HR
        
        notifications = []
        
        if onboard.get("partner_id"):
            notifications.append(NotificationCreate(
                user_id=onboard["partner_id"],
                user_type="partner",
                type=NotificationType.OFFER_RELEASED,
                title="Offer Released",
                message=f"Offer released for {onboard.get('candidate_name')} - {onboard.get('job_title')}",
                data={"onboard_id": onboard.get("id")},
                priority=NotificationPriority.HIGH,
                action_url=f"/onboards/{onboard.get('id')}"
            ))
        
        await self.create_bulk_notifications(notifications, company_id)
    
    async def notify_candidate_joined(
        self,
        onboard: dict,
        company_id: str
    ) -> None:
        """Send notification when candidate joins"""
        notifications = []
        
        # Notify partner
        if onboard.get("partner_id"):
            notifications.append(NotificationCreate(
                user_id=onboard["partner_id"],
                user_type="partner",
                type=NotificationType.CANDIDATE_JOINED,
                title="Candidate Joined!",
                message=f"{onboard.get('candidate_name')} has joined {onboard.get('client_name')}",
                data={
                    "onboard_id": onboard.get("id"),
                    "payout_days": onboard.get("payout_days_required", 45)
                },
                priority=NotificationPriority.HIGH,
                action_url=f"/onboards/{onboard.get('id')}"
            ))
        
        await self.create_bulk_notifications(notifications, company_id)
    
    async def notify_payout_eligible(
        self,
        payout: dict,
        company_id: str
    ) -> None:
        """Send notification when payout becomes eligible"""
        notifications = [
            # Notify partner
            NotificationCreate(
                user_id=payout["partner_id"],
                user_type="partner",
                type=NotificationType.PAYOUT_ELIGIBLE,
                title="Payout Eligible!",
                message=f"You can now raise invoice for {payout.get('candidate_name')}",
                data={
                    "payout_id": payout.get("id"),
                    "amount": payout.get("calculation", {}).get("net_amount", 0)
                },
                priority=NotificationPriority.HIGH,
                action_url="/partner/accounts"
            )
        ]
        
        await self.create_bulk_notifications(notifications, company_id)
    
    async def notify_invoice_submitted(
        self,
        invoice: dict,
        accounts_users: List[str],
        company_id: str
    ) -> None:
        """Notify accounts team when invoice is submitted"""
        for user_id in accounts_users:
            await self.create_notification(
                NotificationCreate(
                    user_id=user_id,
                    user_type="user",
                    type=NotificationType.INVOICE_RAISED,
                    title="New Invoice for Approval",
                    message=f"Invoice {invoice.get('invoice_number')} from {invoice.get('partner_name')}",
                    data={
                        "invoice_id": invoice.get("id"),
                        "amount": invoice.get("total_amount", 0)
                    },
                    priority=NotificationPriority.HIGH,
                    action_url=f"/accounts/invoices/{invoice.get('id')}"
                ),
                company_id
            )
    
    async def notify_payment_processed(
        self,
        invoice: dict,
        company_id: str
    ) -> None:
        """Notify partner when payment is processed"""
        await self.create_notification(
            NotificationCreate(
                user_id=invoice["partner_id"],
                user_type="partner",
                type=NotificationType.PAYMENT_PROCESSED,
                title="Payment Processed!",
                message=f"Payment of ₹{invoice.get('total_amount', 0):,.2f} has been processed",
                data={
                    "invoice_id": invoice.get("id"),
                    "invoice_number": invoice.get("invoice_number")
                },
                priority=NotificationPriority.HIGH,
                action_url="/partner/accounts"
            ),
            company_id
        )
    
    # ============== Helper Methods ==============
    
    async def _send_notification(
        self,
        notification: dict
    ) -> None:
        """Send notification via configured channels"""
        channels = notification.get("channels", [])
        
        for channel in channels:
            try:
                if channel == NotificationChannel.IN_APP.value:
                    # In-app is automatic (stored in DB)
                    await self._update_channel_status(
                        notification["id"],
                        channel,
                        NotificationStatus.DELIVERED
                    )
                
                elif channel == NotificationChannel.EMAIL.value:
                    # TODO: Integrate with email service (SendGrid, SES, etc.)
                    # await send_email(notification)
                    await self._update_channel_status(
                        notification["id"],
                        channel,
                        NotificationStatus.SENT
                    )
                
                elif channel == NotificationChannel.SMS.value:
                    # TODO: Integrate with SMS service (Twilio, MSG91, etc.)
                    # await send_sms(notification)
                    await self._update_channel_status(
                        notification["id"],
                        channel,
                        NotificationStatus.SENT
                    )
                
                elif channel == NotificationChannel.PUSH.value:
                    # TODO: Integrate with push service (FCM, APNS, etc.)
                    # await send_push(notification)
                    await self._update_channel_status(
                        notification["id"],
                        channel,
                        NotificationStatus.SENT
                    )

            except Exception:
                await self._update_channel_status(
                    notification["id"],
                    channel,
                    NotificationStatus.FAILED
                )
    
    async def _update_channel_status(
        self,
        notification_id: str,
        channel: str,
        status: NotificationStatus
    ) -> None:
        """Update channel delivery status"""
        await self.notifications_collection.update_one(
            {"id": notification_id},
            {
                "$set": {
                    f"channel_status.{channel}": status.value,
                    "sent_at": datetime.utcnow() if status == NotificationStatus.SENT else None
                }
            }
        )
    
    def _calculate_next_occurrence(
        self,
        current_date: datetime,
        pattern: str
    ) -> datetime:
        """Calculate next occurrence for recurring reminders"""
        if pattern == "daily":
            return current_date + timedelta(days=1)
        elif pattern == "weekly":
            return current_date + timedelta(weeks=1)
        elif pattern == "monthly":
            # Add one month
            month = current_date.month + 1
            year = current_date.year
            if month > 12:
                month = 1
                year += 1
            return current_date.replace(year=year, month=month)
        else:
            return current_date + timedelta(days=1)