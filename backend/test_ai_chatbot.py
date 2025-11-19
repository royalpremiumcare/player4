"""
Test script for PLANN AI Chatbot
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from ai_service import chat_with_ai

# MongoDB connection
MONGODB_URI = os.environ.get('MONGODB_URI', 'mongodb://localhost:27017')
client = AsyncIOMotorClient(MONGODB_URI)
db = client['plann_db']

async def test_chatbot():
    """Test AI chatbot with sample queries"""
    
    print("=" * 60)
    print("PLANN AI CHATBOT TEST")
    print("=" * 60)
    
    # Test organization ID (replace with real one)
    test_org_id = "test-org-123"
    
    # Test 1: Admin asking for dashboard status
    print("\n📊 Test 1: Admin Dashboard Query")
    print("-" * 60)
    result = await chat_with_ai(
        db=db,
        user_message="Bugün durum ne?",
        chat_history=[],
        user_role="admin",
        username="admin@test.com",
        organization_id=test_org_id,
        organization_name="Test Kuaförü"
    )
    print(f"AI Response: {result.get('message', 'No response')}")
    
    # Test 2: Staff asking about their schedule
    print("\n📅 Test 2: Staff Schedule Query")
    print("-" * 60)
    result = await chat_with_ai(
        db=db,
        user_message="Bugün kaç randevum var?",
        chat_history=[],
        user_role="staff",
        username="staff@test.com",
        organization_id=test_org_id,
        organization_name="Test Kuaförü"
    )
    print(f"AI Response: {result.get('message', 'No response')}")
    
    # Test 3: Staff trying to access admin data (should be denied)
    print("\n🔒 Test 3: Staff Access Control Test")
    print("-" * 60)
    result = await chat_with_ai(
        db=db,
        user_message="Tüm işletmenin cirosunu göster",
        chat_history=[],
        user_role="staff",
        username="staff@test.com",
        organization_id=test_org_id,
        organization_name="Test Kuaförü"
    )
    print(f"AI Response: {result.get('message', 'No response')}")
    
    # Test 4: Knowledge base query
    print("\n❓ Test 4: Knowledge Base Query")
    print("-" * 60)
    result = await chat_with_ai(
        db=db,
        user_message="Randevu nasıl oluşturulur?",
        chat_history=[],
        user_role="admin",
        username="admin@test.com",
        organization_id=test_org_id,
        organization_name="Test Kuaförü"
    )
    print(f"AI Response: {result.get('message', 'No response')}")
    
    print("\n" + "=" * 60)
    print("✅ Test Completed!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_chatbot())
