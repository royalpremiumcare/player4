import { useState, useEffect } from "react";
import { Settings as SettingsIcon, Clock, Save, Phone, Mail, MessageSquare, Users } from "lucide-react"; 
import { toast } from "sonner";
import api from "../api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";

const Settings = () => {
  
  const [settings, setSettings] = useState({
    // İşletme Bilgileri
    company_name: "", // Artık dinamik
    support_phone: "", // Artık dinamik
    feedback_url: "", // Artık dinamik
    logo_url: "", // Logo URL
    slug: "", // Slug

    // Randevu/Takvim Ayarları
    work_start_hour: 7,
    work_end_hour: 3,
    appointment_interval: 30,
    
    // Model D: Personel Seçimi Ayarı
    customer_can_choose_staff: false,
    
    // SMS Hatırlatma
    sms_reminder_hours: 1.0,
  });
  
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data); 
    } catch (error) {
      if (error.response && error.response.status !== 401) {
        toast.error("Ayarlar yüklenemedi. Sunucu hatası.");
      }
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    // Veri Kontrolleri
    if (settings.work_start_hour < 0 || settings.work_start_hour > 23 ||
        settings.work_end_hour < 0 || settings.work_end_hour > 23) {
      toast.error("Başlangıç/Bitiş saati 0-23 arası olmalı");
      return;
    }
    if (settings.appointment_interval < 15 || settings.appointment_interval > 120) {
      toast.error("Randevu aralığı 15-120 dakika arası olmalı");
      return;
    }
    // İşletme adı kontrolü
    if (!settings.company_name) {
        toast.error("İşletme Adı boş bırakılamaz.");
        return;
    }

    setLoading(true);
    try {
      await api.put("/settings", settings); 
      toast.success("Ayarlar başarıyla kaydedildi");
      
    } catch (error) {
      console.error(error);
      toast.error("Ayarlar kaydedilemedi. Lütfen tüm alanları kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Ayarlar
        </h2>
        <p className="text-sm text-gray-600 mt-1">İşletme ve randevu ayarlarınızı yönetin</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-8">
          
          {/* 1. İŞLETME BİLGİLERİ VE İLETİŞİM */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <MessageSquare className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">İşletme & İletişim Ayarları</h3>
                <p className="text-sm text-gray-600">SMS metinlerinde ve iletişimde görünecek bilgiler</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="company-name">İşletme Adı</Label>
                <Input
                  id="company-name"
                  type="text"
                  value={settings.company_name}
                  onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500">Müşterilerinize gönderilen SMS'lerde yer alır.</p>
                {settings.slug && (
                  <div className="mt-2 p-2 bg-blue-50 rounded border border-blue-200">
                    <p className="text-xs text-blue-700">
                      <strong>Public Booking Linkiniz:</strong><br/>
                      <code className="text-xs">/book/{settings.slug}</code>
                    </p>
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ İşletme adını değiştirirseniz link otomatik güncellenir
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="support-phone">
                  <Phone className="w-4 h-4 inline mr-2" />
                  Destek Telefonu
                </Label>
                <Input
                  id="support-phone"
                  type="text"
                  value={settings.support_phone}
                  onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500">Müşterilerin size ulaşacağı numara.</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="feedback-url">
                  <Mail className="w-4 h-4 inline mr-2" />
                  Geri Bildirim URL'i (Opsiyonel)
                </Label>
                <Input
                  id="feedback-url"
                  type="url"
                  placeholder="https://gorsel.urun.linkiniz"
                  value={settings.feedback_url || ""}
                  onChange={(e) => setSettings({ ...settings, feedback_url: e.target.value })}
                />
                <p className="text-xs text-gray-500">Hizmet sonrası müşteriye gönderilen link.</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="sms-reminder">
                  <MessageSquare className="w-4 h-4 inline mr-2" />
                  SMS Hatırlatma (Saat Önce)
                </Label>
                <select
                  id="sms-reminder"
                  value={settings.sms_reminder_hours}
                  onChange={(e) => setSettings({ ...settings, sms_reminder_hours: parseFloat(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="0.5">30 Dakika Önce</option>
                  <option value="1">1 Saat Önce</option>
                  <option value="2">2 Saat Önce</option>
                  <option value="3">3 Saat Önce</option>
                  <option value="6">6 Saat Önce</option>
                  <option value="12">12 Saat Önce</option>
                  <option value="24">24 Saat Önce</option>
                </select>
                <p className="text-xs text-gray-500">
                  Randevudan kaç saat önce hatırlatma SMS'i gönderilsin
                </p>
              </div>
            </div>
          </div>
          
          {/* AYIRICI */}
          <hr /> 

          {/* 2. ÇALIŞMA SAATLERİ VE TAKVİM AYARLARI */}
          {/* MODEL D: Personel Seçimi Ayarı */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Personel Seçimi</h3>
                <p className="text-sm text-gray-600">Müşteriler randevu alırken personel seçebilsin mi?</p>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg border border-purple-200">
              <div>
                <Label htmlFor="staff-choice" className="text-base font-medium text-gray-900">
                  Müşteriler Personel Seçebilir
                </Label>
                <p className="text-sm text-gray-600 mt-1">
                  {settings.customer_can_choose_staff 
                    ? "✅ AÇIK: Müşteriler randevu alırken personel seçebilir" 
                    : "❌ KAPALI: Sistem otomatik personel atar"}
                </p>
              </div>
              <Switch
                id="staff-choice"
                checked={settings.customer_can_choose_staff}
                onCheckedChange={(checked) => setSettings({ ...settings, customer_can_choose_staff: checked })}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Takvim & Saat Ayarları</h3>
                <p className="text-sm text-gray-600">Randevu alabileceğiniz mesai saatlerini belirleyin</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="start-hour">Başlangıç Saati</Label>
                <Input
                  id="start-hour"
                  type="number"
                  min="0"
                  max="23"
                  value={settings.work_start_hour}
                  onChange={(e) => setSettings({ ...settings, work_start_hour: parseInt(e.target.value) })}
                  required
                />
                <p className="text-xs text-gray-500">0-23 (Örn: 7 = 07:00)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="end-hour">Bitiş Saati</Label>
                <Input
                  id="end-hour"
                  type="number"
                  min="0"
                  max="23"
                  value={settings.work_end_hour}
                  onChange={(e) => setSettings({ ...settings, work_end_hour: parseInt(e.target.value) })}
                  required
                />
                <p className="text-xs text-gray-500">0-23 (Örn: 3 = 03:00 - ertesi gün)</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="interval">Randevu Aralığı (Dakika)</Label>
                <Input
                  id="interval"
                  type="number"
                  min="15"
                  max="120"
                  step="15"
                  value={settings.appointment_interval}
                  onChange={(e) => setSettings({ ...settings, appointment_interval: parseInt(e.target.value) })}
                  required
                />
                <p className="text-xs text-gray-500">Randevular arası süre (15-120 dk)</p>
              </div>
            </div>
          </div>


          {/* KAYDET BUTONU */}
          <Button
            data-testid="save-settings-button"
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? "Kaydediliyor..." : "Ayarları Kaydet"}
          </Button>
        </form>
      </Card>
    </div>
  );
};

export default Settings;
