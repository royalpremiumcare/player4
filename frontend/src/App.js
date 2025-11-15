import { useState, useEffect, useCallback, useRef } from "react";
import "@/App.css";
import api from "./api/api"; 
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useAuth } from "./context/AuthContext";
import { io } from "socket.io-client";

import Dashboard from "@/components/Dashboard";
import CalendarView from "@/components/Calendar";
import AppointmentForm from "@/components/AppointmentForm";
import AppointmentFormWizard from "@/components/AppointmentFormWizard";
import ServiceManagement from "@/components/ServiceManagement";
import CashRegister from "@/components/CashRegister";
import Settings from "@/components/Settings";
import SettingsSubscription from "@/components/SettingsSubscription";
import SettingsProfile from "@/components/SettingsProfile";
import Finance from "@/components/Finance";
import Customers from "@/components/Customers";
import ImportData from "@/components/ImportData";
import StaffManagement from "@/components/StaffManagement";
import AuditLogs from "@/components/AuditLogs";
import HelpCenter from "@/components/HelpCenter";
import { Calendar, Briefcase, DollarSign, SettingsIcon, Users, Upload, LogOut, Moon, Sun, RefreshCw, UserCog, FileText, Home, Plus, CreditCard, User, HelpCircle, Package, Bell } from "lucide-react";
import { useTheme } from "./context/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";


function App() {
  const { logout, userRole, token } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const bottomNavRef = useRef(null);
  
  const [currentView, setCurrentView] = useState("dashboard");
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [settings, setSettings] = useState(null);

  // Logo URL helper - logo_url zaten /api/static/... formatında
  const getLogoUrl = (logoUrl) => {
    if (!logoUrl) return null;
    // Logo URL zaten /api/static/... formatında, direkt kullanabiliriz
    return logoUrl;
  };

  // Define load functions before useEffect hooks
  const loadSettings = useCallback(async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data);
    } catch (error) {
      console.error("Settings yüklenemedi:", error);
    }
  }, []);

  const loadServices = useCallback(async () => {
    try {
      const response = await api.get("/services"); 
      setServices(response.data);
    } catch (error) {
      toast.error("Hizmetler yüklenemedi");
    }
  }, []);

  const loadAppointments = useCallback(async () => {
    try {
      const response = await api.get("/appointments"); 
      setAppointments(response.data || []);
      console.log("✅ Randevular yüklendi:", response.data?.length || 0, "randevu");
    } catch (error) {
      console.error("❌ Randevular yüklenemedi:", error);
      toast.error("Randevular yüklenemedi");
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const response = await api.get("/stats/dashboard"); 
      setStats(response.data);
    } catch (error) {
      console.error("İstatistikler yüklenemedi:", error);
    }
  }, []);

  useEffect(() => {
    loadServices();
    loadAppointments();
    loadSettings();
    if (userRole === 'admin') {
      loadStats();
    }
  }, [userRole, loadServices, loadAppointments, loadSettings, loadStats]); 

  useEffect(() => {
    let touchStartY = 0;
    let touchCurrentY = 0;
    let isPulling = false;
    let currentPullDistance = 0;
    const PULL_THRESHOLD = 80;

    const handleTouchStart = (e) => {
        if (window.scrollY === 0) {
            touchStartY = e.touches[0].clientY;
            isPulling = true;
        }
    };

    const handleTouchMove = (e) => {
        if (!isPulling || window.scrollY > 0) {
            isPulling = false;
            return;
        }
        touchCurrentY = e.touches[0].clientY;
        const pullDistance = touchCurrentY - touchStartY;
        currentPullDistance = pullDistance;
        if (pullDistance > 0) {
            setPullDistance(Math.min(pullDistance, PULL_THRESHOLD + 20));
            if (pullDistance > 10) {
                e.preventDefault();
            }
        } else {
            setPullDistance(0);
        }
    };

    const handleTouchEnd = () => {
        if (currentPullDistance >= PULL_THRESHOLD && isPulling) {
            setIsRefreshing(true);
            Promise.all([
                loadAppointments(),
                userRole === 'admin' ? loadStats() : Promise.resolve(),
                loadServices()
            ]).finally(() => {
                setIsRefreshing(false);
                setPullDistance(0);
            });
        } else {
            setPullDistance(0);
        }
        isPulling = false;
        currentPullDistance = 0;
    };
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    return () => {
        document.removeEventListener('touchstart', handleTouchStart);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [userRole, loadAppointments, loadStats, loadServices]); 

  // WebSocket setup for real-time updates
  const socketRef = useRef(null);
  const listenersInitializedRef = useRef(false);
  const userRoleRef = useRef(userRole);
  const loadAppointmentsRef = useRef(loadAppointments);
  const loadStatsRef = useRef(loadStats);
  
  // Keep refs in sync with current functions
  useEffect(() => {
    userRoleRef.current = userRole;
    loadAppointmentsRef.current = loadAppointments;
    loadStatsRef.current = loadStats;
  }, [userRole, loadAppointments, loadStats]);
  
  // Initialize socket only once on mount
  useEffect(() => {
    if (!socketRef.current) {
      const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
      const socketUrl = BACKEND_URL || window.location.origin;
      
      // Initialize Socket.IO connection
      const socket = io(socketUrl, {
        path: '/api/socket.io',
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5,
        autoConnect: true
      });
      
      socketRef.current = socket;
      
      const handleConnect = () => {
        // Get organization_id from token
        const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        if (authToken) {
          try {
            const payload = JSON.parse(atob(authToken.split('.')[1]));
            const organizationId = payload.org_id;
            if (organizationId) {
              socket.emit('join_organization', { organization_id: organizationId });
            }
          } catch (error) {
            // Token parse error - silent
          }
        }
      };
      
      // Set up event listeners immediately
      socket.on('connect', handleConnect);
      
      // If socket is already connected, join immediately
      if (socket.connected) {
        handleConnect();
      }
      
      socket.on('disconnect', () => {});
      socket.on('connect_error', () => {});
      socket.on('connection_established', () => {});
      socket.on('joined_organization', () => {});
      
      // Real-time appointment events - use refs to get current function values
      socket.on('appointment_created', (data) => {
        console.log("🔔 WebSocket: appointment_created event received", data);
        if (loadAppointmentsRef.current) {
          console.log("🔄 Loading appointments...");
          loadAppointmentsRef.current();
        }
        if (userRoleRef.current === 'admin' && loadStatsRef.current) {
          loadStatsRef.current();
        }
      });
      
      socket.on('appointment_updated', () => {
        if (loadAppointmentsRef.current) {
          loadAppointmentsRef.current();
        }
        if (userRoleRef.current === 'admin' && loadStatsRef.current) {
          loadStatsRef.current();
        }
      });
      
      socket.on('appointment_deleted', () => {
        if (loadAppointmentsRef.current) {
          loadAppointmentsRef.current();
        }
        if (userRoleRef.current === 'admin' && loadStatsRef.current) {
          loadStatsRef.current();
        }
      });
      
      listenersInitializedRef.current = true;
    }
    
    // No cleanup - socket persists for component lifetime
  }, []); // Empty dependency array - only run once on mount
  
  // Re-join organization when token changes
  useEffect(() => {
    if (socketRef.current && socketRef.current.connected && token) {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const organizationId = payload.org_id;
          if (organizationId) {
            socketRef.current.emit('join_organization', { organization_id: organizationId });
          }
        } catch (error) {
        // Token parse error - silent
      }
    }
  }, [token]);
  
  // Fallback: visibility and focus events for when user returns to tab
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isRefreshing) {
        loadAppointments();
        if (userRoleRef.current === 'admin') {
          loadStats();
        }
      }
    };
    
    const handleFocus = () => {
      if (!isRefreshing) {
        loadAppointments();
        if (userRoleRef.current === 'admin') {
          loadStats();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadAppointments, loadStats, isRefreshing]);
  
  // DON'T cleanup socket - let it persist for the entire app lifetime
  // Socket will automatically cleanup when browser tab closes
  // Cleanup was causing socket to disconnect unnecessarily

  // iOS Chrome için alt navigasyon barı sabitleme
  useEffect(() => {
    const isIOSChrome = /CriOS/i.test(navigator.userAgent);
    if (!isIOSChrome || !bottomNavRef.current) return;

    const bottomNav = bottomNavRef.current;
    
    const handleScroll = () => {
      // Alt navigasyon barını her zaman en altta tut
      if (bottomNav) {
        bottomNav.style.position = 'fixed';
        bottomNav.style.bottom = '0';
        bottomNav.style.left = '0';
        bottomNav.style.right = '0';
        bottomNav.style.transform = 'translateZ(0)';
        bottomNav.style.webkitTransform = 'translateZ(0)';
      }
    };

    const handleResize = () => {
      handleScroll();
    };

    // İlk yüklemede ve scroll/resize event'lerinde çalıştır
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, [currentView, showForm]);

  const handleAppointmentSaved = async () => {
    console.log("🔄 handleAppointmentSaved called - refreshing appointments...");
    await loadAppointments();
    if (userRole === 'admin') {
      await loadStats();
    }
    setShowForm(false);
    setSelectedAppointment(null);
    console.log("✅ Appointments refreshed, form closed");
  };
  const handleEditAppointment = (appointment) => {
    setSelectedAppointment(appointment);
    setShowForm(true);
  };
  const handleNewAppointment = () => {
    setSelectedAppointment(null);
    setShowForm(true);
  };


  return (
    <div className="App min-h-screen bg-white dark:bg-gray-900 transition-colors">
      <Toaster position="top-center" richColors />

      {(pullDistance > 0 || isRefreshing) && (
        <div
          className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center bg-blue-500 text-white py-2 transition-all duration-300"
          style={{
            transform: pullDistance > 0 ? `translateY(${Math.min(pullDistance, 80)}px)` : 'translateY(0)',
            opacity: pullDistance > 0 ? Math.min(pullDistance / 80, 1) : (isRefreshing ? 1 : 0)
          }}
        >
          <RefreshCw className={`w-5 h-5 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          <span className="text-sm font-medium">
            {isRefreshing ? 'Yenileniyor...' : pullDistance >= 80 ? 'Bırakın...' : 'Yenilemek için çekin'}
          </span>
        </div>
      )}

      {/* TopBar - Üst Navigasyon Barı */}
      {!showForm && (
        <header className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              {/* Sol Bölüm: PLANN Logosu */}
              <div className="flex-shrink-0">
                <h1 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Inter, sans-serif' }}>
                  PLANN
                </h1>
              </div>

              {/* Orta Bölüm: İşletme Adı */}
              <div className="flex-1 flex justify-center px-4 min-w-0">
                <h2 className="text-lg font-semibold text-gray-800 truncate max-w-full text-center">
                  {settings?.company_name || "İşletme Adı"}
                </h2>
              </div>

              {/* Sağ Bölüm: Bildirim Zili */}
              <div className="flex-shrink-0">
                <button
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors relative"
                >
                  <Bell className="w-6 h-6 text-gray-700" />
                  {/* Bildirim badge'i varsa */}
                  {/* <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span> */}
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className={(currentView === "dashboard" || currentView === "settings" || currentView === "settings-subscription" || currentView === "settings-profile" || currentView === "staff" || currentView === "services" || currentView === "help-center") && !showForm ? "" : "container mx-auto px-4 py-6"}>
        {currentView === "dashboard" && !showForm && (
          <Dashboard
            appointments={appointments}
            stats={stats}
            userRole={userRole}
            onEditAppointment={handleEditAppointment}
            onNewAppointment={handleNewAppointment}
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
            onRefresh={async () => {
              await loadAppointments();
              if (userRole === 'admin') {
                await loadStats();
              }
            }}
          />
        )}

        {showForm && (
          <AppointmentFormWizard
            services={services}
            appointment={selectedAppointment}
            onSave={handleAppointmentSaved}
            onCancel={() => {
              setShowForm(false);
              setSelectedAppointment(null);
            }}
          />
        )}

        {currentView === "calendar" && (
          <CalendarView
            onEditAppointment={(apt) => {
              setSelectedAppointment(apt);
              setShowForm(true);
              setCurrentView("dashboard");
            }}
            onNewAppointment={handleNewAppointment}
          />
        )}
        {currentView === "customers" && (
          <Customers 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
            onNewAppointment={() => {
              setCurrentView("dashboard");
              setShowForm(true);
              setSelectedAppointment(null);
            }}
          />
        )}
        {currentView === "services" && userRole === 'admin' && (
          <ServiceManagement 
            services={services} 
            onRefresh={loadServices}
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
        {currentView === "staff" && userRole === 'admin' && (
          <StaffManagement 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
        {currentView === "cash" && userRole === 'admin' && ( <CashRegister /> )}
        {currentView === "audit" && userRole === 'admin' && ( <AuditLogs /> )}
        {currentView === "import" && userRole === 'admin' && (
          <ImportData
            onImportComplete={() => {
              loadAppointments();
              loadStats();
              toast.success("Veriler yüklendi! Randevular sayfasını kontrol edin.");
            }}
          />
        )}
        {currentView === "settings" && (
          <Settings 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
            userRole={userRole}
            onLogout={logout}
          />
        )}
        {currentView === "settings-subscription" && userRole === 'admin' && (
          <SettingsSubscription 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
        {currentView === "settings-profile" && (
          <SettingsProfile 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
        {currentView === "settings-finance" && userRole === 'admin' && (
          <Finance 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
        {currentView === "help-center" && (
          <HelpCenter 
            onNavigate={(view) => {
              setCurrentView(view);
              setShowForm(false);
            }}
          />
        )}
      </main>

      {/* Alt Navigasyon Barı (Dashboard ve Calendar görünümlerinde) */}
      {(currentView === "dashboard" || currentView === "calendar") && !showForm && (
        <div 
          ref={bottomNavRef}
          className="bg-white border-t border-gray-200 shadow-lg bottom-nav-fixed" 
          style={{ 
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            width: '100%',
            maxWidth: '100vw',
            WebkitTransform: 'translateZ(0)',
            transform: 'translateZ(0)',
            WebkitBackfaceVisibility: 'hidden',
            backfaceVisibility: 'hidden',
            WebkitTransition: 'none',
            transition: 'none'
          }}
        >
          <div className="flex items-center justify-around px-2 py-2">
            {/* Anasayfa */}
            <button
              onClick={() => {
                setCurrentView("dashboard");
                setShowForm(false);
              }}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors text-blue-600"
            >
              <Home className="w-5 h-5" />
              <span className="text-xs font-medium">Anasayfa</span>
            </button>

            {/* Takvim */}
            <button
              onClick={() => {
                setCurrentView("calendar");
                setShowForm(false);
              }}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors ${
                currentView === "calendar" ? "text-blue-600" : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <Calendar className="w-5 h-5" />
              <span className="text-xs font-medium">Takvim</span>
            </button>

            {/* Yeni Randevu Ekle (Ana Renk - Mavi) */}
            <button
              onClick={handleNewAppointment}
              className="flex items-center justify-center w-14 h-14 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors -mt-4"
            >
              <Plus className="w-6 h-6" />
            </button>

            {/* Müşteriler */}
            <button
              onClick={() => {
                setCurrentView("customers");
                setShowForm(false);
              }}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
            >
              <Users className="w-5 h-5" />
              <span className="text-xs font-medium">Müşteriler</span>
            </button>

            {/* Ayarlar */}
            <button
              onClick={() => {
                setCurrentView("settings");
                setShowForm(false);
              }}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors text-gray-600 hover:text-gray-900"
            >
              <SettingsIcon className="w-5 h-5" />
              <span className="text-xs font-medium">Ayarlar</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
