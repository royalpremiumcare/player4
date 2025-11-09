import { useState, useEffect } from "react";
import "@/App.css";
import api from "./api/api"; 
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useAuth } from "./context/AuthContext";

import Dashboard from "@/components/Dashboard";
import AppointmentForm from "@/components/AppointmentForm";
import ServiceManagement from "@/components/ServiceManagement";
import CashRegister from "@/components/CashRegister";
import Settings from "@/components/Settings";
import Customers from "@/components/Customers";
import ImportData from "@/components/ImportData";
import StaffManagement from "@/components/StaffManagement";
import { Menu, Calendar, Briefcase, DollarSign, SettingsIcon, Users, Upload, LogOut, Moon, Sun, RefreshCw, UserCog } from "lucide-react";
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

  useEffect(() => {
    loadServices();
    loadAppointments();
    if (userRole === 'admin') {
      loadStats();
      initializeDefaultServices();
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

  useEffect(() => {
    const refreshInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && !isRefreshing) {
        loadAppointments();
        if (userRole === 'admin') {
          loadStats();
        }
      }
    }, 3000); 
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
      clearInterval(refreshInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [isRefreshing, userRole]); 

  const initializeDefaultServices = async () => {
    try {
      const response = await api.get("/services"); 
      if (response.data.length === 0) {
        const defaultServices = [
          { name: "Tek Adet Koltuk Takımı Yıkama", price: 450 },
          { name: "Koltuk Takımı Yıkama", price: 650 },
          { name: "Minderli Koltuk Takımı Yıkama", price: 750 },
          { name: "Yastıklı Koltuk Takımı Yıkama", price: 700 },
          { name: "L Koltuk Yıkama", price: 800 },
          { name: "Chester Koltuk Takımı Yıkama", price: 900 }
        ];
        for (const service of defaultServices) {
          await api.post("/services", service); 
        }
        loadServices();
      }
    } catch (error) {
      console.error("Varsayılan hizmetler yüklenemedi:", error);
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
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center shadow-md">
                <Calendar className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-blue-900 dark:text-blue-100" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                  Royal Koltuk Yıkama
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
