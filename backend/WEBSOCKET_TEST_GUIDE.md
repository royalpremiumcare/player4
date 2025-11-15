# WebSocket Güvenlik Test Rehberi

Bu rehber, WebSocket authentication ve authorization kontrollerinin nasıl test edileceğini açıklar.

## 🧪 Test Senaryoları

### 1. Manuel Test (Tarayıcı Console)

#### Test 1: Token Olmadan Bağlantı (REDDEDİLMELİ)

Tarayıcı console'unda (F12) çalıştırın:

```javascript
// Token olmadan bağlantı dene
const socket = io('http://127.0.0.1:8002', {
  path: '/api/socket.io',
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  console.log('❌ HATA: Bağlantı başarılı oldu ama reddedilmeliydi!');
});

socket.on('connect_error', (error) => {
  console.log('✅ BAŞARILI: Bağlantı reddedildi:', error.message);
});

socket.on('disconnect', () => {
  console.log('✅ BAŞARILI: Bağlantı kesildi');
});
```

**Beklenen Sonuç:** Bağlantı reddedilmeli, `connect_error` veya `disconnect` event'i alınmalı.

---

#### Test 2: Geçersiz Token ile Bağlantı (REDDEDİLMELİ)

```javascript
// Geçersiz token ile bağlantı dene
const socket = io('http://127.0.0.1:8002', {
  path: '/api/socket.io',
  transports: ['websocket', 'polling'],
  query: {
    token: 'invalid_token_12345'
  }
});

socket.on('connect', () => {
  console.log('❌ HATA: Bağlantı başarılı oldu ama reddedilmeliydi!');
});

socket.on('connect_error', (error) => {
  console.log('✅ BAŞARILI: Geçersiz token reddedildi:', error.message);
});
```

**Beklenen Sonuç:** Bağlantı reddedilmeli.

---

#### Test 3: Geçerli Token ile Bağlantı (BAŞARILI OLMALI)

```javascript
// Geçerli token al
const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

if (!token) {
  console.log('❌ Token bulunamadı. Önce login olun.');
} else {
  const socket = io('http://127.0.0.1:8002', {
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    query: {
      token: token
    }
  });

  socket.on('connect', () => {
    console.log('✅ BAŞARILI: Bağlantı kuruldu');
  });

  socket.on('connection_established', (data) => {
    console.log('✅ BAŞARILI: connection_established event alındı:', data);
  });

  socket.on('error', (error) => {
    console.log('❌ HATA:', error);
  });
}
```

**Beklenen Sonuç:** Bağlantı başarılı olmalı, `connection_established` event'i alınmalı.

---

#### Test 4: Başka Organizasyonun ID'si ile Join (REDDEDİLMELİ)

```javascript
// Önce geçerli token ile bağlan
const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

if (!token) {
  console.log('❌ Token bulunamadı.');
} else {
  const socket = io('http://127.0.0.1:8002', {
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    query: {
      token: token
    }
  });

  socket.on('connection_established', () => {
    console.log('✅ Bağlantı kuruldu, şimdi başka org ID ile join deniyor...');
    
    // Token'dan kendi org_id'yi al
    const payload = JSON.parse(atob(token.split('.')[1]));
    const ownOrgId = payload.org_id;
    console.log('Kendi org_id:', ownOrgId);
    
    // Başka bir org ID ile join dene
    const fakeOrgId = 'fake-org-id-12345';
    socket.emit('join_organization', { organization_id: fakeOrgId });
  });

  socket.on('joined_organization', (data) => {
    console.log('❌ HATA: Başka organizasyona katılım başarılı oldu ama reddedilmeliydi!', data);
  });

  socket.on('error', (error) => {
    if (error.message && error.message.includes('Unauthorized')) {
      console.log('✅ BAŞARILI: Yetkisiz erişim reddedildi:', error.message);
    } else {
      console.log('❌ Beklenmeyen hata:', error);
    }
  });
}
```

**Beklenen Sonuç:** `error` event'i alınmalı, mesaj "Unauthorized" içermeli.

---

#### Test 5: Kendi Organizasyonunun ID'si ile Join (BAŞARILI OLMALI)

```javascript
// Geçerli token ile bağlan ve kendi org'ına join et
const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

if (!token) {
  console.log('❌ Token bulunamadı.');
} else {
  const socket = io('http://127.0.0.1:8002', {
    path: '/api/socket.io',
    transports: ['websocket', 'polling'],
    query: {
      token: token
    }
  });

  socket.on('connection_established', () => {
    console.log('✅ Bağlantı kuruldu');
    
    // Token'dan kendi org_id'yi al
    const payload = JSON.parse(atob(token.split('.')[1]));
    const ownOrgId = payload.org_id;
    console.log('Kendi org_id ile join ediliyor:', ownOrgId);
    
    socket.emit('join_organization', { organization_id: ownOrgId });
  });

  socket.on('joined_organization', (data) => {
    console.log('✅ BAŞARILI: Kendi organizasyonuna katıldı:', data);
  });

  socket.on('error', (error) => {
    console.log('❌ HATA: Katılım başarısız:', error);
  });
}
```

**Beklenen Sonuç:** `joined_organization` event'i alınmalı, `error` event'i alınmamalı.

---

## 🤖 Otomatik Test Script'i

### Test Script'ini Çalıştırma

```bash
cd /var/www/royalpremiumcare_dev/backend
python3 test_websocket_security.py
```

### Test Script'i Ne Yapar?

1. **Test 1:** Token olmadan bağlantı - Reddedilmeli
2. **Test 2:** Geçersiz token ile bağlantı - Reddedilmeli
3. **Test 3:** Geçerli token ile bağlantı - Başarılı olmalı
4. **Test 4:** Başka organizasyonun ID'si ile join - Reddedilmeli
5. **Test 5:** Kendi organizasyonunun ID'si ile join - Başarılı olmalı

### Gereksinimler

```bash
pip install python-socketio[asyncio] python-jose[cryptography] python-dotenv
```

---

## 📊 Backend Log'larını İzleme

Test sırasında backend log'larını izleyin:

```bash
tail -f /tmp/backend.log
```

**Beklenen Log Mesajları:**

✅ **Başarılı Authentication:**
```
✓ [CONNECT] Authenticated user test_user_1 (org: test_org_1)
```

❌ **Başarısız Authentication:**
```
✗ [CONNECT] No token provided by sid_12345
✗ [CONNECT] Token validation failed for sid_12345
```

❌ **Başarısız Authorization:**
```
✗ [JOIN_ORG] Authorization failed: User test_user_1 (org: test_org_1) tried to join org test_org_2
```

✅ **Başarılı Authorization:**
```
✓ [JOIN_ORG] Client sid_12345 (user: test_user_1) joined organization room: org_test_org_1
```

---

## 🔍 Network Tab'de İnceleme

Tarayıcı Developer Tools > Network tab'inde:

1. **WebSocket bağlantısını bulun** (WS filter)
2. **Headers** sekmesinde `token` query parametresini kontrol edin
3. **Messages** sekmesinde gönderilen/alınan mesajları inceleyin

---

## ✅ Test Checklist

- [ ] Token olmadan bağlantı reddediliyor
- [ ] Geçersiz token ile bağlantı reddediliyor
- [ ] Geçerli token ile bağlantı başarılı
- [ ] `connection_established` event'i alınıyor
- [ ] Başka organizasyonun ID'si ile join reddediliyor
- [ ] Kendi organizasyonunun ID'si ile join başarılı
- [ ] `joined_organization` event'i alınıyor
- [ ] Backend log'larında güvenlik mesajları görünüyor

---

## 🐛 Sorun Giderme

### Bağlantı Kurulamıyor

1. Backend'in çalıştığını kontrol edin:
   ```bash
   ps aux | grep uvicorn
   ```

2. Port'un açık olduğunu kontrol edin:
   ```bash
   netstat -tlnp | grep 8002
   ```

### Token Doğrulaması Çalışmıyor

1. JWT_SECRET_KEY'in doğru olduğunu kontrol edin
2. Token formatının doğru olduğunu kontrol edin (JWT üç bölümden oluşur)
3. Token'ın expire olmadığını kontrol edin

### Authorization Çalışmıyor

1. Session'da `organization_id` olduğunu kontrol edin
2. Backend log'larında authorization mesajlarını kontrol edin
3. Token'daki `org_id` ile gönderilen `organization_id`'nin eşleştiğini kontrol edin

---

## 📝 Notlar

- Test script'i test token'ları oluşturur, gerçek kullanıcı token'ları kullanmaz
- Production'da test yaparken dikkatli olun
- Test sırasında backend log'larını izlemek önemlidir

