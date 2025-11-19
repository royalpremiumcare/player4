import google.generativeai as genai
import os

# 1. API Anahtarınızı buraya tanımlayın
GOOGLE_API_KEY = 'AIzaSyCr11ImAiIHH_g4-l0AtjdKBpq8ZXOjFfA'
genai.configure(api_key=GOOGLE_API_KEY)

# Önce mevcut modelleri listeleyelim
print("Mevcut Modeller:")
for m in genai.list_models():
    if 'generateContent' in m.supported_generation_methods:
        print(f"  - {m.name}")

print("\n" + "="*50 + "\n")

# 2. Modeli Seçin - gemini-1.5-flash tercih ediliyor
try:
    model = genai.GenerativeModel('gemini-2.5-flash')
    
    # 3. Asistana bir rol verelim ve test sorusu soralım
    prompt = """
    Sen 'Plann' adındaki randevu yönetim sisteminin akıllı asistanısın.
    Şu an bir kuaför salonu sahibiyle konuşuyorsun.
    Ona motive edici kısa bir merhaba de ve bugün nasıl yardımcı olabileceğini sor.
    """
    
    response = model.generate_content(prompt)
    print("Yapay Zeka Cevabı:\n" + "-"*30)
    print(response.text)
except Exception as e:
    print(f"Hata oluştu: {e}")