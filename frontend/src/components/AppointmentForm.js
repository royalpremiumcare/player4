import { useState, useEffect } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar as CalendarIcon, Clock, ArrowLeft, User } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : "";
const API = `${BACKEND_URL}/api`;

const AppointmentForm = ({ services, appointment, onSave, onCancel }) => {
  const { userRole } = useAuth();
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
  const [loading, setLoading] = useState(false);
  const [filteredServices, setFilteredServices] = useState([]);
  const [qualifiedStaff, setQualifiedStaff] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isNewCustomer, setIsNewCustomer] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");

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
      setIsNewCustomer(false);
    }
  }, [appointment]);

  useEffect(() => {
    if (formData.service_id && formData.appointment_date) {
      loadAvailableSlots();
    }
  }, [formData.service_id, formData.appointment_date, formData.staff_member_id]);

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
    if (formData.service_id && allStaff.length > 0) {
      const qualified = allStaff.filter(staff => 
        staff.permitted_service_ids?.includes(formData.service_id)
      );
      setQualifiedStaff(qualified);
      
      // Eğer seçili personel bu hizmeti veremiyorsa, seçimi sıfırla
      if (formData.staff_member_id && !qualified.find(s => s.username === formData.staff_member_id)) {
        setFormData(prev => ({ ...prev, staff_member_id: "" }));
      }
    }
  }, [formData.service_id, allStaff]);

  const loadCurrentUser = async () => {
    if (userRole === 'staff') {
      try {
        const response = await api.get("/users");
        const users = response.data || [];
        const token = localStorage.getItem('authToken');
        if (token) {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const currentUsername = payload.sub;
          const user = users.find(u => u.username === currentUsername);
          setCurrentUser(user);
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
      console.log("✅ Ayarlar yüklendi:", response.data);
    } catch (error) {
      console.error("Ayarlar yüklenemedi:", error);
      if (error.response?.status !== 401) {
        toast.error("Ayarlar yüklenirken bir hata oluştu.");
      }
    }
  };

  const loadAvailableSlots = async () => {
    if (!formData.service_id || !formData.appointment_date || !settings) {
      return;
    }

    try {
      const dateStr = format(formData.appointment_date, "yyyy-MM-dd");
      
      // Token'dan organization_id al
      const token = localStorage.getItem('authToken');
      if (!token) return;
      
      const payload = JSON.parse(atob(token.split('.')[1]));
      const organization_id = payload.org_id;

      const params = {
        service_id: formData.service_id,
        date: dateStr
      };

      // Eğer admin belirli bir personel seçtiyse, sadece o personelin müsait saatlerini göster
      if (formData.staff_member_id) {
        params.staff_id = formData.staff_member_id;
      }

      const response = await axios.get(`${API}/public/availability/${organization_id}`, {
        params: params
      });
      
      setAvailableSlots(response.data.available_slots || []);
      console.log("✅ Müsait saatler yüklendi:", response.data.available_slots);
    } catch (error) {
      console.error("❌ Müsait saatler yüklenemedi:", error);
      setAvailableSlots([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.customer_name || !formData.phone || !formData.service_id || !formData.appointment_time) {
      toast.error("Lütfen tüm zorunlu alanları doldurun");
      return;
    }

    // Personel kontrolü: Sadece atanan hizmetlere randevu alabilir
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

      // Eğer staff_member_id boşsa, backend otomatik atama yapacak
      if (!payload.staff_member_id) {
        delete payload.staff_member_id;
      }

      if (appointment) {
        await api.put(`/appointments/${appointment.id}`, payload);
        toast.success("Randevu güncellendi");
      } else {
        await api.post("/appointments", payload);
        toast.success("Randevu oluşturuldu");
      }
      onSave();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "İşlem başarısız";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Button
          data-testid="back-button"
          onClick={onCancel}
          variant="ghost"
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Geri
        </Button>
        <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          {appointment ? "Randevu Düzenle" : "Yeni Randevu"}
        </h2>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Müşteri Seçimi Toggle (Sadece yeni randevu için) */}
          {!appointment && customers.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center gap-4">
                <Label className="font-semibold text-gray-900">Müşteri Türü:</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={isNewCustomer ? "default" : "outline"}
                    onClick={() => {
                      setIsNewCustomer(true);
                      setSelectedCustomer("");
                      setFormData({ ...formData, customer_name: "", phone: "" });
                    }}
                  >
                    Yeni Müşteri
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={!isNewCustomer ? "default" : "outline"}
                    onClick={() => setIsNewCustomer(false)}
                  >
                    Mevcut Müşteri
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Mevcut Müşteri Seçimi */}
          {!appointment && !isNewCustomer && customers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="existing_customer">Müşteri Seç *</Label>
              
              {/* Arama Kutusu */}
              <Input
                type="text"
                placeholder="Müşteri adı ara..."
                value={customerSearchTerm}
                onChange={(e) => setCustomerSearchTerm(e.target.value)}
                className="mb-2"
              />
              
              {/* Müşteri Listesi */}
              <div className="max-h-60 overflow-y-auto border rounded-lg">
                {customers
                  .filter(customer => 
                    customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                  )
                  .map((customer) => (
                    <button
                      key={customer.phone}
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(customer.phone);
                        setFormData({
                          ...formData,
                          customer_name: customer.name,
                          phone: customer.phone
                        });
                        setCustomerSearchTerm(customer.name);
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors border-b ${
                        selectedCustomer === customer.phone ? 'bg-blue-100 font-semibold' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-gray-900">{customer.name}</span>
                        <span className="text-xs text-gray-500">
                          {customer.total_appointments} randevu
                        </span>
                      </div>
                    </button>
                  ))}
                {customers.filter(customer => 
                  customer.name.toLowerCase().includes(customerSearchTerm.toLowerCase())
                ).length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    Müşteri bulunamadı
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Müşteri Bilgileri (Yeni Müşteri veya Düzenleme) */}
          {(isNewCustomer || appointment) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="customer_name">Müşteri Adı *</Label>
                <Input
                  id="customer_name"
                  data-testid="customer-name-input"
                  value={formData.customer_name}
                  onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                  placeholder="Ad Soyad"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefon *</Label>
                <Input
                  id="phone"
                  data-testid="phone-input"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="05XX XXX XX XX"
                  required
                />
              </div>
            </div>
          )}

          {/* Seçili Mevcut Müşteri Bilgileri (Salt Okunur) */}
          {!appointment && !isNewCustomer && selectedCustomer && (
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm text-green-800">
                <strong>Seçili Müşteri:</strong> {formData.customer_name} - {formData.phone}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="service">Hizmet Türü *</Label>
            {userRole === 'staff' && filteredServices.length === 0 ? (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                Size hiçbir hizmet atanmamış. Lütfen yöneticinizle iletişime geçin.
              </div>
            ) : (
              <Select
                value={formData.service_id}
                onValueChange={(value) => setFormData({ ...formData, service_id: value })}
              >
                <SelectTrigger data-testid="service-select">
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
            {userRole === 'staff' && filteredServices.length > 0 && (
              <p className="text-xs text-gray-600">
                Sadece size atanan {filteredServices.length} hizmet görüntüleniyor
              </p>
            )}
          </div>

          {/* PERSONEL SEÇİMİ (Sadece admin görür) */}
          {userRole === 'admin' && formData.service_id && qualifiedStaff.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="staff">Personel (Opsiyonel)</Label>
              <Select
                value={formData.staff_member_id || "auto"}
                onValueChange={(value) => setFormData({ ...formData, staff_member_id: value === "auto" ? "" : value })}
              >
                <SelectTrigger>
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
              <p className="text-xs text-gray-600">
                {formData.staff_member_id ? "Seçili personelin müsait saatleri gösteriliyor" : "Otomatik atama: İlk müsait personele atanacak"}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Randevu Tarihi *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    data-testid="date-picker-button"
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {formData.appointment_date ? format(formData.appointment_date, "d MMMM yyyy", { locale: tr }) : "Tarih seçin"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.appointment_date}
                    onSelect={(date) => setFormData({ ...formData, appointment_date: date })}
                    locale={tr}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Randevu Saati *</Label>
              {availableSlots.length === 0 && formData.service_id && formData.appointment_date ? (
                <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                  {formData.staff_member_id 
                    ? "Seçili personelin bu tarihte müsait saati yok" 
                    : "Bu tarih için müsait saat bulunmamaktadır"}
                </div>
              ) : (
                <Select
                  value={formData.appointment_time}
                  onValueChange={(value) => setFormData({ ...formData, appointment_time: value })}
                  disabled={!formData.service_id || !formData.appointment_date}
                >
                  <SelectTrigger data-testid="time-select">
                    <SelectValue placeholder="Saat seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSlots.map((time) => (
                      <SelectItem key={time} value={time}>
                        <Clock className="w-4 h-4 inline mr-2" />
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notlar (Opsiyonel)</Label>
            <Textarea
              id="notes"
              data-testid="notes-textarea"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Ek bilgiler..."
              rows={3}
            />
          </div>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              className="flex-1"
            >
              İptal
            </Button>
            <Button
              data-testid="save-button"
              type="submit"
              disabled={loading || (userRole === 'staff' && filteredServices.length === 0) || availableSlots.length === 0}
              className="flex-1 bg-blue-500 hover:bg-blue-600"
            >
              {loading ? "Kaydediliyor..." : appointment ? "Güncelle" : "Kaydet"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default AppointmentForm;
