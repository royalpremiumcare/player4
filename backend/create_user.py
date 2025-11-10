"""
İlk kullanıcı oluşturma scripti
Kullanım: python create_user.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
from pathlib import Path

# Environment variables yükle
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def get_password_hash(password):
    return pwd_context.hash(password)

async def create_user():
    # MongoDB bağlantısı
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME', 'royal_koltuk')
    
    if not mongo_url:
        print("❌ HATA: MONGO_URL environment variable bulunamadı!")
        print("Lütfen backend/.env dosyasında MONGO_URL'i ayarlayın.")
        return
    
    try:
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        
        # Kullanıcı bilgilerini al
        print("=" * 50)
        print("Royal Koltuk Yıkama - Kullanıcı Oluşturma")
        print("=" * 50)
        
        username = input("Kullanıcı adı (varsayılan: admin): ").strip() or "admin"
        
        # Kullanıcı zaten var mı kontrol et
        existing_user = await db.users.find_one({"username": username})
        if existing_user:
            print(f"\n⚠️  UYARI: '{username}' kullanıcı adı zaten mevcut!")
            overwrite = input("Şifresini değiştirmek ister misiniz? (e/h): ").strip().lower()
            if overwrite != 'e':
                print("İşlem iptal edildi.")
                client.close()
                return
            
            # Şifreyi güncelle
            password = input("Yeni şifre: ").strip()
            if not password:
                print("❌ HATA: Şifre boş olamaz!")
                client.close()
                return
            
            hashed_password = get_password_hash(password)
            await db.users.update_one(
                {"username": username},
                {"$set": {"hashed_password": hashed_password}}
            )
            print(f"✅ '{username}' kullanıcısının şifresi başarıyla güncellendi!")
            client.close()
            return
        
        password = input("Şifre: ").strip()
        if not password:
            print("❌ HATA: Şifre boş olamaz!")
            client.close()
            return
        
        full_name = input("Tam ad (opsiyonel): ").strip()
        
        # Kullanıcı oluştur
        hashed_password = get_password_hash(password)
        user_doc = {
            "username": username,
            "hashed_password": hashed_password,
            "full_name": full_name if full_name else None
        }
        
        await db.users.insert_one(user_doc)
        
        print("\n" + "=" * 50)
        print("✅ Kullanıcı başarıyla oluşturuldu!")
        print("=" * 50)
        print(f"Kullanıcı adı: {username}")
        print(f"Tam ad: {full_name if full_name else 'Belirtilmedi'}")
        print("\nArtık bu bilgilerle giriş yapabilirsiniz.")
        print("=" * 50)
        
        client.close()
        
    except Exception as e:
        print(f"\n❌ HATA: {str(e)}")
        print("\nLütfen şunları kontrol edin:")
        print("1. MongoDB'nin çalışıyor olduğundan emin olun")
        print("2. backend/.env dosyasında MONGO_URL'in doğru olduğundan emin olun")
        print("3. Bağlantı string'inin doğru olduğundan emin olun")

if __name__ == "__main__":
    asyncio.run(create_user())

