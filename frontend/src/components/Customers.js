import { useState, useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { Search, Phone, MessageSquare, ChevronRight, Plus, ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const Customers = ({ onNavigate, onNewAppointment }) => {
  const { userRole, token } = useAuth();
  const [currentStaffUsername, setCurrentStaffUsername] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerHistory, setCustomerHistory] = useState(null);
  const [customerNotes, setCustomerNotes] = useState("");
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [newCustomerDialogOpen, setNewCustomerDialogOpen] = useState(false);
  const [newCustomerData, setNewCustomerData] = useState({
    name: "",
    phone: ""
  });
  const [savingCustomer, setSavingCustomer] = useState(false);

  // WebSocket connection for real-time updates
  const socketRef = useRef(null);

  useEffect(() => {
    const initialize = async () => {
      if (userRole === 'staff') {
        await loadCurrentStaffUsername();
      }
      await loadCustomers();
    };
    initialize();
    
    // Initialize Socket.IO connection
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
    const socketUrl = BACKEND_URL || window.location.origin;
    
    // Get token for authentication
    const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    
    const socket = io(socketUrl, {
      path: '/api/socket.io',
      transports: ['websocket'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      query: {
        token: authToken || ''
      }
    });
    
    socketRef.current = socket;
    
    socket.on('connect', () => {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const organizationId = payload.org_id;
          if (organizationId) {
            socket.emit('join_organization', { organization_id: organizationId });
          }
        } catch (error) {
          console.error('Error parsing token:', error);
        }
      }
    });
    
    socket.on('appointment_created', () => {
      loadCustomers();
      if (selectedCustomer) {
        loadCustomerHistory(selectedCustomer.phone);
      }
    });
    
    socket.on('appointment_updated', () => {
      loadCustomers();
      if (selectedCustomer) {
        loadCustomerHistory(selectedCustomer.phone);
      }
    });
    
    socket.on('appointment_deleted', () => {
      loadCustomers();
      if (selectedCustomer) {
        loadCustomerHistory(selectedCustomer.phone);
      }
    });
    
    socket.on('customer_added', () => {
      loadCustomers();
    });
    
    socket.on('customer_deleted', (data) => {
      loadCustomers();
      // Eğer silinen müşteri seçiliyse, seçimi temizle
      if (selectedCustomer && data?.phone && selectedCustomer.phone === data.phone) {
        setSelectedCustomer(null);
        setCustomerHistory(null);
        setCustomerNotes("");
      }
    });
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [selectedCustomer]);

  const loadCurrentStaffUsername = async () => {
    try {
      if (token) {
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        setCurrentStaffUsername(tokenPayload.sub || tokenPayload.username);
      }
    } catch (error) {
      console.error("Kullanıcı bilgisi alınamadı:", error);
    }
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      // Backend'den müşterileri yükle (randevulardan ve customers collection'ından)
      const response = await api.get("/customers");
      
      // Backend'den gelen müşterileri frontend formatına dönüştür
      const customerList = (response.data || []).map(customer => ({
        name: customer.name,
        phone: customer.phone,
        totalAppointments: customer.total_appointments || 0,
        isPending: customer.is_pending || false
      }));
      
      setCustomers(customerList);
    } catch (error) {
      if (error.response && error.response.status !== 401) {
        toast.error("Müşteriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerHistory = async (phone) => {
    try {
      setLoadingHistory(true);
      const response = await api.get(`/customers/${phone}/history`);
      
      // Personel için sadece kendi randevularını filtrele
      let appointments = response.data.appointments || [];
      if (userRole === 'staff' && currentStaffUsername) {
        appointments = appointments.filter(apt => 
          apt.staff_member_id === currentStaffUsername
        );
      }
      
      setCustomerHistory({
        ...response.data,
        appointments: appointments
      });
      
      // Müşteri notlarını backend'den yükle
      setCustomerNotes(response.data.notes || "");
    } catch (error) {
      toast.error("Müşteri geçmişi yüklenemedi");
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleCustomerClick = async (customer) => {
    setSelectedCustomer(customer);
    await loadCustomerHistory(customer.phone);
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

  const handleSaveNotes = async () => {
    if (selectedCustomer) {
      try {
        await api.put(`/customers/${selectedCustomer.phone}/notes`, {
          notes: customerNotes
        });
        toast.success("Notlar kaydedildi");
      } catch (error) {
        toast.error(error.response?.data?.detail || "Notlar kaydedilemedi");
      }
    }
  };

  const getInitials = (name) => {
    if (!name) return "??";
    const parts = name.trim().split(" ");
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return;
    
    setDeleting(true);
    try {
      const response = await api.delete(`/customers/${customerToDelete.phone}`);
      toast.success(response.data?.message || "Müşteri başarıyla silindi");
      
      // Eğer silinen müşteri seçiliyse, seçimi temizle
      if (selectedCustomer && selectedCustomer.phone === customerToDelete.phone) {
        setSelectedCustomer(null);
        setCustomerHistory(null);
        setCustomerNotes("");
      }
      
      // Müşteriler listesini yeniden yükle
      await loadCustomers();
      
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    } catch (error) {
      toast.error(error.response?.data?.detail || "Müşteri silinirken bir hata oluştu");
    } finally {
      setDeleting(false);
    }
  };

  const handleAddNewCustomer = async () => {
    if (!newCustomerData.name.trim() || !newCustomerData.phone.trim()) {
      toast.error("Lütfen müşteri adı ve telefon numarasını girin");
      return;
    }

    // Telefon numarası formatını temizle
    const cleanPhone = newCustomerData.phone.replace(/\D/g, "");
    if (cleanPhone.length < 10) {
      toast.error("Geçerli bir telefon numarası girin");
      return;
    }

    setSavingCustomer(true);
    try {
      // Müşteriyi backend'e kaydet (veritabanına)
      const response = await api.post("/customers", {
        name: newCustomerData.name.trim(),
        phone: newCustomerData.phone.trim()
      });
      
      toast.success(response.data?.message || "Müşteri başarıyla eklendi");
      
      // Dialog'u kapat ve formu temizle
      setNewCustomerDialogOpen(false);
      setNewCustomerData({ name: "", phone: "" });
      
      // Müşteriler listesini yeniden yükle
      await loadCustomers();
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Müşteri eklenirken bir hata oluştu";
      toast.error(errorMessage);
    } finally {
      setSavingCustomer(false);
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  // Müşteri Detay Görünümü
  if (selectedCustomer) {
    return (
      <div className="space-y-4 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setSelectedCustomer(null);
              setCustomerHistory(null);
              setCustomerNotes("");
            }}
            className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Müşterilere Dön</span>
          </button>
        </div>

        {/* KART 1: Profil ve İletişim */}
        <Card className="bg-white p-6 rounded-xl shadow-sm text-center">
          <div className="flex flex-col items-center">
            {/* Büyük Avatar */}
            <div className="w-20 h-20 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-bold text-2xl mb-4">
              {getInitials(selectedCustomer.name)}
            </div>
            
            {/* İsim */}
            <h2 className="text-xl font-bold text-gray-900 mt-4 mb-2">
              {selectedCustomer.name}
            </h2>
            
            {/* Telefon */}
            <p className="text-gray-500 mb-6">{selectedCustomer.phone}</p>
            
            {/* Aksiyon Butonları */}
            <div className="flex gap-3 w-full max-w-xs">
              <Button
                onClick={() => handleCall(selectedCustomer.phone)}
                variant="outline"
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg"
              >
                <Phone className="w-4 h-4 mr-2" />
                Ara
              </Button>
              <Button
                onClick={() => handleWhatsApp(selectedCustomer.phone)}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white rounded-lg"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                WhatsApp
              </Button>
            </div>
            
            {/* Sil Butonu (Sadece Admin) */}
            {userRole === 'admin' && (
              <Button
                onClick={() => {
                  setCustomerToDelete(selectedCustomer);
                  setDeleteDialogOpen(true);
                }}
                variant="outline"
                className="w-full max-w-xs mt-3 border border-red-300 text-red-600 hover:bg-red-50 rounded-lg"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Müşteriyi Sil
              </Button>
            )}
          </div>
        </Card>

        {/* KART 2: Randevu Geçmişi */}
        <Card className="bg-white p-4 rounded-xl shadow-sm mt-4">
          <h3 className="font-semibold text-gray-900 mb-3">Randevu Geçmişi</h3>
          {loadingHistory ? (
            <p className="text-gray-500 text-center py-4">Yükleniyor...</p>
          ) : customerHistory && customerHistory.appointments.length > 0 ? (
            <div className="space-y-3">
              {customerHistory.appointments.map((apt, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {format(new Date(apt.appointment_date), "d MMMM yyyy", { locale: tr })}
                    </p>
                    <p className="text-sm text-gray-600">
                      {apt.appointment_time} - {apt.service_name}
                    </p>
                    {userRole === 'admin' && apt.staff_member_id && (
                      <p className="text-xs text-gray-500 mt-1">
                        Personel: {apt.staff_member_id}
                      </p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    apt.status === 'Tamamlandı' ? 'bg-green-100 text-green-700' :
                    apt.status === 'Bekliyor' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {apt.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">Randevu geçmişi bulunamadı</p>
          )}
        </Card>

        {/* KART 3: Müşteri Notları */}
        <Card className="bg-white p-4 rounded-xl shadow-sm mt-4">
          <h3 className="font-semibold text-gray-900 mb-2">Notlar</h3>
          <div className="space-y-3">
            <Textarea
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              placeholder="Müşteriyle ilgili notlar (alerji, tercih vb.)..."
              rows={4}
              className="rounded-lg border border-gray-300"
            />
            <Button
              onClick={handleSaveNotes}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              Kaydet
            </Button>
          </div>
        </Card>
        
        {/* Silme Onay Dialog'u - Müşteri Detay Görünümü */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
              <AlertDialogDescription>
                {customerToDelete && (
                  <>
                    <strong>{customerToDelete.name}</strong> müşterisini ve tüm randevularını silmek istediğinize emin misiniz?
                    <br />
                    <span className="text-red-600 font-semibold">Bu işlem geri alınamaz!</span>
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDeleteCustomer}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700"
              >
                {deleting ? "Siliniyor..." : "Sil"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // Müşteri Listesi Görünümü
  return (
    <div className="space-y-4 pb-6">
      {/* Geri Tuşu (Ana Sayfaya Dön) */}
      {onNavigate && (
        <button
          onClick={() => onNavigate("dashboard")}
          className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors mb-2"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Anasayfaya Dön</span>
        </button>
      )}
      
      {/* Üst Bölüm: Arama ve Ekleme */}
      <div className="sticky top-0 z-10 bg-gray-50 pb-4 pt-2">
        {/* Arama Çubuğu */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            type="text"
            placeholder="Müşteri Ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 bg-white rounded-lg border border-gray-300 shadow-sm"
          />
        </div>
        
        {/* Yeni Müşteri Ekle Butonu (Sadece Admin) */}
        {userRole === 'admin' && (
          <Button
            onClick={() => {
              setNewCustomerDialogOpen(true);
            }}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            Yeni Müşteri
          </Button>
        )}
      </div>

      {/* Müşteri Listesi */}
      <div className="space-y-3">
        {loading ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Yükleniyor...</p>
          </Card>
        ) : filteredCustomers.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-gray-500">Müşteri bulunamadı</p>
          </Card>
        ) : (
          filteredCustomers.map((customer) => (
            <Card
              key={customer.phone}
              className="p-4 mb-3 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center gap-4">
                {/* Sol: Avatar */}
                <div 
                  onClick={() => handleCustomerClick(customer)}
                  className="w-10 h-10 bg-gray-100 text-gray-600 rounded-full flex items-center justify-center font-bold flex-shrink-0 cursor-pointer"
                >
                  {getInitials(customer.name)}
                </div>
                
                {/* Orta: Bilgi */}
                <div 
                  onClick={() => handleCustomerClick(customer)}
                  className="flex-1 min-w-0 cursor-pointer"
                >
                  <h3 className="text-gray-900 font-semibold text-base truncate">
                    {customer.name}
                  </h3>
                  <p className="text-gray-500 text-sm truncate">
                    {customer.phone}
                  </p>
                </div>
                
                {/* Sağ: Butonlar */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {userRole === 'admin' && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomerToDelete(customer);
                        setDeleteDialogOpen(true);
                      }}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Müşteriyi Sil"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                  <ChevronRight 
                    onClick={() => handleCustomerClick(customer)}
                    className="w-5 h-5 text-gray-400 cursor-pointer" 
                  />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
      
      {/* Silme Onay Dialog'u */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Müşteriyi Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {customerToDelete && (
                <>
                  <strong>{customerToDelete.name}</strong> müşterisini ve tüm randevularını silmek istediğinize emin misiniz?
                  <br />
                  <span className="text-red-600 font-semibold">Bu işlem geri alınamaz!</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCustomer}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Yeni Müşteri Ekleme Dialog'u */}
      <Dialog open={newCustomerDialogOpen} onOpenChange={setNewCustomerDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Yeni Müşteri Ekle</DialogTitle>
            <DialogDescription>
              Müşteri bilgilerini girin. Randevu oluştururken bu müşteriyi seçebilirsiniz.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-customer-name" className="text-sm font-semibold text-gray-900">
                Ad Soyad *
              </Label>
              <Input
                id="new-customer-name"
                type="text"
                placeholder="Ad Soyad"
                value={newCustomerData.name}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, name: e.target.value })}
                className="rounded-lg border border-gray-300"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-customer-phone" className="text-sm font-semibold text-gray-900">
                Telefon Numarası *
              </Label>
              <Input
                id="new-customer-phone"
                type="tel"
                placeholder="05XX XXX XX XX"
                value={newCustomerData.phone}
                onChange={(e) => setNewCustomerData({ ...newCustomerData, phone: e.target.value })}
                className="rounded-lg border border-gray-300"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewCustomerDialogOpen(false);
                setNewCustomerData({ name: "", phone: "" });
              }}
              disabled={savingCustomer}
            >
              İptal
            </Button>
            <Button
              onClick={handleAddNewCustomer}
              disabled={savingCustomer || !newCustomerData.name.trim() || !newCustomerData.phone.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {savingCustomer ? "Kaydediliyor..." : "Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
