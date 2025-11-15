# PLANN SaaS - Geliştirme Kuralları

## 🎯 ÖNEMLİ: Veri Saklama Politikası

Bu bir **SaaS (Software as a Service)** projesidir. Tüm veriler **MongoDB**'ye kaydedilmelidir.

### ✅ MongoDB'ye Kaydedilmesi Gerekenler:

1. **Randevular (Appointments)**
   - Tüm randevu oluşturma, güncelleme, silme işlemleri MongoDB'ye kaydedilmeli
   - Collection: `appointments`

2. **Müşteriler (Customers)**
   - Müşteri ekleme, güncelleme, silme işlemleri MongoDB'ye kaydedilmeli
   - Collection: `customers`

3. **Kullanıcılar/Personel (Users)**
   - Kullanıcı kayıt, güncelleme, silme işlemleri MongoDB'ye kaydedilmeli
   - Collection: `users`

4. **İşletme Ayarları (Settings)**
   - Tüm ayar değişiklikleri MongoDB'ye kaydedilmeli
   - Collection: `settings`

5. **Gelirler/Giderler (Transactions/Expenses)**
   - Tüm finansal işlemler MongoDB'ye kaydedilmeli
   - Collections: `transactions`, `expenses`

6. **Hizmetler (Services)**
   - Hizmet ekleme, güncelleme, silme işlemleri MongoDB'ye kaydedilmeli
   - Collection: `services`

7. **Müşteri Notları (Customer Notes)**
   - Müşteri notları MongoDB'ye kaydedilmeli
   - Collection: `customer_notes`

8. **Denetim Kayıtları (Audit Logs)**
   - Önemli işlemlerin logları MongoDB'ye kaydedilmeli
   - Collection: `audit_logs`

### ❌ localStorage/sessionStorage Kullanımı:

**SADECE** şu durumlarda kullanılabilir:
- ✅ Authentication token'ları (`authToken`)
- ✅ Kullanıcı rolü (`userRole`)
- ✅ Tema ayarları (`theme`)
- ✅ Geçici UI state'leri (modal açık/kapalı, form state'leri)

**ASLA** şunlar için kullanılmamalı:
- ❌ Müşteri verileri
- ❌ Randevu verileri
- ❌ Ayarlar
- ❌ Finansal veriler
- ❌ Herhangi bir kalıcı veri

### 📝 Yeni Özellik Geliştirirken:

1. **Backend'de:**
   - Yeni bir endpoint oluştururken, veriyi MongoDB'ye kaydetmeyi unutmayın
   - `db.collection_name.insert_one()` veya `db.collection_name.update_one()` kullanın
   - `organization_id` ile veriyi izole edin (multi-tenant yapı)

2. **Frontend'de:**
   - Veriyi localStorage'a kaydetmek yerine, backend API'ye POST/PUT isteği gönderin
   - Başarılı kayıt sonrası veriyi backend'den tekrar yükleyin

3. **Örnek Kod Yapısı:**

```python
# Backend (server.py)
@api_router.post("/new-feature")
async def create_new_feature(request: Request, data: FeatureModel, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request)
    
    doc = {
        "id": str(uuid.uuid4()),
        "organization_id": current_user.organization_id,
        "data": data.dict(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.new_collection.insert_one(doc)
    return {"message": "Başarıyla kaydedildi", "id": doc["id"]}
```

```javascript
// Frontend
const handleSave = async () => {
  try {
    const response = await api.post("/new-feature", formData);
    toast.success("Başarıyla kaydedildi");
    await loadData(); // Veriyi backend'den tekrar yükle
  } catch (error) {
    toast.error("Hata oluştu");
  }
};
```

### 🔍 Kontrol Listesi:

Yeni bir özellik eklerken kendinize sorun:
- [ ] Veri MongoDB'ye kaydediliyor mu?
- [ ] `organization_id` ile izole edilmiş mi?
- [ ] Frontend'de localStorage kullanılmıyor mu?
- [ ] Veri backend'den tekrar yükleniyor mu?
- [ ] Multi-tenant yapı korunuyor mu?

---

**Son Güncelleme:** $(date +"%Y-%m-%d")
**Proje:** PLANN SaaS Platform
