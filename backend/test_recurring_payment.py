#!/usr/bin/env python3
"""
Recurring Payment Test Script
Bu script ile recurring payment sistemini test edebilirsiniz.
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime, timezone, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

async def test_card_tokens():
    """1. Test: Kart token'larının kaydedildiğini kontrol et"""
    print("\n=== TEST 1: Kart Token Kontrolü ===")
    
    mongo_url = os.getenv('MONGO_URL')
    db_name = os.getenv('DB_NAME', 'royal_koltuk_dev')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Kayıtlı kartı olan organizasyonları bul
    cursor = db.organization_plans.find({"card_saved": True})
    orgs = await cursor.to_list(length=100)
    
    print(f"✓ Kayıtlı kartı olan organizasyon sayısı: {len(orgs)}")
    
    for org in orgs:
        org_id = org.get('organization_id')
        plan_id = org.get('plan_id')
        next_billing = org.get('next_billing_date')
        has_utoken = bool(org.get('payment_utoken'))
        has_ctoken = bool(org.get('payment_ctoken'))
        
        print(f"\n  Organization: {org_id}")
        print(f"  Plan: {plan_id}")
        print(f"  Next Billing: {next_billing}")
        print(f"  Has utoken: {has_utoken}")
        print(f"  Has ctoken: {has_ctoken}")
        
        if has_utoken and has_ctoken:
            print(f"  ✓ Token'lar mevcut - Recurring payment hazır!")
        else:
            print(f"  ✗ Token'lar eksik!")
    
    await client.close()


async def set_test_billing_date(organization_id: str):
    """2. Test: Billing date'i bugüne çek (test için)"""
    print(f"\n=== TEST 2: Billing Date'i Bugüne Çek ===")
    
    mongo_url = os.getenv('MONGO_URL')
    db_name = os.getenv('DB_NAME', 'royal_koltuk_dev')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Billing date'i bugüne çek
    today = datetime.now(timezone.utc).isoformat()
    
    result = await db.organization_plans.update_one(
        {"organization_id": organization_id},
        {"$set": {
            "next_billing_date": today,
            "updated_at": today
        }}
    )
    
    if result.modified_count > 0:
        print(f"✓ Organization {organization_id} için next_billing_date bugüne çekildi")
        print(f"  Şimdi scheduler'ı tetikleyebilirsiniz!")
    else:
        print(f"✗ Organization bulunamadı veya güncelleme başarısız")
    
    await client.close()


async def check_payment_logs():
    """3. Test: Payment loglarını kontrol et"""
    print("\n=== TEST 3: Payment Logs Kontrolü ===")
    
    mongo_url = os.getenv('MONGO_URL')
    db_name = os.getenv('DB_NAME', 'royal_koltuk_dev')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Son 10 payment log'u getir
    cursor = db.payment_logs.find().sort("created_at", -1).limit(10)
    logs = await cursor.to_list(length=10)
    
    print(f"✓ Toplam {len(logs)} payment log bulundu (son 10)")
    
    for log in logs:
        merchant_oid = log.get('merchant_oid')
        org_id = log.get('organization_id')
        amount = log.get('amount')
        status = log.get('status')
        payment_type = log.get('payment_type', 'initial')
        created_at = log.get('created_at')
        
        status_icon = "✓" if status == "active" else "✗" if status == "failed" else "⏳"
        
        print(f"\n  {status_icon} {merchant_oid}")
        print(f"    Organization: {org_id}")
        print(f"    Amount: {amount} TL")
        print(f"    Status: {status}")
        print(f"    Type: {payment_type}")
        print(f"    Created: {created_at}")
    
    await client.close()


async def simulate_recurring_payment(organization_id: str):
    """4. Test: Recurring payment simülasyonu"""
    print(f"\n=== TEST 4: Recurring Payment Simülasyonu ===")
    print(f"Organization ID: {organization_id}")
    print("\nGerçek test için şu adımları izleyin:")
    print("1. Backend'i çalıştırın: cd backend && python server.py")
    print("2. Superadmin token alın")
    print("3. Şu komutu çalıştırın:\n")
    print(f"curl -X POST 'http://localhost:8080/api/payments/process-recurring?organization_id={organization_id}' \\")
    print("  -H 'Authorization: Bearer SUPERADMIN_TOKEN'")
    print("\n4. Response'u kontrol edin:")
    print("   - success: Ödeme başarılı")
    print("   - failed: Ödeme başarısız (kart problemi)")
    print("   - error: Sistem hatası")


async def main():
    print("=" * 60)
    print("RECURRING PAYMENT TEST SUITE")
    print("=" * 60)
    
    # Test 1: Kart token'larını kontrol et
    await test_card_tokens()
    
    # Test 3: Payment loglarını göster
    await check_payment_logs()
    
    print("\n" + "=" * 60)
    print("DİĞER TEST YÖNTEMLERI")
    print("=" * 60)
    
    # Test 2 ve 4 için bilgi ver
    print("\n📝 Billing date'i bugüne çekmek için:")
    print("   python test_recurring_payment.py --set-billing <organization_id>")
    
    print("\n📝 Recurring payment simülasyonu için:")
    print("   python test_recurring_payment.py --simulate <organization_id>")
    
    print("\n" + "=" * 60)


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) > 1:
        if sys.argv[1] == "--set-billing" and len(sys.argv) > 2:
            asyncio.run(set_test_billing_date(sys.argv[2]))
        elif sys.argv[1] == "--simulate" and len(sys.argv) > 2:
            asyncio.run(simulate_recurring_payment(sys.argv[2]))
        else:
            print("Kullanım:")
            print("  python test_recurring_payment.py                    # Tüm testleri çalıştır")
            print("  python test_recurring_payment.py --set-billing <org_id>")
            print("  python test_recurring_payment.py --simulate <org_id>")
    else:
        asyncio.run(main())
