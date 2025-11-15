from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response, File, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import requests
from zoneinfo import ZoneInfo
import re
import xml.etree.ElementTree as ET

from contextlib import asynccontextmanager
from passlib.context import CryptContext
from jose import JWTError, jwt
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
import socketio
import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException

# (Cache ve Rate Limit importları, sizin projenizden alındı)
from cache import init_redis, invalidate_cache, cache_result
from rate_limit import initialize_limiter, rate_limit, LIMITS
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# === LOGGING AYARLARI ===
logging.basicConfig(
    level=logging.INFO,  # INFO level for production
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/tmp/backend.log')
    ]
)
logger = logging.getLogger(__name__)
# Enable socketio server logging
logging.getLogger('socketio.server').setLevel(logging.INFO)
logging.getLogger('engineio.server').setLevel(logging.INFO)

# === GÜVENLİK AYARLARI ===
SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'default_karmaşık_bir_secret_key_ekleyin_mutlaka')
if SECRET_KEY == 'default_karmaşık_bir_secret_key_ekleyin_mutlaka':
    logging.warning("WARNING: JWT_SECRET_KEY is using default value! Please set a secure secret key in production.")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/token")

# --- ROOT DİZİN VE .ENV YÜKLEME ---
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# --- SABİT SMS AYARLARI ---
ILETIMERKEZI_API_KEY = os.environ.get('ILETIMERKEZI_API_KEY')
ILETIMERKEZI_HASH = os.environ.get('ILETIMERKEZI_HASH')
ILETIMERKEZI_SENDER = os.environ.get('ILETIMERKEZI_SENDER', 'FatihSenyuz') 
SMS_ENABLED = os.environ.get('SMS_ENABLED', 'true').lower() in ('1', 'true', 'yes')

# --- BREVO EMAIL AYARLARI ---
BREVO_API_KEY = os.environ.get('BREVO_API_KEY')
if BREVO_API_KEY:
    try:
        brevo_configuration = sib_api_v3_sdk.Configuration()
        brevo_configuration.api_key['api-key'] = BREVO_API_KEY
        brevo_api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(brevo_configuration))
        logging.info("✅ Brevo API instance başarıyla oluşturuldu.")
    except Exception as e:
        logging.error(f"❌ Brevo API instance oluşturulamadı: {str(e)}")
        brevo_api_instance = None
else:
    brevo_api_instance = None
    logging.warning("⚠️ BREVO_API_KEY bulunamadı! E-posta gönderimi devre dışı.")

async def send_email(to_email: str, subject: str, html_content: str, to_name: str = None, sender_name: str = "PLANN", sender_email: str = "noreply@dev.royalpremiumcare.com"):
    """Brevo API ile e-posta gönder - Global helper fonksiyon (async)"""
    global brevo_api_instance
    try:
        logging.info(f"📧 E-posta gönderme başlatılıyor: {to_email} - Subject: {subject}")
        
        # Runtime'da API key'i tekrar kontrol et
        current_api_key = os.environ.get('BREVO_API_KEY')
        logging.info(f"🔑 BREVO_API_KEY kontrol: {'Var' if current_api_key else 'YOK'} - Uzunluk: {len(current_api_key) if current_api_key else 0}")
        
        if not brevo_api_instance:
            logging.warning("❌ Brevo API instance bulunamadı! E-posta gönderilemedi.")
            # Runtime'da instance oluşturmayı dene
            if current_api_key:
                try:
                    logging.info("🔄 Runtime'da Brevo API instance oluşturuluyor...")
                    brevo_configuration = sib_api_v3_sdk.Configuration()
                    brevo_configuration.api_key['api-key'] = current_api_key
                    brevo_api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(brevo_configuration))
                    logging.info("✅ Runtime'da Brevo API instance oluşturuldu!")
                except Exception as e:
                    logging.error(f"❌ Runtime'da Brevo API instance oluşturulamadı: {e}")
                    return False
            else:
                return False
        
        sender = {"name": sender_name, "email": sender_email}
        to = [{"email": to_email, "name": to_name or to_email}]
        
        send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
            to=to,
            sender=sender,
            subject=subject,
            html_content=html_content
        )
        
        # Async context'te sync API çağrısını thread pool'da çalıştır
        import asyncio
        logging.info(f"📤 Brevo API'ye e-posta gönderiliyor...")
        api_response = await asyncio.to_thread(brevo_api_instance.send_transac_email, send_smtp_email)
        logging.info(f"✅ E-posta başarıyla gönderildi: {to_email} - Subject: {subject} - Message ID: {api_response.message_id}")
        return True
    except ApiException as e:
        logging.error(f"❌ E-posta gönderilirken Brevo API hatası: {e.status} - {e.reason} - {e.body}")
        import traceback
        logging.error(traceback.format_exc())
        return False
    except Exception as e:
        logging.error(f"❌ E-posta gönderilirken beklenmedik hata: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return False

# === SMS REMINDER SCHEDULER ===
scheduler = AsyncIOScheduler()
_app_instance = None  # Global app instance for scheduler

async def check_and_send_reminders():
    """Her 5 dakikada bir yaklaşan randevuları kontrol et ve SMS gönder"""
    try:
        logging.info("=== SMS Reminder Check Started ===")
        # Global app instance'ından db'yi al
        global _app_instance
        if _app_instance is None:
            logging.warning("App instance not available, skipping reminder check")
            return
        
        db = getattr(_app_instance, 'db', None)
        if db is None:
            logging.warning("MongoDB not available, skipping reminder check")
            return
        
        turkey_tz = ZoneInfo("Europe/Istanbul")
        now = datetime.now(turkey_tz)
        logging.info(f"Current time (Turkey): {now.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Tüm organization'ların ayarlarını al
        all_settings = await db.settings.find({}, {"_id": 0}).to_list(1000)
        logging.info(f"Found {len(all_settings)} organizations to check")
        
        for setting in all_settings:
            org_id = setting.get('organization_id')
            reminder_hours = setting.get('sms_reminder_hours', 1.0)
            company_name = setting.get('company_name', 'İşletmeniz')
            support_phone = setting.get('support_phone', 'Destek')
            
            logging.info(f"Checking org {org_id}: reminder_hours={reminder_hours}, company={company_name}")
            
            # Hatırlatma zaman aralığını hesapla
            reminder_time_start = now + timedelta(hours=reminder_hours - 0.1)  # 6 dakika tolerance
            reminder_time_end = now + timedelta(hours=reminder_hours + 0.1)
            
            logging.info(f"  Reminder window: {reminder_time_start.strftime('%Y-%m-%d %H:%M:%S')} to {reminder_time_end.strftime('%Y-%m-%d %H:%M:%S')}")
            
            # Bu zaman aralığındaki randevuları bul
            appointments = await db.appointments.find({
                "organization_id": org_id,
                "status": "Bekliyor",
                "reminder_sent": {"$ne": True}  # Daha önce hatırlatma gönderilmemiş
            }, {"_id": 0}).to_list(1000)
            
            logging.info(f"  Found {len(appointments)} pending appointments without reminder")
            
            for apt in appointments:
                try:
                    # Randevu zamanını parse et
                    apt_datetime_str = f"{apt['appointment_date']} {apt['appointment_time']}"
                    apt_datetime = datetime.strptime(apt_datetime_str, "%Y-%m-%d %H:%M").replace(tzinfo=turkey_tz)
                    
                    logging.debug(f"  Appointment {apt.get('id')}: {apt_datetime_str} (parsed: {apt_datetime.strftime('%Y-%m-%d %H:%M:%S')})")
                    
                    # Hatırlatma zamanı geldi mi?
                    if reminder_time_start <= apt_datetime <= reminder_time_end:
                        logging.info(f"  ✓ Appointment {apt.get('id')} is in reminder window! Sending SMS...")
                        # SMS gönder - Default mesaj kullan
                        sms_message = build_sms_message(
                            company_name, apt['customer_name'],
                            apt['appointment_date'], apt['appointment_time'],
                            apt['service_name'], support_phone, 
                            hours_until=reminder_hours
                        )
                        # send_sms sync olduğu için asyncio.to_thread kullan
                        import asyncio
                        sms_result = await asyncio.to_thread(send_sms, apt['phone'], sms_message)
                        
                        if sms_result:
                            # Hatırlatma gönderildi olarak işaretle
                            await db.appointments.update_one(
                                {"id": apt['id']},
                                {"$set": {"reminder_sent": True}}
                            )
                            logging.info(f"  ✓ SMS reminder sent successfully to {apt['customer_name']} ({apt['phone']}) for appointment {apt['id']}")
                        else:
                            logging.error(f"  ✗ Failed to send SMS to {apt['customer_name']} ({apt['phone']}) for appointment {apt['id']}")
                    else:
                        logging.debug(f"  - Appointment {apt.get('id')} is not in reminder window (time: {apt_datetime.strftime('%Y-%m-%d %H:%M:%S')})")
                
                except Exception as e:
                    logging.error(f"Error sending reminder for appointment {apt.get('id')}: {e}", exc_info=True)
        
        logging.info("=== SMS Reminder Check Completed ===")
    
    except Exception as e:
        logging.error(f"Error in check_and_send_reminders: {e}", exc_info=True)

# === MongoDB ve Redis Yaşam Döngüsü (Lifespan) --- SYNTAX HATASI DÜZELTİLDİ ===
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _app_instance
    _app_instance = app  # Global app instance'ı sakla (scheduler için)
    app.mongodb_client = None; app.db = None; app.redis_client = None
    try:
        logging.info("Step 1: Connecting to MongoDB..."); mongo_url = os.environ.get('MONGO_URL'); db_name = os.environ.get('DB_NAME', 'royal_koltuk_dev')
        if not mongo_url:
            logging.error("CRITICAL: MONGO_URL environment variable is required!"); logging.warning("MongoDB connection will be lazy-initialized on first request.")
        else:
            try:
                app.mongodb_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000); await app.mongodb_client.admin.command('ping')
                app.db = app.mongodb_client[db_name]; logging.info(f"Step 1 SUCCESS: Successfully connected to MongoDB ({db_name})!")
            except Exception as mongo_error:
                logging.warning(f"MongoDB connection failed during startup: {mongo_error}"); logging.info("MongoDB will be lazy-initialized on first request.")
    except Exception as e:
        logging.warning(f"WARNING during MongoDB connection: {type(e).__name__}: {str(e)}"); app.mongodb_client = None; app.db = None
    try:
        logging.info("Step 2: Initializing Redis..."); app.redis_client = await init_redis()
        if app.redis_client:
            try: await app.redis_client.ping(); logging.info("Step 2 SUCCESS: Redis initialized and ping successful.")
            except Exception as redis_ping_error: logging.warning(f"Redis ping failed: {redis_ping_error}"); app.redis_client = None
        else: logging.warning("WARNING: Redis client could not be initialized (init_redis returned None).")
    except Exception as e:
        logging.warning(f"WARNING during Redis connection: {type(e).__name__}: {str(e)}"); app.redis_client = None
    try:
        logging.info("Step 3: Initializing Rate Limiter...")
        if app.redis_client is None: logging.warning("WARNING: Using dummy Rate Limiter due to failed Redis connection.")
        app.state.limiter = initialize_limiter(app.redis_client); logging.info("Step 3 SUCCESS: Rate Limiter initialized.")
    except Exception as e:
        logging.warning(f"WARNING during Rate Limiter initialization: {type(e).__name__}: {str(e)}"); app.state.limiter = None
    
    try:
        logging.info("Step 4: Starting SMS Reminder Scheduler...")
        # Async fonksiyon için doğru trigger kullan
        scheduler.add_job(
            check_and_send_reminders, 
            IntervalTrigger(minutes=5), 
            id='sms_reminder_job',
            replace_existing=True,
            max_instances=1  # Aynı anda sadece bir instance çalışsın
        )
        scheduler.start()
        logging.info("Step 4 SUCCESS: SMS Reminder Scheduler started (runs every 5 minutes)")
        # İlk kontrolü hemen yap (test için)
        import asyncio
        asyncio.create_task(check_and_send_reminders())
    except Exception as e:
        logging.error(f"ERROR during Scheduler initialization: {type(e).__name__}: {str(e)}", exc_info=True)
    
    try:
        logging.info("Step 5: Creating Database Indexes...")
        if app.db is not None:
            # Appointments indexes - Performance optimization
            await app.db.appointments.create_index([("organization_id", 1), ("appointment_date", -1)])
            await app.db.appointments.create_index([("organization_id", 1), ("staff_member_id", 1)])
            await app.db.appointments.create_index([("organization_id", 1), ("phone", 1)])
            await app.db.appointments.create_index([("organization_id", 1), ("status", 1)])
            
            # Users indexes
            await app.db.users.create_index([("organization_id", 1), ("role", 1)])
            try:
                await app.db.users.create_index([("slug", 1)], unique=True, sparse=True)
            except Exception as idx_err:
                # Index might already exist or have duplicate null values, skip
                logging.debug(f"Users slug index creation skipped: {idx_err}")
            
            # Settings indexes
            await app.db.settings.create_index([("organization_id", 1)], unique=True)
            try:
                await app.db.settings.create_index([("slug", 1)], unique=True, sparse=True)
            except Exception as idx_err:
                # Index might already exist or have duplicate null values, skip
                logging.debug(f"Settings slug index creation skipped: {idx_err}")
            
            logging.info("Step 5 SUCCESS: Database indexes created")
        else:
            logging.warning("Step 5 SKIPPED: Database not available")
    except Exception as e:
        logging.warning(f"WARNING during Index creation: {type(e).__name__}: {str(e)}")

    yield

    # --- Cleanup blokları ---
    # NOT: Scheduler'ı cleanup'ta kapatma - uygulama çalışırken scheduler aktif kalmalı
    # Sadece uygulama kapanırken kapatılmalı
    logging.info("Application shutdown initiated...")
    # Global app instance'ı temizle (global değişken, direkt atama yapılabilir)
    # _app_instance zaten global scope'ta tanımlı, burada sadece None yapıyoruz
    if scheduler.running:
        logging.info("Stopping SMS Reminder Scheduler...")
        try: 
            scheduler.shutdown(wait=False)
            logging.info("SMS Reminder Scheduler stopped")
        except Exception as e:
            logging.error(f"Error stopping scheduler: {e}")
    if app.mongodb_client:
        logging.info("Closing MongoDB connection...")
        try: app.mongodb_client.close()
        except: pass
    if app.redis_client:
        logging.info("Closing Redis connection...")
        try: await app.redis_client.close()
        except: pass

# Create the main app
app = FastAPI(title="Randevu SaaS API", description="... (Açıklamanız buradaydı) ...", version="1.4.2 (Final Fixes)", lifespan=lifespan)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# === SOCKET.IO SETUP ===
# Get CORS origins for Socket.IO (same as FastAPI CORS)
cors_origins_for_socketio = os.environ.get('CORS_ORIGINS', '*')
if cors_origins_for_socketio == '*':
    socketio_cors_origins = '*'
else:
    socketio_cors_origins = [origin.strip() for origin in cors_origins_for_socketio.split(',') if origin.strip()]

sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=socketio_cors_origins,
    logger=True,
    engineio_logger=True  # Enable Engine.IO logs for debugging
)
socket_app = socketio.ASGIApp(sio, socketio_path='/api/socket.io', other_asgi_app=app)

# --- Router prefix'i kaldırıldı ---
api_router = APIRouter()

# === SOCKET.IO EVENT HANDLERS ===
@sio.event
async def connect(sid, environ, *args):
    """Client connected - with authentication"""
    logger.info(f"🔵 [CONNECT] WebSocket client attempting connection: {sid}")
    logger.info(f"🔍 [CONNECT] Args received: {args}")
    
    # Token'ı bul (auth parametresi, query string veya header'dan)
    token = None
    
    # 1. Socket.IO auth parametresinden token al (args'da gelebilir)
    if args and len(args) > 0:
        logger.info(f"📦 [CONNECT] Args[0] type: {type(args[0])}, content: {args[0]}")
        auth_data = args[0]
        if isinstance(auth_data, dict):
            token = auth_data.get('token')
            logger.info(f"🔑 [CONNECT] Token from auth dict: {token[:20] if token else 'None'}...")
        elif isinstance(auth_data, str):
            token = auth_data
            logger.info(f"🔑 [CONNECT] Token from auth string: {token[:20] if token else 'None'}...")
    
    # 2. Query string'den token al (client query: {token: ...} kullanırsa)
    if not token:
        query_string = environ.get('QUERY_STRING', '')
        logger.info(f"❓ [CONNECT] Query string: {query_string}")
        if query_string:
            from urllib.parse import parse_qs
            params = parse_qs(query_string)
            token_list = params.get('token', [])
            if token_list:
                token = token_list[0]
                logger.info(f"🔑 [CONNECT] Token from query: {token[:20]}...")
    
    # 3. Header'dan token al (HTTP_AUTHORIZATION)
    if not token:
        auth_header = environ.get('HTTP_AUTHORIZATION', '')
        logger.info(f"📋 [CONNECT] Auth header: {auth_header[:30] if auth_header else 'None'}...")
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
            logger.info(f"🔑 [CONNECT] Token from header: {token[:20]}...")
    
    if not token:
        logger.warning(f"✗ [CONNECT] No token provided by {sid}")
        logger.warning(f"✗ [CONNECT] Available environ keys: {list(environ.keys())[:10]}")
        return False  # Bağlantıyı reddet
    
    # Token'ı doğrula
    try:
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
        
    except JWTError as e:
        logger.error(f"✗ [CONNECT] Token validation failed for {sid}: {e}")
        return False  # Bağlantıyı reddet
    except Exception as e:
        logger.error(f"✗ [CONNECT] Unexpected error during authentication for {sid}: {e}", exc_info=True)
        return False  # Bağlantıyı reddet

@sio.event
async def disconnect(sid):
    """Client disconnected"""
    logger.info(f"WebSocket client disconnected: {sid}")

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
        logger.info(f"✓ [JOIN_ORG] Sent joined_organization confirmation to {sid}")
        
    except Exception as e:
        logger.error(f"✗ [JOIN_ORG] Error in join_organization: {e}", exc_info=True)
        await sio.emit('error', {'message': 'Internal server error'}, room=sid)

@sio.event
async def leave_organization(sid, data):
    """Leave organization room"""
    organization_id = data.get('organization_id')
    if organization_id:
        await sio.leave_room(sid, f"org_{organization_id}")
        logger.info(f"Client {sid} left organization room: org_{organization_id}")

# Helper function to make data JSON serializable (convert ObjectId, datetime, etc.)
def make_json_serializable(obj):
    """Recursively convert MongoDB ObjectId and datetime objects to JSON-serializable types"""
    import json
    from bson import ObjectId
    from datetime import datetime, date
    
    if isinstance(obj, ObjectId):
        return str(obj)
    elif isinstance(obj, (datetime, date)):
        return obj.isoformat() if hasattr(obj, 'isoformat') else str(obj)
    elif isinstance(obj, dict):
        return {key: make_json_serializable(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return tuple(make_json_serializable(item) for item in obj)
    elif isinstance(obj, set):
        return {make_json_serializable(item) for item in obj}
    else:
        # Try to convert to JSON-serializable type
        try:
            json.dumps(obj)
            return obj
        except (TypeError, ValueError):
            # If not serializable, convert to string
            return str(obj)

# Helper function to emit events to organization rooms
async def emit_to_organization(organization_id: str, event: str, data: dict):
    """Emit event to all clients in an organization room"""
    try:
        room_name = f"org_{organization_id}"
        logger.info(f"📤 [EMIT] About to emit {event} to room {room_name}")
        
        # Convert data to JSON-serializable format
        serializable_data = make_json_serializable(data)
        
        # Get all sockets in the room to verify
        try:
            # Note: Socket.IO doesn't have a direct way to list room members, but we can try to emit
            await sio.emit(event, serializable_data, room=room_name)
            logger.info(f"✓ [EMIT] Successfully emitted {event} to room {room_name} with data keys: {list(serializable_data.keys())}")
            
            # Debug: Try to get room info (if available in python-socketio)
            try:
                # Check if room exists by trying to get room info
                # Note: python-socketio AsyncServer doesn't expose room member count directly
                # But we can log that we attempted the emit
                logger.info(f"🔍 [EMIT] Event {event} sent to room {room_name} - waiting for client receipt")
            except Exception as debug_error:
                logger.warning(f"⚠ [EMIT] Debug check failed: {debug_error}")
        except Exception as emit_error:
            logger.error(f"✗ [EMIT] Error during emit to {room_name}: {emit_error}", exc_info=True)
            raise
    except Exception as e:
        logger.error(f"✗ [EMIT] Error emitting {event} to org_{organization_id}: {e}", exc_info=True)

# === GÜVENLİK YARDIMCI FONKSİYONLARI (Aynı kaldı) ===
_mongo_client = None; _mongo_db = None
async def ensure_db_connection(request: Request):
    global _mongo_client, _mongo_db; db = getattr(request.app, 'db', None)
    if db is None and _mongo_db is None:
        mongo_url = os.environ.get('MONGO_URL'); db_name = os.environ.get('DB_NAME', 'royal_koltuk_dev')
        if not mongo_url: raise HTTPException(status_code=503, detail="Database connection not configured.")
        try:
            new_client = AsyncIOMotorClient(mongo_url, serverSelectionTimeoutMS=5000); await new_client.admin.command('ping')
            new_db = new_client[db_name]; _mongo_client = new_client; _mongo_db = new_db
            request.app.mongodb_client = new_client; request.app.db = new_db
            logging.info(f"MongoDB connection established (lazy initialization) to {db_name}")
        except Exception as e:
            logging.error(f"Failed to establish MongoDB connection: {e}"); raise HTTPException(status_code=503, detail="Database connection failed.")
    elif db is None and _mongo_db is not None:
        request.app.mongodb_client = _mongo_client; request.app.db = _mongo_db; db = _mongo_db
    try:
        client_to_check = getattr(request.app, 'mongodb_client', _mongo_client)
        if client_to_check: await client_to_check.admin.command('ping')
    except Exception as e:
        logging.warning(f"MongoDB connection check failed: {e}, reconnecting..."); _mongo_client = None; _mongo_db = None; await ensure_db_connection(request) 
async def get_db(request: Request):
    await ensure_db_connection(request); db = getattr(request.app, 'db', None)
    if db is None: raise HTTPException(status_code=503, detail="Database connection failed.")
    return db
async def get_db_from_request(request: Request):
    await ensure_db_connection(request); db = getattr(request.app, 'db', None)
    if db is None: raise HTTPException(status_code=503, detail="Database connection failed.")
    return db
def verify_password(plain_password, hashed_password): return pwd_context.verify(plain_password, hashed_password)
def get_password_hash(password): return pwd_context.hash(password)
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta: expire = datetime.now(timezone.utc) + expires_delta
    else: expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire}); encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
async def get_user_from_db(request: Request, username: str, db=None):
    if db is None:
        await ensure_db_connection(request); db = getattr(request.app, 'db', None)
        if db is None: raise HTTPException(status_code=503, detail="Database connection failed.")
    user = await db.users.find_one({"username": username}, {"_id": 0})
    if user:
        try: return UserInDB(**user)
        except Exception as e: logging.warning(f"Kullanıcı veritabanında, ancak UserInDB modeline uymuyor: {e}"); return None
    return None
async def get_current_user(request: Request, token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    credentials_exception = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM]); username: str = payload.get("sub")
        if username is None: raise credentials_exception
    except JWTError: raise credentials_exception
    user = await get_user_from_db(request, username, db=db) 
    if user is None: raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

async def get_superadmin_user(request: Request, token: str = Depends(oauth2_scheme), db = Depends(get_db)):
    """Sadece superadmin rolüne sahip kullanıcılar için dependency"""
    user = await get_current_user(request, token, db)
    if user.role != "superadmin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu işlem için superadmin yetkisi gereklidir")
    return user

# --- KOTA YÖNETİM FONKSİYONLARI ---
async def get_organization_plan(db, organization_id: str) -> Optional[dict]:
    """Organization'ın plan bilgisini getir. Yoksa trial oluştur."""
    plan_doc = await db.organization_plans.find_one({"organization_id": organization_id})
    if not plan_doc:
        # Yeni kayıt - Trial paketi oluştur
        trial_start = datetime.now(timezone.utc)
        trial_end = trial_start + timedelta(days=7)
        quota_reset = trial_start + timedelta(days=30)
        new_plan = OrganizationPlan(
            organization_id=organization_id,
            plan_id="tier_trial",
            quota_usage=0,
            quota_reset_date=quota_reset,
            trial_start_date=trial_start,
            trial_end_date=trial_end,
            is_first_month=True
        )
        plan_doc = new_plan.model_dump()
        plan_doc['trial_start_date'] = plan_doc['trial_start_date'].isoformat()
        plan_doc['trial_end_date'] = plan_doc['trial_end_date'].isoformat()
        plan_doc['quota_reset_date'] = plan_doc['quota_reset_date'].isoformat()
        plan_doc['created_at'] = plan_doc['created_at'].isoformat()
        plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
        await db.organization_plans.insert_one(plan_doc)
        return plan_doc
    
    # Datetime string'lerini parse et
    if isinstance(plan_doc.get('trial_start_date'), str):
        plan_doc['trial_start_date'] = datetime.fromisoformat(plan_doc['trial_start_date'].replace('Z', '+00:00'))
    if isinstance(plan_doc.get('trial_end_date'), str):
        plan_doc['trial_end_date'] = datetime.fromisoformat(plan_doc['trial_end_date'].replace('Z', '+00:00'))
    if isinstance(plan_doc.get('quota_reset_date'), str):
        plan_doc['quota_reset_date'] = datetime.fromisoformat(plan_doc['quota_reset_date'].replace('Z', '+00:00'))
    
    return plan_doc

async def check_quota_and_increment(db, organization_id: str) -> tuple[bool, str]:
    """Kota kontrolü yap ve kullanılırsa artır. (success, error_message)"""
    plan_doc = await get_organization_plan(db, organization_id)
    if not plan_doc:
        return False, "Plan bilgisi bulunamadı"
    
    plan_id = plan_doc.get('plan_id', 'tier_trial')
    plan_info = next((p for p in PLANS if p['id'] == plan_id), None)
    if not plan_info:
        return False, "Plan bilgisi geçersiz"
    
    # Trial kontrolü
    if plan_id == 'tier_trial':
        trial_end = plan_doc.get('trial_end_date')
        if isinstance(trial_end, str):
            trial_end = datetime.fromisoformat(trial_end.replace('Z', '+00:00'))
        if trial_end and datetime.now(timezone.utc) > trial_end:
            return False, "Deneme süreniz doldu. Devam etmek için lütfen bir paket seçin."
    
    # Kota reset kontrolü
    quota_reset = plan_doc.get('quota_reset_date')
    if isinstance(quota_reset, str):
        quota_reset = datetime.fromisoformat(quota_reset.replace('Z', '+00:00'))
    
    current_usage = plan_doc.get('quota_usage', 0)
    quota_limit = plan_info.get('quota_monthly_appointments', 50)
    
    # Eğer reset tarihi geçmişse, kullanımı sıfırla
    if quota_reset and datetime.now(timezone.utc) > quota_reset:
        current_usage = 0
        # Yeni reset tarihi ayarla (bir ay sonra)
        new_reset_date = datetime.now(timezone.utc) + timedelta(days=30)
        await db.organization_plans.update_one(
            {"organization_id": organization_id},
            {
                "$set": {
                    "quota_usage": 0,
                    "quota_reset_date": new_reset_date.isoformat(),
                    "is_first_month": False,  # İlk ay indirimi sadece bir kez
                    "updated_at": datetime.now(timezone.utc).isoformat()
                }
            }
        )
    
    # Kota kontrolü
    if current_usage >= quota_limit:
        return False, f"Aylık randevu limitinize ulaştınız ({quota_limit} randevu). Paketinizi yükseltmeniz gerekmektedir."
    
    # Kullanımı artır
    await db.organization_plans.update_one(
        {"organization_id": organization_id},
        {
            "$set": {
                "quota_usage": current_usage + 1,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    return True, ""

async def get_plan_info(plan_id: str) -> Optional[dict]:
    """Plan bilgisini getir"""
    return next((p for p in PLANS if p['id'] == plan_id), None)

# --- SMS FONKSİYONU ---
def build_sms_message(company_name: str, customer_name: str, date: str, time: str, service: str, support_phone: str, hours_until: Optional[float] = None, sms_type: str = "confirmation") -> str:
    """SMS mesajı oluşturur. Template desteği kaldırıldı, sadece default format kullanılıyor."""
    # Tarih formatını YYYY-MM-DD'den DD.MM.YYYY'ye çevir
    try:
        date_obj = datetime.strptime(date, "%Y-%m-%d")
        formatted_date = date_obj.strftime("%d.%m.%Y")
    except (ValueError, TypeError):
        # Eğer parse edilemezse olduğu gibi kullan
        formatted_date = date
    
    if sms_type == "cancellation":
        # İptal SMS'i için default
        return f"{company_name}: Randevunuz iptal edildi.\nHizmet: {service}\nTarih: {formatted_date}\nSaat: {time}\nBilgi: {support_phone}"
    elif hours_until is not None:
        # Hatırlatma SMS'i için default
        return f"Sayın {customer_name},\n{company_name} randevunuzu hatırlatmak isteriz.\nHizmet: {service}\nTarih: {formatted_date}\nSaat: {time}\nBilgi/İptal: {support_phone}"
    else:
        # Onay SMS'i için default
        return f"{company_name}: Randevunuz onaylandı.\nHizmet: {service}\nTarih: {formatted_date}\nSaat: {time}\nBilgi/İptal: {support_phone}"

def send_sms(to_phone: str, message: str):
    try:
        if not SMS_ENABLED: logging.info("SMS sending is disabled via SMS_ENABLED env. Skipping."); return True
        clean_phone = re.sub(r'\D', '', to_phone); 
        if clean_phone.startswith('90'): clean_phone = clean_phone[2:]
        if clean_phone.startswith('0'): clean_phone = clean_phone[1:]
        if not clean_phone.startswith('5') or len(clean_phone) != 10: logging.error(f"Invalid Turkish phone number format: {to_phone} -> {clean_phone}"); return False
        
        # Newline karakterlerini koru, sadece fazla boşlukları temizle
        # Önce newline'ları geçici bir karakterle değiştir
        temp_message = message.replace('\n', '|||NEWLINE|||')
        # Fazla boşlukları temizle
        temp_message = re.sub(r'[ \t]+', ' ', temp_message)
        # Newline'ları geri getir
        sanitized = temp_message.replace('|||NEWLINE|||', '\n').strip()
        MAX_LEN = 480
        if len(sanitized) > MAX_LEN: sanitized = sanitized[:MAX_LEN]
            
        api_url = "https://api.iletimerkezi.com/v1/send-sms/get/"
        params = {
            'key': ILETIMERKEZI_API_KEY, 'hash': ILETIMERKEZI_HASH, 'text': sanitized,
            'receipents': clean_phone, 'sender': ILETIMERKEZI_SENDER, 
            'iys': '1', 'iysList': 'BIREYSEL'
        }
        response = requests.get(api_url, params=params, timeout=10)
        try:
            root = ET.fromstring(response.text); status_code = root.find('.//status/code').text
            status_message = root.find('.//status/message').text
            if status_code == '200': logging.info(f"SMS sent successfully to {clean_phone} (Title: {ILETIMERKEZI_SENDER})."); return True
            else: logging.error(f"SMS failed to {clean_phone} (Title: {ILETIMERKEZI_SENDER}). Code: {status_code}, Message: {status_message}"); return False
        except ET.ParseError as e:
            logging.error(f"Failed to parse İletimerkezi response (status={response.status_code}): {response.text} | Error: {str(e)}"); return False
    except Exception as e:
        logging.error(f"Failed to send SMS to {to_phone}: {str(e)}"); return False

# === YARDIMCI FONKSİYONLAR ===
def slugify(text: str) -> str:
    """Türkçe karakterleri dönüştürerek URL-friendly slug oluşturur"""
    turkish_map = {
        'ı': 'i', 'İ': 'i', 'ğ': 'g', 'Ğ': 'g', 'ü': 'u', 'Ü': 'u',
        'ş': 's', 'Ş': 's', 'ö': 'o', 'Ö': 'o', 'ç': 'c', 'Ç': 'c'
    }
    text = text.lower()
    for turkish_char, latin_char in turkish_map.items():
        text = text.replace(turkish_char, latin_char)
    text = re.sub(r'[^a-z0-9]+', '', text)
    return text

# === AUDIT LOG HELPER ===
def clean_dict_for_audit(data: Optional[dict]) -> Optional[dict]:
    """MongoDB ObjectID'lerini temizle"""
    if not data:
        return data
    cleaned = {}
    for key, value in data.items():
        if key == '_id':
            continue  # MongoDB _id'yi atla
        if isinstance(value, dict):
            cleaned[key] = clean_dict_for_audit(value)
        elif isinstance(value, list):
            cleaned[key] = [clean_dict_for_audit(item) if isinstance(item, dict) else item for item in value]
        else:
            cleaned[key] = value
    return cleaned

async def create_audit_log(
    db,
    organization_id: str,
    user_id: str,
    user_full_name: str,
    action: str,
    resource_type: str,
    resource_id: str,
    old_value: Optional[dict] = None,
    new_value: Optional[dict] = None,
    ip_address: Optional[str] = None
):
    """Denetim günlüğü kaydı oluştur"""
    try:
        # Clean values
        cleaned_old = clean_dict_for_audit(old_value)
        cleaned_new = clean_dict_for_audit(new_value)
        
        audit_log = AuditLog(
            organization_id=organization_id,
            user_id=user_id,
            user_full_name=user_full_name,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            old_value=cleaned_old,
            new_value=cleaned_new,
            ip_address=ip_address
        )
        doc = audit_log.model_dump()
        doc['timestamp'] = doc['timestamp'].isoformat()
        await db.audit_logs.insert_one(doc)
        logger.info(f"Audit log created: {action} {resource_type} by {user_id}")
    except Exception as e:
        logger.error(f"Failed to create audit log: {e}")

# === VERİ MODELLERİ (Aynı kaldı) ===
class User(BaseModel):
    username: str; full_name: Optional[str] = None; organization_id: str = Field(default_factory=lambda: str(uuid.uuid4())); role: str = "admin"; slug: Optional[str] = None; permitted_service_ids: List[str] = []; payment_type: Optional[str] = "salary"; payment_amount: Optional[float] = 0.0; status: Optional[str] = "active"; invitation_token: Optional[str] = None; days_off: List[str] = Field(default_factory=lambda: ["sunday"]); onboarding_completed: bool = False
class UserInDB(User): hashed_password: Optional[str] = None
class UserCreate(BaseModel): username: str; password: str; full_name: Optional[str] = None; organization_name: Optional[str] = None; support_phone: Optional[str] = None; sector: Optional[str] = None
class Token(BaseModel): access_token: str; token_type: str
class ForgotPasswordRequest(BaseModel): username: str
class ResetPasswordRequest(BaseModel): token: str; new_password: str
class SetupPasswordRequest(BaseModel): token: str; new_password: str
class Service(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); name: str; price: float; duration: int = 30; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class ServiceCreate(BaseModel): name: str; price: float; duration: int = 30
class ServiceUpdate(BaseModel): name: Optional[str] = None; price: Optional[float] = None; duration: Optional[int] = None
class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); customer_name: str; phone: str; service_id: str; service_name: str; service_price: float; appointment_date: str; appointment_time: str; notes: str = ""; status: str = "Bekliyor"; staff_member_id: Optional[str] = None; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc)); completed_at: Optional[str] = None; service_duration: Optional[int] = None
class AppointmentCreate(BaseModel):
    customer_name: str; phone: str; service_id: str; appointment_date: str; appointment_time: str; notes: str = ""; staff_member_id: Optional[str] = None
class AppointmentUpdate(BaseModel):
    customer_name: Optional[str] = None; phone: Optional[str] = None; address: Optional[str] = None; service_id: Optional[str] = None; appointment_date: Optional[str] = None; appointment_time: Optional[str] = None; notes: Optional[str] = None; status: Optional[str] = None; staff_member_id: Optional[str] = None
class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); appointment_id: str; customer_name: str; service_name: str; amount: float; date: str; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class TransactionUpdate(BaseModel): amount: float
class BusinessHoursDay(BaseModel):
    is_open: bool = True
    open_time: str = "09:00"
    close_time: str = "18:00"

class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); work_start_hour: int = 7; work_end_hour: int = 3; appointment_interval: int = 30
    company_name: str = "İşletmeniz"; support_phone: str = "05000000000"; slug: Optional[str] = None; customer_can_choose_staff: bool = False
    logo_url: Optional[str] = None; sms_reminder_hours: float = 1.0; sector: Optional[str] = None; admin_provides_service: bool = False
    show_service_duration_on_public: bool = True; show_service_price_on_public: bool = True
    business_hours: Optional[dict] = Field(default_factory=lambda: {
        "monday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
        "tuesday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
        "wednesday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
        "thursday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
        "friday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
        "saturday": {"is_open": False, "open_time": "09:00", "close_time": "18:00"},
        "sunday": {"is_open": False, "open_time": "09:00", "close_time": "18:00"}
    })

# === ABONELİK PAKETLERİ ===
PLANS = [
    {
        "id": "tier_trial",
        "name": "Trial",
        "price_monthly": 0,
        "quota_monthly_appointments": 50,
        "trial_days": 7,
        "features": [
            "50 Randevu veya 7 Gün (Hangisi önce)",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Yeni kullanıcılar için deneme paketi."
    },
    {
        "id": "tier_1_standard",
        "name": "Standart",
        "price_monthly": 520,
        "quota_monthly_appointments": 100,
        "features": [
            "100 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Yeni başlayanlar, tek kişilik veya butik işletmeler için ideal başlangıç paketi."
    },
    {
        "id": "tier_2_profesyonel",
        "name": "Profesyonel",
        "price_monthly": 780,
        "quota_monthly_appointments": 300,
        "features": [
            "300 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Büyümekte olan ve müşteri kitlesini oturtmaya başlamış salonlar için."
    },
    {
        "id": "tier_3_premium",
        "name": "Premium",
        "price_monthly": 1100,
        "quota_monthly_appointments": 600,
        "features": [
            "600 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Düzenli ve sabit bir müşteri hacmine sahip, yerleşik işletmeler için."
    },
    {
        "id": "tier_4_business",
        "name": "Business",
        "price_monthly": 1300,
        "quota_monthly_appointments": 900,
        "features": [
            "900 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Yoğun tempolu, orta ölçekli salonlar ve merkezler için en popüler seçim."
    },
    {
        "id": "tier_5_enterprise",
        "name": "Enterprise",
        "price_monthly": 1500,
        "quota_monthly_appointments": 1200,
        "features": [
            "1.200 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Yüksek hacimli, birden fazla uzman/personel çalıştıran salonlar ve klinikler için."
    },
    {
        "id": "tier_6_kurumsal",
        "name": "Kurumsal",
        "price_monthly": 1990,
        "quota_monthly_appointments": 2000,
        "features": [
            "2.000 Randevu/Ay",
            "Randevu Hatırlatma Dahil",
            "Sınırsız Personel",
            "Sınırsız Müşteri",
            "Online Randevu",
            "İstatistikler"
        ],
        "target_audience_tr": "Sektörün en yoğun klinikleri, poliklinikler ve büyük ölçekli işletmeler için tam çözüm."
    }
]

class OrganizationPlan(BaseModel):
    """Organization'ın abonelik planı ve kota bilgisi"""
    model_config = ConfigDict(extra="ignore")
    organization_id: str
    plan_id: str = "tier_trial"  # Default trial
    quota_usage: int = 0  # Bu ay kullanılan randevu sayısı
    quota_reset_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc) + timedelta(days=30))  # Kota sıfırlama tarihi
    trial_start_date: Optional[datetime] = None  # Trial başlangıç tarihi
    trial_end_date: Optional[datetime] = None  # Trial bitiş tarihi
    is_first_month: bool = True  # İlk ay indirimi için
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class AuditLog(BaseModel):
    """Denetim günlüğü modeli - Kritik işlemleri kaydeder"""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    organization_id: str
    user_id: str  # username
    user_full_name: str
    action: str  # CREATE, UPDATE, DELETE
    resource_type: str  # APPOINTMENT, SETTINGS, CUSTOMER, SERVICE, STAFF
    resource_id: str
    old_value: Optional[dict] = None
    new_value: Optional[dict] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    ip_address: Optional[str] = None

# === GÜVENLİK API ENDPOINT'LERİ ===
@api_router.post("/register", response_model=User)
@rate_limit(LIMITS['register']) 
async def register_user(request: Request, user_in: UserCreate, db = Depends(get_db)):
    existing_user = await get_user_from_db(request, user_in.username, db=db)
    if existing_user: raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This username is already registered.")
    
    # Yeni organization ID oluştur
    new_org_id = str(uuid.uuid4())
    hashed_password = get_password_hash(user_in.password)
    
    # Slug oluştur (organization_name'den)
    base_slug = slugify(user_in.organization_name or user_in.username)
    unique_slug = base_slug
    
    # Slug benzersizlik kontrolü
    slug_counter = 1
    while await db.users.find_one({"slug": unique_slug}):
        unique_slug = f"{base_slug}{str(uuid.uuid4())[:4]}"
        slug_counter += 1
        if slug_counter > 10:  # Sonsuz döngüyü önle
            unique_slug = f"{base_slug}{str(uuid.uuid4())[:8]}"
            break
    
    # User kaydını oluştur
    user_db_data = user_in.model_dump(exclude={"organization_name", "support_phone"})
    user_db = UserInDB(**user_db_data, hashed_password=hashed_password, organization_id=new_org_id, role="admin", slug=unique_slug, permitted_service_ids=[], onboarding_completed=False)
    await db.users.insert_one(user_db.model_dump())
    
    # Bu kullanıcı için varsayılan Settings oluştur (kayıt bilgileriyle)
    default_settings = Settings(
        organization_id=new_org_id,
        company_name=user_in.organization_name or "İşletmeniz",
        support_phone=user_in.support_phone or "05000000000",
        slug=unique_slug,
        customer_can_choose_staff=False,
        sector=getattr(user_in, 'sector', None)
    )
    await db.settings.insert_one(default_settings.model_dump())
    
    # Yeni kayıt için Trial paketi oluştur
    trial_start = datetime.now(timezone.utc)
    trial_end = trial_start + timedelta(days=7)
    quota_reset = trial_start + timedelta(days=30)
    trial_plan = OrganizationPlan(
        organization_id=new_org_id,
        plan_id="tier_trial",
        quota_usage=0,
        quota_reset_date=quota_reset,
        trial_start_date=trial_start,
        trial_end_date=trial_end,
        is_first_month=True
    )
    plan_doc = trial_plan.model_dump()
    plan_doc['trial_start_date'] = plan_doc['trial_start_date'].isoformat()
    plan_doc['trial_end_date'] = plan_doc['trial_end_date'].isoformat()
    plan_doc['quota_reset_date'] = plan_doc['quota_reset_date'].isoformat()
    plan_doc['created_at'] = plan_doc['created_at'].isoformat()
    plan_doc['updated_at'] = plan_doc['updated_at'].isoformat()
    await db.organization_plans.insert_one(plan_doc)
    
    # Sektör bazlı default services ekle ve admin'e ata
    sector = getattr(user_in, 'sector', None)
    service_ids = []
    
    if sector and sector != "Diğer/Boş":
        sector_services = {
            "Kuaför": [
                {"name": "Saç Kesimi", "price": 150},
                {"name": "Saç Boyama", "price": 300},
                {"name": "Sakal Traşı", "price": 80},
            ],
            "Güzellik Salonu": [
                {"name": "Manikür", "price": 100},
                {"name": "Pedikür", "price": 120},
                {"name": "Cilt Bakımı", "price": 250},
                {"name": "Kaş Dizaynı", "price": 80},
            ],
            "Masaj / SPA": [
                {"name": "Klasik Masaj", "price": 300},
                {"name": "Aromaterapi Masajı", "price": 350},
                {"name": "İsveç Masajı", "price": 400},
            ],
            "Diyetisyen": [
                {"name": "İlk Danışma", "price": 300},
                {"name": "Kontrol Muayenesi", "price": 200},
                {"name": "Diyet Planı", "price": 250},
            ],
            "Psikolog / Danışmanlık": [
                {"name": "Bireysel Terapi", "price": 500},
                {"name": "Çift Terapisi", "price": 700},
                {"name": "Aile Danışmanlığı", "price": 600},
            ],
            "Diş Klinikleri": [
                {"name": "Muayene", "price": 200},
                {"name": "Dolgu", "price": 400},
                {"name": "Diş Temizliği", "price": 300},
                {"name": "Beyazlatma", "price": 1500},
            ],
        }
        
        services_to_add = sector_services.get(sector, [])
        for service_data in services_to_add:
            service_id = str(uuid.uuid4())
            service = Service(
                id=service_id,
                organization_id=new_org_id,
                **service_data
            )
            await db.services.insert_one(service.model_dump())
            service_ids.append(service_id)
    
    # Admin'e tüm hizmetleri ata
    if service_ids:
        await db.users.update_one(
            {"username": user_in.username},
            {"$set": {"permitted_service_ids": service_ids}}
        )
    
    # Brevo ile hoş geldin e-postası gönder
    try:
        logo_url = "https://dev.royalpremiumcare.com/api/static/logo.png"
        dashboard_url = "https://dev.royalpremiumcare.com"
        user_name = user_in.full_name or user_in.username
        subject = "PLANN'a Hoş Geldiniz! Ücretsiz Deneme Sürümünüz Başladı."
        html_content = f"""
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <tr>
                                <td align="center" style="padding: 30px 0; background-color: #f9f9f9; border-bottom: 1px solid #e0e0e0; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                                    <img src="{logo_url}" alt="PLANN Logosu" style="max-width: 150px; height: auto;">
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td style="padding: 40px 30px; color: #333333; font-size: 16px;">
                                    <h1 style="font-size: 24px; color: #111111; margin-top: 0; text-align: center;">PLANN Randevu Sistemine Hoş Geldiniz!</h1>
                                    <p>Merhaba {user_name},</p>
                                    <p>İşletmenizi PLANN ile dijital dünyaya taşımaya karar verdiğiniz için teşekkür ederiz.</p>
                                    <p>Randevu yönetiminizi kolaylaştırmak için tasarlanan tüm özelliklerimize erişim sağlayan <strong>7 günlük (veya 50 randevuluk)</strong> ücretsiz deneme sürümünüz başarıyla başlatıldı.</p>
                                    <p style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                                        Artık panonuza giderek ilk randevunuzu oluşturabilir ve sistemi keşfetmeye başlayabilirsiniz.
                                    </p>
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td align="center" style="padding: 0 30px 40px 30px;">
                                    <a href="{dashboard_url}" target="_blank" style="background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block;">
                                        Kullanmaya Başla
                                    </a>
                                </td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td align="center" style="padding: 20px 30px; font-size: 12px; color: #888888; border-top: 1px solid #e0e0e0; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                                    <p>© 2025 PLANN. Tüm hakları saklıdır.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        await send_email(
            to_email=user_in.username,
            subject=subject,
            html_content=html_content,
            to_name=user_name
        )
    except Exception as e:
        logging.error(f"E-posta gönderme sırasında beklenmedik hata: {e}")
        # E-posta gönderilemese bile kayıt başarılı olmalı
    
    return User(**user_db.model_dump())

@api_router.post("/token", response_model=Token)
@rate_limit(LIMITS['login']) 
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    try:
        user = await get_user_from_db(request, form_data.username, db=db)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
        
        # Pending (bekleyen) kullanıcılar giriş yapamaz
        if user.status == "pending":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hesabınız henüz aktif değil. Lütfen e-postanızdaki davet linkine tıklayarak şifrenizi belirleyin.")
        
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        token_data = {
            "sub": user.username, 
            "org_id": user.organization_id, 
            "role": user.role, 
            "onboarding_completed": user.onboarding_completed,
            "full_name": user.full_name or None
        }
        access_token = create_access_token(data=token_data, expires_delta=access_token_expires)
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException: raise
    except Exception as e:
        logging.error(f"Login error: {type(e).__name__}: {str(e)}"); import traceback; logging.error(traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error occurred during login. Please try again later.")

# === E-POSTA GÖNDERME FONKSİYONLARI ===
async def send_personnel_invitation_email(user_email: str, user_name: str, organization_name: str, invitation_link: str):
    """Personel davet e-postası gönderir."""
    try:
        logo_url = "https://dev.royalpremiumcare.com/api/static/logo.png"
        subject = "PLANN Davetiyesi: Hesabınızı Oluşturun"
        html_content = f"""
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <tr>
                                <td align="center" style="padding: 30px 0; background-color: #f9f9f9; border-bottom: 1px solid #e0e0e0; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                                    <img src="{logo_url}" alt="PLANN Logosu" style="max-width: 150px; height: auto;">
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td style="padding: 40px 30px; color: #333333; font-size: 16px;">
                                    <h1 style="font-size: 24px; color: #111111; margin-top: 0; text-align: center;">PLANN Davetiyesi</h1>
                                    <p>Merhaba {user_name},</p>
                                    <p><strong>{organization_name}</strong> sizi PLANN randevu sistemine personel olarak ekledi.</p>
                                    <p>Hesabınızı aktif etmek ve şifrenizi belirlemek için lütfen aşağıdaki butona tıklayın.</p>
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td align="center" style="padding: 0 30px 40px 30px;">
                                    <a href="{invitation_link}" target="_blank" style="background-color: #007bff; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block;">
                                        Şifremi Belirle ve Giriş Yap
                                    </a>
                                </td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td align="center" style="padding: 20px 30px; font-size: 12px; color: #888888; border-top: 1px solid #e0e0e0; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                                    <p>© 2025 PLANN. Tüm hakları saklıdır.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        return await send_email(
            to_email=user_email,
            subject=subject,
            html_content=html_content,
            to_name=user_name
        )
    except Exception as e:
        logging.error(f"E-posta gönderme sırasında beklenmedik hata: {e}")
        return False

async def send_password_reset_email(user_email: str, user_name: str, reset_link: str):
    """Kullanıcıya şifre sıfırlama linkini içeren kurumsal e-postayı gönderir."""
    try:
        logo_url = "https://dev.royalpremiumcare.com/api/static/logo.png"
        subject = "PLANN Şifre Sıfırlama Talebi"
        html_content = f"""
        <html>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; line-height: 1.6;">
            <table width="100%" border="0" cellpadding="0" cellspacing="0">
                <tr>
                    <td align="center" style="padding: 20px 0;">
                        <table width="600" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <tr>
                                <td align="center" style="padding: 30px 0; background-color: #f9f9f9; border-bottom: 1px solid #e0e0e0; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                                    <img src="{logo_url}" alt="PLANN Logosu" style="max-width: 150px; height: auto;">
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td style="padding: 40px 30px; color: #333333; font-size: 16px;">
                                    <h1 style="font-size: 24px; color: #111111; margin-top: 0; text-align: center;">Şifrenizi mi Unuttunuz?</h1>
                                    <p>Merhaba {user_name},</p>
                                    <p>PLANN hesabınız için bir şifre sıfırlama talebi aldık. Hesabınıza yeniden erişim sağlamak için lütfen aşağıdaki butona tıklayın.</p>
                                    <p>Bu link, güvenlik nedeniyle <strong>30 dakika</strong> sonra geçerliliğini yitirecektir.</p>
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td align="center" style="padding: 0 30px 40px 30px;">
                                    <a href="{reset_link}" target="_blank" style="background-color: #dc3545; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 5px; font-size: 18px; font-weight: bold; display: inline-block;">
                                        Şifremi Sıfırla
                                    </a>
                                </td>
                            </tr>
                            <tr style="background-color: #ffffff;">
                                <td align="center" style="padding: 0 30px 40px 30px; font-size: 14px; color: #888888;">
                                    <p style="border-top: 1px solid #eeeeee; padding-top: 20px;">
                                        Eğer bu talebi siz yapmadıysanız, bu e-postayı dikkate almayınız. Hesabınız güvende kalmaya devam edecektir.
                                    </p>
                                </td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td align="center" style="padding: 20px 30px; font-size: 12px; color: #888888; border-top: 1px solid #e0e0e0; border-bottom-left-radius: 8px; border-bottom-right-radius: 8px;">
                                    <p>© 2025 PLANN. Tüm hakları saklıdır.</p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """
        
        return await send_email(
            to_email=user_email,
            subject=subject,
            html_content=html_content,
            to_name=user_name,
            sender_name="PLANN Destek"
        )
    except Exception as e:
        logging.error(f"Şifre sıfırlama e-postası gönderme sırasında beklenmedik hata: {e}")
        return False

@api_router.post("/forgot-password")
@rate_limit("3/hour")
async def forgot_password(request: Request, forgot_request: ForgotPasswordRequest, db = Depends(get_db)):
    """Kullanıcıya şifre sıfırlama e-postası gönderir."""
    try:
        # Kullanıcıyı bul
        user = await get_user_from_db(request, forgot_request.username, db=db)
        if not user:
            # Güvenlik nedeniyle kullanıcı yoksa da başarılı mesajı döndür
            return {"message": "Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama linki gönderildi."}
        
        # Benzersiz token oluştur
        reset_token = str(uuid.uuid4()) + str(uuid.uuid4()).replace('-', '')
        
        # Token'ı veritabanına kaydet (30 dakika geçerli)
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        await db.password_reset_tokens.insert_one({
            "username": user.username,
            "token": reset_token,
            "expires_at": expires_at.isoformat(),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False
        })
        
        # Reset link oluştur
        reset_link = f"https://dev.royalpremiumcare.com/reset-password?token={reset_token}"
        
        # E-posta gönder
        user_name = user.full_name or user.username
        email_sent = await send_password_reset_email(user.username, user_name, reset_link)
        
        if email_sent:
            logging.info(f"Şifre sıfırlama token'ı oluşturuldu ve e-posta gönderildi: {user.username}")
        else:
            logging.warning(f"Şifre sıfırlama token'ı oluşturuldu ancak e-posta gönderilemedi: {user.username}")
        
        # Güvenlik nedeniyle her zaman başarılı mesajı döndür
        return {"message": "Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama linki gönderildi."}
    except Exception as e:
        logging.error(f"Şifre sıfırlama talebi hatası: {e}")
        import traceback
        logging.error(traceback.format_exc())
        # Güvenlik nedeniyle hata durumunda da başarılı mesajı döndür
        return {"message": "Eğer bu e-posta adresi kayıtlıysa, şifre sıfırlama linki gönderildi."}

@api_router.post("/auth/setup-password")
@rate_limit(LIMITS['register'])
async def setup_password(request: Request, setup_request: SetupPasswordRequest, db = Depends(get_db)):
    """Personel davet token'ı ile şifre belirleme."""
    try:
        # Token ile kullanıcıyı bul
        user = await db.users.find_one({"invitation_token": setup_request.token})
        if not user:
            raise HTTPException(status_code=400, detail="Geçersiz veya süresi dolmuş davet linki")
        
        # Kullanıcı zaten aktif mi kontrol et
        if user.get("status") == "active":
            raise HTTPException(status_code=400, detail="Bu hesap zaten aktif edilmiş")
        
        # Şifreyi hashle
        hashed_password = get_password_hash(setup_request.new_password)
        
        # Kullanıcıyı güncelle: şifre ekle, status'u active yap, invitation_token'ı sil
        await db.users.update_one(
            {"invitation_token": setup_request.token},
            {
                "$set": {
                    "hashed_password": hashed_password,
                    "status": "active"
                },
                "$unset": {
                    "invitation_token": ""
                }
            }
        )
        
        logging.info(f"Personel şifre belirleme tamamlandı: {user.get('username')}")
        return {"message": "Şifreniz başarıyla belirlendi. Giriş yapabilirsiniz."}
    except HTTPException: raise
    except Exception as e:
        logging.error(f"Şifre belirleme hatası: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Şifre belirlenirken bir hata oluştu")

@api_router.post("/reset-password")
@rate_limit(LIMITS['register'])
async def reset_password(request: Request, reset_request: ResetPasswordRequest, db = Depends(get_db)):
    """Token ile şifreyi sıfırlar."""
    try:
        # Token'ı bul
        token_doc = await db.password_reset_tokens.find_one({
            "token": reset_request.token,
            "used": False
        })
        
        if not token_doc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Geçersiz veya kullanılmış token."
            )
        
        # Token'ın süresi dolmuş mu kontrol et
        expires_at = datetime.fromisoformat(token_doc['expires_at'].replace('Z', '+00:00'))
        if datetime.now(timezone.utc) > expires_at:
            # Süresi dolmuş token'ı işaretle
            await db.password_reset_tokens.update_one(
                {"token": reset_request.token},
                {"$set": {"used": True}}
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Token'ın süresi dolmuş. Lütfen yeni bir şifre sıfırlama talebi oluşturun."
            )
        
        # Kullanıcıyı bul
        username = token_doc['username']
        user = await get_user_from_db(request, username, db=db)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Kullanıcı bulunamadı."
            )
        
        # Yeni şifreyi hashle ve güncelle
        new_hashed_password = get_password_hash(reset_request.new_password)
        await db.users.update_one(
            {"username": username},
            {"$set": {"hashed_password": new_hashed_password}}
        )
        
        # Token'ı kullanıldı olarak işaretle
        await db.password_reset_tokens.update_one(
            {"token": reset_request.token},
            {"$set": {"used": True}}
        )
        
        logging.info(f"Şifre başarıyla sıfırlandı: {username}")
        return {"message": "Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz."}
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Şifre sıfırlama hatası: {e}")
        import traceback
        logging.error(traceback.format_exc())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Şifre sıfırlama sırasında bir hata oluştu. Lütfen tekrar deneyin."
        )

# === APPOINTMENTS ROUTES ===
@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(request: Request, appointment_id: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"id": appointment_id, "organization_id": current_user.organization_id}
    
    # Get appointment before deleting (for audit log)
    appointment = await db.appointments.find_one(query, {"_id": 0})
    if not appointment:
        raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    
    # Randevu silinmeden önce, eğer iptal edilmemişse kotayı azalt
    # (İptal edilmiş randevular zaten kota'dan düşülmüştür)
    if appointment.get('status') != 'İptal':
        try:
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc and plan_doc.get('quota_usage', 0) > 0:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        except Exception as e:
            logging.error(f"Kota azaltma hatası (delete): {e}")
    
    result = await db.appointments.delete_one(query)
    
    # Randevuyla ilişkili transaction'ları da sil
    try:
        transaction_query = {
            "appointment_id": appointment_id,
            "organization_id": current_user.organization_id
        }
        transaction_delete_result = await db.transactions.delete_many(transaction_query)
        if transaction_delete_result.deleted_count > 0:
            logger.info(f"Deleted {transaction_delete_result.deleted_count} transaction(s) for appointment {appointment_id}")
    except Exception as e:
        logger.error(f"Error deleting transactions for appointment {appointment_id}: {e}", exc_info=True)
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="DELETE",
        resource_type="APPOINTMENT",
        resource_id=appointment_id,
        old_value=appointment,
        ip_address=request.client.host if request.client else None
    )
    
    # Emit WebSocket event for real-time update
    logger.info(f"About to emit appointment_deleted for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'appointment_deleted',
            {'appointment_id': appointment_id}
        )
        logger.info(f"Successfully emitted appointment_deleted for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit appointment_deleted: {emit_error}", exc_info=True)
    
    return {"message": "Randevu silindi"}

@api_router.put("/appointments/{appointment_id}", response_model=Appointment)
async def update_appointment(request: Request, appointment_id: str, appointment_update: AppointmentUpdate, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); settings_data = await db.settings.find_one({"organization_id": current_user.organization_id})
    if not settings_data:
        default_settings = Settings(organization_id=current_user.organization_id); settings_data = default_settings.model_dump()
    company_name = settings_data.get("company_name", "İşletmeniz"); support_phone = settings_data.get("support_phone", "Destek Hattı")
    query = {"id": appointment_id, "organization_id": current_user.organization_id}; appointment = await db.appointments.find_one(query, {"_id": 0})
    if not appointment: raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    update_data = {k: v for k, v in appointment_update.model_dump().items() if v is not None}
    # Tarih/saat veya personel değişikliği varsa çakışma kontrolü yap
    if 'appointment_date' in update_data or 'appointment_time' in update_data or 'staff_member_id' in update_data:
        check_date = update_data.get('appointment_date', appointment['appointment_date'])
        check_time = update_data.get('appointment_time', appointment['appointment_time'])
        check_staff = update_data.get('staff_member_id', appointment.get('staff_member_id'))
        
        existing_query = {
            "organization_id": current_user.organization_id,
            "id": {"$ne": appointment_id},
            "staff_member_id": check_staff,
            "appointment_date": check_date,
            "appointment_time": check_time,
            "status": {"$ne": "İptal"}
        }
        existing = await db.appointments.find_one(existing_query)
        if existing:
            raise HTTPException(
                status_code=400,
                detail=f"Bu personelin {check_date} tarihinde {check_time} saatinde zaten bir randevusu var. Lütfen başka bir saat seçin."
            )
    if 'service_id' in update_data:
        service_query = {"id": update_data['service_id'], "organization_id": current_user.organization_id}; service = await db.services.find_one(service_query, {"_id": 0})
        if service: update_data['service_name'] = service['name']; update_data['service_price'] = service['price']
    new_status = update_data.get('status'); old_status = appointment['status']
    if new_status == 'Tamamlandı' and old_status != 'Tamamlandı':
        update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        transaction = Transaction(organization_id=current_user.organization_id, appointment_id=appointment_id, customer_name=appointment['customer_name'], service_name=appointment['service_name'], amount=appointment['service_price'], date=appointment['appointment_date'])
        trans_doc = transaction.model_dump(); trans_doc['created_at'] = trans_doc['created_at'].isoformat()
        await db.transactions.insert_one(trans_doc)
        # Tamamlanma SMS'i kaldırıldı (maliyet nedeniyle)
    elif new_status == 'İptal' and old_status != 'İptal':
        # Randevu iptal edildiğinde kotayı azalt
        try:
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc and plan_doc.get('quota_usage', 0) > 0:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}, "$set": {"updated_at": datetime.now(timezone.utc).isoformat()}}
                )
        except Exception as e:
            logging.error(f"Kota azaltma hatası: {e}")
        
        try:
            # İptal SMS'i - Default mesaj kullan
            sms_message = build_sms_message(
                company_name, appointment['customer_name'],
                appointment['appointment_date'], appointment['appointment_time'],
                appointment['service_name'], support_phone, sms_type="cancellation"
            )
            send_sms(appointment['phone'], sms_message)
        except Exception as e: logging.error(f"İptal SMS'i gönderilirken hata oluştu: {e}")
    if update_data: await db.appointments.update_one(query, {"$set": update_data})
    updated_appointment = await db.appointments.find_one(query, {"_id": 0})
    if isinstance(updated_appointment['created_at'], str): updated_appointment['created_at'] = datetime.fromisoformat(updated_appointment['created_at'])
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="UPDATE",
        resource_type="APPOINTMENT",
        resource_id=appointment_id,
        old_value=appointment,
        new_value=updated_appointment,
        ip_address=request.client.host if request.client else None
    )
    
    # Emit WebSocket event for real-time update
    # Convert datetime to ISO format if it's a datetime object
    # make_json_serializable function will handle this, but we can also do it explicitly
    if isinstance(updated_appointment.get('created_at'), datetime):
        updated_appointment['created_at'] = updated_appointment['created_at'].isoformat()
    logger.info(f"About to emit appointment_updated for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'appointment_updated',
            {'appointment': updated_appointment}
        )
        logger.info(f"Successfully emitted appointment_updated for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit appointment_updated: {emit_error}", exc_info=True)
    
    return updated_appointment

@api_router.get("/appointments/{appointment_id}", response_model=Appointment)
async def get_appointment(request: Request, appointment_id: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request)
    query = {"id": appointment_id, "organization_id": current_user.organization_id}
    appointment = await db.appointments.find_one(query, {"_id": 0})
    if not appointment: raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    if isinstance(appointment['created_at'], str): appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
    return appointment

@api_router.post("/appointments", response_model=Appointment)
async def create_appointment(request: Request, appointment: AppointmentCreate, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request)
    
    # KOTA KONTROLÜ - Randevu oluşturmadan önce kontrol et
    quota_ok, quota_error = await check_quota_and_increment(db, current_user.organization_id)
    if not quota_ok:
        raise HTTPException(status_code=403, detail=quota_error)
    
    service_query = {"id": appointment.service_id, "organization_id": current_user.organization_id}
    service = await db.services.find_one(service_query, {"_id": 0})
    if not service: 
        # Kota artırıldı ama hizmet bulunamadı, geri al
        plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
        if plan_doc:
            await db.organization_plans.update_one(
                {"organization_id": current_user.organization_id},
                {"$inc": {"quota_usage": -1}}
            )
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    
    # PERSONEL KONTROL: Staff ise sadece kendi hizmetlerine randevu alabilir
    if current_user.role == "staff":
        if service["id"] not in current_user.permitted_service_ids:
            # Kota artırıldı ama yetki yok, geri al
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}}
                )
            raise HTTPException(status_code=403, detail="Bu hizmete randevu alma yetkiniz yok")
    
    # Otomatik atama mantığı
    assigned_staff_id = None
    
    if appointment.staff_member_id:
        # Belirli bir personel seçildi - çakışma kontrolü yap (duration'a göre)
        service_duration = service.get('duration', 30)
        
        # Yeni randevunun başlangıç ve bitiş saatlerini hesapla
        new_start_hour, new_start_minute = map(int, appointment.appointment_time.split(':'))
        new_end_minute = new_start_minute + service_duration
        new_end_hour = new_start_hour + (new_end_minute // 60)
        new_end_minute = new_end_minute % 60
        new_end_time = f"{str(new_end_hour).zfill(2)}:{str(new_end_minute).zfill(2)}"
        
        # Bu personelin o tarihteki tüm randevularını çek
        existing_appointments = await db.appointments.find(
            {
                "organization_id": current_user.organization_id,
                "staff_member_id": appointment.staff_member_id,
                "appointment_date": appointment.appointment_date,
                "status": {"$ne": "İptal"}
            },
            {"_id": 0, "appointment_time": 1, "service_id": 1}
        ).to_list(100)
        
        # Her randevunun bitiş saatini hesapla ve çakışma kontrolü yap
        has_conflict = False
        for existing_appt in existing_appointments:
            existing_start_time = existing_appt['appointment_time']
            existing_service_id = existing_appt.get('service_id')
            
            # Mevcut randevunun hizmet süresini bul
            if existing_service_id:
                existing_service = await db.services.find_one({"id": existing_service_id}, {"_id": 0, "duration": 1})
                existing_duration = existing_service.get('duration', 30) if existing_service else 30
            else:
                existing_duration = 30
            
            # Mevcut randevunun bitiş saatini hesapla
            existing_start_hour, existing_start_minute = map(int, existing_start_time.split(':'))
            existing_end_minute = existing_start_minute + existing_duration
            existing_end_hour = existing_start_hour + (existing_end_minute // 60)
            existing_end_minute = existing_end_minute % 60
            existing_end_time = f"{str(existing_end_hour).zfill(2)}:{str(existing_end_minute).zfill(2)}"
            
            # Çakışma kontrolü: (yeni_başlangıç < mevcut_bitiş) VE (yeni_bitiş > mevcut_başlangıç)
            if (appointment.appointment_time < existing_end_time and new_end_time > existing_start_time):
                has_conflict = True
                logging.info(f"⚠️ Conflict detected: New {appointment.appointment_time}-{new_end_time} overlaps with existing {existing_start_time}-{existing_end_time}")
                break
        
        if has_conflict:
            # Kota artırıldı ama çakışma var, geri al
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}}
                )
            raise HTTPException(
                status_code=400,
                detail=f"Bu personelin {appointment.appointment_date} tarihinde {appointment.appointment_time} saatinde zaten bir randevusu var. Lütfen başka bir saat seçin."
            )
        assigned_staff_id = appointment.staff_member_id
    else:
        # Otomatik atama: Bu hizmeti verebilen personellerden boş olanı bul
        # Admin'in de hizmet verip vermediğini kontrol et
        settings_data = await db.settings.find_one({"organization_id": current_user.organization_id})
        admin_provides_service = settings_data.get('admin_provides_service', True) if settings_data else True
        
        # Bu hizmeti verebilen personelleri bul
        qualified_staff_query = {
            "organization_id": current_user.organization_id,
            "permitted_service_ids": {"$in": [appointment.service_id]}
        }
        
        # Admin hizmet vermiyorsa, admin'i listeden çıkar
        if not admin_provides_service:
            qualified_staff_query["role"] = {"$ne": "admin"}
        
        qualified_staff = await db.users.find(
            qualified_staff_query,
            {"_id": 0, "username": 1, "role": 1}
        ).to_list(1000)
        
        if not qualified_staff:
            # Kota artırıldı ama personel bulunamadı, geri al
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}}
                )
            raise HTTPException(
                status_code=400,
                detail="Bu hizmet için uygun personel bulunamadı"
            )
        
        # Boş personel bul (duration'a göre çakışma kontrolü ile)
        service_duration = service.get('duration', 30)
        
        # Yeni randevunun başlangıç ve bitiş saatlerini hesapla
        new_start_hour, new_start_minute = map(int, appointment.appointment_time.split(':'))
        new_end_minute = new_start_minute + service_duration
        new_end_hour = new_start_hour + (new_end_minute // 60)
        new_end_minute = new_end_minute % 60
        new_end_time = f"{str(new_end_hour).zfill(2)}:{str(new_end_minute).zfill(2)}"
        
        for staff in qualified_staff:
            # Bu personelin o tarihteki tüm randevularını çek
            existing_appointments = await db.appointments.find(
                {
                    "organization_id": current_user.organization_id,
                    "staff_member_id": staff['username'],
                    "appointment_date": appointment.appointment_date,
                    "status": {"$ne": "İptal"}
                },
                {"_id": 0, "appointment_time": 1, "service_id": 1}
            ).to_list(100)
            
            # Çakışma kontrolü
            has_conflict = False
            for existing_appt in existing_appointments:
                existing_start_time = existing_appt['appointment_time']
                existing_service_id = existing_appt.get('service_id')
                
                # Mevcut randevunun hizmet süresini bul
                if existing_service_id:
                    existing_service = await db.services.find_one({"id": existing_service_id}, {"_id": 0, "duration": 1})
                    existing_duration = existing_service.get('duration', 30) if existing_service else 30
                else:
                    existing_duration = 30
                
                # Mevcut randevunun bitiş saatini hesapla
                existing_start_hour, existing_start_minute = map(int, existing_start_time.split(':'))
                existing_end_minute = existing_start_minute + existing_duration
                existing_end_hour = existing_start_hour + (existing_end_minute // 60)
                existing_end_minute = existing_end_minute % 60
                existing_end_time = f"{str(existing_end_hour).zfill(2)}:{str(existing_end_minute).zfill(2)}"
                
                # Çakışma kontrolü
                if (appointment.appointment_time < existing_end_time and new_end_time > existing_start_time):
                    has_conflict = True
                    logging.debug(f"   ⚠️ Staff {staff['username']} has conflict: {appointment.appointment_time}-{new_end_time} overlaps with {existing_start_time}-{existing_end_time}")
                    break
            
            if not has_conflict:
                # Bu personel boş!
                assigned_staff_id = staff['username']
                logging.info(f"✅ Auto-assigned to {staff['username']} for {appointment.appointment_time}")
                break
        
        if not assigned_staff_id:
            # Kota artırıldı ama personel bulunamadı, geri al
            plan_doc = await db.organization_plans.find_one({"organization_id": current_user.organization_id})
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": current_user.organization_id},
                    {"$inc": {"quota_usage": -1}}
                )
            raise HTTPException(
                status_code=400,
                detail="Bu saat dilimi doludur. Lütfen başka bir saat seçin."
            )
    
    appointment_data = appointment.model_dump(); 
    appointment_data['service_name'] = service['name']; 
    appointment_data['service_price'] = service['price']
    appointment_data['staff_member_id'] = assigned_staff_id
    appointment_data['service_duration'] = service.get('duration', 30)  # Hizmet süresini ekle
    try:
        turkey_tz = ZoneInfo("Europe/Istanbul"); now = datetime.now(turkey_tz); dt_str = f"{appointment.appointment_date} {appointment.appointment_time}"
        naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M"); appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
        # Randevu bitiş saatini hesapla (başlangıç saati + hizmet süresi)
        service_duration_minutes = service.get('duration', 30)
        completion_threshold = appointment_dt + timedelta(minutes=service_duration_minutes)
        if now >= completion_threshold: appointment_data['status'] = 'Tamamlandı'; appointment_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        else: appointment_data['status'] = 'Bekliyor'
    except (ValueError, TypeError) as e: logging.warning(f"Randevu durumu ayarlanırken tarih hatası: {e}"); appointment_data['status'] = 'Bekliyor'
    appointment_obj = Appointment(**appointment_data, organization_id=current_user.organization_id)
    doc = appointment_obj.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    
    # Müşteriyi customers collection'ına ekle (eğer yoksa)
    try:
        # Aynı telefon numarasına sahip müşterileri bul
        customers_with_phone = await db.customers.find(
            {
                "organization_id": current_user.organization_id,
                "phone": appointment.phone
            },
            {"_id": 0, "name": 1, "phone": 1}
        ).to_list(100)
        
        # İsim-soyisim kontrolü (büyük-küçük harf duyarsız)
        customer_name_normalized = appointment.customer_name.strip().lower()
        existing_customer = None
        for customer in customers_with_phone:
            if customer.get("name", "").strip().lower() == customer_name_normalized:
                existing_customer = customer
                break
        
        if not existing_customer:
            # Müşteri yoksa ekle
            customer_doc = {
                "id": str(uuid.uuid4()),
                "organization_id": current_user.organization_id,
                "name": appointment.customer_name.strip(),
                "phone": appointment.phone,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "notes": ""
            }
            await db.customers.insert_one(customer_doc)
            logging.info(f"Customer auto-added: {appointment.customer_name} ({appointment.phone}) for org {current_user.organization_id}")
            
            # WebSocket event gönder (müşteriler listesini güncellemek için)
            try:
                await emit_to_organization(
                    current_user.organization_id,
                    'customer_added',
                    {'customer': customer_doc}
                )
            except Exception as emit_error:
                logging.warning(f"Failed to emit customer_added event: {emit_error}")
    except Exception as e:
        logging.warning(f"Error adding customer to collection: {e}")
    
    if appointment_obj.status == 'Tamamlandı':
        transaction = Transaction(organization_id=current_user.organization_id, appointment_id=appointment_obj.id, customer_name=appointment_obj.customer_name, service_name=appointment_obj.service_name, amount=appointment_obj.service_price, date=appointment_obj.appointment_date)
        trans_doc = transaction.model_dump(); trans_doc['created_at'] = trans_doc['created_at'].isoformat()
        await db.transactions.insert_one(trans_doc)

    settings_data = await db.settings.find_one({"organization_id": current_user.organization_id})
    if not settings_data:
        default_settings = Settings(organization_id=current_user.organization_id); settings_data = default_settings.model_dump()
    company_name = settings_data.get("company_name", "İşletmeniz")
    support_phone = settings_data.get("support_phone", "Destek Hattı")
    
    # SMS gönder - Default mesaj kullan
    sms_message = build_sms_message(
        company_name, appointment.customer_name,
        appointment.appointment_date, appointment.appointment_time,
        service['name'], support_phone, sms_type="confirmation"
    )
    
    send_sms(appointment.phone, sms_message)
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="CREATE",
        resource_type="APPOINTMENT",
        resource_id=appointment_obj.id,
        new_value=doc,
        ip_address=request.client.host if request.client else None
    )
    
    # Emit WebSocket event for real-time update
    # Use appointment_obj.model_dump() instead of doc to avoid MongoDB _id issues
    appointment_for_emit = appointment_obj.model_dump()
    appointment_for_emit['created_at'] = appointment_for_emit['created_at'].isoformat()
    logger.info(f"About to emit appointment_created for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'appointment_created',
            {'appointment': appointment_for_emit}
        )
        logger.info(f"Successfully emitted appointment_created for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit appointment_created: {emit_error}", exc_info=True)
    
    return appointment_obj

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments(
    request: Request, 
    date: Optional[str] = None, 
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    status: Optional[str] = None, 
    search: Optional[str] = None,
    staff_member_id: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    db = await get_db_from_request(request)
    query = {"organization_id": current_user.organization_id}
    
    # Personel sadece kendine atanan randevuları görebilir
    if current_user.role == "staff":
        query['staff_member_id'] = current_user.username
    elif staff_member_id and current_user.role == "admin":
        # Admin için personel filtresi
        if staff_member_id != "all" and staff_member_id != "unassigned":
            query['staff_member_id'] = staff_member_id
        elif staff_member_id == "unassigned":
            query['$or'] = [
                {'staff_member_id': {'$exists': False}},
                {'staff_member_id': None},
                {'staff_member_id': ''}
            ]
    
    if date: 
        query['appointment_date'] = date
    elif start_date and end_date:
        # Tarih aralığı sorgusu
        query['appointment_date'] = {
            '$gte': start_date,
            '$lte': end_date
        }
    elif start_date:
        query['appointment_date'] = {'$gte': start_date}
    elif end_date:
        query['appointment_date'] = {'$lte': end_date}
    
    if status: query['status'] = status
    if search:
        query['$or'] = [
            {'customer_name': {'$regex': search, '$options': 'i'}},
            {'phone': {'$regex': search, '$options': 'i'}}
        ]
    
    appointments_from_db = await db.appointments.find(query, {"_id": 0}).to_list(1000)
    try:
        turkey_tz = ZoneInfo("Europe/Istanbul"); now = datetime.now(turkey_tz)
    except Exception:
        turkey_tz = timezone(timedelta(hours=3)); now = datetime.now(turkey_tz)
    
    # Tüm servisleri bir kerede çek (performans için)
    service_ids = [appt.get('service_id') for appt in appointments_from_db if appt.get('service_id')]
    services_dict = {}
    if service_ids:
        unique_service_ids = list(set(service_ids))
        logging.info(f"🔍 GET /appointments: {len(unique_service_ids)} unique service_id bulundu: {unique_service_ids[:5]}")
        services = await db.services.find(
            {"id": {"$in": unique_service_ids}, "organization_id": current_user.organization_id},
            {"_id": 0, "id": 1, "duration": 1}
        ).to_list(1000)
        services_dict = {s['id']: s.get('duration', 30) for s in services}
        logging.info(f"✅ GET /appointments: {len(services_dict)} servis bulundu, durations: {list(services_dict.values())[:5]}")
    else:
        logging.warning("⚠️ GET /appointments: Hiç service_id bulunamadı")
    
    ids_to_update = []; transactions_to_create = [] 
    for appt in appointments_from_db:
        if isinstance(appt.get('created_at'), str): appt['created_at'] = datetime.fromisoformat(appt['created_at'])
        
        # Service duration ekle (bitiş saati hesaplamak için)
        appt_service_id = appt.get('service_id')
        if appt_service_id and appt_service_id in services_dict:
            appt['service_duration'] = services_dict[appt_service_id]
            logging.debug(f"✅ Randevu {appt.get('id', 'unknown')}: service_duration={appt['service_duration']} (service_id={appt_service_id})")
        else:
            appt['service_duration'] = 30
            if appt_service_id:
                logging.warning(f"⚠️ Randevu {appt.get('id', 'unknown')}: service_id={appt_service_id} services_dict'te bulunamadı, default 30 kullanılıyor")
            else:
                logging.warning(f"⚠️ Randevu {appt.get('id', 'unknown')}: service_id yok, default 30 kullanılıyor")
        
        if appt.get('status') == 'Bekliyor':
            try:
                dt_str = f"{appt['appointment_date']} {appt['appointment_time']}"
                naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M"); appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
                
                # Randevu bitiş saatini hesapla (başlangıç saati + hizmet süresi)
                service_duration_minutes = appt.get('service_duration', 30)
                completion_threshold = appointment_dt + timedelta(minutes=service_duration_minutes)
                
                # Şu anki saat >= bitiş saati ise tamamlandı olarak işaretle
                if now >= completion_threshold:
                    appt['status'] = 'Tamamlandı'; completed_at_iso = datetime.now(timezone.utc).isoformat()
                    appt['completed_at'] = completed_at_iso; ids_to_update.append(appt['id'])
                    logging.info(f"✅ Randevu {appt.get('id', 'unknown')} otomatik tamamlandı: {appt['appointment_time']} + {service_duration_minutes}dk = {completion_threshold.strftime('%H:%M')}, şimdi: {now.strftime('%H:%M')}")
                    transaction = Transaction(organization_id=current_user.organization_id, appointment_id=appt['id'], customer_name=appt['customer_name'], service_name=appt['service_name'], amount=appt['service_price'], date=appt['appointment_date'])
                    trans_doc = transaction.model_dump(); trans_doc['created_at'] = trans_doc['created_at'].isoformat()
                    transactions_to_create.append(trans_doc)
            except (ValueError, TypeError) as e: logging.warning(f"Randevu {appt['id']} için tarih ayrıştırılamadı: {e}")
    if ids_to_update:
        await db.appointments.update_many({"organization_id": current_user.organization_id, "id": {"$in": ids_to_update}}, {"$set": {"status": "Tamamlandı", "completed_at": datetime.now(timezone.utc).isoformat()}})
    if transactions_to_create:
        await db.transactions.insert_many(transactions_to_create)
    return appointments_from_db

# === SERVICES ROUTES ===
@api_router.delete("/services/{service_id}")
async def delete_service(request: Request, service_id: str, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"id": service_id, "organization_id": current_user.organization_id}
    result = await db.services.delete_one(query)
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    return {"message": "Hizmet silindi"}

@api_router.put("/services/{service_id}", response_model=Service)
async def update_service(request: Request, service_id: str, service_update: ServiceUpdate, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"id": service_id, "organization_id": current_user.organization_id}
    service = await db.services.find_one(query, {"_id": 0})
    if not service: raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    update_data = {k: v for k, v in service_update.model_dump().items() if v is not None}
    if update_data: await db.services.update_one(query, {"$set": update_data})
    updated_service = await db.services.find_one(query, {"_id": 0})
    if isinstance(updated_service['created_at'], str): updated_service['created_at'] = datetime.fromisoformat(updated_service['created_at'])
    return updated_service

@api_router.get("/services/{service_id}", response_model=Service)
async def get_service(request: Request, service_id: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"id": service_id, "organization_id": current_user.organization_id}
    service = await db.services.find_one(query, {"_id": 0})
    if not service: raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    if isinstance(service['created_at'], str): service['created_at'] = datetime.fromisoformat(service['created_at'])
    return service

@api_router.post("/services", response_model=Service)
async def create_service(request: Request, service: ServiceCreate, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin ekleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); service_obj = Service(**service.model_dump(), organization_id=current_user.organization_id)
    doc = service_obj.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
    await db.services.insert_one(doc); return service_obj

@api_router.get("/services", response_model=List[Service])
async def get_services(request: Request, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"organization_id": current_user.organization_id}
    services = await db.services.find(query, {"_id": 0}).to_list(1000)
    for service in services:
        if isinstance(service['created_at'], str): service['created_at'] = datetime.fromisoformat(service['created_at'])
    return services

# === TRANSACTIONS ROUTES ===
@api_router.get("/transactions", response_model=List[Transaction])
async def get_transactions(request: Request, start_date: Optional[str] = None, end_date: Optional[str] = None, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin görebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"organization_id": current_user.organization_id}
    if start_date and end_date: query['date'] = {'$gte': start_date, '$lte': end_date}
    elif start_date: query['date'] = {'$gte': start_date}
    elif end_date: query['date'] = {'$lte': end_date}
    transactions = await db.transactions.find(query, {"_id": 0}).to_list(1000)
    for transaction in transactions:
        if isinstance(transaction['created_at'], str): transaction['created_at'] = datetime.fromisoformat(transaction['created_at'])
    return transactions

@api_router.put("/transactions/{transaction_id}", response_model=Transaction)
async def update_transaction(request: Request, transaction_id: str, transaction_update: TransactionUpdate, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"id": transaction_id, "organization_id": current_user.organization_id}
    transaction = await db.transactions.find_one(query, {"_id": 0})
    if not transaction: raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    await db.transactions.update_one(query, {"$set": {"amount": transaction_update.amount}})
    updated_transaction = await db.transactions.find_one(query, {"_id": 0})
    if isinstance(updated_transaction['created_at'], str): updated_transaction['created_at'] = datetime.fromisoformat(updated_transaction['created_at'])
    
    # Emit WebSocket event for real-time update
    logger.info(f"About to emit transaction_updated for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'transaction_updated',
            updated_transaction
        )
        logger.info(f"Successfully emitted transaction_updated for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit transaction_updated: {emit_error}", exc_info=True)
    
    return updated_transaction

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(request: Request, transaction_id: str, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"id": transaction_id, "organization_id": current_user.organization_id}
    result = await db.transactions.delete_one(query)
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    
    # Emit WebSocket event for real-time update
    logger.info(f"About to emit transaction_deleted for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'transaction_deleted',
            {'id': transaction_id}
        )
        logger.info(f"Successfully emitted transaction_deleted for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit transaction_deleted: {emit_error}", exc_info=True)
    
    return {"message": "İşlem silindi"}

# === DASHBOARD STATS ===
# === PLAN ENDPOINT'LERİ ===
@api_router.get("/plans")
async def get_plans():
    """Tüm planları getir (herkese açık)"""
    # İlk ay %25 indirimli fiyatları hesapla
    plans_with_discount = []
    for plan in PLANS:
        if plan['id'] == 'tier_trial':
            plans_with_discount.append(plan)
            continue
        plan_copy = plan.copy()
        plan_copy['price_monthly_original'] = plan['price_monthly']
        plan_copy['price_monthly_discounted'] = int(plan['price_monthly'] * 0.75)  # %25 indirim
        plan_copy['discount_percentage'] = 25
        plans_with_discount.append(plan_copy)
    return {"plans": plans_with_discount}

@api_router.get("/plan/current")
async def get_current_plan(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Mevcut plan bilgisini getir"""
    db = await get_db_from_request(request)
    plan_doc = await get_organization_plan(db, current_user.organization_id)
    if not plan_doc:
        raise HTTPException(status_code=404, detail="Plan bilgisi bulunamadı")
    
    plan_id = plan_doc.get('plan_id', 'tier_trial')
    plan_info = await get_plan_info(plan_id)
    if not plan_info:
        raise HTTPException(status_code=404, detail="Plan bilgisi geçersiz")
    
    # Datetime'ları string'e çevir
    result = {
        "plan_id": plan_id,
        "plan_name": plan_info.get('name'),
        "quota_usage": plan_doc.get('quota_usage', 0),
        "quota_limit": plan_info.get('quota_monthly_appointments', 50),
        "quota_reset_date": plan_doc.get('quota_reset_date').isoformat() if isinstance(plan_doc.get('quota_reset_date'), datetime) else plan_doc.get('quota_reset_date'),
        "is_first_month": plan_doc.get('is_first_month', False),
        "trial_start_date": plan_doc.get('trial_start_date').isoformat() if plan_doc.get('trial_start_date') and isinstance(plan_doc.get('trial_start_date'), datetime) else plan_doc.get('trial_start_date'),
        "trial_end_date": plan_doc.get('trial_end_date').isoformat() if plan_doc.get('trial_end_date') and isinstance(plan_doc.get('trial_end_date'), datetime) else plan_doc.get('trial_end_date'),
        "is_trial": plan_id == 'tier_trial'
    }
    
    # Trial kontrolü
    if plan_id == 'tier_trial':
        trial_end = plan_doc.get('trial_end_date')
        if isinstance(trial_end, str):
            trial_end = datetime.fromisoformat(trial_end.replace('Z', '+00:00'))
        if trial_end:
            result['trial_days_remaining'] = max(0, (trial_end - datetime.now(timezone.utc)).days)
    
    return result

@api_router.put("/plan/update")
async def update_plan(request: Request, plan_update: dict, current_user: UserInDB = Depends(get_current_user)):
    """Plan güncelle (şimdilik sadece plan_id değişikliği)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    new_plan_id = plan_update.get('plan_id')
    if not new_plan_id:
        raise HTTPException(status_code=400, detail="plan_id gerekli")
    
    plan_info = await get_plan_info(new_plan_id)
    if not plan_info:
        raise HTTPException(status_code=400, detail="Geçersiz plan_id")
    
    db = await get_db_from_request(request)
    
    # Mevcut plan bilgisini al
    plan_doc = await get_organization_plan(db, current_user.organization_id)
    
    # Yeni plana geç
    quota_reset = datetime.now(timezone.utc) + timedelta(days=30)
    is_first_month = plan_doc.get('is_first_month', True) if new_plan_id != 'tier_trial' else False
    
    update_data = {
        "plan_id": new_plan_id,
        "quota_usage": 0,  # Yeni plana geçince sıfırla
        "quota_reset_date": quota_reset.isoformat(),
        "is_first_month": is_first_month,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Trial paketine geçiliyorsa trial tarihlerini ayarla
    if new_plan_id == 'tier_trial':
        trial_start = datetime.now(timezone.utc)
        trial_end = trial_start + timedelta(days=7)
        update_data['trial_start_date'] = trial_start.isoformat()
        update_data['trial_end_date'] = trial_end.isoformat()
    else:
        # Trial'dan çıkıyorsa trial tarihlerini temizle
        update_data['trial_start_date'] = None
        update_data['trial_end_date'] = None
    
    await db.organization_plans.update_one(
        {"organization_id": current_user.organization_id},
        {"$set": update_data}
    )
    
    return {"message": "Plan güncellendi", "plan_id": new_plan_id}

@api_router.get("/stats/dashboard")
async def get_dashboard_stats(request: Request, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin görebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    logger.info(f"📊 Stats endpoint çağrıldı - Organization: {current_user.organization_id}")
    db = await get_db_from_request(request); turkey_tz = ZoneInfo("Europe/Istanbul"); today = datetime.now(turkey_tz).date().isoformat(); now = datetime.now(turkey_tz)
    logger.info(f"📅 Bugünün tarihi: {today}, Şu anki zaman: {now}")
    base_query = {"organization_id": current_user.organization_id}
    
    # ÖNCE: Bugünkü "Bekliyor" status'ündeki randevuları otomatik tamamla
    today_waiting_appointments = await db.appointments.find(
        {**base_query, "appointment_date": today, "status": "Bekliyor"},
        {"_id": 0, "id": 1, "appointment_date": 1, "appointment_time": 1, "service_price": 1, "customer_name": 1, "service_name": 1, "service_id": 1}
    ).to_list(1000)
    logger.info(f"⏳ Bugünkü 'Bekliyor' randevular: {len(today_waiting_appointments)}")
    
    # Servisleri çek (duration bilgisi için)
    service_ids = [appt.get('service_id') for appt in today_waiting_appointments if appt.get('service_id')]
    services_dict = {}
    if service_ids:
        services = await db.services.find(
            {"id": {"$in": list(set(service_ids))}, "organization_id": current_user.organization_id},
            {"_id": 0, "id": 1, "duration": 1}
        ).to_list(1000)
        services_dict = {s['id']: s.get('duration', 30) for s in services}
    
    ids_to_update = []
    transactions_to_create = []
    for appt in today_waiting_appointments:
        try:
            dt_str = f"{appt['appointment_date']} {appt['appointment_time']}"
            naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
            # Randevu bitiş saatini hesapla (başlangıç saati + hizmet süresi)
            service_duration_minutes = services_dict.get(appt.get('service_id'), 30)
            completion_threshold = appointment_dt + timedelta(minutes=service_duration_minutes)
            if now >= completion_threshold:
                ids_to_update.append(appt['id'])
                transaction = Transaction(
                    organization_id=current_user.organization_id,
                    appointment_id=appt['id'],
                    customer_name=appt['customer_name'],
                    service_name=appt['service_name'],
                    amount=appt.get('service_price', 0),
                    date=appt['appointment_date']
                )
                trans_doc = transaction.model_dump()
                trans_doc['created_at'] = trans_doc['created_at'].isoformat()
                transactions_to_create.append(trans_doc)
        except (ValueError, TypeError) as e:
            logging.warning(f"Randevu {appt['id']} için tarih ayrıştırılamadı: {e}")
    
    # Otomatik tamamlanan randevuları güncelle
    if ids_to_update:
        logger.info(f"✅ {len(ids_to_update)} randevu otomatik tamamlanacak")
        await db.appointments.update_many(
            {"organization_id": current_user.organization_id, "id": {"$in": ids_to_update}},
            {"$set": {"status": "Tamamlandı", "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
    # Otomatik tamamlanan randevular için transaction oluştur
    if transactions_to_create:
        logger.info(f"💰 {len(transactions_to_create)} transaction oluşturulacak")
        await db.transactions.insert_many(transactions_to_create)
    
    # ŞİMDİ: Güncel istatistikleri hesapla
    today_appointments = await db.appointments.count_documents({**base_query, "appointment_date": today})
    today_completed = await db.appointments.count_documents({**base_query, "appointment_date": today, "status": "Tamamlandı"})
    today_transactions = await db.transactions.find({**base_query, "date": today}, {"_id": 0}).to_list(1000)
    today_income = sum(t['amount'] for t in today_transactions)
    
    # Bugünkü tamamlanan randevuların toplam hizmet tutarı
    today_completed_appointments = await db.appointments.find(
        {**base_query, "appointment_date": today, "status": "Tamamlandı"},
        {"_id": 0, "service_price": 1, "id": 1, "appointment_time": 1}
    ).to_list(1000)
    # service_price değerlerini kontrol et
    for apt in today_completed_appointments:
        if apt.get('service_price') is None or apt.get('service_price') == 0:
            logger.warning(f"⚠️ Randevu {apt.get('id')} için service_price eksik veya 0: {apt.get('service_price')}")
    
    bugunku_toplam_hizmet_tutari = sum(apt.get('service_price', 0) or 0 for apt in today_completed_appointments)
    logger.info(f"📊 Bugünkü tamamlanan randevular: {len(today_completed_appointments)}, Toplam hizmet tutarı: {bugunku_toplam_hizmet_tutari}")
    if today_completed_appointments:
        logger.info(f"📋 Tamamlanan randevular (ilk 5): {[(apt.get('id')[:8] if apt.get('id') else 'N/A', apt.get('appointment_time'), apt.get('service_price')) for apt in today_completed_appointments[:5]]}")
    else:
        logger.warning(f"⚠️ Bugünkü tamamlanan randevu bulunamadı! Bugünkü tarih: {today}, Organization: {current_user.organization_id}")
    
    month_start = datetime.now(turkey_tz).date().replace(day=1).isoformat()
    month_transactions = await db.transactions.find({**base_query, "date": {"$gte": month_start}}, {"_id": 0}).to_list(1000)
    month_income = sum(t['amount'] for t in month_transactions)
    
    # Plan ve kota bilgisi
    plan_doc = await get_organization_plan(db, current_user.organization_id)
    quota_info = None
    if plan_doc:
        plan_id = plan_doc.get('plan_id', 'tier_trial')
        plan_info = await get_plan_info(plan_id)
        if plan_info:
            quota_usage = plan_doc.get('quota_usage', 0)
            quota_limit = plan_info.get('quota_monthly_appointments', 50)
            quota_remaining = max(0, quota_limit - quota_usage)
            quota_percentage = (quota_usage / quota_limit * 100) if quota_limit > 0 else 0
            
            quota_info = {
                "plan_id": plan_id,
                "plan_name": plan_info.get('name'),
                "quota_usage": quota_usage,
                "quota_limit": quota_limit,
                "quota_remaining": quota_remaining,
                "quota_percentage": round(quota_percentage, 2),
                "is_trial": plan_id == 'tier_trial',
                "is_low_quota": quota_percentage >= 90  # %90'dan fazla kullanıldıysa uyarı
            }
            
            # Trial bilgisi
            if plan_id == 'tier_trial':
                trial_end = plan_doc.get('trial_end_date')
                if isinstance(trial_end, str):
                    trial_end = datetime.fromisoformat(trial_end.replace('Z', '+00:00'))
                if trial_end:
                    quota_info['trial_days_remaining'] = max(0, (trial_end - datetime.now(timezone.utc)).days)
    
    return {
        "today_appointments": today_appointments, "today_completed": today_completed, "today_income": today_income, "bugunku_toplam_hizmet_tutari": bugunku_toplam_hizmet_tutari, "month_income": month_income,
        "quota": quota_info
    }

@api_router.get("/stats/personnel")
async def get_personnel_stats(request: Request, current_user: UserInDB = Depends(get_current_user)):
    # Sadece personel görebilir
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    logger.info(f"👤 Personel stats endpoint çağrıldı - Staff: {current_user.username}")
    db = await get_db_from_request(request)
    turkey_tz = ZoneInfo("Europe/Istanbul")
    today = datetime.now(turkey_tz).date().isoformat()
    now = datetime.now(turkey_tz)
    base_query = {"organization_id": current_user.organization_id}
    
    # ÖNCE: Bugünkü "Bekliyor" status'ündeki personelin randevularını otomatik tamamla
    today_waiting_appointments = await db.appointments.find(
        {**base_query, "appointment_date": today, "status": "Bekliyor", "staff_member_id": current_user.username},
        {"_id": 0, "id": 1, "appointment_date": 1, "appointment_time": 1, "service_price": 1, "customer_name": 1, "service_name": 1, "service_id": 1}
    ).to_list(1000)
    
    # Servisleri çek (duration bilgisi için)
    service_ids = [appt.get('service_id') for appt in today_waiting_appointments if appt.get('service_id')]
    services_dict = {}
    if service_ids:
        services = await db.services.find(
            {"id": {"$in": list(set(service_ids))}, "organization_id": current_user.organization_id},
            {"_id": 0, "id": 1, "duration": 1}
        ).to_list(1000)
        services_dict = {s['id']: s.get('duration', 30) for s in services}
    
    ids_to_update = []
    transactions_to_create = []
    for appt in today_waiting_appointments:
        try:
            dt_str = f"{appt['appointment_date']} {appt['appointment_time']}"
            naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
            # Randevu bitiş saatini hesapla (başlangıç saati + hizmet süresi)
            service_duration_minutes = services_dict.get(appt.get('service_id'), 30)
            completion_threshold = appointment_dt + timedelta(minutes=service_duration_minutes)
            if now >= completion_threshold:
                ids_to_update.append(appt['id'])
                transaction = Transaction(
                    organization_id=current_user.organization_id,
                    appointment_id=appt['id'],
                    customer_name=appt['customer_name'],
                    service_name=appt['service_name'],
                    amount=appt.get('service_price', 0),
                    date=appt['appointment_date']
                )
                trans_doc = transaction.model_dump()
                trans_doc['created_at'] = trans_doc['created_at'].isoformat()
                transactions_to_create.append(trans_doc)
        except (ValueError, TypeError) as e:
            logging.warning(f"Randevu {appt['id']} için tarih ayrıştırılamadı: {e}")
    
    # Otomatik tamamlanan randevuları güncelle
    if ids_to_update:
        logger.info(f"✅ Personel için {len(ids_to_update)} randevu otomatik tamamlanacak")
        await db.appointments.update_many(
            {"organization_id": current_user.organization_id, "id": {"$in": ids_to_update}},
            {"$set": {"status": "Tamamlandı", "completed_at": datetime.now(timezone.utc).isoformat()}}
        )
    # Otomatik tamamlanan randevular için transaction oluştur
    if transactions_to_create:
        await db.transactions.insert_many(transactions_to_create)
    
    # Personelin bugünkü tamamlanan randevularını bul
    today_completed_appointments = await db.appointments.find(
        {**base_query, "appointment_date": today, "status": "Tamamlandı", "staff_member_id": current_user.username},
        {"_id": 0, "service_price": 1, "id": 1}
    ).to_list(1000)
    
    # Toplam hizmet tutarı ve randevu sayısı
    total_revenue_generated = sum(apt.get('service_price', 0) or 0 for apt in today_completed_appointments)
    completed_appointments_count = len(today_completed_appointments)
    
    logger.info(f"👤 Personel {current_user.username}: {completed_appointments_count} tamamlanan randevu, Toplam: {total_revenue_generated} ₺")
    
    return {
        "total_revenue_generated": total_revenue_generated,
        "completed_appointments_count": completed_appointments_count
    }

# === SETTINGS ROUTES ===
@api_router.get("/settings", response_model=Settings)
async def get_settings(request: Request, current_user: UserInDB = Depends(get_current_user)):
    # Personel okuyabilir, ama sadece admin güncelleyebilir
    db = await get_db_from_request(request); query = {"organization_id": current_user.organization_id}
    settings = await db.settings.find_one(query, {"_id": 0})
    if not settings:
        default_settings = Settings(organization_id=current_user.organization_id); await db.settings.insert_one(default_settings.model_dump())
        return default_settings
    return Settings(**settings)

@api_router.put("/settings", response_model=Settings)
async def update_settings(request: Request, settings: Settings, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    query = {"organization_id": current_user.organization_id}
    
    # Mevcut ayarları al
    current_settings = await db.settings.find_one(query, {"_id": 0})
    
    update_data = settings.model_dump()
    update_data["organization_id"] = current_user.organization_id
    
    # Eğer company_name değiştiyse, yeni slug oluştur
    if current_settings and current_settings.get('company_name') != settings.company_name:
        # Yeni slug oluştur
        base_slug = slugify(settings.company_name)
        unique_slug = base_slug
        
        # Slug benzersizlik kontrolü
        slug_counter = 1
        while await db.users.find_one({"slug": unique_slug, "username": {"$ne": current_user.username}}):
            unique_slug = f"{base_slug}{str(uuid.uuid4())[:4]}"
            slug_counter += 1
            if slug_counter > 10:
                unique_slug = f"{base_slug}{str(uuid.uuid4())[:8]}"
                break
        
        # User'ın slug'ını güncelle
        await db.users.update_one(
            {"username": current_user.username},
            {"$set": {"slug": unique_slug}}
        )
        
        # Settings'e yeni slug'ı ekle
        update_data["slug"] = unique_slug
        
        logging.info(f"Company name changed. New slug: {unique_slug}")
    
    await db.settings.update_one(query, {"$set": update_data}, upsert=True)
    updated_settings = await db.settings.find_one(query, {"_id": 0})
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="UPDATE",
        resource_type="SETTINGS",
        resource_id=current_user.organization_id,
        old_value=current_settings,
        new_value=updated_settings,
        ip_address=request.client.host if request.client else None
    )
    
    return Settings(**updated_settings)

@api_router.post("/onboarding/complete")
async def complete_onboarding(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Onboarding sihirbazını tamamla"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Kullanıcının onboarding_completed flag'ini True yap
    await db.users.update_one(
        {"username": current_user.username},
        {"$set": {"onboarding_completed": True}}
    )
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="UPDATE",
        resource_type="USER",
        resource_id=current_user.username,
        old_value={"onboarding_completed": False},
        new_value={"onboarding_completed": True},
        ip_address=request.client.host if request.client else None
    )
    
    return {"message": "Onboarding tamamlandı", "onboarding_completed": True}

@api_router.post("/settings/logo")
async def upload_logo(request: Request, file: UploadFile = File(...), current_user: UserInDB = Depends(get_current_user)):
    """Logo upload endpoint"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    # File validation
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="Sadece resim dosyaları yüklenebilir")
    
    # File size check (2MB)
    file_content = await file.read()
    if len(file_content) > 2 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 2MB'dan büyük olamaz")
    
    # Save file to static directory
    static_dir = ROOT_DIR / "static" / "logos"
    static_dir.mkdir(parents=True, exist_ok=True)
    
    file_extension = file.filename.split('.')[-1]
    unique_filename = f"{current_user.organization_id}_{str(uuid.uuid4())[:8]}.{file_extension}"
    file_path = static_dir / unique_filename
    
    with open(file_path, "wb") as f:
        f.write(file_content)
    
    # Update settings with logo URL (with /api prefix for ingress routing)
    logo_url = f"/api/static/logos/{unique_filename}"
    
    db = await get_db_from_request(request)
    query = {"organization_id": current_user.organization_id}
    await db.settings.update_one(query, {"$set": {"logo_url": logo_url}}, upsert=True)
    
    return {"logo_url": logo_url, "message": "Logo başarıyla yüklendi"}

# === USERS/PERSONEL LİSTESİ (Model D) ===
@api_router.get("/users")
async def get_users(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Aynı organization'daki tüm kullanıcıları listele (şifreler hariç)"""
    db = await get_db_from_request(request)
    
    users = await db.users.find(
        {"organization_id": current_user.organization_id},
        {"_id": 0, "hashed_password": 0}  # Şifreleri gizle
    ).to_list(1000)
    
    return users

# === STAFF/PERSONEL YÖNETİMİ (Model D) ===
class PaymentUpdate(BaseModel):
    payment_type: str
    payment_amount: float

class StaffCreate(BaseModel):
    username: str
    password: Optional[str] = None  # Artık optional, e-posta daveti kullanılıyor
    full_name: Optional[str] = None  # Opsiyonel, e-posta'dan çıkarılabilir
    payment_type: Optional[str] = "salary"
    payment_amount: Optional[float] = 0.0

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    password: Optional[str] = None
    days_off: Optional[List[str]] = None

@api_router.post("/staff/add")
async def add_staff(request: Request, staff_data: StaffCreate, current_user: UserInDB = Depends(get_current_user)):
    """Admin, yeni personel ekleyebilir (E-posta daveti ile)"""
    # Sadece admin ekleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # payment_amount'u float'a çevir (eğer string ise)
    payment_amount = staff_data.payment_amount
    if payment_amount is not None:
        if isinstance(payment_amount, str):
            try:
                payment_amount = float(payment_amount)
            except (ValueError, TypeError):
                payment_amount = 0.0
        elif not isinstance(payment_amount, (int, float)):
            payment_amount = 0.0
    else:
        payment_amount = 0.0
    
    # Kullanıcı adı zaten var mı kontrol et
    existing = await db.users.find_one({"username": staff_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Invitation token oluştur
    invitation_token = str(uuid.uuid4())
    
    # İşletme adını al
    settings = await db.settings.find_one({"organization_id": current_user.organization_id})
    organization_name = settings.get("company_name", "İşletme") if settings else "İşletme"
    
    try:
        # Yeni personel oluştur (password olmadan, pending status ile)
        # Eğer full_name yoksa, email'den isim çıkar
        full_name = staff_data.full_name
        if not full_name:
            # Email'den isim çıkar (örn: john.doe@example.com -> John Doe)
            email_local = staff_data.username.split('@')[0]
            name_parts = email_local.split('.')
            if len(name_parts) > 1:
                full_name = ' '.join([part.capitalize() for part in name_parts])
            else:
                full_name = email_local.capitalize()
        
        new_user = UserInDB(
            username=staff_data.username,
            full_name=full_name,
            hashed_password=None,  # Şifre henüz belirlenmedi
            organization_id=current_user.organization_id,
            role="staff",  # Personel rolü
            slug=None,  # Personellerin slug'ı yok
            permitted_service_ids=[],  # Başlangıçta boş
            payment_type=staff_data.payment_type or "salary",
            payment_amount=payment_amount,
            status="pending",  # Bekliyor durumu
            invitation_token=invitation_token
        )
        
        user_dict = new_user.model_dump()
        # Personel için slug field'ını kaldır (MongoDB unique index hatası önlemek için)
        user_dict.pop('slug', None)
        # MongoDB'ye ekle
        await db.users.insert_one(user_dict)
        
        # E-posta daveti gönder
        invitation_link = f"https://dev.royalpremiumcare.com/setup-password?token={invitation_token}"
        email_sent = await send_personnel_invitation_email(
            user_email=staff_data.username,
            user_name=staff_data.full_name,
            organization_name=organization_name,
            invitation_link=invitation_link
        )
        
        if not email_sent:
            logging.warning(f"Personel eklendi ancak e-posta gönderilemedi: {staff_data.username}")
        
    except Exception as e:
        logging.error(f"Personel ekleme hatası: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Personel eklenirken bir hata oluştu: {str(e)}")
    
    return {"message": "Personel başarıyla eklendi ve davet e-postası gönderildi", "username": staff_data.username, "full_name": staff_data.full_name}

@api_router.put("/users/me")
async def update_current_user(request: Request, user_update: UserUpdate, current_user: UserInDB = Depends(get_current_user), db = Depends(get_db)):
    """Mevcut kullanıcının kendi bilgilerini güncelle"""
    try:
        update_data = {}
        
        if user_update.full_name is not None:
            update_data["full_name"] = user_update.full_name
        
        if user_update.password is not None:
            if len(user_update.password) < 6:
                raise HTTPException(status_code=400, detail="Şifre en az 6 karakter olmalıdır")
            update_data["hashed_password"] = get_password_hash(user_update.password)
        
        if user_update.days_off is not None:
            update_data["days_off"] = user_update.days_off
        
        if not update_data:
            raise HTTPException(status_code=400, detail="Güncellenecek alan belirtilmedi")
        
        await db.users.update_one(
            {"username": current_user.username, "organization_id": current_user.organization_id},
            {"$set": update_data}
        )
        
        # Audit log (hata olursa skip edilir)
        try:
            await create_audit_log(
                db=db,
                organization_id=current_user.organization_id,
                user_id=current_user.username,
                user_full_name=current_user.full_name or current_user.username,
                action="update",
                resource_type="user",
                resource_id=current_user.username,
                new_value={"updated_fields": list(update_data.keys())}
            )
        except Exception as audit_error:
            logger.warning(f"Audit log oluşturulamadı: {audit_error}")
        
        return {"message": "Profil bilgileri güncellendi"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Kullanıcı güncelleme hatası: {e}")
        raise HTTPException(status_code=500, detail="Profil güncellenirken hata oluştu")

@api_router.put("/staff/{staff_id}/payment")
async def update_staff_payment(request: Request, staff_id: str, payment_data: PaymentUpdate, current_user: UserInDB = Depends(get_current_user)):
    """Admin, personelin ödeme ayarlarını (maaş/prim) güncelleyebilir"""
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Personelin aynı organization'da olduğunu kontrol et
    staff = await db.users.find_one({"username": staff_id, "organization_id": current_user.organization_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Personel bulunamadı veya erişim yok")
    
    # payment_amount'u float'a çevir (eğer string ise)
    payment_amount = payment_data.payment_amount
    if payment_amount is not None:
        if isinstance(payment_amount, str):
            try:
                payment_amount = float(payment_amount)
            except (ValueError, TypeError):
                payment_amount = 0.0
        elif not isinstance(payment_amount, (int, float)):
            payment_amount = 0.0
    else:
        payment_amount = 0.0
    
    # Payment bilgilerini güncelle
    update_fields = {
        "payment_type": payment_data.payment_type,
        "payment_amount": payment_amount
    }
    
    # days_off varsa ekle
    if payment_data.days_off is not None:
        update_fields["days_off"] = payment_data.days_off
    
    await db.users.update_one(
        {"username": staff_id, "organization_id": current_user.organization_id},
        {"$set": update_fields}
    )
    
    logging.info(f"Personel ödeme ayarları güncellendi: {staff_id}, payment_type={payment_data.payment_type}, payment_amount={payment_amount}")
    
    return {"message": "Personel ödeme ayarları güncellendi", "staff_id": staff_id, "payment_type": payment_data.payment_type, "payment_amount": payment_amount}

@api_router.put("/staff/{staff_id}/days-off")
async def update_staff_days_off(request: Request, staff_id: str, days_off_data: dict, current_user: UserInDB = Depends(get_current_user)):
    """Admin, personelin tatil günlerini güncelleyebilir"""
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Personelin aynı organization'da olduğunu kontrol et
    staff = await db.users.find_one({"username": staff_id, "organization_id": current_user.organization_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Personel bulunamadı veya erişim yok")
    
    # days_off'u al
    days_off = days_off_data.get('days_off', [])
    if not isinstance(days_off, list):
        raise HTTPException(status_code=400, detail="days_off bir liste olmalıdır")
    
    # days_off'u güncelle
    await db.users.update_one(
        {"username": staff_id, "organization_id": current_user.organization_id},
        {"$set": {"days_off": days_off}}
    )
    
    logging.info(f"Personel tatil günleri güncellendi: {staff_id}, days_off={days_off}")
    
    return {"message": "Personel tatil günleri güncellendi", "staff_id": staff_id, "days_off": days_off}

@api_router.delete("/staff/{staff_id}")
async def delete_staff(request: Request, staff_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Admin, personel silebilir"""
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Personelin aynı organization'da olduğunu kontrol et
    staff = await db.users.find_one({"username": staff_id, "organization_id": current_user.organization_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Personel bulunamadı veya erişim yok")
    
    # Admin kendini silemez
    if staff.get("role") == "admin":
        raise HTTPException(status_code=400, detail="Admin kullanıcıları silinemez")
    
    # Personeli sil
    await db.users.delete_one({"username": staff_id, "organization_id": current_user.organization_id})
    
    return {"message": "Personel başarıyla silindi"}

@api_router.put("/staff/{staff_id}/services")
async def update_staff_services(request: Request, staff_id: str, service_ids: List[str], current_user: UserInDB = Depends(get_current_user)):
    """Admin, personelin verebileceği hizmetleri güncelleyebilir"""
    # Sadece admin güncelleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Personelin aynı organization'da olduğunu kontrol et
    staff = await db.users.find_one({"username": staff_id, "organization_id": current_user.organization_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Personel bulunamadı veya erişim yok")
    
    # Personelin permitted_service_ids'ini güncelle
    await db.users.update_one(
        {"username": staff_id, "organization_id": current_user.organization_id},
        {"$set": {"permitted_service_ids": service_ids}}
    )
    
    return {"message": "Personel hizmetleri güncellendi", "staff_id": staff_id, "permitted_service_ids": service_ids}

# === CUSTOMERS ROUTES ===
@api_router.get("/customers")
async def get_customers(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Tüm unique müşterileri listele (organization bazlı)"""
    db = await get_db_from_request(request)
    
    # Tüm randevuları çek
    appointments = await db.appointments.find(
        {"organization_id": current_user.organization_id},
        {"_id": 0}
    ).to_list(10000)
    
    # Unique müşterileri grupla
    customer_map = {}
    for apt in appointments:
        phone = apt.get('phone')
        if phone and phone not in customer_map:
            customer_map[phone] = {
                "name": apt.get('customer_name', ''),
                "phone": phone,
                "total_appointments": 0,
                "completed_appointments": 0
            }
        
        if phone:
            customer_map[phone]['total_appointments'] += 1
            if apt.get('status') == 'Tamamlandı':
                customer_map[phone]['completed_appointments'] += 1
    
    # Veritabanından kayıtlı müşterileri de ekle (randevusu olmayan müşteriler)
    try:
        db_customers = await db.customers.find(
            {"organization_id": current_user.organization_id},
            {"_id": 0}
        ).to_list(1000)
        
        for db_customer in db_customers:
            phone = db_customer.get('phone')
            if phone and phone not in customer_map:
                customer_map[phone] = {
                    "name": db_customer.get('name', ''),
                    "phone": phone,
                    "total_appointments": 0,
                    "completed_appointments": 0,
                    "is_pending": True  # Randevusu olmayan müşteri
                }
    except Exception as e:
        logging.warning(f"Error loading customers from database: {e}")
    
    # Liste olarak döndür
    customers = list(customer_map.values())
    customers.sort(key=lambda x: x['total_appointments'], reverse=True)
    
    return customers

class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, description="Müşteri adı")
    phone: str = Field(..., min_length=10, description="Telefon numarası")

@api_router.post("/customers")
async def create_customer(request: Request, customer_data: CustomerCreate, current_user: UserInDB = Depends(get_current_user)):
    """Yeni müşteri ekle (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    name = customer_data.name.strip()
    phone = customer_data.phone.strip()
    
    if not name or not phone:
        raise HTTPException(status_code=400, detail="Müşteri adı ve telefon numarası gereklidir")
    
    # Telefon numarasını normalize et
    clean_phone = re.sub(r'\D', '', phone)
    if len(clean_phone) < 10:
        raise HTTPException(status_code=400, detail="Geçerli bir telefon numarası girin")
    
    # Aynı telefon numarasına sahip müşteri var mı kontrol et (randevulardan ve customers collection'ından)
    existing_appointment = await db.appointments.find_one(
        {"organization_id": current_user.organization_id, "phone": phone},
        {"_id": 0, "id": 1}
    )
    
    if existing_appointment:
        raise HTTPException(status_code=400, detail="Bu telefon numarasına sahip bir müşteri zaten var")
    
    # customers collection'ında da kontrol et
    existing_customer = await db.customers.find_one(
        {"organization_id": current_user.organization_id, "phone": phone},
        {"_id": 0, "id": 1}
    )
    
    if existing_customer:
        raise HTTPException(status_code=400, detail="Bu telefon numarasına sahip bir müşteri zaten var")
    
    # Müşteriyi customers collection'ına kaydet (eğer collection yoksa otomatik oluşturulur)
    customer_doc = {
        "id": str(uuid.uuid4()),
        "organization_id": current_user.organization_id,
        "name": name,
        "phone": phone,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "notes": ""
    }
    
    # customers collection'ına kaydet
    await db.customers.insert_one(customer_doc)
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="CREATE",
        resource_type="CUSTOMER",
        resource_id=customer_doc["id"],
        new_value=customer_doc,
        ip_address=request.client.host if request.client else None
    )
    
    logging.info(f"New customer created: {name} ({phone}) for org {current_user.organization_id}")
    
    return {
        "id": customer_doc["id"],
        "name": name,
        "phone": phone,
        "message": "Müşteri başarıyla eklendi"
    }

@api_router.delete("/customers/{phone}")
async def delete_customer(request: Request, phone: str, current_user: UserInDB = Depends(get_current_user)):
    """Müşteriyi ve TÜM randevularını sil"""
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Önce customers collection'ından müşteriyi bul
    customer_query = {"phone": phone, "organization_id": current_user.organization_id}
    customer = await db.customers.find_one(customer_query, {"_id": 0})
    
    # Randevuları sil (varsa)
    appointment_query = {"phone": phone, "organization_id": current_user.organization_id}
    appointments_to_delete = await db.appointments.find(appointment_query, {"_id": 0}).to_list(1000)
    appointment_result = await db.appointments.delete_many(appointment_query)
    
    # Transaction'ları da sil (eğer varsa)
    transaction_result = await db.transactions.delete_many(appointment_query)
    
    # Customers collection'ından müşteriyi sil
    customer_result = await db.customers.delete_many(customer_query)
    
    # Eğer ne müşteri ne de randevu bulunamadıysa hata ver
    if customer_result.deleted_count == 0 and appointment_result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bu telefon numarasına ait müşteri veya randevu bulunamadı")
    
    # Audit log
    await create_audit_log(
        db=db,
        organization_id=current_user.organization_id,
        user_id=current_user.username,
        user_full_name=current_user.full_name or current_user.username,
        action="DELETE",
        resource_type="CUSTOMER",
        resource_id=phone,
        old_value={
            "phone": phone, 
            "customer_deleted": customer_result.deleted_count > 0,
            "appointments": appointments_to_delete, 
            "appointments_count": appointment_result.deleted_count,
            "transactions_count": transaction_result.deleted_count
        },
        ip_address=request.client.host if request.client else None
    )
    
    # Emit WebSocket event for real-time update
    logger.info(f"About to emit customer_deleted for org: {current_user.organization_id}")
    try:
        await emit_to_organization(
            current_user.organization_id,
            'customer_deleted',
            {
                'phone': phone, 
                'deleted_appointments': appointment_result.deleted_count,
                'deleted_customer': customer_result.deleted_count > 0
            }
        )
        logger.info(f"Successfully emitted customer_deleted for org: {current_user.organization_id}")
    except Exception as emit_error:
        logger.error(f"Failed to emit customer_deleted: {emit_error}", exc_info=True)
    
    # Mesaj oluştur
    messages = []
    if customer_result.deleted_count > 0:
        messages.append("Müşteri")
    if appointment_result.deleted_count > 0:
        messages.append(f"{appointment_result.deleted_count} randevu")
    if transaction_result.deleted_count > 0:
        messages.append(f"{transaction_result.deleted_count} işlem")
    
    message = " ve ".join(messages) + " silindi"
    
    return {
        "message": message,
        "deleted_customer": customer_result.deleted_count > 0,
        "deleted_appointments": appointment_result.deleted_count,
        "deleted_transactions": transaction_result.deleted_count
    }

# === AUDIT LOGS ROUTES ===
@api_router.get("/audit-logs", response_model=List[AuditLog])
async def get_audit_logs(
    request: Request,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user_id: Optional[str] = None,
    action: Optional[str] = None,
    resource_type: Optional[str] = None,
    current_user: UserInDB = Depends(get_current_user)
):
    """Denetim günlüklerini getir - Sadece admin"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    query = {"organization_id": current_user.organization_id}
    
    # Filters
    if user_id:
        query["user_id"] = user_id
    if action:
        query["action"] = action
    if resource_type:
        query["resource_type"] = resource_type
    if start_date or end_date:
        query["timestamp"] = {}
        if start_date:
            query["timestamp"]["$gte"] = start_date
        if end_date:
            query["timestamp"]["$lte"] = end_date
    
    # Get logs, sorted by timestamp descending
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)
    
    # Convert timestamp strings back to datetime
    for log in logs:
        if isinstance(log.get('timestamp'), str):
            log['timestamp'] = datetime.fromisoformat(log['timestamp'])
    
    return logs

@api_router.get("/export/appointments")
async def export_appointments(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Randevuları CSV formatında export et"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    appointments = await db.appointments.find(
        {"organization_id": current_user.organization_id},
        {"_id": 0}
    ).sort("appointment_date", -1).to_list(10000)
    
    # CSV formatında hazırla
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Randevu ID", "Müşteri Adı", "Telefon", "Tarih", "Saat",
        "Hizmet", "Personel", "Durum", "Fiyat", "Notlar", "Oluşturma Tarihi"
    ])
    
    # Data
    for apt in appointments:
        writer.writerow([
            apt.get('id', ''),
            apt.get('customer_name', ''),
            apt.get('phone', ''),
            apt.get('appointment_date', ''),
            apt.get('appointment_time', ''),
            apt.get('service_name', ''),
            apt.get('staff_member_name', 'Atanmadı'),
            apt.get('status', ''),
            apt.get('price', 0),
            apt.get('notes', ''),
            str(apt.get('created_at', ''))
        ])
    
    output.seek(0)
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=randevular.csv"}
    )

@api_router.get("/export/customers")
async def export_customers(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Müşterileri CSV formatında export et"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Tüm randevuları çek
    appointments = await db.appointments.find(
        {"organization_id": current_user.organization_id},
        {"_id": 0}
    ).to_list(10000)
    
    # Unique müşterileri grupla
    customer_map = {}
    for apt in appointments:
        phone = apt.get('phone')
        if phone and phone not in customer_map:
            customer_map[phone] = {
                "name": apt.get('customer_name', ''),
                "phone": phone,
                "total_appointments": 0,
                "completed_appointments": 0,
                "last_appointment_date": apt.get('appointment_date', '')
            }
        
        if phone:
            customer_map[phone]['total_appointments'] += 1
            if apt.get('status') == 'Tamamlandı':
                customer_map[phone]['completed_appointments'] += 1
            # En son randevu tarihini güncelle
            if apt.get('appointment_date', '') > customer_map[phone]['last_appointment_date']:
                customer_map[phone]['last_appointment_date'] = apt.get('appointment_date', '')
    
    # CSV formatında hazırla
    import csv
    import io
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Header
    writer.writerow([
        "Müşteri Adı", "Telefon", "Toplam Randevu",
        "Tamamlanan Randevu", "Son Randevu Tarihi"
    ])
    
    # Data
    customers = sorted(customer_map.values(), key=lambda x: x['total_appointments'], reverse=True)
    for customer in customers:
        writer.writerow([
            customer['name'],
            customer['phone'],
            customer['total_appointments'],
            customer['completed_appointments'],
            customer['last_appointment_date']
        ])
    
    output.seek(0)
    
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=musteriler.csv"}
    )

@api_router.get("/customers/{phone}/history")
async def get_customer_history(request: Request, phone: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"phone": phone, "organization_id": current_user.organization_id}
    appointments = await db.appointments.find(query, {"_id": 0}).sort("appointment_date", -1).to_list(1000)
    for appointment in appointments:
        if isinstance(appointment['created_at'], str): appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
    total_completed = len([a for a in appointments if a['status'] == 'Tamamlandı'])
    
    # Müşteri notlarını getir
    customer_note = await db.customer_notes.find_one(
        {"phone": phone, "organization_id": current_user.organization_id},
        {"_id": 0, "notes": 1}
    )
    notes = customer_note.get("notes", "") if customer_note else ""
    
    return {"phone": phone, "total_appointments": len(appointments), "completed_appointments": total_completed, "appointments": appointments, "notes": notes}

@api_router.put("/customers/{phone}/notes")
async def update_customer_notes(request: Request, phone: str, notes_data: dict, current_user: UserInDB = Depends(get_current_user)):
    """Müşteri notlarını güncelle (Admin ve Personel - sadece kendi müşterileri)"""
    db = await get_db_from_request(request)
    notes = notes_data.get("notes", "")
    
    # Personel için: Bu müşterinin kendisiyle randevusu var mı kontrol et
    if current_user.role == "staff":
        staff_appointments = await db.appointments.find_one(
            {"phone": phone, "organization_id": current_user.organization_id, "staff_member_id": current_user.username},
            {"_id": 1}
        )
        if not staff_appointments:
            raise HTTPException(status_code=403, detail="Bu müşteriye not ekleme yetkiniz yok")
    
    # Müşteri notlarını güncelle veya oluştur
    await db.customer_notes.update_one(
        {"phone": phone, "organization_id": current_user.organization_id},
        {"$set": {"notes": notes, "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    
    return {"message": "Notlar güncellendi", "notes": notes}

# === FINANCE & EXPENSES ROUTES ===
class ExpenseCreate(BaseModel):
    title: str
    amount: float
    category: str
    date: str

class ExpenseUpdate(BaseModel):
    title: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    date: Optional[str] = None

@api_router.get("/finance/summary")
async def get_finance_summary(request: Request, period: str = "this_month", current_user: UserInDB = Depends(get_current_user)):
    """Finans özeti: Gelir, Gider, Net Kâr (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Tarih aralığını hesapla
    from datetime import datetime, timedelta
    # UTC timezone kullan (tutarlılık için)
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    
    if period == "today":
        start_date = today_str
        end_date = today_str
    elif period == "this_month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
        # Bugünün tarihini dahil etmek için end_date'i bugün olarak ayarla
        # İleri tarihli expense'leri de dahil etmek için end_date'i bugünden sonraki bir tarih yap
        # Ama "this_month" için sadece bu ay içindeki expense'leri göster
        end_date = today_str
    elif period == "last_month":
        first_day_this_month = now.replace(day=1)
        last_day_last_month = first_day_this_month - timedelta(days=1)
        start_date = last_day_last_month.replace(day=1).strftime("%Y-%m-%d")
        end_date = last_day_last_month.strftime("%Y-%m-%d")
    else:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
        end_date = today_str
    
    logging.info(f"Finance summary - Date range calculation: period={period}, start_date={start_date}, end_date={end_date}, today={today_str}, now={now.strftime('%Y-%m-%d %H:%M:%S')}")
    
    # Toplam Gelir: Tamamlanan randevuların toplam hizmet bedeli
    completed_appointments = await db.appointments.find(
        {
            "organization_id": current_user.organization_id,
            "status": "Tamamlandı",
            "appointment_date": {"$gte": start_date, "$lte": end_date}
        },
        {"_id": 0, "service_price": 1}
    ).to_list(10000)
    
    total_revenue = sum(apt.get("service_price", 0) or 0 for apt in completed_appointments)
    
    # Toplam Gider: Expenses tablosundaki kayıtların toplamı
    # MongoDB sorgusu ile doğrudan filtreleme yapıyoruz (this_month için ay filtresi dahil)
    expense_query = {"organization_id": current_user.organization_id}
    
    # Tarih filtresini MongoDB sorgusuna ekle
    date_conditions = [{"date": {"$exists": True}}, {"date": {"$ne": ""}}]  # Sadece tarihi olan expense'leri al
    
    if period == "this_month":
        # Bu ay için: ayın ilk gününden son gününe kadar
        first_day_of_month = now.replace(day=1).strftime("%Y-%m-%d")
        # Ayın son gününü hesapla
        if now.month == 12:
            last_day_of_month = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            last_day_of_month = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
        last_day_str = last_day_of_month.strftime("%Y-%m-%d")
        date_conditions.append({"date": {"$gte": first_day_of_month, "$lte": last_day_str}})
        logging.info(f"Finance summary - this_month filter: {first_day_of_month} to {last_day_str}")
    elif period == "today":
        date_conditions.append({"date": {"$gte": start_date, "$lte": end_date}})
    elif period == "last_month":
        date_conditions.append({"date": {"$gte": start_date, "$lte": end_date}})
    else:
        # Varsayılan olarak bu ay
        first_day_of_month = now.replace(day=1).strftime("%Y-%m-%d")
        if now.month == 12:
            last_day_of_month = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            last_day_of_month = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
        last_day_str = last_day_of_month.strftime("%Y-%m-%d")
        date_conditions.append({"date": {"$gte": first_day_of_month, "$lte": last_day_str}})
    
    if len(date_conditions) > 0:
        expense_query["$and"] = date_conditions
    
    expenses = await db.expenses.find(
        expense_query,
        {"_id": 0, "amount": 1, "date": 1, "title": 1}
    ).to_list(10000)
    
    logging.info(f"Finance summary - period: {period}, start_date: {start_date}, end_date: {end_date}")
    logging.info(f"Finance summary - FILTERED expenses count: {len(expenses)}")
    for exp in expenses[:5]:  # İlk 5 filtrelenmiş expense'i logla
        logging.info(f"  FILTERED Expense: {exp.get('title')}, date: {exp.get('date')}, amount: {exp.get('amount')}")
    
    total_expenses = sum(float(exp.get("amount", 0) or 0) for exp in expenses)
    logging.info(f"Finance summary - total_expenses: {total_expenses}")
    
    # Net Kâr
    net_profit = total_revenue - total_expenses
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "total_revenue": total_revenue,
        "total_expenses": total_expenses,
        "net_profit": net_profit
    }

@api_router.get("/expenses")
async def get_expenses(request: Request, current_user: UserInDB = Depends(get_current_user)):
    """Giderleri listele (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    expenses = await db.expenses.find(
        {"organization_id": current_user.organization_id},
        {"_id": 0}
    ).sort("date", -1).to_list(1000)
    
    return expenses

@api_router.post("/expenses")
async def create_expense(request: Request, expense: ExpenseCreate, current_user: UserInDB = Depends(get_current_user)):
    """Yeni gider ekle (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    expense_data = {
        "id": str(uuid.uuid4()),
        "organization_id": current_user.organization_id,
        "title": expense.title,
        "amount": expense.amount,
        "category": expense.category,
        "date": expense.date,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    try:
        await db.expenses.insert_one(expense_data)
        logging.info(f"Gider başarıyla kaydedildi: {expense_data.get('title')}, tutar: {expense_data.get('amount')}")
    except Exception as insert_error:
        logging.error(f"Gider kaydetme hatası: {type(insert_error).__name__}: {str(insert_error)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Gider kaydedilirken bir hata oluştu: {str(insert_error)}")
    
    # Response için expense_data'yı temizle (MongoDB ObjectId gibi serialize edilemeyen alanları kaldır)
    response_expense = {
        "id": expense_data["id"],
        "organization_id": expense_data["organization_id"],
        "title": expense_data["title"],
        "amount": float(expense_data["amount"]),
        "category": expense_data["category"],
        "date": expense_data["date"],
        "created_at": expense_data["created_at"]
    }
    
    return {"message": "Gider eklendi", "expense": response_expense}

@api_router.put("/expenses/{expense_id}")
async def update_expense(request: Request, expense_id: str, expense_update: ExpenseUpdate, current_user: UserInDB = Depends(get_current_user)):
    """Gider güncelle (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    update_data = {}
    if expense_update.title is not None:
        update_data["title"] = expense_update.title
    if expense_update.amount is not None:
        update_data["amount"] = expense_update.amount
    if expense_update.category is not None:
        update_data["category"] = expense_update.category
    if expense_update.date is not None:
        update_data["date"] = expense_update.date
    
    result = await db.expenses.update_one(
        {"id": expense_id, "organization_id": current_user.organization_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    
    return {"message": "Gider güncellendi"}

@api_router.delete("/expenses/{expense_id}")
async def delete_expense(request: Request, expense_id: str, current_user: UserInDB = Depends(get_current_user)):
    """Gider sil (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    result = await db.expenses.delete_one(
        {"id": expense_id, "organization_id": current_user.organization_id}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Gider bulunamadı")
    
    return {"message": "Gider silindi"}

@api_router.get("/finance/payroll")
async def get_payroll(request: Request, period: str = "this_month", current_user: UserInDB = Depends(get_current_user)):
    """Personel hakedişlerini hesapla (Sadece admin)"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Tarih aralığını hesapla
    from datetime import datetime, timedelta
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    
    if period == "this_month":
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
        end_date = today_str
    elif period == "last_month":
        first_day_this_month = now.replace(day=1)
        last_day_last_month = first_day_this_month - timedelta(days=1)
        start_date = last_day_last_month.replace(day=1).strftime("%Y-%m-%d")
        end_date = last_day_last_month.strftime("%Y-%m-%d")
    else:
        start_date = now.replace(day=1).strftime("%Y-%m-%d")
        end_date = today_str
    
    logging.info(f"Payroll - period: {period}, start_date: {start_date}, end_date: {end_date}, today: {today_str}")
    
    # Tüm personelleri getir
    staff_members = await db.users.find(
        {"organization_id": current_user.organization_id, "role": "staff"},
        {"_id": 0, "username": 1, "full_name": 1, "payment_type": 1, "payment_amount": 1}
    ).to_list(1000)
    
    payroll_list = []
    
    for staff in staff_members:
        username = staff.get("username")
        full_name = staff.get("full_name") or username
        payment_type = staff.get("payment_type", "salary")
        payment_amount = staff.get("payment_amount", 0.0) or 0.0
        
        # Hakediş hesapla
        if payment_type == "salary":
            # Sabit maaş
            earned = float(payment_amount) if payment_amount else 0.0
        else:
            # Komisyon: Personelin o ay tamamladığı toplam ciro * (payment_amount / 100)
            completed_appointments = await db.appointments.find(
                {
                    "organization_id": current_user.organization_id,
                    "staff_member_id": username,
                    "status": "Tamamlandı",
                    "appointment_date": {"$gte": start_date, "$lte": end_date}
                },
                {"_id": 0, "service_price": 1}
            ).to_list(10000)
            
            total_revenue = sum(apt.get("service_price", 0) or 0 for apt in completed_appointments)
            commission_rate = float(payment_amount) if payment_amount else 0.0
            earned = total_revenue * (commission_rate / 100.0)
            
            # Debug logging
            logging.info(f"Payroll calculation for {username}: total_revenue={total_revenue}, commission_rate={commission_rate}%, earned={earned}")
        
        # Ödenen tutarı hesapla (Personel Ödemesi kategorisindeki giderler)
        # staff_username field'ı varsa direkt eşleştir, yoksa title'dan kontrol et
        # Tüm personel ödemelerini al (tarih filtresi olmadan) - debug için
        all_staff_payments = await db.expenses.find(
            {
                "organization_id": current_user.organization_id,
                "category": "Personel Ödemesi",
                "$or": [
                    {"staff_username": username},  # Yeni format: staff_username field'ı
                    {"title": {"$regex": username, "$options": "i"}},  # Eski format: title'da username
                    {"title": {"$regex": full_name, "$options": "i"}}  # Eski format: title'da isim
                ]
            },
            {"_id": 0, "amount": 1, "date": 1, "title": 1, "staff_username": 1}
        ).to_list(1000)
        
        logging.info(f"Payroll - {username}: Found {len(all_staff_payments)} total staff payments")
        for payment in all_staff_payments[:5]:
            logging.info(f"  Payment: {payment.get('title')}, date: {payment.get('date')}, amount: {payment.get('amount')}, staff_username: {payment.get('staff_username')}")
        
        # Tarih aralığına göre filtrele
        if period == "this_month":
            # Bu ay içindeki tüm ödemeleri dahil et (ay kontrolü)
            staff_payments = []
            for payment in all_staff_payments:
                payment_date = payment.get('date', '')
                if payment_date:
                    try:
                        payment_date_obj = datetime.strptime(payment_date, "%Y-%m-%d")
                        if payment_date_obj.year == now.year and payment_date_obj.month == now.month:
                            staff_payments.append(payment)
                            logging.info(f"  INCLUDED Payment: {payment.get('title')}, date: {payment_date}, amount: {payment.get('amount')}")
                        else:
                            logging.info(f"  EXCLUDED Payment (wrong month): {payment.get('title')}, date: {payment_date}")
                    except (ValueError, TypeError) as e:
                        logging.warning(f"  EXCLUDED Payment (invalid date): {payment.get('title')}, date: {payment_date}, error: {str(e)}")
        else:
            # Diğer period'lar için normal tarih aralığı kontrolü
            staff_payments = [p for p in all_staff_payments if p.get('date') and start_date <= p.get('date') <= end_date]
        
        logging.info(f"Payroll - {username}: Filtered {len(staff_payments)} payments for period {period}")
        
        paid = sum(float(payment.get("amount", 0) or 0) for payment in staff_payments)
        logging.info(f"Payroll - {username}: paid = {paid}")
        balance = earned - paid
        
        payroll_list.append({
            "username": username,
            "full_name": full_name,
            "payment_type": payment_type,
            "payment_amount": payment_amount,
            "earned": earned,
            "paid": paid,
            "balance": balance
        })
    
    return {
        "period": period,
        "start_date": start_date,
        "end_date": end_date,
        "payroll": payroll_list
    }

class PayrollPaymentRequest(BaseModel):
    staff_username: str
    amount: float
    date: Optional[str] = None

@api_router.post("/finance/payroll/payment")
async def make_payroll_payment(request: Request, payment_data: PayrollPaymentRequest, current_user: UserInDB = Depends(get_current_user)):
    """Personel ödemesi yap (Gider olarak kaydet) (Sadece admin)"""
    logging.info("=== PAYROLL PAYMENT ENDPOINT ÇAĞRILDI ===")
    try:
        logging.info(f"Request body: staff_username={payment_data.staff_username}, amount={payment_data.amount}, date={payment_data.date}")
        logging.info(f"Current user: {current_user.username if current_user else 'None'}, role: {current_user.role if current_user else 'None'}")
    except Exception as log_error:
        logging.error(f"Logging hatası: {type(log_error).__name__}: {str(log_error)}", exc_info=True)
    
    logging.info(f"Personel ödemesi isteği alındı: {payment_data.staff_username}, tutar: {payment_data.amount}")
    try:
        if current_user.role != "admin":
            logging.warning(f"Yetkisiz erişim denemesi: {current_user.username}")
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
        
        db = await get_db_from_request(request)
        logging.info(f"Database bağlantısı başarılı: {current_user.organization_id}")
        
        staff_username = payment_data.staff_username
        amount = float(payment_data.amount)  # Pydantic zaten float olarak validate ediyor ama emin olmak için
        date = payment_data.date or datetime.now().strftime("%Y-%m-%d")
        
        logging.info(f"Personel aranıyor: {staff_username}, organization: {current_user.organization_id}")
        
        # Personel bilgisini al
        staff = await db.users.find_one(
            {"username": staff_username, "organization_id": current_user.organization_id, "role": "staff"},
            {"_id": 0, "full_name": 1}
        )
        
        if not staff:
            logging.error(f"Personel bulunamadı: {staff_username}")
            raise HTTPException(status_code=404, detail="Personel bulunamadı")
        
        staff_name = staff.get("full_name") or staff_username
        logging.info(f"Personel bulundu: {staff_name}")
        
        # Gider olarak kaydet
        expense_data = {
            "id": str(uuid.uuid4()),
            "organization_id": current_user.organization_id,
            "title": f"{staff_name} - Personel Ödemesi",
            "amount": float(amount),
            "category": "Personel Ödemesi",
            "date": date,
            "staff_username": staff_username,  # Personel takibi için
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        logging.info(f"Expense data hazırlandı: {expense_data}")
        logging.info(f"Expenses collection'a kaydediliyor...")
        
        try:
            result = await db.expenses.insert_one(expense_data)
            logging.info(f"MongoDB insert result: inserted_id={result.inserted_id}")
        except Exception as insert_error:
            logging.error(f"Expenses collection'a yazma hatası: {type(insert_error).__name__}: {str(insert_error)}")
            raise
        
        logging.info(f"Personel ödemesi başarıyla kaydedildi: {staff_username}, tutar: {amount}, tarih: {date}")
        
        # Response için expense_data'yı temizle (MongoDB ObjectId gibi serialize edilemeyen alanları kaldır)
        response_expense = {
            "id": expense_data["id"],
            "organization_id": expense_data["organization_id"],
            "title": expense_data["title"],
            "amount": float(expense_data["amount"]),
            "category": expense_data["category"],
            "date": expense_data["date"],
            "staff_username": expense_data.get("staff_username"),
            "created_at": expense_data["created_at"]
        }
        
        try:
            response_data = {"message": "Ödeme kaydedildi", "expense": response_expense}
            logging.info(f"Response hazırlandı: {response_data}")
            return response_data
        except Exception as response_error:
            logging.error(f"Response oluşturma hatası: {type(response_error).__name__}: {str(response_error)}", exc_info=True)
            # Yine de başarılı response dön
            return {"message": "Ödeme kaydedildi", "expense_id": expense_data.get("id")}
    except HTTPException as e:
        logging.error(f"HTTPException: {e.status_code} - {e.detail}")
        raise
    except Exception as e:
        error_type = type(e).__name__
        error_message = str(e)
        import traceback
        full_traceback = traceback.format_exc()
        logging.error(f"Personel ödemesi kaydetme hatası: {error_type}: {error_message}")
        logging.error(f"Full traceback:\n{full_traceback}")
        raise HTTPException(status_code=500, detail=f"Ödeme kaydedilirken bir hata oluştu: {error_message}")

# === PUBLIC API ROUTES (TOKEN GEREKTİRMEZ) ===
@api_router.get("/public/business/{slug}")
async def get_public_business(request: Request, slug: str):
    """Slug ile işletme bilgilerini, hizmetlerini, personellerini ve ayarlarını getir (Model D)"""
    db = await get_db_from_request(request)
    
    # İlk önce user'dan slug'ı bul (admin kullanıcısı)
    admin_user = await db.users.find_one({"slug": slug}, {"_id": 0})
    if not admin_user:
        raise HTTPException(status_code=404, detail="İşletme bulunamadı")
    
    organization_id = admin_user.get('organization_id')
    
    # Hizmetleri çek
    services = await db.services.find({"organization_id": organization_id}, {"_id": 0}).to_list(1000)
    
    # Ayarları çek
    settings = await db.settings.find_one({"organization_id": organization_id}, {"_id": 0})
    if not settings:
        # Varsayılan ayarlar
        settings = {
            "customer_can_choose_staff": False,
            "work_start_hour": 9,
            "work_end_hour": 18,
            "appointment_interval": 30,
            "company_name": admin_user.get('full_name', 'İşletme'),
            "admin_provides_service": True,
            "show_service_duration_on_public": True,
            "show_service_price_on_public": True
        }
    else:
        # Yeni alanlar yoksa varsayılan değerleri ekle
        if "show_service_duration_on_public" not in settings:
            settings["show_service_duration_on_public"] = True
        if "show_service_price_on_public" not in settings:
            settings["show_service_price_on_public"] = True
    
    # Tüm personelleri çek (SADECE gerekli alanlar - ŞİFRELER HARİÇ!)
    staff_members = await db.users.find(
        {"organization_id": organization_id}, 
        {"_id": 0, "full_name": 1, "id": 1, "permitted_service_ids": 1, "username": 1, "role": 1}
    ).to_list(1000)
    
    # Admin hizmet vermiyorsa admin'i listeden çıkar
    if not settings.get('admin_provides_service', True):
        staff_members = [staff for staff in staff_members if staff.get('role') != 'admin']
    
    return {
        "business_name": settings.get('company_name', admin_user.get('full_name', 'İşletme')),
        "logo_url": settings.get('logo_url'),
        "organization_id": organization_id,
        "services": services,
        "staff_members": staff_members,
        "settings": {
            "customer_can_choose_staff": settings.get('customer_can_choose_staff', False),
            "work_start_hour": settings.get('work_start_hour', 9),
            "work_end_hour": settings.get('work_end_hour', 18),
            "appointment_interval": settings.get('appointment_interval', 30),
            "show_service_duration_on_public": settings.get('show_service_duration_on_public', True),
            "show_service_price_on_public": settings.get('show_service_price_on_public', True)
        }
    }

@api_router.get("/public/availability/{organization_id}")
async def get_availability(request: Request, organization_id: str, service_id: str, date: str, staff_id: Optional[str] = None):
    """Model D: Personel bazlı akıllı müsaitlik kontrolü - business_hours ve days_off kullanır"""
    db = await get_db_from_request(request)
    
    # Ayarları al (admin_provides_service ve business_hours için)
    settings = await db.settings.find_one({"organization_id": organization_id}, {"_id": 0})
    if not settings:
        settings = {
            "work_start_hour": 9, 
            "work_end_hour": 18, 
            "appointment_interval": 30, 
            "admin_provides_service": True,
            "business_hours": {
                "monday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
                "tuesday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
                "wednesday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
                "thursday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
                "friday": {"is_open": True, "open_time": "09:00", "close_time": "18:00"},
                "saturday": {"is_open": False, "open_time": "09:00", "close_time": "18:00"},
                "sunday": {"is_open": False, "open_time": "09:00", "close_time": "18:00"}
            }
        }
    
    admin_provides_service = settings.get('admin_provides_service', True)
    business_hours = settings.get('business_hours', {})
    
    # Tarihin hangi güne denk geldiğini bul (0=Monday, 6=Sunday)
    try:
        date_obj = datetime.strptime(date, "%Y-%m-%d")
        weekday = date_obj.weekday()  # 0=Monday, 6=Sunday
        day_names = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        day_name = day_names[weekday]
    except (ValueError, TypeError):
        day_name = "monday"  # Varsayılan
    
    # Eğer müşteri belirli bir personel seçtiyse, sadece o personele bak
    selected_staff = None
    if staff_id:
        staff_query = {
            "organization_id": organization_id,
            "username": staff_id,
            "permitted_service_ids": {"$in": [service_id]}
        }
        
        # Admin'in "hizmet verir" ayarı kapalıysa, admin'i personel listesinden çıkar
        if not admin_provides_service:
            staff_query["role"] = {"$ne": "admin"}
        
        staff_members = await db.users.find(
            staff_query,
            {"_id": 0, "id": 1, "username": 1, "role": 1, "days_off": 1}
        ).to_list(1000)
        
        if not staff_members:
            return {"available_slots": [], "message": "Seçilen personel bu hizmeti veremiyor"}
        
        selected_staff = staff_members[0]
        
        # Personelin days_off kontrolü
        staff_days_off = selected_staff.get('days_off', ["sunday"])
        if day_name in staff_days_off:
            # Personel bu gün izinli, müsaitlik yok
            logging.info(f"Staff {staff_id} is off on {day_name}")
            return {
                "available_slots": [],
                "all_slots": [],
                "busy_slots": [],
                "message": "Seçili personel bu gün izinli"
            }
    else:
        # O hizmeti verebilen TÜM personelleri bul (Array içinde arama)
        staff_query = {
            "organization_id": organization_id,
            "permitted_service_ids": {"$in": [service_id]}
        }
        
        # Admin'in "hizmet verir" ayarı kapalıysa, admin'i personel listesinden çıkar
        if not admin_provides_service:
            staff_query["role"] = {"$ne": "admin"}
        
        staff_members = await db.users.find(
            staff_query,
            {"_id": 0, "id": 1, "username": 1, "role": 1, "days_off": 1}
        ).to_list(1000)
        
        if not staff_members:
            # Hiç personel yoksa veya hiçbiri bu hizmeti vermiyorsa boş dön
            return {"available_slots": [], "message": "Bu hizmet için uygun personel bulunamadı"}
        
        # Tüm personellerin bu gün izinli olup olmadığını kontrol et
        all_staff_off = all(
            day_name in (staff.get('days_off', ["sunday"]) or ["sunday"])
            for staff in staff_members
        )
        if all_staff_off:
            logging.info(f"All staff are off on {day_name}")
            return {
                "available_slots": [],
                "all_slots": [],
                "busy_slots": [],
                "message": "Tüm personeller bu gün izinli"
            }
    
    # business_hours'dan o günün saatlerini al
    day_hours = business_hours.get(day_name, {})
    if not day_hours.get('is_open', True):
        # İşletme bu gün kapalı
        logging.info(f"Business is closed on {day_name}")
        return {
            "available_slots": [],
            "all_slots": [],
            "busy_slots": [],
            "message": "İşletme bu gün kapalı"
        }
    
    # Açılış ve kapanış saatlerini parse et
    open_time_str = day_hours.get('open_time', '09:00')
    close_time_str = day_hours.get('close_time', '18:00')
    
    try:
        open_hour, open_minute = map(int, open_time_str.split(':'))
        close_hour, close_minute = map(int, close_time_str.split(':'))
    except (ValueError, AttributeError):
        # Varsayılan saatler
        open_hour, open_minute = 9, 0
        close_hour, close_minute = 18, 0
    
    # Hizmet süresini al
    service = await db.services.find_one({"id": service_id}, {"_id": 0, "duration": 1})
    if not service:
        return {"available_slots": [], "all_slots": [], "busy_slots": [], "message": "Hizmet bulunamadı"}
    
    service_duration = service.get('duration', 30)  # Dakika cinsinden
    
    # KRİTİK: Personel aynı anda sadece 1 müşteriye hizmet verebilir
    # O hizmeti verebilen personellerin o tarihteki TÜM randevularını çek (hangi hizmet olursa olsun)
    staff_ids = [staff['username'] for staff in staff_members]
    
    # Personellerin o gün için TÜM randevularını al (tüm hizmetler dahil) - başlangıç ve bitiş saatleriyle
    all_staff_appointments = await db.appointments.find(
        {
            "organization_id": organization_id,
            "appointment_date": date,
            "status": {"$ne": "İptal"},
            "staff_member_id": {"$in": staff_ids}
        },
        {"_id": 0, "appointment_time": 1, "staff_member_id": 1, "service_name": 1, "service_id": 1}
    ).to_list(1000)
    
    logging.info(f"📋 Found {len(all_staff_appointments)} appointments for staff_ids: {staff_ids}")
    if len(all_staff_appointments) > 0:
        for appt in all_staff_appointments[:5]:  # İlk 5 randevuyu logla
            logging.info(f"   - {appt.get('appointment_time')} - Staff: {appt.get('staff_member_id')} - Service: {appt.get('service_id')}")
    else:
        logging.info(f"   ⚠️ No appointments found for date {date} and staff_ids {staff_ids}")
        # Tüm randevuları kontrol et (debug için)
        all_appts_debug = await db.appointments.find(
            {
                "organization_id": organization_id,
                "appointment_date": date,
                "status": {"$ne": "İptal"}
            },
            {"_id": 0, "appointment_time": 1, "staff_member_id": 1, "service_id": 1}
        ).to_list(10)
        logging.info(f"   🔍 Debug: Total appointments for date {date} (all staff): {len(all_appts_debug)}")
        for appt_debug in all_appts_debug:
            logging.info(f"      - {appt_debug.get('appointment_time')} - Staff: {appt_debug.get('staff_member_id')} - Service: {appt_debug.get('service_id')}")
    
    # Her randevunun bitiş saatini hesapla (hizmet süresine göre)
    appointments_with_end_time = []
    for appt in all_staff_appointments:
        appt_service_id = appt.get('service_id')
        if appt_service_id:
            appt_service = await db.services.find_one({"id": appt_service_id}, {"_id": 0, "duration": 1})
            appt_duration = appt_service.get('duration', 30) if appt_service else 30
        else:
            appt_duration = 30  # Varsayılan
        
        start_time_str = appt['appointment_time']
        start_hour, start_minute = map(int, start_time_str.split(':'))
        end_minute = start_minute + appt_duration
        end_hour = start_hour + (end_minute // 60)
        end_minute = end_minute % 60
        end_time_str = f"{str(end_hour).zfill(2)}:{str(end_minute).zfill(2)}"
        
        appointments_with_end_time.append({
            "start_time": start_time_str,
            "end_time": end_time_str,
            "staff_member_id": appt['staff_member_id']
        })
    
    # Gizli adım aralığı (15 dakika)
    STEP_INTERVAL = 15  # Dakika
    
    # Bugünün saatini al (geçmiş saat kontrolü için)
    now = datetime.now(timezone.utc)
    turkey_tz = timezone(timedelta(hours=3))
    now_turkey = now.astimezone(turkey_tz)
    is_today = date == now_turkey.strftime("%Y-%m-%d")
    current_hour_now = now_turkey.hour
    current_minute_now = now_turkey.minute
    
    # Potansiyel slotları oluştur (15 dakikalık adımlarla)
    potential_slots = []
    current_hour = open_hour
    current_minute = open_minute
    
    while True:
        # Kapanış saatine ulaştık mı kontrol et
        if current_hour > close_hour or (current_hour == close_hour and current_minute >= close_minute):
            break
        
        time_str = f"{str(current_hour).zfill(2)}:{str(current_minute).zfill(2)}"
        potential_slots.append(time_str)
        
        # 15 dakika ilerle
        current_minute += STEP_INTERVAL
        if current_minute >= 60:
            current_minute = current_minute % 60
            current_hour += 1
    
    # Müsait saatleri hesapla
    final_available_slots = []
    busy_slots = []
    
    for potential_start_time in potential_slots:
        # Bitiş saatini hesapla
        start_hour, start_minute = map(int, potential_start_time.split(':'))
        end_minute = start_minute + service_duration
        end_hour = start_hour + (end_minute // 60)
        end_minute = end_minute % 60
        potential_end_time = f"{str(end_hour).zfill(2)}:{str(end_minute).zfill(2)}"
        
        # Geçmiş saat kontrolü
        if is_today:
            if start_hour < current_hour_now or (start_hour == current_hour_now and start_minute < current_minute_now):
                # Geçmiş saat - busy slot olarak işaretle (gösterilecek ama seçilemeyecek)
                busy_slots.append(potential_start_time)
                continue  # Bu slotu atla
        
        # Genel saat kontrolü (bitiş saati kapanış saatini aşıyor mu?)
        if end_hour > close_hour or (end_hour == close_hour and end_minute > close_minute):
            continue  # Bu slotu atla
        
        # Randevu çakışma kontrolü
        if staff_id:
            # Belirli bir personel seçildi - sadece onun randevularını kontrol et
            has_conflict = False
            for appt in appointments_with_end_time:
                if appt['staff_member_id'] != staff_id:
                    continue
                
                appt_start = appt['start_time']
                appt_end = appt['end_time']
                
                # Çakışma kontrolü
                if (potential_start_time < appt_end and potential_end_time > appt_start):
                    has_conflict = True
                    logging.debug(f"   ⚠️ Conflict: Slot {potential_start_time}-{potential_end_time} overlaps with {appt_start}-{appt_end} (Staff: {staff_id})")
                    break
            
            if has_conflict:
                # Seçili personel için busy slot
                busy_slots.append(potential_start_time)
                continue
            else:
                # Seçili personel için müsait
                final_available_slots.append(potential_start_time)
        else:
            # Otomatik atama - Tüm personeller için kontrol et
            # En az bir personel müsait olmalı
            busy_staff_at_slot = []
            for appt in appointments_with_end_time:
                appt_start = appt['start_time']
                appt_end = appt['end_time']
                
                # Bu personel bu slotta dolu mu?
                if (potential_start_time < appt_end and potential_end_time > appt_start):
                    busy_staff_at_slot.append(appt['staff_member_id'])
            
            busy_staff_unique = list(set(busy_staff_at_slot))
            
            # Eğer tüm personeller doluysa busy slot
            if len(busy_staff_unique) >= len(staff_members):
                busy_slots.append(potential_start_time)
                logging.debug(f"   🚫 All staff busy at {potential_start_time}-{potential_end_time}")
            else:
                # En az bir personel müsait - slot müsait
                final_available_slots.append(potential_start_time)
                available_count = len(staff_members) - len(busy_staff_unique)
                logging.debug(f"   ✅ Available slot: {potential_start_time}-{potential_end_time} ({available_count}/{len(staff_members)} staff available)")
    
    logging.info(f"🔍 Service: {service_id}, Date: {date}, Duration: {service_duration}min")
    logging.info(f"👥 Qualified staff: {len(staff_members)} - {staff_ids}")
    logging.info(f"📅 Total appointments: {len(appointments_with_end_time)}")
    logging.info(f"✅ Available slots: {len(final_available_slots)}")
    logging.info(f"🚫 Busy slots: {len(busy_slots)}")
    
    # Tüm saatleri de döndür (frontend'de dolu saatleri göstermek için)
    # busy_slots: Dolu saatler (tüm personeller dolu VEYA seçili personel dolu) - kırmızı çizgi gösterilecek
    return {
        "available_slots": final_available_slots,
        "all_slots": potential_slots,
        "busy_slots": busy_slots  # Dolu saatler (kırmızı çizgi gösterilecek)
    }

@api_router.post("/public/appointments")
async def create_public_appointment(request: Request, appointment: AppointmentCreate, organization_id: str):
    """Model D: Public randevu oluştur - Akıllı personel atama"""
    db = await get_db_from_request(request)
    
    # DEBUG: Frontend'ten gelen veriyi logla
    logging.info(f"🔍 PUBLIC APPOINTMENT REQUEST - staff_member_id: {appointment.staff_member_id}, service_id: {appointment.service_id}")
    
    # KOTA KONTROLÜ - Randevu oluşturmadan önce kontrol et
    quota_ok, quota_error = await check_quota_and_increment(db, organization_id)
    if not quota_ok:
        raise HTTPException(status_code=403, detail=quota_error)
    
    # Service'i bul
    service = await db.services.find_one({"id": appointment.service_id}, {"_id": 0})
    if not service:
        # Kota artırıldı ama hizmet bulunamadı, geri al
        plan_doc = await db.organization_plans.find_one({"organization_id": organization_id})
        if plan_doc:
            await db.organization_plans.update_one(
                {"organization_id": organization_id},
                {"$inc": {"quota_usage": -1}}
            )
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    
    assigned_staff_id = None
    
    # AKILLI ATAMA MANTIĞI
    service_duration = service.get('duration', 30)
    
    # Yeni randevunun başlangıç ve bitiş saatlerini hesapla
    new_start_hour, new_start_minute = map(int, appointment.appointment_time.split(':'))
    new_end_minute = new_start_minute + service_duration
    new_end_hour = new_start_hour + (new_end_minute // 60)
    new_end_minute = new_end_minute % 60
    new_end_time = f"{str(new_end_hour).zfill(2)}:{str(new_end_minute).zfill(2)}"
    
    if appointment.staff_member_id:
        # Müşteri belirli bir personel seçti - çakışma kontrolü yap (duration'a göre)
        # Bu personelin o tarihteki tüm randevularını çek
        existing_appointments = await db.appointments.find(
            {
                "organization_id": organization_id,
                "staff_member_id": appointment.staff_member_id,
                "appointment_date": appointment.appointment_date,
                "status": {"$ne": "İptal"}
            },
            {"_id": 0, "appointment_time": 1, "service_id": 1}
        ).to_list(100)
        
        # Her randevunun bitiş saatini hesapla ve çakışma kontrolü yap
        has_conflict = False
        for existing_appt in existing_appointments:
            existing_start_time = existing_appt['appointment_time']
            existing_service_id = existing_appt.get('service_id')
            
            # Mevcut randevunun hizmet süresini bul
            if existing_service_id:
                existing_service = await db.services.find_one({"id": existing_service_id}, {"_id": 0, "duration": 1})
                existing_duration = existing_service.get('duration', 30) if existing_service else 30
            else:
                existing_duration = 30
            
            # Mevcut randevunun bitiş saatini hesapla
            existing_start_hour, existing_start_minute = map(int, existing_start_time.split(':'))
            existing_end_minute = existing_start_minute + existing_duration
            existing_end_hour = existing_start_hour + (existing_end_minute // 60)
            existing_end_minute = existing_end_minute % 60
            existing_end_time = f"{str(existing_end_hour).zfill(2)}:{str(existing_end_minute).zfill(2)}"
            
            # Çakışma kontrolü
            if (appointment.appointment_time < existing_end_time and new_end_time > existing_start_time):
                has_conflict = True
                logging.info(f"⚠️ Public booking conflict: New {appointment.appointment_time}-{new_end_time} overlaps with existing {existing_start_time}-{existing_end_time}")
                break
        
        if has_conflict:
            # Kota artırıldı ama personel dolu, geri al
            plan_doc = await db.organization_plans.find_one({"organization_id": organization_id})
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": organization_id},
                    {"$inc": {"quota_usage": -1}}
                )
            raise HTTPException(
                status_code=400,
                detail="Seçtiğiniz personel bu saatte dolu. Lütfen başka bir saat veya personel seçin."
            )
        assigned_staff_id = appointment.staff_member_id
    else:
        # Müşteri "Farketmez" seçti veya personel seçimi yok
        # Önce customer_can_choose_staff ayarını kontrol et
        settings_data = await db.settings.find_one({"organization_id": organization_id})
        customer_can_choose_staff = settings_data.get('customer_can_choose_staff', False) if settings_data else False
        
        # Eğer customer_can_choose_staff kapalıysa, personel atama yapma
        if not customer_can_choose_staff:
            logging.info(f"ℹ️ customer_can_choose_staff is disabled, skipping staff assignment")
            assigned_staff_id = None
        else:
            # customer_can_choose_staff açıksa, otomatik atama yap
            admin_provides_service = settings_data.get('admin_provides_service', True) if settings_data else True
            
            # Bu hizmeti verebilen personelleri bul
            qualified_staff_query = {
                "organization_id": organization_id,
                "permitted_service_ids": {"$in": [appointment.service_id]}
            }
            
            # Admin hizmet vermiyorsa, admin'i listeden çıkar
            if not admin_provides_service:
                qualified_staff_query["role"] = {"$ne": "admin"}
            
            qualified_staff = await db.users.find(
                qualified_staff_query,
                {"_id": 0, "username": 1, "role": 1}
            ).to_list(1000)
            
            if not qualified_staff:
                raise HTTPException(
                    status_code=400,
                    detail="Bu hizmet için uygun personel bulunamadı"
                )
            
            # Boş personel bul (duration'a göre çakışma kontrolü ile)
            for staff in qualified_staff:
                # Bu personelin o tarihteki tüm randevularını çek
                existing_appointments = await db.appointments.find(
                    {
                        "organization_id": organization_id,
                        "staff_member_id": staff['username'],
                        "appointment_date": appointment.appointment_date,
                        "status": {"$ne": "İptal"}
                    },
                    {"_id": 0, "appointment_time": 1, "service_id": 1}
                ).to_list(100)
                
                # Çakışma kontrolü
                has_conflict = False
                for existing_appt in existing_appointments:
                    existing_start_time = existing_appt['appointment_time']
                    existing_service_id = existing_appt.get('service_id')
                    
                    # Mevcut randevunun hizmet süresini bul
                    if existing_service_id:
                        existing_service = await db.services.find_one({"id": existing_service_id}, {"_id": 0, "duration": 1})
                        existing_duration = existing_service.get('duration', 30) if existing_service else 30
                    else:
                        existing_duration = 30
                    
                    # Mevcut randevunun bitiş saatini hesapla
                    existing_start_hour, existing_start_minute = map(int, existing_start_time.split(':'))
                    existing_end_minute = existing_start_minute + existing_duration
                    existing_end_hour = existing_start_hour + (existing_end_minute // 60)
                    existing_end_minute = existing_end_minute % 60
                    existing_end_time = f"{str(existing_end_hour).zfill(2)}:{str(existing_end_minute).zfill(2)}"
                    
                    # Çakışma kontrolü
                    if (appointment.appointment_time < existing_end_time and new_end_time > existing_start_time):
                        has_conflict = True
                        logging.debug(f"   ⚠️ Public: Staff {staff['username']} has conflict: {appointment.appointment_time}-{new_end_time} overlaps with {existing_start_time}-{existing_end_time}")
                        break
                
                if not has_conflict:
                    # Bu personel boş!
                    assigned_staff_id = staff['username']
                    logging.info(f"✅ Public booking auto-assigned to {staff['username']} for {appointment.appointment_time}")
                    break
            
            if not assigned_staff_id:
                # Kota artırıldı ama personel bulunamadı, geri al
                plan_doc = await db.organization_plans.find_one({"organization_id": organization_id})
                if plan_doc:
                    await db.organization_plans.update_one(
                        {"organization_id": organization_id},
                        {"$inc": {"quota_usage": -1}}
                    )
                raise HTTPException(
                    status_code=400,
                    detail="Bu saat dilimi doludur. Lütfen başka bir saat seçin."
                )
    
    # Randevuyu oluştur
    appointment_data = appointment.model_dump()
    appointment_data['service_name'] = service['name']
    appointment_data['service_price'] = service['price']
    appointment_data['service_duration'] = service.get('duration', 30)  # Hizmet süresini ekle
    appointment_data['staff_member_id'] = assigned_staff_id
    
    # Randevu durumunu kontrol et (bitiş saatine göre)
    try:
        turkey_tz = ZoneInfo("Europe/Istanbul")
        now = datetime.now(turkey_tz)
        dt_str = f"{appointment.appointment_date} {appointment.appointment_time}"
        naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
        appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
        # Randevu bitiş saatini hesapla (başlangıç saati + hizmet süresi)
        service_duration_minutes = service.get('duration', 30)
        completion_threshold = appointment_dt + timedelta(minutes=service_duration_minutes)
        if now >= completion_threshold:
            appointment_data['status'] = 'Tamamlandı'
            appointment_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        else:
            appointment_data['status'] = 'Bekliyor'
    except (ValueError, TypeError) as e:
        logging.warning(f"Public randevu durumu ayarlanırken tarih hatası: {e}")
        appointment_data['status'] = 'Bekliyor'
    
    appointment_obj = Appointment(**appointment_data, organization_id=organization_id)
    doc = appointment_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    
    # Müşteriyi customers collection'ına ekle (eğer yoksa)
    try:
        # Aynı telefon numarasına sahip müşterileri bul
        customers_with_phone = await db.customers.find(
            {
                "organization_id": organization_id,
                "phone": appointment.phone
            },
            {"_id": 0, "name": 1, "phone": 1}
        ).to_list(100)
        
        # İsim-soyisim kontrolü (büyük-küçük harf duyarsız)
        customer_name_normalized = appointment.customer_name.strip().lower()
        existing_customer = None
        for customer in customers_with_phone:
            if customer.get("name", "").strip().lower() == customer_name_normalized:
                existing_customer = customer
                break
        
        if not existing_customer:
            # Müşteri yoksa ekle
            customer_doc = {
                "id": str(uuid.uuid4()),
                "organization_id": organization_id,
                "name": appointment.customer_name.strip(),
                "phone": appointment.phone,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "notes": ""
            }
            await db.customers.insert_one(customer_doc)
            logging.info(f"Customer auto-added from public booking: {appointment.customer_name} ({appointment.phone}) for org {organization_id}")
            
            # WebSocket event gönder (müşteriler listesini güncellemek için)
            try:
                await emit_to_organization(
                    organization_id,
                    'customer_added',
                    {'customer': customer_doc}
                )
            except Exception as emit_error:
                logging.warning(f"Failed to emit customer_added event: {emit_error}")
    except Exception as e:
        logging.warning(f"Error adding customer to collection: {e}")
    
    # SMS gönder - Default mesaj kullan (template desteği kaldırıldı)
    settings_data = await db.settings.find_one({"organization_id": organization_id})
    if settings_data:
        company_name = settings_data.get("company_name", "İşletmeniz")
        support_phone = settings_data.get("support_phone", "Destek Hattı")
        
        sms_message = build_sms_message(
            company_name, appointment.customer_name,
            appointment.appointment_date, appointment.appointment_time,
            service['name'], support_phone, sms_type="confirmation"
        )
        send_sms(appointment.phone, sms_message)
    
    # Emit WebSocket event for real-time update
    # Use appointment_obj.model_dump() instead of doc to avoid MongoDB _id issues
    appointment_for_emit = appointment_obj.model_dump()
    appointment_for_emit['created_at'] = appointment_for_emit['created_at'].isoformat()
    logger.info(f"About to emit appointment_created for org: {organization_id} (public endpoint)")
    try:
        await emit_to_organization(
            organization_id,
            'appointment_created',
            {'appointment': appointment_for_emit}
        )
        logger.info(f"Successfully emitted appointment_created for org: {organization_id} (public endpoint)")
    except Exception as emit_error:
        logger.error(f"Failed to emit appointment_created (public endpoint): {emit_error}", exc_info=True)
    
    return {"message": "Randevu başarıyla oluşturuldu", "appointment": appointment_obj}

# === SUPER ADMIN ENDPOINT'LERİ ===
@api_router.get("/superadmin/stats")
async def get_superadmin_stats(request: Request, current_user: UserInDB = Depends(get_superadmin_user), db = Depends(get_db)):
    """Platform özeti - Sadece superadmin"""
    try:
        now = datetime.now(timezone.utc)
        first_day_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Bu ayın son gününü hesapla
        if now.month == 12:
            last_day_of_month = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            last_day_of_month = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
        last_day_of_month = last_day_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        first_day_str = first_day_of_month.strftime("%Y-%m-%d")
        last_day_str = last_day_of_month.strftime("%Y-%m-%d")
        
        # 1. Toplam İşletme Sayısı (Settings koleksiyonundan unique organization_id sayısı)
        total_organizations = await db.settings.count_documents({})
        
        # 2. Bu Ayki Toplam Abonelik Geliri (organization_plans'den aktif planların toplamı)
        # Trial hariç, aktif planların aylık fiyatlarını topla
        active_plans = await db.organization_plans.find({}).to_list(10000)
        total_monthly_revenue = 0.0
        
        for plan in active_plans:
            plan_id = plan.get('plan_id', 'tier_trial')
            # Trial paketleri gelir sayılmaz
            if plan_id != 'tier_trial':
                plan_info = next((p for p in PLANS if p['id'] == plan_id), None)
                if plan_info:
                    # Trial bitiş tarihi kontrolü - eğer trial bitmişse ve plan aktifse
                    trial_end = plan.get('trial_end_date')
                    if trial_end:
                        if isinstance(trial_end, str):
                            trial_end = datetime.fromisoformat(trial_end.replace('Z', '+00:00'))
                        # Trial bitmişse plan fiyatını ekle
                        if trial_end < now:
                            total_monthly_revenue += plan_info.get('price_monthly', 0)
                    else:
                        # Trial yoksa direkt fiyatı ekle
                        total_monthly_revenue += plan_info.get('price_monthly', 0)
        
        # 3. Bu Ayki Toplam Randevu Sayısı (Tüm organizasyonların appointments'ları)
        total_appointments_this_month = await db.appointments.count_documents({
            "appointment_date": {"$gte": first_day_str, "$lte": last_day_str}
        })
        
        # 4. Toplam Aktif Kullanıcı (Customers + Personnel/Users)
        total_customers = await db.customers.count_documents({})
        total_personnel = await db.users.count_documents({"role": "staff"})
        total_active_users = total_customers + total_personnel
        
        return {
            "toplam_isletme": total_organizations,
            "toplam_gelir_bu_ay": round(total_monthly_revenue, 2),
            "toplam_randevu_bu_ay": total_appointments_this_month,
            "toplam_aktif_kullanici": total_active_users
        }
    except Exception as e:
        logging.error(f"Error in get_superadmin_stats: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"İstatistikler alınırken hata oluştu: {str(e)}")

@api_router.get("/superadmin/organizations")
async def get_superadmin_organizations(request: Request, current_user: UserInDB = Depends(get_superadmin_user), db = Depends(get_db)):
    """Detaylı işletme listesi - Sadece superadmin"""
    try:
        now = datetime.now(timezone.utc)
        first_day_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        
        # Bu ayın son gününü hesapla
        if now.month == 12:
            last_day_of_month = now.replace(year=now.year + 1, month=1, day=1) - timedelta(days=1)
        else:
            last_day_of_month = now.replace(month=now.month + 1, day=1) - timedelta(days=1)
        last_day_of_month = last_day_of_month.replace(hour=23, minute=59, second=59, microsecond=999999)
        
        first_day_str = first_day_of_month.strftime("%Y-%m-%d")
        last_day_str = last_day_of_month.strftime("%Y-%m-%d")
        
        # Tüm settings'leri al (her biri bir organizasyonu temsil eder)
        all_settings = await db.settings.find({}).to_list(10000)
        
        organizations_list = []
        
        for setting in all_settings:
            org_id = setting.get('organization_id')
            if not org_id:
                continue
            
            # İşletme adı ve telefon
            isletme_adi = setting.get('company_name', 'İsimsiz İşletme')
            telefon_numarasi = setting.get('support_phone', 'Telefon Yok')
            
            # Abonelik bilgileri
            plan_doc = await db.organization_plans.find_one({"organization_id": org_id})
            if not plan_doc:
                abonelik_paketi = "Trial"
                abonelik_durumu = "Kayıt Yok"
            else:
                plan_id = plan_doc.get('plan_id', 'tier_trial')
                plan_info = next((p for p in PLANS if p['id'] == plan_id), None)
                abonelik_paketi = plan_info.get('name', 'Trial') if plan_info else 'Trial'
                
                # Abonelik durumu hesapla
                trial_end = plan_doc.get('trial_end_date')
                if plan_id == 'tier_trial' and trial_end:
                    if isinstance(trial_end, str):
                        trial_end = datetime.fromisoformat(trial_end.replace('Z', '+00:00'))
                    days_left = (trial_end - now).days
                    if days_left < 0:
                        abonelik_durumu = "Deneme Bitti"
                    else:
                        abonelik_durumu = f"{days_left} Gün Kaldı"
                else:
                    abonelik_durumu = "Aktif"
            
            # Bu ayki randevu sayısı
            bu_ayki_randevu_sayisi = await db.appointments.count_documents({
                "organization_id": org_id,
                "appointment_date": {"$gte": first_day_str, "$lte": last_day_str}
            })
            
            # Toplam müşteri sayısı
            toplam_musteri_sayisi = await db.customers.count_documents({
                "organization_id": org_id
            })
            
            # Toplam personel sayısı (staff rolü)
            toplam_personel_sayisi = await db.users.count_documents({
                "organization_id": org_id,
                "role": "staff"
            })
            
            organizations_list.append({
                "organization_id": org_id,
                "isletme_adi": isletme_adi,
                "telefon_numarasi": telefon_numarasi,
                "abonelik_paketi": abonelik_paketi,
                "abonelik_durumu": abonelik_durumu,
                "bu_ayki_randevu_sayisi": bu_ayki_randevu_sayisi,
                "toplam_musteri_sayisi": toplam_musteri_sayisi,
                "toplam_personel_sayisi": toplam_personel_sayisi
            })
        
        return {"organizations": organizations_list}
    except Exception as e:
        logging.error(f"Error in get_superadmin_organizations: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"İşletme listesi alınırken hata oluştu: {str(e)}")

# --- Router prefix'i buraya taşındı ---
app.include_router(api_router, prefix="/api")

# === CORS Preflight için OPTIONS handler (router'dan SONRA) ===
@app.options("/api/{path:path}")
async def options_handler(response: Response, request: Request):
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

# Static files serving for logos (must be after router)
static_files_dir = str(ROOT_DIR / "static")
app.mount("/api/static", StaticFiles(directory=static_files_dir), name="static")

# --- CORS Ayarı ---
cors_origins_str = os.environ.get('CORS_ORIGINS', '*'); cors_origins = ['*'] if cors_origins_str == '*' else [origin.strip() for origin in cors_origins_str.split(',') if origin.strip()]
logging.info(f"CORS origins configured: {cors_origins}")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
    allow_headers=["*"],
)

# Export socket_app as the main application for ASGI servers
# This allows both FastAPI and Socket.IO to work together
application = socket_app
