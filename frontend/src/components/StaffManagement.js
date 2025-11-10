import { useState, useEffect } from "react";
import { Users, UserPlus, Edit, CheckSquare, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
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

const StaffManagement = () => {
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingStaff, setEditingStaff] = useState(null);
  const [selectedServices, setSelectedServices] = useState([]);
  const [saving, setSaving] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  
  // Yeni personel ekleme
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newStaff, setNewStaff] = useState({
    username: "",
    password: "",
    full_name: ""
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Personelleri yükle
      const usersResponse = await api.get("/users");
      console.log("🔍 Tüm kullanıcılar:", usersResponse.data);
      
      // Admin ve staff rolündeki kullanıcıları göster
      const allPersonnel = (usersResponse.data || []).filter(u => u.role === "staff" || u.role === "admin");
      console.log("✅ Filtrelenmiş personel listesi:", allPersonnel);
      
      setStaff(allPersonnel);
      
      // Hizmetleri yükle
      const servicesResponse = await api.get("/services");
      setServices(servicesResponse.data || []);
      
      setLoading(false);
    } catch (error) {
      console.error("Veri yüklenemedi:", error);
      toast.error("Veriler yüklenirken hata oluştu");
      setLoading(false);
    }
  };

  const openEditModal = (staffMember) => {
    setEditingStaff(staffMember);
    setSelectedServices(staffMember.permitted_service_ids || []);
  };

  const toggleService = (serviceId) => {
    setSelectedServices(prev => {
      if (prev.includes(serviceId)) {
        return prev.filter(id => id !== serviceId);
      } else {
        return [...prev, serviceId];
      }
    });
  };

  const handleSaveServices = async () => {
    if (!editingStaff) return;
    
    setSaving(true);
    try {
      await api.put(`/staff/${editingStaff.username}/services`, selectedServices, {
        headers: { 'Content-Type': 'application/json' }
      });
      
      toast.success("Personel hizmetleri güncellendi");
      
      // Listeyi güncelle
      setStaff(prev => prev.map(s => 
        s.username === editingStaff.username 
          ? { ...s, permitted_service_ids: selectedServices }
          : s
      ));
      
      setEditingStaff(null);
    } catch (error) {
      console.error("Kaydetme hatası:", error);
      
      let errorMessage = "Hizmetler kaydedilemedi";
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map(err => `${err.loc?.join('.')}: ${err.msg}`)
            .join(', ');
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleAddStaff = async () => {
    const trimmedUsername = newStaff.username?.trim();
    const trimmedPassword = newStaff.password?.trim();
    const trimmedFullName = newStaff.full_name?.trim();
    
    if (!trimmedUsername || !trimmedPassword || !trimmedFullName) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedUsername)) {
      toast.error("Lütfen geçerli bir e-posta adresi girin");
      return;
    }
    
    if (trimmedPassword.length < 6) {
      toast.error("Şifre en az 6 karakter olmalıdır");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        username: trimmedUsername,
        password: trimmedPassword,
        full_name: trimmedFullName
      };
      
      await api.post("/staff/add", payload);
      
      toast.success("Personel başarıyla eklendi");
      
      // Listeyi güncelle
      await loadData();
      
      // Formu sıfırla
      setNewStaff({ username: "", password: "", full_name: "" });
      setShowAddDialog(false);
    } catch (error) {
      console.error("Personel ekleme hatası:", error);
      
      let errorMessage = "Personel eklenemedi";
      if (error.response?.data?.detail) {
        if (typeof error.response.data.detail === 'string') {
          errorMessage = error.response.data.detail;
        } else if (Array.isArray(error.response.data.detail)) {
          errorMessage = error.response.data.detail
            .map(err => `${err.loc?.join('.')}: ${err.msg}`)
            .join(', ');
        } else {
          errorMessage = JSON.stringify(error.response.data.detail);
        }
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteStaff = async (staffId) => {
    try {
      await api.delete(`/staff/${staffId}`);
      toast.success("Personel silindi");
      setDeleteDialog(null);
      await loadData();
    } catch (error) {
      console.error("Silme hatası:", error);
      let errorMessage = "Personel silinemedi";
      if (error.response?.data?.detail) {
        errorMessage = typeof error.response.data.detail === 'string' 
          ? error.response.data.detail 
          : JSON.stringify(error.response.data.detail);
      }
      toast.error(errorMessage);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Users className="w-8 h-8 text-blue-600" />
            Personel Yönetimi
          </h1>
          <p className="text-gray-600 mt-1">Personellerinizin verebileceği hizmetleri yönetin</p>
        </div>
        
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button className="bg-green-500 hover:bg-green-600">
              <UserPlus className="w-4 h-4 mr-2" />
              Yeni Personel Ekle
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Yeni Personel Ekle</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Ad Soyad *</Label>
                <Input
                  id="full_name"
                  value={newStaff.full_name}
                  onChange={(e) => setNewStaff({ ...newStaff, full_name: e.target.value })}
                  placeholder="Ahmet Yılmaz"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="username">E-posta (Kullanıcı Adı) *</Label>
                <Input
                  id="username"
                  type="email"
                  value={newStaff.username}
                  onChange={(e) => setNewStaff({ ...newStaff, username: e.target.value })}
                  placeholder="ahmet@isletme.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Şifre *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newStaff.password}
                  onChange={(e) => setNewStaff({ ...newStaff, password: e.target.value })}
                  placeholder="Güçlü bir şifre"
                />
              </div>
              <p className="text-sm text-gray-600">
                Bu bilgilerle personel giriş yapabilecek. Daha sonra "Hizmetleri Düzenle" ile hangi hizmetleri verebileceğini atayabilirsiniz.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setShowAddDialog(false)}
                variant="outline"
                className="flex-1"
              >
                İptal
              </Button>
              <Button
                onClick={handleAddStaff}
                disabled={saving}
                className="flex-1 bg-green-500 hover:bg-green-600"
              >
                {saving ? "Ekleniyor..." : "Personel Ekle"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {staff.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Henüz Personel Yok</h3>
          <p className="text-gray-600">Personel eklemek için "Yeni Personel Ekle" butonunu kullanın</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {staff.map((staffMember) => {
            const assignedServices = services.filter(s => 
              staffMember.permitted_service_ids?.includes(s.id)
            );
            
            return (
              <Card key={staffMember.username} className="p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                      staffMember.role === 'admin' 
                        ? 'bg-gradient-to-br from-amber-500 to-orange-600' 
                        : 'bg-gradient-to-br from-blue-500 to-indigo-600'
                    }`}>
                      {staffMember.full_name?.charAt(0) || staffMember.username?.charAt(0) || "?"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">
                          {staffMember.full_name || staffMember.username}
                        </h3>
                        {staffMember.role === 'admin' && (
                          <span className="px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-800 rounded-full">
                            SAHİBİ
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600">{staffMember.username}</p>
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-2">Verebileceği Hizmetler:</p>
                  {assignedServices.length > 0 ? (
                    <div className="space-y-1">
                      {assignedServices.map(service => (
                        <div key={service.id} className="flex items-center gap-2 text-sm">
                          <CheckSquare className="w-4 h-4 text-green-500" />
                          <span className="text-gray-700">{service.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">Henüz hizmet atanmamış</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        onClick={() => openEditModal(staffMember)}
                        variant="outline" 
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-2" />
                        Hizmetleri Düzenle
                      </Button>
                    </DialogTrigger>
                    
                    {editingStaff?.username === staffMember.username && (
                      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>
                            {editingStaff.full_name || editingStaff.username} - Hizmet Ataması
                          </DialogTitle>
                        </DialogHeader>
                        
                        <div className="space-y-4 py-4">
                          <p className="text-sm text-gray-600">
                            Bu personelin verebileceği hizmetleri seçin:
                          </p>
                          
                          {services.length === 0 ? (
                            <p className="text-center text-gray-500 py-8">
                              Henüz hizmet eklenmemiş. Önce "Hizmet Yönetimi" sayfasından hizmet ekleyin.
                            </p>
                          ) : (
                            <div className="grid grid-cols-1 gap-3">
                              {services.map((service) => {
                                const isSelected = selectedServices.includes(service.id);
                                
                                return (
                                  <div
                                    key={service.id}
                                    onClick={() => toggleService(service.id)}
                                    className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                                      isSelected
                                        ? "border-blue-500 bg-blue-50"
                                        : "border-gray-200 hover:border-blue-300"
                                    }`}
                                  >
                                    <div className="flex items-center gap-3">
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => toggleService(service.id)}
                                      />
                                      <div className="flex-1">
                                        <Label className="font-semibold text-gray-900 cursor-pointer">
                                          {service.name}
                                        </Label>
                                        <p className="text-sm text-gray-600">{service.price}₺</p>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setEditingStaff(null)}
                            variant="outline"
                            className="flex-1"
                          >
                            İptal
                          </Button>
                          <Button
                            onClick={handleSaveServices}
                            disabled={saving}
                            className="flex-1 bg-blue-500 hover:bg-blue-600"
                          >
                            {saving ? "Kaydediliyor..." : "Kaydet"}
                          </Button>
                        </div>
                      </DialogContent>
                    )}
                  </Dialog>
                  
                  {staffMember.role !== 'admin' && (
                    <Button
                      onClick={() => setDeleteDialog(staffMember)}
                      variant="outline"
                      size="icon"
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Personeli Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.full_name || deleteDialog?.username} personelini silmek istediğinizden emin misiniz?
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleDeleteStaff(deleteDialog?.username)}
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

export default StaffManagement;
