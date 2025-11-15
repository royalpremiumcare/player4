// İZOLASYON TESTİ - SetupWizard eski haline getirildi, sadece Switch ve Checkbox devre dışı
import React, { useState, useEffect, useCallback } from "react";
import { CheckCircle, ChevronRight, ChevronLeft, Briefcase } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
// TEST 7: Switch ve Checkbox geri açıldı
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox"; // <-- BUNU GERİ AÇ

const SetupWizard = ({ onComplete }) => {
  const { completeOnboarding, token } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [services, setServices] = useState([]);
  const [userInfo, setUserInfo] = useState(null);
  const [serviceUpdates, setServiceUpdates] = useState({});
  const [newService, setNewService] = useState({ name: "", price: "", duration: "30" });
  const [businessHours, setBusinessHours] = useState({
    monday: { is_open: true, open_time: "09:00", close_time: "18:00" },
    tuesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
    wednesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
    thursday: { is_open: true, open_time: "09:00", close_time: "18:00" },
    friday: { is_open: true, open_time: "09:00", close_time: "18:00" },
    saturday: { is_open: false, open_time: "09:00", close_time: "18:00" },
    sunday: { is_open: false, open_time: "09:00", close_time: "18:00" }
  });
  const [adminDaysOff, setAdminDaysOff] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [invitedStaff, setInvitedStaff] = useState([]);

  const daysOfWeek = [
    { key: 'monday', label: 'Pazartesi' },
    { key: 'tuesday', label: 'Salı' },
    { key: 'wednesday', label: 'Çarşamba' },
    { key: 'thursday', label: 'Perşembe' },
    { key: 'friday', label: 'Cuma' },
    { key: 'saturday', label: 'Cumartesi' },
    { key: 'sunday', label: 'Pazar' }
  ];

  useEffect(() => {
    loadData();
  // eslint-disable-next-line
  }, []);

  const loadData = async () => {
    try {
      const [settingsRes, servicesRes, usersRes] = await Promise.all([
        api.get("/settings"),
        api.get("/services"),
        api.get("/users").catch(() => ({ data: [] }))
      ]);
      
      setSettings(settingsRes.data);
      setServices(servicesRes.data || []);
      
      const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (authToken) {
        try {
          const payload = JSON.parse(atob(authToken.split('.')[1]));
          const username = payload.sub;
          const currentUser = usersRes.data?.find(u => u.username === username);
          const fullName = currentUser?.full_name || payload.full_name;
          
          setUserInfo({
            full_name: fullName || null,
            username: username
          });
        } catch (e) {
          console.error("Token parse error:", e);
        }
      }
      
      const updates = {};
      servicesRes.data?.forEach(service => {
        updates[service.id] = { price: service.price.toString(), duration: (service.duration || 30).toString() };
      });
      setServiceUpdates(updates);
    } catch (error) {
      console.error("Veri yüklenemedi:", error);
      toast.error("Veriler yüklenirken hata oluştu");
    }
  };

  // Karşılama Ekranı
  if (currentStep === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 sm:p-8 text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg">
              <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
              Hoş Geldin, {userInfo?.full_name ? userInfo.full_name.split(' ')[0] : (userInfo?.username?.split('@')[0] || 'Admin')}! 👋
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-6 sm:mb-8 leading-relaxed">
              PLANN'ı verimli kullanmak için 3 hızlı ayarı tamamlayalım.
            </p>
            <Button
              onClick={() => setCurrentStep(1)}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-12 sm:h-14 text-base sm:text-lg font-semibold rounded-xl shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              Başlayalım
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Başarı Ekranı
  if (currentStep === 4) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
          <div className="p-6 sm:p-8 text-center">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <CheckCircle className="w-6 h-6 sm:w-8 sm:h-8 text-green-600" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">
              Kurulum Tamamlandı!
            </h2>
            <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6">
              İşletmenizin tüm ayarlarını [Ayarlar] sayfasından yönetebilirsiniz.
            </p>
            <Button
              onClick={() => {
                if (onComplete) onComplete();
                window.location.reload();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 h-11 sm:h-12 text-sm sm:text-base font-semibold"
            >
              Paneli Keşfet
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 1: Hizmet Ayarları (Switch ve Checkbox kullanılmıyor, sadece Button, Input, Label)
  if (currentStep === 1) {
    const isSectorKnown = settings?.sector && settings.sector !== "Diğer/Boş";
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">
                {isSectorKnown && services.length > 0 
                  ? "1. Hizmetlerinizi Gözden Geçirin"
                  : "1. İlk Hizmetinizi Ekleyin"}
              </h2>
              <span className="text-xs sm:text-sm text-gray-500">Adım 1/3</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">
              {isSectorKnown && services.length > 0
                ? `Sektörünüze (${settings.sector}) göre sizin için ${services.length} ana hizmet oluşturduk. Lütfen bu hizmetlerin fiyatlarını ve sürelerini hızlıca girin.`
                : "Sistemin çalışması için en az 1 hizmet eklemeniz gerekmektedir (örn: 'Danışmanlık'). Lütfen hizmetin adını, fiyatını ve süresini girin."}
            </p>
          </div>
          <div className="p-4 sm:p-6">
            <p className="text-center text-gray-500">Hizmet yönetimi (Switch/Checkbox devre dışı - test için)</p>
          </div>
          <div className="p-4 sm:p-6 border-t border-gray-200 flex justify-end">
            <Button
              onClick={() => setCurrentStep(2)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 h-10 sm:h-11 text-sm sm:text-base"
            >
              İleri: İşletme Saatleri <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 2: İşletme Saatleri (Switch kullanılıyor - DEVRE DIŞI)
  if (currentStep === 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">2. Genel Çalışma Saatleriniz</h2>
              <span className="text-xs sm:text-sm text-gray-500">Adım 2/3</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600">
              Müşterilerinizin online randevu alabileceği Genel İşletme Saatlerini belirleyin.
            </p>
          </div>
          <div className="p-4 sm:p-6 space-y-1.5 sm:space-y-2 max-h-[50vh] overflow-y-auto">
            {daysOfWeek.map((day) => {
              const dayData = businessHours[day.key];
              return (
                <div key={day.key} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 sm:p-2.5 border border-gray-200 rounded-lg">
                  <div className="w-full sm:w-18 flex-shrink-0">
                    <span className="text-xs sm:text-sm font-medium text-gray-900">{day.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={dayData.is_open}
                      onCheckedChange={(checked) => {
                        setBusinessHours({
                          ...businessHours,
                          [day.key]: { ...dayData, is_open: checked }
                        });
                      }}
                    />
                    <span className="text-xs text-gray-500 sm:hidden">{dayData.is_open ? 'Açık' : 'Kapalı'}</span>
                  </div>
                  {dayData.is_open && (
                    <div className="flex items-center gap-1.5 flex-1 w-full sm:w-auto">
                      <Input
                        type="time"
                        value={dayData.open_time}
                        onChange={(e) => {
                          setBusinessHours({
                            ...businessHours,
                            [day.key]: { ...dayData, open_time: e.target.value }
                          });
                        }}
                        className="w-full sm:w-24 h-8 text-xs sm:text-sm"
                      />
                      <span className="text-gray-500 text-xs">-</span>
                      <Input
                        type="time"
                        value={dayData.close_time}
                        onChange={(e) => {
                          setBusinessHours({
                            ...businessHours,
                            [day.key]: { ...dayData, close_time: e.target.value }
                          });
                        }}
                        className="w-full sm:w-24 h-8 text-xs sm:text-sm"
                      />
                    </div>
                  )}
                  {!dayData.is_open && (
                    <span className="text-xs sm:text-sm text-gray-500 hidden sm:inline">Kapalı</span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="p-4 sm:p-6 border-t border-gray-200 flex justify-between gap-2">
            <Button
              onClick={() => setCurrentStep(1)}
              variant="outline"
              className="flex items-center gap-1 h-10 sm:h-11 text-sm sm:text-base"
            >
              <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Geri</span>
            </Button>
            <Button
              onClick={() => setCurrentStep(3)}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 h-10 sm:h-11 text-sm sm:text-base"
            >
              <span className="hidden sm:inline">İleri: Personel Ayarları</span>
              <span className="sm:hidden">İleri</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 3: Personel Ayarları (Checkbox kullanılıyor - DEVRE DIŞI)
  if (currentStep === 3) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
          <div className="p-4 sm:p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900">3. Personelinizi Ekleyin</h2>
              <span className="text-xs sm:text-sm text-gray-500">Adım 3/3</span>
            </div>
          </div>
          <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
            {/* Bölüm A: Kendi Ayarlarınız */}
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Kendi Ayarlarınız</h3>
                <p className="text-sm text-gray-600">
                  Sizi ({userInfo?.full_name || 'Admin'}) ilk personel olarak ekledik. 'Genel Saatler'i sizin takviminize kopyaladık. Lütfen (varsa) haftalık tatil gününüzü işaretleyin.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {daysOfWeek.map((day) => (
                  <div key={day.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`admin-${day.key}`}
                      checked={adminDaysOff.includes(day.key)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setAdminDaysOff([...adminDaysOff, day.key]);
                        } else {
                          setAdminDaysOff(adminDaysOff.filter(d => d !== day.key));
                        }
                      }}
                    />
                    <Label htmlFor={`admin-${day.key}`} className="text-sm cursor-pointer">
                      {day.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Bölüm B: Diğer Personeller */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">Diğer Personeller</h3>
                <p className="text-sm text-gray-600">
                  Varsa, diğer personellerinizi şimdi davet edebilirsiniz.
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="E-posta adresi"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  className="flex-1"
                />
                <Button
                  onClick={handleInviteStaff}
                  disabled={!newStaffEmail || loading}
                  variant="outline"
                >
                  + Personel Davet Et
                </Button>
              </div>
              {invitedStaff.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">Davet Edilen Personeller</Label>
                  {invitedStaff.map((email, idx) => (
                    <div key={idx} className="p-2 bg-blue-50 rounded border border-blue-200 text-sm text-gray-700">
                      {email}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="p-4 sm:p-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between gap-2">
            <Button
              onClick={() => setCurrentStep(2)}
              variant="outline"
              className="flex items-center gap-1 h-10 sm:h-11 text-sm sm:text-base order-2 sm:order-1"
            >
              <ChevronLeft className="w-4 h-4" /> <span className="hidden sm:inline">Geri</span>
            </Button>
            <div className="flex gap-2 order-1 sm:order-2">
              <Button
                onClick={() => handleComplete(true)}
                disabled={loading}
                variant="outline"
                className="text-gray-600 h-10 sm:h-11 text-sm sm:text-base flex-1 sm:flex-none"
              >
                <span className="hidden sm:inline">Bu Adımı Geç</span>
                <span className="sm:hidden">Geç</span>
              </Button>
              <Button
                onClick={() => handleComplete(false)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 h-10 sm:h-11 text-sm sm:text-base flex-1 sm:flex-none"
              >
                <span className="hidden sm:inline">Bitir ve Panelimi Göster</span>
                <span className="sm:hidden">Bitir</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleInviteStaff = async () => {
    if (!newStaffEmail || !newStaffEmail.trim()) {
      toast.error("Lütfen bir e-posta adresi girin");
      return;
    }
    
    setLoading(true);
    try {
      await api.post("/staff/add", {
        username: newStaffEmail.trim(),
        full_name: "",
        payment_type: "salary",
        payment_amount: 0
      });
      
      toast.success("Personel davet edildi");
      setInvitedStaff([...invitedStaff, newStaffEmail.trim()]);
      setNewStaffEmail("");
    } catch (error) {
      console.error("Personel davet hatası:", error);
      toast.error(error.response?.data?.detail || "Personel davet edilemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async (skip = false) => {
    setLoading(true);
    try {
      if (!skip) {
        // Admin days off kaydet
        if (adminDaysOff.length > 0) {
          await api.put("/users/me", { days_off: adminDaysOff });
        }
      }
      await completeOnboarding();
      setCurrentStep(4);
    } catch (error) {
      console.error("Onboarding tamamlanamadı:", error);
      toast.error("Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  return null;
};

export default SetupWizard;
