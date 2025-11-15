import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, ArrowLeft, User, Search, X } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : "";
const API = `${BACKEND_URL}/api`;

const AppointmentFormWizard = ({ services, appointment, onSave, onCancel }) => {
  const { userRole } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [currentUser, setCurrentUser] = useState(null);
  const [allStaff, setAllStaff] = useState([]);
  const [formData, setFormData] = useState({
    customer_name: "",
    phone: "",
    service_id: "",
    appointment_date: new Date(),
    appointment_time: "",
    staff_member_id: "",
    notes: ""
  });
  const [settings, setSettings] = useState(null);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [busySlots, setBusySlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filteredServices, setFilteredServices] = useState([]);
  const [qualifiedStaff, setQualifiedStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    loadCurrentUser();
    loadAllStaff();
    loadSettings();
    loadCustomers();
    if (appointment) {
      setFormData({
        customer_name: appointment.customer_name,
        phone: appointment.phone,
        service_id: appointment.service_id,
        appointment_date: new Date(appointment.appointment_date),
        appointment_time: appointment.appointment_time,
        staff_member_id: appointment.staff_member_id || "",
        notes: appointment.notes || ""
      });
    }
  }, [appointment]);

  useEffect(() => {
    if (formData.service_id && formData.appointment_date && currentStep === 3) {
      loadAvailableSlots();
    }
  }, [formData.service_id, formData.appointment_date, formData.staff_member_id, currentStep]);

  // Personel için hizmetleri filtrele
  useEffect(() => {
    if (userRole === 'staff' && currentUser && services.length > 0) {
      const allowedServices = services.filter(service => 
        currentUser.permitted_service_ids?.includes(service.id)
      );
      setFilteredServices(allowedServices);
    } else {
      setFilteredServices(services);
    }
  }, [userRole, currentUser, services]);

  // Hizmet seçildiğinde qualified staff'ı bul
  useEffect(() => {
    if (formData.service_id && allStaff.length > 0 && settings) {
      let qualified = allStaff.filter(staff => 
        staff.permitted_service_ids?.includes(formData.service_id)
      );
      
      // Admin hizmet vermiyorsa, admin'i listeden çıkar
      if (!settings.admin_provides_service) {
        qualified = qualified.filter(staff => staff.role !== 'admin');
      }
      
      setQualifiedStaff(qualified);
      
      if (formData.staff_member_id && !qualified.find(s => s.username === formData.staff_member_id)) {
        setFormData(prev => ({ ...prev, staff_member_id: "" }));
      }
    }
  }, [formData.service_id, allStaff, settings]);

  const loadCurrentUser = async () => {
    if (userRole === 'staff') {
      try {
        const response = await api.get("/users");
        const users = response.data || [];
        const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const currentUsername = payload.sub;
          const user = users.find(u => u.username === currentUsername);
          setCurrentUser(user);
          // Personel için otomatik olarak kendisini ata
          if (user) {
            setFormData(prev => ({ ...prev, staff_member_id: user.username }));
          }
        }
      } catch (error) {
        console.error("Kullanıcı bilgileri yüklenemedi:", error);
      }
    }
  };

  const loadAllStaff = async () => {
    try {
      const response = await api.get("/users");
      setAllStaff(response.data || []);
    } catch (error) {
      console.error("Personeller yüklenemedi:", error);
    }
  };

  const loadCustomers = async () => {
    try {
      const response = await api.get("/customers");
      setCustomers(response.data || []);
    } catch (error) {
      console.error("Müşteriler yüklenemedi:", error);
    }
  };

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data);
    } catch (error) {
      console.error("Ayarlar yüklenemedi:", error);
    }
  };

  const loadAvailableSlots = async () => {
    if (!formData.service_id || !formData.appointment_date || !settings) {
      return;
    }

    try {
      const dateStr = format(formData.appointment_date, "yyyy-MM-dd");
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (!token) {
        return;
      }
      
      const payload = JSON.parse(atob(token.split('.')[1]));
      const organization_id = payload.org_id;

      const params = {
        service_id: formData.service_id,
        date: dateStr
      };

      if (formData.staff_member_id) {
        params.staff_id = formData.staff_member_id;
      }

      const response = await axios.get(`${API}/public/availability/${organization_id}`, {
        params: params
      });
      
      setAvailableSlots(response.data.available_slots || []);
      setBusySlots(response.data.busy_slots || []);
      setAllSlots(response.data.all_slots || []);
    } catch (error) {
      console.error("Müsait saatler yüklenemedi:", error);
      setAvailableSlots([]);
    }
  };

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setFormData({
      ...formData,
      customer_name: customer.name,
      phone: customer.phone
    });
    setCustomerSearchTerm(customer.name);
  };

  const handleNext = () => {
    if (currentStep === 1) {
      if (!formData.service_id) {
        toast.error("Lütfen bir hizmet seçin");
        return;
      }
      if (userRole === 'admin' && !formData.staff_member_id && qualifiedStaff.length > 0) {
        // Admin için personel seçimi opsiyonel, devam edebilir
      }
      setCurrentStep(2);
    } else if (currentStep === 2) {
      if (!formData.customer_name || !formData.phone) {
        toast.error("Lütfen müşteri bilgilerini doldurun");
        return;
      }
      setCurrentStep(3);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.phone || !formData.service_id || !formData.appointment_time) {
      toast.error("Lütfen tüm zorunlu alanları doldurun");
      return;
    }

    if (userRole === 'staff' && currentUser) {
      if (!currentUser.permitted_service_ids?.includes(formData.service_id)) {
        toast.error("Bu hizmete randevu alma yetkiniz yok");
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        ...formData,
        appointment_date: format(formData.appointment_date, "yyyy-MM-dd")
      };

      if (userRole === 'staff' && currentUser && !payload.staff_member_id) {
        payload.staff_member_id = currentUser.username;
      }

      if (!payload.staff_member_id) {
        delete payload.staff_member_id;
      }

      if (appointment) {
        await api.put(`/appointments/${appointment.id}`, payload);
        toast.success("Randevu güncellendi");
      } else {
        const response = await api.post("/appointments", payload);
        toast.success("Randevu oluşturuldu");
        console.log("✅ Randevu oluşturuldu:", response.data);
        
        // Yeni müşteri eklendiğinde customers listesini yeniden yükle
        await loadCustomers();
      }
      // onSave çağrılmadan önce kısa bir bekleme (WebSocket event'inin gelmesi için)
      await new Promise(resolve => setTimeout(resolve, 500));
      onSave();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "İşlem başarısız";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase()) ||
    customer.phone.includes(customerSearchTerm)
  );

  const stepTitles = {
    1: "Hizmet ve Personel",
    2: "Müşteri Bilgileri",
    3: "Tarih ve Saat"
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      
      {/* Bottom Sheet */}
      <div className="relative w-full bg-white rounded-t-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            {currentStep > 1 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="p-2"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-800">
                Adım {currentStep}/3: {stepTitles[currentStep]}
              </h2>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="p-2"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Adım 1: Hizmet ve Personel */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="service" className="font-medium text-sm text-gray-700">
                  Hizmet Seçin *
                </Label>
                {userRole === 'staff' && filteredServices.length === 0 ? (
                  <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-gray-300">
                    Size hiçbir hizmet atanmamış. Lütfen yöneticinizle iletişime geçin.
                  </div>
                ) : (
                  <Select
                    value={formData.service_id}
                    onValueChange={(value) => setFormData({ ...formData, service_id: value })}
                  >
                    <SelectTrigger className="rounded-lg border border-gray-300">
                      <SelectValue placeholder="Hizmet seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredServices.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} - {Math.round(service.price)}₺
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Personel Seçimi (Sadece Admin) */}
              {userRole === 'admin' && formData.service_id && qualifiedStaff.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="staff" className="font-medium text-sm text-gray-700">
                    Personel Seçin
                  </Label>
                  <Select
                    value={formData.staff_member_id || "auto"}
                    onValueChange={(value) => setFormData({ ...formData, staff_member_id: value === "auto" ? "" : value })}
                  >
                    <SelectTrigger className="rounded-lg border border-gray-300">
                      <SelectValue placeholder="Personel seçin..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4" />
                          <span>Otomatik Atama</span>
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
                </div>
              )}
            </div>
          )}

          {/* Adım 2: Müşteri Bilgileri */}
          {currentStep === 2 && (
            <div className="space-y-6">
              {/* Müşteri Arama */}
              <div className="space-y-2">
                <Label className="font-medium text-sm text-gray-700">
                  Müşteri Ara veya Yeni Ekle
                </Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Müşteri adı veya telefon ara..."
                    value={customerSearchTerm}
                    onChange={(e) => {
                      setCustomerSearchTerm(e.target.value);
                      if (!e.target.value) {
                        setSelectedCustomer(null);
                        setFormData({ ...formData, customer_name: "", phone: "" });
                      }
                    }}
                    className="pl-10 rounded-lg border border-gray-300"
                  />
                </div>
              </div>

              {/* Müşteri Listesi */}
              {customerSearchTerm && filteredCustomers.length > 0 && (
                <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                  {filteredCustomers.map((customer) => (
                    <button
                      key={customer.phone}
                      type="button"
                      onClick={() => handleCustomerSelect(customer)}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b border-gray-200 last:border-b-0 ${
                        selectedCustomer?.phone === customer.phone ? 'bg-blue-100 font-semibold' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-900 block">{customer.name}</span>
                          <span className="text-xs text-gray-500">{customer.phone}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {customer.total_appointments} randevu
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Müşteri Bilgileri Form */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer_name" className="font-medium text-sm text-gray-700">
                    Müşteri Adı *
                  </Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Ad Soyad"
                    className="rounded-lg border border-gray-300"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone" className="font-medium text-sm text-gray-700">
                    Telefon Numarası *
                  </Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="05XX XXX XX XX"
                    className="rounded-lg border border-gray-300"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes" className="font-medium text-sm text-gray-700">
                    Randevu Notu (Opsiyonel)
                  </Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="Ek bilgiler..."
                    rows={3}
                    className="rounded-lg border border-gray-300"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Adım 3: Tarih ve Saat */}
          {currentStep === 3 && (
            <div className="space-y-6">
              {/* Tarih Seçici */}
              <div className="space-y-2">
                <Label className="font-medium text-sm text-gray-700">
                  Tarih Seçin *
                </Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-left font-normal rounded-lg border border-gray-300"
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {formData.appointment_date ? format(formData.appointment_date, "d MMMM yyyy", { locale: tr }) : "Tarih seçin"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.appointment_date}
                      onSelect={(date) => {
                        setFormData({ ...formData, appointment_date: date, appointment_time: "" });
                        setAvailableSlots([]);
                        setBusySlots([]);
                        setAllSlots([]);
                      }}
                      locale={tr}
                      disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      className="rounded-lg"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Müsait Saatler */}
              <div className="space-y-2">
                <Label className="font-medium text-sm text-gray-700">
                  Müsait Saatler *
                </Label>
                {allSlots.length === 0 && formData.service_id && formData.appointment_date ? (
                  <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-gray-300">
                    {formData.staff_member_id 
                      ? "Seçili personelin bu tarihte müsait saati yok" 
                      : "Bu tarih için müsait saat bulunmamaktadır"}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {allSlots.map((time) => {
                      const isAvailable = availableSlots.includes(time);
                      const isBusy = busySlots.includes(time);
                      const isSelected = formData.appointment_time === time;
                      
                      return (
                        <button
                          key={time}
                          type="button"
                          onClick={() => {
                            if (isAvailable) {
                              setFormData({ ...formData, appointment_time: time });
                            }
                          }}
                          disabled={!isAvailable}
                          className={`px-4 py-2 rounded-full border transition-colors relative ${
                            isSelected && isAvailable
                              ? "bg-blue-600 text-white border-blue-600"
                              : isAvailable
                              ? "bg-gray-100 text-gray-800 border-gray-300 hover:bg-gray-200"
                              : isBusy
                              ? "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                              : "bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed opacity-60"
                          }`}
                          title={
                            isBusy 
                              ? formData.staff_member_id 
                                ? "Seçili personel bu saatte dolu" 
                                : "Tüm personeller bu saatte dolu"
                              : isAvailable 
                              ? "Müsait" 
                              : "Dolu"
                          }
                        >
                          {isBusy && (
                            <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <span className="w-full h-1 bg-red-500 opacity-80"></span>
                            </span>
                          )}
                          <Clock className="w-4 h-4 inline mr-1" />
                          {time}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Buttons */}
        <div className="border-t border-gray-200 p-4 flex gap-3">
          {currentStep > 1 && (
            <Button
              type="button"
              variant="outline"
              onClick={handleBack}
              className="flex-1 bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-lg"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Geri
            </Button>
          )}
          {currentStep < 3 ? (
            <Button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              İleri
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !formData.appointment_time}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Oluşturuluyor..." : "Randevuyu Oluştur"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AppointmentFormWizard;

