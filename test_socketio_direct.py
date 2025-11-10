#!/usr/bin/env python3
"""
Direct Socket.IO test using python-socketio client
"""

import asyncio
import socketio
import requests

API_BACKEND_URL = "https://appointflow-39.preview.emergentagent.com/api"

async def test_direct_socketio():
    print("🧪 Testing Socket.IO with python-socketio client...")
    
    try:
        # Create Socket.IO client
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
        
        # Connect using the correct path
        print("Attempting to connect...")
        await sio.connect(f"{API_BACKEND_URL}", socketio_path='/socket.io/')
        
        print("Waiting 5 seconds...")
        await asyncio.sleep(5)
        
        if sio.connected:
            print("✅ Socket.IO connection successful")
            
            # Test organization join
            print("Testing organization join...")
            await sio.emit('join_organization', {'organization_id': 'test-org-123'})
            await asyncio.sleep(2)
            
            await sio.disconnect()
            return True
        else:
            print("❌ Socket.IO connection failed")
            return False
            
    except Exception as e:
        print(f"❌ Socket.IO connection error: {e}")
        return False

if __name__ == "__main__":
    result = asyncio.run(test_direct_socketio())
    print(f"Final result: {'SUCCESS' if result else 'FAILED'}")