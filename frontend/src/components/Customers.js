import { useState, useEffect } from "react";
import { Users, Phone, MessageSquare, Calendar, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
// import axios from "axios"; // SİLİNDİ
import api from "../api/api"; // YENİ EKLENDİ (Token'ı otomatik ekler)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL; // SİLİNDİ
// const API = `${BACKEND_URL}/api`; // SİLİNDİ

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState(null);

  useEffect(() => {
    loadCustomers();
    
    // === OTOMATİK YENİLEME (POLLING) ===
    // Her 3 saniyede bir müşterileri otomatik olarak yenile
    const refreshInterval = setInterval(() => {
      // Sadece sayfa görünür ve odakta iken yenile
      if (document.visibilityState === 'visible') {
        loadCustomers();
      }
    }, 3000); // 3 saniye (3000 ms) - Daha hızlı güncelleme için azaltıldı

    // Sayfa görünür hale geldiğinde veya pencere odaklandığında hemen yenile
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadCustomers();
      }
    };

    const handleFocus = () => {
      loadCustomers();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Cleanup
    return () => {
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      // const response = await axios.get(`${API}/appointments`); // ESKİ
      const response = await api.get("/appointments"); // YENİ
      
      // Group appointments by phone number to get unique customers
      const customerMap = {};
      response.data.forEach(apt => {
        if (!customerMap[apt.phone]) {
          customerMap[apt.phone] = {
            name: apt.customer_name,
            phone: apt.phone,
            address: apt.address,
            totalAppointments: 0,
            completedAppointments: 0,
            lastAppointment: null,
            services: []
          };
        }
        
        customerMap[apt.phone].totalAppointments++;
        if (apt.status === 'Tamamlandı') {
          customerMap[apt.phone].completedAppointments++;
        }
        
        if (!customerMap[apt.phone].lastAppointment || 
            apt.appointment_date > customerMap[apt.phone].lastAppointment) {
          customerMap[apt.phone].lastAppointment = apt.appointment_date;
        }
        
        if (!customerMap[apt.phone].services.includes(apt.service_name)) {
          customerMap[apt.phone].services.push(apt.service_name);
        }
      });
      
      const customerList = Object.values(customerMap).sort((a, b) => 
        b.totalAppointments - a.totalAppointments
      );
      
      setCustomers(customerList);
    } catch (error) {
      // 401 (giriş yapılmadı) hatasıysa App.js halledecek, diğer hataları göster
      if (error.response && error.response.status !== 401) {
        toast.error("Müşteriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCall = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const handleWhatsApp = (phone) => {
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith("90")) {
      cleanPhone = "90" + cleanPhone;
    }
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Müşteriler
        </h2>
        <p className="text-sm text-gray-600 mt-1">Tüm müşterilerinizi görüntüleyin ve yönetin</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700 font-medium">Toplam Müşteri</p>
              <p className="text-3xl font-bold text-blue-900 mt-1">{customers.length}</p>
            </div>
            <Users className="w-10 h-10 text-blue-500" />
          </div>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-700 font-medium">Toplam Randevu</p>
              <p className="text-3xl font-bold text-green-900 mt-1">
                {customers.reduce((sum, c) => sum + c.totalAppointments, 0)}
              </p>
            </div>
            <Calendar className="w-10 h-10 text-green-500" />
          </div>
        </Card>
        
        <Card className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-700 font-medium">Tamamlanan</p>
              <p className="text-3xl font-bold text-purple-900 mt-1">
                {customers.reduce((sum, c) => sum + c.completedAppointments, 0)}
              </p>
            </div>
            <div className="text-2xl">✓</div>
          </div>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          data-testid="customer-search"
          type="text"
          placeholder="Müşteri adı veya telefon ara..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Yükleniyor...</p>
          </Card>
        ) : filteredCustomers.length === 0 ? (
          <Card className="p-8 text-center">
            <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Müşteri bulunamadı</p>
          </Card>
        ) : (
          filteredCustomers.map((customer) => (
            <Card
              key={customer.phone}
              data-testid={`customer-${customer.phone}`}
              className="p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{customer.name}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <Phone className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">{customer.phone}</span>
                        <button
                          data-testid={`call-customer-${customer.phone}`}
                          onClick={() => handleCall(customer.phone)}
                          className="ml-2 p-1.5 hover:bg-green-100 rounded-full transition-colors"
                          title="Ara"
                        >
                          <Phone className="w-3.5 h-3.5 text-green-600" />
                        </button>
                        <button
                          data-testid={`whatsapp-customer-${customer.phone}`}
                          onClick={() => handleWhatsApp(customer.phone)}
                          className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-green-600" />
                        </button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="secondary">
                        {customer.totalAppointments} Randevu
                      </Badge>
                      <Badge variant="success">
                        {customer.completedAppointments} Tamamlandı
                      </Badge>
                    </div>
                  </div>

                  {customer.address && (
                    <p className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">Adres:</span> {customer.address}
                    </p>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-gray-600 font-medium">Hizmetler:</span>
                    {customer.services.map((service, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {service}
                      </Badge>
                    ))}
                  </div>

                  {customer.lastAppointment && (
                    <p className="text-xs text-gray-500 mt-2">
                      Son randevu: {format(new Date(customer.lastAppointment), "d MMMM yyyy", { locale: tr })}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default Customers;