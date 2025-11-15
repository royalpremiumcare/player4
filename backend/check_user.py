#!/usr/bin/env python3
"""
Kullanıcı kontrol scripti
"""
import asyncio
import os
from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient

# .env dosyasını yükle
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def check_user(email):
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
        
        # Kullanıcıyı ara
        user = await db.users.find_one({"username": email})
        
        if user:
            print(f"✅ Kullanıcı bulundu!")
            print(f"📧 E-posta: {user.get('username')}")
            print(f"👤 Ad: {user.get('full_name', 'Belirtilmemiş')}")
            print(f"🏢 Organization ID: {user.get('organization_id')}")
            print(f"🔑 Role: {user.get('role')}")
            print(f"🔗 Slug: {user.get('slug', 'Belirtilmemiş')}")
        else:
            print(f"❌ '{email}' ile kayıtlı kullanıcı bulunamadı.")
        
    except Exception as e:
        print(f"❌ Hata: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    email = "fatihsenyuz12@gmail.com"
    asyncio.run(check_user(email))







