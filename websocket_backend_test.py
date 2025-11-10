#!/usr/bin/env python3
"""
WebSocket Backend Functionality Test
Tests the WebSocket implementation by verifying API endpoints and event emission
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
from motor.motor_asyncio import AsyncIOMotorClient

# Configuration
BACKEND_URL = "https://appointflow-39.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"
MONGO_URL = os.environ.get('MONGO_URL', 'mongodb://localhost:27017/royal_koltuk_dev')
DB_NAME = os.environ.get('DB_NAME', 'royal_koltuk_dev')

class WebSocketBackendTester:
    def __init__(self):
        self.session = requests.Session()
        self.auth_token = None
        self.organization_id = None
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
        test_username = f"ws_backend_test_{int(time.time())}"
        test_data = {
            "username": test_username,
            "password": "TestPassword123!",
            "full_name": "WebSocket Backend Test User",
            "organization_name": "WebSocket Backend Test Org",
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
                data=auth_data,
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
    
    def test_socket_io_server_accessibility(self) -> bool:
        """Test if Socket.IO server is accessible"""
        try:
            # Test internal Socket.IO endpoint
            response = requests.get("http://localhost:8001/socket.io/", timeout=5)
            if "Socket.IO" in response.text or "protocol" in response.text.lower():
                print("✅ Socket.IO server is accessible internally")
                return True
            else:
                print(f"❌ Socket.IO server not accessible: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Socket.IO server accessibility test error: {e}")
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
    
    async def verify_websocket_event_handlers(self) -> bool:
        """Verify that WebSocket event handlers are properly defined in the code"""
        try:
            # Check if the server.py file contains the WebSocket event handlers
            with open('/app/backend/server.py', 'r') as f:
                server_code = f.read()
            
            required_handlers = [
                '@sio.event',
                'async def connect',
                'async def disconnect',
                'async def join_organization',
                'async def leave_organization',
                'emit_to_organization'
            ]
            
            missing_handlers = []
            for handler in required_handlers:
                if handler not in server_code:
                    missing_handlers.append(handler)
            
            if not missing_handlers:
                print("✅ All WebSocket event handlers are defined")
                return True
            else:
                print(f"❌ Missing WebSocket handlers: {missing_handlers}")
                return False
                
        except Exception as e:
            print(f"❌ WebSocket handler verification error: {e}")
            return False
    
    async def verify_websocket_emissions_in_crud(self) -> Dict[str, bool]:
        """Verify that CRUD operations contain WebSocket event emissions"""
        results = {
            'create_emission': False,
            'update_emission': False,
            'delete_emission': False
        }
        
        try:
            with open('/app/backend/server.py', 'r') as f:
                server_code = f.read()
            
            # Check for WebSocket emissions in CRUD operations
            if 'emit_to_organization' in server_code and 'appointment_created' in server_code:
                results['create_emission'] = True
                print("✅ Appointment creation WebSocket emission found")
            else:
                print("❌ Appointment creation WebSocket emission NOT found")
            
            if 'emit_to_organization' in server_code and 'appointment_updated' in server_code:
                results['update_emission'] = True
                print("✅ Appointment update WebSocket emission found")
            else:
                print("❌ Appointment update WebSocket emission NOT found")
            
            if 'emit_to_organization' in server_code and 'appointment_deleted' in server_code:
                results['delete_emission'] = True
                print("✅ Appointment deletion WebSocket emission found")
            else:
                print("❌ Appointment deletion WebSocket emission NOT found")
            
        except Exception as e:
            print(f"❌ WebSocket emission verification error: {e}")
        
        return results
    
    async def test_appointment_crud_operations(self) -> Dict[str, bool]:
        """Test appointment CRUD operations (without WebSocket connection)"""
        results = {
            'create': False,
            'read': False,
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
            
            # Test 1: Create Appointment
            print("\n🧪 Testing appointment creation...")
            appointment_data = {
                "customer_name": "WebSocket Backend Test Customer",
                "phone": "05551234567",
                "service_id": service['id'],
                "appointment_date": "2025-01-20",
                "appointment_time": "14:30",
                "notes": "WebSocket backend test appointment"
            }
            
            response = self.session.post(f"{API_BASE}/appointments", json=appointment_data)
            if response.status_code == 200:
                created_appointment = response.json()
                appointment_id = created_appointment['id']
                print(f"✅ Appointment created: {appointment_id}")
                results['create'] = True
                
                # Test 2: Read Appointment
                print("\n🧪 Testing appointment retrieval...")
                response = self.session.get(f"{API_BASE}/appointments/{appointment_id}")
                if response.status_code == 200:
                    print("✅ Appointment retrieved successfully")
                    results['read'] = True
                else:
                    print(f"❌ Appointment retrieval failed: {response.status_code}")
                
                # Test 3: Update Appointment
                print("\n🧪 Testing appointment update...")
                update_data = {
                    "notes": "Updated via WebSocket backend test",
                    "status": "Tamamlandı"
                }
                
                response = self.session.put(f"{API_BASE}/appointments/{appointment_id}", json=update_data)
                if response.status_code == 200:
                    print("✅ Appointment updated successfully")
                    results['update'] = True
                else:
                    print(f"❌ Appointment update failed: {response.status_code}")
                
                # Test 4: Delete Appointment
                print("\n🧪 Testing appointment deletion...")
                response = self.session.delete(f"{API_BASE}/appointments/{appointment_id}")
                if response.status_code == 200:
                    print("✅ Appointment deleted successfully")
                    results['delete'] = True
                else:
                    print(f"❌ Appointment deletion failed: {response.status_code}")
            else:
                print(f"❌ Appointment creation failed: {response.status_code} - {response.text}")
        
        except Exception as e:
            print(f"❌ CRUD testing error: {e}")
        
        return results
    
    async def verify_socket_io_configuration(self) -> Dict[str, bool]:
        """Verify Socket.IO server configuration"""
        results = {
            'server_created': False,
            'asgi_app_created': False,
            'cors_configured': False,
            'event_handlers_defined': False
        }
        
        try:
            with open('/app/backend/server.py', 'r') as f:
                server_code = f.read()
            
            # Check Socket.IO server creation
            if 'sio = socketio.AsyncServer(' in server_code:
                results['server_created'] = True
                print("✅ Socket.IO server is created")
            else:
                print("❌ Socket.IO server creation NOT found")
            
            # Check ASGI app creation
            if 'socket_app = socketio.ASGIApp(sio' in server_code:
                results['asgi_app_created'] = True
                print("✅ Socket.IO ASGI app is created")
            else:
                print("❌ Socket.IO ASGI app creation NOT found")
            
            # Check CORS configuration
            if 'cors_allowed_origins' in server_code:
                results['cors_configured'] = True
                print("✅ CORS is configured for Socket.IO")
            else:
                print("❌ CORS configuration for Socket.IO NOT found")
            
            # Check event handlers
            if '@sio.event' in server_code and 'async def connect' in server_code:
                results['event_handlers_defined'] = True
                print("✅ Socket.IO event handlers are defined")
            else:
                print("❌ Socket.IO event handlers NOT properly defined")
            
        except Exception as e:
            print(f"❌ Socket.IO configuration verification error: {e}")
        
        return results
    
    async def cleanup(self):
        """Cleanup resources"""
        try:
            if self.db_client:
                self.db_client.close()
            print("✅ Cleanup completed")
        except Exception as e:
            print(f"⚠️ Cleanup error: {e}")

async def main():
    """Main testing function"""
    print("🚀 Starting WebSocket Backend Testing")
    print("=" * 60)
    
    tester = WebSocketBackendTester()
    test_results = {
        'database_connection': False,
        'socket_io_server_accessible': False,
        'socket_io_configuration': {},
        'websocket_event_handlers': False,
        'websocket_emissions_in_crud': {},
        'user_creation': False,
        'authentication': False,
        'appointment_crud_operations': {}
    }
    
    try:
        # Test 1: Database Connection
        print("\n1️⃣ Testing Database Connection...")
        test_results['database_connection'] = await tester.setup_database()
        
        # Test 2: Socket.IO Server Accessibility
        print("\n2️⃣ Testing Socket.IO Server Accessibility...")
        test_results['socket_io_server_accessible'] = tester.test_socket_io_server_accessibility()
        
        # Test 3: Socket.IO Configuration
        print("\n3️⃣ Verifying Socket.IO Configuration...")
        test_results['socket_io_configuration'] = await tester.verify_socket_io_configuration()
        
        # Test 4: WebSocket Event Handlers
        print("\n4️⃣ Verifying WebSocket Event Handlers...")
        test_results['websocket_event_handlers'] = await tester.verify_websocket_event_handlers()
        
        # Test 5: WebSocket Emissions in CRUD
        print("\n5️⃣ Verifying WebSocket Emissions in CRUD Operations...")
        test_results['websocket_emissions_in_crud'] = await tester.verify_websocket_emissions_in_crud()
        
        # Test 6: User Creation
        print("\n6️⃣ Creating Test User...")
        user_info = tester.create_test_user()
        if user_info:
            test_results['user_creation'] = True
            
            # Test 7: Authentication
            print("\n7️⃣ Testing Authentication...")
            auth_success = tester.authenticate_user(
                user_info['credentials']['username'],
                user_info['credentials']['password']
            )
            test_results['authentication'] = auth_success
            
            if auth_success:
                # Test 8: Appointment CRUD Operations
                print("\n8️⃣ Testing Appointment CRUD Operations...")
                crud_results = await tester.test_appointment_crud_operations()
                test_results['appointment_crud_operations'] = crud_results
        
    except Exception as e:
        print(f"❌ Testing error: {e}")
    
    finally:
        await tester.cleanup()
    
    # Print final results
    print("\n" + "=" * 60)
    print("🏁 FINAL WEBSOCKET BACKEND TEST RESULTS")
    print("=" * 60)
    
    print(f"Database Connection: {'✅' if test_results['database_connection'] else '❌'}")
    print(f"Socket.IO Server Accessible: {'✅' if test_results['socket_io_server_accessible'] else '❌'}")
    
    # Socket.IO Configuration
    config_results = test_results['socket_io_configuration']
    print(f"Socket.IO Server Created: {'✅' if config_results.get('server_created') else '❌'}")
    print(f"Socket.IO ASGI App Created: {'✅' if config_results.get('asgi_app_created') else '❌'}")
    print(f"Socket.IO CORS Configured: {'✅' if config_results.get('cors_configured') else '❌'}")
    print(f"Socket.IO Event Handlers Defined: {'✅' if config_results.get('event_handlers_defined') else '❌'}")
    
    print(f"WebSocket Event Handlers: {'✅' if test_results['websocket_event_handlers'] else '❌'}")
    
    # WebSocket Emissions
    emission_results = test_results['websocket_emissions_in_crud']
    print(f"Create Event Emission: {'✅' if emission_results.get('create_emission') else '❌'}")
    print(f"Update Event Emission: {'✅' if emission_results.get('update_emission') else '❌'}")
    print(f"Delete Event Emission: {'✅' if emission_results.get('delete_emission') else '❌'}")
    
    print(f"User Creation: {'✅' if test_results['user_creation'] else '❌'}")
    print(f"Authentication: {'✅' if test_results['authentication'] else '❌'}")
    
    # CRUD Operations
    crud_results = test_results['appointment_crud_operations']
    print(f"Appointment Create: {'✅' if crud_results.get('create') else '❌'}")
    print(f"Appointment Read: {'✅' if crud_results.get('read') else '❌'}")
    print(f"Appointment Update: {'✅' if crud_results.get('update') else '❌'}")
    print(f"Appointment Delete: {'✅' if crud_results.get('delete') else '❌'}")
    
    # Overall assessment
    critical_tests = [
        test_results['socket_io_server_accessible'],
        config_results.get('server_created', False),
        config_results.get('asgi_app_created', False),
        test_results['websocket_event_handlers'],
        all(emission_results.values()),
        all(crud_results.values())
    ]
    
    print(f"\nOverall WebSocket Backend Implementation: {'✅ WORKING' if all(critical_tests) else '❌ ISSUES FOUND'}")
    
    return test_results

if __name__ == "__main__":
    asyncio.run(main())