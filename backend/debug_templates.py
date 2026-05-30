"""
Debug script — run from backend/ directory:
    python debug_templates.py

Prints ALL document templates across all company DBs so you can verify
whether records are actually being written to MongoDB.
"""
import asyncio
import os
import sys
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI") or os.getenv("MONGODB_URL") or "mongodb://localhost:27017"
MASTER_DB  = os.getenv("MASTER_DB_NAME", "hireflow_master")


async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    master = client[MASTER_DB]

    # Find all tenant company DBs — DB name is "company_{company_id}_db"
    tenants = await master["tenants"].find({}, {"company_id": 1, "company_name": 1}).to_list(None)
    if not tenants:
        print("No tenants found in master DB.")
        return

    grand_total = 0
    for t in tenants:
        company_id = t.get("company_id")
        db_name  = f"company_{company_id}_db" if company_id else None
        co_name  = t.get("company_name", db_name)
        if not db_name:
            continue
        db  = client[db_name]
        col = db["hrm_document_templates"]
        docs = await col.find({"is_deleted": False}).sort("created_at", -1).to_list(None)
        print(f"\n{'='*60}")
        print(f"Company: {co_name}  (DB: {db_name})")
        print(f"Total templates: {len(docs)}")
        for d in docs:
            print(f"  id={d['_id']}  name={d.get('name')!r}  doc_type={d.get('doc_type')}  "
                  f"is_active={d.get('is_active')}  created_at={d.get('created_at')}")
        grand_total += len(docs)

    print(f"\n{'='*60}")
    print(f"Grand total across all companies: {grand_total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
