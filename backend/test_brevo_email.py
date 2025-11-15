#!/usr/bin/env python3
"""
Brevo E-posta Gönderme Test Scripti - Güncellenmiş Profesyonel Şablon
"""
import os
import sys
from dotenv import load_dotenv
from pathlib import Path

# .env dosyasını yükle
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import sib_api_v3_sdk
from sib_api_v3_sdk.rest import ApiException
from pprint import pprint

# --- BREVO API YAPILANDIRMASI ---
brevo_api_key = os.environ.get('BREVO_API_KEY', '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')

if not brevo_api_key:
    print("❌ BREVO_API_KEY bulunamadı!")
    sys.exit(1)

print("🔑 Brevo API Key bulundu")

configuration = sib_api_v3_sdk.Configuration()
configuration.api_key['api-key'] = brevo_api_key

api_instance = sib_api_v3_sdk.TransactionalEmailsApi(sib_api_v3_sdk.ApiClient(configuration))

# --- GÜNCELLENMİŞ GÖNDERME FONKSİYONU ---
def send_welcome_email(user_email: str, user_name: str):
    # 1. GÖNDERİCİ VE ALICI
    sender = {"name": "PLANN", "email": "noreply@dev.royalpremiumcare.com"}
    to = [{"email": user_email, "name": user_name}]

    # 2. KONU (Subject) - DAHA PROFESYONEL
    subject = "PLANN'a Hoş Geldiniz! Ücretsiz Deneme Sürümünüz Başladı."

    # 3. HTML İÇERİĞİ (TAMAMEN YENİLENDİ)
    logo_url = "https://dev.royalpremiumcare.com/api/static/logo.png"
    dashboard_url = "https://dev.royalpremiumcare.com"

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

    # 4. E-POSTA NESNESİ
    send_smtp_email = sib_api_v3_sdk.SendSmtpEmail(
        to=to,
        sender=sender,
        subject=subject,
        html_content=html_content
    )

    # 5. GÖNDERİM
    try:
        api_response = api_instance.send_transac_email(send_smtp_email)
        print(f"✅ {user_email} adresine KURUMSAL hoş geldin e-postası gönderildi.")
        print("\n📋 API Response:")
        pprint(api_response)
        return api_response
    except ApiException as e:
        print(f"❌ E-posta gönderilirken hata oluştu: {e}")
        print(f"Status Code: {e.status}")
        print(f"Reason: {e.reason}")
        print(f"Body: {e.body}")
        raise
    except Exception as e:
        print(f"❌ Beklenmedik hata: {e}")
        import traceback
        traceback.print_exc()
        raise

# --- TEST İÇİN KULLANIM ---
if __name__ == "__main__":
    print("📧 Profesyonel hoş geldin e-postası gönderiliyor...")
    send_welcome_email("fatihsenyuz12@gmail.com", "Fatih Şenyüz")

