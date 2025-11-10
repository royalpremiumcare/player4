import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, CheckCircle, AlertCircle, User, Calendar as CalendarComp } from "lucide-react";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast, Toaster } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : "";
const API = `${BACKEND_URL}/api`;

const PublicBookingPageV2 = () => {
  const { slug } = useParams();
  
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
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    loadBusinessData();
  }, [slug]);

  useEffect(() => {
    if (selectedService && selectedDate && business) {
      loadAvailableSlots();
    }
  }, [selectedService, selectedDate, selectedStaff, business]);

  const loadBusinessData = async () => {
    try {
      const response = await axios.get(`${API}/public/business/${slug}`);
      const data = response.data;
      
      setBusiness(data);
      setServices(data.services || []);
      setStaffMembers(data.staff_members || []);
      setSettings(data.settings || {});
      setLoading(false);
      
      console.log("✅ İşletme verileri yüklendi:", data);
      console.log("🔧 Settings:", data.settings);
      console.log("👥 Staff Members:", data.staff_members);
      console.log("⚙️ Customer can choose staff:", data.settings?.customer_can_choose_staff);
    } catch (error) {
      console.error("❌ İşletme yüklenemedi:", error);
      toast.error("İşletme bulunamadı");
      setLoading(false);
    }
  };

  const loadAvailableSlots = async () => {
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const params = {
        service_id: selectedService.id,
        date: dateStr
      };
      
      // Eğer müşteri belirli bir personel seçtiyse, sadece o personelin müsait saatlerini göster
      if (selectedStaff) {
        params.staff_id = selectedStaff;
      }
      
      const response = await axios.get(`${API}/public/availability/${business.organization_id}`, {
        params: params
      });
      
      let slots = response.data.available_slots || [];
      
      // Bugünün tarihi seçiliyse, geçmiş saatleri filtrele
      const today = format(new Date(), "yyyy-MM-dd");
      if (dateStr === today) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        slots = slots.filter(slot => {
          const [slotHour, slotMinute] = slot.split(':').map(Number);
          // Saat tamamen gelecekte mi?
          if (slotHour > currentHour) return true;
          // Aynı saatteyse, dakika kontrolü
          if (slotHour === currentHour && slotMinute > currentMinute) return true;
          // Geçmişte
          return false;
        });
      }
      
      setAvailableSlots(slots);
      console.log("✅ Müsait saatler:", slots);
      console.log("🔍 Seçili personel:", selectedStaff || "Farketmez");
    } catch (error) {
      console.error("❌ Müsait saatler yüklenemedi:", error);
      setAvailableSlots([]);
    }
  };

  const getQualifiedStaff = () => {
    if (!selectedService) return [];
    // Bu hizmeti verebilen personelleri filtrele
    return staffMembers.filter(staff => 
      staff.permitted_service_ids && staff.permitted_service_ids.includes(selectedService.id)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedService || !selectedDate || !selectedTime || !customerName || !phone) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        customer_name: customerName,
        phone: phone,
        service_id: selectedService.id,
        appointment_date: format(selectedDate, "yyyy-MM-dd"),
        appointment_time: selectedTime,
        notes: "",
        staff_member_id: selectedStaff || null // null = "Farketmez"
      };

      await axios.post(`${API}/public/appointments`, payload, {
        params: { organization_id: business.organization_id }
      });
      
      setSuccess(true);
      toast.success("Randevunuz başarıyla oluşturuldu!");
      
      // 3 saniye sonra formu resetle
      setTimeout(() => {
        setSuccess(false);
        setSelectedService(null);
        setSelectedStaff(null);
        setSelectedTime("");
        setCustomerName("");
        setPhone("");
      }, 3000);
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <CalendarComp className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {business.business_name}
                </h1>
                <p className="text-sm text-gray-600">Online Randevu Sistemi</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ADIM 1: Hizmet Seçimi */}
          <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-xl">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</span>
              Hizmet Seçin
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {services.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  onClick={() => {
                    setSelectedService(service);
                    setSelectedStaff(null); // Hizmet değişince personel seçimini sıfırla
                  }}
                  className={`p-4 rounded-xl border-2 text-left transition-all duration-200 relative ${
                    selectedService?.id === service.id
                      ? "border-blue-500 bg-blue-50 shadow-lg scale-105"
                      : "border-gray-200 hover:border-blue-300 hover:shadow-md"
                  }`}
                >
                  <div className="font-semibold text-gray-900 mb-1">{service.name}</div>
                  <div className="text-2xl font-bold text-blue-600">{Math.round(service.price)}₺</div>
                  {selectedService?.id === service.id && (
                    <CheckCircle className="w-5 h-5 text-blue-600 absolute top-2 right-2" />
                  )}
                </button>
              ))}
            </div>
          </Card>

          {/* ADIM 2: Personel Seçimi (Koşullu) */}
          {selectedService && settings?.customer_can_choose_staff && qualifiedStaff.length > 0 && (
            <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</span>
                Personel Seçin (İsteğe Bağlı)
              </h2>
              <Select value={selectedStaff || "any"} onValueChange={(value) => setSelectedStaff(value === "any" ? null : value)}>
                <SelectTrigger className="w-full h-12 border-2">
                  <SelectValue placeholder="Personel seçin..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4" />
                      <span>Farketmez (Herhangi Biri)</span>
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
                "Farketmez" seçeneği ile ilk müsait personele randevu oluşturulur.
              </p>
            </Card>
          )}

          {/* ADIM 3: Tarih Seçimi */}
          {selectedService && (
            <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {settings?.customer_can_choose_staff ? "3" : "2"}
                </span>
                Tarih Seçin
              </h2>
              <div className="flex justify-center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  locale={tr}
                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  className="rounded-xl border shadow-sm"
                />
              </div>
              <div className="mt-4 text-center">
                <p className="text-sm text-gray-600">Seçilen Tarih:</p>
                <p className="text-lg font-semibold text-gray-900">
                  {selectedDate ? format(selectedDate, "d MMMM yyyy", { locale: tr }) : "-"}
                </p>
              </div>
            </Card>
          )}

          {/* ADIM 4: Saat Seçimi */}
          {selectedService && selectedDate && (
            <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {settings?.customer_can_choose_staff ? "4" : "3"}
                </span>
                Saat Seçin
              </h2>
              {availableSlots.length > 0 ? (
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {availableSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedTime(slot)}
                      className={`p-3 rounded-lg border-2 font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                        selectedTime === slot
                          ? "border-blue-500 bg-blue-500 text-white shadow-lg scale-105"
                          : "border-gray-300 hover:border-blue-400 hover:bg-blue-50"
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      {slot}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">Bu tarih için müsait saat bulunmamaktadır.</p>
                  <p className="text-sm text-gray-500 mt-1">Lütfen başka bir tarih seçin.</p>
                </div>
              )}
            </Card>
          )}

          {/* ADIM 5: İletişim Bilgileri */}
          {selectedService && selectedDate && selectedTime && (
            <Card className="p-6 bg-white/90 backdrop-blur-sm shadow-xl">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <span className="w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center text-sm font-bold">
                  {settings?.customer_can_choose_staff ? "5" : "4"}
                </span>
                İletişim Bilgileri
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Ad Soyad *</Label>
                  <Input
                    id="name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Adınız Soyadınız"
                    required
                    className="border-2"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefon Numarası *</Label>
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
              </div>

              {/* Özet */}
              <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-200">
                <h3 className="font-semibold text-gray-900 mb-3">Randevu Özeti</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Hizmet:</span>
                    <span className="font-semibold text-gray-900">{selectedService.name}</span>
                  </div>
                  {settings?.customer_can_choose_staff && selectedStaff && (
                    <div className="flex justify-between">
                      <span className="text-gray-600">Personel:</span>
                      <span className="font-semibold text-gray-900">
                        {qualifiedStaff.find(s => s.username === selectedStaff)?.full_name || "Farketmez"}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">Tarih:</span>
                    <span className="font-semibold text-gray-900">
                      {format(selectedDate, "d MMMM yyyy", { locale: tr })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Saat:</span>
                    <span className="font-semibold text-gray-900">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between border-t border-blue-300 pt-2 mt-2">
                    <span className="text-gray-600">Ücret:</span>
                    <span className="font-bold text-blue-600 text-lg">{Math.round(selectedService.price)}₺</span>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full mt-6 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold py-6 text-lg shadow-lg"
              >
                {submitting ? "Randevu Oluşturuluyor..." : "Randevu Oluştur"}
              </Button>
            </Card>
          )}
        </form>
      </main>

      {/* Footer */}
      <footer className="mt-16 py-8 bg-white/50 backdrop-blur-sm border-t border-gray-200">
        <div className="container mx-auto px-4 text-center text-gray-600 text-sm">
          <p>© 2025 {business.business_name} - Tüm hakları saklıdır</p>
          <p className="mt-1">Powered by <span className="font-bold text-blue-600">PLANN</span></p>
        </div>
      </footer>
    </div>
  );
};

export default PublicBookingPageV2;
