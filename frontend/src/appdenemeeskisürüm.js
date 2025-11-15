import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import api from "./api/api"; 
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useAuth } from "./context/AuthContext";
import { io } from "socket.io-client";

import Dashboard from "@/components/Dashboard";
import AppointmentForm from "@/components/AppointmentForm";
import ServiceManagement from "@/components/ServiceManagement";
import CashRegister from "@/components/CashRegister";
import Settings from "@/components/Settings";
import Customers from "@/components/Customers";
import ImportData from "@/components/ImportData";
import StaffManagement from "@/components/StaffManagement";
import AuditLogs from "@/components/AuditLogs";
import { Menu, Calendar, Briefcase, DollarSign, SettingsIcon, Users, Upload, LogOut, Moon, Sun, RefreshCw, UserCog, FileText } from "lucide-react";
import { useTheme } from "./context/ThemeContext";


function App() {
  const { logout, userRole } = useAuth();
  const { theme, toggleTheme } = useTheme();
  
  const [currentView, setCurrentView] = useState("dashboard");
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [stats, setStats] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [settings, setSettings] = useState(null);

  // Logo URL helper - logo_url zaten /api/static/... formatında
  const getLogoUrl = (logoUrl) => {
    if (!logoUrl) return null;
    // Logo URL zaten /api/static/... formatında, direkt kullanabiliriz
    return logoUrl;
  };

  useEffect(() => {
    loadServices();
    loadAppointments();
    loadSettings();
    if (userRole === 'admin') {
      loadStats();
    }
  }, [userRole]); 

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
  }, [userRole]); 

  // WebSocket setup for real-time updates
  useEffect(() => {
    const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || '';
    const socketUrl = BACKEND_URL || window.location.origin;
    
    // Initialize Socket.IO connection
    const socket = io(socketUrl, {
      path: '/api/socket.io/',
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
      console.log('WebSocket connected:', socket.id);
      
      // Get organization_id from token
      const token = localStorage.getItem('authToken');
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
    
    socket.on('disconnect', () => {
      console.log('WebSocket disconnected');
    });
    
    socket.on('connection_established', (data) => {
      console.log('Connection established:', data);
    });
    
    socket.on('joined_organization', (data) => {
      console.log('Joined organization:', data);
    });
    
    // Real-time appointment events
    socket.on('appointment_created', () => {
      console.log('Appointment created - reloading data');
      loadAppointments();
      if (userRole === 'admin') {
        loadStats();
      }
    });
    
    socket.on('appointment_updated', () => {
      console.log('Appointment updated - reloading data');
      loadAppointments();
      if (userRole === 'admin') {
        loadStats();
      }
    });
    
    socket.on('appointment_deleted', () => {
      console.log('Appointment deleted - reloading data');
      loadAppointments();
      if (userRole === 'admin') {
        loadStats();
      }
    });
    
    // Fallback: visibility and focus events for when user returns to tab
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isRefreshing) {
        loadAppointments();
        if (userRole === 'admin') {
          loadStats();
        }
      }
    };
    
    const handleFocus = () => {
      if (!isRefreshing) {
        loadAppointments();
        if (userRole === 'admin') {
          loadStats();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    
    return () => {
      socket.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isRefreshing, userRole]); 

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data);
    } catch (error) {
      console.error("Settings yüklenemedi:", error);
    }
  };

  const loadServices = async () => {
    try {
      const response = await api.get("/services"); 
      setServices(response.data);
    } catch (error) {
      toast.error("Hizmetler yüklenemedi");
    }
  };

  const loadAppointments = async () => {
    try {
      const response = await api.get("/appointments"); 
      setAppointments(response.data);
    } catch (error) {
      toast.error("Randevular yüklenemedi");
    }
  };

  const loadStats = async () => {
    try {
      const response = await api.get("/stats/dashboard"); 
      setStats(response.data);
    } catch (error) {
      console.error("İstatistikler yüklenemedi:", error);
    }
  };

  const handleAppointmentSaved = async () => {
    await loadAppointments();
    if (userRole === 'admin') {
      await loadStats();
    }
    setShowForm(false);
    setSelectedAppointment(null);
  };
  const handleEditAppointment = (appointment) => {
    setSelectedAppointment(appointment);
    setShowForm(true);
  };
  const handleNewAppointment = () => {
    setSelectedAppointment(null);
    setShowForm(true);
  };

  // Personel için sadece dashboard ve logout
  const menuItems = userRole === 'staff' ? [
    { id: "dashboard", icon: Calendar, label: "Randevular" }
  ] : [
    { id: "dashboard", icon: Calendar, label: "Randevular" },
    { id: "customers", icon: Users, label: "Müşteriler" },
    { id: "services", icon: Briefcase, label: "Hizmetler" },
    { id: "staff", icon: UserCog, label: "Personel Yönetimi" },
    { id: "cash", icon: DollarSign, label: "Kasa" },
    { id: "audit", icon: FileText, label: "Denetim Günlükleri" },
    { id: "import", icon: Upload, label: "İçe Aktar" },
    { id: "settings", icon: SettingsIcon, label: "Ayarlar" }
  ];

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

      <header className="bg-gradient-to-r from-sky-50 to-blue-50 border-b border-blue-100 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700 sticky top-0 z-40 shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Logo - Yüklenmişse göster, yoksa default icon */}
              {settings?.logo_url ? (
                <div className="w-12 h-12 md:w-14 md:h-14 flex-shrink-0 bg-white rounded-lg border-2 border-blue-200 p-1">
                  <img 
                    src={getLogoUrl(settings.logo_url)}
                    alt={settings.company_name || 'Logo'}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      console.error('Logo yüklenemedi:', settings.logo_url);
                      e.target.style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Calendar className="w-6 h-6 md:w-7 md:h-7 text-white" />
                </div>
              )}
              
              <div>
                <h1 className="text-xl font-bold text-blue-900 dark:text-blue-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  {settings?.company_name || 'Royal Koltuk Yıkama'}
                </h1>
                <p className="text-xs text-blue-600 dark:text-blue-300">Randevu Yönetim Sistemi</p>
              </div>
            </div>

            <button
              data-testid="mobile-menu-button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 hover:bg-blue-100 rounded-lg transition-colors"
            >
              <Menu className="w-6 h-6 text-blue-900" />
            </button>

            <nav className="hidden md:flex gap-2 items-center">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    data-testid={`nav-${item.id}`}
                    onClick={() => {
                      setCurrentView(item.id);
                      setShowForm(false);
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                      currentView === item.id
                        ? "bg-blue-500 text-white shadow-md"
                        : "text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
              <button
                onClick={logout}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">Çıkış Yap</span>
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-gray-700"
                  title={theme === 'dark' ? 'Açık moda geç' : 'Koyu moda geç'}
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
              )}
            </nav>
          </div>

          {mobileMenuOpen && (
            <nav className="md:hidden mt-4 flex flex-col gap-2 pb-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    data-testid={`mobile-nav-${item.id}`}
                    onClick={() => {
                      setCurrentView(item.id);
                      setShowForm(false);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                      currentView === item.id
                        ? "bg-blue-500 text-white shadow-md"
                        : "text-blue-700 hover:bg-blue-100"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => {
                  logout();
                  setMobileMenuOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-red-600 hover:bg-red-100 dark:hover:bg-red-900"
              >
                <LogOut className="w-5 h-5" />
                <span className="text-sm font-medium">Çıkış Yap</span>
              </button>
              {userRole === 'admin' && (
                <button
                  onClick={() => {
                    toggleTheme();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-gray-700"
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                  <span className="text-sm font-medium">{theme === 'dark' ? 'Açık Mod' : 'Koyu Mod'}</span>
                </button>
              )}
            </nav>
          )}
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {currentView === "dashboard" && !showForm && (
          <Dashboard
            appointments={appointments}
            stats={stats}
            userRole={userRole}
            onEditAppointment={handleEditAppointment}
            onNewAppointment={handleNewAppointment}
            onRefresh={async () => {
              await loadAppointments();
              if (userRole === 'admin') {
                await loadStats();
              }
            }}
          />
        )}

        {currentView === "dashboard" && showForm && (
          <AppointmentForm
            services={services}
            appointment={selectedAppointment}
            onSave={handleAppointmentSaved}
            onCancel={() => {
              setShowForm(false);
              setSelectedAppointment(null);
            }}
          />
        )}

        {currentView === "customers" && userRole === 'admin' && ( <Customers /> )}
        {currentView === "services" && userRole === 'admin' && ( <ServiceManagement services={services} onRefresh={loadServices} /> )}
        {currentView === "staff" && userRole === 'admin' && ( <StaffManagement /> )}
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
        {currentView === "settings" && userRole === 'admin' && ( <Settings /> )}
      </main>
    </div>
  );
}

export default App;
