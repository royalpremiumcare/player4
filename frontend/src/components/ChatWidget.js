import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Send, Loader2, Mic, MicOff } from 'lucide-react';
import { io } from 'socket.io-client';

const ChatWidget = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [usageInfo, setUsageInfo] = useState({ current: 0, limit: -1 });
  const messagesEndRef = useRef(null);

  // Voice mode states
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // Ses seviyesi (debug)
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const silenceTimeoutRef = useRef(null);
  const socketRef = useRef(null);
  const isListeningRef = useRef(false); // Ref ile kontrol (state asenkron)

  // Voice config
  const SILENCE_THRESHOLD = 0.005; // Daha hassas (0.01'den 0.005'e düştü)
  const SILENCE_DURATION = 1500;

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

  // === VOICE MODE ===
  const toggleVoiceMode = async () => {
    if (!voiceMode) {
      await startVoiceSession();
    } else {
      await stopVoiceSession();
    }
  };

  const startVoiceSession = async () => {
    try {
      console.log('🎤 Starting voice session...');
      
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
      const socketUrl = window.location.origin;
      
      const socket = io(socketUrl, {
        path: '/api/socket.io',
        auth: { token },
        transports: ['websocket', 'polling'],
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
      });

      socketRef.current = socket;

      socket.on('connect', () => {
        console.log('✅ Voice WebSocket connected');
        
        socket.emit('voice_start', {
          organization_id: user?.organization_id,
          user_role: user?.role,
          username: user?.username
        });
      });

      socket.on('voice_ready', () => {
        console.log('✅ Voice session ready');
        setVoiceMode(true);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: '🎤 Sesli mod aktif! Konuşmaya başlayabilirsiniz.'
        }]);
        
        startListening();
      });

      socket.on('voice_response', async (data) => {
        console.log('🔊 Voice response received');
        
        setIsSpeaking(true);
        setIsListening(false);
        
        await playAudioResponse(data.audio);
        
        setIsSpeaking(false);
        if (voiceMode) {
          startListening();
        }
      });

      socket.on('voice_error', (data) => {
        console.error('❌ Voice error:', data.message);
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `❌ Sesli mod hatası: ${data.message}`
        }]);
      });

      socket.on('voice_stopped', () => {
        console.log('🛑 Voice session stopped');
        setVoiceMode(false);
      });

    } catch (error) {
      console.error('Voice session start error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Sesli mod başlatılamadı. Lütfen mikrofon iznini kontrol edin.'
      }]);
    }
  };

  const stopVoiceSession = async () => {
    try {
      console.log('🛑 Stopping voice session...');
      
      stopListening();
      
      if (socketRef.current) {
        socketRef.current.emit('voice_stop');
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      
      setVoiceMode(false);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '🛑 Sesli mod kapatıldı.'
      }]);
      
    } catch (error) {
      console.error('Voice session stop error:', error);
    }
  };

  const startListening = async () => {
    try {
      console.log('🎤 Starting to listen...');
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        sendAudioToAI();
      };
      
      setIsListening(true);
      isListeningRef.current = true; // Ref'i hemen güncelle
      
      detectVoiceActivity();
      
    } catch (error) {
      console.error('Mikrofon başlatma hatası:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '❌ Mikrofon erişimi reddedildi. Lütfen izin verin.'
      }]);
    }
  };

  const stopListening = () => {
    console.log('🛑 Stopping listening...');
    
    isListeningRef.current = false; // Önce ref'i kapat (loop dursun)
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current);
      silenceTimeoutRef.current = null;
    }
    
    setIsListening(false);
  };

  const detectVoiceActivity = () => {
    if (!analyserRef.current) return;
    
    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    const checkAudio = () => {
      if (!isListeningRef.current) return; // Ref ile kontrol
      
      analyser.getByteFrequencyData(dataArray);
      
      const average = dataArray.reduce((a, b) => a + b) / bufferLength / 255;
      
      // Debug: Ses seviyesini UI'da göster
      setAudioLevel(average);
      
      // Debug: Ses seviyesini logla
      if (average > 0.001) {
        console.log('🎵 Ses seviyesi:', average.toFixed(4));
      }
      
      if (average > SILENCE_THRESHOLD) {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'inactive') {
          console.log('🎤 Voice detected, starting recording...');
          mediaRecorderRef.current.start();
        }
        
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      } else {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          if (!silenceTimeoutRef.current) {
            silenceTimeoutRef.current = setTimeout(() => {
              console.log('🔇 Silence detected, stopping recording...');
              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                mediaRecorderRef.current.stop();
              }
              silenceTimeoutRef.current = null;
            }, SILENCE_DURATION);
          }
        }
      }
      
      requestAnimationFrame(checkAudio);
    };
    
    checkAudio();
  };

  const sendAudioToAI = async () => {
    try {
      if (audioChunksRef.current.length === 0) {
        console.log('⚠️ No audio data to send');
        return;
      }
      
      console.log('📤 Sending audio to AI...');
      
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      audioChunksRef.current = [];
      
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = reader.result.split(',')[1];
        
        if (socketRef.current) {
          socketRef.current.emit('voice_audio', {
            audio: base64Audio
          });
        }
      };
      reader.readAsDataURL(audioBlob);
      
    } catch (error) {
      console.error('Audio send error:', error);
    }
  };

  const playAudioResponse = async (base64Audio) => {
    return new Promise((resolve) => {
      try {
        console.log('🔊 Playing AI response...');
        
        const audioData = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioData.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioData.length; i++) {
          view[i] = audioData.charCodeAt(i);
        }
        
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        audioContext.decodeAudioData(arrayBuffer, (audioBuffer) => {
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          source.onended = () => {
            console.log('✅ AI response playback finished');
            resolve();
          };
          source.start(0);
        });
        
      } catch (error) {
        console.error('Audio playback error:', error);
        resolve();
      }
    });
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
              <p className="text-xs opacity-90">
                {voiceMode ? '🎤 Sesli Mod Aktif' : 'AI destekli yardımcınız'}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Sesli Mod Toggle */}
            <button
              onClick={toggleVoiceMode}
              className={`p-2 rounded-full transition-all ${
                voiceMode 
                  ? 'bg-red-500 hover:bg-red-600' 
                  : 'bg-white/20 hover:bg-white/30'
              }`}
              title={voiceMode ? 'Sesli Modu Kapat' : 'Sesli Modu Aç'}
            >
              {voiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
            <button
              onClick={() => setIsOpen(false)}
              className="hover:bg-white/20 rounded-full p-1 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
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

        {(isLoading || isSpeaking) && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm border border-gray-200">
              <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
            </div>
          </div>
        )}

        {isListening && (
          <div className="flex flex-col items-center space-y-2">
            <div className="bg-red-100 text-red-600 text-xs px-3 py-1 rounded-full animate-pulse">
              🎤 Dinleniyor...
            </div>
            {/* Ses seviyesi göstergesi */}
            <div className="w-full max-w-xs">
              <div className="bg-gray-200 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-green-500 h-full transition-all duration-100"
                  style={{ width: `${Math.min(audioLevel * 1000, 100)}%` }}
                />
              </div>
              <div className="text-xs text-gray-500 text-center mt-1">
                Ses: {(audioLevel * 100).toFixed(2)}% (Eşik: {(SILENCE_THRESHOLD * 100).toFixed(2)}%)
              </div>
            </div>
          </div>
        )}

        {/* Örnek Sorular */}
        {messages.length <= 1 && !isLoading && !voiceMode && (
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

      {/* Input - Sadece voice mode kapalıyken */}
      {!voiceMode && (
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
      )}
    </div>
  );
};

export default ChatWidget;
