# PayTR Recurring Payment (Otomatik Ödeme) Sistemi

## 📋 Genel Bakış

Bu sistem, müşterilerin kart bilgilerini güvenli şekilde saklayıp her ay otomatik olarak ödeme almayı sağlar.

## 🔄 Sistem Akışı

### 1. İlk Ödeme (Kart Kaydetme)
Kullanıcı ilk kez ödeme yaptığında:
- PayTR'a `store_card=1` parametresi gönderilir
- PayTR kartı tokenize eder ve `utoken` + `ctoken` döner
- Bu token'lar `organization_plans` collection'ına şifrelenmeden saklanır
- `card_saved=True` ve `next_billing_date` set edilir

**Endpoint:** `POST /api/payments/create-checkout-session`

### 2. Otomatik Ödeme (Her Ay)
Cron job her gün saat 02:00'de çalışır:
- `next_billing_date` bugün veya öncesi olan organizasyonları bulur
- Kayıtlı kart token'ları ile PayTR'a ödeme talebi gönderir
- Başarılı ödeme → Plan 30 gün daha uzatılır
- Başarısız ödeme → 3 gün sonra tekrar denenir

**Scheduler:** `check_and_process_recurring_payments()` - Daily at 02:00 UTC

### 3. Başarısız Ödeme Yönetimi (Retry)
- Ödeme başarısız olursa `payment_retry_count` artırılır
- `next_billing_date` 3 gün ileriye alınır
- 3 gün sonra sistem tekrar deneyecek
- TODO: Admin'e e-posta bildirimi gönderilmeli

## 🗄️ Database Schema

### organization_plans Collection
```javascript
{
  organization_id: String,
  plan_id: String,
  quota_limit: Number,
  quota_usage: Number,
  quota_reset_date: ISODate,
  
  // Recurring Payment Alanları (YENİ)
  card_saved: Boolean,                    // Kart kaydedildi mi?
  payment_utoken: String,                 // PayTR user token
  payment_ctoken: String,                 // PayTR card token
  card_saved_at: ISODate,                 // Kart ne zaman kaydedildi
  next_billing_date: ISODate,             // Bir sonraki ödeme tarihi
  last_payment_date: ISODate,             // Son başarılı ödeme
  last_payment_attempt: ISODate,          // Son ödeme denemesi
  payment_retry_count: Number,            // Başarısız deneme sayısı
  
  is_first_month: Boolean,
  trial_start_date: ISODate,
  trial_end_date: ISODate,
  created_at: ISODate,
  updated_at: ISODate
}
```

### payment_logs Collection
```javascript
{
  merchant_oid: String,                   // Unique order ID
  organization_id: String,
  plan_id: String,
  amount: Number,
  status: String,                         // pending/active/failed
  payment_type: String,                   // initial/recurring/auto_recurring
  failed_reason: String,
  created_at: ISODate,
  completed_at: ISODate
}
```

## 🔌 API Endpoints

### 1. İlk Ödeme (Kart Saklama)
```http
POST /api/payments/create-checkout-session
Authorization: Bearer <token>

Request:
{
  "plan_id": "tier_1_standard"
}

Response:
{
  "checkout_url": "https://www.paytr.com/odeme/guvenli/TOKEN",
  "merchant_oid": "PLANN123456789"
}
```

**Değişiklikler:**
- `store_card: '1'` parametresi eklendi
- Hash hesaplamasına `store_card` dahil edildi

### 2. Webhook (Ödeme Sonucu)
```http
POST /api/webhook/paytr-success
Content-Type: application/x-www-form-urlencoded

Form Data:
merchant_oid=xxx&status=success&total_amount=520.00&utoken=xxx&ctoken=xxx&hash=xxx
```

**Değişiklikler:**
- `utoken` ve `ctoken` alınıp database'e kaydediliyor
- `next_billing_date` 30 gün sonra set ediliyor

### 3. Manuel Recurring Payment (Superadmin)
```http
POST /api/payments/process-recurring?organization_id=xxx
Authorization: Bearer <superadmin-token>

Response:
{
  "status": "success",
  "message": "Ödeme başarılı",
  "merchant_oid": "RECUR123456789"
}
```

## ⚙️ Scheduler Jobs

### SMS Reminder Job
- **Frekans:** Her 5 dakika
- **Fonksiyon:** `check_and_send_reminders()`
- **İş:** Yarın olan randevulara SMS hatırlatma gönderir

### Recurring Payment Job (YENİ)
- **Frekans:** Her gün 02:00 UTC (Türkiye 05:00)
- **Fonksiyon:** `check_and_process_recurring_payments()`
- **İş:** Vadesi gelen ödemeleri otomatik olarak çeker

## 🔐 Güvenlik

### Token Yönetimi
- `utoken` ve `ctoken` PayTR tarafından şifrelenir
- Database'de plaintext olarak saklanır (PayTR'nin önerisi)
- Sadece PayTR API'sine gönderilir, asla frontend'e gitmez

### Hash Doğrulama
**İlk Ödeme Hash:**
```
merchant_id + user_ip + merchant_oid + email + payment_amount + 
user_basket + no_installment + max_installment + currency + 
test_mode + store_card
```

**Recurring Payment Hash:**
```
merchant_id + user_ip + merchant_oid + email + payment_amount + 
payment_type + installment_count + currency + test_mode + non_3d
```

## 🧪 Test Senaryoları

### Test 1: İlk Ödeme ve Kart Kaydetme
1. Admin olarak giriş yap
2. Abonelik sayfasından plan seç
3. PayTR test kartı ile ödeme yap:
   - Kart: 9792 0305 1008 7269
   - CVV: 000
   - 3D: Herhangi bir şifre
4. Database'de `card_saved: true` kontrol et

### Test 2: Recurring Payment (Manuel Tetikleme)
```bash
# Superadmin token ile
curl -X POST "http://localhost:8080/api/payments/process-recurring?organization_id=ORG_ID" \
  -H "Authorization: Bearer SUPERADMIN_TOKEN"
```

### Test 3: Scheduler Testi
```python
# Server loglarında kontrol et
logging.info("Step 4 SUCCESS: Schedulers started")
logging.info("  - Recurring Payments: Daily at 02:00 UTC")
```

## 📊 Monitoring & Logs

### Başarılı Recurring Payment
```
[INFO] Processing recurring payment for organization: xxx, plan: tier_1_standard
[INFO] ✓ Auto recurring payment successful for organization: xxx
```

### Başarısız Recurring Payment
```
[ERROR] ✗ Auto recurring payment failed for xxx: Insufficient funds
[INFO] Retry scheduled for 3 days later
```

### PayTR API Hatası
```
[ERROR] ✗ PayTR HTTP error for xxx: 500
```

## 🚀 Deployment Checklist

- [ ] `store_card` parametresi hash'e dahil edildi
- [ ] Webhook'te `utoken` ve `ctoken` kaydediliyor
- [ ] Scheduler her gün 02:00'de çalışıyor
- [ ] Başarısız ödemeler 3 gün sonra tekrar deneniyor
- [ ] Payment logs'ta `payment_type` alanı mevcut
- [ ] Database indexes oluşturuldu
- [ ] Test mode kapalı (`test_mode = '0'`)

## 🔄 İptal ve Güncelleme

### Abonelik İptali
TODO: Kart bilgilerini silme endpoint'i gerekli
```http
DELETE /api/payments/cancel-subscription
```

### Kart Güncelleme
Kullanıcı yeni ödeme yaptığında token'lar otomatik güncellenir.

## ⚠️ Önemli Notlar

1. **Non-3D Zorunlu:** Recurring payment'ler Non-3D olmalı (kullanıcı etkileşimi yok)
2. **Retry Limiti:** 3 başarısız denemeden sonra manuel müdahale gerekir
3. **Email Bildirimleri:** Başarısız ödemelerde admin'e e-posta gönderilmeli (TODO)
4. **KVKK/GDPR:** Kart saklama için kullanıcı onayı alınmalı
5. **PCI-DSS:** PayTR tokenization kullandığı için PCI-DSS compliance sağlanmış

## 📝 Yapılacaklar (TODO)

- [ ] Başarısız ödeme için e-posta bildirimi
- [ ] Abonelik iptal endpoint'i
- [ ] Kart bilgisi güncelleme UI
- [ ] Ödeme geçmişi sayfası
- [ ] Retry limit (3 deneme) uyarısı
- [ ] Admin panel: Recurring payment durumları
- [ ] Webhook retry mekanizması

## 📞 Destek

Sorularınız için:
- PayTR Dokümantasyon: https://dev.paytr.com
- Royal Premium Care Dev Team

---

**Son Güncelleme:** 2025-11-18
**Versiyon:** 1.0.0
**Geliştirici:** Cascade AI
