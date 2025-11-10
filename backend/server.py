from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response 
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import requests
from urllib.parse import quote
from zoneinfo import ZoneInfo
import re
import xml.etree.ElementTree as ET

from contextlib import asynccontextmanager
from passlib.context import CryptContext
from jose import JWTError, jwt

# (Cache ve Rate Limit importları, sizin projenizden alındı)
from cache import init_redis, invalidate_cache, cache_result
from rate_limit import initialize_limiter, rate_limit, LIMITS
from slowapi.errors import RateLimitExceeded
from slowapi import _rate_limit_exceeded_handler

# === LOGGING AYARLARI ===
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

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

# === MongoDB ve Redis Yaşam Döngüsü (Lifespan) --- SYNTAX HATASI DÜZELTİLDİ ===
@asynccontextmanager
async def lifespan(app: FastAPI):
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

    yield

    # --- SyntaxError'ı düzelten, okunabilir cleanup blokları ---
    if app.mongodb_client:
        logging.info("Closing MongoDB connection...")
        try: app.mongodb_client.close()
        except: pass
    if app.redis_client:
        logging.info("Closing Redis connection...")
        try: await app.redis_client.close()
        except: pass
    # --- Düzeltme Sonu ---

# Create the main app
app = FastAPI(title="Randevu SaaS API", description="... (Açıklamanız buradaydı) ...", version="1.4.2 (Final Fixes)", lifespan=lifespan)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
# --- Router prefix'i kaldırıldı ---
api_router = APIRouter()

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

# --- SMS FONKSİYONU (Aynı kaldı) ---
def send_sms(to_phone: str, message: str):
    try:
        if not SMS_ENABLED: logging.info("SMS sending is disabled via SMS_ENABLED env. Skipping."); return True
        clean_phone = re.sub(r'\D', '', to_phone); 
        if clean_phone.startswith('90'): clean_phone = clean_phone[2:]
        if clean_phone.startswith('0'): clean_phone = clean_phone[1:]
        if not clean_phone.startswith('5') or len(clean_phone) != 10: logging.error(f"Invalid Turkish phone number format: {to_phone} -> {clean_phone}"); return False
        
        sanitized = re.sub(r"\s+", " ", message).strip(); MAX_LEN = 480
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

# === VERİ MODELLERİ (Aynı kaldı) ===
class User(BaseModel):
    username: str; full_name: Optional[str] = None; organization_id: str = Field(default_factory=lambda: str(uuid.uuid4())); role: str = "admin"; slug: Optional[str] = None; permitted_service_ids: List[str] = [] 
class UserInDB(User): hashed_password: str
class UserCreate(BaseModel): username: str; password: str; full_name: Optional[str] = None; organization_name: Optional[str] = None; support_phone: Optional[str] = None
class Token(BaseModel): access_token: str; token_type: str
class Service(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); name: str; price: float; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class ServiceCreate(BaseModel): name: str; price: float
class ServiceUpdate(BaseModel): name: Optional[str] = None; price: Optional[float] = None
class Appointment(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); customer_name: str; phone: str; service_id: str; service_name: str; service_price: float; appointment_date: str; appointment_time: str; notes: str = ""; status: str = "Bekliyor"; staff_member_id: Optional[str] = None; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc)); completed_at: Optional[str] = None
class AppointmentCreate(BaseModel):
    customer_name: str; phone: str; service_id: str; appointment_date: str; appointment_time: str; notes: str = ""; staff_member_id: Optional[str] = None
class AppointmentUpdate(BaseModel):
    customer_name: Optional[str] = None; phone: Optional[str] = None; address: Optional[str] = None; service_id: Optional[str] = None; appointment_date: Optional[str] = None; appointment_time: Optional[str] = None; notes: Optional[str] = None; status: Optional[str] = None; staff_member_id: Optional[str] = None
class Transaction(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); appointment_id: str; customer_name: str; service_name: str; amount: float; date: str; created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
class TransactionUpdate(BaseModel): amount: float
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore"); organization_id: str; id: str = Field(default_factory=lambda: str(uuid.uuid4())); work_start_hour: int = 7; work_end_hour: int = 3; appointment_interval: int = 30
    company_name: str = "İşletmeniz"; support_phone: str = "05000000000"; feedback_url: Optional[str] = None; slug: Optional[str] = None; customer_can_choose_staff: bool = False

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
    user_db = UserInDB(**user_db_data, hashed_password=hashed_password, organization_id=new_org_id, role="admin", slug=unique_slug, permitted_service_ids=[])
    await db.users.insert_one(user_db.model_dump())
    
    # Bu kullanıcı için varsayılan Settings oluştur (kayıt bilgileriyle)
    default_settings = Settings(
        organization_id=new_org_id,
        company_name=user_in.organization_name or "İşletmeniz",
        support_phone=user_in.support_phone or "05000000000",
        slug=unique_slug,
        customer_can_choose_staff=False
    )
    await db.settings.insert_one(default_settings.model_dump())
    
    return User(**user_db.model_dump())

@api_router.post("/token", response_model=Token)
@rate_limit(LIMITS['login']) 
async def login_for_access_token(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db = Depends(get_db)):
    try:
        user = await get_user_from_db(request, form_data.username, db=db)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect username or password", headers={"WWW-Authenticate": "Bearer"})
        access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        token_data = {"sub": user.username, "org_id": user.organization_id, "role": user.role}
        access_token = create_access_token(data=token_data, expires_delta=access_token_expires)
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException: raise
    except Exception as e:
        logging.error(f"Login error: {type(e).__name__}: {str(e)}"); import traceback; logging.error(traceback.format_exc())
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error occurred during login. Please try again later.")

# === APPOINTMENTS ROUTES ===
@api_router.delete("/appointments/{appointment_id}")
async def delete_appointment(request: Request, appointment_id: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"id": appointment_id, "organization_id": current_user.organization_id}
    result = await db.appointments.delete_one(query)
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    return {"message": "Randevu silindi"}

@api_router.put("/appointments/{appointment_id}", response_model=Appointment)
async def update_appointment(request: Request, appointment_id: str, appointment_update: AppointmentUpdate, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); settings_data = await db.settings.find_one({"organization_id": current_user.organization_id})
    if not settings_data:
        default_settings = Settings(organization_id=current_user.organization_id); settings_data = default_settings.model_dump()
    company_name = settings_data.get("company_name", "İşletmeniz"); support_phone = settings_data.get("support_phone", "Destek Hattı"); feedback_url = settings_data.get("feedback_url", "")
    query = {"id": appointment_id, "organization_id": current_user.organization_id}; appointment = await db.appointments.find_one(query, {"_id": 0})
    if not appointment: raise HTTPException(status_code=404, detail="Randevu bulunamadı")
    update_data = {k: v for k, v in appointment_update.model_dump().items() if v is not None}
    if 'appointment_date' in update_data or 'appointment_time' in update_data:
        check_date = update_data.get('appointment_date', appointment['appointment_date']); check_time = update_data.get('appointment_time', appointment['appointment_time'])
        existing_query = {"organization_id": current_user.organization_id, "id": {"$ne": appointment_id}, "appointment_date": check_date, "appointment_time": check_time, "status": {"$ne": "İptal"}}
        existing = await db.appointments.find_one(existing_query)
        if existing: raise HTTPException(status_code=400, detail=f"{check_date} tarihinde {check_time} saatinde zaten bir randevu var. Lütfen başka bir saat seçin.")
    if 'service_id' in update_data:
        service_query = {"id": update_data['service_id'], "organization_id": current_user.organization_id}; service = await db.services.find_one(service_query, {"_id": 0})
        if service: update_data['service_name'] = service['name']; update_data['service_price'] = service['price']
    new_status = update_data.get('status'); old_status = appointment['status']
    if new_status == 'Tamamlandı' and old_status != 'Tamamlandı':
        update_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        transaction = Transaction(organization_id=current_user.organization_id, appointment_id=appointment_id, customer_name=appointment['customer_name'], service_name=appointment['service_name'], amount=appointment['service_price'], date=appointment['appointment_date'])
        trans_doc = transaction.model_dump(); trans_doc['created_at'] = trans_doc['created_at'].isoformat()
        await db.transactions.insert_one(trans_doc)
        try:
            sms_message = (f"Sayın {appointment['customer_name']},\n\n" f"{company_name} hizmetiniz başarıyla tamamlanmıştır.\n\n" f"Koltuk ve tekstil yüzeyleriniz yüksek ısıda buhar ve antibakteriyel ürünlerle profesyonel olarak temizlenmiştir.\n\n" f"Hizmet kalitemizi geliştirmek adına geri bildiriminiz bizim için değerlidir.\n\n")
            if feedback_url: sms_message += f"Görüş bildirmek için: {feedback_url}\n\n"
            sms_message += f"— {company_name}"; send_sms(appointment['phone'], sms_message)
        except Exception as e: logging.error(f"Tamamlandı SMS'i gönderilirken hata oluştu: {e}")
    elif new_status == 'İptal' and old_status != 'İptal':
        try:
            sms_message = (f"Sayın {appointment['customer_name']},\n\n" f"{company_name} randevunuz talebiniz doğrultusunda iptal edilmiştir.\n\n" f"Yeni bir tarih planlamak veya bilgi almak için bizimle iletişime geçebilirsiniz.\n\n" f"Müşteri memnuniyetine verdiğimiz önem doğrultusunda her zaman hizmetinizdeyiz.\n\n" f"📞 İletişim: {support_phone}\n\n" f"— {company_name}")
            send_sms(appointment['phone'], sms_message)
        except Exception as e: logging.error(f"İptal SMS'i gönderilirken hata oluştu: {e}")
    if update_data: await db.appointments.update_one(query, {"$set": update_data})
    updated_appointment = await db.appointments.find_one(query, {"_id": 0})
    if isinstance(updated_appointment['created_at'], str): updated_appointment['created_at'] = datetime.fromisoformat(updated_appointment['created_at'])
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
    db = await get_db_from_request(request); service_query = {"id": appointment.service_id, "organization_id": current_user.organization_id}
    service = await db.services.find_one(service_query, {"_id": 0})
    if not service: raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    
    # PERSONEL KONTROL: Staff ise sadece kendi hizmetlerine randevu alabilir
    if current_user.role == "staff":
        if service["id"] not in current_user.permitted_service_ids:
            raise HTTPException(status_code=403, detail="Bu hizmete randevu alma yetkiniz yok")
    
    existing_query = {"organization_id": current_user.organization_id, "appointment_date": appointment.appointment_date, "appointment_time": appointment.appointment_time, "status": {"$ne": "İptal"}}
    existing = await db.appointments.find_one(existing_query)
    if existing: raise HTTPException(status_code=400, detail=f"{appointment.appointment_date} tarihinde {appointment.appointment_time} saatinde zaten bir randevu var. Lütfen başka bir saat seçin.")
    appointment_data = appointment.model_dump(); appointment_data['service_name'] = service['name']; appointment_data['service_price'] = service['price']
    try:
        turkey_tz = ZoneInfo("Europe/Istanbul"); now = datetime.now(turkey_tz); dt_str = f"{appointment.appointment_date} {appointment.appointment_time}"
        naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M"); appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
        completion_threshold = appointment_dt + timedelta(hours=1)
        if now >= completion_threshold: appointment_data['status'] = 'Tamamlandı'; appointment_data['completed_at'] = datetime.now(timezone.utc).isoformat()
        else: appointment_data['status'] = 'Bekliyor'
    except (ValueError, TypeError) as e: logging.warning(f"Randevu durumu ayarlanırken tarih hatası: {e}"); appointment_data['status'] = 'Bekliyor'
    appointment_obj = Appointment(**appointment_data, organization_id=current_user.organization_id)
    doc = appointment_obj.model_dump(); doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    
    if appointment_obj.status == 'Tamamlandı':
        transaction = Transaction(organization_id=current_user.organization_id, appointment_id=appointment_obj.id, customer_name=appointment_obj.customer_name, service_name=appointment_obj.service_name, amount=appointment_obj.service_price, date=appointment_obj.appointment_date)
        trans_doc = transaction.model_dump(); trans_doc['created_at'] = trans_doc['created_at'].isoformat()
        await db.transactions.insert_one(trans_doc)

    settings_data = await db.settings.find_one({"organization_id": current_user.organization_id})
    if not settings_data:
        default_settings = Settings(organization_id=current_user.organization_id); settings_data = default_settings.model_dump()
    company_name = settings_data.get("company_name", "İşletmeniz"); support_phone = settings_data.get("support_phone", "Destek Hattı")
    sms_message = (f"Sayın {appointment.customer_name},\n\n" f"{company_name} hizmet randevunuz onaylanmıştır.\n\n" f"Tarih: {appointment.appointment_date}\n" f"Saat: {appointment.appointment_time}\n\n" f"Profesyonel ekibimiz belirtilen adreste zamanında hizmet verecektir.\n\n" f"Tüm işlemler hijyen ve müşteri memnuniyeti standartlarına uygun olarak yürütülecektir.\n\n" f"Bilgi veya değişiklik için: {support_phone}\n\n" f"— {company_name}")
    send_sms(appointment.phone, sms_message)
    return appointment_obj

@api_router.get("/appointments", response_model=List[Appointment])
async def get_appointments(
    request: Request, date: Optional[str] = None, status: Optional[str] = None, search: Optional[str] = None, current_user: UserInDB = Depends(get_current_user)
):
    db = await get_db_from_request(request)
    query = {"organization_id": current_user.organization_id}
    
    # Personel sadece kendine atanan randevuları görebilir
    if current_user.role == "staff":
        query['staff_member_id'] = current_user.username
    
    if date: query['appointment_date'] = date
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
    ids_to_update = []; transactions_to_create = [] 
    for appt in appointments_from_db:
        if isinstance(appt.get('created_at'), str): appt['created_at'] = datetime.fromisoformat(appt['created_at'])
        if appt.get('status') == 'Bekliyor':
            try:
                dt_str = f"{appt['appointment_date']} {appt['appointment_time']}"
                naive_dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M"); appointment_dt = naive_dt.replace(tzinfo=turkey_tz)
                completion_threshold = appointment_dt + timedelta(hours=1)
                if now >= completion_threshold:
                    appt['status'] = 'Tamamlandı'; completed_at_iso = datetime.now(timezone.utc).isoformat()
                    appt['completed_at'] = completed_at_iso; ids_to_update.append(appt['id'])
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
    return updated_transaction

@api_router.delete("/transactions/{transaction_id}")
async def delete_transaction(request: Request, transaction_id: str, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); query = {"id": transaction_id, "organization_id": current_user.organization_id}
    result = await db.transactions.delete_one(query)
    if result.deleted_count == 0: raise HTTPException(status_code=404, detail="İşlem bulunamadı")
    return {"message": "İşlem silindi"}

# === DASHBOARD STATS ===
@api_router.get("/stats/dashboard")
async def get_dashboard_stats(request: Request, current_user: UserInDB = Depends(get_current_user)):
    # Sadece admin görebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request); turkey_tz = ZoneInfo("Europe/Istanbul"); today = datetime.now(turkey_tz).date().isoformat()
    base_query = {"organization_id": current_user.organization_id}
    today_appointments = await db.appointments.count_documents({**base_query, "appointment_date": today})
    today_completed = await db.appointments.count_documents({**base_query, "appointment_date": today, "status": "Tamamlandı"})
    today_transactions = await db.transactions.find({**base_query, "date": today}, {"_id": 0}).to_list(1000)
    today_income = sum(t['amount'] for t in today_transactions)
    week_start = (datetime.now(turkey_tz).date() - timedelta(days=7)).isoformat()
    week_transactions = await db.transactions.find({**base_query, "date": {"$gte": week_start}}, {"_id": 0}).to_list(1000)
    week_income = sum(t['amount'] for t in week_transactions)
    month_start = datetime.now(turkey_tz).date().replace(day=1).isoformat()
    month_transactions = await db.transactions.find({**base_query, "date": {"$gte": month_start}}, {"_id": 0}).to_list(1000)
    month_income = sum(t['amount'] for t in month_transactions)
    return {
        "today_appointments": today_appointments, "today_completed": today_completed, "today_income": today_income, "week_income": week_income, "month_income": month_income
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
    
    db = await get_db_from_request(request); query = {"organization_id": current_user.organization_id}
    update_data = settings.model_dump(); update_data["organization_id"] = current_user.organization_id
    await db.settings.update_one(query, {"$set": update_data}, upsert=True)
    updated_settings = await db.settings.find_one(query, {"_id": 0})
    return Settings(**updated_settings)

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
class StaffCreate(BaseModel):
    username: str
    password: str
    full_name: str

@api_router.post("/staff/add")
async def add_staff(request: Request, staff_data: StaffCreate, current_user: UserInDB = Depends(get_current_user)):
    """Admin, yeni personel ekleyebilir"""
    # Sadece admin ekleyebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Kullanıcı adı zaten var mı kontrol et
    existing = await db.users.find_one({"username": staff_data.username})
    if existing:
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kayıtlı")
    
    # Yeni personel oluştur
    hashed_password = get_password_hash(staff_data.password)
    new_user = UserInDB(
        username=staff_data.username,
        full_name=staff_data.full_name,
        hashed_password=hashed_password,
        organization_id=current_user.organization_id,
        role="staff",  # Personel rolü
        slug=None,  # Personellerin slug'ı yok
        permitted_service_ids=[]  # Başlangıçta boş
    )
    
    await db.users.insert_one(new_user.model_dump())
    
    return {"message": "Personel başarıyla eklendi", "username": staff_data.username, "full_name": staff_data.full_name}

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
    
    # Liste olarak döndür
    customers = list(customer_map.values())
    customers.sort(key=lambda x: x['total_appointments'], reverse=True)
    
    return customers

@api_router.delete("/customers/{phone}")
async def delete_customer(request: Request, phone: str, current_user: UserInDB = Depends(get_current_user)):
    """Müşteriyi ve TÜM randevularını sil"""
    # Sadece admin silebilir
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    
    db = await get_db_from_request(request)
    
    # Müşterinin tüm randevularını sil
    query = {"phone": phone, "organization_id": current_user.organization_id}
    result = await db.appointments.delete_many(query)
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Bu telefon numarasına ait randevu bulunamadı")
    
    # Transaction'ları da sil (eğer varsa)
    await db.transactions.delete_many(query)
    
    return {"message": f"Müşteri ve {result.deleted_count} randevu silindi", "deleted_appointments": result.deleted_count}

@api_router.get("/customers/{phone}/history")
async def get_customer_history(request: Request, phone: str, current_user: UserInDB = Depends(get_current_user)):
    db = await get_db_from_request(request); query = {"phone": phone, "organization_id": current_user.organization_id}
    appointments = await db.appointments.find(query, {"_id": 0}).sort("appointment_date", -1).to_list(1000)
    for appointment in appointments:
        if isinstance(appointment['created_at'], str): appointment['created_at'] = datetime.fromisoformat(appointment['created_at'])
    total_completed = len([a for a in appointments if a['status'] == 'Tamamlandı'])
    return {"phone": phone, "total_appointments": len(appointments), "completed_appointments": total_completed, "appointments": appointments}

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
    
    # Tüm personelleri çek (SADECE gerekli alanlar - ŞİFRELER HARİÇ!)
    staff_members = await db.users.find(
        {"organization_id": organization_id}, 
        {"_id": 0, "full_name": 1, "id": 1, "permitted_service_ids": 1, "username": 1}
    ).to_list(1000)
    
    # Ayarları çek
    settings = await db.settings.find_one({"organization_id": organization_id}, {"_id": 0})
    if not settings:
        # Varsayılan ayarlar
        settings = {
            "customer_can_choose_staff": False,
            "work_start_hour": 9,
            "work_end_hour": 18,
            "appointment_interval": 30,
            "company_name": admin_user.get('full_name', 'İşletme')
        }
    
    return {
        "business_name": settings.get('company_name', admin_user.get('full_name', 'İşletme')),
        "organization_id": organization_id,
        "services": services,
        "staff_members": staff_members,
        "settings": {
            "customer_can_choose_staff": settings.get('customer_can_choose_staff', False),
            "work_start_hour": settings.get('work_start_hour', 9),
            "work_end_hour": settings.get('work_end_hour', 18),
            "appointment_interval": settings.get('appointment_interval', 30)
        }
    }

@api_router.get("/public/availability/{organization_id}")
async def get_availability(request: Request, organization_id: str, service_id: str, date: str, staff_id: Optional[str] = None):
    """Model D: Personel bazlı akıllı müsaitlik kontrolü"""
    db = await get_db_from_request(request)
    
    # Eğer müşteri belirli bir personel seçtiyse, sadece o personele bak
    if staff_id:
        staff_members = await db.users.find(
            {"organization_id": organization_id, "username": staff_id, "permitted_service_ids": {"$in": [service_id]}},
            {"_id": 0, "id": 1, "username": 1}
        ).to_list(1000)
        
        if not staff_members:
            return {"available_slots": [], "message": "Seçilen personel bu hizmeti veremiyor"}
    else:
        # O hizmeti verebilen TÜM personelleri bul (Array içinde arama)
        staff_members = await db.users.find(
            {"organization_id": organization_id, "permitted_service_ids": {"$in": [service_id]}},
            {"_id": 0, "id": 1, "username": 1}
        ).to_list(1000)
        
        if not staff_members:
            # Hiç personel yoksa veya hiçbiri bu hizmeti vermiyorsa boş dön
            return {"available_slots": [], "message": "Bu hizmet için uygun personel bulunamadı"}
    
    # Ayarları al
    settings = await db.settings.find_one({"organization_id": organization_id}, {"_id": 0})
    if not settings:
        settings = {"work_start_hour": 9, "work_end_hour": 18, "appointment_interval": 30}
    
    work_start_hour = settings.get('work_start_hour', 9)
    work_end_hour = settings.get('work_end_hour', 18)
    appointment_interval = settings.get('appointment_interval', 30)
    
    # Tüm olası saatleri oluştur
    all_slots = []
    currentHour = work_start_hour
    currentMinute = 0
    
    while True:
        if work_end_hour < work_start_hour:
            if currentHour == 24:
                currentHour = 0
            if currentHour == work_end_hour and currentMinute > 0:
                break
            if currentHour > work_end_hour and currentHour < work_start_hour:
                break
        else:
            if currentHour > work_end_hour:
                break
            if currentHour == work_end_hour and currentMinute > 0:
                break
        
        time = f"{str(currentHour).zfill(2)}:{str(currentMinute).zfill(2)}"
        all_slots.append(time)
        
        currentMinute += appointment_interval
        if currentMinute >= 60:
            currentMinute = 0
            currentHour += 1
    
    # KRİTİK: Personel aynı anda sadece 1 müşteriye hizmet verebilir
    # O hizmeti verebilen personellerin o tarihteki TÜM randevularını çek (hangi hizmet olursa olsun)
    staff_ids = [staff['username'] for staff in staff_members]
    
    # Personellerin o gün için TÜM randevularını al (tüm hizmetler dahil)
    all_staff_appointments = await db.appointments.find(
        {
            "organization_id": organization_id,
            "appointment_date": date,
            "status": {"$ne": "İptal"},
            "staff_member_id": {"$in": staff_ids}
        },
        {"_id": 0, "appointment_time": 1, "staff_member_id": 1, "service_name": 1}
    ).to_list(1000)
    
    logging.info(f"🔍 Service: {service_id}, Date: {date}")
    logging.info(f"👥 Qualified staff: {len(staff_members)} - {staff_ids}")
    logging.info(f"📅 Total appointments for these staff: {len(all_staff_appointments)}")
    
    # Hangi saatlerde EN AZ BİR personel müsait?
    available_slots = []
    for slot in all_slots:
        # Bu saatte dolu olan personeller (hangi hizmet olursa olsun)
        busy_staff_at_slot = [appt['staff_member_id'] for appt in all_staff_appointments if appt['appointment_time'] == slot]
        busy_staff_unique = list(set(busy_staff_at_slot))  # Tekil personel ID'leri
        
        # Eğer TÜM personeller dolu değilse, bu saat müsait
        available_count = len(staff_members) - len(busy_staff_unique)
        if available_count > 0:
            available_slots.append(slot)
            logging.debug(f"⏰ Slot {slot}: {available_count}/{len(staff_members)} personel müsait")
        else:
            logging.debug(f"🚫 Slot {slot}: Tüm personeller dolu")
    
    logging.info(f"✅ Available slots: {len(available_slots)}")
    return {"available_slots": available_slots}

@api_router.post("/public/appointments")
async def create_public_appointment(request: Request, appointment: AppointmentCreate, organization_id: str):
    """Model D: Public randevu oluştur - Akıllı personel atama"""
    db = await get_db_from_request(request)
    
    # Service'i bul
    service = await db.services.find_one({"id": appointment.service_id}, {"_id": 0})
    if not service:
        raise HTTPException(status_code=404, detail="Hizmet bulunamadı")
    
    assigned_staff_id = None
    
    # AKILLI ATAMA MANTIĞI
    if appointment.staff_member_id:
        # Müşteri belirli bir personel seçti
        # O personelin o saatte dolu olup olmadığını kontrol et
        existing = await db.appointments.find_one({
            "organization_id": organization_id,
            "staff_member_id": appointment.staff_member_id,
            "appointment_date": appointment.appointment_date,
            "appointment_time": appointment.appointment_time,
            "status": {"$ne": "İptal"}
        })
        if existing:
            raise HTTPException(
                status_code=400,
                detail="Seçtiğiniz personel bu saatte dolu. Lütfen başka bir saat veya personel seçin."
            )
        assigned_staff_id = appointment.staff_member_id
    else:
        # Müşteri "Farketmez" seçti veya personel seçimi yok
        # Bu hizmeti verebilen personellerden boş olanı bul (Array içinde arama)
        qualified_staff = await db.users.find(
            {"organization_id": organization_id, "permitted_service_ids": {"$in": [appointment.service_id]}},
            {"_id": 0, "username": 1}
        ).to_list(1000)
        
        if not qualified_staff:
            raise HTTPException(
                status_code=400,
                detail="Bu hizmet için uygun personel bulunamadı"
            )
        
        # Boş personel bul
        for staff in qualified_staff:
            existing = await db.appointments.find_one({
                "organization_id": organization_id,
                "staff_member_id": staff['username'],
                "appointment_date": appointment.appointment_date,
                "appointment_time": appointment.appointment_time,
                "status": {"$ne": "İptal"}
            })
            if not existing:
                # Bu personel boş!
                assigned_staff_id = staff['username']
                break
        
        if not assigned_staff_id:
            raise HTTPException(
                status_code=400,
                detail="Bu saat dilimi doludur. Lütfen başka bir saat seçin."
            )
    
    # Randevuyu oluştur
    appointment_data = appointment.model_dump()
    appointment_data['service_name'] = service['name']
    appointment_data['service_price'] = service['price']
    appointment_data['status'] = 'Bekliyor'
    appointment_data['staff_member_id'] = assigned_staff_id
    
    appointment_obj = Appointment(**appointment_data, organization_id=organization_id)
    doc = appointment_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    await db.appointments.insert_one(doc)
    
    # SMS gönder
    settings_data = await db.settings.find_one({"organization_id": organization_id})
    if settings_data:
        company_name = settings_data.get("company_name", "İşletmeniz")
        support_phone = settings_data.get("support_phone", "Destek Hattı")
        
        sms_message = (
            f"Sayın {appointment.customer_name},\n\n"
            f"{company_name} hizmet randevunuz onaylanmıştır.\n\n"
            f"Tarih: {appointment.appointment_date}\n"
            f"Saat: {appointment.appointment_time}\n\n"
            f"Bilgi: {support_phone}\n\n"
            f"— {company_name}"
        )
        send_sms(appointment.phone, sms_message)
    
    return {"message": "Randevu başarıyla oluşturuldu", "appointment": appointment_obj}


# === ZORLU 405 HATASINI ÇÖZMEK İÇİN YENİ OPTIONS ENDPOINT'İ ===
@api_router.options("/{path:path}")
async def options_handler(response: Response, request: Request):
    response.status_code = status.HTTP_204_NO_CONTENT
    return response

# --- Router prefix'i buraya taşındı ---
app.include_router(api_router, prefix="/api")

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
