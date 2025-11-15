# WebSocket Güvenlik Denetimi Raporu

**Tarih:** 2025-01-XX  
**Kapsam:** `server.py` dosyasındaki Socket.IO entegrasyonu  
**Denetim Türü:** Authentication (Kimlik Doğrulama) ve Authorization (Yetkilendirme)

---

## 📋 Özet

Bu rapor, WebSocket bağlantılarının güvenlik mekanizmalarını analiz etmektedir. İki kritik güvenlik açığı tespit edilmiştir:

1. **Authentication Eksikliği**: `connect` event'inde token doğrulaması yapılmıyor
2. **Authorization Eksikliği**: `join_organization` event'inde kullanıcının organizasyona ait olup olmadığı kontrol edilmiyor

---

## 🔍 1. Authentication (Kimlik Doğrulama) Kontrolü

### Mevcut Durum

**Kod Konumu:** `server.py`, satır 289-297

```python
@sio.event
async def connect(sid, environ):
    """Client connected"""
    logger.info(f"🔵 [CONNECT] WebSocket client connected: {sid}")
    try:
        await sio.emit('connection_established', {'status': 'connected'}, room=sid)
        logger.info(f"✓ [CONNECT] Sent connection_established to {sid}")
    except Exception as e:
        logger.error(f"✗ [CONNECT] Error sending connection_established: {e}", exc_info=True)
```

### Analiz

#### ❌ Sorun 1: Token Doğrulaması Yok

**Açıklama:**
- `connect` event handler'ında hiçbir JWT token doğrulaması yapılmıyor
- `environ` parametresinden token bilgisi alınmıyor veya kontrol edilmiyor
- Herhangi bir istemci (token olmadan bile) WebSocket bağlantısı kurabiliyor

**Kod İncelemesi:**
- `environ` parametresi mevcut ancak kullanılmıyor
- HTTP header'lardan `Authorization` başlığı okunmuyor
- Query string'den token parametresi kontrol edilmiyor
- Token doğrulama fonksiyonu (`get_current_user`) çağrılmıyor

#### ❌ Sorun 2: Bağlantı Anında Doğrulama Yok

**Açıklama:**
- Token doğrulaması yapmayan bir kullanıcı bağlantıda kalabiliyor
- `connect` event'i herhangi bir authentication kontrolü yapmadan başarılı oluyor
- Sadece `connection_established` event'i gönderiliyor, bağlantı reddedilmiyor

**Güvenlik Etkisi:**
- **Kritik**: Herkes WebSocket bağlantısı kurabilir
- Token olmadan bile bağlantı kurulabilir
- Rate limiting veya bağlantı sayısı kontrolü yok

### Frontend'de Token Gönderimi

**Kod Konumu:** `frontend/src/App.js`, satır 185-192

```javascript
const socket = io(socketUrl, {
  path: '/api/socket.io',
  transports: ['websocket', 'polling'],
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  autoConnect: true
});
```

**Analiz:**
- Frontend'de Socket.IO bağlantısı kurulurken token header'da gönderilmiyor
- Token sadece client-side'da parse edilip `join_organization` event'inde `organization_id` olarak gönderiliyor
- Socket.IO client'ın `auth` veya `extraHeaders` parametresi kullanılmıyor

---

## 🔍 2. Authorization (Yetkilendirme) Kontrolü

### Mevcut Durum

**Kod Konumu:** `server.py`, satır 305-333

```python
@sio.event
async def join_organization(sid, data):
    """Join organization room for real-time updates"""
    logger.info(f"🟢 [JOIN_ORG] join_organization event received from {sid} with data: {data}")
    try:
        organization_id = data.get('organization_id')
        if organization_id:
            room_name = f"org_{organization_id}"
            await sio.enter_room(sid, room_name)
            logger.info(f"✓ [JOIN_ORG] Client {sid} joined organization room: {room_name}")
            # ... logging code ...
            await sio.emit('joined_organization', {'organization_id': organization_id}, room=sid)
        else:
            logger.warning(f"⚠ [JOIN_ORG] join_organization called without organization_id from {sid}")
    except Exception as e:
        logger.error(f"✗ [JOIN_ORG] Error in join_organization: {e}", exc_info=True)
```

### Analiz

#### ❌ Sorun 1: Token Doğrulaması Yok

**Açıklama:**
- `join_organization` event'inde JWT token doğrulaması yapılmıyor
- `data` parametresinden sadece `organization_id` alınıyor
- Token bilgisi hiç kontrol edilmiyor

**Kod İncelemesi:**
- `get_current_user` fonksiyonu çağrılmıyor
- Token decode/verify işlemi yapılmıyor
- Kullanıcı bilgisi veritabanından alınmıyor

#### ❌ Sorun 2: Organization ID Doğrulaması Yok

**Açıklama:**
- **KRİTİK GÜVENLİK AÇIĞI**: Kullanıcının token'ındaki `organization_id` ile katılmak istediği odanın `organization_id`'si karşılaştırılmıyor
- Herhangi bir kullanıcı, herhangi bir `organization_id` göndererek o organizasyonun odasına katılabilir

**Güvenlik Etkisi:**
- **Kritik**: Bir işletme (Admin A), diğer işletmenin (Admin B) `organization_id`'sini tahmin ederek veya bilerek o odaya katılabilir
- Başka organizasyonun verilerini dinleyebilir (appointment_created, appointment_updated, vb. event'leri alabilir)
- Veri sızıntısı riski çok yüksek

**Örnek Saldırı Senaryosu:**
```
1. Admin A, kendi token'ı ile bağlanır (connect event - token kontrolü yok)
2. Admin A, Admin B'nin organization_id'sini bilir veya tahmin eder
3. Admin A, join_organization event'ini Admin B'nin organization_id'si ile gönderir
4. Sunucu hiçbir kontrol yapmadan Admin A'yı Admin B'nin odasına ekler
5. Admin A, Admin B'nin tüm real-time event'lerini dinleyebilir
```

### Mevcut JWT Token Yapısı

**Kod Konumu:** `server.py`, satır 1079

```python
token_data = {"sub": user.username, "org_id": user.organization_id, "role": user.role}
```

**Analiz:**
- JWT token'da `org_id` bilgisi mevcut
- Ancak WebSocket event'lerinde bu bilgi kullanılmıyor
- Token'dan `organization_id` çıkarılıp, `join_organization` event'indeki `organization_id` ile karşılaştırılmalı

---

## 📊 Güvenlik Açıkları Özeti

| # | Açıklık | Kritiklik | Etki |
|---|---------|-----------|------|
| 1 | `connect` event'inde token doğrulaması yok | **Yüksek** | Herkes bağlanabilir |
| 2 | `join_organization` event'inde token doğrulaması yok | **Kritik** | Herkes herhangi bir odaya katılabilir |
| 3 | Organization ID doğrulaması yok | **Kritik** | Başka organizasyonun verilerine erişim |
| 4 | Token header'da gönderilmiyor | **Orta** | Frontend'de token gönderimi eksik |

---

## ✅ Önerilen Çözümler

### 1. Authentication (Kimlik Doğrulama) İyileştirmesi

#### A. `connect` Event'inde Token Doğrulaması

```python
@sio.event
async def connect(sid, environ):
    """Client connected - with authentication"""
    logger.info(f"🔵 [CONNECT] WebSocket client connected: {sid}")
    
    # Token'ı environ'dan al (query string veya header'dan)
    token = None
    
    # Query string'den token al
    query_string = environ.get('QUERY_STRING', '')
    if query_string:
        from urllib.parse import parse_qs
        params = parse_qs(query_string)
        token = params.get('token', [None])[0]
    
    # Header'dan token al (HTTP_AUTHORIZATION)
    if not token:
        auth_header = environ.get('HTTP_AUTHORIZATION', '')
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
    
    if not token:
        logger.warning(f"✗ [CONNECT] No token provided by {sid}")
        return False  # Bağlantıyı reddet
    
    # Token'ı doğrula
    try:
        from jose import jwt
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        organization_id = payload.get("org_id")
        
        if not username or not organization_id:
            logger.warning(f"✗ [CONNECT] Invalid token payload from {sid}")
            return False
        
        # Session'a kullanıcı bilgilerini kaydet
        await sio.save_session(sid, {
            'username': username,
            'organization_id': organization_id,
            'role': payload.get('role')
        })
        
        logger.info(f"✓ [CONNECT] Authenticated user {username} (org: {organization_id})")
        await sio.emit('connection_established', {'status': 'connected'}, room=sid)
        return True
        
    except Exception as e:
        logger.error(f"✗ [CONNECT] Token validation failed for {sid}: {e}")
        return False  # Bağlantıyı reddet
```

#### B. Frontend'de Token Gönderimi

```javascript
const socket = io(socketUrl, {
  path: '/api/socket.io',
  transports: ['websocket', 'polling'],
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  autoConnect: true,
  auth: {
    token: token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
  },
  // Veya query string ile:
  query: {
    token: token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken')
  }
});
```

### 2. Authorization (Yetkilendirme) İyileştirmesi

#### `join_organization` Event'inde Doğrulama

```python
@sio.event
async def join_organization(sid, data):
    """Join organization room for real-time updates - with authorization"""
    logger.info(f"🟢 [JOIN_ORG] join_organization event received from {sid} with data: {data}")
    
    try:
        # Session'dan kullanıcı bilgilerini al
        session = await sio.get_session(sid)
        if not session:
            logger.warning(f"✗ [JOIN_ORG] No session found for {sid} - connection not authenticated")
            await sio.emit('error', {'message': 'Not authenticated'}, room=sid)
            return
        
        user_org_id = session.get('organization_id')
        if not user_org_id:
            logger.warning(f"✗ [JOIN_ORG] No organization_id in session for {sid}")
            await sio.emit('error', {'message': 'Invalid session'}, room=sid)
            return
        
        # İstenen organization_id
        requested_org_id = data.get('organization_id')
        if not requested_org_id:
            logger.warning(f"⚠ [JOIN_ORG] join_organization called without organization_id from {sid}")
            await sio.emit('error', {'message': 'organization_id required'}, room=sid)
            return
        
        # KRİTİK: Kullanıcının organization_id'si ile istenen organization_id eşleşmeli
        if user_org_id != requested_org_id:
            logger.warning(f"✗ [JOIN_ORG] Authorization failed: User {session.get('username')} (org: {user_org_id}) tried to join org {requested_org_id}")
            await sio.emit('error', {'message': 'Unauthorized: Cannot join this organization'}, room=sid)
            return
        
        # Doğrulama başarılı - odaya katıl
        room_name = f"org_{requested_org_id}"
        await sio.enter_room(sid, room_name)
        logger.info(f"✓ [JOIN_ORG] Client {sid} (user: {session.get('username')}) joined organization room: {room_name}")
        
        await sio.emit('joined_organization', {'organization_id': requested_org_id}, room=sid)
        
    except Exception as e:
        logger.error(f"✗ [JOIN_ORG] Error in join_organization: {e}", exc_info=True)
        await sio.emit('error', {'message': 'Internal server error'}, room=sid)
```

---

## 🔒 Güvenlik En İyi Uygulamaları

1. **Her zaman token doğrulaması yap**: WebSocket bağlantılarında da HTTP endpoint'lerdeki gibi token doğrulaması yapılmalı
2. **Session yönetimi**: Kullanıcı bilgilerini session'da sakla, her event'te tekrar doğrulama yapma
3. **Authorization kontrolü**: Kullanıcının erişmek istediği kaynağa (oda/organizasyon) erişim yetkisi olduğunu kontrol et
4. **Logging**: Tüm güvenlik olaylarını (başarılı/başarısız authentication, authorization) logla
5. **Hata mesajları**: Güvenlik açığı vermeyecek şekilde genel hata mesajları döndür

---

## 📝 Sonuç

Mevcut WebSocket implementasyonunda **kritik güvenlik açıkları** bulunmaktadır:

1. ✅ **Authentication eksik**: Token doğrulaması yapılmıyor
2. ✅ **Authorization eksik**: Organization ID doğrulaması yapılmıyor
3. ✅ **Veri sızıntısı riski**: Başka organizasyonların verilerine erişim mümkün

**Acil aksiyon gereklidir.** Yukarıdaki önerilen çözümler uygulanmalıdır.

---

**Rapor Hazırlayan:** AI Security Audit  
**Son Güncelleme:** 2025-01-XX

