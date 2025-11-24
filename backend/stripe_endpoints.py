"""
Stripe Endpoints
PayTR'den Stripe'a migration için yeni endpoint'ler
"""

from fastapi import HTTPException, Request, Depends
from fastapi.responses import Response
from typing import Dict, Any
import logging
from datetime import datetime, timezone, timedelta

from stripe_service import create_checkout_session, parse_webhook_event
from server import (
    get_current_user, UserInDB, PlanUpdateRequest, 
    get_db_from_request, get_plan_info, get_organization_plan
)

logger = logging.getLogger(__name__)

async def create_stripe_checkout_session_handler(
    request: Request,
    plan_request: PlanUpdateRequest,
    current_user: UserInDB = Depends(get_current_user)
) -> Dict[str, Any]:
    """Stripe Checkout Session oluştur"""
    try:
        # Log mesajını hem console'a hem de file'a yaz
        log_msg = f"Stripe checkout session başlatılıyor: user={current_user.username}, plan_id={plan_request.plan_id}"
        logger.info(log_msg)
        print(f"[STRIPE] {log_msg}")
        
        if current_user.role != "admin":
            logger.warning(f"Payment endpoint: Yetkisiz erişim denemesi - user={current_user.username}, role={current_user.role}")
            raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
        
        # 1. İstenen planı bul ve fiyatını al
        plan = await get_plan_info(plan_request.plan_id)
        if not plan:
            logger.error(f"Plan bulunamadı: plan_id={plan_request.plan_id}")
            raise HTTPException(status_code=404, detail="Plan bulunamadı")
        
        # Plan dict'inin gerekli alanlarını kontrol et
        if 'price_monthly' not in plan or 'name' not in plan:
            logger.error(f"Plan eksik alanlar içeriyor: plan={plan}, plan_id={plan_request.plan_id}")
            raise HTTPException(status_code=500, detail="Plan verisi eksik veya geçersiz")
        
        # Trial paketini satın alınamaz
        if plan_request.plan_id == 'tier_trial':
            raise HTTPException(status_code=400, detail="Trial paketi satın alınamaz")
        
        db = await get_db_from_request(request)
        
        # 2. İndirimi uygula (İlk ay %25)
        plan_doc = await get_organization_plan(db, current_user.organization_id)
        is_first_month = plan_doc.get('is_first_month', True) if plan_doc else True
        
        # price_monthly değerini güvenli şekilde al
        price_monthly = plan.get('price_monthly', 0)
        if not isinstance(price_monthly, (int, float)) or price_monthly < 0:
            logger.error(f"Geçersiz price_monthly değeri: {price_monthly}, plan_id={plan_request.plan_id}")
            raise HTTPException(status_code=500, detail="Plan fiyatı geçersiz")
        
        if is_first_month:
            price_to_pay = price_monthly * 0.75  # %25 indirim
        else:
            price_to_pay = price_monthly
        
        # Stripe için fiyatı pence/cent formatına çevir (GBP için)
        # TL'den GBP'ye çevrim (yaklaşık 1 GBP = 35 TL)
        price_gbp = price_to_pay / 35  # Basit çevrim
        payment_amount_pence = int(price_gbp * 100)  # GBP pence cinsinden
        
        # 3. E-posta kontrolü
        user_email = (current_user.username or "").strip().lower()
        if not user_email or "@" not in user_email:
            logger.error(f"Geçersiz email (kullanıcı: {current_user.username}): {user_email}")
            raise HTTPException(status_code=400, detail="Geçerli bir e-posta adresi gerekli")
        
        # 4. Stripe Checkout Session oluştur
        plan_name = plan.get('name', 'Plan')
        
        stripe_result = create_checkout_session(
            user_id=current_user.organization_id,
            plan_id=plan_request.plan_id,
            price_amount=payment_amount_pence,
            plan_name=plan_name,
            user_email=user_email
        )
        
        if not stripe_result:
            logger.error("Stripe checkout session oluşturulamadı")
            raise HTTPException(status_code=500, detail="Ödeme oturumu oluşturulamadı")
        
        # 5. Payment log oluştur
        await db.payment_logs.insert_one({
            "session_id": stripe_result['session_id'],
            "organization_id": current_user.organization_id,
            "user_id": current_user.username,
            "plan_id": plan_request.plan_id,
            "status": "pending",
            "amount": price_to_pay,
            "amount_gbp": price_gbp,
            "is_first_month": is_first_month,
            "payment_provider": "stripe",
            "created_at": datetime.now(timezone.utc).isoformat()
        })
        
        logger.info(f"Stripe checkout session oluşturuldu: {stripe_result['session_id']} - {plan_request.plan_id}")
        
        return {
            "checkout_url": stripe_result['checkout_url'],
            "session_id": stripe_result['session_id']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Stripe checkout session oluşturma hatası: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Sunucu hatası: {str(e)}")

async def handle_stripe_webhook_handler(request: Request) -> Response:
    """Stripe webhook - Ödeme durumu değişikliklerini işle"""
    try:
        # Webhook payload'ını al
        payload = await request.body()
        signature = request.headers.get('stripe-signature')
        
        if not signature:
            logger.warning("Stripe webhook imzası eksik")
            return Response(content="Missing signature", status_code=400)
        
        # Webhook event'ini parse et ve doğrula
        event = parse_webhook_event(payload, signature)
        if not event:
            logger.warning("Stripe webhook doğrulama başarısız")
            return Response(content="Invalid signature", status_code=400)
        
        event_type = event['type']
        logger.info(f"Stripe webhook alındı: {event_type}")
        
        # Sadece ilgilendiğimiz event'leri işle
        if event_type == 'checkout.session.completed':
            session = event['data']['object']
            session_id = session['id']
            customer_email = session.get('customer_email')
            
            logger.info(f"Checkout session tamamlandı: {session_id}")
            
            # Payment log'u güncelle
            db = await get_db_from_request(request)
            payment_log = await db.payment_logs.find_one({"session_id": session_id})
            
            if payment_log:
                organization_id = payment_log['organization_id']
                plan_id = payment_log['plan_id']
                
                # Organization plan'ını güncelle
                update_data = {
                    "plan_id": plan_id,
                    "status": "active",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                    "subscription_id": session.get('subscription'),
                    "customer_id": session.get('customer'),
                    "payment_provider": "stripe"
                }
                
                # İlk ay indirimi uygulandıysa, bir sonraki ödemede normal fiyat
                if payment_log.get('is_first_month', True):
                    update_data['is_first_month'] = False
                
                await db.organization_plans.update_one(
                    {"organization_id": organization_id},
                    {"$set": update_data}
                )
                
                # Payment log'u güncelle
                await db.payment_logs.update_one(
                    {"session_id": session_id},
                    {"$set": {
                        "status": "completed",
                        "completed_at": datetime.now(timezone.utc).isoformat(),
                        "stripe_customer_id": session.get('customer'),
                        "stripe_subscription_id": session.get('subscription')
                    }}
                )
                
                logger.info(f"Stripe ödeme başarılı: {session_id} - Plan güncellendi. Organization: {organization_id}, Plan: {plan_id}")
            else:
                logger.warning(f"Payment log bulunamadı: {session_id}")
        
        elif event_type == 'invoice.payment_succeeded':
            # Recurring payment başarılı
            invoice = event['data']['object']
            subscription_id = invoice['subscription']
            
            logger.info(f"Recurring payment başarılı: {subscription_id}")
            
            # Subscription'a göre organization'ı bul ve plan süresini uzat
            db = await get_db_from_request(request)
            org_plan = await db.organization_plans.find_one({"subscription_id": subscription_id})
            
            if org_plan:
                # Bir sonraki ödeme tarihini güncelle
                next_billing = datetime.now(timezone.utc) + timedelta(days=30)
                await db.organization_plans.update_one(
                    {"subscription_id": subscription_id},
                    {"$set": {
                        "next_billing_date": next_billing.isoformat(),
                        "last_payment_date": datetime.now(timezone.utc).isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }}
                )
                
                logger.info(f"Recurring payment işlendi: {subscription_id}")
        
        elif event_type == 'invoice.payment_failed':
            # Recurring payment başarısız
            invoice = event['data']['object']
            subscription_id = invoice['subscription']
            
            logger.warning(f"Recurring payment başarısız: {subscription_id}")
            
            # TODO: Admin'e e-posta gönder, plan'ı suspend et
        
        return Response(content="OK", status_code=200)
        
    except Exception as e:
        logger.error(f"Stripe webhook işleme hatası: {e}", exc_info=True)
        return Response(content="ERROR", status_code=500)
