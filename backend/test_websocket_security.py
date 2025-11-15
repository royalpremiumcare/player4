#!/usr/bin/env python3
"""
WebSocket Güvenlik Test Script'i
Bu script, WebSocket authentication ve authorization kontrollerini test eder.
"""

import asyncio
import socketio
import jwt
import json
import base64
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

# .env dosyasını yükle (backend dizinindeki .env)
env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(env_path):
    load_dotenv(env_path)
else:
    load_dotenv()

# Backend URL
BACKEND_URL = os.environ.get('BACKEND_URL', 'http://127.0.0.1:8002')
# Socket.IO için http/https kullan, ws/wss değil
SOCKET_URL = BACKEND_URL

def build_socket_url(token=None):
    """Token ile Socket.IO URL'si oluştur"""
    if token:
        from urllib.parse import urlencode
        params = urlencode({'token': token})
        return f"{SOCKET_URL}?{params}"
    return SOCKET_URL
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'default_karmaşık_bir_secret_key_ekleyin_mutlaka')
ALGORITHM = "HS256"

print(f"🔑 Using SECRET_KEY: {SECRET_KEY[:30]}..." if len(SECRET_KEY) > 30 else f"🔑 Using SECRET_KEY: {SECRET_KEY}")

# Test sonuçları
test_results = []

def log_test(test_name, passed, message=""):
    """Test sonucunu logla"""
    status = "✅ PASS" if passed else "❌ FAIL"
    result = {
        'test': test_name,
        'passed': passed,
        'message': message,
        'timestamp': datetime.now().isoformat()
    }
    test_results.append(result)
    print(f"{status} - {test_name}")
    if message:
        print(f"   {message}")
    print()

def create_test_token(username="test_user", org_id="test_org_123", role="admin"):
    """Test için JWT token oluştur"""
    token_data = {
        "sub": username,
        "org_id": org_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)

async def test_1_no_token():
    """Test 1: Token olmadan bağlantı - REDDEDİLMELİ"""
    print("=" * 60)
    print("TEST 1: Token olmadan bağlantı")
    print("=" * 60)
    
    try:
        sio = socketio.AsyncClient()
        
        # Token olmadan bağlanmayı dene
        try:
            await asyncio.wait_for(
                sio.connect(SOCKET_URL, socketio_path='/api/socket.io',
                           transports=['websocket', 'polling']), 
                timeout=10.0
            )
            await asyncio.sleep(1)
            
            # Eğer bağlantı başarılı olduysa, bu bir hata
            if sio.connected:
                log_test("Test 1: Token olmadan bağlantı", False, 
                        "Bağlantı başarılı oldu ama reddedilmeliydi!")
                await sio.disconnect()
            else:
                log_test("Test 1: Token olmadan bağlantı", True, 
                        "Bağlantı reddedildi (beklenen davranış)")
        except Exception as e:
            # Bağlantı hatası bekleniyor
            log_test("Test 1: Token olmadan bağlantı", True, 
                    f"Bağlantı reddedildi: {str(e)}")
    except Exception as e:
        log_test("Test 1: Token olmadan bağlantı", False, 
                f"Beklenmeyen hata: {str(e)}")

async def test_2_invalid_token():
    """Test 2: Geçersiz token ile bağlantı - REDDEDİLMELİ"""
    print("=" * 60)
    print("TEST 2: Geçersiz token ile bağlantı")
    print("=" * 60)
    
    try:
        sio = socketio.AsyncClient()
        
        # Geçersiz token ile bağlanmayı dene (query parametresi URL'ye ekle - frontend ile uyumlu)
        invalid_token = "invalid_token_12345"
        socket_url_with_token = build_socket_url(invalid_token)
        try:
            await asyncio.wait_for(
                sio.connect(socket_url_with_token, socketio_path='/api/socket.io', 
                           transports=['websocket', 'polling']),
                timeout=10.0
            )
            await asyncio.sleep(1)
            
            if sio.connected:
                log_test("Test 2: Geçersiz token ile bağlantı", False, 
                        "Bağlantı başarılı oldu ama reddedilmeliydi!")
                await sio.disconnect()
            else:
                log_test("Test 2: Geçersiz token ile bağlantı", True, 
                        "Bağlantı reddedildi (beklenen davranış)")
        except Exception as e:
            log_test("Test 2: Geçersiz token ile bağlantı", True, 
                    f"Bağlantı reddedildi: {str(e)}")
    except Exception as e:
        log_test("Test 2: Geçersiz token ile bağlantı", False, 
                f"Beklenmeyen hata: {str(e)}")

async def test_3_valid_token():
    """Test 3: Geçerli token ile bağlantı - BAŞARILI OLMALI"""
    print("=" * 60)
    print("TEST 3: Geçerli token ile bağlantı")
    print("=" * 60)
    
    try:
        sio = socketio.AsyncClient()
        connection_established = False
        
        @sio.on('connection_established')
        def on_connection_established(data):
            nonlocal connection_established
            connection_established = True
        
        # Geçerli token oluştur
        valid_token = create_test_token("test_user_1", "test_org_1", "admin")
        print(f"   Token oluşturuldu: {valid_token[:50]}...")
        socket_url_with_token = build_socket_url(valid_token)
        
        try:
            await asyncio.wait_for(
                sio.connect(socket_url_with_token, socketio_path='/api/socket.io',
                           transports=['websocket', 'polling']),
                timeout=10.0
            )
            await asyncio.sleep(2)  # Event'lerin gelmesi için bekle
            
            if sio.connected and connection_established:
                log_test("Test 3: Geçerli token ile bağlantı", True, 
                        "Bağlantı başarılı ve connection_established event'i alındı")
            elif sio.connected:
                log_test("Test 3: Geçerli token ile bağlantı", False, 
                        "Bağlantı başarılı ama connection_established event'i alınmadı")
            else:
                log_test("Test 3: Geçerli token ile bağlantı", False, 
                        "Bağlantı başarısız oldu")
            
            await sio.disconnect()
        except Exception as e:
            log_test("Test 3: Geçerli token ile bağlantı", False, 
                    f"Bağlantı hatası: {str(e)}")
    except Exception as e:
        log_test("Test 3: Geçerli token ile bağlantı", False, 
                f"Beklenmeyen hata: {str(e)}")

async def test_4_unauthorized_join():
    """Test 4: Başka organizasyonun ID'si ile join - REDDEDİLMELİ"""
    print("=" * 60)
    print("TEST 4: Başka organizasyonun ID'si ile join_organization")
    print("=" * 60)
    
    try:
        sio = socketio.AsyncClient()
        error_received = False
        error_message = ""
        
        @sio.on('error')
        def on_error(data):
            nonlocal error_received, error_message
            error_received = True
            error_message = data.get('message', '')
        
        @sio.on('connection_established')
        def on_connection_established(data):
            pass
        
        # Geçerli token oluştur (org_id: test_org_1)
        valid_token = create_test_token("test_user_1", "test_org_1", "admin")
        
        try:
            await asyncio.wait_for(
                sio.connect(SOCKET_URL, socketio_path='/api/socket.io',
                           auth={'token': valid_token}),
                timeout=5.0
            )
            await asyncio.sleep(1)
            
            if sio.connected:
                # Başka bir organizasyonun ID'si ile join dene
                await sio.emit('join_organization', {'organization_id': 'test_org_2'})
                await asyncio.sleep(2)
                
                if error_received and 'Unauthorized' in error_message:
                    log_test("Test 4: Başka organizasyonun ID'si ile join", True, 
                            f"Yetkisiz erişim reddedildi: {error_message}")
                else:
                    log_test("Test 4: Başka organizasyonun ID'si ile join", False, 
                            "Yetkisiz erişim reddedilmedi!")
            else:
                log_test("Test 4: Başka organizasyonun ID'si ile join", False, 
                        "Bağlantı kurulamadı")
            
            await sio.disconnect()
        except Exception as e:
            log_test("Test 4: Başka organizasyonun ID'si ile join", False, 
                    f"Hata: {str(e)}")
    except Exception as e:
        log_test("Test 4: Başka organizasyonun ID'si ile join", False, 
                f"Beklenmeyen hata: {str(e)}")

async def test_5_authorized_join():
    """Test 5: Kendi organizasyonunun ID'si ile join - BAŞARILI OLMALI"""
    print("=" * 60)
    print("TEST 5: Kendi organizasyonunun ID'si ile join_organization")
    print("=" * 60)
    
    try:
        sio = socketio.AsyncClient()
        joined_received = False
        error_received = False
        
        @sio.on('joined_organization')
        def on_joined_organization(data):
            nonlocal joined_received
            joined_received = True
        
        @sio.on('error')
        def on_error(data):
            nonlocal error_received
            error_received = True
        
        @sio.on('connection_established')
        def on_connection_established(data):
            pass
        
        # Geçerli token oluştur (org_id: test_org_1)
        valid_token = create_test_token("test_user_1", "test_org_1", "admin")
        socket_url_with_token = build_socket_url(valid_token)
        
        try:
            await asyncio.wait_for(
                sio.connect(socket_url_with_token, socketio_path='/api/socket.io',
                           transports=['websocket', 'polling']),
                timeout=10.0
            )
            await asyncio.sleep(2)  # Bağlantının tamamlanması için bekle
            
            if sio.connected:
                # Kendi organizasyonunun ID'si ile join dene
                await sio.emit('join_organization', {'organization_id': 'test_org_1'})
                await asyncio.sleep(2)
                
                if joined_received and not error_received:
                    log_test("Test 5: Kendi organizasyonunun ID'si ile join", True, 
                            "Başarıyla kendi organizasyonuna katıldı")
                else:
                    log_test("Test 5: Kendi organizasyonunun ID'si ile join", False, 
                            f"Katılım başarısız. joined_received: {joined_received}, error_received: {error_received}")
            else:
                log_test("Test 5: Kendi organizasyonunun ID'si ile join", False, 
                        "Bağlantı kurulamadı")
            
            await sio.disconnect()
        except Exception as e:
            log_test("Test 5: Kendi organizasyonunun ID'si ile join", False, 
                    f"Hata: {str(e)}")
    except Exception as e:
        log_test("Test 5: Kendi organizasyonunun ID'si ile join", False, 
                f"Beklenmeyen hata: {str(e)}")

async def run_all_tests():
    """Tüm testleri çalıştır"""
    print("\n" + "=" * 60)
    print("WEBSOCKET GÜVENLİK TESTLERİ")
    print("=" * 60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Socket URL: {SOCKET_URL}")
    print("=" * 60 + "\n")
    
    await test_1_no_token()
    await asyncio.sleep(1)
    
    await test_2_invalid_token()
    await asyncio.sleep(1)
    
    await test_3_valid_token()
    await asyncio.sleep(1)
    
    await test_4_unauthorized_join()
    await asyncio.sleep(1)
    
    await test_5_authorized_join()
    await asyncio.sleep(1)
    
    # Sonuçları özetle
    print("\n" + "=" * 60)
    print("TEST SONUÇLARI ÖZETİ")
    print("=" * 60)
    
    passed = sum(1 for r in test_results if r['passed'])
    total = len(test_results)
    
    for result in test_results:
        status = "✅" if result['passed'] else "❌"
        print(f"{status} {result['test']}")
        if result['message']:
            print(f"   → {result['message']}")
    
    print("\n" + "=" * 60)
    print(f"TOPLAM: {passed}/{total} test başarılı")
    print("=" * 60 + "\n")
    
    if passed == total:
        print("🎉 Tüm testler başarılı! Güvenlik kontrolleri çalışıyor.")
    else:
        print("⚠️  Bazı testler başarısız. Lütfen log'ları kontrol edin.")

if __name__ == "__main__":
    asyncio.run(run_all_tests())

