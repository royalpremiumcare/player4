import { useState, useEffect, useMemo } from "react";
import { Building2, DollarSign, Calendar, Users, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsResponse, orgsResponse] = await Promise.all([
        api.get("/superadmin/stats"),
        api.get("/superadmin/organizations")
      ]);
      setStats(statsResponse.data);
      setOrganizations(orgsResponse.data.organizations || []);
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

        {/* Detaylı İşletme Listesi */}
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
      </div>
    </div>
  );
};

export default SuperAdmin;


