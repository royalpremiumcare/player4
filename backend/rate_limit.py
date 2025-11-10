"""
Rate Limiting Module
(Düzeltilmiş versiyon: limits==5.6.0 ve REDIS_URL ile uyumlu)
(Düzeltme 2: 'initialize_limiter' artık 'limiter' nesnesini return ediyor)
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import limits.storage
from fastapi import Request
import os
import logging

logger = logging.getLogger(__name__)
RATE_LIMIT_ENABLED = os.environ.get('RATE_LIMIT_ENABLED', 'true').lower() == 'true'

# Global, ama 'lifespan'de bağlanacak
limiter = Limiter(key_func=get_remote_address, default_limits=["100/minute"])

def initialize_limiter(redis_client):
    """
    Limiter'ı Vercel 'lifespan' içinde başlatır.
    (VDS'e uyarlandı: Artık redis_client parametresini kullanmıyor,
     doğrudan .env dosyasındaki REDIS_URL'yi kullanıyor)
    """
    if not RATE_LIMIT_ENABLED:
        logger.info("Rate limiting is disabled by ENV.")
        limiter.storage = None
        return limiter # <-- YENİ: 'None' bile olsa limiter'ı döndür

    # redis_client parametresi VDS'de artık gerekli değil,
    # .env dosyasındaki REDIS_URL'yi kullanacağız.

    try:
        # VDS .env dosyasından REDIS_URL'yi al
        redis_url = os.environ.get('REDIS_URL')
        if not redis_url:
            logger.warning("REDIS_URL environment variable is not set. Disabling rate limiter.")
            limiter.storage = None
            return limiter # <-- YENİ: Limiter'ı döndür

        # 'limits' kütüphanesinin URL'den (string'den) async depolama
        # oluşturmasını sağlayan, sürümden bağımsız güvenli yöntem:
        storage = limits.storage.storage_from_string(
            redis_url,
            protocol="async"
        )
        
        limiter.storage = storage # Depoyu ayarla
        logger.info("Rate Limiter initialized successfully from REDIS_URL.")
    
    except Exception as e:
        logger.error(f"Failed to create Limiter storage: {e}.")
        limiter.storage = None
    
    return limiter # <-- YENİ: Yapılandırılmış limiter'ı döndür

# Rate limit decorator'ı
def rate_limit(times: str = "10/minute", per_method: bool = True):
    """
    Rate limit decorator'ı.
    'limiter' nesnesini (yukarıdaki global olanı) kullanır.
    """
    if not RATE_LIMIT_ENABLED:
        def noop_decorator(func):
            return func
        return noop_decorator

    # 'slowapi'nin kendi 'limit' fonksiyonunu kullanıyoruz
    return limiter.limit(times)

# Common rate limit configurations
LIMITS = {
    'login': "5/minute",
    'register': "3/hour",
    'api': "100/minute",
    'stats': "20/minute",
    'sms': "100/hour",
}
