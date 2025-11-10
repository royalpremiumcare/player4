#!/usr/bin/env python3
"""
Simple WebSocket Connection Test
"""

import asyncio
import socketio
import requests
import time

BACKEND_URL = "https://appointflow-39.preview.emergentagent.com"
API_BACKEND_URL = "https://appointflow-39.preview.emergentagent.com/api"

async def test_simple_connection():
    print("🧪 Testing simple Socket.IO connection...")
    
    # Test 1: Check if Socket.IO endpoint responds
    try:
        response = requests.get(f"{API_BACKEND_URL}/socket.io/", timeout=5)
        print(f"Socket.IO endpoint status: {response.status_code}")
        print(f"Response text: {response.text}")
    except Exception as e:
        print(f"❌ Socket.IO endpoint error: {e}")
        return False
    
    # Test 2: Try Socket.IO connection
    try:
        sio = socketio.AsyncClient(logger=True, engineio_logger=True)
        
        @sio.event
        async def connect():
            print("✅ Connected to Socket.IO server")
        
        @sio.event
        async def disconnect():
            print("🔌 Disconnected from Socket.IO server")
        
        @sio.event
        async def connection_established(data):
            print(f"✅ Connection established: {data}")
        
        print("Attempting to connect...")
        await sio.connect(API_BACKEND_URL, wait_timeout=10)
        
        print("Waiting 5 seconds...")
        await asyncio.sleep(5)
        
        if sio.connected:
            print("✅ Socket.IO connection successful")
            await sio.disconnect()
            return True
        else:
            print("❌ Socket.IO connection failed")
            return False
            
    except Exception as e:
        print(f"❌ Socket.IO connection error: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_simple_connection())
    print(f"Final result: {'SUCCESS' if result else 'FAILED'}")