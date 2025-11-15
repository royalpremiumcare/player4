# PLANN Randevu SaaS Backend - server.py Detaylı Analiz Dokümantasyonu

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Mimari ve Teknoloji Yığını](#mimari-ve-teknoloji-yığını)
3. [Başlangıç ve Yaşam Döngüsü](#başlangıç-ve-yaşam-döngüsü)
4. [Güvenlik ve Kimlik Doğrulama](#güvenlik-ve-kimlik-doğrulama)
5. [Veri Modelleri](#veri-modelleri)
6. [API Endpoint'leri](#api-endpointleri)
7. [WebSocket ve Real-Time İletişim](#websocket-ve-real-time-iletişim)
8. [SMS ve E-posta Entegrasyonları](#sms-ve-e-posta-entegrasyonları)
9. [Kota ve Abonelik Yönetimi](#kota-ve-abonelik-yönetimi)
10. [Randevu Yönetimi](#randevu-yönetimi)
11. [Müsaitlik Hesaplama](#müsaitlik-hesaplama)
12. [Finans ve Kasa Yönetimi](#finans-ve-kasa-yönetimi)
13. [Personel Yönetimi](#personel-yönetimi)
14. [Müşteri Yönetimi](#müşteri-yönetimi)
15. [Yardımcı Fonksiyonlar](#yardımcı-fonksiyonlar)

---

## 🎯 Genel Bakış

`server.py`, PLANN randevu SaaS platformunun backend API'sini oluşturan FastAPI tabanlı bir uygulamadır. Sistem, multi-tenant (çok kiracılı) mimari kullanarak her işletmenin (`organization`) kendi verilerini izole bir şekilde yönetmesini sağlar.

**Temel Özellikler:**
- Multi-tenant SaaS mimarisi
- JWT tabanlı kimlik doğrulama
- Real-time güncellemeler (WebSocket/Socket.IO)
- Otomatik SMS hatırlatmaları
- Dinamik müsaitlik hesaplama
- Finans ve kasa yönetimi
- Personel ve müşteri yönetimi
- Abonelik ve kota yönetimi

---

## 🏗️ Mimari ve Teknoloji Yığını

### Kullanılan Teknolojiler

| Teknoloji | Versiyon/Kütüphane | Kullanım Amacı |
|-----------|-------------------|----------------|
| **FastAPI** | - | RESTful API framework |
| **Motor** | AsyncIOMotorClient | MongoDB async driver |
| **Socket.IO** | python-socketio | Real-time WebSocket iletişimi |
| **JWT** | python-jose | Token tabanlı kimlik doğrulama |
| **Passlib** | bcrypt | Şifre hashleme |
| **APScheduler** | AsyncIOScheduler | Zamanlanmış görevler (SMS hatırlatmaları) |
| **Brevo** | sib_api_v3_sdk | E-posta gönderimi |
| **İletimerkezi** | requests | SMS gönderimi |
| **Redis** | - | Cache ve rate limiting |
| **Pydantic** | BaseModel | Veri validasyonu |

### Veritabanı Yapısı

**MongoDB Collections:**
- `users` - Kullanıcılar (admin, staff)
- `appointments` - Randevular
- `services` - Hizmetler
- `customers` - Müşteriler
- `transactions` - Finansal işlemler
- `expenses` - Giderler
- `settings` - İşletme ayarları
- `organization_plans` - Abonelik planları
- `audit_logs` - Denetim günlükleri
- `customer_notes` - Müşteri notları
- `password_reset_tokens` - Şifre sıfırlama token'ları

---

## 🔄 Başlangıç ve Yaşam Döngüsü

### `lifespan()` Fonksiyonu

Uygulama başlangıcında ve kapanışında çalışan async context manager.

**Başlangıç Adımları:**

1. **MongoDB Bağlantısı**
   - `MONGO_URL` environment variable'ından bağlantı bilgisi alınır
   - `AsyncIOMotorClient` ile bağlantı kurulur
   - Bağlantı başarısız olursa "lazy initialization" yapılır (ilk request'te bağlanır)

2. **Redis Bağlantısı**
   - Cache ve rate limiting için Redis bağlantısı kurulur
   - Bağlantı başarısız olursa "dummy rate limiter" kullanılır

3. **Rate Limiter İnisiyalizasyonu**
   - Redis varsa gerçek rate limiter, yoksa dummy limiter kullanılır

4. **SMS Reminder Scheduler**
   - `AsyncIOScheduler` başlatılır
   - Her 5 dakikada bir `check_and_send_reminders()` çalışır
   - İlk kontrol hemen yapılır (test için)

5. **Database Indexes**
   - Performans için MongoDB index'leri oluşturulur:
     - `appointments`: `organization_id`, `appointment_date`, `staff_member_id`, `phone`, `status`
     - `users`: `organization_id`, `role`, `slug` (unique)
     - `settings`: `organization_id` (unique), `slug` (unique)

**Kapanış Adımları:**
- Scheduler durdurulur
- MongoDB bağlantısı kapatılır
- Redis bağlantısı kapatılır

---

## 🔐 Güvenlik ve Kimlik Doğrulama

### JWT Token Yönetimi

**Token Oluşturma:**
```python
create_access_token(data: dict, expires_delta: Optional[timedelta] = None)
```
- `data`: Token içinde saklanacak bilgiler (username, role, organization_id)
- `expires_delta`: Token geçerlilik süresi (varsayılan: 24 saat)
- `SECRET_KEY`: Environment variable'dan alınır (production'da mutlaka değiştirilmeli)

**Token Doğrulama:**
```python
get_current_user(request: Request, token: str = Depends(oauth2_scheme))
```
- JWT token decode edilir
- `sub` (username) alanından kullanıcı bulunur
- Kullanıcı veritabanından çekilir ve `UserInDB` modeli olarak döndürülür

### Şifre Yönetimi

**Hashleme:**
```python
get_password_hash(password: str) -> str
```
- Bcrypt algoritması kullanılır
- Her hash benzersizdir (salt otomatik eklenir)

**Doğrulama:**
```python
verify_password(plain_password: str, hashed_password: str) -> bool
```

### Rate Limiting

Her endpoint için farklı rate limit'ler tanımlanabilir:
- `register`: Kayıt işlemleri
- `login`: Giriş işlemleri
- `forgot-password`: Şifre sıfırlama

---

## 📊 Veri Modelleri

### User Modelleri

**`User` (BaseModel)**
- `username`: E-posta adresi (unique)
- `full_name`: Ad Soyad
- `organization_id`: İşletme ID'si (UUID)
- `role`: "admin" veya "staff"
- `slug`: URL-friendly kullanıcı adı
- `permitted_service_ids`: Personelin verebileceği hizmet ID'leri
- `payment_type`: "salary" (sabit maaş) veya "commission" (komisyon)
- `payment_amount`: Maaş/komisyon tutarı
- `status`: "active" veya "pending" (davet bekleyen personel)
- `invitation_token`: Personel daveti için token
- `days_off`: Haftalık tatil günleri (örn: `["sunday", "monday"]`)

**`UserInDB` (User + hashed_password)**
- Şifre hash'i içerir

**`UserCreate`**
- Kayıt için kullanılan model
- `organization_name`, `support_phone`, `sector` gibi ek alanlar içerir

### Appointment Modelleri

**`Appointment` (BaseModel)**
- `id`: UUID
- `customer_name`: Müşteri adı
- `phone`: Telefon numarası
- `service_id`: Hizmet ID'si
- `service_name`: Hizmet adı
- `service_price`: Hizmet fiyatı
- `service_duration`: Hizmet süresi (dakika)
- `appointment_date`: Tarih (YYYY-MM-DD)
- `appointment_time`: Saat (HH:MM)
- `status`: "Bekliyor", "Tamamlandı", "İptal"
- `staff_member_id`: Atanan personel
- `notes`: Notlar
- `created_at`: Oluşturulma zamanı
- `completed_at`: Tamamlanma zamanı

**`AppointmentCreate`**
- Yeni randevu oluşturma için

**`AppointmentUpdate`**
- Randevu güncelleme için (tüm alanlar optional)

### Service Modelleri

**`Service` (BaseModel)**
- `id`: UUID
- `name`: Hizmet adı
- `price`: Fiyat (TL)
- `duration`: Süre (dakika, varsayılan: 30)
- `organization_id`: İşletme ID'si

### Settings Modeli

**`Settings` (BaseModel)**
- `company_name`: İşletme adı
- `support_phone`: Destek telefonu
- `slug`: URL-friendly işletme adı
- `logo_url`: Logo URL'i
- `sms_reminder_hours`: SMS hatırlatma süresi (saat)
- `admin_provides_service`: İşletme sahibi hizmet veriyor mu?
- `customer_can_choose_staff`: Müşteri personel seçebilir mi?
- `business_hours`: Genel çalışma saatleri (her gün için `is_open`, `open_time`, `close_time`)

### Transaction Modeli

**`Transaction` (BaseModel)**
- Otomatik oluşturulur (randevu tamamlandığında)
- `appointment_id`: İlişkili randevu
- `amount`: Tutar
- `date`: Tarih

---

## 🌐 API Endpoint'leri

### 🔑 Kimlik Doğrulama Endpoint'leri

#### `POST /api/register`
**Açıklama:** Yeni işletme sahibi (admin) kaydı

**Request Body:**
```json
{
  "username": "admin@example.com",
  "password": "secure_password",
  "full_name": "İşletme Sahibi",
  "organization_name": "İşletme Adı",
  "support_phone": "05000000000",
  "sector": "Kuaför"
}
```

**İşlemler:**
1. Kullanıcı adı (e-posta) kontrolü (unique olmalı)
2. Şifre hash'lenir
3. Yeni `organization_id` oluşturulur
4. Admin kullanıcı oluşturulur
5. Varsayılan `Settings` kaydı oluşturulur
6. Trial plan oluşturulur (7 gün, 50 randevu)
7. `slug` oluşturulur (URL-friendly)

**Response:** `User` modeli (şifre hariç)

---

#### `POST /api/token`
**Açıklama:** Kullanıcı girişi (OAuth2 Password Flow)

**Request Body (Form Data):**
- `username`: E-posta adresi
- `password`: Şifre

**İşlemler:**
1. Kullanıcı veritabanından bulunur
2. Şifre doğrulanır
3. `status` kontrolü: "pending" kullanıcılar giriş yapamaz
4. JWT token oluşturulur
5. Token içinde: `sub` (username), `role`, `organization_id`

**Response:**
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token_type": "bearer"
}
```

---

#### `POST /api/forgot-password`
**Açıklama:** Şifre sıfırlama e-postası gönderir

**Request Body:**
```json
{
  "username": "user@example.com"
}
```

**İşlemler:**
1. Kullanıcı bulunur
2. Rastgele token oluşturulur
3. Token veritabanına kaydedilir (süre: 1 saat)
4. Brevo API ile e-posta gönderilir
5. E-postada şifre sıfırlama linki bulunur

---

#### `POST /api/reset-password`
**Açıklama:** Token ile şifre sıfırlama

**Request Body:**
```json
{
  "token": "reset_token_here",
  "new_password": "new_secure_password"
}
```

**İşlemler:**
1. Token doğrulanır (süre ve geçerlilik kontrolü)
2. Yeni şifre hash'lenir
3. Kullanıcı şifresi güncellenir
4. Token silinir

---

#### `POST /api/auth/setup-password`
**Açıklama:** Personel davet token'ı ile şifre belirleme

**Request Body:**
```json
{
  "token": "invitation_token_here",
  "new_password": "secure_password"
}
```

**İşlemler:**
1. `invitation_token` ile kullanıcı bulunur
2. Yeni şifre hash'lenir
3. Kullanıcı şifresi güncellenir
4. `status` "active" yapılır
5. `invitation_token` silinir

---

### 📅 Randevu Endpoint'leri

#### `GET /api/appointments`
**Açıklama:** Randevuları listele

**Query Parameters:**
- `date`: Belirli bir tarih (YYYY-MM-DD)
- `start_date`, `end_date`: Tarih aralığı
- `status`: "Bekliyor", "Tamamlandı", "İptal"
- `search`: Müşteri adı veya telefon ile arama
- `staff_member_id`: Belirli bir personel (admin için)

**İşlemler:**
1. **Rol Kontrolü:**
   - `staff`: Sadece kendi randevuları
   - `admin`: Tüm randevular (filtreleme ile)

2. **Otomatik Tamamlanma:**
   - "Bekliyor" statusündeki randevular kontrol edilir
   - Bitiş saati (başlangıç + hizmet süresi) geçmişse:
     - Status "Tamamlandı" yapılır
     - `Transaction` kaydı oluşturulur
     - `completed_at` ayarlanır

3. **Service Duration Ekleme:**
   - Her randevu için `service_duration` alanı eklenir
   - Hizmet veritabanından çekilir (performans için batch)

**Response:** `List[Appointment]`

---

#### `POST /api/appointments`
**Açıklama:** Yeni randevu oluştur (Admin/Personel paneli)

**Request Body:**
```json
{
  "customer_name": "Ali Kılıç",
  "phone": "05321234567",
  "service_id": "service-uuid",
  "appointment_date": "2025-11-15",
  "appointment_time": "10:00",
  "notes": "Notlar",
  "staff_member_id": "staff-username" // Optional
}
```

**İşlemler:**

1. **Kota Kontrolü:**
   - `check_quota_and_increment()` çağrılır
   - Limit aşıldıysa hata döner

2. **Hizmet Kontrolü:**
   - Hizmet bulunur ve doğrulanır
   - Personel için `permitted_service_ids` kontrolü

3. **Personel Atama:**
   
   **A) Belirli Personel Seçildiyse:**
   - Çakışma kontrolü yapılır
   - Hizmet süresine göre bitiş saati hesaplanır
   - Mevcut randevularla çakışma kontrolü
   - Çakışma varsa hata döner
   
   **B) Otomatik Atama:**
   - Hizmeti verebilen personeller bulunur
   - `admin_provides_service` ayarı kontrol edilir
   - Her personel için çakışma kontrolü yapılır
   - İlk müsait personel seçilir
   - Hiç müsait personel yoksa hata döner

4. **Randevu Durumu:**
   - Bitiş saati geçmişse: "Tamamlandı"
   - Değilse: "Bekliyor"

5. **Müşteri Ekleme:**
   - Telefon ve isim ile duplicate kontrolü
   - Yeni müşteri `customers` collection'ına eklenir
   - WebSocket event: `customer_added`

6. **WebSocket Event:**
   - `appointment_created` event'i gönderilir

**Response:** `Appointment`

---

#### `PUT /api/appointments/{appointment_id}`
**Açıklama:** Randevu güncelle

**İşlemler:**
1. Randevu bulunur ve yetki kontrolü yapılır
2. Güncelleme verileri uygulanır
3. SMS gönderimi (eğer telefon değiştiyse)
4. WebSocket event: `appointment_updated`

---

#### `DELETE /api/appointments/{appointment_id}`
**Açıklama:** Randevu sil

**İşlemler:**
1. Randevu bulunur
2. İlişkili `Transaction` kaydı silinir (varsa)
3. Randevu silinir
4. WebSocket event: `appointment_deleted`

---

#### `GET /api/appointments/{appointment_id}`
**Açıklama:** Tek bir randevu detayı

---

### 🌍 Public Endpoint'leri

#### `GET /api/public/info/{organization_id}`
**Açıklama:** İşletme bilgileri (müşteri sayfası için)

**Response:**
```json
{
  "business_name": "İşletme Adı",
  "logo_url": "https://...",
  "services": [...],
  "staff_members": [...],
  "settings": {
    "customer_can_choose_staff": true,
    "work_start_hour": 9,
    "work_end_hour": 18
  }
}
```

---

#### `GET /api/public/availability/{organization_id}`
**Açıklama:** Müsait saatleri hesapla (müşteri sayfası için)

**Query Parameters:**
- `service_id`: Hizmet ID'si
- `date`: Tarih (YYYY-MM-DD)
- `staff_id`: Personel ID'si (optional, "Farketmez" için boş)

**İşlemler:**

1. **İşletme Ayarları:**
   - `business_hours` alınır
   - `admin_provides_service` kontrol edilir

2. **Gün Kontrolü:**
   - Tarihin hangi güne denk geldiği bulunur
   - İşletme o gün kapalı mı kontrol edilir

3. **Personel Kontrolü:**
   
   **A) Belirli Personel Seçildiyse:**
   - Personelin `days_off` kontrolü
   - İzinliyse boş liste döner
   
   **B) Otomatik Atama:**
   - Hizmeti verebilen tüm personeller bulunur
   - Tüm personeller izinliyse boş liste döner

4. **Slot Hesaplama:**
   - `STEP_INTERVAL = 15` dakika (gizli adım aralığı)
   - Açılış-kapanış saatleri arasında 15 dakikalık slotlar oluşturulur
   - Her slot için:
     - Bitiş saati hesaplanır (başlangıç + hizmet süresi)
     - Geçmiş saat kontrolü (bugün için)
     - Kapanış saati kontrolü
     - Randevu çakışma kontrolü

5. **Çakışma Kontrolü:**
   - Mevcut randevuların bitiş saatleri hesaplanır (hizmet süresine göre)
   - Overlap kontrolü: `(start < appt_end) AND (end > appt_start)`
   - Çakışma varsa `busy_slots` listesine eklenir

6. **Otomatik Atama Mantığı:**
   - Her slot için tüm personeller kontrol edilir
   - En az bir personel müsaitse slot `available_slots`'a eklenir
   - Tüm personeller doluysa `busy_slots`'a eklenir

**Response:**
```json
{
  "available_slots": ["09:00", "09:15", "10:30", ...],
  "all_slots": ["09:00", "09:15", "09:30", ...],
  "busy_slots": ["10:00", "11:00", ...],
  "message": "Müsait saatler"
}
```

---

#### `POST /api/public/appointments`
**Açıklama:** Müşteri sayfasından randevu oluştur

**İşlemler:**
1. Kota kontrolü
2. Personel atama (aynı mantık admin paneli gibi)
3. Randevu oluşturulur
4. Müşteri otomatik eklenir
5. SMS gönderilir (onay SMS'i)
6. WebSocket event: `appointment_created`

---

### 🛠️ Hizmet Endpoint'leri

#### `GET /api/services`
**Açıklama:** Tüm hizmetleri listele

#### `POST /api/services`
**Açıklama:** Yeni hizmet ekle (Sadece admin)

**Request Body:**
```json
{
  "name": "Saç Kesimi",
  "price": 150.0,
  "duration": 30
}
```

#### `PUT /api/services/{service_id}`
**Açıklama:** Hizmet güncelle

#### `DELETE /api/services/{service_id}`
**Açıklama:** Hizmet sil

---

### 👥 Personel Yönetimi Endpoint'leri

#### `POST /api/staff/add`
**Açıklama:** Yeni personel davet et (E-posta ile)

**Request Body:**
```json
{
  "username": "staff@example.com",
  "full_name": "Personel Adı",
  "phone": "05321234567",
  "permitted_service_ids": ["service-id-1", "service-id-2"]
}
```

**İşlemler:**
1. Kullanıcı adı kontrolü (unique)
2. Rastgele `invitation_token` oluşturulur
3. Personel "pending" status ile oluşturulur
4. Şifre alanı boş bırakılır
5. Brevo API ile davet e-postası gönderilir
6. E-postada şifre belirleme linki bulunur

---

#### `PUT /api/staff/{staff_id}/payment`
**Açıklama:** Personel ödeme ayarlarını güncelle

**Request Body:**
```json
{
  "payment_type": "commission", // "salary" veya "commission"
  "payment_amount": 50.0 // Yüzde veya sabit tutar
}
```

---

#### `PUT /api/staff/{staff_id}/days-off`
**Açıklama:** Personel tatil günlerini güncelle

**Request Body:**
```json
{
  "days_off": ["sunday", "monday"]
}
```

---

#### `PUT /api/staff/{staff_id}/services`
**Açıklama:** Personelin verebileceği hizmetleri güncelle

**Request Body:**
```json
{
  "service_ids": ["service-id-1", "service-id-2"]
}
```

---

#### `DELETE /api/staff/{staff_id}`
**Açıklama:** Personel sil

---

### 💰 Finans Endpoint'leri

#### `GET /api/finance/summary`
**Açıklama:** Finans özeti (Gelir, Gider, Net Kâr)

**Query Parameters:**
- `period`: "today", "this_month", "last_month"

**İşlemler:**
1. **Gelir Hesaplama:**
   - "Tamamlandı" statusündeki randevular
   - Tarih aralığına göre filtrelenir
   - `service_price` toplamı

2. **Gider Hesaplama:**
   - `expenses` collection'ından
   - `period == "this_month"` için sadece ay kontrolü (tarih kontrolü yok)
   - Diğer period'lar için tarih aralığı kontrolü

3. **Net Kâr:**
   - `total_revenue - total_expenses`

**Response:**
```json
{
  "period": "this_month",
  "start_date": "2025-11-01",
  "end_date": "2025-11-14",
  "total_revenue": 5000.0,
  "total_expenses": 2000.0,
  "net_profit": 3000.0
}
```

---

#### `GET /api/expenses`
**Açıklama:** Giderleri listele

#### `POST /api/expenses`
**Açıklama:** Yeni gider ekle

**Request Body:**
```json
{
  "title": "Kira",
  "amount": 5000.0,
  "category": "Sabit Giderler",
  "date": "2025-11-01"
}
```

---

#### `GET /api/finance/payroll`
**Açıklama:** Personel hakedişleri

**Query Parameters:**
- `period`: "today", "this_month", "last_month"

**İşlemler:**
1. Her personel için:
   - Tamamlanan randevular bulunur
   - Ödeme tipine göre hesaplama:
     - `salary`: Sabit maaş
     - `commission`: Randevu tutarı × yüzde
   - Yapılan ödemeler bulunur
   - Bakiye = Hakediş - Ödemeler

**Response:**
```json
{
  "period": "this_month",
  "staff_payments": [
    {
      "staff_id": "staff-username",
      "full_name": "Personel Adı",
      "payment_type": "commission",
      "payment_amount": 50.0,
      "completed_appointments": 10,
      "total_earned": 5000.0,
      "total_paid": 2000.0,
      "balance": 3000.0
    }
  ]
}
```

---

#### `POST /api/finance/payroll/payment`
**Açıklama:** Personel ödemesi yap

**Request Body:**
```json
{
  "staff_id": "staff-username",
  "amount": 3000.0,
  "date": "2025-11-14",
  "notes": "Maaş ödemesi"
}
```

**İşlemler:**
1. Ödeme `expenses` collection'ına eklenir
2. `category`: "Personel Ödemeleri"
3. Audit log oluşturulur

---

### 📊 İstatistik Endpoint'leri

#### `GET /api/stats/dashboard`
**Açıklama:** Admin dashboard istatistikleri

**İşlemler:**
1. Bugünkü "Bekliyor" randevuları otomatik tamamla
2. Bugünkü randevu sayısı
3. Yarınki randevu sayısı
4. Bu ay toplam gelir
5. Bu ay toplam gider
6. Net kâr

---

#### `GET /api/stats/personnel`
**Açıklama:** Personel dashboard istatistikleri

**İşlemler:**
1. Personelin bugünkü randevuları
2. Personelin bugünkü geliri
3. Bu ay toplam gelir

---

### ⚙️ Ayarlar Endpoint'leri

#### `GET /api/settings`
**Açıklama:** İşletme ayarlarını getir

#### `PUT /api/settings`
**Açıklama:** İşletme ayarlarını güncelle

**Request Body:** `Settings` modeli

#### `POST /api/settings/logo`
**Açıklama:** Logo yükle

**Request:** Multipart form data (file)

---

### 👤 Müşteri Endpoint'leri

#### `GET /api/customers`
**Açıklama:** Müşterileri listele

**İşlemler:**
1. `appointments` collection'ından unique müşteriler çekilir
2. `customers` collection'ından manuel eklenen müşteriler çekilir
3. Duplicate kontrolü yapılır (telefon + isim)
4. Birleştirilmiş liste döndürülür

---

#### `POST /api/customers`
**Açıklama:** Yeni müşteri ekle (Sadece admin)

**Request Body:**
```json
{
  "name": "Müşteri Adı",
  "phone": "05321234567"
}
```

**İşlemler:**
1. Duplicate kontrolü (telefon + isim, case-insensitive)
2. Yeni müşteri `customers` collection'ına eklenir
3. WebSocket event: `customer_added`

---

#### `DELETE /api/customers/{phone}`
**Açıklama:** Müşteri sil

**İşlemler:**
1. Müşteri `customers` collection'ından silinir
2. İlişkili randevular silinir
3. İlişkili transaction'lar silinir
4. WebSocket event: `customer_deleted`

---

#### `GET /api/customers/{phone}/history`
**Açıklama:** Müşteri geçmişi (randevular, işlemler)

---

#### `PUT /api/customers/{phone}/notes`
**Açıklama:** Müşteri notlarını güncelle

**Request Body:**
```json
{
  "notes": "Müşteri notları"
}
```

---

### 📦 Abonelik Endpoint'leri

#### `GET /api/plans`
**Açıklama:** Tüm planları listele (herkese açık)

**Response:** `PLANS` listesi

---

#### `GET /api/plan/current`
**Açıklama:** Mevcut plan bilgisini getir

**Response:**
```json
{
  "plan_id": "tier_1_standard",
  "quota_usage": 45,
  "quota_limit": 100,
  "trial_end_date": "2025-11-21T00:00:00Z",
  "is_first_month": true
}
```

---

#### `PUT /api/plan/update`
**Açıklama:** Plan güncelle (paket değiştirme)

**Request Body:**
```json
{
  "plan_id": "tier_2_profesyonel"
}
```

---

### 📤 Export Endpoint'leri

#### `GET /api/export/appointments`
**Açıklama:** Randevuları CSV olarak export et

#### `GET /api/export/customers`
**Açıklama:** Müşterileri CSV olarak export et

---

### 📝 Audit Log Endpoint'leri

#### `GET /api/audit-logs`
**Açıklama:** Denetim günlüklerini listele

**Query Parameters:**
- `start_date`, `end_date`: Tarih aralığı
- `action`: "CREATE", "UPDATE", "DELETE"
- `resource_type`: "APPOINTMENT", "CUSTOMER", vb.

---

## 🔌 WebSocket ve Real-Time İletişim

### Socket.IO Yapılandırması

**Server:**
```python
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=socketio_cors_origins,
    logger=True
)
socket_app = socketio.ASGIApp(sio, socketio_path='/api/socket.io', other_asgi_app=app)
```

### Event Handler'lar

#### `connect(sid, environ)`
- Client bağlandığında
- `connection_established` event'i gönderilir

#### `disconnect(sid)`
- Client bağlantısı kesildiğinde

#### `join_organization(sid, data)`
- Client bir organization room'una katılır
- `data.organization_id` ile room adı: `org_{organization_id}`
- Tüm organization güncellemeleri bu room'a gönderilir

#### `leave_organization(sid, data)`
- Client organization room'undan ayrılır

### Event Gönderimi

**`emit_to_organization(organization_id, event, data)`**
- Belirli bir organization'ın tüm client'larına event gönderir
- Kullanım örnekleri:
  - `appointment_created`
  - `appointment_updated`
  - `appointment_deleted`
  - `customer_added`
  - `customer_deleted`

---

## 📧 SMS ve E-posta Entegrasyonları

### SMS Gönderimi

**`send_sms(to_phone: str, message: str) -> bool`**

**İşlemler:**
1. Telefon numarası temizlenir (sadece rakamlar)
2. Türkiye formatına çevrilir (90, 0 prefix'leri kaldırılır)
3. Mesaj temizlenir (fazla boşluklar, max 480 karakter)
4. İletimerkezi API'ye GET request gönderilir
5. XML response parse edilir
6. Başarı/hata loglanır

**SMS Tipleri:**
- **Onay SMS'i:** Randevu oluşturulduğunda
- **Hatırlatma SMS'i:** Randevudan X saat önce (scheduler ile)
- **İptal SMS'i:** Randevu iptal edildiğinde

**`build_sms_message(...)`**
- SMS mesajı template'i oluşturur
- Tarih formatı: `DD.MM.YYYY`
- Mesaj içeriği:
  - İşletme adı
  - Müşteri adı
  - Hizmet adı
  - Tarih ve saat
  - Destek telefonu

### E-posta Gönderimi

**Brevo (Sendinblue) API kullanılır**

#### `send_personnel_invitation_email(...)`
**Açıklama:** Personel davet e-postası

**İçerik:**
- Konu: "PLANN Davetiyesi: Hesabınızı Oluşturun"
- HTML template (logolu)
- Mesaj: İşletme sahibi personeli davet etti
- Buton: "Şifremi Belirle ve Giriş Yap"
- Link: `https://dev.royalpremiumcare.com/setup-password?token={invitation_token}`

#### `send_password_reset_email(...)`
**Açıklama:** Şifre sıfırlama e-postası

**İçerik:**
- Konu: "PLANN Şifre Sıfırlama"
- HTML template
- Şifre sıfırlama linki

---

## 🎫 Kota ve Abonelik Yönetimi

### Plan Yapısı

**`PLANS` Listesi:**
- `tier_trial`: 7 gün trial, 50 randevu
- `tier_1_standard`: 100 randevu/ay, 520 TL/ay
- `tier_2_profesyonel`: 300 randevu/ay, 780 TL/ay
- `tier_3_premium`: 600 randevu/ay, 1100 TL/ay
- `tier_4_business`: 900 randevu/ay, 1300 TL/ay
- `tier_5_enterprise`: 1500 randevu/ay, 1800 TL/ay

### Kota Kontrolü

**`check_quota_and_increment(db, organization_id) -> (bool, str)`**

**İşlemler:**
1. Organization plan'ı getirilir (yoksa trial oluşturulur)
2. Trial kontrolü: Trial süresi dolmuşsa hata
3. Kota reset kontrolü: Reset tarihi geçmişse kullanım sıfırlanır
4. Kota limit kontrolü: Kullanım >= limit ise hata
5. Kullanım artırılır

**Kota Reset:**
- Her ay otomatik reset (30 gün)
- `quota_reset_date` kontrol edilir
- Geçmişse kullanım 0 yapılır ve yeni reset tarihi ayarlanır

---

## 📅 Randevu Yönetimi

### Randevu Durumları

- **"Bekliyor":** Randevu henüz gerçekleşmedi
- **"Tamamlandı":** Randevu bitiş saatine ulaştı (otomatik)
- **"İptal":** Randevu iptal edildi

### Otomatik Tamamlanma

**Çalışma Mantığı:**
1. Her `GET /api/appointments` çağrısında
2. "Bekliyor" statusündeki randevular kontrol edilir
3. Bitiş saati hesaplanır: `appointment_time + service_duration`
4. Şu anki saat >= bitiş saati ise:
   - Status "Tamamlandı" yapılır
   - `Transaction` kaydı oluşturulur
   - `completed_at` ayarlanır

**Aynı mantık:**
- `GET /api/stats/dashboard`
- `GET /api/stats/personnel`
- Randevu oluşturulurken (eğer geçmiş tarihliyse)

### Transaction Oluşturma

Randevu tamamlandığında otomatik olarak:
- `transactions` collection'ına kayıt eklenir
- `appointment_id`: İlişkili randevu
- `amount`: Hizmet fiyatı
- `date`: Randevu tarihi

---

## 🕐 Müsaitlik Hesaplama

### Algoritma

1. **Gün Kontrolü:**
   - Tarihin hangi güne denk geldiği bulunur
   - İşletme o gün kapalı mı?
   - Personel o gün izinli mi?

2. **Slot Oluşturma:**
   - `STEP_INTERVAL = 15` dakika (gizli)
   - Açılış-kapanış saatleri arasında 15 dakikalık slotlar

3. **Filtreleme:**
   - Geçmiş saatler (bugün için)
   - Kapanış saati kontrolü
   - Randevu çakışmaları

4. **Çakışma Kontrolü:**
   - Her mevcut randevu için bitiş saati hesaplanır
   - Overlap kontrolü: `(new_start < existing_end) AND (new_end > existing_start)`

5. **Otomatik Atama:**
   - Tüm personeller kontrol edilir
   - En az bir personel müsaitse slot available
   - Tüm personeller doluysa slot busy

---

## 💰 Finans ve Kasa Yönetimi

### Gelir Hesaplama

- **Kaynak:** "Tamamlandı" statusündeki randevular
- **Hesaplama:** `service_price` toplamı
- **Otomatik:** Randevu tamamlandığında `Transaction` oluşturulur

### Gider Hesaplama

- **Kaynak:** `expenses` collection'ı
- **Kategoriler:**
  - Sabit Giderler (kira, fatura)
  - Personel Ödemeleri
  - Malzeme
  - Diğer

### Personel Hakedişleri

**Hesaplama:**
- **Sabit Maaş:** `payment_amount` (aylık)
- **Komisyon:** `(randevu_tutarı × payment_amount / 100) × randevu_sayısı`

**Ödeme:**
- Admin personel ödemesi yapar
- `POST /api/finance/payroll/payment` endpoint'i kullanılır
- Ödeme `expenses` collection'ına eklenir
- Bakiye = Hakediş - Ödemeler

---

## 👥 Personel Yönetimi

### Personel Ekleme Akışı

1. Admin personel bilgilerini girer (şifre olmadan)
2. Sistem `invitation_token` oluşturur
3. Personel "pending" status ile kaydedilir
4. Brevo API ile davet e-postası gönderilir
5. Personel e-postadaki linke tıklar
6. Şifre belirler (`POST /api/auth/setup-password`)
7. Status "active" yapılır

### Personel İzin Günleri

- `days_off`: Haftalık tatil günleri listesi
- Örnek: `["sunday", "monday"]`
- Müsaitlik hesaplamada kullanılır
- İzinli günlerde personel müsait değildir

### Personel Hizmet Yetkileri

- `permitted_service_ids`: Personelin verebileceği hizmet ID'leri
- Admin tarafından ayarlanır
- Randevu oluştururken kontrol edilir

---

## 👤 Müşteri Yönetimi

### Müşteri Kaynakları

1. **Randevu Oluşturma:**
   - Admin/Personel panelinden
   - Public booking sayfasından
   - Otomatik olarak `customers` collection'ına eklenir

2. **Manuel Ekleme:**
   - Admin "Yeni Müşteri" butonundan
   - Sadece isim ve telefon

### Duplicate Kontrolü

- Telefon numarası + İsim (case-insensitive)
- Aynı müşteri tekrar eklenmez

### Müşteri Notları

- Her müşteri için notlar saklanır
- Admin ve personel (kendi müşterileri için) not ekleyebilir
- `customer_notes` collection'ında saklanır

---

## 🛠️ Yardımcı Fonksiyonlar

### `slugify(text: str) -> str`
- Türkçe karakterleri Latin'e çevirir
- URL-friendly slug oluşturur
- Örnek: "İşletme Adı" → "isletmeadi"

### `make_json_serializable(obj)`
- MongoDB ObjectId'leri string'e çevirir
- Datetime'ları ISO format'a çevirir
- WebSocket event'leri için kullanılır

### `clean_dict_for_audit(data: dict) -> dict`
- Audit log için veri temizleme
- MongoDB `_id` alanlarını kaldırır

### `create_audit_log(...)`
- Denetim günlüğü kaydı oluşturur
- Tüm önemli işlemler loglanır:
  - CREATE, UPDATE, DELETE işlemleri
  - Kullanıcı bilgileri
  - IP adresi
  - Eski ve yeni değerler

---

## 🔄 Önemli Akışlar

### Randevu Oluşturma Akışı

```
1. Kota kontrolü
   ↓
2. Hizmet doğrulama
   ↓
3. Personel atama (belirli veya otomatik)
   ↓
4. Çakışma kontrolü
   ↓
5. Randevu oluşturma
   ↓
6. Durum belirleme (Bekliyor/Tamamlandı)
   ↓
7. Müşteri ekleme (duplicate kontrolü)
   ↓
8. WebSocket event gönderme
   ↓
9. SMS gönderimi (public booking için)
```

### SMS Hatırlatma Akışı

```
1. Scheduler her 5 dakikada çalışır
   ↓
2. Tüm organization'ların ayarları alınır
   ↓
3. Her organization için:
   - reminder_hours hesaplanır
   - Zaman aralığı belirlenir (tolerance: ±6 dakika)
   ↓
4. Bu aralıktaki randevular bulunur
   ↓
5. Her randevu için:
   - SMS mesajı oluşturulur
   - SMS gönderilir
   - reminder_sent = True yapılır
```

### Randevu Otomatik Tamamlanma Akışı

```
1. GET /api/appointments çağrılır
   ↓
2. "Bekliyor" statusündeki randevular bulunur
   ↓
3. Her randevu için:
   - Bitiş saati hesaplanır (başlangıç + süre)
   - Şu anki saat >= bitiş saati mi?
   ↓
4. Evet ise:
   - Status = "Tamamlandı"
   - Transaction oluşturulur
   - completed_at ayarlanır
   ↓
5. Veritabanı güncellenir
```

---

## 🐛 Hata Yönetimi

### HTTP Exception'lar

- **401 Unauthorized:** Token geçersiz veya kullanıcı bulunamadı
- **403 Forbidden:** Yetki yok (ör: staff admin işlemi yapamaz)
- **404 Not Found:** Kayıt bulunamadı
- **422 Unprocessable Entity:** Validasyon hatası
- **500 Internal Server Error:** Sunucu hatası

### Logging

- **INFO:** Normal işlemler, başarılı işlemler
- **WARNING:** Uyarılar (ör: MongoDB bağlantı hatası)
- **ERROR:** Hatalar (ör: SMS gönderim hatası)
- **DEBUG:** Detaylı debug bilgileri

Log dosyası: `/tmp/backend.log`

---

## 🔒 Güvenlik Notları

1. **JWT Secret Key:**
   - Production'da mutlaka değiştirilmeli
   - Environment variable olarak saklanmalı

2. **Şifre Hashleme:**
   - Bcrypt kullanılır (güvenli)
   - Her hash benzersizdir

3. **Rate Limiting:**
   - Brute force saldırılarına karşı koruma
   - Redis ile yönetilir

4. **Multi-Tenant İzolasyonu:**
   - Her query'de `organization_id` kontrolü
   - Kullanıcılar sadece kendi organization'larını görebilir

5. **Audit Logging:**
   - Tüm önemli işlemler loglanır
   - IP adresi kaydedilir

---

## 📝 Notlar ve İpuçları

1. **MongoDB Lazy Initialization:**
   - Başlangıçta bağlantı başarısız olursa
   - İlk request'te tekrar denenir

2. **Scheduler Global Instance:**
   - `_app_instance` global değişkeni kullanılır
   - Scheduler'dan MongoDB'ye erişim için gerekli

3. **Timezone:**
   - Türkiye saati: `Europe/Istanbul` (ZoneInfo)
   - UTC: `timezone.utc`

4. **Service Duration:**
   - Varsayılan: 30 dakika
   - Her hizmet için ayrı ayarlanabilir
   - Müsaitlik hesaplamada kritik

5. **Business Hours:**
   - Her gün için ayrı ayarlanabilir
   - `is_open`, `open_time`, `close_time`
   - Müsaitlik hesaplamada kullanılır

---

## 🚀 Performans Optimizasyonları

1. **Database Indexes:**
   - Sık kullanılan query'ler için index'ler
   - `organization_id` + diğer alanlar

2. **Batch Operations:**
   - Service duration'lar batch olarak çekilir
   - N+1 query problemi önlenir

3. **Caching:**
   - Redis cache kullanılabilir (gelecekte)

4. **Lazy Loading:**
   - MongoDB bağlantısı lazy initialize edilir
   - İlk request'te bağlanır

---

## 📚 Sonuç

Bu dokümantasyon, `server.py` dosyasının tüm özelliklerini, endpoint'lerini, fonksiyonlarını ve iş akışlarını detaylıca açıklamaktadır. Sistem, multi-tenant SaaS mimarisi ile çalışan, real-time güncellemeler destekleyen, otomatik SMS hatırlatmaları olan kapsamlı bir randevu yönetim sistemidir.

**Önemli Hatırlatmalar:**
- Production'da environment variable'ları mutlaka ayarlayın
- JWT secret key'i güvenli tutun
- MongoDB ve Redis bağlantılarını kontrol edin
- Log dosyalarını düzenli olarak kontrol edin
- Rate limiting ayarlarını ihtiyaca göre yapılandırın

---

**Dokümantasyon Tarihi:** 2025-11-14  
**Versiyon:** 1.4.2 (Final Fixes)  
**Dosya:** `/var/www/royalpremiumcare_dev/backend/server.py`

