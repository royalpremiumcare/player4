import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock, ArrowRight } from 'lucide-react';
import api from '../api/api';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // Sayfa yüklendiğinde en üste scroll et
  useEffect(() => {
    window.scrollTo(0, 0);
    if (!token) {
      setError('Geçersiz veya eksik token. Lütfen e-postanızdaki linki kullanın.');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Şifreler eşleşmiyor.');
      return;
    }

    if (password.length < 6) {
      setError('Şifre en az 6 karakter olmalıdır.');
      return;
    }

    if (!token) {
      setError('Geçersiz token.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/reset-password', {
        token: token,
        new_password: password
      });
      setSuccess(true);
    } catch (err) {
      const errorMessage = err.response?.data?.detail || 'Bir hata oluştu. Lütfen tekrar deneyin.';
      setError(errorMessage);
    } finally {
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
              Yeni Şifre Belirle
            </CardTitle>
            <p className="text-center text-sm text-gray-600">
              Yeni şifrenizi girin
            </p>
          </CardHeader>
          <CardContent className="px-4 md:px-6">
            {success ? (
              <div className="space-y-4">
                <div className="bg-green-50 border-l-4 border-green-500 p-4 rounded">
                  <p className="text-sm text-green-700">
                    Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-full shadow-lg transition-all duration-200"
                >
                  Giriş Yap
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4 md:space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                    Yeni Şifre
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
                      minLength={6}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-700">
                    Yeni Şifre (Tekrar)
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pl-10 h-12 border-2 focus:border-gray-900"
                      required
                      minLength={6}
                    />
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-full shadow-lg transition-all duration-200" 
                  disabled={loading || !token}
                >
                  {loading ? 'Sıfırlanıyor...' : 'Şifreyi Sıfırla'}
                </Button>
              </form>
            )}

            <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-gray-200 text-center">
              <Button
                variant="outline"
                onClick={() => navigate('/login')}
                className="w-full h-12 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white font-semibold rounded-full transition-all duration-200"
              >
                Giriş Sayfasına Dön
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

export default ResetPasswordPage;






