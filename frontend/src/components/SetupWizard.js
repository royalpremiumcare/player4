import React, { useState, useEffect } from "react";
import { CheckCircle, ChevronRight, ChevronLeft, Plus, X } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

const SetupWizard = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [onboardingData, setOnboardingData] = useState(null);
  const [services, setServices] = useState([]);
  const [serviceUpdates, setServiceUpdates] = useState({});
  const [newService, setNewService] = useState({ name: "", price: "", duration: "30" });
  const [businessHours, setBusinessHours] = useState({});
  const [adminDaysOff, setAdminDaysOff] = useState([]);
  const [staffInvites, setStaffInvites] = useState([]);
  const [newStaffEmail, setNewStaffEmail] = useState("");
  const [newStaffName, setNewStaffName] = useState("");

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
    loadOnboardingData();
    
    // Modal açıldığında body scroll'u engelle (Chrome mobile fix)
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = '0';
    
    // Cleanup: Modal kapanınca scroll'u geri aç
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
    };
  }, []);

  const loadOnboardingData = async () => {
    try {
      const response = await api.get("/onboarding/info");
      setOnboardingData(response.data);
      
      // Mevcut hizmetleri al
      const existingServices = response.data.existing_services || [];
      const defaultServices = response.data.default_services || [];
      
      // Eğer mevcut hizmet varsa onları kullan, yoksa default'ları
      if (existingServices.length > 0) {
        setServices(existingServices);
        const updates = {};
        existingServices.forEach(service => {
          updates[service.id] = {
            id: service.id,
            name: service.name,
            price: service.price.toString(),
            duration: service.duration.toString()
          };
        });
        setServiceUpdates(updates);
      } else {
        // Default hizmetleri göster
        const defaultsWithIds = defaultServices.map((s, idx) => ({ ...s, tempId: `temp-${idx}` }));
        setServices(defaultsWithIds);
        const updates = {};
        defaultsWithIds.forEach(service => {
          updates[service.tempId] = {
            tempId: service.tempId,
            name: service.name,
            price: service.price.toString(),
            duration: service.duration.toString()
          };
        });
        setServiceUpdates(updates);
      }
      
      // Business hours
      const hours = response.data.business_hours || {};
      if (Object.keys(hours).length > 0) {
        setBusinessHours(hours);
      } else {
        // Default business hours
        setBusinessHours({
          monday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          tuesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          wednesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          thursday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          friday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          saturday: { is_open: false, open_time: "09:00", close_time: "18:00" },
          sunday: { is_open: false, open_time: "09:00", close_time: "18:00" }
        });
      }
    } catch (error) {
      console.error("Onboarding verileri yüklenemedi:", error);
      toast.error("Veriler yüklenirken hata oluştu");
    }
  };

  // Handler: Adım 1 - İleri
  const handleStep1Next = async () => {
    const isSectorKnown = onboardingData?.sector && onboardingData.sector !== "Diğer/Boş";
    
    // Validasyon
    if (isSectorKnown && services.length > 0) {
      // Mevcut hizmetlerin fiyat ve sürelerini kontrol et
      const hasInvalidService = Object.values(serviceUpdates).some(s => !s.price || !s.duration);
      if (hasInvalidService) {
        toast.error("Lütfen tüm hizmetler için fiyat ve süre girin");
        return;
      }
    } else {
      // Yeni hizmet kontrolü
      if (!newService.name || !newService.price || !newService.duration) {
        toast.error("Lütfen tüm alanları doldurun");
        return;
      }
    }
    
    setLoading(true);
    try {
      if (isSectorKnown && services.length > 0) {
        // Mevcut hizmetleri güncelle
        const servicesToUpdate = services.map(s => {
          const serviceId = s.id || s.tempId;
          const update = serviceUpdates[serviceId];
          return {
            id: s.id,
            price: parseFloat(update.price),
            duration: parseInt(update.duration)
          };
        }).filter(s => s.id); // Sadece gerçek ID'si olanlar
        
        if (servicesToUpdate.length > 0) {
          await api.post("/onboarding/update-services", { services: servicesToUpdate });
        }
      } else {
        // Yeni hizmet ekle
        await api.post("/onboarding/add-service", {
          name: newService.name,
          price: parseFloat(newService.price),
          duration: parseInt(newService.duration)
        });
      }
      
      setCurrentStep(2);
    } catch (error) {
      console.error("Hizmet kaydetme hatası:", error);
      toast.error(error.response?.data?.detail || "Hizmetler kaydedilirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Adım 2 - İleri
  const handleStep2Next = async () => {
    setLoading(true);
    try {
      await api.post("/onboarding/update-hours", { business_hours: businessHours });
      setCurrentStep(3);
    } catch (error) {
      console.error("Çalışma saatleri kaydetme hatası:", error);
      toast.error(error.response?.data?.detail || "Çalışma saatleri kaydedilirken hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Staff invite ekle (Step 3)
  const handleAddStaffInvite = () => {
    if (!newStaffEmail || !newStaffName) {
      toast.error("Lütfen isim ve e-posta girin");
      return;
    }
    
    setStaffInvites([...staffInvites, {
      username: newStaffEmail.trim(),
      full_name: newStaffName.trim()
    }]);
    setNewStaffEmail("");
    setNewStaffName("");
    toast.success("Personel listeye eklendi");
  };

  // Handler: Bitir
  const handleComplete = async (skip = false) => {
    setLoading(true);
    try {
      // Eğer son personel yazılıp listeye eklenmemişse, otomatik ekle
      let finalStaffInvites = [...staffInvites];
      if (!skip && newStaffName && newStaffEmail) {
        finalStaffInvites.push({
          full_name: newStaffName,
          username: newStaffEmail
        });
        // Input'ları temizle
        setNewStaffName("");
        setNewStaffEmail("");
      }
      
      const payload = {
        admin_days_off: [],  // Artık admin tatil günü toplamıyoruz
        staff_invites: skip ? [] : finalStaffInvites
      };
      
      await api.post("/onboarding/complete", payload);
      
      toast.success("🎉 Kurulum tamamlandı!");
      setCurrentStep(4);
    } catch (error) {
      console.error("Onboarding tamamlanamadı:", error);
      toast.error(error.response?.data?.detail || "Bir hata oluştu");
    } finally {
      setLoading(false);
    }
  };

  // Karşılama Ekranı
  if (currentStep === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-xl max-w-sm w-full shadow-xl overflow-hidden">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 text-center">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Hoş Geldin, {onboardingData?.user?.full_name ? onboardingData.user.full_name.split(' ')[0] : 'Admin'}! 👋
            </h2>
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">
              PLANN'ı verimli kullanmak için 3 hızlı ayarı tamamlayalım.
            </p>
            <Button
              onClick={() => setCurrentStep(1)}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 h-10 text-sm font-semibold rounded-lg shadow-lg"
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
    const hasInvitedStaff = staffInvites.length > 0;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-xl max-w-md w-full shadow-xl">
          <div className="p-5 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">
              🎉 Kurulum Tamamlandı!
            </h2>
            <p className="text-sm text-gray-600 mb-3">
              Tebrikler! İşletmeniz PLANN ile hazır.
            </p>
            
            {hasInvitedStaff && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 text-left">
                <p className="text-xs text-blue-900 font-medium mb-1">💡 Bir Adım Kaldı!</p>
                <p className="text-xs text-blue-800">
                  Davet ettiğiniz personellerinizin <strong>maaş bilgilerini</strong> ve <strong>verebileceği hizmetleri</strong> ayarlayarak sistemin tam performansta çalışmasını sağlayabilirsiniz.
                </p>
                <p className="text-xs text-blue-700 mt-2">
                  <strong>Personel Ayarları</strong> bölümünden kolayca düzenleyebilirsiniz.
                </p>
              </div>
            )}
            
            <p className="text-xs text-gray-500 mb-4">
              İşletmenizin tüm ayarlarını <strong>Ayarlar</strong> sayfasından yönetebilirsiniz.
            </p>
            
            <Button
              onClick={() => {
                if (onComplete) onComplete();
                window.location.reload();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 h-10 text-sm font-semibold"
            >
              Hadi Başlayalım! 🚀
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 1: Hizmet Ayarları
  if (currentStep === 1) {
    const isSectorKnown = onboardingData?.sector && onboardingData.sector !== "Diğer/Boş";
    const hasExistingServices = onboardingData?.existing_services && onboardingData.existing_services.length > 0;
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-xl">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-gray-900">
                {isSectorKnown && services.length > 0 
                  ? "1. Hizmetlerinizi Gözden Geçirin"
                  : "1. İlk Hizmetinizi Ekleyin"}
              </h2>
              <span className="text-xs text-gray-500">Adım 1/3</span>
            </div>
            <p className="text-xs text-gray-600">
              {isSectorKnown && services.length > 0
                ? `Sektörünüze (${onboardingData.sector}) göre sizin için ${services.length} ana hizmet oluşturduk. Lütfen bu hizmetlerin fiyatlarını ve sürelerini hızlıca girin.`
                : "Sistemin çalışması için en az 1 hizmet eklemeniz gerekmektedir. Lütfen hizmetin adını, fiyatını ve süresini girin."}
            </p>
            <p className="text-xs text-amber-600 mt-1">⚠️ Hizmet süresi zorunludur.</p>
          </div>
          <div className="p-3 space-y-2">
            {isSectorKnown && services.length > 0 ? (
              services.map((service) => {
                const serviceId = service.id || service.tempId;
                const update = serviceUpdates[serviceId] || {};
                return (
                  <div key={serviceId} className="flex items-center gap-2 p-2 border border-gray-200 rounded-lg">
                    <div className="flex-1 text-sm font-medium text-gray-900">{service.name}</div>
                    <div className="flex gap-2">
                      <div>
                        <Label className="text-xs text-gray-600">Fiyat</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            placeholder="0"
                            value={update.price || ""}
                            onChange={(e) => {
                              setServiceUpdates({
                                ...serviceUpdates,
                                [serviceId]: { ...update, price: e.target.value }
                              });
                            }}
                            className="w-24 sm:w-32 h-8 text-sm pr-9 sm:pr-10"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">TL</span>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-gray-600">Süre</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            placeholder="30"
                            value={update.duration || ""}
                            onChange={(e) => {
                              setServiceUpdates({
                                ...serviceUpdates,
                                [serviceId]: { ...update, duration: e.target.value }
                              });
                            }}
                            className="w-24 sm:w-32 h-8 text-sm pr-9 sm:pr-10"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">dk</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="space-y-2">
                <div>
                  <Label className="text-sm">Hizmet Adı *</Label>
                  <Input
                    placeholder="örn: Danışmanlık, Toplantı, Muayene"
                    value={newService.name}
                    onChange={(e) => setNewService({ ...newService, name: e.target.value })}
                    className="h-10"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-sm">Fiyat *</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="0"
                        value={newService.price}
                        onChange={(e) => setNewService({ ...newService, price: e.target.value })}
                        className="h-9 text-sm pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">TL</span>
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm">Süre *</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        placeholder="30"
                        value={newService.duration}
                        onChange={(e) => setNewService({ ...newService, duration: e.target.value })}
                        className="h-9 text-sm pr-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">dk</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-200 flex justify-end">
            <Button
              onClick={handleStep1Next}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
            >
              İleri <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 2: İşletme Saatleri
  if (currentStep === 2) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-xl">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-gray-900">2. Genel Çalışma Saatleriniz</h2>
              <span className="text-xs text-gray-500">Adım 2/3</span>
            </div>
            <p className="text-xs text-gray-600">
              Müşterilerinizin online randevu alabileceği Genel İşletme Saatlerini belirleyin.
            </p>
          </div>
          <div className="p-3 space-y-2 max-h-[50vh] overflow-y-auto">
            {daysOfWeek.map((day) => {
              const dayData = businessHours[day.key] || { is_open: false, open_time: "09:00", close_time: "18:00" };
              return (
                <div key={day.key} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-2 sm:p-2.5 border border-gray-200 rounded-lg">
                  <div className="w-full sm:w-24 flex-shrink-0">
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
          <div className="p-3 border-t border-gray-200 flex justify-between gap-2">
            <Button
              onClick={() => setCurrentStep(1)}
              variant="outline"
              className="flex items-center gap-1 h-9 text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Geri
            </Button>
            <Button
              onClick={handleStep2Next}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
            >
              İleri <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Adım 3: Personel Ayarları
  if (currentStep === 3) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" style={{ fontFamily: 'Inter, Poppins, sans-serif' }}>
        <div className="bg-white rounded-xl max-w-md w-full max-h-[80vh] overflow-y-auto shadow-xl">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-bold text-gray-900">3. Personelinizi Ekleyin</h2>
              <span className="text-xs text-gray-500">Adım 3/3</span>
            </div>
          </div>
          <div className="p-3">
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Personelinizi Davet Edin</h3>
                <p className="text-sm text-gray-600">
                  Varsa, diğer personellerinizi şimdi davet edebilirsiniz.
                </p>
              </div>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="text"
                    placeholder="İsim Soyisim"
                    value={newStaffName}
                    onChange={(e) => setNewStaffName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newStaffName && newStaffEmail) {
                        handleAddStaffInvite();
                      }
                    }}
                    className="h-9"
                  />
                  <Input
                    type="email"
                    placeholder="E-posta"
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newStaffName && newStaffEmail) {
                        handleAddStaffInvite();
                      }
                    }}
                    className="h-9"
                  />
                </div>
                <Button
                  onClick={handleAddStaffInvite}
                  disabled={!newStaffEmail || !newStaffName || loading}
                  variant="outline"
                  className="w-full h-9 text-sm flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Listeye Ekle
                </Button>
                <p className="text-xs text-gray-500 text-center">
                  💡 Enter tuşuna basarak veya "Listeye Ekle" butonuyla ekleyebilirsiniz
                </p>
              </div>
              {staffInvites.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-900">Davet Edilecek Personeller</Label>
                  {staffInvites.map((staff, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded border border-blue-200">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">{staff.full_name}</span>
                        <span className="text-gray-500 ml-2">({staff.username})</span>
                      </div>
                      <Button
                        onClick={() => setStaffInvites(staffInvites.filter((_, i) => i !== idx))}
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                      >
                        <X className="w-4 h-4 text-gray-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="p-3 border-t border-gray-200 flex justify-between gap-2">
            <Button
              onClick={() => setCurrentStep(2)}
              variant="outline"
              className="flex items-center gap-1 h-9 text-sm"
            >
              <ChevronLeft className="w-4 h-4" /> Geri
            </Button>
            <div className="flex gap-2">
              <Button
                onClick={() => handleComplete(true)}
                disabled={loading}
                variant="outline"
                className="text-gray-600 h-9 text-sm"
              >
                Geç
              </Button>
              <Button
                onClick={() => handleComplete(false)}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 h-9 text-sm"
              >
                Bitir
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default SetupWizard;
