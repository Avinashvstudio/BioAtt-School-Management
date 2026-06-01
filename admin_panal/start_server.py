#!/usr/bin/env python3
"""
BioAtt Attendance System - Flask Server Startup Script
This script checks dependencies and starts the Flask server.
"""

import sys
import os
import subprocess
import importlib.util

def check_python_version():
    """Check if Python version is compatible."""
    if sys.version_info < (3, 8):
        print("❌ Error: Python 3.8 or higher is required.")
        print(f"Current version: {sys.version}")
        return False
    print(f"✅ Python version: {sys.version.split()[0]}")
    return True

def check_dependencies():
    """Check if required packages are installed."""
    required_packages = [
        'flask',
        'flask_cors',
        'python-dotenv',
        'firebase-admin'
    ]
    
    missing_packages = []
    
    for package in required_packages:
        try:
            importlib.util.find_spec(package.replace('-', '_'))
            print(f"✅ {package}")
        except ImportError:
            missing_packages.append(package)
            print(f"❌ {package} - Missing")
    
    if missing_packages:
        print(f"\n❌ Missing packages: {', '.join(missing_packages)}")
        print("Install them using: pip install -r requirements.txt")
        return False
    
    return True

def check_env_file():
    """Check if .env file exists and has required variables."""
    env_file = '.env'
    required_vars = ['GMAIL_USER', 'GMAIL_PASS']
    
    if not os.path.exists(env_file):
        print(f"❌ {env_file} file not found")
        print("Create it from env_example.txt and add your Gmail credentials")
        return False
    
    # Check if required variables are set
    from dotenv import load_dotenv
    load_dotenv()
    
    missing_vars = []
    for var in required_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        print(f"❌ Missing environment variables: {', '.join(missing_vars)}")
        print("Please set them in your .env file")
        return False
    
    print("✅ Environment variables configured")
    return True

def start_server():
    """Start the Flask server."""
    try:
        print("\n🚀 Starting BioAtt Attendance Flask Server...")
        print("Server will be available at: http://localhost:5001")
        print("Press Ctrl+C to stop the server\n")
        
        # Import and run the Flask app
        from app import app
        app.run(debug=True, port=5001, host='0.0.0.0')
        
    except KeyboardInterrupt:
        print("\n\n🛑 Server stopped by user")
    except Exception as e:
        print(f"\n❌ Error starting server: {e}")
        return False
    
    return True

def main():
    """Main function to run all checks and start server."""
    print("🔍 BioAtt Attendance System - Server Startup Check")
    print("=" * 50)
    
    # Run all checks
    checks = [
        ("Python Version", check_python_version),
        ("Dependencies", check_dependencies),
        ("Environment", check_env_file)
    ]
    
    all_passed = True
    for check_name, check_func in checks:
        print(f"\n📋 Checking {check_name}...")
        if not check_func():
            all_passed = False
    
    if not all_passed:
        print("\n❌ Setup incomplete. Please fix the issues above.")
        print("\n💡 Quick fixes:")
        print("1. Install dependencies: pip install -r requirements.txt")
        print("2. Create .env file from env_example.txt")
        print("3. Add your Gmail credentials to .env")
        return 1
    
    print("\n✅ All checks passed!")
    
    # Start the server
    return start_server()

if __name__ == "__main__":
    sys.exit(0 if main() else 1)
