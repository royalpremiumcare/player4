#!/usr/bin/env python3
"""
Tüm kullanıcıları silme scripti
"""
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

# .env dosyasını yükle
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def delete_all_users():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'royal_koltuk_dev')
    
    if not mongo_url:
        print("❌ MONGO_URL environment variable bulunamadı!")
        return
    
    try:
        # MongoDB bağlantısı
        client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000)
        await client.admin.command('ping')
        db = client[db_name]
        
        # Kullanıcı sayısını kontrol et
        user_count = await db.users.count_documents({})
        print(f"📊 Toplam kullanıcı sayısı: {user_count}")
        
        if user_count == 0:
            print("ℹ️  Silinecek kullanıcı yok.")
            return
        
        # Onay iste
        print(f"\n⚠️  {user_count} kullanıcı silinecek!")
        
        # Tüm kullanıcıları sil
        result = await db.users.delete_many({})
        print(f"✅ {result.deleted_count} kullanıcı başarıyla silindi!")
        
        # İlgili tüm verileri de temizle
        print("\n🗑️  İlgili veriler temizleniyor...")
        appointments_result = await db.appointments.delete_many({})
        settings_result = await db.settings.delete_many({})
        plans_result = await db.organization_plans.delete_many({})
        services_result = await db.services.delete_many({})
        audit_logs_result = await db.audit_logs.delete_many({})
        
        print(f"✅ {appointments_result.deleted_count} randevu silindi")
        print(f"✅ {settings_result.deleted_count} ayar silindi")
        print(f"✅ {plans_result.deleted_count} plan silindi")
        print(f"✅ {services_result.deleted_count} hizmet silindi")
        print(f"✅ {audit_logs_result.deleted_count} denetim günlüğü silindi")
        print("\n🎉 Tüm veriler başarıyla temizlendi!")
        
    except Exception as e:
        print(f"❌ Hata: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    asyncio.run(delete_all_users())


