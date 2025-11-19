import os
import base64
import logging
from typing import Optional
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(Path(__file__).parent / '.env')

try:
    from google import genai
    from google.genai import types
    VOICE_AI_AVAILABLE = True
except ImportError:
    VOICE_AI_AVAILABLE = False
    logging.warning("google-genai SDK not installed. Voice AI will not be available.")

logger = logging.getLogger(__name__)

# Gemini API Key
GEMINI_API_KEY = os.getenv('GOOGLE_GEMINI_KEY')  # .env'deki key ismi

class VoiceAIService:
    """
    Google Gemini 2.5 Flash Native Audio Service
    Continuous Voice Mode - Hands-Free Conversation
    """
    
    def __init__(self):
        if not VOICE_AI_AVAILABLE:
            raise RuntimeError("google-genai SDK not available")
        
        if not GEMINI_API_KEY:
            raise ValueError("GOOGLE_GEMINI_KEY environment variable is required")
        
        # Gemini client'ı başlat - v1beta API kullan (Live API için gerekli)
        self.client = genai.Client(
            api_key=GEMINI_API_KEY,
            http_options={"api_version": "v1beta"}
        )
        
        # Model: Gemini 2.5 Flash Native Audio (Resmi dokümantasyondan)
        self.model_name = "models/gemini-2.5-flash-native-audio-preview-09-2025"
        
        # Session configuration - Minimal (speech_config preview'da desteklenmiyor)
        self.config = types.LiveConnectConfig(
            response_modalities=["AUDIO"]
        )
        
        logger.info(f"✅ VoiceAIService initialized with model: {self.model_name}")
    
    async def create_session(self, system_instruction: str = None):
        """
        Yeni bir sesli görüşme oturumu oluştur
        
        Args:
            system_instruction: AI'a verilen sistem talimatları (kullanılmıyor - gelecek versiyonlarda eklenebilir)
        
        Returns:
            LiveSession context manager
        """
        try:
            # Gemini 2.0 Flash Live API - context manager döner
            session_cm = self.client.aio.live.connect(
                model=self.model_name,
                config=self.config
            )
            
            # Context manager'ı başlat ve session al
            session = await session_cm.__aenter__()
            
            logger.info("✅ Voice AI session created")
            return (session_cm, session)  # Hem context manager hem session dön
        
        except Exception as e:
            logger.error(f"Voice AI session creation error: {e}")
            raise
    
    async def send_audio(self, session_tuple, audio_base64: str) -> None:
        """
        Kullanıcı sesini AI'ya gönder
        
        Args:
            session_tuple: (context_manager, session) tuple
            audio_base64: Base64 encoded audio data (WebM/Opus format)
        """
        try:
            _, session = session_tuple  # Tuple'dan session'ı al
            
            # Base64'ü decode et
            audio_bytes = base64.b64decode(audio_base64)
            
            # AI'ya ses gönder - Resmi dokümantasyon formatı
            await session.send(
                input={"data": audio_bytes, "mime_type": "audio/pcm"},
                end_of_turn=True
            )
            
            logger.debug(f"Audio sent to AI: {len(audio_bytes)} bytes")
        
        except Exception as e:
            logger.error(f"Send audio error: {e}")
            raise
    
    async def receive_audio_response(self, session_tuple) -> Optional[str]:
        """
        AI'dan gelen ses cevabını al
        
        Args:
            session_tuple: (context_manager, session) tuple
        
        Returns:
            Base64 encoded audio response (PCM16 24kHz) or None
        """
        try:
            _, session = session_tuple  # Tuple'dan session'ı al
            audio_chunks = []
            
            logger.info("🔊 [VoiceAI] Starting to receive from session...")
            
            # AI'dan gelen response'ları dinle
            response_count = 0
            async for response in session.receive():
                response_count += 1
                logger.info(f"📨 [VoiceAI] Response #{response_count} received")
                
                # Server content (audio) parçalarını topla
                if response.server_content:
                    logger.info(f"📦 [VoiceAI] Response has server_content")
                    if response.server_content.model_turn:
                        logger.info(f"🤖 [VoiceAI] Response has model_turn with {len(response.server_content.model_turn.parts)} parts")
                        for part in response.server_content.model_turn.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                chunk_size = len(part.inline_data.data)
                                audio_chunks.append(part.inline_data.data)
                                logger.info(f"🎵 [VoiceAI] Audio chunk added: {chunk_size} bytes, total chunks: {len(audio_chunks)}")
                
                # Turn complete olduğunda döngüyü kır
                if response.server_content and response.server_content.turn_complete:
                    logger.info("✅ [VoiceAI] Turn complete, breaking loop")
                    break
            
            logger.info(f"🎶 [VoiceAI] Received total {len(audio_chunks)} audio chunks")
            
            # Tüm ses parçalarını birleştir
            if audio_chunks:
                full_audio = b''.join(audio_chunks)
                audio_base64 = base64.b64encode(full_audio).decode('utf-8')
                logger.info(f"✅ [VoiceAI] Audio response ready: {len(full_audio)} bytes")
                return audio_base64
            
            logger.warning("⚠️ [VoiceAI] No audio chunks received")
            return None
        
        except Exception as e:
            logger.error(f"Receive audio error: {e}")
            raise
    
    async def close_session(self, session_tuple) -> None:
        """
        Sesli görüşme oturumunu kapat
        
        Args:
            session_tuple: (context_manager, session) tuple
        """
        try:
            session_cm, session = session_tuple
            
            # Context manager'ı düzgün kapat
            await session_cm.__aexit__(None, None, None)
            
            logger.info("✅ Voice AI session closed")
        except Exception as e:
            logger.error(f"Close session error: {e}")


# Global instance
_voice_ai_service: Optional[VoiceAIService] = None

def get_voice_ai_service() -> Optional[VoiceAIService]:
    """Voice AI Service singleton instance"""
    global _voice_ai_service
    
    if not VOICE_AI_AVAILABLE:
        return None
    
    if _voice_ai_service is None:
        try:
            _voice_ai_service = VoiceAIService()
        except Exception as e:
            logger.error(f"Failed to initialize VoiceAIService: {e}")
            return None
    
    return _voice_ai_service