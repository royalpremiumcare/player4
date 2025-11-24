import os
from twilio.rest import Client
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

# Bilgileri çek
account_sid = os.getenv('TWILIO_ACCOUNT_SID')
auth_token = os.getenv('TWILIO_AUTH_TOKEN')
from_whatsapp_number = os.getenv('TWILIO_FROM_NUMBER')

# Kendi numaranı buraya yaz (Başında +90 olsun, boşluk olmasın)
# Örn: '+90543XXXXXXX'
to_whatsapp_number = 'whatsapp:+905434793213' 

def send_test_message():
    try:
        client = Client(account_sid, auth_token)

        message = client.messages.create(
            body="Merhaba Fatih Bey! Bu mesaj PLANNAPP sisteminden Twilio ile gönderilmiştir. 🚀",
            from_=from_whatsapp_number,
            to=to_whatsapp_number
        )
        print(f"Mesaj Başarıyla Gönderildi! SID: {message.sid}")
        return True
    except Exception as e:
        print(f"Hata Oluştu: {e}")
        return False

if __name__ == "__main__":
    send_test_message()