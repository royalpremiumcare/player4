import { useState, useEffect } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar, Clock, Phone, MessageSquare, Edit, Trash2, Check, X, ChevronLeft, ChevronRight, Search, MoreVertical, Filter } from "lucide-react";
import { toast } from "sonner";
// import axios from "axios"; // SİLİNDİ
import api from "../api/api"; // YENİ EKLENDİ (Token'ı otomatik ekler)
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
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

const Dashboard = ({ appointments, stats, onEditAppointment, onNewAppointment, onRefresh }) => {
  const [view, setView] = useState("today"); // today, past, future
  const [filteredAppointments, setFilteredAppointments] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [staffMembers, setStaffMembers] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState("all");
  const [selectedServiceFilter, setSelectedServiceFilter] = useState("all");
  const [currentUserFullName, setCurrentUserFullName] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");
  
  useEffect(() => {
    loadStaffMembers();
    loadServices();
    loadCurrentUserInfo();
  }, []);

  const loadStaffMembers = async () => {
    try {
      const response = await api.get("/users");
      setStaffMembers(response.data || []);
    } catch (error) {
      console.error("Personeller yüklenemedi:", error);
    }
  };

  const loadServices = async () => {
    try {
      const response = await api.get("/services");
      setServices(response.data || []);
    } catch (error) {
      console.error("Hizmetler yüklenemedi:", error);
    }
  };

  const loadCurrentUserInfo = async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const currentUsername = payload.sub;
        const response = await api.get("/users");
        const users = response.data || [];
        const currentUser = users.find(u => u.username === currentUsername);
        if (currentUser && currentUser.full_name) {
          setCurrentUserFullName(currentUser.full_name);
        }
      }
    } catch (error) {
      console.error("Kullanıcı bilgisi yüklenemedi:", error);
    }
  };
  
  const getStaffName = (staffId) => {
    if (!staffId) return "Atanmadı";
    const staff = staffMembers.find(s => s.username === staffId);
    return staff?.full_name || staff?.username || "Bilinmiyor";
  };

  useEffect(() => {
    filterAppointments();
  }, [appointments, view, searchTerm, selectedStaffFilter, selectedServiceFilter]);

  const filterAppointments = () => {
    let filtered = [...appointments];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(
        (apt) =>
          apt.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          apt.phone.includes(searchTerm) ||
          apt.service_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Staff filter
    if (selectedStaffFilter !== "all") {
      filtered = filtered.filter((apt) => apt.staff_member_id === selectedStaffFilter);
    }

    // Service filter
    if (selectedServiceFilter !== "all") {
      filtered = filtered.filter((apt) => apt.service_id === selectedServiceFilter);
    }

    // Date filter
    if (view === "today") {
      filtered = filtered.filter((apt) => apt.appointment_date === today);
    } else if (view === "past") {
      filtered = filtered.filter((apt) => apt.appointment_date < today);
    } else if (view === "future") {
      filtered = filtered.filter((apt) => apt.appointment_date > today);
    }

    // Sort by date and time
    filtered.sort((a, b) => {
      if (a.appointment_date !== b.appointment_date) {
        return view === "past"
          ? b.appointment_date.localeCompare(a.appointment_date)
          : a.appointment_date.localeCompare(b.appointment_date);
      }
      return a.appointment_time.localeCompare(b.appointment_time);
    });

    setFilteredAppointments(filtered);
  };

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      // await axios.put(`${API}/appointments/${appointmentId}`, { status: newStatus }); // ESKİ
      await api.put(`/appointments/${appointmentId}`, { status: newStatus }); // YENİ
      toast.success("Durum güncellendi");
      await onRefresh();
    } catch (error) {
      toast.error("Durum güncellenemedi");
    }
  };

  const handleDelete = async (appointmentId) => {
    try {
      // await axios.delete(`${API}/appointments/${appointmentId}`); // ESKİ
      await api.delete(`/appointments/${appointmentId}`); // YENİ
      toast.success("Randevu silindi");
      setDeleteDialog(null);
      await onRefresh();
    } catch (error) {
      toast.error("Randevu silinemedi");
    }
  };

  const handleCall = (phone) => {
    window.location.href = `tel:${phone}`;
  };

  const handleWhatsApp = (phone) => {
    // Remove all non-digit characters
    let cleanPhone = phone.replace(/\D/g, "");
    
    // Remove leading 0 if exists (Turkish format)
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }
    
    // Add +90 if not already present
    if (!cleanPhone.startsWith("90")) {
      cleanPhone = "90" + cleanPhone;
    }
    
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const getStatusBadge = (status) => {
    const variants = {
      Bekliyor: "default",
      Tamamlandı: "success",
      İptal: "destructive"
    };
    return <Badge variant={variants[status]} data-testid={`status-${status}`}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Tarih Bilgisi - EN ÜSTTE */}
      <div className="text-center bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200">
        <h2 className="text-2xl md:text-3xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          {format(new Date(), "d MMMM yyyy, EEEE", { locale: tr })}
        </h2>
        {currentUserFullName && (
          <p className="text-sm text-blue-600 mt-1">Hoş geldiniz, {currentUserFullName}</p>
        )}
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700 font-medium">Bugünkü Randevular</p>
                <p className="text-3xl font-bold text-blue-900 mt-1">{stats.today_appointments}</p>
              </div>
              <Calendar className="w-10 h-10 text-blue-500" />
            </div>
          </Card>
          
          <Card className="p-4 bg-gradient-to-br from-green-50 to-green-100 border-green-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700 font-medium">Tamamlanan</p>
                <p className="text-3xl font-bold text-green-900 mt-1">{stats.today_completed}</p>
              </div>
              <Check className="w-10 h-10 text-green-500" />
            </div>
          </Card>
        </div>
      )}

      {/* Header with Add Button and Menu */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">Randevularınızı Yönetin</h3>
          <p className="text-sm text-gray-600 mt-1">Filtreleyerek arama yapabilirsiniz</p>
        </div>
        <div className="flex gap-2">
          <Button
            data-testid="add-appointment-button"
            onClick={onNewAppointment}
            className="bg-blue-500 hover:bg-blue-600 text-white shadow-md"
          >
            + Yeni Randevu
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" data-testid="menu-button">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowSearchDialog(true)} data-testid="search-menu-item">
                <Search className="w-4 h-4 mr-2" />
                Ara
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search Dialog */}
      {showSearchDialog && (
        <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
          <div className="flex items-center gap-2 mb-2">
            <Search className="w-4 h-4 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Ara</h3>
            <button 
              onClick={() => {
                setShowSearchDialog(false);
                setSearchTerm("");
              }}
              className="ml-auto text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <Input
            data-testid="search-input"
            type="text"
            placeholder="Müşteri adı, telefon veya hizmet ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full"
            autoFocus
          />
          {searchTerm && (
            <p className="text-sm text-gray-600 mt-2">
              {filteredAppointments.length} sonuç bulundu
            </p>
          )}
        </Card>
      )}

      {/* Filtreler (Admin için) */}
      {staffMembers.length > 0 && (
        <Card className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-purple-600" />
            <h3 className="font-semibold text-gray-900">Filtrele</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Personel Filtresi */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Personel</label>
              <Select value={selectedStaffFilter} onValueChange={setSelectedStaffFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tüm Personeller" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {staffMembers.map((staff) => (
                    <SelectItem key={staff.username} value={staff.username}>
                      {staff.full_name || staff.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Hizmet Filtresi */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Hizmet</label>
              <Select value={selectedServiceFilter} onValueChange={setSelectedServiceFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tüm Hizmetler" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tümü</SelectItem>
                  {services.map((service) => (
                    <SelectItem key={service.id} value={service.id}>
                      {service.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(selectedStaffFilter !== "all" || selectedServiceFilter !== "all") && (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-purple-700">
                {filteredAppointments.length} randevu gösteriliyor
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedStaffFilter("all");
                  setSelectedServiceFilter("all");
                }}
                className="text-xs"
              >
                Filtreleri Temizle
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* View Toggle */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Button
          data-testid="view-past"
          onClick={() => setView("past")}
          variant={view === "past" ? "default" : "outline"}
          className={view === "past" ? "bg-blue-500 hover:bg-blue-600" : ""}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Geçmiş ({appointments.filter(a => a.appointment_date < today).length})
        </Button>
        <Button
          data-testid="view-today"
          onClick={() => setView("today")}
          variant={view === "today" ? "default" : "outline"}
          className={view === "today" ? "bg-blue-500 hover:bg-blue-600" : ""}
        >
          <Calendar className="w-4 h-4 mr-2" />
          Bugün ({appointments.filter(a => a.appointment_date === today).length})
        </Button>
        <Button
          data-testid="view-future"
          onClick={() => setView("future")}
          variant={view === "future" ? "default" : "outline"}
          className={view === "future" ? "bg-blue-500 hover:bg-blue-600" : ""}
        >
          Gelecek ({appointments.filter(a => a.appointment_date > today).length})
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Appointments List */}
      <div className="space-y-4">
        {filteredAppointments.length === 0 ? (
          <Card className="p-8 text-center">
            <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">Randevu bulunamadı</p>
          </Card>
        ) : (
          filteredAppointments.map((appointment) => (
            <Card
              key={appointment.id}
              data-testid={`appointment-card-${appointment.id}`}
              className="p-4 appointment-card hover:shadow-lg border-l-4"
              style={{
                borderLeftColor:
                  appointment.status === "Tamamlandı"
                    ? "#10b981"
                    : appointment.status === "İptal"
                    ? "#ef4444"
                    : "#f59e0b"
              }}
            >
              <div className="flex flex-col lg:flex-row justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">{appointment.customer_name}</h3>
                      <p className="text-sm text-blue-600 font-medium">{appointment.service_name}</p>
                    </div>
                    {getStatusBadge(appointment.status)}
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-blue-500" />
                      <span className="text-gray-600">{format(new Date(appointment.appointment_date), "d MMMM yyyy", { locale: tr })}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-500" />
                      <span className="text-gray-900 font-medium">{appointment.appointment_time}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{appointment.phone}</span>
                    <button
                      data-testid={`call-button-${appointment.id}`}
                      onClick={() => handleCall(appointment.phone)}
                      className="ml-2 p-1.5 hover:bg-green-100 rounded-full transition-colors"
                      title="Ara"
                    >
                      <Phone className="w-4 h-4 text-green-600" />
                    </button>
                    <button
                      data-testid={`whatsapp-button-${appointment.id}`}
                      onClick={() => handleWhatsApp(appointment.phone)}
                      className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                      title="WhatsApp"
                    >
                      <MessageSquare className="w-4 h-4 text-green-600" />
                    </button>
                  </div>

                  {/* Model D: Atanan Personel */}
                  <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="text-sm font-medium text-purple-900">
                      Atanan Personel:
                    </span>
                    <span className="text-sm text-purple-700 font-semibold">
                      {getStaffName(appointment.staff_member_id)}
                    </span>
                  </div>

                  {appointment.notes && (
                    <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      <span className="font-medium">Not:</span> {appointment.notes}
                    </p>
                  )}
                </div>

                <div className="flex lg:flex-col gap-2">
                  {appointment.status === "Bekliyor" && (
                    <Button
                      data-testid={`complete-button-${appointment.id}`}
                      onClick={() => handleStatusChange(appointment.id, "Tamamlandı")}
                      size="sm"
                      className="bg-green-500 hover:bg-green-600"
                    >
                      <Check className="w-4 h-4 mr-1" />
                      Tamamla
                    </Button>
                  )}
                  <Button
                    data-testid={`edit-button-${appointment.id}`}
                    onClick={() => onEditAppointment(appointment)}
                    size="sm"
                    variant="outline"
                  >
                    <Edit className="w-4 h-4 mr-1" />
                    Düzenle
                  </Button>
                  {appointment.status === "Bekliyor" && (
                    <Button
                      data-testid={`cancel-button-${appointment.id}`}
                      onClick={() => handleStatusChange(appointment.id, "İptal")}
                      size="sm"
                      variant="outline"
                      className="text-red-600 hover:bg-red-50"
                    >
                      <X className="w-4 h-4 mr-1" />
                      İptal
                    </Button>
                  )}
                  <Button
                    data-testid={`delete-button-${appointment.id}`}
                    onClick={() => setDeleteDialog(appointment)}
                    size="sm"
                    variant="outline"
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Randevuyu Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.customer_name} için oluşturulan randevuyu silmek istediğinizden emin misiniz?
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-button"
              onClick={() => handleDelete(deleteDialog?.id)}
              className="bg-red-500 hover:bg-red-600"
            >
              Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dashboard;