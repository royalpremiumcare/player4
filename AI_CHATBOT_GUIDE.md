# 🤖 PLANN AI Chatbot - Kurulum ve Kullanım Kılavuzu

## ✅ Kurulum Tamamlandı

PLANN projesine **Google Gemini 2.5 Flash** destekli akıllı AI chatbot başarıyla entegre edildi!

---

## 📋 Yapılan İşlemler

### 1. **Backend (Python/FastAPI)**

#### Dosyalar:
- ✅ `/backend/ai_service.py` - AI servisi ve tool fonksiyonları
- ✅ `/backend/server.py` - API endpoint eklendi (`POST /api/ai/chat`)
- ✅ `/backend/rate_limit.py` - AI chat için rate limit eklendi

#### Özellikler:
- **Sistem Dokümantasyonu**: PLANN kullanım kılavuzu AI'a öğretildi
- **Tool Functions (Operasyonel İşlemler)**:
  - ✅ `create_appointment` - Randevu oluşturma (müsaitlik kontrolü ile)
  - ✅ `cancel_appointment` - Randevu iptal etme
  - ✅ `add_customer` - Müşteri ekleme
  - ✅ `delete_customer` - Müşteri silme (onay gerekli)
  - ✅ `get_dashboard_status` - Dashboard durumu (rol bazlı)

#### Güvenlik:
- **Rol Bazlı Erişim Kontrolü**:
  - `staff` (Personel): Sadece kendi randevu ve kazanç bilgilerine erişebilir
  - `admin` (İşletme Sahibi): Tüm verilere erişim
- **Rate Limiting**: 20 istek/dakika
- **Token Authentication**: JWT token ile güvenli erişim

---

### 2. **Frontend (React)**

#### Dosyalar:
- ✅ `/frontend/src/components/ChatWidget.js` - Modern, responsive chatbot bileşeni
- ✅ `/frontend/src/App.js` - ChatWidget entegrasyonu

#### Özellikler:
- **Modern UI/UX**:
  - Sağ altta sabit chat butonu (✨ ikonu)
  - Açılır/kapanır chat penceresi
  - Gradient renkler (purple to blue)
  - Animasyonlu loader
  - Responsive tasarım (mobil uyumlu)

- **Kullanıcı Deneyimi**:
  - Rol bazlı örnek sorular (admin/personel)
  - Gerçek zamanlı mesajlaşma
  - Markdown desteği
  - Scroll to bottom özelliği
  - Keyboard shortcuts (Enter to send)

- **Örnek Sorular**:
  - **Admin**: "Bugün durum ne? 📊", "Bu ay kaç randevumuz var?", "Randevu oluştur"
  - **Personel**: "Bugün kaç randevum var?", "Bu ay ne kadar kazandım?", "Sistem nasıl kullanılır?"

---

## 🔧 Yapılandırma

### 1. `.env` Dosyası
`.env` dosyasına API key'i eklenmiş durumda:

```bash
# Google Gemini API Key (AI Chatbot için)
GOOGLE_GEMINI_KEY=AIzaSyCr11ImAiIHH_g4-l0AtjdKBpq8ZXOjFfA
```

> ⚠️ **Güvenlik Notu**: API key'i production ortamında güvende tutun!

### 2. Backend Requirements
`google-generativeai` kütüphanesi zaten yüklü:
```bash
pip install google-generativeai
```

---

## 🚀 Kullanım

### Backend Başlatma
Backend çalışıyorsa otomatik olarak AI endpoint aktif olacak:
```bash
cd /var/www/royalpremiumcare_dev/backend
python3 server.py
```

### Frontend Başlatma
```bash
cd /var/www/royalpremiumcare_dev/frontend
npm start
```

### Chatbot'u Kullanma
1. Sisteme giriş yapın (admin veya personel)
2. Sağ alt köşede **✨ AI** butonuna tıklayın
3. Sohbete başlayın!

---

## 💬 Örnek Sohbet Senaryoları

### Senaryo 1: Dashboard Durumu Sorgulama (Admin)
**Kullanıcı**: "Bugün durum ne?"

**AI**: "📊 Bugün 12 randevu var, 3500₺ gelir elde ettiniz. Bu ay toplam 45 randevu ve 15,200₺ gelir gerçekleşti. Harika gidiyorsunuz! 🎉"

---

### Senaryo 2: Randevu Oluşturma (Admin)
**Kullanıcı**: "Ahmet Yılmaz için yarın saat 14:00'te saç kesimi randevusu oluştur"

**AI**: "Tabii! Ahmet Yılmaz için randevu oluşturuyorum. Telefon numarasını alabilir miyim?"

**Kullanıcı**: "05551234567"

**AI**: "✅ Randevu oluşturuldu! Ahmet Yılmaz - 2025-11-19 14:00 (Mehmet Çalışkan)"

---

### Senaryo 3: Personel Kendini Sorgular
**Kullanıcı (Personel)**: "Bu ay ne kadar kazandım?"

**AI**: "📊 Bu ay 23 randevu tamamladınız ve 6,900₺ ciro yaptınız. Harika performans! 💪"

**Kullanıcı (Personel)**: "Genel ciro ne kadar?"

**AI**: "🔒 Yetkiniz yok. Bu bilgiye sadece Admin erişebilir."

---

### Senaryo 4: Sistem Kullanımı Sorusu
**Kullanıcı**: "Randevu nasıl iptal edilir?"

**AI**: "Randevu iptal etmek için:
1. Takvim sekmesine gidin
2. İptal etmek istediğiniz randevuya tıklayın
3. 'İptal Et' butonuna basın
4. Onaylayın

Alternatif olarak, bana randevu ID'sini söylerseniz ben de iptal edebilirim. 📅"

---

## 🎯 AI'ın Yetenekleri

### Bilgi Sağlama (Knowledge Base)
- ✅ Sistem kullanımı hakkında bilgi
- ✅ Özellik açıklamaları
- ✅ Adım adım kılavuzlar
- ✅ Sık sorulan sorular

### Operasyonel İşlemler (Tools)
- ✅ Randevu oluşturma (müsaitlik kontrolü ile)
- ✅ Randevu iptal etme
- ✅ Müşteri ekleme/silme
- ✅ Dashboard durum sorgulama (rol bazlı)

### Güvenlik ve Yetki Yönetimi
- ✅ Rol bazlı veri filtreleme (admin vs personel)
- ✅ Hassas işlemlerde onay isteme (silme vb.)
- ✅ JWT token doğrulama

---

## 📊 Teknik Detaylar

### API Endpoint
```
POST /api/ai/chat
Authorization: Bearer {JWT_TOKEN}

Request Body:
{
  "message": "Kullanıcı mesajı",
  "history": [
    {"role": "user", "parts": [{"text": "..."}]},
    {"role": "model", "parts": [{"text": "..."}]}
  ]
}

Response:
{
  "success": true,
  "message": "AI yanıtı",
  "history": [...]
}
```

### Model Bilgileri
- **Model**: `gemini-2.5-flash`
- **Tool Calling**: Aktif
- **Context**: Sistem dokümantasyonu + Kullanıcı bilgileri
- **Max Iterations**: 5 (sonsuz döngü önleme)

### Frontend State Management
- **Chat History**: Local state (her oturum bağımsız)
- **Mesajlar**: React state
- **Loading State**: Typing animasyonu

---

## 🔒 Güvenlik Kontrol Listesi

✅ API key `.env` dosyasında güvenli bir şekilde saklanıyor
✅ JWT token ile authentication
✅ Rate limiting aktif (20 req/min)
✅ Rol bazlı erişim kontrolü
✅ Hassas işlemlerde onay mekanizması
✅ Input validation ve sanitization

---

## 🐛 Sorun Giderme

### Problem: AI yanıt vermiyor
**Çözüm**: 
1. `.env` dosyasında `GOOGLE_GEMINI_KEY` var mı kontrol edin
2. Backend loglarını kontrol edin: `/tmp/backend.log`
3. Network tab'ında 401/403 hatası var mı kontrol edin

### Problem: "Yetkiniz yok" hatası
**Çözüm**: Bu normal! Personel kullanıcıları sadece kendi verilerine erişebilir.

### Problem: ChatWidget görünmüyor
**Çözüm**:
1. Sisteme giriş yaptığınızdan emin olun
2. Browser console'da hata var mı kontrol edin
3. `currentUser` state'inin dolu olduğundan emin olun

---

## 🚀 Gelecek Geliştirmeler

Sistemi daha da güçlendirmek için:

1. **Daha Fazla Tool**: 
   - Hizmet yönetimi (ekleme/düzenleme)
   - Personel performans analizi
   - SMS/Email gönderimi
   - Rapor oluşturma

2. **Gelişmiş NLP**:
   - Türkçe varlık tanıma (NER)
   - Tarih/saat parsing iyileştirmesi
   - Context-aware responses

3. **Chat History**:
   - Database'de chat geçmişi saklama
   - Sohbet özeti oluşturma
   - Favorilere ekleme

4. **Analytics**:
   - En çok sorulan sorular
   - Tool kullanım istatistikleri
   - User engagement metrikleri

---

## 📝 Notlar

- AI bazen hata yapabilir, önemli kararlar için doğrulama yapın
- Rate limit aşılırsa 1 dakika bekleyin
- Chat history her yenileme sonrası temizlenir
- API maliyetlerini izlemek için Google Cloud Console'u kullanın

---

## 🎉 Kurulum Tamamlandı!

PLANN AI Chatbot başarıyla entegre edildi ve kullanıma hazır! 

Sorularınız için: AI chatbot'u kullanın! 😄

---

**Son Güncelleme**: 18 Kasım 2025
**Versiyon**: 1.0.0
**Geliştirici**: Cascade AI Assistant
