import { useState, useMemo } from "react";
import { ArrowLeft, Search, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { faqData } from "@/data/faqData";
import { useAuth } from "@/context/AuthContext";

const HelpCenter = ({ onNavigate }) => {
  const { userRole } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [openItems, setOpenItems] = useState({});

  // Rol bazlı FAQ verilerini al
  const faqs = useMemo(() => {
    if (userRole === "admin") {
      return faqData.admin || [];
    } else if (userRole === "staff" || userRole === "personnel") {
      return faqData.personnel || [];
    }
    return [];
  }, [userRole]);

  // Arama filtresi
  const filteredFaqs = useMemo(() => {
    if (!searchQuery.trim()) {
      return faqs;
    }
    const query = searchQuery.toLowerCase();
    return faqs.filter(
      (faq) =>
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query)
    );
  }, [faqs, searchQuery]);

  // Akordeon aç/kapa
  const toggleItem = (id) => {
    setOpenItems((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  return (
    <div
      className="min-h-screen bg-gray-50 pb-20"
      style={{ fontFamily: "Inter, sans-serif" }}
    >
      <div className="px-4 pt-6 pb-4">
        <Card className="bg-white shadow-md border border-gray-200 rounded-xl p-6">
          {/* Geri Dön Butonu */}
          <div className="mb-6">
            <button
              onClick={() => onNavigate && onNavigate("settings")}
              className="flex items-center gap-2 text-gray-700 hover:text-gray-900 mb-4 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Ayarlara Dön</span>
            </button>

            {/* Sayfa Başlığı */}
            <h2 className="text-xl font-bold text-gray-900 mb-6">
              Yardım Merkezi
            </h2>

            {/* Arama Çubuğu */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Sorunuzu arayın..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-800"
                style={{ fontFamily: "Inter, sans-serif" }}
              />
            </div>
          </div>

          {/* FAQ Listesi */}
          <div className="space-y-3">
            {filteredFaqs.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>Aradığınız soru bulunamadı.</p>
              </div>
            ) : (
              filteredFaqs.map((faq) => {
                const isOpen = openItems[faq.id];
                return (
                  <div key={faq.id} className="mb-3">
                    {/* Soru Butonu */}
                    <button
                      onClick={() => toggleItem(faq.id)}
                      className="w-full bg-white rounded-lg shadow-sm border border-gray-200 p-5 flex justify-between items-center hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="font-semibold text-gray-800 flex-1 pr-4">
                        {faq.question}
                      </span>
                      {isOpen ? (
                        <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                      )}
                    </button>

                    {/* Cevap Alanı */}
                    {isOpen && (
                      <div className="bg-white border-t border-gray-100 p-5 rounded-b-lg">
                        <div
                          className="text-gray-700 leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: faq.answer }}
                          style={{ fontFamily: "Inter, sans-serif" }}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default HelpCenter;

