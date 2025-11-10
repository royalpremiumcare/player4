import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : 'http://localhost:8001';

// BACKEND_URL kontrolü (sadece undefined ise uyar, empty string geçerli)
if (process.env.REACT_APP_BACKEND_URL === undefined) {
  console.warn('⚠️ REACT_APP_BACKEND_URL tanımlı değil! Varsayılan olarak http://localhost:8001 kullanılıyor.');
  console.warn('Lütfen frontend/.env dosyasında REACT_APP_BACKEND_URL değişkenini tanımlayın.');
}

// Yeni, önceden ayarlanmış bir 'axios' örneği (instance) oluşturuyoruz
const api = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

// === API REQUEST TUTAMAÇ (INTERCEPTOR) ===
// Her istekten önce token'ı Authorization başlığına ekler
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// === API RESPONSE TUTAMAÇ (INTERCEPTOR) ===
// 401 hatasında otomatik çıkış yapar
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // 401 Unauthorized hatası geldiğinde otomatik logout
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

export default api;
