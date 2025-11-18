import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Check, Menu, X, Clock, Users, Smartphone, BarChart3, Bell, Shield, Zap, TrendingUp, Star, MessageSquare, FileText, UserCheck, CircleDollarSign, ChevronDown, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : "";

// Public endpoint için axios instance (token gerektirmez)
const publicApi = axios.create({
  baseURL: `${BACKEND_URL}/api`,
});

const LandingPage = () => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    phone: "",
    email: "",
    message: ""
  });
  const [contactFormLoading, setContactFormLoading] = useState(false);
  const [contactFormSuccess, setContactFormSuccess] = useState(false);
  // Animasyonlu kelimeler
  const words = ["Hızlı", "Pratik", "Kolay", "Hesaplı"];
  const [wordIndex, setWordIndex] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => {
      // Kelime değiştir (fade efekti olmadan direkt değişim)
      setWordIndex((prev) => (prev + 1) % words.length);
    }, 900); // Her 0.9 saniyede bir değiş
    
    return () => clearInterval(interval);
  }, []);

  // Modal açıldığında sayfayı en üste scroll et (mobil Chrome için)
  useEffect(() => {
    if (contactModalOpen) {
      // Kısa bir gecikme ile scroll et (modal render olana kadar bekle)
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        // Mobil Chrome için ekstra güvence
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }, 100);
    }
  }, [contactModalOpen]);
  
  // Sayfa yüklendiğinde scroll'u en üste al (mobil ve masaüstü için)
  useEffect(() => {
    window.scrollTo(0, 0);
    
    // iOS Chrome için footer alt boşluğu düzeltmesi
    const isIOSChrome = /CriOS/i.test(navigator.userAgent);
    if (isIOSChrome) {
      const removeBottomSpace = () => {
        const footer = document.querySelector('.landing-footer');
        if (footer) {
          footer.style.paddingBottom = '0';
          footer.style.marginBottom = '0';
          const lastChild = footer.querySelector('div:last-child > div:last-child');
          if (lastChild) {
            lastChild.style.paddingBottom = '0';
            lastChild.style.marginBottom = '0';
          }
        }
        document.body.style.paddingBottom = '0';
        document.body.style.marginBottom = '0';
        document.documentElement.style.paddingBottom = '0';
        document.documentElement.style.marginBottom = '0';
      };
      
      removeBottomSpace();
      setTimeout(removeBottomSpace, 100);
      setTimeout(removeBottomSpace, 500);
      window.addEventListener('resize', removeBottomSpace);
      
      return () => {
        window.removeEventListener('resize', removeBottomSpace);
      };
    }
  }, []);

  // Smooth scroll için anchor link click handler - Scroll offset düzeltmesi
  useEffect(() => {
    const handleAnchorClick = (e) => {
      const anchor = e.target.closest('a[href^="#"]');
      if (anchor) {
        const href = anchor.getAttribute('href');
        if (href && href.startsWith('#') && href !== '#') {
          e.preventDefault();
          const targetId = href.substring(1);
          const targetElement = document.getElementById(targetId);
          if (targetElement) {
            const headerOffset = 80; // Header yüksekliği için offset
            const elementPosition = targetElement.getBoundingClientRect().top;
            const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

            window.scrollTo({
              top: Math.max(0, offsetPosition), // Negatif değerleri önle
              behavior: 'smooth'
            });
          }
        }
      }
    };

    // Event delegation kullanarak tüm anchor linklere listener ekle
    document.addEventListener('click', handleAnchorClick);

    return () => {
      document.removeEventListener('click', handleAnchorClick);
    };
  }, []);

  const features = [
    {
      icon: MessageSquare,
      title: "Otomatik SMS ve Hatırlatma",
      description: "Randevu öncesi otomatik SMS ile hatırlatma gönderin, unutulan randevulara son verin."
    },
    {
      icon: Calendar,
      title: "Online Randevu Sistemi",
      description: "Müşterilerinizin randevularını online olarak kendilerinin oluşturmasını sağlayın."
    },
    {
      icon: Clock,
      title: "Periyodik Seans Yönetimi",
      description: "Müşterilerinize periyodik olarak tekrar eden randevular oluşturup seansları takip edin."
    },
    {
      icon: Users,
      title: "Müşteri Yönetimi",
      description: "Sınırsız sayıda müşteri ekleyip sonraki randevularını kolayca oluşturun ve yönetin."
    },
    {
      icon: Calendar,
      title: "Detaylı Takvim Yönetimi",
      description: "Randevularınızı günlük, haftalık, aylık olarak takvim üzerinden detaylı takip edip yönetin."
    },
    {
      icon: UserCheck,
      title: "Personel Yönetimi",
      description: "Sınırsız sayıda personel ekleyip randevularını ve istatistiklerini kolayca takip edin."
    },
    {
      icon: Smartphone,
      title: "Çoklu Cihaz Desteği",
      description: "Bilgisayar, telefon ve tablet üzerinden tüm randevularınıza her yerden erişin."
    },
    {
      icon: CircleDollarSign,
      title: "Gelir Gider Yönetimi",
      description: "İşletmenize ait gelir giderleri takip edip ön muhasebe sisteminden faydalanın."
    },
    {
      icon: BarChart3,
      title: "Raporlama & İstatistikler",
      description: "Müşteri, personel ve hizmet istatistiklerinizi görüntüleyin. Gelir giderlerinizi takip edin."
    }
  ];

  const testimonials = [
    {
      name: "Ayşe K.",
      role: "Güzellik Salonu",
      content: "PLANN ile randevularımız hiç karışmıyor. Hatırlatma SMS'lerini müşterilerimiz çok beğeniyor."
    },
    {
      name: "Mehmet D.",
      role: "Diyetisyen",
      content: "Arayüz çok sade, her şey yerli yerinde. Takvim özelliği hayat kurtarıyor."
    },
    {
      name: "Elif T.",
      role: "Kuaför",
      content: "Personel yönetimi sayesinde hangi çalışanın hangi saatte ne işi var görebiliyorum."
    },
    {
      name: "Serkan B.",
      role: "Psikolog",
      content: "PLANN, zaman yönetimimizi tamamen değiştirdi. İnanılmaz pratik."
    },
    {
      name: "Merve Y.",
      role: "Estetisyen",
      content: "Müşteri sayımız arttıkça PLANN ile kontrolü sağlamak çok daha kolaylaştı."
    },
    {
      name: "Zeynep A.",
      role: "Veteriner",
      content: "Hem masaüstü hem telefonda çok güzel çalışıyor. Müşterilerim de çok memnun."
    }
  ];

  const [plans, setPlans] = useState([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    // Backend'den planları çek
    const fetchPlans = async () => {
      try {
        const response = await publicApi.get('/plans');
        // Trial hariç tüm planları al (Trial sadece kayıt sonrası)
        const paidPlans = (response.data.plans || []).filter(p => p.id !== 'tier_trial');
        setPlans(paidPlans);
      } catch (error) {
        console.error('Planlar yüklenemedi:', error);
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, []);

  const faqs = [
    {
      question: "PLANN nedir ve nasıl çalışır?",
      answer: "PLANN, işletmelerin randevularını kolayca yönetmesini sağlayan çevrim içi bir sistemdir. Kullanıcı panelinden müşteri, personel ve randevu işlemlerini zahmetsizce gerçekleştirebilirsiniz."
    },
    {
      question: "Nasıl üye olabilirim?",
      answer: "PLANN'a üye olmak için Hemen Başla butonuna tıklayarak firma kaydınızı kolayca oluşturabilirsiniz."
    },
    {
      question: "Ücretsiz deneme süresi var mı?",
      answer: "Evet, PLANN'ı 7 gün boyunca ücretsiz olarak deneyebilirsiniz. Deneme süresi sonunda dilediğiniz paketi seçerek devam edebilirsiniz."
    },
    {
      question: "Randevu limitini aşarsam ne olur?",
      answer: "Seçtiğiniz pakette belirtilen randevu limitini aştığınızda yeni randevu oluşturamazsınız. Daha yüksek limitli bir pakete geçerek devam edebilirsiniz."
    },
    {
      question: "Fatura ve ödeme işlemleri nasıl ilerliyor?",
      answer: "Tüm ödemeler güvenli altyapılar üzerinden online olarak yapılır ve her ay otomatik fatura oluşturulur. Faturalara panelinizden ulaşabilirsiniz."
    },
    {
      question: "Sistemi mobil cihazlarda kullanabilir miyim?",
      answer: "Evet, PLANN mobil uyumludur. Hem cep telefonlarında hem de tabletlerde sorunsuz çalışır."
    },
    {
      question: "Personel hesabı ekleyebilir miyim?",
      answer: "Evet, her paket belirli sayıda personel hesabı eklemenize olanak tanır. Genişletmek için üst paketlere geçebilirsiniz."
    },
    {
      question: "Müşterilerime hatırlatma SMS'i gönderiliyor mu?",
      answer: "Evet, PLANN sayesinde randevuyu ilk oluşturduğunuzda bilgi SMS'i gönderilir. Ayrıca randevudan 2 saat önce hatırlatma SMS'i otomatik olarak müşterilerinize gönderilir."
    },
    {
      question: "Müşteri bilgilerimi dışa aktarabilir miyim?",
      answer: "Evet, müşteri bilgilerinizi Excel formatında dışa aktarabilirsiniz."
    },
    {
      question: "Teknik destek sunuyor musunuz?",
      answer: "Evet, destek ekibimiz hafta içi her gün size yardımcı olmaktan memnuniyet duyar. Panel içinden destek talebi oluşturabilirsiniz."
    },
    {
      question: "Verilerim güvende mi?",
      answer: "Evet, PLANN olarak tüm verilerinizi güvenli sunucularda şifreli şekilde saklıyoruz. Verileriniz 3. taraflarla paylaşılmaz."
    }
  ];

  return (
    <div className="min-h-screen bg-[#f5f1e8] landing-page-container">
      {/* Banner - Full Width Top (Mobilde header üstünde, Desktop'ta header altında) */}
      <div className="w-full bg-gray-900 text-white py-2 md:hidden">
        <div className="container mx-auto px-4 text-center">
          <span className="text-sm font-medium">
            Yeni üye işyerlerine özel ilk ay %25 indirim !
          </span>
        </div>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 bg-[#f5f1e8] border-b border-gray-200 shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <span className="text-2xl font-bold text-gray-900">
                PLANN
              </span>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Özellikler</a>
              <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Fiyatlar</a>
              <a href="#testimonials" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Yorumlar</a>
              <a href="#faq" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">SSS</a>
            </nav>

            {/* Desktop Buttons */}
            <div className="hidden md:flex items-center gap-4">
              <Button variant="ghost" onClick={() => navigate("/login")} className="font-medium">
                Giriş Yap
              </Button>
              <Button onClick={() => navigate("/register")} className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-medium shadow-md">
                Hemen Başla
              </Button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          {mobileMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <nav className="flex flex-col gap-4">
                <a href="#features" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Özellikler</a>
                <a href="#pricing" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Fiyatlar</a>
                <a href="#testimonials" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">Yorumlar</a>
                <a href="#faq" className="text-gray-600 hover:text-blue-600 transition-colors font-medium">SSS</a>
                <div className="flex flex-col gap-2 pt-4 border-t border-gray-200">
                  <Button variant="outline" onClick={() => navigate("/login")} className="w-full">
                    Giriş Yap
                  </Button>
                  <Button onClick={() => navigate("/register")} className="w-full bg-gradient-to-r from-blue-500 to-indigo-600">
                    Hemen Başla
                  </Button>
                </div>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Hero Section - Exact JetPlan Style */}
      <section className="relative pt-0 pb-8 md:pt-4 md:pb-20 bg-[#f5f1e8] overflow-hidden">
        {/* Banner - Desktop'ta Hero Section içinde */}
        <div className="hidden md:block w-full bg-gray-900 text-white py-2.5 mb-6">
          <div className="container mx-auto px-4 text-center">
            <span className="text-base font-medium">
              Yeni üye işyerlerine özel ilk ay %25 indirim !
            </span>
          </div>
        </div>
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight flex flex-col md:flex-row items-center justify-center gap-2 md:gap-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              <span className="block md:inline-block whitespace-nowrap">PLANN ile</span>
              <span className="block md:inline-block bg-gray-900 text-white py-2 md:py-3 px-5 md:px-8 relative text-center whitespace-nowrap" style={{ minWidth: 'fit-content', width: 'fit-content', boxSizing: 'border-box' }}>
                <span className="block" style={{ whiteSpace: 'nowrap' }}>
                  {words[wordIndex]}
                </span>
              </span>
              <span className="block md:inline-block whitespace-nowrap">Randevu</span>
            </h1>
            
            <p className="text-xl md:text-2xl text-gray-700 mb-10 leading-relaxed">
              Hızlı, güvenilir ve kullanıcı dostu randevu yazılımı ile tanışın.<br/>
              İşletmeniz her an erişilebilir olsun.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
              <div className="flex flex-col items-center gap-2">
                <Button 
                  onClick={() => navigate("/register")}
                  className="bg-gray-900 text-white hover:bg-gray-800 px-10 py-6 text-lg font-semibold rounded-full shadow-lg"
                >
                  7 Gün Ücretsiz Deneyin
                </Button>
                <p className="text-base text-gray-600 text-center">
                  Kredi kartı gerekmez.
                </p>
              </div>
              <Button 
                variant="outline"
                onClick={() => {
                  // Mobil Chrome için sayfayı en üste scroll et
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  setTimeout(() => {
                    setContactModalOpen(true);
                  }, 150);
                }}
                className="bg-transparent border-2 border-gray-900 text-gray-900 hover:bg-gray-100 px-10 py-6 text-lg font-semibold rounded-full"
              >
                Sizi Arayalım
              </Button>
            </div>

            {/* Demo Image */}
            <div className="mt-16 relative">
              <div className="absolute bottom-6 right-6 bg-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-2 z-10 animate-bounce">
                <MessageSquare className="w-5 h-5 text-green-500" />
                <span className="text-sm font-semibold text-gray-700">7 Yeni Randevu</span>
              </div>
              <div className="bg-white rounded-2xl shadow-2xl p-4 border border-gray-200">
                <img 
                  src="https://customer-assets.emergentagent.com/job_16055e0a-771d-4ca0-9203-6958116f17b9/artifacts/1spiinqz_IMG_6383.jpeg" 
                  alt="PLANN Dashboard Önizleme" 
                  className="w-full h-auto rounded-xl"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof Section */}
      <section className="py-16 bg-[#f5f1e8] border-t border-gray-200">
        <div className="container mx-auto px-4">
          <div className="max-w-6xl mx-auto">
            {/* İstatistikler */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8 mb-12">
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">500+</div>
                <div className="text-gray-600 font-medium">Aktif İşletme</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">420K+</div>
                <div className="text-gray-600 font-medium">Randevu</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">4.8</div>
                <div className="flex items-center justify-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <div className="text-gray-600 font-medium">Kullanıcı Puanı</div>
              </div>
              <div className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-gray-900 mb-2">%98</div>
                <div className="text-gray-600 font-medium">Memnuniyet</div>
              </div>
            </div>

            {/* Güven Göstergeleri */}
            <div className="flex flex-wrap items-center justify-center gap-6 md:gap-8 pt-8 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <Shield className="w-6 h-6 text-green-500" />
                <span className="text-gray-700 font-medium">SSL Güvenli</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-6 h-6 text-green-500" />
                <span className="text-gray-700 font-medium">KVKK Uyumlu</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-blue-500" />
                <span className="text-gray-700 font-medium">7/24 Destek</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-6 h-6 text-yellow-500" />
                <span className="text-gray-700 font-medium">99.9% Uptime</span>
              </div>
            </div>

            {/* Müşteri Kategorileri */}
            <div className="mt-12 pt-8 border-t border-gray-200">
              <p className="text-center text-gray-600 mb-6 font-medium">Bize Güvenen İşletmeler</p>
              <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
                <Card className="px-6 py-3 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-gray-700 font-semibold text-sm md:text-base">Kuaför Salonları</span>
                </Card>
                <Card className="px-6 py-3 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-gray-700 font-semibold text-sm md:text-base">Sağlık Merkezleri</span>
                </Card>
                <Card className="px-6 py-3 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-gray-700 font-semibold text-sm md:text-base">Eğitim Kurumları</span>
                </Card>
                <Card className="px-6 py-3 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-gray-700 font-semibold text-sm md:text-base">Veteriner Klinikleri</span>
                </Card>
                <Card className="px-6 py-3 bg-white border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
                  <span className="text-gray-700 font-semibold text-sm md:text-base">Spa & Wellness</span>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-[#f5f1e8] border-t border-gray-200 scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">PLANN Neler Sunar?</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="p-6 hover:shadow-xl transition-all duration-300 border hover:border-blue-300 bg-white">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.description}</p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 bg-[#f5f1e8] scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">Fiyatlandırma</h2>
            {/* Yeni Üye İndirimi Banner */}
            <div className="inline-block mb-6 px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded">
              Yeni üye işyerlerine özel ilk ay %25 indirim !
            </div>
          </div>

          {loadingPlans ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto"></div>
              <p className="mt-4 text-gray-600">Planlar yükleniyor...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-5 lg:gap-6 max-w-6xl mx-auto">
              {plans.map((plan, index) => {
                const isPopular = plan.id === 'tier_4_business'; // Business paketi popüler
                const discountedPrice = plan.price_monthly_discounted || plan.price_monthly;
                const originalPrice = plan.price_monthly_original || plan.price_monthly;
                const hasDiscount = plan.price_monthly_discounted && plan.price_monthly_discounted < plan.price_monthly_original;
                
                return (
                  <Card 
                    key={plan.id} 
                    className={`p-3 md:p-4 lg:p-6 relative bg-white border-4 border-blue-500 shadow-2xl flex flex-col h-full ${isPopular ? 'md:transform md:scale-105' : ''}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-2 md:-top-2.5 left-1/2 transform -translate-x-1/2 z-10">
                        <span className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-2.5 md:px-3 lg:px-4 py-0.5 md:py-1 rounded-full text-sm md:text-sm font-bold shadow-lg">
                          Popüler
                        </span>
                      </div>
                    )}
                    
                    {/* Paket Adı */}
                    <div className="mb-2">
                      <h3 className="text-2xl md:text-xl lg:text-2xl font-bold text-gray-900">{plan.name}</h3>
                    </div>
                    
                    {/* Fiyat Bölümü */}
                    <div className="mb-2 md:mb-3 pb-2 md:pb-3 border-b border-gray-200">
                      <div className="flex items-baseline gap-1 md:gap-2">
                        {hasDiscount && (
                          <>
                            <span className="text-4xl md:text-3xl lg:text-4xl font-bold text-gray-900">{discountedPrice.toLocaleString('tr-TR')}</span>
                            <span className="text-xl md:text-lg lg:text-xl text-gray-600">₺</span>
                            <span className="text-base md:text-sm lg:text-base line-through text-gray-400 ml-2">{originalPrice.toLocaleString('tr-TR')}₺</span>
                          </>
                        )}
                        {!hasDiscount && (
                          <>
                            <span className="text-4xl md:text-3xl lg:text-4xl font-bold text-gray-900">{plan.price_monthly.toLocaleString('tr-TR')}</span>
                            <span className="text-xl md:text-lg lg:text-xl text-gray-600 ml-1">₺</span>
                          </>
                        )}
                      </div>
                      <div className="text-gray-500 text-base md:text-sm lg:text-base mt-0.5">Aylık</div>
                    </div>
                    
                    {/* Hedef Kitle Açıklaması - Çerçeveli ve Animasyonlu */}
                    <div className="mb-2 md:mb-3">
                      <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-black rounded-lg px-2.5 py-2.5 md:p-3 shadow-sm animate-pulse-glow" style={{ willChange: 'box-shadow', backfaceVisibility: 'hidden' }}>
                        <p className="text-sm md:text-sm text-gray-800 leading-snug font-medium">
                        {plan.target_audience_tr}
                      </p>
                      </div>
                    </div>
                    
                    {/* Özellikler Listesi - Randevu Limiti En Başta, Kompakt */}
                    <div className="mb-2 md:mb-3 flex-grow">
                      <h4 className="text-base md:text-sm font-medium text-gray-600 mb-2 md:mb-3 tracking-normal">Paket İçerikleri</h4>
                      <ul className="space-y-1 md:space-y-1.5">
                        {/* Randevu Limiti - En Başta */}
                        <li className="flex items-start gap-2">
                          <Check className="w-5 h-5 md:w-4 md:h-4 text-green-500 flex-shrink-0 mt-0.5" />
                          <span className="text-gray-900 text-base md:text-sm leading-snug font-medium">
                            {plan.quota_monthly_appointments.toLocaleString('tr-TR')} Randevu / Aylık
                          </span>
                        </li>
                        {/* Diğer Özellikler */}
                        {plan.features
                          .filter(feature => {
                            const quotaStr = plan.quota_monthly_appointments.toLocaleString('tr-TR');
                            const featureLower = feature.toLowerCase();
                            return !(feature.includes(quotaStr) && featureLower.includes('randevu'));
                          })
                          .map((feature, i) => (
                            <li key={i} className="flex items-start gap-2">
                              <Check className="w-5 h-5 md:w-4 md:h-4 text-green-500 flex-shrink-0 mt-0.5" />
                              <span className="text-gray-900 text-base md:text-sm leading-snug font-medium">{feature}</span>
                            </li>
                          ))}
                      </ul>
                    </div>
                    
                    {/* CTA Button */}
                    <Button 
                      onClick={() => navigate("/register")}
                      className={`w-full py-2.5 md:py-2.5 text-base md:text-sm font-semibold mt-auto ${isPopular ? 'bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700' : 'bg-gray-800 hover:bg-gray-900'}`}
                    >
                      Hemen Başla
                    </Button>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonials" className="py-20 bg-[#f5f1e8] scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Kullanıcı Yorumları</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="p-6 hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-white to-gray-50 border-l-4 border-blue-500">
                <div className="flex items-center gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="text-gray-700 mb-4 italic">"{testimonial.content}"</p>
                <div className="border-t pt-4">
                  <h4 className="font-bold text-gray-900">{testimonial.name}</h4>
                  <p className="text-sm text-gray-600">{testimonial.role}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 bg-[#f5f1e8] border-t border-gray-200 scroll-mt-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">Sık Sorulan Sorular</h2>
          </div>

          <div className="max-w-3xl mx-auto space-y-3">
            {faqs.map((faq, index) => (
              <Card key={index} className="overflow-hidden">
                <button
                  onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-lg font-bold text-gray-900 pr-4">{faq.question}</h3>
                  <ChevronDown 
                    className={`w-5 h-5 text-gray-600 flex-shrink-0 transition-transform duration-300 ${
                      openFaqIndex === index ? 'transform rotate-180' : ''
                    }`}
                  />
                </button>
                {openFaqIndex === index && (
                  <div className="px-6 pb-6 text-gray-600 border-t">
                    <p className="pt-4">{faq.answer}</p>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-[#f5f1e8]">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
            Hemen Başlayın!
          </h2>
          <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto">
            Randevularınızı profesyonelce yönetin ve işinizi büyütün
          </p>
          <Button 
            onClick={() => navigate("/register")}
            className="bg-gray-900 text-white hover:bg-gray-800 px-10 py-6 text-lg font-semibold rounded-full shadow-xl"
          >
            Ücretsiz Deneyin
          </Button>
        </div>
      </section>

      {/* Contact Modal */}
      <Dialog open={contactModalOpen} onOpenChange={setContactModalOpen}>
        <DialogContent className="w-[95vw] max-w-[520px] h-[90vh] max-h-[650px] md:h-auto bg-white border-0 p-0 rounded-2xl shadow-2xl overflow-hidden">
          <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 px-6 pt-8 pb-6">
            <button
              onClick={() => setContactModalOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 transition-colors"
            >
              <X className="w-5 h-5 text-gray-600" />
            </button>
            <DialogHeader>
              <DialogTitle className="text-2xl md:text-3xl font-bold text-gray-900 text-center pr-8" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Sizi Arayalım
              </DialogTitle>
              <DialogDescription className="text-center text-gray-600 text-sm mt-2">
                İletişim bilgilerinizi bırakın, size en kısa sürede ulaşalım.
              </DialogDescription>
            </DialogHeader>
          </div>
          
          {contactFormSuccess ? (
            <div className="px-6 py-10 md:py-12 text-center bg-white flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Check className="w-12 h-12 text-white" />
              </div>
              <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
                Talebiniz Alındı!
              </h3>
              <p className="text-gray-600 mb-8 text-base max-w-sm">
                En kısa sürede sizinle iletişime geçeceğiz.
              </p>
              <Button 
                onClick={() => {
                  setContactModalOpen(false);
                  setContactFormSuccess(false);
                  setContactForm({ name: "", phone: "", email: "", message: "" });
                }}
                className="bg-gray-900 text-white hover:bg-gray-800 px-10 py-6 rounded-full font-semibold text-base shadow-lg transition-all hover:scale-105"
              >
                Tamam
              </Button>
            </div>
          ) : (
            <form 
              onSubmit={async (e) => {
                e.preventDefault();
                setContactFormLoading(true);
                
                try {
                  const response = await publicApi.post('/contact', {
                    name: contactForm.name,
                    phone: contactForm.phone,
                    email: contactForm.email || null,
                    message: contactForm.message || null
                  });
                  
                  if (response.data.success) {
                    setContactFormSuccess(true);
                    toast.success("Talebiniz alındı!");
                  } else {
                    toast.error("Bir hata oluştu, lütfen tekrar deneyin");
                  }
                } catch (error) {
                  console.error("Contact form error:", error);
                  toast.error(error.response?.data?.detail || "Bir hata oluştu, lütfen tekrar deneyin");
                } finally {
                  setContactFormLoading(false);
                }
              }}
              className="px-6 py-6 space-y-5 bg-white overflow-y-auto max-h-[calc(90vh-200px)] md:max-h-none"
            >
              <div className="space-y-2">
                <Input
                  id="contact-name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                  placeholder="Ad Soyad"
                  required
                  className="h-14 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:ring-0 bg-gray-50 focus:bg-white transition-all text-base placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Input
                  id="contact-phone"
                  type="tel"
                  value={contactForm.phone}
                  onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                  placeholder="Telefon Numarası"
                  required
                  className="h-14 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:ring-0 bg-gray-50 focus:bg-white transition-all text-base placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Input
                  id="contact-email"
                  type="email"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                  placeholder="E-posta (Opsiyonel)"
                  className="h-14 border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:ring-0 bg-gray-50 focus:bg-white transition-all text-base placeholder:text-gray-400"
                />
              </div>

              <div className="space-y-2">
                <Textarea
                  id="contact-message"
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                  placeholder="Mesajınız (Opsiyonel)"
                  rows={4}
                  className="border-2 border-gray-200 rounded-xl focus:border-gray-900 focus:ring-0 bg-gray-50 focus:bg-white transition-all resize-none text-base placeholder:text-gray-400 min-h-[120px]"
                />
              </div>

              <div className="pt-2">
                <Button
                  type="submit"
                  disabled={contactFormLoading}
                  className="w-full bg-gray-900 text-white hover:bg-gray-800 px-8 py-6 rounded-full font-semibold text-base shadow-lg transition-all hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                  {contactFormLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Gönderiliyor...
                    </>
                  ) : (
                    <>
                      <Phone className="w-5 h-5 mr-2" />
                      Gönder
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-start gap-2 text-xs text-gray-500 pt-2 pb-2">
                <Shield className="w-4 h-4 mt-0.5 flex-shrink-0 text-gray-400" />
                <span className="leading-relaxed">Bilgileriniz güvende, sadece sizinle iletişim için kullanılacak.</span>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <footer className="bg-[#f5f1e8] text-gray-700 py-12 pb-0 md:pb-12 landing-footer">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <div className="mb-4">
                <span className="text-2xl font-bold text-gray-900">PLANN</span>
              </div>
              <p className="text-sm text-gray-600">Modern randevu yönetim sistemi</p>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Ürün</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-gray-900 text-gray-600">Özellikler</a></li>
                <li><a href="#pricing" className="hover:text-gray-900 text-gray-600">Fiyatlar</a></li>
                <li><a href="#testimonials" className="hover:text-gray-900 text-gray-600">Yorumlar</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">Destek</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#faq" className="hover:text-gray-900 text-gray-600">SSS</a></li>
                <li><a href="#" className="hover:text-gray-900 text-gray-600">İletişim</a></li>
                <li><a href="#" className="hover:text-gray-900 text-gray-600">Yardım</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-gray-900 mb-4">İletişim</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-2">
                  <Phone className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>0543 479 3213</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mail className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>info@plann.co</span>
                </li>
                <li className="flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>2000 Evler Mahallesi, Şehit Polis Murat Hamleci Sk. No:12 Kat:3 Daire:32<br />Nevşehir Merkez</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-300 mt-8 pt-8">
            {/* Ödeme Logoları */}
            <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
              <span className="text-gray-600 text-sm font-medium mr-1">Güvenli Ödeme:</span>
              {/* Visa */}
              <div className="bg-white px-4 py-2.5 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-all flex items-center justify-center h-10">
                <span className="text-[#1434CB] font-bold text-lg tracking-wider">VISA</span>
              </div>
              {/* Mastercard */}
              <div className="bg-white px-4 py-2.5 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-all flex items-center justify-center h-10">
                <div className="flex items-center gap-1">
                  <div className="w-6 h-6 rounded-full bg-[#EB001B]"></div>
                  <div className="w-6 h-6 rounded-full bg-[#F79E1B] -ml-3"></div>
                </div>
              </div>
              {/* Troy */}
              <div className="bg-[#1E1E1E] px-4 py-2.5 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-all flex items-center justify-center h-10">
                <span className="text-white font-bold text-sm tracking-wider">TROY</span>
              </div>
              {/* American Express */}
              <div className="bg-[#006FCF] px-4 py-2.5 rounded-md shadow-sm border border-gray-200 hover:shadow-md transition-all flex items-center justify-center h-10">
                <span className="text-white font-bold text-xs tracking-wide">AMEX</span>
              </div>
            </div>
            <div className="text-center text-sm text-gray-600 pb-0 mb-0">
              <p className="mb-0 pb-0">© 2025 PLANN - Tüm hakları saklıdır</p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
