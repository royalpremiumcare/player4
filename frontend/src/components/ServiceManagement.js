import { useState } from "react";
import { Briefcase, Edit, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
// import axios from "axios"; // SİLİNDİ
import api from "../api/api"; // YENİ EKLENDİ (Token'ı otomatik ekler)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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

// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL; // SİLİNDİ
// const API = `${BACKEND_URL}/api`; // SİLİNDİ

const ServiceManagement = ({ services, onRefresh }) => {
  const [showDialog, setShowDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [formData, setFormData] = useState({ name: "", price: "" });
  const [loading, setLoading] = useState(false);

  const handleEdit = (service) => {
    setEditingService(service);
    setFormData({ name: service.name, price: service.price.toString() });
    setShowDialog(true);
  };

  const handleNew = () => {
    setEditingService(null);
    setFormData({ name: "", price: "" });
    setShowDialog(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name || !formData.price) {
      toast.error("Lütfen tüm alanları doldurun");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Geçerli bir fiyat girin");
      return;
    }

    setLoading(true);
    try {
      const payload = { name: formData.name, price };
      
      if (editingService) {
        // await axios.put(`${API}/services/${editingService.id}`, payload); // ESKİ
        await api.put(`/services/${editingService.id}`, payload); // YENİ
        toast.success("Hizmet güncellendi");
      } else {
        // await axios.post(`${API}/services`, payload); // ESKİ
        await api.post("/services", payload); // YENİ
        toast.success("Hizmet eklendi");
      }
      
      setShowDialog(false);
      setFormData({ name: "", price: "" });
      onRefresh();
    } catch (error) {
      toast.error("İşlem başarısız");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (serviceId) => {
    try {
      // await axios.delete(`${API}/services/${serviceId}`); // ESKİ
      await api.delete(`/services/${serviceId}`); // YENİ
      toast.success("Hizmet silindi");
      setDeleteDialog(null);
      onRefresh();
    } catch (error) {
      toast.error("Hizmet silinemedi");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Hizmet Yönetimi
          </h2>
          <p className="text-sm text-gray-600 mt-1">Hizmetlerinizi ekleyin, düzenleyin veya silin</p>
        </div>
        <Button
          data-testid="add-service-button"
          onClick={handleNew}
          className="bg-blue-500 hover:bg-blue-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Yeni Hizmet
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {services.map((service) => (
          <Card
            key={service.id}
            data-testid={`service-card-${service.id}`}
            className="p-4 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Briefcase className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{service.name}</h3>
                  <p className="text-lg font-bold text-blue-600">{Math.round(service.price)}₺</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button
                data-testid={`edit-service-${service.id}`}
                onClick={() => handleEdit(service)}
                size="sm"
                variant="outline"
                className="flex-1"
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
          </Card>
        ))}
      </div>

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
                placeholder="Örn: Koltuk Takımı Yıkama"
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowDialog(false)}>
                İptal
              </Button>
              <Button
                data-testid="save-service-button"
                type="submit"
                disabled={loading}
                className="bg-blue-500 hover:bg-blue-600"
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