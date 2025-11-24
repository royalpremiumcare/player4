"""
PLANN AI Assistant Service - Google Gemini 2.5 Flash Integration
"""

import os
import logging
from typing import List, Dict, Optional, Any
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import google.generativeai as genai
import uuid
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Socketio import (will be set by server.py)
sio = None

def set_socketio(socketio_instance):
    """Set socketio instance from server.py"""
    global sio
    sio = socketio_instance

logger = logging.getLogger(__name__)

# Google Gemini API Configuration
GOOGLE_GEMINI_KEY = os.environ.get('GOOGLE_GEMINI_KEY')
if not GOOGLE_GEMINI_KEY:
    logger.error("⚠️ GOOGLE_GEMINI_KEY not found!")
else:
    genai.configure(api_key=GOOGLE_GEMINI_KEY)
    logger.info("✅ Google Gemini API configured")

# === SYSTEM DOCUMENTATION ===
SYSTEM_DOCUMENTATION = """
[PLANN - KULLANIM KILAVUZU]

1. GENEL: PLANN, işletme yönetim sistemidir. İki rol: Admin ve Personel.
2. TAKVİM: Randevu "Hizmet Süresi"ne göre 15dk adımlarla hesaplanır. Geçmiş tarihe randevu alınamaz.
3. FİNANS (Sadece Admin): Gelirler otomatik, giderler manuel eklenir. Personel ödemeleri bordrodan yönetilir.
4. PERSONEL: Personel eklenirken davet emaili gönderilir. Çalışma saatleri işletme saatlerinden kopyalanır.
5. ONLINE RANDEVU: plann.com/slug adresinden müşteriler randevu alır. 'Farketmez' seçeneği otomatik personel atar.
6. HİZMET: Her hizmet için isim, fiyat, süre (dk) tanımlanır. Süre randevu slotlarını belirler.
7. MÜŞTERİ: Telefon numarasıyla otomatik kayıt. Geçmiş ve notlar görülebilir.
8. AYARLAR: İşletme adı, logo, slug, çalışma saatleri, SMS hatırlatma yapılandırılır.
9. ABONELİK: Trial (ücretsiz), Basic (299₺), Pro (499₺), Enterprise (799₺) paketleri.
10. GÜVENLİK: Personel sadece kendi verilerini görebilir.
"""

def get_system_instruction(user_role: str, user_name: str, org_name: str = "İşletme") -> str:
    """System instruction for AI"""
    is_staff = user_role.lower() == "staff"
    
    # Bugünün tarihini al (Türkiye saati)
    from zoneinfo import ZoneInfo
    turkey_tz = ZoneInfo("Europe/Istanbul")
    today = datetime.now(turkey_tz)
    today_str = today.strftime("%Y-%m-%d")  # 2025-11-19
    today_readable = today.strftime("%d %B %Y")  # 19 Kasım 2025
    
    base_instruction = f"""Sen PLANN Akıllı Asistanısın. Kullanıcı: {user_name} ({user_role.upper()})

📅 BUGÜN: {today_str} (YYYY-MM-DD formatı)
📅 TARİH ÖRNEKLERİ:
   - Bugün: {today_str}
   - Yarın: {(datetime.now(turkey_tz) + timedelta(days=1)).date().isoformat()}
   - "3 gün sonra" = bugünden 3 gün ekle
   
⚠️ TARİH FORMATI: YYYY-MM-DD (örnek: 2025-11-20)
⚠️ SAAT FORMATI: HH:MM (örnek: 14:30)

🔧 RANDEVU OLUŞTURMA ADIM ADIM:

ADIM 1: get_dashboard_status ÇAĞIR
ADIM 2: Customers listesinde müşteriyi ara
  ÖRNEK: Kullanıcı "uhn için randevu" dedi
  - Customers'ta name="uhn", phone="05588852525" VARSA
  - Telefon: 05588852525 kullan
  - create_appointment çağır (customer_name="uhn", phone="05588852525")
  
  ÖRNEK 2: Kullanıcı "Ahmet için randevu" dedi
  - Customers'ta "Ahmet" YOK
  - "Ahmet sistemde kayıtlı değil, telefon numarası?" diye SOR
  - Kullanıcı telefon verdiğinde add_customer ÇAĞIR
  - Sonra TEKRAR get_dashboard_status ÇAĞIR
  - Customers'ta bul, telefonu al
  - create_appointment çağır

❗❗❗ MEVCUT MÜŞTERİ İÇİN TELEFON SORMA! Customers listesinden AL!

🔧 DİĞER İŞLEMLER:
- "Hangi müşteriler var?" → get_dashboard_status ÇAĞIR
- "Randevu iptal et" → get_dashboard_status ÇAĞIR → ID bul → cancel_appointment ÇAĞIR
- "Randevu sil" → get_dashboard_status ÇAĞIR → ID bul → delete_appointment ÇAĞIR

👥 PERSONEL BİLGİLERİ (Sadece Admin):
- "Personeller kimler?" → get_dashboard_status ÇAĞIR → staff_list içinde
- "En çok randevu alan personel?" → get_dashboard_status ÇAĞIR → staff_performance'tan sırala
- "X personelinin performansı?" → get_dashboard_status ÇAĞIR → staff_performance'ta ara
- "Bu ay hangi personel kaç para kazandırdı?" → staff_performance'taki monthly_revenue kullan

❌ ASLA telefon numarası olmadan randevu oluşturma!
❌ ASLA tarihi "19-11-2025" gibi yaz, sadece "2025-11-19" formatı!

GÜVENLİK KURALLARI:
"""
    
    if is_staff:
        base_instruction += """❌ PERSONEL KISITLAMALARI:
- Genel ciro, kasa, toplam gelir/gider paylaşma
- Diğer personel verilerini gösterme
- İşletme ayarlarına erişme
- ✅ Sadece kendi randevu ve kazançlarını göster
- 🔒 Yetkisiz istek: "Yetkiniz yok, sadece Admin erişebilir" de
"""
    else:
        base_instruction += """✅ ADMİN YETKİLERİ:
- Tüm verilere, raporlara, ayarlara erişim var
- Finansal bilgiler, personel performansı gösterilebilir
"""
    
    base_instruction += """
SİLME İŞLEMLERİ: Mutlaka onay iste. Örn: "Emin misiniz? X'i silmek istediğinizi onaylıyor musunuz?"

📝 MESAJ FORMATI KURALLARI:
❌ ASLA ** (yıldız) kullanma! Bold yapma!
❌ ASLA __kelime__ kullanma!
✅ Sadece düz metin kullan
✅ Emoji kullanabilirsin
✅ Satır sonları kullanabilirsin

YANLIŞ: **Müşteri Adı:** Ahmet
DOĞRU: Müşteri Adı: Ahmet

YANLIŞ: **Telefon:** 0555...
DOĞRU: Telefon: 0555...
"""
    
    return base_instruction

# === TOOL FUNCTIONS ===

async def create_appointment_tool(db, org_id: str, customer_name: str, phone: str, 
                                 service_id: str, apt_date: str, apt_time: str,
                                 staff_id: Optional[str] = None, notes: str = "") -> Dict:
    """Randevu oluştur"""
    plan_doc = None
    quota_incremented = False
    try:
        # Telefon numarası kontrolü
        if not phone or len(phone) < 10:
            return {"success": False, "message": "❌ Geçerli bir telefon numarası gerekli (05XXXXXXXXX)"}
        
        # KOTA KONTROLÜ VE ARTIRMA
        plan_doc = await db.organization_plans.find_one({"organization_id": org_id})
        if plan_doc:
            current_usage = plan_doc.get('quota_usage', 0)
            plan_id = plan_doc.get('plan_id', 'tier_trial')
            
            # Plan limitini al (basit kontrol)
            quota_limit = 50  # Default trial limit
            if plan_id == 'tier_premium':
                quota_limit = 500
            elif plan_id == 'tier_business':
                quota_limit = 2000
            elif plan_id == 'tier_enterprise':
                quota_limit = 999999  # Unlimited
            
            # Kota kontrolü
            if current_usage >= quota_limit:
                return {"success": False, "message": f"❌ Aylık randevu limitinize ulaştınız ({quota_limit}). Paketinizi yükseltmeniz gerekmektedir."}
            
            # Kullanımı artır
            await db.organization_plans.update_one(
                {"organization_id": org_id},
                {"$inc": {"quota_usage": 1}}
            )
            quota_incremented = True
            logger.info(f"✅ Quota incremented for org {org_id}: {current_usage + 1}/{quota_limit}")
        
        service = await db.services.find_one({"id": service_id, "organization_id": org_id})
        if not service:
            # Kota artırıldı ama hizmet bulunamadı, geri al
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": org_id},
                    {"$inc": {"quota_usage": -1}}
                )
            return {"success": False, "message": "❌ Hizmet bulunamadı"}
        
        # Geçmiş tarih kontrolü
        turkey_tz = ZoneInfo("Europe/Istanbul")
        now = datetime.now(turkey_tz)
        apt_dt = datetime.strptime(f"{apt_date} {apt_time}", "%Y-%m-%d %H:%M").replace(tzinfo=turkey_tz)
        if apt_dt < now:
            # Kota geri al
            if plan_doc:
                await db.organization_plans.update_one(
                    {"organization_id": org_id},
                    {"$inc": {"quota_usage": -1}}
                )
            return {"success": False, "message": "⚠️ Geçmiş tarihe randevu alınamaz"}
        
        # Personel atama
        if not staff_id or staff_id == "farketmez":
            staff_list = await db.users.find({
                "organization_id": org_id, "role": {"$in": ["admin", "staff"]}, "status": "active"
            }).to_list(100)
            
            for s in staff_list:
                conflict = await db.appointments.find_one({
                    "organization_id": org_id, "staff_member_id": s['username'],
                    "appointment_date": apt_date, "appointment_time": apt_time,
                    "status": {"$ne": "İptal Edildi"}
                })
                if not conflict:
                    staff_id = s['username']
                    staff_name = s.get('full_name', s['username'])
                    break
            
            if not staff_id:
                # Kota geri al
                if plan_doc:
                    await db.organization_plans.update_one(
                        {"organization_id": org_id},
                        {"$inc": {"quota_usage": -1}}
                    )
                return {"success": False, "message": "⚠️ Müsait personel yok"}
        else:
            staff = await db.users.find_one({"username": staff_id, "organization_id": org_id})
            if not staff:
                # Kota geri al
                if plan_doc:
                    await db.organization_plans.update_one(
                        {"organization_id": org_id},
                        {"$inc": {"quota_usage": -1}}
                    )
                return {"success": False, "message": "❌ Personel bulunamadı"}
            
            conflict = await db.appointments.find_one({
                "organization_id": org_id, "staff_member_id": staff_id,
                "appointment_date": apt_date, "appointment_time": apt_time,
                "status": {"$ne": "İptal Edildi"}
            })
            if conflict:
                # Kota geri al
                if plan_doc:
                    await db.organization_plans.update_one(
                        {"organization_id": org_id},
                        {"$inc": {"quota_usage": -1}}
                    )
                return {"success": False, "message": f"⚠️ Bu saatte randevu var"}
            
            staff_name = staff.get('full_name', staff_id)
        
        # Randevu oluştur
        apt = {
            "id": str(uuid.uuid4()), "organization_id": org_id,
            "customer_name": customer_name, "phone": phone, "address": "",
            "service_id": service_id, "service_name": service['name'],
            "service_price": service['price'], "duration": service['duration'],
            "appointment_date": apt_date, "appointment_time": apt_time,
            "notes": notes, "status": "Bekliyor",
            "staff_member_id": staff_id, "staff_member_name": staff_name,
            "reminder_sent": False, "created_at": datetime.now(timezone.utc).isoformat(),
            "service_duration": service['duration']
        }
        await db.appointments.insert_one(apt)
        
        # SMS gönder - Onay mesajı
        try:
            from server import send_sms, build_sms_message
            settings_data = await db.settings.find_one({"organization_id": org_id})
            if settings_data:
                company_name = settings_data.get("company_name", "İşletmeniz")
                support_phone = settings_data.get("support_phone", "Destek")
            else:
                company_name = "İşletmeniz"
                support_phone = "Destek"
            
            sms_message = build_sms_message(
                company_name, customer_name,
                apt_date, apt_time,
                service['name'], support_phone, sms_type="confirmation"
            )
            send_sms(phone, sms_message)
            logger.info(f"✅ SMS sent to {phone} for appointment {apt['id']}")
        except Exception as e:
            logger.error(f"SMS send error: {e}")
        
        # Websocket ile tüm organizasyon kullanıcılarına bildir
        if sio:
            try:
                # MongoDB _id'yi kaldır (JSON serializable değil)
                apt_clean = {k: v for k, v in apt.items() if k != '_id'}
                # Room'a emit et (org_ prefix ile)
                room_name = f"org_{org_id}"
                await sio.emit('appointment_created', {
                    "appointment": apt_clean,
                    "organization_id": org_id
                }, to=room_name)
                logger.info(f"✅ Websocket: appointment_created emitted to room {room_name}")
            except Exception as e:
                logger.error(f"Websocket emit error: {e}")
        
        return {
            "success": True,
            "message": f"✅ Randevu oluşturuldu! {customer_name} - {apt_date} {apt_time} ({staff_name})",
            "appointment": apt
        }
    except Exception as e:
        logger.error(f"create_appointment_tool error: {e}")
        # Kota artırıldıysa geri al
        if quota_incremented and plan_doc:
            try:
                await db.organization_plans.update_one(
                    {"organization_id": org_id},
                    {"$inc": {"quota_usage": -1}}
                )
                logger.info(f"✅ Quota rolled back for org {org_id} due to error")
            except Exception as rollback_error:
                logger.error(f"Failed to rollback quota: {rollback_error}")
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


async def cancel_appointment_tool(db, org_id: str, apt_id: str) -> Dict:
    """Randevu iptal et (durumu değiştirir, randevuyu silmez)"""
    try:
        apt = await db.appointments.find_one({"id": apt_id, "organization_id": org_id})
        if not apt:
            return {"success": False, "message": "❌ Randevu bulunamadı"}
        
        await db.appointments.update_one({"id": apt_id}, {"$set": {"status": "İptal Edildi"}})
        
        # Websocket ile tüm organizasyon kullanıcılarına bildir
        if sio:
            try:
                room_name = f"org_{org_id}"
                await sio.emit('appointment_cancelled', {
                    "appointment_id": apt_id,
                    "organization_id": org_id,
                    "customer_name": apt.get('customer_name'),
                    "appointment_date": apt.get('appointment_date')
                }, to=room_name)
                logger.info(f"✅ Websocket: appointment_cancelled emitted to room {room_name}")
            except Exception as e:
                logger.error(f"Websocket emit error: {e}")
        
        return {
            "success": True,
            "message": f"✅ Randevu iptal edildi: {apt.get('customer_name')} - {apt.get('appointment_date')}"
        }
    except Exception as e:
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


async def delete_appointment_tool(db, org_id: str, apt_id: str) -> Dict:
    """Randevuyu tamamen sil"""
    try:
        apt = await db.appointments.find_one({"id": apt_id, "organization_id": org_id})
        if not apt:
            return {"success": False, "message": "❌ Randevu bulunamadı"}
        
        customer_name = apt.get('customer_name')
        appointment_date = apt.get('appointment_date')
        
        await db.appointments.delete_one({"id": apt_id, "organization_id": org_id})
        
        # Websocket ile tüm organizasyon kullanıcılarına bildir
        if sio:
            try:
                room_name = f"org_{org_id}"
                await sio.emit('appointment_deleted', {
                    "appointment_id": apt_id,
                    "organization_id": org_id,
                    "customer_name": customer_name,
                    "appointment_date": appointment_date
                }, to=room_name)
                logger.info(f"✅ Websocket: appointment_deleted emitted to room {room_name}")
            except Exception as e:
                logger.error(f"Websocket emit error: {e}")
        
        return {
            "success": True,
            "message": f"✅ Randevu silindi: {customer_name} - {appointment_date}"
        }
    except Exception as e:
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


async def add_customer_tool(db, org_id: str, name: str, phone: str) -> Dict:
    """Müşteri ekle"""
    try:
        exists = await db.customers.find_one({"organization_id": org_id, "phone": phone})
        if exists:
            return {"success": False, "message": f"⚠️ {phone} kayıtlı"}
        
        customer = {
            "id": str(uuid.uuid4()), "organization_id": org_id,
            "name": name, "phone": phone,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.customers.insert_one(customer)
        
        # Websocket ile tüm organizasyon kullanıcılarına bildir
        if sio:
            try:
                room_name = f"org_{org_id}"
                await sio.emit('customer_added', {
                    "customer": {"name": name, "phone": phone},
                    "organization_id": org_id
                }, to=room_name)
                logger.info(f"✅ Websocket: customer_added emitted to room {room_name}")
            except Exception as e:
                logger.error(f"Websocket emit error: {e}")
        
        return {"success": True, "message": f"✅ Müşteri eklendi: {name} ({phone})"}
    except Exception as e:
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


async def delete_customer_tool(db, org_id: str, phone: str) -> Dict:
    """Müşteri sil"""
    try:
        customer = await db.customers.find_one({"organization_id": org_id, "phone": phone})
        if not customer:
            return {"success": False, "message": "❌ Müşteri bulunamadı"}
        
        await db.customers.delete_one({"organization_id": org_id, "phone": phone})
        return {"success": True, "message": f"✅ Müşteri silindi: {customer.get('name')}"}
    except Exception as e:
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


async def get_dashboard_status_tool(db, org_id: str, user_role: str, username: str) -> Dict:
    """Dashboard durum bilgisi - Rol bazlı (+ Hizmet listesi)"""
    try:
        turkey_tz = ZoneInfo("Europe/Istanbul")
        today = datetime.now(turkey_tz).date().isoformat()
        
        # Hizmet listesini al (hem admin hem staff görebilir)
        services = await db.services.find({"organization_id": org_id}).to_list(1000)
        services_list = [
            {
                "id": s.get('id'),
                "name": s.get('name'),
                "price": s.get('price'),
                "duration": s.get('duration')
            }
            for s in services
        ]
        
        # Müşteri listesini al (hem admin hem staff görebilir)
        customers = await db.customers.find({"organization_id": org_id}).to_list(1000)
        customers_list = [
            {
                "name": c.get('name'),
                "phone": c.get('phone')
            }
            for c in customers
        ]
        
        if user_role.lower() == "staff":
            # Personel: Sadece kendi verileri (bugün + yakın tarihler)
            from datetime import timedelta
            tomorrow = (datetime.now(turkey_tz) + timedelta(days=1)).date().isoformat()
            
            apts = await db.appointments.find({
                "organization_id": org_id,
                "staff_member_id": username,
                "appointment_date": {"$gte": today, "$lte": tomorrow},
                "status": {"$ne": "İptal Edildi"}
            }).to_list(1000)
            
            total_revenue = sum(apt.get('price', 0) for apt in apts if apt.get('status') == 'Tamamlandı')
            
            # Randevuları basitleştir (AI için kolay parse)
            appointments_simple = [
                {
                    "id": apt.get('id'),
                    "customer_name": apt.get('customer_name'),
                    "phone": apt.get('phone'),
                    "date": apt.get('appointment_date'),
                    "time": apt.get('appointment_time'),
                    "service": apt.get('service_name'),
                    "status": apt.get('status')
                }
                for apt in apts
            ]
            
            return {
                "success": True,
                "role": "staff",
                "message": f"📊 Bugün ve yarın {len(apts)} randevunuz var",
                "data": {
                    "today_appointments": len(apts),
                    "today_revenue": total_revenue,
                    "appointments": appointments_simple,
                    "services": services_list,
                    "customers": customers_list
                }
            }
        else:
            # Admin: Tüm işletme verileri (bugün + yakın tarihler)
            from datetime import timedelta
            tomorrow = (datetime.now(turkey_tz) + timedelta(days=1)).date().isoformat()
            
            apts = await db.appointments.find({
                "organization_id": org_id,
                "appointment_date": {"$gte": today, "$lte": tomorrow},
                "status": {"$ne": "İptal Edildi"}
            }).to_list(1000)
            
            completed = [a for a in apts if a.get('status') == 'Tamamlandı']
            pending = [a for a in apts if a.get('status') == 'Bekliyor']
            total_revenue = sum(a.get('price', 0) for a in completed)
            
            # Aylık toplam
            month_start = today[:7] + "-01"
            monthly_apts = await db.appointments.find({
                "organization_id": org_id,
                "appointment_date": {"$gte": month_start},
                "status": "Tamamlandı"
            }).to_list(10000)
            monthly_revenue = sum(a.get('price', 0) for a in monthly_apts)
            
            # Personel listesini al
            staff_list_raw = await db.users.find({
                "organization_id": org_id,
                "role": {"$in": ["admin", "staff"]},
                "status": "active"
            }).to_list(1000)
            
            staff_list = [
                {
                    "username": s.get('username'),
                    "full_name": s.get('full_name', s.get('username')),
                    "role": s.get('role'),
                    "phone": s.get('phone', '')
                }
                for s in staff_list_raw
            ]
            
            # Personel performansını hesapla (bugün + bu ay)
            staff_performance = []
            for staff in staff_list_raw:
                staff_username = staff.get('username')
                
                # Bugün ve yarın randevuları
                today_staff_apts = [a for a in apts if a.get('staff_member_id') == staff_username]
                
                # Aylık randevuları
                monthly_staff_apts = [a for a in monthly_apts if a.get('staff_member_id') == staff_username]
                monthly_staff_revenue = sum(a.get('price', 0) for a in monthly_staff_apts)
                
                staff_performance.append({
                    "username": staff_username,
                    "full_name": staff.get('full_name', staff_username),
                    "today_appointments": len(today_staff_apts),
                    "monthly_appointments": len(monthly_staff_apts),
                    "monthly_revenue": monthly_staff_revenue
                })
            
            # Randevuları basitleştir (AI için kolay parse)
            appointments_simple = [
                {
                    "id": apt.get('id'),
                    "customer_name": apt.get('customer_name'),
                    "phone": apt.get('phone'),
                    "date": apt.get('appointment_date'),
                    "time": apt.get('appointment_time'),
                    "service": apt.get('service_name'),
                    "status": apt.get('status'),
                    "staff": apt.get('staff_member_name', apt.get('staff_member_id', 'Atanmamış'))
                }
                for apt in apts
            ]
            
            return {
                "success": True,
                "role": "admin",
                "message": f"📊 Bugün ve yarın {len(apts)} randevu, {total_revenue}₺ gelir",
                "data": {
                    "today_appointments": len(apts),
                    "today_completed": len(completed),
                    "today_pending": len(pending),
                    "today_revenue": total_revenue,
                    "monthly_revenue": monthly_revenue,
                    "monthly_appointments": len(monthly_apts),
                    "appointments": appointments_simple,
                    "services": services_list,
                    "customers": customers_list,
                    "staff_list": staff_list,
                    "staff_performance": staff_performance
                }
            }
    except Exception as e:
        logger.error(f"get_dashboard_status_tool error: {e}")
        return {"success": False, "message": f"❌ Hata: {str(e)}"}


# === GEMINI TOOLS DECLARATION ===
def get_gemini_tools():
    """Gemini için tool tanımlamaları - Gemini SDK formatında"""
    from google.generativeai.types import FunctionDeclaration, Tool
    
    create_appointment_func = FunctionDeclaration(
        name="create_appointment",
        description="Yeni randevu oluştur. MUTLAKA önce get_dashboard_status çağırıp müşteri telefon numarasını ve hizmet ID'sini al. Müsaitlik kontrolü yapar, personel atar.",
        parameters={
            "type": "object",
            "properties": {
                "customer_name": {"type": "string", "description": "Müşteri adı"},
                "phone": {"type": "string", "description": "Telefon numarası - get_dashboard_status'tan customers listesinden AL! Müşteri sistemde kayıtlıysa ASLA kullanıcıya sorma! (Format: 05XXXXXXXXX)"},
                "service_id": {"type": "string", "description": "Hizmet ID'si (get_dashboard_status'tan services listesinden al)"},
                "appointment_date": {"type": "string", "description": "Randevu tarihi - SADECE YYYY-MM-DD formatı (örnek: 2025-11-20, ASLA 20-11-2025 yazma!)"},
                "appointment_time": {"type": "string", "description": "Randevu saati - SADECE HH:MM formatı (örnek: 14:30)"},
                "staff_id": {"type": "string", "description": "Personel username (opsiyonel, 'farketmez' olabilir)"},
                "notes": {"type": "string", "description": "Randevu notları (opsiyonel)"}
            },
            "required": ["customer_name", "phone", "service_id", "appointment_date", "appointment_time"]
        }
    )
    
    cancel_appointment_func = FunctionDeclaration(
        name="cancel_appointment",
        description="Randevuyu iptal et (durumu 'İptal Edildi' olarak değiştirir, veritabanından silmez)",
        parameters={
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "Randevu ID'si"}
            },
            "required": ["appointment_id"]
        }
    )
    
    delete_appointment_func = FunctionDeclaration(
        name="delete_appointment",
        description="Randevuyu tamamen sil (veritabanından kaldırır). Kullanıcı 'sil' dediğinde kullan.",
        parameters={
            "type": "object",
            "properties": {
                "appointment_id": {"type": "string", "description": "Randevu ID'si"}
            },
            "required": ["appointment_id"]
        }
    )
    
    add_customer_func = FunctionDeclaration(
        name="add_customer",
        description="Yeni müşteri ekle. ÇOK ÖNEMLİ: Müşteri ekledikten HEMEN SONRA get_dashboard_status çağırmalısın ki yeni müşteriyi customers listesinde göresin!",
        parameters={
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Müşteri adı"},
                "phone": {"type": "string", "description": "Telefon numarası"}
            },
            "required": ["name", "phone"]
        }
    )
    
    delete_customer_func = FunctionDeclaration(
        name="delete_customer",
        description="Müşteri sil (önce onay iste!)",
        parameters={
            "type": "object",
            "properties": {
                "phone": {"type": "string", "description": "Telefon numarası"}
            },
            "required": ["phone"]
        }
    )
    
    get_dashboard_func = FunctionDeclaration(
        name="get_dashboard_status",
        description="Dashboard durum bilgisi - Randevular, gelir, HİZMET LİSTESİ, MÜŞTERİ LİSTESİ döndürür. Kullanıcı 'hangi hizmetler var?', 'müşteriler', 'Ahmet için randevu oluştur' dediğinde bu tool'u çağır. Müşteri telefon numaralarını buradan al. Rol bazlı: staff sadece kendisini, admin herkesi görebilir.",
        parameters={
            "type": "object",
            "properties": {},
            "required": []
        }
    )
    
    return Tool(function_declarations=[
        create_appointment_func,
        cancel_appointment_func,
        delete_appointment_func,
        add_customer_func,
        delete_customer_func,
        get_dashboard_func
    ])


# === MAIN CHAT FUNCTION ===
async def chat_with_ai(
    db,
    user_message: str,
    chat_history: List[Dict],
    user_role: str,
    username: str,
    organization_id: str,
    organization_name: str = "İşletme"
) -> Dict[str, Any]:
    """
    AI ile sohbet et - Tool calling destekli
    
    Args:
        db: MongoDB database instance
        user_message: Kullanıcının mesajı
        chat_history: Önceki mesajlar [{"role": "user"/"model", "parts": [{"text": "..."}]}]
        user_role: admin veya staff
        username: Kullanıcı adı (staff için kendi verilerini filtrelemek için)
        organization_id: Organizasyon ID
        organization_name: Organizasyon adı
    
    Returns:
        {"success": bool, "message": str, "history": list}
    """
    try:
        if not GOOGLE_GEMINI_KEY:
            return {"success": False, "message": "❌ AI servisi yapılandırılmamış"}
        
        # System instruction oluştur - Kısa ve net
        system_instruction = get_system_instruction(user_role, username, organization_name)
        
        # Safety settings - İş uygulaması için rahatlatılmış
        from google.generativeai.types import HarmCategory, HarmBlockThreshold
        
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
        }
        
        # Model oluştur (Tool calling ile)
        model = genai.GenerativeModel(
            model_name='gemini-2.5-flash',
            system_instruction=system_instruction,
            tools=get_gemini_tools(),
            safety_settings=safety_settings
        )
        
        # Chat başlat
        chat = model.start_chat(history=chat_history)
        
        # İlk yanıt al
        response = chat.send_message(user_message)
        
        # Debug: Response detaylarını logla
        logger.info(f"Response candidates: {len(response.candidates) if hasattr(response, 'candidates') else 0}")
        if hasattr(response, 'candidates') and response.candidates:
            logger.info(f"First candidate finish_reason: {response.candidates[0].finish_reason}")
            if hasattr(response.candidates[0].content, 'parts'):
                logger.info(f"Parts count: {len(response.candidates[0].content.parts)}")
        
        # Function calling kontrolü
        max_iterations = 5  # Sonsuz döngü önleme
        iteration = 0
        function_responses = []  # Tüm function response'ları sakla
        
        while iteration < max_iterations:
            # Function call var mı? - Güvenli erişim
            function_calls = []
            if hasattr(response, 'parts') and response.parts:
                for part in response.parts:
                    if hasattr(part, 'function_call') and part.function_call:
                        function_calls.append(part.function_call)
                        logger.info(f"AI Tool Call: {part.function_call.name} with args: {dict(part.function_call.args)}")
            
            if not function_calls:
                # Function call yok, cevap hazır
                logger.info("No function calls, response is final")
                break
            
            # Function call'ları işle
            for fc in function_calls:
                func_name = fc.name
                func_args = dict(fc.args)
                
                # Tool'u çalıştır
                result = None
                if func_name == "create_appointment":
                    result = await create_appointment_tool(
                        db, organization_id,
                        func_args.get('customer_name'),
                        func_args.get('phone'),
                        func_args.get('service_id'),
                        func_args.get('appointment_date'),
                        func_args.get('appointment_time'),
                        func_args.get('staff_id'),
                        func_args.get('notes', '')
                    )
                elif func_name == "cancel_appointment":
                    result = await cancel_appointment_tool(
                        db, organization_id,
                        func_args.get('appointment_id')
                    )
                elif func_name == "delete_appointment":
                    result = await delete_appointment_tool(
                        db, organization_id,
                        func_args.get('appointment_id')
                    )
                elif func_name == "add_customer":
                    result = await add_customer_tool(
                        db, organization_id,
                        func_args.get('name'),
                        func_args.get('phone')
                    )
                elif func_name == "delete_customer":
                    result = await delete_customer_tool(
                        db, organization_id,
                        func_args.get('phone')
                    )
                elif func_name == "get_dashboard_status":
                    result = await get_dashboard_status_tool(
                        db, organization_id, user_role, username
                    )
                else:
                    result = {"success": False, "message": f"❌ Bilinmeyen fonksiyon: {func_name}"}
                
                logger.info(f"Tool Result: {result}")
                
                # Function response hazırla
                function_responses.append({
                    'function_call': func_name,
                    'function_response': result
                })
            
            # Tool sonuçlarını AI'a metin olarak gönder
            import json
            from bson import ObjectId as BsonObjectId
            
            # MongoDB ObjectId ve datetime'ı serialize edebilen custom encoder
            def json_serial(obj):
                if isinstance(obj, BsonObjectId):
                    return str(obj)
                if isinstance(obj, datetime):
                    return obj.isoformat()
                raise TypeError(f"Type {type(obj)} not serializable")
            
            tool_results_text = f"Tool sonuçları:\n"
            for fr in function_responses:
                try:
                    json_str = json.dumps(fr['function_response'], ensure_ascii=False, default=json_serial)
                    tool_results_text += f"\n{fr['function_call']} → {json_str}\n"
                except Exception as e:
                    logger.error(f"JSON serialization error: {e}")
                    tool_results_text += f"\n{fr['function_call']} → {str(fr['function_response'])}\n"
            
            tool_results_text += "\nBu bilgileri kullanarak kullanıcıya detaylı ve anlaşılır bir yanıt ver."
            
            # Sonuçları modele gönder
            response = chat.send_message(tool_results_text)
            
            iteration += 1
        
        # Son cevabı al - Güvenli erişim
        final_text = None
        try:
            if hasattr(response, 'text') and response.text:
                final_text = response.text
            elif hasattr(response, 'parts') and response.parts:
                # Parts'tan text çıkar
                for part in response.parts:
                    if hasattr(part, 'text'):
                        final_text = part.text
                        break
            elif hasattr(response, 'candidates') and response.candidates:
                # Candidate içinden text al
                for candidate in response.candidates:
                    if hasattr(candidate.content, 'parts'):
                        for part in candidate.content.parts:
                            if hasattr(part, 'text'):
                                final_text = part.text
                                break
        except Exception as e:
            logger.warning(f"Response text extraction failed: {e}")
        
        # Eğer AI yanıt vermediyse, tool result'larından manuel yanıt oluştur
        if not final_text and function_responses:
            logger.info("AI boş yanıt döndü, tool result'larından yanıt oluşturuluyor")
            final_text = ""
            for fr in function_responses:
                result = fr['function_response']
                if result.get('success'):
                    final_text += result.get('message', '') + "\n"
                else:
                    final_text += result.get('message', '❌ İşlem başarısız') + "\n"
            final_text = final_text.strip() or "✅ İşlem tamamlandı."
        elif not final_text:
            final_text = "✅ İşlem tamamlandı, ancak yanıt okunamadı."
        
        # History'yi serialize edilebilir formata çevir
        serializable_history = []
        for msg in chat.history:
            try:
                msg_dict = {
                    "role": msg.role,
                    "parts": []
                }
                for part in msg.parts:
                    if hasattr(part, 'text'):
                        msg_dict["parts"].append({"text": part.text})
                    elif hasattr(part, 'function_call'):
                        msg_dict["parts"].append({
                            "function_call": {
                                "name": part.function_call.name,
                                "args": dict(part.function_call.args)
                            }
                        })
                    elif hasattr(part, 'function_response'):
                        msg_dict["parts"].append({
                            "function_response": {
                                "name": part.function_response.name,
                                "response": dict(part.function_response.response)
                            }
                        })
                serializable_history.append(msg_dict)
            except Exception as e:
                logger.warning(f"Failed to serialize history message: {e}")
                continue
        
        return {
            "success": True,
            "message": final_text,
            "history": serializable_history
        }
    
    except Exception as e:
        logger.error(f"chat_with_ai error: {e}", exc_info=True)
        return {
            "success": False,
            "message": f"❌ AI hatası: {str(e)}"
        }
