import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { FileText, Filter, Calendar, User, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import api from "../api/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    action: "",
    resource_type: "",
    user_id: "",
    start_date: "",
    end_date: ""
  });

  useEffect(() => {
    loadAuditLogs();
  }, []);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.action) params.append('action', filters.action);
      if (filters.resource_type) params.append('resource_type', filters.resource_type);
      if (filters.user_id) params.append('user_id', filters.user_id);
      if (filters.start_date) params.append('start_date', filters.start_date);
      if (filters.end_date) params.append('end_date', filters.end_date);
      
      const response = await api.get(`/audit-logs?${params.toString()}`);
      setLogs(response.data);
    } catch (error) {
      console.error("Audit logs yüklenemedi:", error);
      toast.error("Denetim günlükleri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action) => {
    const variants = {
      CREATE: { variant: "default", label: "Oluşturuldu", className: "bg-green-500" },
      UPDATE: { variant: "secondary", label: "Güncellendi", className: "bg-blue-500 text-white" },
      DELETE: { variant: "destructive", label: "Silindi", className: "bg-red-500" }
    };
    const config = variants[action] || { variant: "outline", label: action, className: "" };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const getResourceTypeLabel = (type) => {
    const labels = {
      APPOINTMENT: "Randevu",
      SETTINGS: "Ayarlar",
      CUSTOMER: "Müşteri",
      SERVICE: "Hizmet",
      STAFF: "Personel"
    };
    return labels[type] || type;
  };

  const formatTimestamp = (timestamp) => {
    try {
      const date = new Date(timestamp);
      return format(date, "dd MMM yyyy, HH:mm", { locale: tr });
    } catch {
      return timestamp;
    }
  };

  const getChangesSummary = (log) => {
    if (log.action === "CREATE") {
      return "Yeni kayıt oluşturuldu";
    }
    if (log.action === "DELETE") {
      return "Kayıt silindi";
    }
    if (log.action === "UPDATE" && log.old_value && log.new_value) {
      const changes = [];
      Object.keys(log.new_value).forEach(key => {
        if (JSON.stringify(log.old_value[key]) !== JSON.stringify(log.new_value[key])) {
          changes.push(key);
        }
      });
      return changes.length > 0 ? `Değişen alanlar: ${changes.join(', ')}` : "Güncelleme yapıldı";
    }
    return "Değişiklik yapıldı";
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Denetim Günlükleri</h1>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Filtreler</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Select value={filters.action || "all"} onValueChange={(value) => setFilters({...filters, action: value === "all" ? "" : value})}>
            <SelectTrigger>
              <SelectValue placeholder="İşlem Tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="CREATE">Oluşturma</SelectItem>
              <SelectItem value="UPDATE">Güncelleme</SelectItem>
              <SelectItem value="DELETE">Silme</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filters.resource_type || "all"} onValueChange={(value) => setFilters({...filters, resource_type: value === "all" ? "" : value})}>
            <SelectTrigger>
              <SelectValue placeholder="Kaynak Tipi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="APPOINTMENT">Randevu</SelectItem>
              <SelectItem value="SETTINGS">Ayarlar</SelectItem>
              <SelectItem value="CUSTOMER">Müşteri</SelectItem>
              <SelectItem value="SERVICE">Hizmet</SelectItem>
              <SelectItem value="STAFF">Personel</SelectItem>
            </SelectContent>
          </Select>

          <Input
            type="date"
            placeholder="Başlangıç"
            value={filters.start_date}
            onChange={(e) => setFilters({...filters, start_date: e.target.value})}
          />

          <Input
            type="date"
            placeholder="Bitiş"
            value={filters.end_date}
            onChange={(e) => setFilters({...filters, end_date: e.target.value})}
          />

          <button
            onClick={loadAuditLogs}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
          >
            Filtrele
          </button>
        </div>
      </Card>

      {/* Logs Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
        </div>
      ) : logs.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
          <p className="text-gray-600">Kayıt bulunamadı</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id} className="p-4 hover:shadow-md transition">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    {getActionBadge(log.action)}
                    <Badge variant="outline">{getResourceTypeLabel(log.resource_type)}</Badge>
                    <span className="text-sm text-gray-500">{formatTimestamp(log.timestamp)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 mb-1">
                    <User className="h-4 w-4" />
                    <span className="font-medium">{log.user_full_name}</span>
                    <span className="text-gray-400">({log.user_id})</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    {getChangesSummary(log)}
                  </p>
                  {log.ip_address && (
                    <p className="text-xs text-gray-400 mt-1">IP: {log.ip_address}</p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
