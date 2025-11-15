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
  Filter
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
    loadStaffMembers();
    if (userRole === 'staff') {
      loadCurrentStaffUsername();
    }
  }, [userRole]);

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
      const staff = (response.data || []).filter(u => u.role === 'staff');
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
        startDate = format(weekStart, "yyyy-MM-dd");
        endDate = format(weekEnd, "yyyy-MM-dd");
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
    if (!staffId) return "Atanmadı";
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
      <div className="space-y-1 sm:space-y-2">
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
              <div className="w-12 sm:w-16 text-xs sm:text-sm text-gray-600 py-1 sm:py-2 px-1 sm:px-2 font-medium">
                {hour.toString().padStart(2, '0')}:00
              </div>
              <div className="flex-1 py-1 sm:py-2 px-1 sm:px-2">
                {hourAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className={`mb-1 sm:mb-2 p-2 sm:p-3 cursor-pointer hover:shadow-md transition-shadow ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
                    }`}
                    onClick={() => onEditAppointment && onEditAppointment(apt)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 sm:gap-2 mb-0.5 sm:mb-1">
                          <Clock className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                          <div>
                            <span className="text-xs sm:text-sm font-semibold text-gray-900">{apt.appointment_time || apt.time || '--:--'}</span>
                            {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                              <span className="text-xs text-gray-500 ml-1">
                                - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-gray-900 truncate">{apt.customer_name}</p>
                        <p className="text-xs text-gray-600 mt-0.5 truncate">{apt.service_name}</p>
                        {userRole === 'admin' && apt.staff_member_id && (
                          <div className="flex items-center gap-1 mt-1 sm:mt-2">
                            <User className="w-3 h-3 text-gray-500 flex-shrink-0" />
                            <span className="text-xs text-gray-600 truncate">{getStaffName(apt.staff_member_id)}</span>
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
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
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

          return (
            <div key={index} className="border border-gray-200 rounded-lg bg-white min-h-[200px] sm:min-h-[400px]">
              <div className={`p-1 sm:p-2 text-center border-b border-gray-200 ${
                isToday(day) ? 'bg-blue-50 font-semibold' : 'bg-gray-50'
              }`}>
                <div className="text-[10px] sm:text-xs text-gray-600">{format(day, "EEE", { locale: tr })}</div>
                <div className={`text-sm sm:text-lg ${isToday(day) ? 'text-blue-600' : 'text-gray-900'}`}>
                  {format(day, "d")}
                </div>
              </div>
              <div className="p-1 sm:p-2 space-y-0.5 sm:space-y-1 overflow-y-auto max-h-[160px] sm:max-h-[350px]">
                {dayAppointments.map((apt) => (
                  <Card
                    key={apt.id}
                    className={`p-1 sm:p-2 cursor-pointer hover:shadow-md transition-shadow text-[10px] sm:text-xs ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
                    }`}
                    onClick={() => onEditAppointment && onEditAppointment(apt)}
                  >
                    <div className="flex items-center gap-0.5 sm:gap-1 mb-0.5 sm:mb-1">
                      <Clock className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500 flex-shrink-0" />
                      <div>
                        <span className="font-semibold truncate">{apt.appointment_time || apt.time || '--:--'}</span>
                        {apt.service_duration && calculateEndTime(apt.appointment_time || apt.time, apt.service_duration) && (
                          <span className="text-[9px] sm:text-xs text-gray-500 ml-0.5 sm:ml-1">
                            - {calculateEndTime(apt.appointment_time || apt.time, apt.service_duration)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="font-semibold text-gray-900 truncate">{apt.customer_name}</p>
                    <p className="text-gray-600 truncate text-[9px] sm:text-xs">{apt.service_name}</p>
                    {userRole === 'admin' && apt.staff_member_id && (
                      <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                        <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-gray-500 flex-shrink-0" />
                        <span className="text-[9px] sm:text-xs truncate">{getStaffName(apt.staff_member_id)}</span>
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

  const renderMonthView = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { locale: tr });
    const calendarEnd = endOfWeek(monthEnd, { locale: tr });
    const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

    return (
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {/* Header */}
        {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map((day, index) => (
          <div key={index} className="text-center text-[10px] sm:text-sm font-semibold text-gray-600 py-1 sm:py-2">
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
              className={`min-h-[50px] sm:min-h-[80px] border border-gray-200 rounded p-0.5 sm:p-1 ${
                isCurrentMonth ? 'bg-white' : 'bg-gray-50'
              } ${isToday(day) ? 'ring-1 sm:ring-2 ring-blue-500' : ''}`}
            >
              <div className={`text-[10px] sm:text-xs mb-0.5 sm:mb-1 ${isToday(day) ? 'text-blue-600 font-semibold' : 'text-gray-600'}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayAppointments.slice(0, 2).map((apt) => (
                  <div
                    key={apt.id}
                    className={`text-[9px] sm:text-xs p-0.5 sm:p-1 rounded cursor-pointer hover:shadow-sm truncate ${
                      userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-gray-100'
                    }`}
                    onClick={() => onEditAppointment && onEditAppointment(apt)}
                    title={`${apt.appointment_time || apt.time || '--:--'} - ${apt.customer_name || 'Müşteri'}`}
                  >
                    <div className="font-semibold truncate">{apt.customer_name}</div>
                  </div>
                ))}
                {dayAppointments.length > 2 && (
                  <div className="text-[9px] sm:text-xs text-gray-500 text-center">
                    +{dayAppointments.length - 2}
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
      <div className="space-y-2 sm:space-y-3">
        {sortedAppointments.map((apt) => (
          <Card
            key={apt.id}
            className={`p-2 sm:p-4 cursor-pointer hover:shadow-md transition-shadow ${
              userRole === 'admin' ? getStaffColor(apt.staff_member_id) : 'bg-white border-gray-200'
            }`}
            onClick={() => onEditAppointment && onEditAppointment(apt)}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 mb-1 sm:mb-2">
                  <div className="text-xs sm:text-sm font-semibold text-gray-900">
                    {apt.appointment_date || apt.date ? format(parseISO(apt.appointment_date || apt.date), "d MMM yyyy", { locale: tr }) : 'Tarih yok'}
                  </div>
                  <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-600">
                    <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
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
                <p className="text-sm sm:text-base font-semibold text-gray-900 mb-0.5 sm:mb-1 truncate">{apt.customer_name}</p>
                <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2 truncate">{apt.service_name}</p>
                {userRole === 'admin' && apt.staff_member_id && (
                  <div className="flex items-center gap-1 mt-1 sm:mt-2">
                    <User className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0" />
                    <span className="text-xs sm:text-sm text-gray-600 truncate">{getStaffName(apt.staff_member_id)}</span>
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
    </div>
  );
};

export default Calendar;

