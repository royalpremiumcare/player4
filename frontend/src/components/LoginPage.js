import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, Lock, User } from 'lucide-react';

const LoginPage = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const { login } = useAuth();

  // Sayfa yüklendiğinde en üste scroll et ve animasyon için state
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(username, password, rememberMe);

      if (!result.success) {
        setError(result.error || 'Kullanıcı adı veya parola hatalı.');
        setLoading(false);
      } else {
        // Başarılı giriş - token storage'a kaydedildi
        // Tam sayfa yönlendirmesi yaparak state güncellemesi sorununu çözüyoruz
        // Sayfa yenilendiğinde AuthContext'teki useEffect storage'dan token'ı okuyacak
        window.location.href = '/dashboard';
      }
    } catch (err) {
      setError(err.message || 'Giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.');
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen md:min-h-screen bg-white animate-slide-down py-4 md:py-0">
      <div className="w-full max-w-md px-4">
        {/* Logo & Title */}
        <div className="text-center mb-4 md:mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">PLANN</h1>
          <p className="text-gray-600">Randevu Yönetim Sistemi</p>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="space-y-1 pb-4 md:pb-6">
            <CardTitle className="text-2xl font-bold text-center text-gray-900">
              Giriş Yap
            </CardTitle>
            <p className="text-center text-sm text-gray-600">
              Hesabınıza giriş yaparak devam edin
            </p>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
              <div className="space-y-2">
                <Label htmlFor="username" className="text-sm font-semibold text-gray-700">
                  E Posta
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="username"
                    type="email"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ornek@email.com"
                    className="pl-10 h-12 border-2 focus:border-gray-900"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                  Parola
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10 h-12 border-2 focus:border-gray-900"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-gray-900 border-gray-300 rounded focus:ring-gray-900 focus:ring-2"
                />
                <Label htmlFor="rememberMe" className="text-sm text-gray-700 cursor-pointer">
                  Beni Hatırla
                </Label>
              </div>

              {error && (
                <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-full shadow-lg transition-all duration-200" 
                disabled={loading}
              >
                {loading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
              </Button>
              
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/forgot-password')}
                className="w-full h-12 border-2 border-gray-300 text-gray-700 hover:bg-gray-50 hover:border-gray-400 font-semibold rounded-full transition-all duration-200"
              >
                Şifremi Unuttum
              </Button>
            </form>

            <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600 mb-3">Henüz hesabınız yok mu?</p>
              <Button
                variant="outline"
                onClick={() => navigate('/register')}
                className="w-full h-12 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white font-semibold rounded-full transition-all duration-200"
              >
                Yeni Hesap Oluştur
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-4 md:mt-6 mb-4 md:mb-0">
          <Button
            variant="outline"
            onClick={() => navigate('/')}
            className="text-gray-900 hover:text-white hover:bg-gray-900 border-2 border-gray-900 px-6 py-3 text-base md:text-lg font-semibold rounded-lg transition-all duration-200 shadow-md"
          >
            ← Ana Sayfaya Dön
          </Button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;