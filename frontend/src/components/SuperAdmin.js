import { useState, useEffect, useMemo } from "react";
import { Building2, DollarSign, Calendar, Users, Search, ArrowUpDown, ArrowUp, ArrowDown, Phone, Mail, MessageSquare, Clock, CheckCircle2, MessageCircle, Trash2, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import api from "../api/api";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const SuperAdmin = () => {
  const [stats, setStats] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [activeTab, setActiveTab] = useState("organizations"); // "organizations" veya "contacts"
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [contactSearchTerm, setContactSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [contactSortConfig, setContactSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedContacts, setSelectedContacts] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResponse, orgsResponse, contactsResponse] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/organizations"),
        api.get("/superadmin/contact-requests")
      ]);
      setStats(statsResponse.data);
      setOrganizations(orgsResponse.data.organizations || []);
      setContactRequests(contactsResponse.data.contacts || []);
    } catch (error) {
      if (error.response?.status === 403) {
        toast.error("Bu sayfaya erişim yetkiniz yok");
      } else {
        toast.error("Veriler yüklenemedi");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (contactId, newStatus) => {
    try {
      await api.put(`/superadmin/contact-requests/${contactId}/status`, {
        status: newStatus
      });
      
      // Local state'i güncelle
      setContactRequests(prev => 
        prev.map(contact => 
          contact.id === contactId 
            ? { ...contact, status: newStatus }
            : contact
        )
      );
      
      const statusText = newStatus === 'contacted' ? 'İletişime Geçildi' : 'Beklemede';
      toast.success(`Durum "${statusText}" olarak güncellendi`);
    } catch (error) {
      toast.error("Durum güncellenirken hata oluştu");
      console.error("Status update error:", error);
    }
  };

  const handleDeleteContact = async (contactId) => {
    if (!window.confirm("Bu iletişim talebini silmek istediğinize emin misiniz?")) {
      return;
    }

    try {
      await api.delete(`/superadmin/contact-requests/${contactId}`);
      
      // Local state'den kaldır
      setContactRequests(prev => prev.filter(contact => contact.id !== contactId));
      
      toast.success("İletişim talebi silindi");
    } catch (error) {
      toast.error("İletişim talebi silinirken hata oluştu");
      console.error("Delete error:", error);
    }
  };

  const handleBulkDeleteResolved = async () => {
    const resolvedCount = contactRequests.filter(c => c.status === 'resolved').length;
    
    if (resolvedCount === 0) {
      toast.info("Silinecek çözülen iletişim talebi bulunamadı");
      return;
    }

    if (!window.confirm(`${resolvedCount} adet çözülen iletişim talebini silmek istediğinize emin misiniz?`)) {
      return;
    }

    try {
      const response = await api.delete(`/superadmin/contact-requests/bulk/delete-resolved`);
      
      // Local state'den çözülenleri kaldır
      setContactRequests(prev => prev.filter(contact => contact.status !== 'resolved'));
      
      toast.success(`${response.data.deleted_count} adet çözülen iletişim talebi silindi`);
    } catch (error) {
      toast.error("Çözülen iletişim talepleri silinirken hata oluştu");
      console.error("Bulk delete error:", error);
    }
  };

  // Contact requests için arama ve sıralama
  const filteredAndSortedContacts = useMemo(() => {
    let filtered = contactRequests.filter(contact => {
      const searchLower = contactSearchTerm.toLowerCase();
      return (
        contact.name?.toLowerCase().includes(searchLower) ||
        contact.phone?.includes(contactSearchTerm) ||
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.message?.toLowerCase().includes(searchLower)
      );
    });

    if (contactSortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[contactSortConfig.key];
        let bVal = b[contactSortConfig.key];

        // Tarih için özel işlem
        if (contactSortConfig.key === 'created_at') {
          aVal = new Date(aVal || 0).getTime();
          bVal = new Date(bVal || 0).getTime();
        }

        // String değerler için
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }
        
        if (contactSortConfig.direction === 'asc') {
          return aVal > bVal ? 1 : -1;
        } else {
          return aVal < bVal ? 1 : -1;
        }
      });
    }

    return filtered;
  }, [contactRequests, contactSearchTerm, contactSortConfig]);

  const handleContactSort = (key) => {
    setContactSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        return {
          key,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const ContactSortIcon = ({ columnKey }) => {
    if (contactSortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-gray-400" />;
    }
    return contactSortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-blue-600" />
      : <ArrowDown className="ml-2 h-4 w-4 text-blue-600" />;
  };

  // Arama ve sıralama
  const filteredAndSortedOrgs = useMemo(() => {
    let filtered = organizations.filter(org => {
      const searchLower = searchTerm.toLowerCase();
      return (
        org.isletme_adi.toLowerCase().includes(searchLower) ||
        org.telefon_numarasi.includes(searchTerm)
      );
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        let aVal = a[sortConfig.key];
        let bVal = b[sortConfig.key];

        // Sayısal değerler için
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // String değerler için
        aVal = String(aVal || '').toLowerCase();
        bVal = String(bVal || '').toLowerCase();
        
        if (sortConfig.direction === 'asc') {
          return aVal.localeCompare(bVal, 'tr');
        } else {
          return bVal.localeCompare(aVal, 'tr');
        }
      });
    }

    return filtered;
  }, [organizations, searchTerm, sortConfig]);

  const handleSort = (key) => {
    setSortConfig(prevConfig => {
      if (prevConfig.key === key) {
        return {
          key,
          direction: prevConfig.direction === 'asc' ? 'desc' : 'asc'
        };
      }
      return { key, direction: 'asc' };
    });
  };

  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-gray-400" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="ml-2 h-4 w-4 text-blue-600" />
      : <ArrowDown className="ml-2 h-4 w-4 text-blue-600" />;
  };

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Super Admin Paneli</h1>
          <p className="text-gray-600">Platform genelinde tüm işletmelerin özet bilgileri</p>
        </div>

        {/* Hızlı Bakış Kartları */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Toplam İşletme</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.toplam_isletme || 0}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <Building2 className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Aylık Abonelik Geliri</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.toplam_gelir_bu_ay?.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0,00'} ₺
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Aylık Toplam Randevu</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.toplam_randevu_bu_ay?.toLocaleString('tr-TR') || 0}
                </p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Calendar className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Toplam Aktif Kullanıcı</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.toplam_aktif_kullanici?.toLocaleString('tr-TR') || 0}
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <Users className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </Card>
        </div>

        {/* Tab Navigation */}
        <div className="mb-6 flex gap-4 border-b border-gray-200">
          <button
            onClick={() => setActiveTab("organizations")}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === "organizations"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            İşletmeler
          </button>
          <button
            onClick={() => setActiveTab("contacts")}
            className={`px-4 py-2 font-medium transition-colors relative ${
              activeTab === "contacts"
                ? "text-blue-600 border-b-2 border-blue-600"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            İletişim Talepleri
            {contactRequests.filter(c => c.status === "pending").length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {contactRequests.filter(c => c.status === "pending").length}
              </span>
            )}
          </button>
        </div>

        {/* İşletme Listesi Tab */}
        {activeTab === "organizations" && (
        <Card className="p-6">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">İşletme Listesi</h2>
            
            {/* Arama Çubuğu */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="İşletme Adı veya Telefon Numarası ile Ara..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Tablo */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('isletme_adi')}
                  >
                    <div className="flex items-center">
                      İşletme Adı
                      <SortIcon columnKey="isletme_adi" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('telefon_numarasi')}
                  >
                    <div className="flex items-center">
                      Telefon Numarası
                      <SortIcon columnKey="telefon_numarasi" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('abonelik_paketi')}
                  >
                    <div className="flex items-center">
                      Paket
                      <SortIcon columnKey="abonelik_paketi" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('abonelik_durumu')}
                  >
                    <div className="flex items-center">
                      Durum
                      <SortIcon columnKey="abonelik_durumu" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('bu_ayki_randevu_sayisi')}
                  >
                    <div className="flex items-center">
                      Bu Ayki Randevu
                      <SortIcon columnKey="bu_ayki_randevu_sayisi" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('toplam_musteri_sayisi')}
                  >
                    <div className="flex items-center">
                      Top. Müşteri
                      <SortIcon columnKey="toplam_musteri_sayisi" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleSort('toplam_personel_sayisi')}
                  >
                    <div className="flex items-center">
                      Top. Personel
                      <SortIcon columnKey="toplam_personel_sayisi" />
                    </div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedOrgs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      {searchTerm ? "Arama sonucu bulunamadı" : "Henüz işletme kaydı yok"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedOrgs.map((org, index) => (
                    <TableRow key={org.organization_id || index}>
                      <TableCell className="font-medium">{org.isletme_adi}</TableCell>
                      <TableCell>{org.telefon_numarasi}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          org.abonelik_paketi === 'Premium' ? 'bg-purple-100 text-purple-800' :
                          org.abonelik_paketi === 'Kurumsal' ? 'bg-indigo-100 text-indigo-800' :
                          org.abonelik_paketi === 'Trial' ? 'bg-gray-100 text-gray-800' :
                          'bg-blue-100 text-blue-800'
                        }`}>
                          {org.abonelik_paketi}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          org.abonelik_durumu === 'Aktif' ? 'bg-green-100 text-green-800' :
                          org.abonelik_durumu === 'Deneme Bitti' ? 'bg-red-100 text-red-800' :
                          org.abonelik_durumu.includes('Gün Kaldı') ? 'bg-yellow-100 text-yellow-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {org.abonelik_durumu}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">{org.bu_ayki_randevu_sayisi.toLocaleString('tr-TR')}</TableCell>
                      <TableCell className="text-center">{org.toplam_musteri_sayisi.toLocaleString('tr-TR')}</TableCell>
                      <TableCell className="text-center">{org.toplam_personel_sayisi.toLocaleString('tr-TR')}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Sonuç Sayısı */}
          {filteredAndSortedOrgs.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              Toplam {filteredAndSortedOrgs.length} işletme gösteriliyor
            </div>
          )}
        </Card>
        )}

        {/* İletişim Talepleri Tab */}
        {activeTab === "contacts" && (
        <Card className="p-6">
          <div className="mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <h2 className="text-xl font-bold text-gray-900">İletişim Talepleri</h2>
              {contactRequests.filter(c => c.status === 'resolved').length > 0 && (
                <Button
                  variant="outline"
                  onClick={handleBulkDeleteResolved}
                  className="text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Çözülenleri Toplu Sil ({contactRequests.filter(c => c.status === 'resolved').length})
                </Button>
              )}
            </div>
            
            {/* Arama Çubuğu */}
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <Input
                type="text"
                placeholder="Ad, telefon, e-posta veya mesaj ile ara..."
                value={contactSearchTerm}
                onChange={(e) => setContactSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Tablo */}
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleContactSort('name')}
                  >
                    <div className="flex items-center">
                      Ad Soyad
                      <ContactSortIcon columnKey="name" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleContactSort('phone')}
                  >
                    <div className="flex items-center">
                      Telefon
                      <ContactSortIcon columnKey="phone" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleContactSort('email')}
                  >
                    <div className="flex items-center">
                      E-posta
                      <ContactSortIcon columnKey="email" />
                    </div>
                  </TableHead>
                  <TableHead>Mesaj</TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleContactSort('status')}
                  >
                    <div className="flex items-center">
                      Durum
                      <ContactSortIcon columnKey="status" />
                    </div>
                  </TableHead>
                  <TableHead 
                    className="cursor-pointer hover:bg-gray-100 select-none"
                    onClick={() => handleContactSort('created_at')}
                  >
                    <div className="flex items-center">
                      Tarih
                      <ContactSortIcon columnKey="created_at" />
                    </div>
                  </TableHead>
                  <TableHead className="text-right">İşlemler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAndSortedContacts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                      {contactSearchTerm ? "Arama sonucu bulunamadı" : "Henüz iletişim talebi yok"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAndSortedContacts.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell className="font-medium">{contact.name}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <a href={`tel:${contact.phone}`} className="text-blue-600 hover:underline">
                            {contact.phone}
                          </a>
                        </div>
                      </TableCell>
                      <TableCell>
                        {contact.email ? (
                          <div className="flex items-center gap-2">
                            <Mail className="w-4 h-4 text-gray-400" />
                            <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline">
                              {contact.email}
                            </a>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {contact.message ? (
                          <div className="max-w-xs">
                            <p className="truncate" title={contact.message}>
                              {contact.message}
                            </p>
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            contact.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            contact.status === 'contacted' ? 'bg-green-100 text-green-800' :
                            contact.status === 'resolved' ? 'bg-green-100 text-green-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {contact.status === 'pending' ? 'Beklemede' :
                             contact.status === 'contacted' ? 'İletişime Geçildi' :
                             contact.status === 'resolved' ? 'Çözüldü' :
                             contact.status}
                          </span>
                          <div className="flex gap-1 flex-wrap">
                            {contact.status !== 'contacted' && (
                              <Button
                                size="sm"
                                className="h-7 text-xs px-2 bg-green-600 hover:bg-green-700 text-white border-0"
                                onClick={() => handleStatusUpdate(contact.id, 'contacted')}
                              >
                                <MessageCircle className="w-3 h-3 mr-1" />
                                İletişime Geçildi
                              </Button>
                            )}
                            {contact.status !== 'pending' && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs px-2"
                                onClick={() => handleStatusUpdate(contact.id, 'pending')}
                              >
                                Beklemede
                              </Button>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock className="w-4 h-4" />
                          {contact.created_at ? new Date(contact.created_at).toLocaleString('tr-TR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2 text-red-600 border-red-300 hover:bg-red-50 hover:border-red-400"
                          onClick={() => handleDeleteContact(contact.id)}
                        >
                          <Trash className="w-3 h-3 mr-1" />
                          Sil
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Sonuç Sayısı */}
          {filteredAndSortedContacts.length > 0 && (
            <div className="mt-4 text-sm text-gray-600">
              Toplam {filteredAndSortedContacts.length} talep gösteriliyor
              {contactRequests.filter(c => c.status === "pending").length > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  ({contactRequests.filter(c => c.status === "pending").length} beklemede)
                </span>
              )}
            </div>
          )}
        </Card>
        )}
      </div>
    </div>
  );
};

export default SuperAdmin;


