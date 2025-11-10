"""
Redis Cache Helper Module
"""
import json
import os
import asyncio
from typing import Optional, Any
from functools import wraps
import logging

logger = logging.getLogger(__name__)

# Try to import redis.asyncio, but make it optional
try:
    import redis.asyncio as redis # <-- YENİ: .asyncio eklendi
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis (asyncio) module not found. Cache functionality will be disabled.")


async def init_redis(): # <-- YENİ: async oldu
    """
    Initialize Redis connection and return the client.
    Does not use a global variable.
    """
    if not REDIS_AVAILABLE:
        logger.info("Redis module not available. Cache functionality disabled.")
        return None
    
    try:
        redis_url = os.environ.get('REDIS_URL', 'redis://localhost:6379')
        # YENİ: 'decode_responses=True' eklendi, bu önemli
        # Timeout ekle: Redis çalışmıyorsa uzun süre beklemesin
        redis_client = redis.from_url(
            redis_url, 
            decode_responses=True,
            socket_connect_timeout=2,  # 2 saniye timeout
            socket_timeout=2,
            retry_on_timeout=False
        )
        
        # Test connection with timeout
        await asyncio.wait_for(redis_client.ping(), timeout=2)  # 2 saniye timeout
        logger.info("Redis (asyncio) connection established")
        return redis_client
        
    except asyncio.TimeoutError:
        logger.warning("Redis connection timeout. Cache will be disabled.")
        return None
    except Exception as e:
        logger.warning(f"Redis (asyncio) connection failed: {e}. Cache will be disabled.")
        return None

def get_cache_key(prefix: str, key: str) -> str:
    """Generate cache key"""
    return f"royal:{prefix}:{key}"

# Not: Bu cache decorator'leri artık 'request.app.state.redis_client'
# üzerinden çalışacak şekilde server.py'de güncellenmeli.
# Bu dosyadaki 'cache_result' ve 'invalidate_cache'
# şu anki 'lifespan' düzeltmesinden sonra DÜZGÜN ÇALIŞMAYACAKTIR.
# Şimdilik çökmemesi için onları devre dışı bırakıyoruz.

def cache_result(prefix: str, ttl: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # TODO: Bu decorator'ı 'request.app.state.redis_client' kullanacak
            # şekilde yeniden yazmak gerekir. Şimdilik bypass ediyoruz.
            # logger.debug("Cache decorator bypassed")
            return await func(*args, **kwargs)
        return wrapper
    return decorator

async def invalidate_cache(prefix: str, pattern: str = None):
    # TODO: Bu fonksiyon da 'request.app.state.redis_client' kullanmalı
    # logger.debug(f"Cache invalidation bypassed for prefix: {prefix}")
    return
