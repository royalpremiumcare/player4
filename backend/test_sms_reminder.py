#!/usr/bin/env python3
"""
SMS Hatırlatma Sistemi Test Scripti
Bu script, SMS hatırlatma sisteminin çalışıp çalışmadığını test eder.
"""

import asyncio
import sys
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

# Backend modüllerini import et
sys.path.insert(0, os.path.dirname(__file__))
from server import check_and_send_reminders, _app_instance

async def test_sms_reminder():
    """SMS hatırlatma sistemini test et"""
    print("=" * 60)
    print("SMS HATIRLATMA SİSTEMİ TEST")
    print("=" * 60)
    print()
    
    if _app_instance is None:
        print("❌ HATA: App instance bulunamadı!")
        print("   Backend'in çalıştığından emin olun.")
        return
    
    db = getattr(_app_instance, 'db', None)
    if db is None:
        print("❌ HATA: MongoDB bağlantısı bulunamadı!")
        return
    
    print("✅ App instance ve MongoDB bağlantısı bulundu")
    print()
    
    # Tüm organization'ları listele
    print("📋 Organization'lar:")
    all_settings = await db.settings.find({}, {"_id": 0}).to_list(1000)
    for setting in all_settings:
        org_id = setting.get('organization_id')
        company_name = setting.get('company_name', 'İsimsiz')
        reminder_hours = setting.get('sms_reminder_hours', 1.0)
        print(f"  - {company_name} (ID: {org_id[:8]}...)")
        print(f"    Hatırlatma süresi: {reminder_hours} saat")
    print()
    
    # Bekleyen randevuları listele
    print("📅 Bekleyen Randevular (reminder_sent=False):")
    turkey_tz = ZoneInfo("Europe/Istanbul")
    now = datetime.now(turkey_tz)
    
    for setting in all_settings:
        org_id = setting.get('organization_id')
        reminder_hours = setting.get('sms_reminder_hours', 1.0)
        
        appointments = await db.appointments.find({
            "organization_id": org_id,
            "status": "Bekliyor",
            "reminder_sent": {"$ne": True}
        }, {"_id": 0}).to_list(1000)
        
        if not appointments:
            print(f"  {setting.get('company_name')}: Randevu bulunamadı")
            continue
        
        print(f"  {setting.get('company_name')}: {len(appointments)} randevu bulundu")
        
        reminder_time_start = now + timedelta(hours=reminder_hours - 0.1)
        reminder_time_end = now + timedelta(hours=reminder_hours + 0.1)
        
        for apt in appointments[:5]:  # İlk 5 randevuyu göster
            try:
                apt_datetime_str = f"{apt['appointment_date']} {apt['appointment_time']}"
                apt_datetime = datetime.strptime(apt_datetime_str, "%Y-%m-%d %H:%M").replace(tzinfo=turkey_tz)
                
                time_until = apt_datetime - now
                hours_until = time_until.total_seconds() / 3600
                
                in_window = reminder_time_start <= apt_datetime <= reminder_time_end
                status = "✅ Hatırlatma zamanı" if in_window else f"⏳ {hours_until:.1f} saat sonra"
                
                print(f"    - {apt.get('customer_name')}: {apt_datetime_str}")
                print(f"      {status} | Telefon: {apt.get('phone')}")
            except Exception as e:
                print(f"    - Hata: {apt.get('id', 'unknown')} - {e}")
    print()
    
    # Test çalıştır
    print("🔄 SMS hatırlatma kontrolü çalıştırılıyor...")
    print()
    try:
        await check_and_send_reminders()
        print("✅ Test tamamlandı!")
        print()
        print("📊 Sonuçları görmek için logları kontrol edin:")
        print("   tail -f /tmp/backend_dev.log | grep -i reminder")
    except Exception as e:
        print(f"❌ Hata: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("⚠️  NOT: Bu script backend'in çalıştığından emin olun!")
    print("   Backend çalışmıyorsa app instance bulunamaz.")
    print()
    input("Devam etmek için Enter'a basın...")
    print()
    asyncio.run(test_sms_reminder())

