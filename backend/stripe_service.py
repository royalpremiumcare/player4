"""
Stripe Payment Service
İngiltere şirketi için Stripe entegrasyonu
"""

import os
import logging
import stripe
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from dotenv import load_dotenv

# .env dosyasını yükle
load_dotenv()

# Stripe konfigürasyonu
STRIPE_SECRET_KEY = os.getenv('STRIPE_SECRET_KEY')
STRIPE_PUBLISHABLE_KEY = os.getenv('STRIPE_PUBLISHABLE_KEY')
STRIPE_WEBHOOK_SECRET = os.getenv('STRIPE_WEBHOOK_SECRET')

# Stripe'ı yapılandır
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY
else:
    logging.warning("STRIPE_SECRET_KEY tanımlı değil. Ödeme işlemleri çalışmayacak.")

# Success ve Cancel URL'leri
PAYMENT_SUCCESS_URL = "https://plannapp.co/#/payment-success"
PAYMENT_CANCEL_URL = "https://plannapp.co/#/payment-cancelled"

# Logger
logger = logging.getLogger(__name__)

def create_checkout_session(user_id: str, plan_id: str, price_amount: int, plan_name: str, user_email: str) -> Optional[Dict[str, Any]]:
    """
    Stripe Checkout Session oluşturur.
    
    Args:
        user_id (str): Kullanıcı ID'si
        plan_id (str): Plan ID'si (tier_1_standard, tier_2_profesyonel, vb.)
        price_amount (int): Fiyat (cent/kuruş cinsinden)
        plan_name (str): Plan adı
        user_email (str): Kullanıcı e-postası
    
    Returns:
        Dict: Checkout session bilgileri veya None
    """
    try:
        if not STRIPE_SECRET_KEY:
            logger.error("Stripe secret key tanımlı değil")
            return None
        
        # Stripe Price objesi oluştur (dinamik fiyat için)
        price = stripe.Price.create(
            currency='gbp',  # İngiltere şirketi için GBP
            unit_amount=price_amount,
            recurring={'interval': 'month'},
            product_data={
                'name': f'PLANN {plan_name} Plan',
                'description': f'Aylık {plan_name} abonelik paketi'
            }
        )
        
        # Checkout Session oluştur
        session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            mode='subscription',  # SaaS için subscription mode
            line_items=[{
                'price': price.id,
                'quantity': 1,
            }],
            customer_email=user_email,
            metadata={
                'user_id': user_id,
                'plan_id': plan_id,
                'organization_id': user_id  # Geçici olarak user_id kullanıyoruz
            },
            success_url=PAYMENT_SUCCESS_URL + f'?session_id={{CHECKOUT_SESSION_ID}}',
            cancel_url=PAYMENT_CANCEL_URL,
            allow_promotion_codes=True,  # Promosyon kodlarına izin ver
            billing_address_collection='required',  # Fatura adresi zorunlu
            automatic_tax={'enabled': True},  # Otomatik vergi hesaplama
        )
        
        logger.info(f"Stripe checkout session oluşturuldu: {session.id} for user: {user_id}")
        
        return {
            'session_id': session.id,
            'checkout_url': session.url,
            'price_id': price.id
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe hatası: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Checkout session oluşturma hatası: {str(e)}")
        return None

def verify_webhook_signature(payload: bytes, signature: str) -> bool:
    """
    Stripe webhook imzasını doğrular.
    
    Args:
        payload (bytes): Webhook payload
        signature (str): Stripe imzası
    
    Returns:
        bool: İmza geçerli mi?
    """
    try:
        if not STRIPE_WEBHOOK_SECRET:
            logger.warning("STRIPE_WEBHOOK_SECRET tanımlı değil")
            return False
        
        stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
        return True
        
    except stripe.error.SignatureVerificationError:
        logger.error("Stripe webhook imza doğrulama hatası")
        return False
    except Exception as e:
        logger.error(f"Webhook imza doğrulama hatası: {str(e)}")
        return False

def parse_webhook_event(payload: bytes, signature: str) -> Optional[Dict[str, Any]]:
    """
    Stripe webhook event'ini parse eder.
    
    Args:
        payload (bytes): Webhook payload
        signature (str): Stripe imzası
    
    Returns:
        Dict: Event bilgileri veya None
    """
    try:
        if not STRIPE_WEBHOOK_SECRET:
            logger.warning("STRIPE_WEBHOOK_SECRET tanımlı değil")
            return None
        
        event = stripe.Webhook.construct_event(
            payload, signature, STRIPE_WEBHOOK_SECRET
        )
        
        return event
        
    except stripe.error.SignatureVerificationError:
        logger.error("Stripe webhook imza doğrulama hatası")
        return None
    except Exception as e:
        logger.error(f"Webhook event parse hatası: {str(e)}")
        return None

def get_subscription_info(subscription_id: str) -> Optional[Dict[str, Any]]:
    """
    Stripe subscription bilgilerini getirir.
    
    Args:
        subscription_id (str): Subscription ID
    
    Returns:
        Dict: Subscription bilgileri veya None
    """
    try:
        subscription = stripe.Subscription.retrieve(subscription_id)
        
        return {
            'id': subscription.id,
            'status': subscription.status,
            'current_period_start': subscription.current_period_start,
            'current_period_end': subscription.current_period_end,
            'customer_id': subscription.customer,
            'metadata': subscription.metadata
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Subscription bilgisi alma hatası: {str(e)}")
        return None

def cancel_subscription(subscription_id: str) -> bool:
    """
    Stripe subscription'ı iptal eder.
    
    Args:
        subscription_id (str): Subscription ID
    
    Returns:
        bool: İptal başarılı mı?
    """
    try:
        stripe.Subscription.delete(subscription_id)
        logger.info(f"Subscription iptal edildi: {subscription_id}")
        return True
        
    except stripe.error.StripeError as e:
        logger.error(f"Subscription iptal hatası: {str(e)}")
        return False

# Example Usage
if __name__ == "__main__":
    # Test checkout session
    result = create_checkout_session(
        user_id="test_user_123",
        plan_id="tier_2_profesyonel",
        price_amount=78000,  # £780.00 (GBP cent cinsinden)
        plan_name="Profesyonel",
        user_email="test@example.com"
    )
    
    if result:
        print("Checkout Session oluşturuldu:")
        print(f"Session ID: {result['session_id']}")
        print(f"Checkout URL: {result['checkout_url']}")
    else:
        print("Checkout Session oluşturulamadı")
