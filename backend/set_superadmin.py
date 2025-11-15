#!/usr/bin/env python3
"""
Superadmin rolü atama script'i
Kullanım: python3 set_superadmin.py <username>
"""

import sys
import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

async def set_superadmin_role(username):
    """Kullanıcıya superadmin rolü ata"""
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'royal_koltuk_dev')
    
    if not mongo_url:
        print("❌ HATA: MONGO_URL environment variable bulunamadı!")
        return False
    
    try:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        # Kullanıcıyı bul
        user = await db.users.find_one({"username": username})
        
        if not user:
            print(f"❌ HATA: '{username}' kullanıcısı bulunamadı!")
            return False
        
        # Superadmin rolü ata
        result = await db.users.update_one(
            {"username": username},
            {"$set": {"role": "superadmin"}}
        )
        
        if result.modified_count > 0:
            print(f"✅ BAŞARILI: '{username}' kullanıcısına superadmin rolü atandı!")
            print(f"   Kullanıcı artık /superadmin sayfasına erişebilir.")
            return True
        else:
            print(f"⚠️  UYARI: Kullanıcı zaten superadmin rolüne sahip olabilir.")
            return True
            
    except Exception as e:
        print(f"❌ HATA: {str(e)}")
        return False
    finally:
        if 'client' in locals():
            client.close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Kullanım: python3 set_superadmin.py <username>")
        print("\nÖrnek:")
        print("  python3 set_superadmin.py admin@example.com")
        sys.exit(1)
    
    username = sys.argv[1]
    asyncio.run(set_superadmin_role(username))

