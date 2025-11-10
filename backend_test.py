#!/usr/bin/env python3
"""
Comprehensive Backend WebSocket Testing for Appointment Management SaaS
Tests Socket.IO implementation, real-time events, and organization rooms
"""

import asyncio
import json
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional

import requests
import socketio
from motor.motor_asyncio import AsyncIOMotorClient

# Configuration
BACKEND_URL = "https://appointflow-39.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"
SOCKET_URL = BACKEND_URL
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/royal_koltuk_dev')
DB_NAME = os.environ.get('DB_NAME', 'royal_koltuk_dev')

class WebSocketTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.organization_id = None
        self.user_data = None
        self.socket_client = None
        self.received_events = []
        self.connection_status = False
        self.db_client = None
        self.db = None
        
    async def setup_database(self):
        """Setup database connection for direct testing"""
        try:
            self.db_client = AsyncIOMotorClient(MONGO_URL)
            await self.db_client.admin.command('ping')
            self.db = self.db_client[DB_NAME]
            print("✅ Database connection established")
            return True
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
            return False
    
    def create_test_user(self) -> Dict[str, Any]:
        """Create a test user for WebSocket testing"""
        test_username = f"websocket_test_{int(time.time())}"
        test_data = {
            "username": test_username,
            "password": "TestPassword123!",
            "full_name": "WebSocket Test User",
            "organization_name": "WebSocket Test Org",
            "support_phone": "05551234567",
            "sector": "Kuaför"
        }
        
        try:
            response = self.session.post(f"{API_BASE}/register", json=test_data)
            if response.status_code == 200:
                user_data = response.json()
                print(f"✅ Test user created: {test_username}")
                return {"user_data": user_data, "credentials": test_data}
            else:
                print(f"❌ User creation failed: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            print(f"❌ User creation error: {e}")
            return None
    
    def authenticate_user(self, username: str, password: str) -> bool:
        """Authenticate user and get JWT token"""
        try:
            auth_data = {
                "username": username,
                "password": password
            }
            
            response = self.session.post(
                f"{API_BASE}/token",
                data=auth_data,  # Form data for OAuth2
                headers={"Content-Type": "application/x-www-form-urlencoded"}
            )
            
            if response.status_code == 200:
                token_data = response.json()
                self.auth_token = token_data["access_token"]
                
                # Decode token to get organization_id
                import base64
                payload = json.loads(base64.b64decode(self.auth_token.split('.')[1] + '=='))
                self.organization_id = payload.get('org_id')
                
                # Set authorization header
                self.session.headers.update({
                    "Authorization": f"Bearer {self.auth_token}"
                })
                
                print(f"✅ Authentication successful. Org ID: {self.organization_id}")
                return True
            else:
                print(f"❌ Authentication failed: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ Authentication error: {e}")
            return False
    
    async def setup_socket_client(self) -> bool:
        """Setup Socket.IO client connection"""
        try:
            self.socket_client = socketio.AsyncClient(
                logger=False,
                engineio_logger=False
            )
            
            # Event handlers
            @self.socket_client.event
            async def connect():
                self.connection_status = True
                self.received_events.append({
                    'event': 'connect',
                    'timestamp': datetime.now().isoformat(),
                    'data': {'status': 'connected'}
                })
                print("✅ WebSocket connected")
            
            @self.socket_client.event
            async def disconnect():
                self.connection_status = False
                self.received_events.append({
                    'event': 'disconnect',
                    'timestamp': datetime.now().isoformat()
                })
                print("🔌 WebSocket disconnected")
            
            @self.socket_client.event
            async def connection_established(data):
                self.received_events.append({
                    'event': 'connection_established',
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                })
                print(f"✅ Connection established: {data}")
            
            @self.socket_client.event
            async def joined_organization(data):
                self.received_events.append({
                    'event': 'joined_organization',
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                })
                print(f"✅ Joined organization: {data}")
            
            @self.socket_client.event
            async def appointment_created(data):
                self.received_events.append({
                    'event': 'appointment_created',
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                })
                print(f"📅 Appointment created event: {data}")
            
            @self.socket_client.event
            async def appointment_updated(data):
                self.received_events.append({
                    'event': 'appointment_updated',
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                })
                print(f"📝 Appointment updated event: {data}")
            
            @self.socket_client.event
            async def appointment_deleted(data):
                self.received_events.append({
                    'event': 'appointment_deleted',
                    'timestamp': datetime.now().isoformat(),
                    'data': data
                })
                print(f"🗑️ Appointment deleted event: {data}")
            
            # Connect to Socket.IO server
            await self.socket_client.connect(
                SOCKET_URL,
                transports=['websocket', 'polling'],
                wait_timeout=10
            )
            
            # Wait for connection
            await asyncio.sleep(2)
            
            if self.connection_status:
                print("✅ Socket.IO client setup successful")
                return True
            else:
                print("❌ Socket.IO connection failed")
                return False
                
        except Exception as e:
            print(f"❌ Socket.IO setup error: {e}")
            return False
    
    async def test_organization_room_join(self) -> bool:
        """Test joining organization room"""
        try:
            if not self.socket_client or not self.organization_id:
                print("❌ Socket client or organization ID not available")
                return False
            
            # Join organization room
            await self.socket_client.emit('join_organization', {
                'organization_id': self.organization_id
            })
            
            # Wait for response
            await asyncio.sleep(2)
            
            # Check if joined_organization event was received
            join_events = [e for e in self.received_events if e['event'] == 'joined_organization']
            if join_events:
                event_data = join_events[-1]['data']
                if event_data.get('organization_id') == self.organization_id:
                    print("✅ Organization room join successful")
                    return True
            
            print("❌ Organization room join failed - no confirmation received")
            return False
            
        except Exception as e:
            print(f"❌ Organization room join error: {e}")
            return False
    
    def get_services(self) -> list:
        """Get available services for appointment creation"""
        try:
            response = self.session.get(f"{API_BASE}/services")
            if response.status_code == 200:
                services = response.json()
                print(f"✅ Retrieved {len(services)} services")
                return services
            else:
                print(f"❌ Failed to get services: {response.status_code}")
                return []
        except Exception as e:
            print(f"❌ Services retrieval error: {e}")
            return []
    
    async def test_appointment_crud_events(self) -> Dict[str, bool]:
        """Test appointment CRUD operations and WebSocket events"""
        results = {
            'create': False,
            'update': False,
            'delete': False
        }
        
        try:
            # Get services first
            services = self.get_services()
            if not services:
                print("❌ No services available for testing")
                return results
            
            service = services[0]
            
            # Clear previous events
            self.received_events = [e for e in self.received_events if e['event'] not in ['appointment_created', 'appointment_updated', 'appointment_deleted']]
            
            # Test 1: Create Appointment
            print("\n🧪 Testing appointment creation...")
            appointment_data = {
                "customer_name": "WebSocket Test Customer",
                "phone": "05551234567",
                "service_id": service['id'],
                "appointment_date": "2025-01-20",
                "appointment_time": "14:30",
                "notes": "WebSocket test appointment"
            }
            
            response = self.session.post(f"{API_BASE}/appointments", json=appointment_data)
            if response.status_code == 200:
                created_appointment = response.json()
                appointment_id = created_appointment['id']
                print(f"✅ Appointment created: {appointment_id}")
                
                # Wait for WebSocket event
                await asyncio.sleep(3)
                
                # Check for appointment_created event
                create_events = [e for e in self.received_events if e['event'] == 'appointment_created']
                if create_events:
                    print("✅ appointment_created WebSocket event received")
                    results['create'] = True
                else:
                    print("❌ appointment_created WebSocket event NOT received")
                
                # Test 2: Update Appointment
                print("\n🧪 Testing appointment update...")
                update_data = {
                    "notes": "Updated via WebSocket test",
                    "status": "Tamamlandı"
                }
                
                response = self.session.put(f"{API_BASE}/appointments/{appointment_id}", json=update_data)
                if response.status_code == 200:
                    print("✅ Appointment updated")
                    
                    # Wait for WebSocket event
                    await asyncio.sleep(3)
                    
                    # Check for appointment_updated event
                    update_events = [e for e in self.received_events if e['event'] == 'appointment_updated']
                    if update_events:
                        print("✅ appointment_updated WebSocket event received")
                        results['update'] = True
                    else:
                        print("❌ appointment_updated WebSocket event NOT received")
                else:
                    print(f"❌ Appointment update failed: {response.status_code}")
                
                # Test 3: Delete Appointment
                print("\n🧪 Testing appointment deletion...")
                response = self.session.delete(f"{API_BASE}/appointments/{appointment_id}")
                if response.status_code == 200:
                    print("✅ Appointment deleted")
                    
                    # Wait for WebSocket event
                    await asyncio.sleep(3)
                    
                    # Check for appointment_deleted event
                    delete_events = [e for e in self.received_events if e['event'] == 'appointment_deleted']
                    if delete_events:
                        print("✅ appointment_deleted WebSocket event received")
                        results['delete'] = True
                    else:
                        print("❌ appointment_deleted WebSocket event NOT received")
                else:
                    print(f"❌ Appointment deletion failed: {response.status_code}")
            else:
                print(f"❌ Appointment creation failed: {response.status_code} - {response.text}")
        
        except Exception as e:
            print(f"❌ CRUD testing error: {e}")
        
        return results
    
    async def test_socket_io_endpoint(self) -> bool:
        """Test if Socket.IO endpoint is accessible"""
        try:
            # Test Socket.IO endpoint accessibility
            response = requests.get(f"{SOCKET_URL}/socket.io/", timeout=10)
            if response.status_code in [200, 400]:  # 400 is expected for GET without proper handshake
                print("✅ Socket.IO endpoint is accessible")
                return True
            else:
                print(f"❌ Socket.IO endpoint not accessible: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Socket.IO endpoint test error: {e}")
            return False
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            if self.socket_client and self.connection_status:
                await self.socket_client.disconnect()
            
            if self.db_client:
                self.db_client.close()
            
            print("✅ Cleanup completed")
        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")
    
    def print_event_summary(self):
        """Print summary of received WebSocket events"""
        print("\n📊 WebSocket Events Summary:")
        print("=" * 50)
        
        event_counts = {}
        for event in self.received_events:
            event_type = event['event']
            event_counts[event_type] = event_counts.get(event_type, 0) + 1
        
        for event_type, count in event_counts.items():
            print(f"  {event_type}: {count} events")
        
        print(f"\nTotal events received: {len(self.received_events)}")
        
        # Print detailed events
        if self.received_events:
            print("\n📋 Detailed Events:")
            for i, event in enumerate(self.received_events[-10:], 1):  # Last 10 events
                print(f"  {i}. {event['event']} at {event['timestamp']}")
                if 'data' in event:
                    print(f"     Data: {event['data']}")

async def main():
    """Main testing function"""
    print("🚀 Starting WebSocket Backend Testing")
    print("=" * 60)
    
    tester = WebSocketTester()
    test_results = {
        'socket_endpoint_accessible': False,
        'database_connection': False,
        'user_creation': False,
        'authentication': False,
        'websocket_connection': False,
        'organization_room_join': False,
        'appointment_crud_events': {
            'create': False,
            'update': False,
            'delete': False
        }
    }
    
    try:
        # Test 1: Socket.IO Endpoint Accessibility
        print("\n1️⃣ Testing Socket.IO Endpoint Accessibility...")
        test_results['socket_endpoint_accessible'] = await tester.test_socket_io_endpoint()
        
        # Test 2: Database Connection
        print("\n2️⃣ Testing Database Connection...")
        test_results['database_connection'] = await tester.setup_database()
        
        # Test 3: User Creation
        print("\n3️⃣ Creating Test User...")
        user_info = tester.create_test_user()
        if user_info:
            test_results['user_creation'] = True
            
            # Test 4: Authentication
            print("\n4️⃣ Testing Authentication...")
            auth_success = tester.authenticate_user(
                user_info['credentials']['username'],
                user_info['credentials']['password']
            )
            test_results['authentication'] = auth_success
            
            if auth_success:
                # Test 5: WebSocket Connection
                print("\n5️⃣ Testing WebSocket Connection...")
                ws_success = await tester.setup_socket_client()
                test_results['websocket_connection'] = ws_success
                
                if ws_success:
                    # Test 6: Organization Room Join
                    print("\n6️⃣ Testing Organization Room Join...")
                    room_success = await tester.test_organization_room_join()
                    test_results['organization_room_join'] = room_success
                    
                    # Test 7: Appointment CRUD Events
                    print("\n7️⃣ Testing Appointment CRUD WebSocket Events...")
                    crud_results = await tester.test_appointment_crud_events()
                    test_results['appointment_crud_events'] = crud_results
        
        # Print event summary
        tester.print_event_summary()
        
    except Exception as e:
        print(f"❌ Testing error: {e}")
    
    finally:
        await tester.cleanup()
    
    # Print final results
    print("\n" + "=" * 60)
    print("🏁 FINAL TEST RESULTS")
    print("=" * 60)
    
    print(f"Socket.IO Endpoint Accessible: {'✅' if test_results['socket_endpoint_accessible'] else '❌'}")
    print(f"Database Connection: {'✅' if test_results['database_connection'] else '❌'}")
    print(f"User Creation: {'✅' if test_results['user_creation'] else '❌'}")
    print(f"Authentication: {'✅' if test_results['authentication'] else '❌'}")
    print(f"WebSocket Connection: {'✅' if test_results['websocket_connection'] else '❌'}")
    print(f"Organization Room Join: {'✅' if test_results['organization_room_join'] else '❌'}")
    
    crud_results = test_results['appointment_crud_events']
    print(f"Appointment Created Event: {'✅' if crud_results['create'] else '❌'}")
    print(f"Appointment Updated Event: {'✅' if crud_results['update'] else '❌'}")
    print(f"Appointment Deleted Event: {'✅' if crud_results['delete'] else '❌'}")
    
    # Overall success
    all_basic_tests = all([
        test_results['socket_endpoint_accessible'],
        test_results['websocket_connection'],
        test_results['organization_room_join']
    ])
    
    all_crud_tests = all(crud_results.values())
    
    print(f"\nOverall WebSocket Implementation: {'✅ WORKING' if all_basic_tests and all_crud_tests else '❌ ISSUES FOUND'}")
    
    return test_results

if __name__ == "__main__":
    asyncio.run(main())