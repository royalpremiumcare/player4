"""
Twilio WhatsApp Business API Entegrasyonu
Randevu bilgilendirmeleri için WhatsApp mesajları gönderir.
"""

import os
import logging
import re
from typing import Optional, Union
from twilio.rest import Client
from twilio.base.exceptions import TwilioException
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

# Twilio WhatsApp konfigürasyonu
TWILIO_ACCOUNT_SID = os.getenv('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.getenv('TWILIO_AUTH_TOKEN')
TWILIO_WHATSAPP_FROM = os.getenv('TWILIO_FROM_NUMBER', 'whatsapp:+14155238886')  # Sandbox default
WHATSAPP_ENABLED = os.getenv('WHATSAPP_ENABLED', 'true').lower() in ('1', 'true', 'yes')

# Logger
logger = logging.getLogger(__name__)

def format_phone_number(phone: str) -> str:
    """
    Telefon numarasını Twilio WhatsApp formatına çevirir.
    
    Args:
        phone (str): Ham telefon numarası (örn: "5551234567", "+905551234567")
    
    Returns:
        str: Twilio formatında numara (örn: "whatsapp:+905551234567")
    """
    # Sadece rakamları al
    clean_phone = re.sub(r'\D', '', phone)
    
    # Türkiye için format kontrolü
    if clean_phone.startswith('90'):
        # Zaten +90 ile başlıyor
        formatted = f"+{clean_phone}"
    elif clean_phone.startswith('5') and len(clean_phone) == 10:
        # 5XXXXXXXXX formatında, +90 ekle
        formatted = f"+90{clean_phone}"
    elif len(clean_phone) == 11 and clean_phone.startswith('05'):
        # 05XXXXXXXXX formatında, 0'ı kaldır ve +90 ekle
        formatted = f"+90{clean_phone[1:]}"
    else:
        # Diğer durumlar için olduğu gibi kullan
        formatted = f"+{clean_phone}" if not clean_phone.startswith('+') else clean_phone
    
    return f"whatsapp:{formatted}"

def send_whatsapp_notification(to_number: str, message_body: str) -> Union[str, bool]:
    """
    WhatsApp mesajı gönderir.
    
    Args:
        to_number (str): Alıcı telefon numarası
        message_body (str): Gönderilecek mesaj içeriği
    
    Returns:
        Union[str, bool]: Başarılı ise Message SID, başarısız ise False
    """
    try:
        # WhatsApp devre dışı ise logla ve True döndür
        if not WHATSAPP_ENABLED:
            logger.info("WhatsApp messaging is disabled via WHATSAPP_ENABLED env. Skipping.")
            return True
        
        # API anahtarları kontrolü
        if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
            logger.error("Twilio credentials not found in environment variables")
            return False
        
        # Telefon numarasını formatla
        formatted_to = format_phone_number(to_number)
        
        # Mesaj uzunluğu kontrolü (WhatsApp için 1600 karakter limit)
        MAX_LENGTH = 1600
        if len(message_body) > MAX_LENGTH:
            message_body = message_body[:MAX_LENGTH] + "..."
            logger.warning(f"Message truncated to {MAX_LENGTH} characters")
        
        # Twilio client oluştur
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        
        # WhatsApp mesajı gönder
        message = client.messages.create(
            body=message_body,
            from_=TWILIO_WHATSAPP_FROM,
            to=formatted_to
        )
        
        logger.info(f"WhatsApp message sent successfully to {formatted_to}. SID: {message.sid}")
        return message.sid
        
    except TwilioException as e:
        logger.error(f"Twilio WhatsApp error for {to_number}: {str(e)}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error sending WhatsApp to {to_number}: {str(e)}")
        return False

def build_whatsapp_message(
    company_name: str,
    customer_name: str,
    service_name: str,
    appointment_date: str,
    appointment_time: str,
    support_phone: str,
    message_type: str = "confirmation"
) -> str:
    """
    WhatsApp mesaj şablonu oluşturur.
    
    Args:
        company_name (str): Şirket adı
        customer_name (str): Müşteri adı
        service_name (str): Hizmet adı
        appointment_date (str): Randevu tarihi
        appointment_time (str): Randevu saati
        support_phone (str): Destek telefonu
        message_type (str): Mesaj tipi ("confirmation", "reminder", "cancellation")
    
    Returns:
        str: Formatlanmış WhatsApp mesajı
    """
    # Tarih formatını düzenle
    try:
        from datetime import datetime
        date_obj = datetime.strptime(appointment_date, "%Y-%m-%d")
        formatted_date = date_obj.strftime("%d.%m.%Y")
    except:
        formatted_date = appointment_date
    
    # Mesaj tipine göre şablon seç
    if message_type == "confirmation":
        message = f"""🎉 *{company_name}*

Merhaba {customer_name},

Randevunuz başarıyla oluşturuldu! ✅

📅 *Tarih:* {formatted_date}
🕐 *Saat:* {appointment_time}
💼 *Hizmet:* {service_name}

Randevunuz için hazır olun. Herhangi bir sorunuz varsa bize ulaşabilirsiniz.

📞 *Bilgi/İptal:* {support_phone}

Teşekkürler! 🙏"""

    elif message_type == "reminder":
        message = f"""⏰ *Randevu Hatırlatması*

Merhaba {customer_name},

Randevunuz yaklaşıyor! 

📅 *Tarih:* {formatted_date}
🕐 *Saat:* {appointment_time}
💼 *Hizmet:* {service_name}
🏢 *{company_name}*

Lütfen randevunuz için hazır olun.

📞 *Bilgi/İptal:* {support_phone}"""

    elif message_type == "cancellation":
        message = f"""❌ *Randevu İptali*

Merhaba {customer_name},

Randevunuz iptal edilmiştir.

📅 *Tarih:* {formatted_date}
🕐 *Saat:* {appointment_time}
💼 *Hizmet:* {service_name}
🏢 *{company_name}*

Yeni randevu için bize ulaşabilirsiniz.

📞 *İletişim:* {support_phone}"""

    else:
        # Default mesaj
        message = f"""📋 *{company_name}*

Merhaba {customer_name},

Randevu bilgileriniz:

📅 *Tarih:* {formatted_date}
🕐 *Saat:* {appointment_time}
💼 *Hizmet:* {service_name}

📞 *İletişim:* {support_phone}"""

    return message

# Example Usage
if __name__ == "__main__":
    # Test mesajı
    test_message = build_whatsapp_message(
        company_name="Test Kuaför",
        customer_name="Ahmet Yılmaz",
        service_name="Saç Kesimi",
        appointment_date="2025-11-25",
        appointment_time="14:30",
        support_phone="0532 123 45 67",
        message_type="confirmation"
    )
    
    print("Test WhatsApp Mesajı:")
    print(test_message)
    print("\n" + "="*50 + "\n")
    
    # Test gönderimi (gerçek numara ile test edin)
    # result = send_whatsapp_notification("+905551234567", test_message)
    # print(f"Gönderim sonucu: {result}")
