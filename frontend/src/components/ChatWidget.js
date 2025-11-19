import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Loader2, Mic, MicOff } from 'lucide-react';

const ChatWidget = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [usageInfo, setUsageInfo] = useState({ current: 0, limit: -1 }); // AI mesaj kullanım bilgisi
  const messagesEndRef = useRef(null);

  // Voice mode states
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const audioPlayerRef = useRef(null);

  // Kullanıcı rolüne göre örnek sorular
  const sampleQuestions = user?.role === 'admin' 
    ? [
        "Bugün durum ne? 📊",
        "Bu ay kaç randevumuz var?",
        "Personel performansı nasıl?",
        "Yarın için randevu oluştur 📅"
      ]
    : [
        "Bugün kaç randevum var?",
        "Bu ay ne kadar kazandım? 💸",
        "Yarınki randevularımı göster",
        "Sistem nasıl kullanılır?"
      ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      // İlk açılışta hoş geldin mesajı
      setMessages([{
        role: 'assistant',
        content: `Merhaba ${user?.full_name || user?.username}! 👋\n\nBen PLANN akıllı asistanınızım. Size nasıl yardımcı olabilirim?`
      }]);
    }
  }, [isOpen, messages.length, user]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Kullanıcı mesajını ekle
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: userMessage,
          history: chatHistory
        })
      });

      if (!response.ok) {
        throw new Error('AI yanıt veremedi');
      }

      const data = await response.json();
      
      // AI yanıtını ekle
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: data.message 
      }]);

      // Chat history'yi güncelle
      if (data.history) {
        setChatHistory(data.history);
      }

      // Kullanım bilgisini güncelle
      if (data.usage_info) {
        setUsageInfo(data.usage_info);
      }

    } catch (error) {
      console.error('AI chat error:', error);
      
      // Kota hatasını yakala
      if (error.message && error.message.includes('limitiniz doldu')) {
        setMessages([...newMessages, { 
          role: 'assistant', 
          content: '❌ Aylık AI kullanım limitiniz doldu. Kesintisiz hizmet için paketinizi yükseltin.' 
        }]);
      } else {
        setMessages([...newMessages, { 
          role: 'assistant', 
          content: '❌ Üzügünüm, bir hata oluştu. Lütfen tekrar deneyin.' 
        }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuestionClick = (question) => {
    setInputMessage(question);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Widget kapalıysa sadece butonu göster
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-6 z-50 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-110 group"
        aria-label="AI Asistan"
      >
        <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" />
        <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
          AI
        </span>
      </button>
    );
  }

  // Chat penceresi
  return (
    <div className="fixed bottom-24 right-6 z-50 w-96 max-w-[calc(100vw-2rem)] h-[600px] max-h-[calc(100vh-2rem)] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-5 h-5" />
            <div>
              <h3 className="font-semibold">PLANN Asistan</h3>
              <p className="text-xs opacity-90">AI destekli yardımcınız</p>
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Quota Gösterimi */}
        {usageInfo.limit === -1 ? (
          <div className="text-xs bg-yellow-400/20 text-yellow-100 px-2 py-1 rounded-lg flex items-center space-x-1">
            <Sparkles className="w-3 h-3" />
            <span>AI Erişiminiz: Sınırsız ✨</span>
          </div>
        ) : usageInfo.current >= usageInfo.limit * 0.9 ? (
          <div className="text-xs bg-orange-500/30 text-orange-100 px-2 py-1 rounded-lg">
            <span>⚠️ Kalan Hakkınız: {usageInfo.current} / {usageInfo.limit}</span>
          </div>
        ) : null}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                msg.role === 'user'
                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                  : 'bg-white text-gray-800 shadow-sm border border-gray-200'
              }`}
            >
              <div className="whitespace-pre-wrap break-words text-sm">
                {msg.content}
              </div>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            </div>
          </div>
        )}

        {/* Örnek Sorular - Sadece mesaj yoksa */}
        {messages.length <= 1 && !isLoading && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 text-center">Örnek sorular:</p>
            {sampleQuestions.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleQuestionClick(q)}
                className="w-full text-left text-sm bg-white hover:bg-purple-50 text-gray-700 rounded-xl px-4 py-2 border border-gray-200 hover:border-purple-300 transition-all"
              >
                {q}
              </button>
            ))}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        {usageInfo.limit !== -1 && usageInfo.current >= usageInfo.limit ? (
          // Limit doldu - Upgrade butonu göster
          <div className="text-center">
            <button
              onClick={() => window.location.href = '/subscribe'}
              className="w-full bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl px-4 py-3 hover:shadow-lg transition-all font-semibold"
            >
              Limit Doldu - Paketi Yükselt 🚀
            </button>
            <p className="text-xs text-gray-500 mt-2">
              Aylık AI kullanım limitiniz doldu. Kesintisiz hizmet için paketinizi yükseltin.
            </p>
          </div>
        ) : (
          <>
            <div className="flex space-x-2">
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Mesajınızı yazın..."
                disabled={isLoading}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
              <button
                onClick={sendMessage}
                disabled={!inputMessage.trim() || isLoading}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl px-4 py-2 hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2 text-center">
              AI bazen hata yapabilir. Önemli kararlar için doğrulayın.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default ChatWidget;
