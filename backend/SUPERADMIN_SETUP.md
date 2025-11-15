# Super Admin Paneli - Kurulum ve Kullanım Kılavuzu

## 🎯 Genel Bakış

Super Admin Paneli, platform sahibinin tüm işletmeleri tek bir yerden izleyebileceği özel bir dashboard'dur.

**URL:** `/superadmin`

**Erişim:** Sadece `role: 'superadmin'` olan kullanıcılar erişebilir.

---

## 🔐 1. Superadmin Rolü Atama

### Adım 1: Kendi Kullanıcı Adınızı Belirleyin

Hangi kullanıcı hesabınıza superadmin rolü atamak istediğinizi belirleyin (örn: `admin@example.com`).

### Adım 2: Script'i Çalıştırın

```bash
cd /var/www/royalpremiumcare_dev/backend
source venv/bin/activate
python3 set_superadmin.py <kullanici_adi>
```

**Örnek:**
```bash
python3 set_superadmin.py admin@example.com
```

**Çıktı:**
```
✅ BAŞARILI: 'admin@example.com' kullanıcısına superadmin rolü atandı!
   Kullanıcı artık /superadmin sayfasına erişebilir.
```

### Adım 3: Çıkış Yapıp Tekrar Giriş Yapın

Rol değişikliği için token'ın yenilenmesi gerekiyor:
1. Uygulamadan çıkış yapın
2. Tekrar giriş yapın
3. Token'da yeni rol bilgisi olacak

---

## 📊 2. Backend Endpoint'leri

### GET /api/superadmin/stats

**Açıklama:** Platform genel özet istatistikleri

**Yetki:** Sadece `superadmin` rolü

**Response:**
```json
{
  "toplam_isletme": 150,
  "toplam_gelir_bu_ay": 25400.00,
  "toplam_randevu_bu_ay": 15000,
  "toplam_aktif_kullanici": 1200
}
```

**Hesaplamalar:**
- `toplam_isletme`: Settings koleksiyonundaki toplam belge sayısı
- `toplam_gelir_bu_ay`: Trial hariç, aktif planların aylık fiyatlarının toplamı
- `toplam_randevu_bu_ay`: Bu ay içindeki tüm randevular
- `toplam_aktif_kullanici`: Customers + Staff (role: "staff") toplamı

---

### GET /api/superadmin/organizations

**Açıklama:** Detaylı işletme listesi

**Yetki:** Sadece `superadmin` rolü

**Response:**
```json
{
  "organizations": [
    {
      "organization_id": "uuid-123",
      "isletme_adi": "Gül Kuaför",
      "telefon_numarasi": "0555 123 4567",
      "abonelik_paketi": "Premium",
      "abonelik_durumu": "Aktif",
      "bu_ayki_randevu_sayisi": 550,
      "toplam_musteri_sayisi": 120,
      "toplam_personel_sayisi": 5
    },
    ...
  ]
}
```

**Hesaplamalar (Her işletme için):**
- `isletme_adi`: Settings'den `company_name`
- `telefon_numarasi`: Settings'den `support_phone`
- `abonelik_paketi`: organization_plans'den plan adı (Trial, Standart, Premium, vb.)
- `abonelik_durumu`: 
  - Trial ise: "X Gün Kaldı" veya "Deneme Bitti"
  - Diğer planlar: "Aktif"
- `bu_ayki_randevu_sayisi`: Bu ay içindeki randevu sayısı
- `toplam_musteri_sayisi`: O işletmeye ait müşteri sayısı
- `toplam_personel_sayisi`: O işletmeye ait personel (staff) sayısı

---

## 🎨 3. Frontend Özellikleri

### Sayfa Yapısı

1. **Üst Bölüm: Hızlı Bakış Kartları**
   - Toplam İşletme
   - Aylık Abonelik Geliri
   - Aylık Toplam Randevu
   - Toplam Aktif Kullanıcı

2. **Alt Bölüm: Detaylı İşletme Listesi**
   - Responsive tablo
   - Arama özelliği (İşletme Adı veya Telefon)
   - Sıralama özelliği (Tüm sütunlar tıklanabilir)

### Tablo Sütunları

| Sütun | Açıklama | Sıralanabilir |
|-------|----------|---------------|
| İşletme Adı | Company name | ✅ |
| Telefon Numarası | Support phone | ✅ |
| Paket | Abonelik paketi (Trial, Standart, Premium, vb.) | ✅ |
| Durum | Abonelik durumu (Aktif, X Gün Kaldı, Deneme Bitti) | ✅ |
| Bu Ayki Randevu | Bu ayki randevu sayısı | ✅ |
| Top. Müşteri | Toplam müşteri sayısı | ✅ |
| Top. Personel | Toplam personel sayısı | ✅ |

### Özellikler

- ✅ **Arama:** İşletme adı veya telefon numarası ile filtreleme
- ✅ **Sıralama:** Her sütun başlığına tıklayarak artan/azalan sıralama
- ✅ **Responsive:** Mobil uyumlu tasarım
- ✅ **Renk Kodları:** Paket ve durum için renkli badge'ler

---

## 🔒 4. Güvenlik

### Backend Kontrolleri

1. **`get_superadmin_user` Dependency:**
   ```python
   async def get_superadmin_user(request: Request, token: str = Depends(oauth2_scheme), db = Depends(get_db)):
       user = await get_current_user(request, token, db)
       if user.role != "superadmin":
           raise HTTPException(status_code=403, detail="Bu işlem için superadmin yetkisi gereklidir")
       return user
   ```

2. **Endpoint Koruması:**
   - Tüm `/api/superadmin/*` endpoint'leri `get_superadmin_user` dependency'si kullanır
   - Normal admin veya staff rolleri erişemez

### Frontend Kontrolleri

1. **Route Koruması:**
   ```javascript
   <Route 
     path="/superadmin" 
     element={
       isAuthenticated && isSuperAdmin ? (
         <SuperAdmin />
       ) : isAuthenticated ? (
         <Navigate to="/dashboard" replace />
       ) : (
         <Navigate to="/login" replace />
       )
     } 
   />
   ```

2. **API Hata Yönetimi:**
   - 403 hatası alınırsa kullanıcıya uyarı gösterilir
   - Dashboard'a yönlendirilir

---

## 🚀 5. Kullanım

### İlk Erişim

1. Superadmin rolü atayın (yukarıdaki adımları takip edin)
2. Çıkış yapıp tekrar giriş yapın
3. Tarayıcıda `/superadmin` adresine gidin

### Sayfayı Kullanma

1. **Hızlı Bakış:** Üstteki 4 kart platform genel özetini gösterir
2. **İşletme Listesi:** Alttaki tabloda tüm işletmeler listelenir
3. **Arama:** Tablonun üstündeki arama çubuğuna işletme adı veya telefon yazın
4. **Sıralama:** Sütun başlıklarına tıklayarak sıralama yapın

---

## 📝 6. Notlar

### Abonelik Durumu Hesaplaması

- **Trial Paketi:**
  - `trial_end_date` kontrol edilir
  - Kalan gün hesaplanır: "X Gün Kaldı" veya "Deneme Bitti"
  
- **Diğer Paketler:**
  - Direkt "Aktif" olarak gösterilir

### Gelir Hesaplaması

- Sadece **Trial olmayan** paketler gelir sayılır
- Trial bitmiş planların fiyatları toplanır
- Trial devam eden planlar gelir sayılmaz

### Performans

- Tüm sorgular MongoDB aggregation kullanır
- Büyük veri setleri için optimize edilmiştir
- Sayfalama eklenebilir (şu an tüm veriler tek seferde yüklenir)

---

## 🐛 Sorun Giderme

### "Bu sayfaya erişim yetkiniz yok" Hatası

1. Kullanıcının superadmin rolüne sahip olduğunu kontrol edin:
   ```bash
   python3 -c "
   import asyncio
   from motor.motor_asyncio import AsyncIOMotorClient
   from dotenv import load_dotenv
   import os
   load_dotenv()
   async def check():
       client = AsyncIOMotorClient(os.environ.get('MONGO_URL'))
       db = client[os.environ.get('DB_NAME', 'royal_koltuk_dev')]
       user = await db.users.find_one({'username': 'YOUR_USERNAME'})
       print('Role:', user.get('role') if user else 'User not found')
       client.close()
   asyncio.run(check())
   "
   ```

2. Çıkış yapıp tekrar giriş yapın (token yenilenmesi için)

### Veriler Görünmüyor

1. Backend log'larını kontrol edin:
   ```bash
   tail -f /tmp/backend.log | grep superadmin
   ```

2. API endpoint'lerini manuel test edin:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" http://127.0.0.1:8002/api/superadmin/stats
   ```

---

## ✅ Tamamlanan Özellikler

- ✅ Backend: `get_superadmin_user` dependency
- ✅ Backend: `GET /api/superadmin/stats` endpoint
- ✅ Backend: `GET /api/superadmin/organizations` endpoint
- ✅ Frontend: `/superadmin` sayfası
- ✅ Frontend: Hızlı bakış kartları
- ✅ Frontend: Detaylı işletme tablosu
- ✅ Frontend: Arama özelliği
- ✅ Frontend: Sıralama özelliği
- ✅ Güvenlik: Role-based access control
- ✅ Script: Superadmin rolü atama script'i

---

**Hazırlayan:** AI Development Assistant  
**Tarih:** 2025-11-14

