import { useState, useEffect, useCallback, useRef } from "react";
import { format, addDays, isToday, isTomorrow } from "date-fns";
import { tr } from "date-fns/locale";
import io from "socket.io-client";
import { 
  Calendar, 
  Clock, 
  Phone, 
  MessageSquare, 
  Edit, 
  Trash2, 
  Check, 
  X, 
  AlertCircle,
  MoreVertical,
  User,
  FileText
} from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
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

const Dashboard = ({ appointments, stats, userRole, onEditAppointment, onNewAppointment, onRefresh, onNavigate }) => {
  const { token } = useAuth();
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [staffMembers, setStaffMembers] = useState([]);
  const [currentStaffUsername, setCurrentStaffUsername] = useState(null);
  const [personnelStats, setPersonnelStats] = useState(null);
  const socketRef = useRef(null);

  const today = format(new Date(), "yyyy-MM-dd");
  const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");

  // Randevu bitiş saatini hesapla
  const calculateEndTime = (startTime, duration) => {
    if (!startTime || !duration) {
      console.log("⚠️ calculateEndTime: startTime veya duration yok", { startTime, duration });
      return null;
    }
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + (typeof duration === 'number' ? duration : parseInt(duration, 10));
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      const result = `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
      console.log(`✅ calculateEndTime: ${startTime} + ${duration}dk = ${result}`);
      return result;
    } catch (error) {
      console.error("❌ calculateEndTime hatası:", error, { startTime, duration });
      return null;
    }
  };
  
  const loadPersonnelStats = useCallback(async () => {
    try {
      const response = await api.get("/stats/personnel");
      setPersonnelStats(response.data);
    } catch (error) {
      console.error("Personel istatistikleri yüklenemedi:", error);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    if (userRole === 'staff') {
      loadCurrentStaffUsername();
      loadPersonnelStats();
    }
  }, [userRole, loadPersonnelStats]);

  useEffect(() => {
    if (settings !== null) {
      loadStaffMembers();
    }
  }, [settings, userRole]);

  // Randevular güncellendiğinde personel stats'ını yenile
  useEffect(() => {
    if (userRole === 'staff') {
      loadPersonnelStats();
    }
  }, [appointments.length, userRole, loadPersonnelStats]);

  // WebSocket bağlantısı - real-time güncellemeler için
  useEffect(() => {
    if (!socketRef.current && token) {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
      const socketUrl = BACKEND_URL || window.location.origin;
      const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      const socket = io(socketUrl, {
        path: '/api/socket.io',
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        auth: {
          token: authToken || ''
        }
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (authToken) {
          try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            const organizationId = payload.org_id;
            if (organizationId) {
              socket.emit('join_organization', { organization_id: organizationId });
            }
          } catch (error) {
            console.error('Dashboard - Token parse error:', error);
          }
        }
      });

      socket.on('appointment_created', () => {
        if (onRefresh) onRefresh();
        if (userRole === 'staff') loadPersonnelStats();
      });

      socket.on('appointment_updated', () => {
        if (onRefresh) onRefresh();
        if (userRole === 'staff') loadPersonnelStats();
      });

      socket.on('appointment_deleted', () => {
        if (onRefresh) onRefresh();
        if (userRole === 'staff') loadPersonnelStats();
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  const loadCurrentStaffUsername = async () => {
    try {
      if (token) {
        // Token'dan username'i çıkar
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        setCurrentStaffUsername(tokenPayload.sub || tokenPayload.username);
      }
    } catch (error) {
      console.error("Kullanıcı bilgisi alınamadı:", error);
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

  const loadStaffMembers = async () => {
    if (userRole !== 'admin') return;
    try {
      const response = await api.get("/users");
      let staff = (response.data || []).filter(u => u.role === 'staff');
      
      // Admin'in "hizmet verir" ayarı açıksa admin'i de ekle
      if (settings?.admin_provides_service !== false) {
        const admin = (response.data || []).find(u => u.role === 'admin');
        if (admin) {
          staff = [...staff, admin];
        }
      }
      
      setStaffMembers(staff);
    } catch (error) {
      console.error("Personeller yüklenemedi:", error);
    }
  };
  
  const getStaffName = (staffId) => {
    // Eğer ayarlar kapalıysa (customer_can_choose_staff ve admin_provides_service kapalı), personel bilgisi gösterilmemeli
    if (settings && !settings.customer_can_choose_staff && !settings.admin_provides_service) {
      return null; // null döndür, böylece gösterilmez
    }
    
    if (!staffId) {
      return "Atanmadı";
    }
    const staff = staffMembers.find(s => s.username === staffId);
    return staff?.full_name || staff?.username || "Bilinmiyor";
  };

  const getStatusBorderColor = (status) => {
    switch (status) {
      case "Tamamlandı":
        return "border-l-4 border-l-green-500";
      case "İptal":
        return "border-l-4 border-l-red-500";
      case "Bekliyor":
        return "border-l-4 border-l-yellow-500";
      default:
        return "border-l-4 border-l-gray-300";
    }
  };

  // Bugünün randevuları - Personel için sadece kendi randevuları
  const todayAppointments = appointments.filter(apt => {
    const aptDate = apt.appointment_date || apt.date;
    if (!aptDate) {
      console.log("⚠️ Randevu tarihi yok:", apt);
      return false;
    }
    if (aptDate !== today) {
      console.log(`⚠️ Randevu bugün değil: ${aptDate} !== ${today}`, apt);
      return false;
    }
    if (userRole === 'staff' && currentStaffUsername) {
      if (apt.staff_member_id !== currentStaffUsername) {
        console.log(`⚠️ Randevu bu personele ait değil: ${apt.staff_member_id} !== ${currentStaffUsername}`, apt);
        return false;
      }
    }
    console.log("✅ Randevu bugün ve görüntüleniyor:", apt);
    return true;
  });
  
  // Yarının randevuları - Personel için sadece kendi randevuları
  const tomorrowAppointments = appointments
    .filter(apt => {
      const aptDate = apt.appointment_date || apt.date;
      if (!aptDate) {
        console.log("⚠️ Yarın filtresi: Randevu tarihi yok:", apt);
        return false;
      }
      if (aptDate !== tomorrow) {
        console.log(`⚠️ Yarın filtresi: Randevu yarın değil: ${aptDate} !== ${tomorrow}`, apt);
        return false;
      }
      if (userRole === 'staff' && currentStaffUsername) {
        if (apt.staff_member_id !== currentStaffUsername) {
          console.log(`⚠️ Yarın filtresi: Randevu bu personele ait değil: ${apt.staff_member_id} !== ${currentStaffUsername}`, apt);
          return false;
        }
      }
      console.log("✅ Yarın filtresi: Randevu yarın ve görüntüleniyor:", apt);
      return true;
    })
    .sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
  
  console.log(`📊 Dashboard Debug: today=${today}, tomorrow=${tomorrow}, total appointments=${appointments.length}, todayAppointments=${todayAppointments.length}, tomorrowAppointments=${tomorrowAppointments.length}`);

  // Randevuları saat sırasına göre sırala
  const sortedTodayAppointments = [...todayAppointments].sort((a, b) => 
    a.appointment_time.localeCompare(b.appointment_time)
  );

  const handleStatusChange = async (appointmentId, newStatus) => {
    try {
      await api.put(`/appointments/${appointmentId}`, { status: newStatus });
      toast.success("Durum güncellendi");
      await onRefresh();
      if (userRole === 'staff') {
        await loadPersonnelStats();
      }
    } catch (error) {
      toast.error("Durum güncellenemedi");
    }
  };

  const handleDelete = async (appointmentId) => {
    try {
      await api.delete(`/appointments/${appointmentId}`);
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
    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) {
      cleanPhone = cleanPhone.substring(1);
    }
    if (!cleanPhone.startsWith("90")) {
      cleanPhone = "90" + cleanPhone;
    }
    window.open(`https://wa.me/${cleanPhone}`, "_blank");
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Tamamlandı":
        return "text-green-500";
      case "İptal":
        return "text-red-500";
      case "Bekliyor":
        return "text-yellow-500";
      default:
        return "text-gray-500";
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case "Tamamlandı":
        return <Check className="w-4 h-4 text-green-500" />;
      case "İptal":
        return <X className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  // Progress bar rengi - %90'dan fazla ise uyarı rengi
  const getProgressColor = (percentage) => {
    if (percentage >= 90) {
      return "bg-gradient-to-r from-yellow-400 to-red-500";
    }
    return "bg-blue-600";
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" style={{ fontFamily: 'Inter, sans-serif', position: 'relative' }}>
      {/* KART 1: Abonelik / Kota Durumu */}
      {stats?.quota && userRole === 'admin' && (
        <div className="px-4 pt-6 pb-4">
          <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              {/* Başlık */}
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {stats.quota.is_trial ? "Ücretsiz Deneme" : stats.quota.plan_name}
                </h2>
                  {stats.quota.is_trial && stats.quota.trial_days_remaining !== undefined && (
                  <p className="text-sm text-gray-600 mt-1">
                    Kalan {stats.quota.trial_days_remaining} gün
                    </p>
                  )}
              </div>

              {/* Kota Bilgisi */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Randevu Kotası</span>
                  <span className={`font-semibold ${
                    stats.quota.is_low_quota ? 'text-red-600' : 'text-gray-900'
                  }`}>
                    {stats.quota.quota_usage} / {stats.quota.quota_limit}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5">
                  <div
                    className={`h-2.5 rounded-full ${getProgressColor(stats.quota.quota_percentage)}`}
                    style={{ width: `${Math.min(stats.quota.quota_percentage, 100)}%` }}
                  ></div>
              </div>
              <p className="text-xs text-gray-600">
                Kalan: <span className="font-semibold">{stats.quota.quota_remaining}</span> randevu
              </p>
              </div>

              {/* Uyarı Mesajları */}
              {stats.quota.is_low_quota && (
                <div className="flex items-center gap-2 text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4" />
                  <span>Limitiniz dolmak üzere, paketinizi yükseltin</span>
                </div>
              )}
              {stats.quota.is_trial && stats.quota.trial_days_remaining !== undefined && stats.quota.trial_days_remaining <= 2 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-lg">
                    <AlertCircle className="w-4 h-4" />
                    <span>Trial süreniz bitiyor, paket seçin</span>
                  </div>
                  <Button
                    onClick={() => onNavigate && onNavigate("subscribe")}
                    className="w-full bg-blue-600 hover:bg-blue-700 h-10 text-sm font-semibold rounded-lg"
                  >
                    Şimdi Abone Ol
                  </Button>
                </div>
              )}
            </div>
            </Card>
        </div>
      )}

      {/* KART 2: Hızlı İstatistikler */}
      {stats && userRole === 'admin' && (
        <div className="px-4 py-4">
          <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Hızlı Bakış</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Bugünkü</p>
                  <p className="text-xl font-bold text-gray-900">{stats.today_appointments}</p>
          </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Tamamlanan</p>
                  <p className="text-xl font-bold text-green-600">{stats.today_completed}</p>
        </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Bugünkü Hizmet Tutarı</p>
                  <p className="text-xl font-bold text-blue-600">{stats.bugunku_toplam_hizmet_tutari?.toLocaleString('tr-TR') || 0} ₺</p>
          </div>
      </div>
          </div>
        </Card>
        </div>
      )}

      {/* KART: Personel Hızlı Bakış (Sadece personel görür) */}
      {personnelStats && userRole === 'staff' && (
        <div className="px-4 py-4">
          <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Hızlı Bakış</h2>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Bugünkü</p>
                  <p className="text-xl font-bold text-gray-900">{todayAppointments.length}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Tamamlanan</p>
                  <p className="text-xl font-bold text-green-600">{personnelStats.completed_appointments_count || 0}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-xs text-gray-600 mb-1">Bugünkü Hizmet Tutarı</p>
                  <p className="text-xl font-bold text-blue-600">{personnelStats.total_revenue_generated?.toLocaleString('tr-TR') || 0} ₺</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* KART 3: Bugünün Akışı (En Önemli Kart) */}
      <div className="px-4 py-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
          <div className="space-y-4">
            {/* Başlık */}
            <div>
              <h2 className="text-lg font-bold text-gray-900">Bugünün Randevuları</h2>
              <p className="text-sm text-gray-600 mt-1">
                {format(new Date(), "d MMMM yyyy, EEEE", { locale: tr })}
              </p>
      </div>

            {/* Timeline Görünümü */}
            <div className="space-y-3">
              {sortedTodayAppointments.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                  <p className="text-sm text-gray-500">Bugün randevu bulunmuyor</p>
                </div>
        ) : (
                sortedTodayAppointments.map((appointment, index) => (
                  <div
              key={appointment.id}
                    className={`relative flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors ${
                      appointment.status === "İptal" ? "opacity-60" : ""
                    } ${getStatusBorderColor(appointment.status)}`}
                  >
                    {/* Zaman */}
                    <div className="flex-shrink-0 w-16">
                      <p className="text-base font-semibold text-gray-900">
                        {appointment.appointment_time}
                      </p>
                      {(() => {
                        const endTime = calculateEndTime(appointment.appointment_time, appointment.service_duration);
                        if (endTime) {
                          return (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {endTime}
                            </p>
                          );
                        }
                        return null;
                      })()}
                  </div>

                    {/* İçerik */}
                    <div className="flex-1 min-w-0 pr-20">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`text-base font-semibold text-gray-900 ${
                          appointment.status === "İptal" ? "line-through" : ""
                        }`}>
                          {appointment.customer_name}
                        </h3>
                        {getStatusIcon(appointment.status)}
                    </div>
                      <p className="text-sm text-gray-600 mb-1">
                        {appointment.service_name}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => handleCall(appointment.phone)}
                          className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                      title="Ara"
                    >
                      <Phone className="w-4 h-4 text-green-600" />
                    </button>
                    <button
                      onClick={() => handleWhatsApp(appointment.phone)}
                      className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                      title="WhatsApp"
                    >
                      <MessageSquare className="w-4 h-4 text-green-600" />
                    </button>
                  </div>
                      {/* Not Bilgisi - Varsa göster */}
                      {appointment.notes && appointment.notes.trim() && (
                        <div className="flex items-start gap-1.5 text-xs text-gray-600 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-md">
                          <FileText className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                          <span className="font-medium text-amber-800">{appointment.notes}</span>
                        </div>
                      )}
                    </div>

                    {/* Sağ Üst Köşe: Üç Nokta Menüsü */}
                    <div className="absolute top-3 right-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                            title="Daha fazla"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48" style={{ zIndex: 1100 }}>
                  {appointment.status === "Bekliyor" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(appointment.id, "İptal")}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    >
                              <X className="w-4 h-4 mr-2" />
                              İptal Et
                            </DropdownMenuItem>
                  )}
                          <DropdownMenuItem
                    onClick={() => onEditAppointment(appointment)}
                  >
                            <Edit className="w-4 h-4 mr-2" />
                    Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteDialog(appointment)}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Sağ Alt Köşe: Personel Etiketi (Admin için) */}
                    {userRole === 'admin' && appointment.staff_member_id && getStaffName(appointment.staff_member_id) && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-gray-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        <User className="w-2.5 h-2.5 text-blue-600" />
                        <span className="font-medium text-blue-700">Personel: {getStaffName(appointment.staff_member_id)}</span>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* KART 4: Yaklaşan Randevular */}
      {tomorrowAppointments.length > 0 && (
        <div className="px-4 py-4">
          <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-gray-900">Yarının Özeti</h2>
              <div className="space-y-3">
                {tomorrowAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    className={`relative flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors ${
                      appointment.status === "İptal" ? "opacity-60" : ""
                    } ${getStatusBorderColor(appointment.status)}`}
                  >
                    <div className="flex-shrink-0 w-16">
                      <p className="text-sm font-semibold text-gray-900">
                        {appointment.appointment_time}
                      </p>
                      {(() => {
                        const endTime = calculateEndTime(appointment.appointment_time, appointment.service_duration);
                        if (endTime) {
                          return (
                            <p className="text-xs text-gray-500 mt-0.5">
                              {endTime}
                            </p>
                          );
                        }
                        return null;
                      })()}
                    </div>
                    <div className="flex-1 min-w-0 pr-20">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`text-sm font-semibold text-gray-900 ${
                          appointment.status === "İptal" ? "line-through" : ""
                        }`}>
                          {appointment.customer_name}
                        </h3>
                        {getStatusIcon(appointment.status)}
                      </div>
                      <p className="text-xs text-gray-600 mb-1">
                        {appointment.service_name}
                      </p>
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() => handleCall(appointment.phone)}
                          className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                          title="Ara"
                        >
                          <Phone className="w-4 h-4 text-green-600" />
                        </button>
                        <button
                          onClick={() => handleWhatsApp(appointment.phone)}
                          className="p-1.5 hover:bg-green-100 rounded-full transition-colors"
                          title="WhatsApp"
                        >
                          <MessageSquare className="w-4 h-4 text-green-600" />
                        </button>
                      </div>
                      {/* Not Bilgisi - Varsa göster */}
                      {appointment.notes && appointment.notes.trim() && (
                        <div className="flex items-start gap-1.5 text-xs text-gray-600 bg-amber-50 border border-amber-200 px-2 py-1.5 rounded-md">
                          <FileText className="w-3 h-3 text-amber-600 flex-shrink-0 mt-0.5" />
                          <span className="font-medium text-amber-800">{appointment.notes}</span>
                        </div>
                      )}
                    </div>
                    {/* Sağ Üst Köşe: Üç Nokta Menüsü */}
                    <div className="absolute top-3 right-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                            title="Daha fazla"
                          >
                            <MoreVertical className="w-4 h-4 text-gray-600" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48" style={{ zIndex: 1100 }}>
                          {appointment.status === "Bekliyor" && (
                            <DropdownMenuItem
                              onClick={() => handleStatusChange(appointment.id, "İptal")}
                              className="text-red-600 focus:text-red-600 focus:bg-red-50"
                            >
                              <X className="w-4 h-4 mr-2" />
                              İptal Et
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => onEditAppointment(appointment)}
                          >
                            <Edit className="w-4 h-4 mr-2" />
                            Düzenle
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => setDeleteDialog(appointment)}
                            className="text-red-600 focus:text-red-600 focus:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Sil
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    {/* Sağ Alt Köşe: Personel Etiketi (Admin için) */}
                    {userRole === 'admin' && appointment.staff_member_id && getStaffName(appointment.staff_member_id) && (
                      <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-gray-500 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                        <User className="w-2.5 h-2.5 text-blue-600" />
                        <span className="font-medium text-blue-700">Personel: {getStaffName(appointment.staff_member_id)}</span>
                      </div>
                    )}
                  </div>
                ))}
                </div>
              </div>
            </Card>
        </div>
        )}

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
