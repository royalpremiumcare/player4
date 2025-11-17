import { useState, useEffect, useCallback, useRef } from "react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addDays, subDays, addMonths, subMonths, parseISO } from "date-fns";
import { tr } from "date-fns/locale";
import { 
  Calendar as CalendarIcon, 
  Clock, 
  User, 
  ChevronLeft, 
  ChevronRight,
  Grid3x3,
  List,
  Filter,
  Trash2,
  Phone,
  Mail
} from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { io } from "socket.io-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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

const Calendar = ({ onEditAppointment, onNewAppointment }) => {
  const { userRole, token } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [staffMembers, setStaffMembers] = useState([]);
  const [selectedStaffFilter, setSelectedStaffFilter] = useState("all");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("week"); // "day", "week", "month", "list"
  const [loading, setLoading] = useState(false);
  const [currentStaffUsername, setCurrentStaffUsername] = useState(null);
  const socketRef = useRef(null);
  const weekViewScrollRef = useRef(null);
  const dayRefs = useRef({});
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [settings, setSettings] = useState(null);
  const [selectedDayAppointments, setSelectedDayAppointments] = useState([]);
  const [showDayAppointmentsDialog, setShowDayAppointmentsDialog] = useState(false);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isMobile, setIsMobile] = useState(false);

  // Mobil kontrolü
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Haftalık görünümde bugünün gününe scroll yap
  useEffect(() => {
    if (viewMode === 'week' && isMobile) {
      const today = new Date();
      const todayKey = format(today, "yyyy-MM-dd");
      
      // Render tamamlanana kadar bekle
      const timeoutId = setTimeout(() => {
        const todayElement = dayRefs.current[todayKey];
        
        if (todayElement) {
          // scrollIntoView kullan - daha güvenilir
          todayElement.scrollIntoView({ 
            behavior: 'auto',
            block: 'nearest', 
            inline: 'center' 
          });
        }
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [viewMode, currentDate, isMobile, appointments.length]);

  // Randevu bitiş saatini hesapla
  const calculateEndTime = (startTime, duration) => {
    if (!startTime || !duration) return null;
    try {
      const [hours, minutes] = startTime.split(':').map(Number);
      const totalMinutes = hours * 60 + minutes + duration;
      const endHours = Math.floor(totalMinutes / 60);
      const endMinutes = totalMinutes % 60;
      return `${String(endHours).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;
    } catch (error) {
      return null;
    }
  };

  useEffect(() => {
    loadSettings();
    if (userRole === 'staff') {
      loadCurrentStaffUsername();
    }
  }, [userRole]);

  useEffect(() => {
    if (settings !== null) {
      loadStaffMembers();
    }
  }, [settings, userRole]);

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data);
    } catch (error) {
      // Silent error
    }
  };

  const loadCurrentStaffUsername = async () => {
    try {
      if (token) {
        const tokenPayload = JSON.parse(atob(token.split('.')[1]));
        setCurrentStaffUsername(tokenPayload.sub || tokenPayload.username);
      }
    } catch (error) {
      // Silent error
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
      // Silent error
    }
  };

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    try {
      let startDate, endDate;
      
      if (viewMode === "day") {
        startDate = format(currentDate, "yyyy-MM-dd");
        endDate = format(currentDate, "yyyy-MM-dd");
      } else if (viewMode === "week") {
        const weekStart = startOfWeek(currentDate, { locale: tr });
        const weekEnd = endOfWeek(currentDate, { locale: tr });
        // Hafta sınırlarını genişlet - önceki ve sonraki haftalardan birkaç gün daha ekle
        startDate = format(subDays(weekStart, 7), "yyyy-MM-dd");
        endDate = format(addDays(weekEnd, 7), "yyyy-MM-dd");
      } else if (viewMode === "month") {
        const monthStart = startOfMonth(currentDate);
        const monthEnd = endOfMonth(currentDate);
        startDate = format(monthStart, "yyyy-MM-dd");
        endDate = format(monthEnd, "yyyy-MM-dd");
      } else {
        // List view - tüm randevular
        startDate = format(subMonths(currentDate, 3), "yyyy-MM-dd");
        endDate = format(addMonths(currentDate, 3), "yyyy-MM-dd");
      }

      const params = {
        start_date: startDate,
        end_date: endDate,
      };

      // Staff için filtreleme
      if (userRole === 'staff' && currentStaffUsername) {
        params.staff_member_id = currentStaffUsername;
      } else if (userRole === 'admin' && selectedStaffFilter !== 'all') {
        params.staff_member_id = selectedStaffFilter;
      }

      const response = await api.get("/appointments", { params });
      let filteredAppointments = (response.data || []).map(apt => ({
        ...apt,
        date: apt.appointment_date || apt.date,
        time: apt.appointment_time || apt.time,
      }));

      // Staff için ekstra filtreleme (güvenlik)
      if (userRole === 'staff' && currentStaffUsername) {
        filteredAppointments = filteredAppointments.filter(
          apt => apt.staff_member_id === currentStaffUsername
        );
      }

      setAppointments(filteredAppointments);
    } catch (error) {
      toast.error("Randevular yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, [currentDate, viewMode, userRole, currentStaffUsername, selectedStaffFilter]);

  // WebSocket için ref
  const loadAppointmentsRef = useRef(loadAppointments);
  
  useEffect(() => {
    loadAppointmentsRef.current = loadAppointments;
  }, [loadAppointments]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  // WebSocket bağlantısı - sadece bir kez oluştur
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
        reconnectionAttempts: 5,
        autoConnect: true,
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
            console.error('Token parse error:', error);
          }
        }
      });

      socket.on('appointment_created', () => {
        if (loadAppointmentsRef.current) {
          loadAppointmentsRef.current();
        }
      });

      socket.on('appointment_updated', () => {
        if (loadAppointmentsRef.current) {
          loadAppointmentsRef.current();
        }
      });

      socket.on('appointment_deleted', () => {
        if (loadAppointmentsRef.current) {
          loadAppointmentsRef.current();
        }
      });

      socket.on('joined_organization', () => {});
      socket.on('disconnect', () => {});
      socket.on('connect_error', (err) => console.error('Socket connection error:', err));
    }

    // Cleanup - sadece component unmount olduğunda
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

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

  const getStaffColor = (staffId) => {
    if (!staffId) return "bg-gray-200";
    const colors = [
      "bg-blue-100 border-blue-300 text-blue-800",
      "bg-green-100 border-green-300 text-green-800",
      "bg-purple-100 border-purple-300 text-purple-800",
      "bg-orange-100 border-orange-300 text-orange-800",
      "bg-pink-100 border-pink-300 text-pink-800",
      "bg-indigo-100 border-indigo-300 text-indigo-800",
    ];
    const index = staffMembers.findIndex(s => s.username === staffId) % colors.length;
    return colors[index] || "bg-gray-100 border-gray-300 text-gray-800";
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "Tamamlandı":
        return "text-green-600";
      case "İptal":
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  };

  const handleAppointmentClick = (apt) => {
    setSelectedAppointment(apt);
    setShowAppointmentDialog(true);
  };

  const handleDeleteAppointment = async () => {
    if (!selectedAppointment) return;
    
    setDeleting(true);
    try {
      await api.delete(`/appointments/${selectedAppointment.id}`);
      toast.success("Randevu başarıyla silindi");
      setShowDeleteDialog(false);
      setShowAppointmentDialog(false);
      setSelectedAppointment(null);
      loadAppointments();
    } catch (error) {
      console.error("Randevu silinemedi:", error);
      toast.error("Randevu silinirken hata oluştu");
    } finally {
      setDeleting(false);
    }
  };

  const canDeleteAppointment = (apt) => {
    if (userRole === 'admin') return true;
    if (userRole === 'staff' && currentStaffUsername) {
      return apt.staff_member_id === currentStaffUsername;
    }
    return false;
  };

  const handleDateChange = (direction) => {
    if (direction === "prev") {
      if (viewMode === "day") {
        setCurrentDate(subDays(currentDate, 1));
      } else if (viewMode === "week") {
        setCurrentDate(subDays(currentDate, 7));
      } else if (viewMode === "month") {
        setCurrentDate(subMonths(currentDate, 1));
      }
    } else {
      if (viewMode === "day") {
        setCurrentDate(addDays(currentDate, 1));
      } else if (viewMode === "week") {
        setCurrentDate(addDays(currentDate, 7));
      } else if (viewMode === "month") {
        setCurrentDate(addMonths(currentDate, 1));
      }
    }
  };

  const renderDayView = () => {
    const dayAppointments = appointments.filter(apt => {
      const dateStr = apt.appointment_date || apt.date;
      if (!dateStr) return false;
      try {
        const aptDate = format(parseISO(dateStr), "yyyy-MM-dd");
        const currentDateStr = format(currentDate, "yyyy-MM-dd");
        return aptDate === currentDateStr;
      } catch {
        return false;
      }
    });

    const hours = Array.from({ length: 24 }, (_, i) => i);

    return (
      <div className="space-y-2 sm:space-y-2">
        {hours.map((hour) => {
          const hourAppointments = dayAppointments.filter(apt => {
            const timeStr = apt.appointment_time || apt.time;
            if (!timeStr) return false;
            const aptHour = parseInt(timeStr.split(':')[0]);
            return !isNaN(aptHour) && aptHour === hour;
          });

          if (hourAppointments.length === 0) return null;

          return (
            <div key={hour} className="flex border-b border-gray-100">
              <div className="w-14 sm:w-16 text-sm sm:text-sm text-gray-600 py-2 sm:py-2 px-2 sm:px-2 font-medium">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 py-2 sm:py-2 px-2 sm:px-2">
                {hourAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className={`mb-2 sm:mb-2 p-3 sm:p-3 cursor-pointer hover:shadow-md transition-shadow ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
                    }`}
                    onClick={() => handleAppointmentClick(apt)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 sm:gap-2 mb-2 sm:mb-1">
                          <Clock className="w-4 h-4 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                          <div>
                            <span className="text-sm sm:text-sm font-semibold text-gray-900">{apt.appointment_time || apt.time || '--:--'}</span>
                            {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                              <span className="text-sm text-gray-500 ml-1">
                                - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-sm sm:text-sm font-semibold text-gray-900 mb-1 truncate">{apt.customer_name}</p>
                        <p className="text-sm text-gray-600 mt-0.5 truncate">{apt.service_name}</p>
                        {userRole === 'admin' && apt.staff_member_id && getStaffName(apt.staff_member_id) && (
                          <div className="flex items-center gap-1 mt-2 sm:mt-2">
                            <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <span className="text-sm text-gray-600 truncate">{getStaffName(apt.staff_member_id)}</span>
                          </div>
                        )}
                      </div>
                      <Badge className={`text-xs flex-shrink-0 ${getStatusColor(apt.status)}`}>
                        {apt.status}
                      </Badge>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderWeekView = () => {
    const weekStart = startOfWeek(currentDate, { locale: tr });
    const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate, { locale: tr }) });

    return (
      // Mobilde yatay scroll, desktop'ta grid
      <div 
        ref={weekViewScrollRef}
        className="flex sm:grid sm:grid-cols-7 gap-2 sm:gap-2 overflow-x-auto sm:overflow-x-visible pb-2 sm:pb-0 snap-x snap-mandatory sm:snap-none scrollbar-hide"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          ...(isMobile && {
            width: '100%',
            maxWidth: '100%'
          })
        }}
      >
        {weekDays.map((day, index) => {
          const dayAppointments = appointments.filter(apt => {
            const dateStr = apt.appointment_date || apt.date;
            if (!dateStr) return false;
            try {
              const aptDate = format(parseISO(dateStr), "yyyy-MM-dd");
              const dayStr = format(day, "yyyy-MM-dd");
              return aptDate === dayStr;
            } catch {
              return false;
            }
          });

          const dayKey = format(day, "yyyy-MM-dd");

          return (
            <div 
              key={index}
              ref={(el) => {
                if (el) dayRefs.current[dayKey] = el;
              }}
              className="flex-shrink-0 w-[85vw] sm:w-auto border border-gray-200 rounded-lg bg-white min-h-[300px] sm:min-h-[400px] snap-start sm:snap-none"
            >
              {/* Header - Daha büyük padding mobilde */}
              <div className={`p-3 sm:p-2 text-center border-b border-gray-200 ${
                isToday(day) ? 'bg-blue-50 font-semibold' : 'bg-gray-50'
              }`}>
                <div className="text-xs sm:text-xs text-gray-600 font-medium">{format(day, "EEE", { locale: tr })}</div>
                <div className={`text-lg sm:text-lg font-bold mt-1 ${isToday(day) ? 'text-blue-600' : 'text-gray-900'}`}>
                  {format(day, "d")}
                </div>
              </div>
              
              {/* Randevular - Daha büyük kartlar mobilde */}
              <div className="p-2 sm:p-2 space-y-2 sm:space-y-1 overflow-y-auto max-h-[250px] sm:max-h-[350px]">
                {dayAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className={`p-3 sm:p-2 cursor-pointer hover:shadow-md transition-shadow text-sm sm:text-xs ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
                    }`}
                    onClick={() => handleAppointmentClick(apt)}
                  >
                    {/* Randevu içeriği - daha büyük fontlar mobilde */}
                    <div className="flex items-center gap-2 sm:gap-1 mb-2 sm:mb-1">
                      <Clock className="w-4 h-4 sm:w-3 sm:h-3 text-gray-500 flex-shrink-0" />
                      <div>
                        <span className="font-semibold text-base sm:text-xs">{apt.appointment_time || apt.time || '--:--'}</span>
                        {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                          <span className="text-sm sm:text-xs text-gray-500 ml-1">
                            - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="font-semibold text-base sm:text-xs text-gray-900 mb-1 truncate">{apt.customer_name}</p>
                    <p className="text-sm sm:text-xs text-gray-600 truncate">{apt.service_name}</p>
                    {userRole === 'admin' && apt.staff_member_id && getStaffName(apt.staff_member_id) && (
                      <div className="flex items-center gap-1 mt-2 sm:mt-1">
                        <User className="w-4 h-4 sm:w-3 sm:h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-sm sm:text-xs truncate">{getStaffName(apt.staff_member_id)}</span>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const handleDayClick = (day, dayAppointments) => {
    if (dayAppointments.length === 0) return;
    
    // Mobilde: Tüm randevuları göster
    if (isMobile) {
      setSelectedDay(day);
      setSelectedDayAppointments(dayAppointments);
      setShowDayAppointmentsDialog(true);
    } else {
      // Desktop'ta: İlk randevuyu göster
      if (dayAppointments.length > 0) {
        handleAppointmentClick(dayAppointments[0]);
      }
    }
  };

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { locale: tr });
    const calendarEnd = endOfWeek(monthEnd, { locale: tr });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-1 sm:gap-1">
        {/* Header */}
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day, index) => (
          <div key={index} className="text-center text-xs sm:text-sm font-semibold text-gray-600 py-2 sm:py-2">
            {day}
          </div>
        ))}
        
        {/* Days */}
        {days.map((day, index) => {
          const dayAppointments = appointments.filter(apt => {
            const dateStr = apt.appointment_date || apt.date;
            if (!dateStr) return false;
            try {
              const aptDate = format(parseISO(dateStr), "yyyy-MM-dd");
              const dayStr = format(day, "yyyy-MM-dd");
              return aptDate === dayStr;
            } catch {
              return false;
            }
          });

          const isCurrentMonth = day >= monthStart && day <= monthEnd;

          return (
            <div
              key={index}
              className={`min-h-[70px] sm:min-h-[80px] border border-gray-200 rounded p-1 sm:p-1 ${
                isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${isToday(day) ? 'ring-2 sm:ring-2 ring-blue-500' : ''}`}
            >
              <div className={`text-xs sm:text-xs mb-1 sm:mb-1 font-medium ${isToday(day) ? 'text-blue-600 font-bold' : 'text-gray-600'}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {/* Mobilde: Sadece randevu sayısı göster */}
                {dayAppointments.length > 0 && (
                  <div 
                    className={`text-[10px] sm:text-xs p-1.5 sm:p-1 rounded cursor-pointer hover:shadow-sm text-center ${
                      userRole === 'admin' && dayAppointments.length > 0 
                        ? getStaffColor(dayAppointments[0].staff_member_id) 
                        : 'bg-blue-100 text-blue-700'
                    }`}
                    onClick={() => handleDayClick(day, dayAppointments)}
                  >
                    {isMobile ? (
                      // Mobilde: Sadece sayı
                      <span className="font-bold text-base">{dayAppointments.length}</span>
                    ) : (
                      // Desktop'ta: İlk randevuyu göster
                      <>
                        {dayAppointments.slice(0, 1).map((apt) => (
                          <div key={apt.id} className="font-semibold truncate" title={`${apt.appointment_time || apt.time || '--:--'} - ${apt.customer_name || 'Müşteri'}`}>
                            {apt.customer_name}
                          </div>
                        ))}
                        {dayAppointments.length > 1 && (
                          <div className="text-[9px] text-gray-500 mt-0.5">
                            +{dayAppointments.length - 1} daha
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderListView = () => {
    const sortedAppointments = [...appointments].filter(apt => {
      const dateStr = apt.appointment_date || apt.date;
      const timeStr = apt.appointment_time || apt.time;
      return dateStr && timeStr;
    }).sort((a, b) => {
      try {
        const dateA = parseISO(`${a.appointment_date || a.date}T${a.appointment_time || a.time}`);
        const dateB = parseISO(`${b.appointment_date || b.date}T${b.appointment_time || b.time}`);
        return dateA - dateB;
      } catch {
        return 0;
      }
    });

    return (
      <div className="space-y-3 sm:space-y-3">
        {sortedAppointments.map((apt) => (
          <Card
            key={apt.id}
            className={`p-4 sm:p-4 cursor-pointer hover:shadow-md transition-shadow ${
              userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
            }`}
            onClick={() => handleAppointmentClick(apt)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2 sm:mb-2">
                  <div className="text-sm sm:text-sm font-semibold text-gray-900">
                    {apt.appointment_date || apt.date ? format(parseISO(apt.appointment_date || apt.date), "d MMM yyyy", { locale: tr }) : 'Tarih yok'}
                  </div>
                  <div className="flex items-center gap-2 text-sm sm:text-sm text-gray-600">
                    <Clock className="w-4 h-4 sm:w-4 sm:h-4 flex-shrink-0" />
                    <div>
                      <span>{apt.appointment_time || apt.time || '--:--'}</span>
                      {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                        <span className="text-gray-500 ml-1">
                          - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-base sm:text-base font-semibold text-gray-900 mb-1 sm:mb-1 truncate">{apt.customer_name}</p>
                <p className="text-sm sm:text-sm text-gray-600 mb-2 sm:mb-2 truncate">{apt.service_name}</p>
                {userRole === 'admin' && apt.staff_member_id && getStaffName(apt.staff_member_id) && (
                  <div className="flex items-center gap-2 mt-2 sm:mt-2">
                    <User className="w-4 h-4 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-sm sm:text-sm text-gray-600 truncate">{getStaffName(apt.staff_member_id)}</span>
                  </div>
                )}
              </div>
              <Badge className={`text-xs flex-shrink-0 ${getStatusColor(apt.status)}`}>
                {apt.status}
              </Badge>
            </div>
          </Card>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" style={{ fontFamily: 'Inter, sans-serif' }}>
      <div className="px-2 sm:px-4 pt-3 sm:pt-6 pb-2 sm:pb-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-3 sm:p-6">
          {/* Header Controls */}
          <div className="flex flex-col gap-3 mb-4 sm:mb-6">
            {/* Date Navigation */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange("prev")}
                className="p-1.5 sm:p-2"
              >
                <ChevronLeft className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
              <div className="text-sm sm:text-lg font-semibold text-gray-900 flex-1 text-center px-1">
                {viewMode === "day" && format(currentDate, "d MMM yyyy", { locale: tr })}
                {viewMode === "week" && `${format(startOfWeek(currentDate, { locale: tr }), "d MMM", { locale: tr })} - ${format(endOfWeek(currentDate, { locale: tr }), "d MMM", { locale: tr })}`}
                {viewMode === "month" && format(currentDate, "MMM yyyy", { locale: tr })}
                {viewMode === "list" && "Randevular"}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleDateChange("next")}
                className="p-1.5 sm:p-2"
              >
                <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentDate(new Date())}
                className="px-2 sm:px-3 text-xs sm:text-sm"
              >
                Bugün
              </Button>
            </div>

            {/* View Mode & Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
              {/* Staff Filter (Admin only) */}
              {userRole === 'admin' && (
                <Select value={selectedStaffFilter} onValueChange={setSelectedStaffFilter}>
                  <SelectTrigger className="w-full sm:w-[160px] text-xs sm:text-sm">
                    <Filter className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                    <SelectValue placeholder="Tüm Personeller" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tüm Personeller</SelectItem>
                    <SelectItem value="unassigned">Atanmamış</SelectItem>
                    {staffMembers.map((staff) => (
                      <SelectItem key={staff.username} value={staff.username}>
                        {staff.full_name || staff.username}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center gap-0.5 sm:gap-1 bg-gray-100 rounded-lg p-0.5 sm:p-1">
                <Button
                  variant={viewMode === "day" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("day")}
                  className="px-2 sm:px-3 text-xs sm:text-sm h-7 sm:h-9"
                >
                  Gün
                </Button>
                <Button
                  variant={viewMode === "week" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("week")}
                  className="px-2 sm:px-3 text-xs sm:text-sm h-7 sm:h-9"
                >
                  Hafta
                </Button>
                <Button
                  variant={viewMode === "month" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("month")}
                  className="px-2 sm:px-3 text-xs sm:text-sm h-7 sm:h-9"
                >
                  Ay
                </Button>
                <Button
                  variant={viewMode === "list" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("list")}
                  className="px-2 sm:px-3 h-7 sm:h-9"
                >
                  <List className="w-3 h-3 sm:w-4 sm:h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="text-center py-12">
              <p className="text-gray-600">Yükleniyor...</p>
            </div>
          ) : (
            <>
              {viewMode === "day" && renderDayView()}
              {viewMode === "week" && renderWeekView()}
              {viewMode === "month" && renderMonthView()}
              {viewMode === "list" && renderListView()}
            </>
          )}

          {appointments.length === 0 && !loading && (
            <div className="text-center py-12">
              <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Bu dönemde randevu bulunmuyor</p>
            </div>
          )}
        </Card>
      </div>

      {/* Randevu Bilgileri Dialog */}
      <Dialog open={showAppointmentDialog} onOpenChange={setShowAppointmentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Randevu Bilgileri</DialogTitle>
            <DialogDescription>
              Randevu detaylarını görüntüleyebilir ve silebilirsiniz
            </DialogDescription>
          </DialogHeader>
          
          {selectedAppointment && (
            <div className="space-y-4 mt-4">
              {/* Müşteri Bilgileri */}
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-gray-900">{selectedAppointment.customer_name}</h3>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  {selectedAppointment.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="w-4 h-4" />
                      <span>{selectedAppointment.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Randevu Detayları */}
              <div className="space-y-3 pt-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Hizmet</span>
                  <span className="text-sm font-semibold text-gray-900">{selectedAppointment.service_name}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Tarih</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {selectedAppointment.appointment_date || selectedAppointment.date 
                      ? format(parseISO(selectedAppointment.appointment_date || selectedAppointment.date), "d MMMM yyyy", { locale: tr })
                      : 'Tarih yok'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Saat</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {selectedAppointment.appointment_time || selectedAppointment.time || '--:--'}
                    </span>
                    {selectedAppointment.service_duration && calculateEndTime(selectedAppointment.appointment_time || selectedAppointment.time, selectedAppointment.service_duration) && (
                      <span className="text-sm text-gray-500">
                        - {calculateEndTime(selectedAppointment.appointment_time || selectedAppointment.time, selectedAppointment.service_duration)}
                      </span>
                    )}
                  </div>
                </div>

                {selectedAppointment.service_price && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Fiyat</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {selectedAppointment.service_price.toLocaleString('tr-TR')} ₺
                    </span>
                  </div>
                )}

                {userRole === 'admin' && selectedAppointment.staff_member_id && getStaffName(selectedAppointment.staff_member_id) && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Personel</span>
                    <span className="text-sm font-semibold text-gray-900">
                      {getStaffName(selectedAppointment.staff_member_id)}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Durum</span>
                  <Badge className={getStatusColor(selectedAppointment.status)}>
                    {selectedAppointment.status}
                  </Badge>
                </div>

                {selectedAppointment.notes && (
                  <div className="pt-2 border-t border-gray-200">
                    <span className="text-sm text-gray-600">Notlar</span>
                    <p className="text-sm text-gray-900 mt-1">{selectedAppointment.notes}</p>
                  </div>
                )}
              </div>

              {/* Silme Butonu */}
              {canDeleteAppointment(selectedAppointment) && (
                <div className="pt-4 border-t border-gray-200">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      setShowAppointmentDialog(false);
                      setShowDeleteDialog(true);
                    }}
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Randevuyu Sil
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Silme Onay Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Randevuyu Sil</AlertDialogTitle>
            <AlertDialogDescription>
              Bu randevuyu silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAppointment}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Günlük Randevular Dialog (Mobil için) */}
      <Dialog open={showDayAppointmentsDialog} onOpenChange={setShowDayAppointmentsDialog}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedDay ? format(selectedDay, "d MMMM yyyy", { locale: tr }) : "Randevular"}
            </DialogTitle>
            <DialogDescription>
              Bu günkü tüm randevular
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 mt-4">
            {selectedDayAppointments.length === 0 ? (
              <p className="text-center text-gray-500 py-4">Bu gün randevu bulunmuyor</p>
            ) : (
              selectedDayAppointments
                .sort((a, b) => {
                  const timeA = a.appointment_time || a.time || '00:00';
                  const timeB = b.appointment_time || b.time || '00:00';
                  return timeA.localeCompare(timeB);
                })
                .map((apt) => (
                  <Card
                    key={apt.id}
                    className={`p-4 cursor-pointer hover:shadow-md transition-shadow ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
                    }`}
                    onClick={() => {
                      setShowDayAppointmentsDialog(false);
                      handleAppointmentClick(apt);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Clock className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          <div>
                            <span className="text-sm font-semibold text-gray-900">
                              {apt.appointment_time || apt.time || '--:--'}
                            </span>
                            {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                              <span className="text-sm text-gray-500 ml-1">
                                - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-base font-semibold text-gray-900 mb-1">{apt.customer_name}</p>
                        <p className="text-sm text-gray-600 mb-2">{apt.service_name}</p>
                        {userRole === 'admin' && apt.staff_member_id && getStaffName(apt.staff_member_id) && (
                          <div className="flex items-center gap-1 mt-2">
                            <User className="w-4 h-4 text-gray-500 flex-shrink-0" />
                            <span className="text-sm text-gray-600">{getStaffName(apt.staff_member_id)}</span>
                          </div>
                        )}
                      </div>
                      <Badge className={`text-xs flex-shrink-0 ${getStatusColor(apt.status)}`}>
                        {apt.status}
                      </Badge>
                    </div>
                  </Card>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Calendar;

