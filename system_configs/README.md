# Sistem Konfigürasyon Dosyaları

Bu klasör sistem seviyesi konfigürasyon dosyalarını içerir.

## Dosyalar

### backend.service
- **Konum:** `/etc/systemd/system/backend.service`
- **Açıklama:** Backend FastAPI uygulamasını çalıştıran systemd service dosyası
- **Kurulum:**
  ```bash
  sudo cp backend.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable backend
  sudo systemctl start backend
  ```

### nginx_royalkoltuk_dev.conf
- **Konum:** `/etc/nginx/sites-available/royalkoltuk_dev`
- **Açıklama:** Nginx reverse proxy ve static file serving konfigürasyonu
- **Özellikler:**
  - WebSocket proxy desteği
  - Static file serving
  - SSL ready
  - Cache kontrolü (development)
- **Kurulum:**
  ```bash
  sudo cp nginx_royalkoltuk_dev.conf /etc/nginx/sites-available/royalkoltuk_dev
  sudo ln -s /etc/nginx/sites-available/royalkoltuk_dev /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx
  ```

## Notlar

- `.env` dosyaları güvenlik nedeniyle bu klasörde saklanmaz
- Sistem dosyalarını değiştirdikten sonra ilgili servisleri restart edin
- Production ortamına geçerken port ve domain ayarlarını kontrol edin
