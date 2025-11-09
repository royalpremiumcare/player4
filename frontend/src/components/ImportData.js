import { useState } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
// import axios from "axios"; // SİLİNDİ
import api from "../api/api"; // YENİ EKLENDİ (Token'ı otomatik ekler)
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";

// const BACKEND_URL = process.env.REACT_APP_BACKEND_URL; // SİLİNDİ
// const API = `${BACKEND_URL}/api`; // SİLİNDİ

const ImportData = ({ onImportComplete }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  const handleFileUpload = async (event, type) => {
    const file = event.target.files[0];
    if (!file) return;

    setLoading(true);
    setResults(null);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      if (type === 'appointments') {
        await importAppointments(jsonData);
      }
    } catch (error) {
      toast.error("Dosya okunamadı: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const importAppointments = async (data) => {
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    let services = [];
    try {
      // Get all services first
      // const servicesResponse = await axios.get(`${API}/services`); // ESKİ
      const servicesResponse = await api.get("/services"); // YENİ
      services = servicesResponse.data;
    } catch (error) {
       toast.error("Hizmetler yüklenemedi, içe aktarma durduruldu.");
       setLoading(false);
       return;
    }


    for (const row of data) {
      try {
        // Parse Turkish date format (dd.MM.yyyy)
        const dateParts = row.Tarih?.split('.');
        if (!dateParts || dateParts.length !== 3) {
          throw new Error('Geçersiz tarih formatı');
        }

        const appointmentDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;
        
        // Extract service name from "Müşteri Hizmet" column
        const fullText = row['Müşteri Hizmet'] || '';
        const serviceName = fullText.split(' Fatih')[0].trim();
        
        // Find matching service
        const service = services.find(s => 
          s.name.toLowerCase().includes(serviceName.toLowerCase()) ||
          serviceName.toLowerCase().includes(s.name.toLowerCase())
        );

        if (!service) {
          throw new Error(`Hizmet bulunamadı: ${serviceName}`);
        }

        // Extract customer name (first part before service name)
        const customerName = fullText.split(' ')[0] + ' ' + (fullText.split(' ')[1] || '');

        const appointmentData = {
          customer_name: customerName.trim(),
          phone: '0000000000', // Placeholder since phone not in appointments file
          address: '',
          service_id: service.id,
          appointment_date: appointmentDate,
          appointment_time: row.Saat || '10:00',
          notes: 'Excel dosyasından içe aktarıldı',
          // status: 'Tamamlandı' // Kaldırıldı. Backend (create_appointment) artık tarihi kontrol edip buna otomatik karar veriyor.
        };

        // await axios.post(`${API}/appointments`, appointmentData); // ESKİ
        await api.post("/appointments", appointmentData); // YENİ
        results.success++;
      } catch (error) {
        results.failed++;
        const detail = error.response?.data?.detail || error.message;
        results.errors.push(`Satır hatası: ${detail}`);
      }
    }

    setResults(results);
    toast.success(`${results.success} randevu içe aktarıldı`);
    if (results.failed > 0) {
      toast.warning(`${results.failed} randevu aktarılamadı`);
    }
    
    if (onImportComplete) {
      onImportComplete();
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
          Veri İçe Aktar
        </h2>
        <p className="text-sm text-gray-600 mt-1">Excel dosyalarınızı sisteme aktarın</p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Not:</strong> Excel dosyanızda şu sütunlar olmalı:
          <ul className="list-disc list-inside mt-2 space-y-1">
            <li>Tarih (dd.MM.yyyy formatında)</li>
            <li>Saat (HH:mm formatında)</li>
            <li>Müşteri Hizmet (Müşteri adı ve hizmet bilgisi)</li>
          </ul>
        </AlertDescription>
      </Alert>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-500" />
              Randevuları İçe Aktar
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Randevular.xlsx dosyanızı seçin
            </p>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => handleFileUpload(e, 'appointments')}
              disabled={loading}
              className="hidden"
              id="appointment-file-input"
              data-testid="appointment-file-input"
            />
            <label htmlFor="appointment-file-input">
              <Button
                disabled={loading}
                className="cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('appointment-file-input').click();
                }}
              >
                <Upload className="w-4 h-4 mr-2" />
                {loading ? 'Yükleniyor...' : 'Dosya Seç'}
              </Button>
            </label>
          </div>
        </div>
      </Card>

      {results && (
        <Alert className={results.failed === 0 ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}>
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-semibold">
                İçe Aktarma Tamamlandı
              </p>
              <p>✅ Başarılı: {results.success}</p>
              {results.failed > 0 && (
                <>
                  <p>❌ Başarısız: {results.failed}</p>
                  {results.errors.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-sm">Hataları Göster</summary>
                      <ul className="list-disc list-inside mt-2 text-sm max-h-40 overflow-y-auto">
                        {results.errors.slice(0, 10).map((error, idx) => (
                          <li key={idx}>{error}</li>
                        ))}
                        {results.errors.length > 10 && (
                          <li>... ve {results.errors.length - 10} hata daha</li>
                        )}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default ImportData;