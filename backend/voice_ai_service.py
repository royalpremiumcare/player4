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
        
        # Gemini client'ı başlat
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        
        # Model: Gemini 2.0 Flash (Native Audio destekli)
        self.model_name = "models/gemini-2.0-flash-exp"
        
        # Session configuration
        self.config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name="Aoede"  # Kadın sesi (alternatif: Charon, Fenrir, Kore, Puck)
                    )
                )
            )
        )
        
        logger.info(f"✅ VoiceAIService initialized with model: {self.model_name}")
    
    async def create_session(self, system_instruction: str = None):
        """
        Yeni bir sesli görüşme oturumu oluştur
        
        Args:
            system_instruction: AI'a verilen sistem talimatları
        
        Returns:
            LiveSession object
        """
        try:
            # System instruction varsa ekle
            if system_instruction:
                session = self.client.aio.live.connect(
                    model=self.model_name,
                    config=self.config,
                    system_instruction=system_instruction
                )
            else:
                session = self.client.aio.live.connect(
                    model=self.model_name,
                    config=self.config
                )
            
            logger.info("✅ Voice AI session created")
            return session
        
        except Exception as e:
            logger.error(f"Voice AI session creation error: {e}")
            raise
    
    async def send_audio(self, session, audio_base64: str) -> None:
        """
        Kullanıcı sesini AI'ya gönder
        
        Args:
            session: Active LiveSession
            audio_base64: Base64 encoded audio data (WebM/Opus format)
        """
        try:
            # Base64'ü decode et
            audio_bytes = base64.b64decode(audio_base64)
            
            # AI'ya ses gönder
            await session.send(audio_bytes, end_of_turn=True)
            
            logger.debug(f"Audio sent to AI: {len(audio_bytes)} bytes")
        
        except Exception as e:
            logger.error(f"Send audio error: {e}")
            raise
    
    async def receive_audio_response(self, session) -> Optional[str]:
        """
        AI'dan gelen ses cevabını al
        
        Args:
            session: Active LiveSession
        
        Returns:
            Base64 encoded audio response (PCM16 24kHz) or None
        """
        try:
            audio_chunks = []
            
            # AI'dan gelen response'ları dinle
            async for response in session.receive():
                # Server content (audio) parçalarını topla
                if response.server_content:
                    if response.server_content.model_turn:
                        for part in response.server_content.model_turn.parts:
                            if hasattr(part, 'inline_data') and part.inline_data:
                                audio_chunks.append(part.inline_data.data)
                
                # Turn complete olduğunda döngüyü kır
                if response.server_content and response.server_content.turn_complete:
                    break
            
            # Tüm ses parçalarını birleştir
            if audio_chunks:
                full_audio = b''.join(audio_chunks)
                audio_base64 = base64.b64encode(full_audio).decode('utf-8')
                logger.debug(f"Audio response received: {len(full_audio)} bytes")
                return audio_base64
            
            return None
        
        except Exception as e:
            logger.error(f"Receive audio error: {e}")
            raise
    
    async def close_session(self, session) -> None:
        """
        Sesli görüşme oturumunu kapat
        
        Args:
            session: Active LiveSession
        """
        try:
            await session.close()
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