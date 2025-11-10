import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, User, Mail, Lock, ArrowRight, Phone } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from '@/components/ui/card';

const RegisterPage = () => { 
    const navigate = useNavigate();
    const { register } = useAuth(); 

    const [formData, setFormData] = useState({
        username: '',
        password: '',
        full_name: '',
        organization_name: '',
        support_phone: '',
        sector: ''
    });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        
        console.log('🚀 Kayıt işlemi başlıyor...', formData);

        try {
            const result = await register(
                formData.username, 
                formData.password, 
                formData.full_name, 
                formData.organization_name,
                formData.support_phone,
                formData.sector
            );
            
            console.log('📦 Register result:', result);

            if (result.success) {
                toast.success('Kayıt başarılı! Şimdi giriş yapabilirsiniz.');
                navigate('/login'); 
            } else {
                console.error('❌ Kayıt hatası:', result.error);
                toast.error(result.error || 'Kayıt sırasında bir hata oluştu.');
            }
        } catch (error) {
            console.error('💥 Kayıt exception:', error);
            toast.error('Kayıt sırasında beklenmedik bir hata oluştu.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex justify-center items-center min-h-screen bg-gradient-to-br from-[#f5f1e8] to-[#e8e0d5] p-4">
            <Toaster position="top-center" richColors />
            <div className="w-full max-w-md">
                {/* Logo & Title */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">PLANN</h1>
                    <p className="text-gray-600">Randevu Yönetim Sistemi</p>
                </div>

                <Card className="shadow-2xl border-0">
                    <CardHeader className="space-y-1 pb-6">
                        <CardTitle className="text-2xl font-bold text-center text-gray-900">
                            Yeni Hesap Oluştur
                        </CardTitle>
                        <CardDescription className="text-center">
                            İşletmenizi yönetmek için hemen başlayın
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleRegister} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="organization_name" className="text-sm font-semibold text-gray-700">
                                    İşletme Adı
                                </Label>
                                <div className="relative">
                                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        id="organization_name"
                                        name="organization_name"
                                        type="text"
                                        value={formData.organization_name}
                                        onChange={handleChange}
                                        placeholder="İşletme Adınız"
                                        className="pl-10 h-12 border-2 focus:border-gray-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="full_name" className="text-sm font-semibold text-gray-700">
                                    Ad Soyad
                                </Label>
                                <div className="relative">
                                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        id="full_name"
                                        name="full_name"
                                        type="text"
                                        value={formData.full_name}
                                        onChange={handleChange}
                                        placeholder="Adınız Soyadınız"
                                        className="pl-10 h-12 border-2 focus:border-gray-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="username" className="text-sm font-semibold text-gray-700">
                                    E-posta
                                </Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        id="username"
                                        name="username"
                                        type="email"
                                        value={formData.username}
                                        onChange={handleChange}
                                        placeholder="E-posta"
                                        className="pl-10 h-12 border-2 focus:border-gray-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="support_phone" className="text-sm font-semibold text-gray-700">
                                    Destek Telefon Numarası
                                </Label>
                                <div className="relative">
                                    <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        id="support_phone"
                                        name="support_phone"
                                        type="tel"
                                        value={formData.support_phone}
                                        onChange={handleChange}
                                        placeholder="05XXXXXXXXX"
                                        className="pl-10 h-12 border-2 focus:border-gray-900"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                                    Şifre
                                </Label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                                    <Input
                                        id="password"
                                        name="password"
                                        type="password"
                                        value={formData.password}
                                        onChange={handleChange}
                                        placeholder="••••••••"
                                        className="pl-10 h-12 border-2 focus:border-gray-900"
                                        required
                                    />
                                </div>
                            </div>

                            <Button 
                                type="submit" 
                                className="w-full h-12 bg-gray-900 hover:bg-gray-800 text-white font-semibold rounded-full shadow-lg transition-all duration-200" 
                                disabled={loading}
                            >
                                {loading ? 'Kayıt Olunuyor...' : 'Hesap Oluştur'}
                            </Button>
                        </form>

                        <div className="mt-6 pt-6 border-t border-gray-200 text-center">
                            <p className="text-sm text-gray-600 mb-3">Zaten hesabınız var mı?</p>
                            <Button
                                variant="outline"
                                onClick={() => navigate('/login')}
                                className="w-full h-12 border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white font-semibold rounded-full transition-all duration-200"
                            >
                                Giriş Yap
                                <ArrowRight className="w-4 h-4 ml-2" />
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="text-center mt-6">
                    <Button
                        variant="ghost"
                        onClick={() => navigate('/')}
                        className="text-gray-600 hover:text-gray-900"
                    >
                        ← Ana Sayfaya Dön
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default RegisterPage;
