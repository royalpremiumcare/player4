import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, CheckCircle, AlertCircle, User, Calendar as CalendarComp, ChevronLeft, ChevronRight } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : "";
const API = `${BACKEND_URL}/api`;

// Public endpoint için axios instance (token gerektirmez)
const publicApi = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

const PublicBookingPage = () => {
  const { slug } = useParams();
  
  // Özel route'ları yakalamayı engelle (superadmin, dashboard, login, vb.)
  const reservedPaths = ['superadmin', 'dashboard', 'login', 'register', 'forgot-password', 'reset-password', 'setup-password'];
  if (reservedPaths.includes(slug)) {
    return null; // Bu route'lar AppRouter'da zaten tanımlı, buraya gelmemeli
  }
  
  // Sihirbaz Adım Yönetimi
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 4;
  
  // Loading & Business Data
  const [loading, setLoading] = useState(true);
  const [business, setBusiness] = useState(null);
  const [services, setServices] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [settings, setSettings] = useState(null);

  // Form States
  const [selectedService, setSelectedService] = useState(null);
  const [selectedStaff, setSelectedStaff] = useState(null); // null = "Farketmez"
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [busySlots, setBusySlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  
  // Customer Info
  const [customerFullName, setCustomerFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [savedUser, setSavedUser] = useState(null); // localStorage'dan gelen kullanıcı
  
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Logo URL helper
  const getLogoUrl = (logoUrl) => {
    if (!logoUrl) return null;
    return logoUrl;
  };

  // "Beni Hatırla" - localStorage kontrolü
  useEffect(() => {
    const savedUserData = localStorage.getItem('plann_user');
    if (savedUserData) {
      try {
        const userData = JSON.parse(savedUserData);
        setSavedUser(userData);
        // Eski format (name + surname) veya yeni format (fullName) desteği
        if (userData.fullName) {
          setCustomerFullName(userData.fullName || "");
        } else if (userData.name || userData.surname) {
          // Eski format: name ve surname'i birleştir
          const fullName = `${userData.name || ""} ${userData.surname || ""}`.trim();
          setCustomerFullName(fullName);
        }
        setPhone(userData.phone || "");
      } catch (error) {
        console.error("localStorage parse hatası:", error);
      }
    }
  }, []);

  // İşletme verilerini yükle
  useEffect(() => {
    loadBusinessData();
  }, [slug]);

  // Tarih veya personel değiştiğinde müsait saatleri yükle
  useEffect(() => {
    if (selectedService && selectedDate && business && currentStep >= 3) {
      loadAvailableSlots();
    }
  }, [selectedService, selectedDate, selectedStaff, business, currentStep]);

  const loadBusinessData = async () => {
    try {
      const response = await publicApi.get(`/public/business/${slug}`);
      const data = response.data;
      
      setBusiness(data);
      setServices(data.services || []);
      setStaffMembers(data.staff_members || []);
      const loadedSettings = data.settings || {};
      console.log("📋 Settings loaded:", loadedSettings);
      console.log("📋 show_service_duration_on_public:", loadedSettings.show_service_duration_on_public);
      console.log("📋 show_service_price_on_public:", loadedSettings.show_service_price_on_public);
      setSettings(loadedSettings);
      setLoading(false);
    } catch (error) {
      console.error("❌ İşletme yüklenemedi:", error);
      toast.error("İşletme bulunamadı");
      setLoading(false);
    }
  };

  const loadAvailableSlots = async () => {
    if (!selectedService || !selectedDate || !business) return;
    
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const params = {
        service_id: selectedService.id,
        date: dateStr
      };
      
      if (selectedStaff) {
        params.staff_id = selectedStaff;
      }
      
      const response = await publicApi.get(`/public/availability/${business.organization_id}`, {
        params: params
      });
      
      let available = response.data.available_slots || [];
      let busy = response.data.busy_slots || [];
      let all = response.data.all_slots || [];
      
      // Bugünün tarihi seçiliyse, geçmiş saatleri filtrele
      const today = format(new Date(), "yyyy-MM-dd");
      if (dateStr === today) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        const filterPastSlots = (slots) => {
          return slots.filter(slot => {
            const [slotHour, slotMinute] = slot.split(':').map(Number);
            if (slotHour > currentHour) return true;
            if (slotHour === currentHour && slotMinute > currentMinute) return true;
            return false;
          });
        };
        
        available = filterPastSlots(available);
        busy = filterPastSlots(busy);
        all = filterPastSlots(all);
      }
      
      setAvailableSlots(available);
      setBusySlots(busy);
      setAllSlots(all);
    } catch (error) {
      console.error("❌ Müsait saatler yüklenemedi:", error);
      setAvailableSlots([]);
      setBusySlots([]);
      setAllSlots([]);
    }
  };

  const getQualifiedStaff = () => {
    if (!selectedService) return [];
    return staffMembers.filter(staff => 
      staff.permitted_service_ids && staff.permitted_service_ids.includes(selectedService.id)
    );
  };

  // "Bu ben değilim" - localStorage'ı temizle
  const handleNotMe = () => {
    localStorage.removeItem('plann_user');
    setSavedUser(null);
    setCustomerFullName("");
    setPhone("");
  };

  // Adım ilerleme kontrolü
  const canGoNext = () => {
    switch (currentStep) {
      case 1:
        return selectedService !== null;
      case 2:
        return true; // Personel seçimi zorunlu değil (Farketmez varsayılan)
      case 3:
        return selectedTime !== "";
      case 4:
        return customerFullName.trim() !== "" && phone.trim() !== "";
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (canGoNext() && currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedService || !selectedDate || !selectedTime || !customerFullName || !phone) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    setSubmitting(true);
    try {
      const fullName = customerFullName.trim();
      
      const payload = {
        customer_name: fullName,
        phone: phone,
        service_id: selectedService.id,
        appointment_date: format(selectedDate, "yyyy-MM-dd"),
        appointment_time: selectedTime,
        notes: "",
        staff_member_id: selectedStaff || null
      };

      await publicApi.post(`/public/appointments`, payload, {
        params: { organization_id: business.organization_id }
      });
      
      // "Beni Hatırla" seçildiyse localStorage'a kaydet
      if (rememberMe) {
        const userData = {
          fullName: fullName,
          phone: phone.trim()
        };
        localStorage.setItem('plann_user', JSON.stringify(userData));
      }
      
      setSuccess(true);
      toast.success("Randevunuz başarıyla oluşturuldu!");
      
      // 5 saniye sonra formu resetle
      setTimeout(() => {
        setSuccess(false);
        setCurrentStep(1);
        setSelectedService(null);
        setSelectedStaff(null);
        setSelectedDate(new Date());
        setSelectedTime("");
        setCustomerFullName("");
        setPhone("");
        setRememberMe(false);
      }, 5000);
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Randevu oluşturulamadı";
      toast.error(errorMessage);
      console.error("❌ Randevu hatası:", error);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!business) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="p-8 text-center max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">İşletme Bulunamadı</h2>
          <p className="text-gray-600">Bu bağlantı geçersiz veya işletme artık aktif değil.</p>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Toaster position="top-center" richColors />
        <Card className="p-8 text-center max-w-md">
          <CheckCircle className="w-20 h-20 text-green-500 mx-auto mb-4" />
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Randevunuz Oluşturuldu!</h2>
          <p className="text-gray-600 mb-2">Randevu bilgileriniz telefonunuza SMS ile gönderildi.</p>
          <p className="text-sm text-gray-500">Teşekkür ederiz!</p>
        </Card>
      </div>
    );
  }

  const qualifiedStaff = getQualifiedStaff();
  const selectedStaffName = selectedStaff 
    ? qualifiedStaff.find(s => s.username === selectedStaff)?.full_name || selectedStaff
    : "Farketmez (İlk Müsait)";

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 overflow-x-hidden">
      <Toaster position="top-center" richColors />
      
      {/* Header - İşletme Logosu ve Adı */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6">
          <div className="flex items-center justify-center gap-2 sm:gap-4">
            {business.logo_url ? (
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-white rounded-lg border-2 border-blue-200 p-1 sm:p-2 flex items-center justify-center shadow-md flex-shrink-0">
                <img 
                  src={getLogoUrl(business.logo_url)}
                  alt={business.business_name}
                  className="w-full h-full object-contain"
                />
              </div>
            ) : (
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg flex-shrink-0">
                <CalendarComp className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 text-white" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-gray-900 truncate" style={{ fontFamily: 'Poppins, Inter, sans-serif' }}>
                {business.business_name}
              </h1>
              <p className="text-xs sm:text-sm text-gray-600">Online Randevu Sistemi</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        {/* Adım Göstergesi */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-center gap-1 sm:gap-2 overflow-x-auto pb-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center flex-shrink-0">
                <div
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center font-bold text-sm sm:text-base transition-all ${
                    step === currentStep
                      ? "bg-blue-600 text-white scale-110"
                      : step < currentStep
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {step < currentStep ? <CheckCircle className="w-4 h-4 sm:w-6 sm:h-6" /> : step}
                </div>
                {step < totalSteps && (
                  <div
                    className={`w-8 sm:w-12 md:w-16 h-1 mx-1 sm:mx-2 transition-all ${
                      step < currentStep ? "bg-green-500" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ADIM 1: Hizmet Seçimi */}
          {currentStep === 1 && (
            <Card className="p-4 sm:p-6 bg-white shadow-xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">1</span>
                <span className="truncate">Hizmet Seçin</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {services.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => {
                      setSelectedService(service);
                      setSelectedStaff(null); // Hizmet değişince personel seçimini sıfırla
                    }}
                    className={`p-3 sm:p-5 rounded-xl border-2 text-left transition-all duration-200 relative ${
                      selectedService?.id === service.id
                        ? "border-blue-600 bg-blue-50 shadow-lg scale-105"
                        : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                    }`}
                  >
                    <div className="font-semibold text-gray-900 mb-1 sm:mb-2 text-base sm:text-lg truncate">{service.name}</div>
                    {(() => {
                      const showDuration = settings?.show_service_duration_on_public !== false;
                      if (showDuration) {
                        return <div className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-2">{(service.duration || 30)} dakika</div>;
                      }
                      return null;
                    })()}
                    {(() => {
                      const showPrice = settings?.show_service_price_on_public !== false;
                      if (showPrice) {
                        return <div className="text-xl sm:text-2xl font-bold text-blue-600">{Math.round(service.price)}₺</div>;
                      }
                      return null;
                    })()}
                    {selectedService?.id === service.id && (
                      <CheckCircle className="w-6 h-6 text-blue-600 absolute top-3 right-3" />
                    )}
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* ADIM 2: Personel Seçimi */}
          {currentStep === 2 && (
            <Card className="p-4 sm:p-6 bg-white shadow-xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">2</span>
                <span className="truncate">Personel Seçin</span>
              </h2>
              <div className="space-y-4">
                <Select 
                  value={selectedStaff || "any"} 
                  onValueChange={(value) => setSelectedStaff(value === "any" ? null : value)}
                >
                  <SelectTrigger className="w-full h-12 border-2">
                    <SelectValue placeholder="Personel seçin..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4" />
                        <span>Farketmez (İlk Müsait)</span>
                      </div>
                    </SelectItem>
                    {qualifiedStaff.map((staff) => (
                      <SelectItem key={staff.username} value={staff.username}>
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>{staff.full_name || staff.username}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-sm text-gray-500 mt-2">
                  ℹ️ "Farketmez" seçeneği ile sistem size en uygun ilk müsait saati bulacaktır.
                </p>
              </div>
            </Card>
          )}

          {/* ADIM 3: Tarih & Saat Seçimi */}
          {currentStep === 3 && (
            <Card className="p-4 sm:p-6 bg-white shadow-xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">3</span>
                <span className="truncate">Tarih ve Saat Seçin</span>
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Sol: Tarih Seçici */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Tarih Seçin</h3>
                  <div className="flex justify-center">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedDate(date);
                          setSelectedTime(""); // Tarih değişince saati sıfırla
                        }
                      }}
                      locale={tr}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="rounded-xl border shadow-sm w-full max-w-[280px]"
                    />
                  </div>
                  <div className="mt-3 sm:mt-4 text-center">
                    <p className="text-xs sm:text-sm text-gray-600">Seçilen Tarih:</p>
                    <p className="text-base sm:text-lg font-semibold text-gray-900 break-words">
                      {selectedDate ? format(selectedDate, "d MMMM yyyy", { locale: tr }) : "-"}
                    </p>
                  </div>
                </div>

                {/* Sağ: Müsait Saatler */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Müsait Saatler</h3>
                  {availableSlots.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 max-h-96 overflow-y-auto">
                      {availableSlots.map((slot) => {
                        const isSelected = selectedTime === slot;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setSelectedTime(slot)}
                            className={`p-2 sm:p-3 rounded-lg border-2 font-semibold text-sm sm:text-base transition-all duration-200 flex items-center justify-center gap-1 sm:gap-2 ${
                              isSelected
                                ? "border-blue-500 bg-blue-500 text-white shadow-lg scale-105"
                                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                            }`}
                          >
                            <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                            <span className="truncate">{slot}</span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">Bu tarih için müsait saat bulunmamaktadır.</p>
                      <p className="text-sm text-gray-500 mt-1">Lütfen başka bir tarih seçin.</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* ADIM 4: Bilgileriniz & Onay */}
          {currentStep === 4 && (
            <Card className="p-4 sm:p-6 bg-white shadow-xl">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex items-center gap-2">
                <span className="w-7 h-7 sm:w-8 sm:h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-xs sm:text-sm font-bold flex-shrink-0">4</span>
                <span className="truncate">Bilgilerinizi Girin</span>
              </h2>

              {/* "Beni Hatırla" - Hoşgeldiniz Mesajı */}
              {savedUser && (
                <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                      Hoşgeldiniz, {savedUser.fullName || (savedUser.name && savedUser.surname ? `${savedUser.name} ${savedUser.surname}` : savedUser.name || savedUser.surname || '')}!
                    </h3>
                    <button
                      type="button"
                      onClick={handleNotMe}
                      className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline flex-shrink-0 whitespace-nowrap"
                    >
                      (Bu ben değilim)
                    </button>
                  </div>
                </div>
              )}

              {/* Form Alanları */}
              <div className="grid grid-cols-1 gap-3 sm:gap-4 mb-4 sm:mb-6">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Ad Soyad *</Label>
                  <Input
                    id="fullName"
                    value={customerFullName}
                    onChange={(e) => setCustomerFullName(e.target.value)}
                    placeholder="Adınız Soyadınız"
                    required
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon Numaranız *</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="05XX XXX XX XX"
                    required
                    className="border-2"
                  />
                </div>
                {!savedUser && (
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked)}
                    />
                    <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                      Beni Hatırla
                    </Label>
                  </div>
                )}
              </div>

              {/* Özet Kartı */}
              <div className="mt-4 sm:mt-6 p-4 sm:p-5 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-3 sm:mb-4 text-base sm:text-lg">Randevu Özeti</h3>
                <div className="space-y-2 text-xs sm:text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-600 flex-shrink-0">Hizmet:</span>
                    <span className="font-semibold text-gray-900 text-right break-words">{selectedService?.name}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-600 flex-shrink-0">Personel:</span>
                    <span className="font-semibold text-gray-900 text-right break-words">{selectedStaffName}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-600 flex-shrink-0">Tarih:</span>
                    <span className="font-semibold text-gray-900 text-right break-words">
                      {selectedDate ? format(selectedDate, "d MMMM yyyy", { locale: tr }) : "-"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-600 flex-shrink-0">Saat:</span>
                    <span className="font-semibold text-gray-900 text-right">{selectedTime || "-"}</span>
                  </div>
                  <div className="flex justify-between gap-2 border-t border-blue-300 pt-2 mt-2">
                    <span className="text-gray-600 flex-shrink-0">Ücret:</span>
                    <span className="font-bold text-blue-600 text-base sm:text-lg">
                      {selectedService ? `${Math.round(selectedService.price)}₺` : "-"}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting || !canGoNext()}
                className="w-full mt-4 sm:mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 sm:py-6 text-base sm:text-lg shadow-lg"
              >
                {submitting ? "Randevu Oluşturuluyor..." : "Randevuyu Onayla"}
              </Button>
            </Card>
          )}

          {/* Geri/İleri Butonları */}
          <div className="flex items-center justify-between mt-6 sm:mt-8 gap-2">
            <Button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 1}
              variant="outline"
              className="flex items-center gap-1 sm:gap-2 text-sm sm:text-base px-3 sm:px-4"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Geri</span>
            </Button>
            
            {currentStep < totalSteps ? (
              <Button
                type="button"
                onClick={handleNext}
                disabled={!canGoNext()}
                className="flex items-center gap-1 sm:gap-2 bg-blue-600 hover:bg-blue-700 text-sm sm:text-base px-3 sm:px-4"
              >
                <span>İleri</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : null}
          </div>
        </form>
      </main>

      {/* Footer */}
      <footer className="mt-8 sm:mt-16 py-4 sm:py-8 bg-white/50 backdrop-blur-sm border-t border-gray-200">
        <div className="container mx-auto px-3 sm:px-4 text-center text-gray-600 text-xs sm:text-sm">
          <p className="break-words">© 2025 {business.business_name} - Tüm hakları saklıdır</p>
          <p className="mt-1">Powered by <span className="font-bold text-blue-600">PLANN</span></p>
        </div>
      </footer>
    </div>
  );
};

export default PublicBookingPage;
