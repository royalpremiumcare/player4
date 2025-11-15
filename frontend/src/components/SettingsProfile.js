import { useState, useEffect } from "react";
import { User, ArrowLeft, Save, Phone, MessageSquare, Upload, Image, Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";

const SettingsProfile = ({ onNavigate }) => {
  const { userRole, token } = useAuth();
  const [settings, setSettings] = useState({
    company_name: "",
    support_phone: "",
    logo_url: "",
    slug: "",
    sms_reminder_hours: 1.0,
    business_hours: {
      monday: { is_open: true, open_time: "09:00", close_time: "18:00" },
      tuesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
      wednesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
      thursday: { is_open: true, open_time: "09:00", close_time: "18:00" },
      friday: { is_open: true, open_time: "09:00", close_time: "18:00" },
      saturday: { is_open: false, open_time: "09:00", close_time: "18:00" },
      sunday: { is_open: false, open_time: "09:00", close_time: "18:00" }
    }
  });
  
  // Personel için kullanıcı bilgileri
  const [userInfo, setUserInfo] = useState({
    full_name: "",
    username: "",
  });
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(null);

  useEffect(() => {
    // Token'ı localStorage'dan al (eğer context'ten gelmiyorsa)
    const authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    const storedRole = userRole || localStorage.getItem('userRole') || sessionStorage.getItem('userRole');
    
    if (storedRole === 'admin') {
      loadSettings();
    } else {
      // Staff veya belirsiz durumda kullanıcı bilgilerini yükle
      if (authToken) {
        loadUserInfo();
      }
    }
  }, []);

  const loadUserInfo = async () => {
    try {
      // Token'ı localStorage'dan al (eğer context'ten gelmiyorsa)
      let authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      
      if (!authToken) {
        toast.error("Oturum bilgisi bulunamadı. Lütfen tekrar giriş yapın.");
        return;
      }
      
      const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));
      const username = tokenPayload.sub || tokenPayload.username;
      
      if (!username) {
        toast.error("Kullanıcı bilgisi alınamadı.");
        setUserInfo({
          full_name: tokenPayload.full_name || "",
          username: "Bilinmiyor",
        });
        return;
      }
      
      // Kullanıcı listesinden kendi bilgilerini bul
      const response = await api.get("/users");
      const users = response.data || [];
      const currentUser = users.find(u => u.username === username);
      
      if (currentUser) {
        setUserInfo({
          full_name: currentUser.full_name || "",
          username: currentUser.username || "",
        });
      } else {
        // Fallback: Token'dan gelen bilgileri kullan
        setUserInfo({
          full_name: tokenPayload.full_name || "",
          username: username,
        });
      }
    } catch (error) {
      if (error.response && error.response.status !== 401) {
        toast.error("Kullanıcı bilgileri yüklenemedi: " + (error.message || "Bilinmeyen hata"));
      }
      // Hata durumunda da token'dan bilgileri yükle
      let authToken = token || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      if (authToken) {
        try {
          const tokenPayload = JSON.parse(atob(authToken.split('.')[1]));
          setUserInfo({
            full_name: tokenPayload.full_name || "",
            username: tokenPayload.sub || tokenPayload.username || "",
          });
        } catch (e) {
          // Token parse hatası - sessizce geç
        }
      }
    }
  };

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      const data = response.data;
      // business_hours yoksa varsayılan değerleri kullan
      if (!data.business_hours) {
        data.business_hours = {
          monday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          tuesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          wednesday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          thursday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          friday: { is_open: true, open_time: "09:00", close_time: "18:00" },
          saturday: { is_open: false, open_time: "09:00", close_time: "18:00" },
          sunday: { is_open: false, open_time: "09:00", close_time: "18:00" }
        };
      }
      setSettings(data); 
    } catch (error) {
      if (error.response && error.response.status !== 401) {
        toast.error("Ayarlar yüklenemedi. Sunucu hatası.");
      }
    }
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();

    if (newPassword && newPassword.length < 6) {
      toast.error("Şifre en az 6 karakter olmalıdır");
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Şifreler eşleşmiyor");
      return;
    }

    setLoading(true);
    try {
      const updateData = {};
      if (userInfo.full_name) {
        updateData.full_name = userInfo.full_name;
      }
      if (newPassword) {
        updateData.password = newPassword;
      }

      await api.put("/users/me", updateData);
      toast.success("Profil bilgileri güncellendi");
      
      setNewPassword("");
      setConfirmPassword("");
      await loadUserInfo();
      
    } catch (error) {
      const errorMessage = error.response?.data?.detail || "Profil güncellenemedi";
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!settings.company_name) {
        toast.error("İşletme Adı boş bırakılamaz.");
        return;
    }

    setLoading(true);
    try {
      if (logoFile) {
        const formData = new FormData();
        formData.append('file', logoFile);
        
        try {
          const logoResponse = await api.post("/settings/logo", formData, {
            headers: {
              'Content-Type': 'multipart/form-data'
            }
          });
          
          settings.logo_url = logoResponse.data.logo_url;
          toast.success("Logo yüklendi");
        } catch (error) {
          toast.error("Logo yüklenemedi: " + (error.response?.data?.detail || error.message));
        }
      }
      
      await api.put("/settings", settings); 
      toast.success("Ayarlar başarıyla kaydedildi");
      
      await loadSettings();
      setLogoFile(null);
      setLogoPreview(null);
      
    } catch (error) {
      toast.error("Ayarlar kaydedilemedi. Lütfen tüm alanları kontrol edin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* KART 1: İşletme Bilgileri */}
      <div className="px-4 pt-6 pb-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
          <div className="space-y-4">
            <div className="mb-4">
              <button
                onClick={() => onNavigate && onNavigate("settings")}
                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 mb-4 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
                <span className="text-sm font-medium">Ayarlara Dön</span>
              </button>
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  {(userRole || localStorage.getItem('userRole')) === 'staff' ? 'Profilim' : 'İşletme Ayarları'}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  {(userRole || localStorage.getItem('userRole')) === 'staff' ? 'Kişisel bilgiler ve hesap ayarları' : 'İşletme bilgileri ve genel ayarlar'}
                </p>
              </div>
            </div>

            {/* Personel için profil düzenleme */}
            {(() => {
              const currentRole = userRole || localStorage.getItem('userRole');
              
              if (currentRole === 'staff') {
                if (userInfo.username) {
                  return (
                    <form onSubmit={handleSaveUser} className="space-y-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-sm font-semibold text-gray-900">E-posta (Kullanıcı Adı)</Label>
                      <Input
                        id="username"
                        type="email"
                        value={userInfo.username}
                        disabled
                        className="text-base bg-gray-50"
                      />
                      <p className="text-xs text-gray-600">E-posta adresi değiştirilemez.</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="full-name" className="text-sm font-semibold text-gray-900">Ad Soyad</Label>
                      <Input
                        id="full-name"
                        type="text"
                        value={userInfo.full_name}
                        onChange={(e) => setUserInfo({ ...userInfo, full_name: e.target.value })}
                        placeholder="Adınız Soyadınız"
                        className="text-base"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="new-password" className="text-sm font-semibold text-gray-900">Yeni Şifre (Opsiyonel)</Label>
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Şifre değiştirmek istemiyorsanız boş bırakın"
                        className="text-base"
                      />
                      <p className="text-xs text-gray-600">Şifre en az 6 karakter olmalıdır.</p>
                    </div>

                    {newPassword && (
                      <div className="space-y-2">
                        <Label htmlFor="confirm-password" className="text-sm font-semibold text-gray-900">Yeni Şifre Tekrar</Label>
                        <Input
                          id="confirm-password"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Yeni şifrenizi tekrar girin"
                          className="text-base"
                        />
                      </div>
                    )}
                  </div>

                  <div className="mt-6">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-semibold rounded-full"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {loading ? "Kaydediliyor..." : "Profil Bilgilerini Kaydet"}
                    </Button>
                  </div>
                    </form>
                  );
                } else {
                  return (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-600">Kullanıcı bilgileri yükleniyor...</p>
                    </div>
                  );
                }
              } else {
                return (
                  <form onSubmit={handleSave} className="space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="company-name" className="text-sm font-semibold text-gray-900">İşletme Adı</Label>
                  <Input
                    id="company-name"
                    type="text"
                    value={settings.company_name}
                    onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
                    required
                    className="text-base"
                  />
                  <p className="text-xs text-gray-600">Müşterilerinize gönderilen SMS'lerde yer alır.</p>
                  {settings.slug && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Randevu Linkiniz:</p>
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <code className="flex-1 text-sm font-mono bg-white px-3 py-2 rounded border border-gray-200 text-gray-700 break-all">
                          {typeof window !== 'undefined' ? window.location.origin : ''}/{settings.slug}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/${settings.slug}`;
                              navigator.clipboard.writeText(url);
                              toast.success("Link kopyalandı!");
                            } catch (error) {
                              toast.error("Link kopyalanamadı");
                            }
                          }}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-semibold whitespace-nowrap"
                        >
                          Kopyala
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="support-phone" className="text-sm font-semibold text-gray-900">
                    Destek Telefonu
                  </Label>
                  <Input
                    id="support-phone"
                    type="text"
                    value={settings.support_phone}
                    onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
                    required
                    className="text-base"
                  />
                  <p className="text-xs text-gray-600">Müşterilerin size ulaşacağı numara.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sms-reminder" className="text-sm font-semibold text-gray-900">
                    SMS Hatırlatma (Saat Önce)
                  </Label>
                  <select
                    id="sms-reminder"
                    value={settings.sms_reminder_hours}
                    onChange={(e) => setSettings({ ...settings, sms_reminder_hours: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-base"
                  >
                    <option value="0.5">30 Dakika Önce</option>
                    <option value="1">1 Saat Önce</option>
                    <option value="2">2 Saat Önce</option>
                    <option value="3">3 Saat Önce</option>
                    <option value="6">6 Saat Önce</option>
                    <option value="12">12 Saat Önce</option>
                    <option value="24">24 Saat Önce</option>
                  </select>
                  <p className="text-xs text-gray-600">
                    Randevudan kaç saat önce hatırlatma SMS'i gönderilsin
                  </p>
                </div>

                {/* Logo Upload */}
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-gray-900">İşletme Logosu</Label>
                  <div className="flex flex-col md:flex-row gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex-shrink-0">
                      {(logoPreview || settings.logo_url) ? (
                        <div className="relative w-32 h-32 border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                          <img
                            src={logoPreview || settings.logo_url}
                            alt="Logo"
                            className="w-full h-full object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-white">
                          <Upload className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input
                        type="file"
                        accept="image/png,image/jpeg,image/jpg"
                        onChange={(e) => {
                          const file = e.target.files[0];
                          if (file) {
                            if (file.size > 2 * 1024 * 1024) {
                              toast.error("Dosya boyutu 2MB'dan küçük olmalı");
                              return;
                            }
                            setLogoFile(file);
                            setLogoPreview(URL.createObjectURL(file));
                          }
                        }}
                        className="cursor-pointer"
                      />
                      <p className="text-xs text-gray-600">
                        PNG veya JPG, maksimum 2MB
                      </p>
                    </div>
                  </div>
                </div>

                {/* Genel Çalışma Saatleri */}
                <Card className="p-6 bg-white border border-gray-200">
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900 mb-1">Genel Çalışma Saatleri</h3>
                      <p className="text-xs text-gray-600">Müşterilerinizin online randevu alabileceği gün ve saatleri belirleyin.</p>
                    </div>
                    
                    <div className="space-y-3">
                      {[
                        { key: 'monday', label: 'Pazartesi' },
                        { key: 'tuesday', label: 'Salı' },
                        { key: 'wednesday', label: 'Çarşamba' },
                        { key: 'thursday', label: 'Perşembe' },
                        { key: 'friday', label: 'Cuma' },
                        { key: 'saturday', label: 'Cumartesi' },
                        { key: 'sunday', label: 'Pazar' }
                      ].map((day) => {
                        const dayData = settings.business_hours?.[day.key] || { is_open: true, open_time: "09:00", close_time: "18:00" };
                        return (
                          <div key={day.key} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="w-full sm:w-24 flex-shrink-0">
                              <span className="text-sm font-medium text-gray-900">{day.label}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <Switch
                                checked={dayData.is_open}
                                onCheckedChange={(checked) => {
                                  setSettings({
                                    ...settings,
                                    business_hours: {
                                      ...settings.business_hours,
                                      [day.key]: {
                                        ...dayData,
                                        is_open: checked
                                      }
                                    }
                                  });
                                }}
                              />
                              <span className="text-xs text-gray-600 sm:w-12">
                                {dayData.is_open ? 'Açık' : 'Kapalı'}
                              </span>
                            </div>
                            {dayData.is_open && (
                              <div className="flex items-center gap-2 flex-1 w-full sm:w-auto">
                                <Input
                                  type="time"
                                  value={dayData.open_time}
                                  onChange={(e) => {
                                    setSettings({
                                      ...settings,
                                      business_hours: {
                                        ...settings.business_hours,
                                        [day.key]: {
                                          ...dayData,
                                          open_time: e.target.value
                                        }
                                      }
                                    });
                                  }}
                                  className="flex-1 sm:w-32"
                                />
                                <span className="text-gray-500 flex-shrink-0">-</span>
                                <Input
                                  type="time"
                                  value={dayData.close_time}
                                  onChange={(e) => {
                                    setSettings({
                                      ...settings,
                                      business_hours: {
                                        ...settings.business_hours,
                                        [day.key]: {
                                          ...dayData,
                                          close_time: e.target.value
                                        }
                                      }
                                    });
                                  }}
                                  className="flex-1 sm:w-32"
                                />
                              </div>
                            )}
                            {!dayData.is_open && (
                              <span className="text-sm text-gray-400 flex-1 w-full sm:w-auto">Kapalı</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </Card>
              </div>

              <div className="mt-6">
                <Button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-semibold rounded-full"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {loading ? "Kaydediliyor..." : "Ayarları Kaydet"}
                </Button>
              </div>
                  </form>
                );
              }
            })()}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default SettingsProfile;

