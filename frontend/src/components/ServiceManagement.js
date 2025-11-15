import { useState, useEffect } from "react";
import { Briefcase, Edit, Trash2, Plus, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

const ServiceManagement = ({ services, onRefresh, onNavigate }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({ name: "", price: "", duration: "30" });
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({ 
      name: service.name, 
      price: service.price.toString(),
      duration: (service.duration || 30).toString()
    });
    setShowDialog(true);
  };

  const handleNew = () => {
    setEditingService(null);
    setFormData({ name: "", price: "", duration: "30" });
    setShowDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.price || !formData.duration) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Geçerli bir fiyat girin");
      return;
    }

    const duration = parseInt(formData.duration);
    if (isNaN(duration) || duration <= 0) {
      toast.error("Geçerli bir süre girin (dakika)");
      return;
    }

    setLoading(true);
    try {
      const payload = { name: formData.name, price, duration };
      
      if (editingService) {
        await api.put(`/services/${editingService.id}`, payload);
        toast.success("Hizmet güncellendi");
      } else {
        await api.post("/services", payload);
        toast.success("Hizmet eklendi");
      }
      
      setShowDialog(false);
      setFormData({ name: "", price: "", duration: "30" });
      onRefresh();
    } catch (error) {
      toast.error("İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (serviceId) => {
    try {
      await api.delete(`/services/${serviceId}`);
      toast.success("Hizmet silindi");
      setDeleteDialog(null);
      onRefresh();
    } catch (error) {
      toast.error("Hizmet silinemedi");
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await api.get("/settings");
      setSettings(response.data);
    } catch (error) {
      console.error("Ayarlar yüklenemedi:", error);
    }
  };

  const handleSettingsChange = async (field, value) => {
    if (!settings) return;
    
    setSavingSettings(true);
    try {
      const updatedSettings = { ...settings, [field]: value };
      await api.put("/settings", updatedSettings);
      setSettings(updatedSettings);
      toast.success("Ayar güncellendi");
    } catch (error) {
      toast.error("Ayar güncellenemedi");
      console.error("Settings update error:", error);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-20" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* KART 1: Başlık ve Yeni Hizmet Ekle */}
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
                <h2 className="text-lg font-bold text-gray-900">Hizmet Yönetimi</h2>
          <p className="text-sm text-gray-600 mt-1">Hizmetlerinizi ekleyin, düzenleyin veya silin</p>
        </div>
            </div>

        <Button
          data-testid="add-service-button"
          onClick={handleNew}
              className="w-full bg-blue-600 hover:bg-blue-700 h-12 text-base font-semibold rounded-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Hizmet
        </Button>
          </div>
        </Card>
      </div>

      {/* KART: Online Randevu Ayarları */}
      <div className="px-4 pt-4 pb-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 mb-1">Online Randevu Ayarları</h3>
              <p className="text-sm text-gray-600">Online randevu sayfasında gösterilecek bilgileri seçin</p>
            </div>
            
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="show-duration" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Hizmet süresi gösterilsin mi?
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">Online randevu sayfasında hizmet süresi (dakika) bilgisi gösterilir</p>
                </div>
                <Switch
                  id="show-duration"
                  checked={settings?.show_service_duration_on_public !== false}
                  onCheckedChange={(checked) => handleSettingsChange("show_service_duration_on_public", checked)}
                  disabled={savingSettings || !settings}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <Label htmlFor="show-price" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Hizmet ücreti gösterilsin mi?
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">Online randevu sayfasında hizmet fiyatı gösterilir</p>
                </div>
                <Switch
                  id="show-price"
                  checked={settings?.show_service_price_on_public !== false}
                  onCheckedChange={(checked) => handleSettingsChange("show_service_price_on_public", checked)}
                  disabled={savingSettings || !settings}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* KART 2: Hizmet Listesi */}
      {services.length === 0 ? (
        <div className="px-4 py-4">
          <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
            <div className="text-center py-8">
              <Briefcase className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-gray-900 mb-2">Henüz Hizmet Yok</h3>
              <p className="text-sm text-gray-600">Hizmet eklemek için "Yeni Hizmet" butonunu kullanın</p>
            </div>
          </Card>
        </div>
      ) : (
        <div className="px-4 py-4 space-y-3">
        {services.map((service) => (
          <Card
            key={service.id}
            data-testid={`service-card-${service.id}`}
              className="bg-white shadow-md border border-gray-200 rounded-xl p-6"
          >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 mb-1">{service.name}</h3>
                    <div className="flex items-center gap-3">
                      <p className="text-lg font-bold text-blue-600">{Math.round(service.price)}₺</p>
                      <p className="text-sm text-gray-500">{(service.duration || 30)} dk</p>
                    </div>
                </div>
              </div>
                <div className="flex gap-2 flex-shrink-0">
              <Button
                data-testid={`edit-service-${service.id}`}
                onClick={() => handleEdit(service)}
                size="sm"
                variant="outline"
              >
                <Edit className="w-4 h-4 mr-1" />
                Düzenle
              </Button>
              <Button
                data-testid={`delete-service-${service.id}`}
                onClick={() => setDeleteDialog(service)}
                size="sm"
                variant="outline"
                className="text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
                </div>
            </div>
          </Card>
        ))}
      </div>
      )}

      {/* Service Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? "Hizmeti Düzenle" : "Yeni Hizmet Ekle"}</DialogTitle>
            <DialogDescription>
              Hizmet bilgilerini girin
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="service-name">Hizmet Adı</Label>
              <Input
                id="service-name"
                data-testid="service-name-input"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Örn: Saç Kesimi, Bakım, Danışmanlık"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-price">Fiyat (₺)</Label>
              <Input
                id="service-price"
                data-testid="service-price-input"
                type="number"
                step="0.01"
                value={formData.price}
                onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-duration">Hizmet Süresi (Dakika)</Label>
              <Input
                id="service-duration"
                data-testid="service-duration-input"
                type="number"
                min="1"
                step="1"
                value={formData.duration}
                onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="30"
                required
              />
              <p className="text-xs text-gray-500">Randevu oluştururken bu süre baz alınacaktır</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                İptal
              </Button>
              <Button
                data-testid="save-service-button"
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {loading ? "Kaydediliyor..." : "Kaydet"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hizmeti Sil</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.name} hizmetini silmek istediğinizden emin misiniz?
              Bu işlem geri alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-delete-service"
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

export default ServiceManagement;
