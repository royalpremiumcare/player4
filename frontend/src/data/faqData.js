export const faqData = {
  // ===================================================================
  // 👑 ADMIN (İŞLETME SAHİBİ) İÇİN SIK SORULAN SORULAR (SIRALAMA GÜNCELLENDİ)
  // ===================================================================
  admin: [
    {
      id: "admin-1",
      question: "❓ PLANN'ı kullanmaya nasıl başlarım?",
      answer: "Panelinize ilk giriş yaptığınızda karşınıza çıkan <strong>Kurulum Sihirbazı</strong> (Setup Wizard) en hızlı yoludur. Orada hizmetlerinizi, fiyatlarınızı ve genel çalışma saatlerinizi 2 dakikada ayarlayabilirsiniz."
    },
    {
      id: "admin-7",
      question: "🔗 Müşterilerim benden nasıl online randevu alabilir?",
      answer: "<strong>Ayarlar > İşletme Bilgileri</strong> sayfasına gidin. Orada size özel <strong>'Randevu Linkiniz'</strong> (örn: plannapp.co/isletme-adi) bulunmaktadır. Bu linki kopyalayıp Instagram profilinize veya müşterilerinize gönderebilirsiniz."
    },
    {
      id: "admin-2",
      question: "💳 Deneme sürem bitiyor, nasıl abone olabilirim?",
      answer: "Panelinizde <strong>Ayarlar > Abonelik & Faturalandırma</strong> bölümüne gidin. İşletmenize en uygun olan 6 paketimizden (Standart, Pro vb.) birini seçerek aboneliğinizi başlatabilirsiniz."
    },
    {
      id: "admin-3",
      question: "✂️ Yeni bir hizmeti (örn: Manikür) sisteme nasıl eklerim?",
      answer: "<strong>Ayarlar > Hizmet Yönetimi</strong> sayfasına gidin. Sağ üstteki <strong>[ + Yeni Hizmet Ekle ]</strong> butonuna basın. Hizmetin adını, fiyatını ve en önemlisi <strong>Hizmet Süresini (Dakika)</strong> girin. Bu süre, takviminizin doğru çalışması için kritiktir."
    },
    {
      id: "admin-4",
      question: "👥 Yeni bir personeli sisteme nasıl davet ederim?",
      answer: "<strong>Ayarlar > Personel Yönetimi</strong> sayfasına gidin. <strong>[ + Personel Davet Et ]</strong> butonuna basın. Personelinizin adını ve e-posta adresini girin. Sistem, personelinize kendi şifresini belirlemesi için bir <strong>davet e-postası</strong> gönderecektir."
    },
    {
      id: "admin-5",
      question: "💰 Kasa (Finans) modülü nasıl çalışır?",
      answer: "Kasa, sizin için geliri <strong>otomatik</strong> toplar. Bir randevu 'Tamamlandı' olarak işaretlendiğinde, o hizmetin bedeli kasanıza 'Gelir' olarak işlenir. Sizin tek yapmanız gereken <strong>Giderler</strong> sekmesinden kira, fatura, malzeme gibi manuel harcamalarınızı girmektir."
    },
    {
      id: "admin-6",
      question: "💸 Personelime avans/maaş ödemesi yaptım, bunu nasıl işlerim?",
      answer: "<strong>Ayarlar > Kasa > Personel Hakedişleri</strong> sekmesine gidin. İlgili personelin kartındaki <strong>[ Ödeme Yap ]</strong> butonuna basın ve verdiğiniz tutarı (örn: 5000 TL) girin. Bu tutar hem personelin bakiyesinden düşer hem de kasanızdan 'Gider' olarak çıkar."
    }
  ],

  // ===================================================================
  // 👤 PERSONEL İÇİN SIK SORULAN SORULAR
  // ===================================================================
  personnel: [
    {
      id: "personnel-1",
      question: "✉️ Bana bir davet e-postası geldi, şimdi ne yapmalıyım?",
      answer: "İşletme sahibiniz sizi PLANN sistemine davet etti. Lütfen e-postadaki <strong>[ Şifremi Belirle ]</strong> linkine tıklayın. Güvenli bir şifre belirlediğiniz an hesabınız aktif olacak ve panele giriş yapabileceksiniz."
    },
    {
      id: "personnel-2",
      question: "🗓️ Bugünkü veya yarınki programımı nerede görebilirim?",
      answer: "<strong>[Anasayfa] (Dashboard)</strong> ekranındaki <strong>'Bugünün Akışı'</strong> kartında güncel programınızı görebilirsiniz. Tüm programınızı (geçmiş ve gelecek) görmek için ise alttaki <strong>[Takvim]</strong> ikonuna tıklayın. Takvim, sadece SİZE ait randevuları gösterecektir."
    },
    {
      id: "personnel-3",
      question: "➕ Yeni bir randevuyu nasıl eklerim?",
      answer: "Panelin altındaki büyük, mavi <strong>[ + ]</strong> butonuna basın. Açılan 3 adımlı sihirbazda 'Hizmet', 'Müşteri' ve 'Saat' seçmeniz yeterlidir. Personel alanı otomatik olarak size (adınıza) kilitlenmiştir."
    },
    {
      id: "personnel-4",
      question: "📊 Bugün ne kadar kazandırdığımı (ciro) görebilir miyim?",
      answer: "Evet. <strong>[Anasayfa] (Dashboard)</strong> ekranınızdaki <strong>'Hızlı Bakış'</strong> kartı, o gün tamamladığınız randevuların toplam tutarını (Toplam Hizmet Tutarı) size gösterir."
    },
    {
      id: "personnel-5",
      question: "🔒 Şifremi nasıl değiştirebilirim?",
      answer: "Panelin altındaki <strong>[Ayarlar]</strong> ikonuna tıklayın. Açılan menüden <strong>[Profilim]</strong> seçeneğine girerek şifrenizi güncelleyebilirsiniz."
    }
  ]
};

