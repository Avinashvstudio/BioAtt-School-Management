# BioAtt Attendance System - Project Setup Guide

## 🚀 **Project Overview**

This is a comprehensive school attendance management system with:
- **Android App**: Photo-based attendance capture using camera
- **Web Admin Panel**: Multi-role management system (Admin, Teacher, Parent, Driver)
- **Backend**: Flask server for email notifications
- **Database**: Firebase Firestore for web, Room SQLite for Android

## 📋 **Prerequisites**

### **For Android Development**
- Android Studio (latest version)
- Android SDK (API 24+)
- Java 8 or higher
- Android device/emulator with camera

### **For Web Development**
- Node.js (v16+)
- Python 3.8+
- Firebase account
- Gmail account with App Password

## 🔧 **Setup Instructions**

### **1. Android App Setup**

#### **Step 1: Open in Android Studio**
```bash
# Open the project folder in Android Studio
# Navigate to: app/school attaindence/app/
```

#### **Step 2: Sync Dependencies**
- Open `build.gradle.kts` in Android Studio
- Click "Sync Now" when prompted
- Wait for Gradle sync to complete

#### **Step 3: Configure Permissions**
The app requires these permissions (already configured in AndroidManifest.xml):
- Camera access
- Storage access
- Internet access
- Notifications

#### **Step 4: Build and Run**
- Connect Android device or start emulator
- Click "Run" button in Android Studio
- Grant permissions when prompted

### **2. Web Admin Panel Setup**

#### **Step 1: Install Dependencies**
```bash
cd admin_panal
pip install -r requirements.txt
```

#### **Step 2: Configure Environment Variables**
Create a `.env` file in the `admin_panal` folder:
```bash
# Copy from env_example.txt
GMAIL_USER=your-email@gmail.com
GMAIL_PASS=your-app-password
```

**Important**: For Gmail, use an App Password, not your regular password:
1. Enable 2-factor authentication on your Google account
2. Go to Google Account settings > Security > App passwords
3. Generate a new app password for "Mail"
4. Use that password in the .env file

#### **Step 3: Start Flask Server**
```bash
cd admin_panal
python app.py
```
The server will start on `http://localhost:5001`

#### **Step 4: Configure Firebase**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or use existing one
3. Enable Authentication and Firestore
4. Update `admin_panal/common/firebase-init.js` with your config

### **3. Firebase Configuration**

#### **Step 1: Authentication Setup**
1. In Firebase Console, go to Authentication > Sign-in method
2. Enable Email/Password authentication
3. Create initial admin user:
   ```javascript
   // In Firebase Console > Authentication > Users
   // Add user with email and password
   // Then in Firestore, create document:
   {
     "name": "Admin User",
     "email": "admin@school.com",
     "role": "admin",
     "createdAt": "2024-01-01T00:00:00.000Z"
   }
   ```

#### **Step 2: Firestore Database Setup**
1. Go to Firestore Database in Firebase Console
2. Create collections:
   - `users` - for user management
   - `students` - for student records
   - `classes` - for class information
   - `attendance` - for attendance records
   - `marks` - for exam results
   - `notifications` - for system notifications

#### **Step 3: Security Rules**
Set up Firestore security rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Teachers can read/write attendance and marks for their classes
    match /attendance/{docId} {
      allow read, write: if request.auth != null;
    }
    
    // Students and parents can read relevant data
    match /students/{studentId} {
      allow read: if request.auth != null;
    }
  }
}
```

## 🎯 **Testing the System**

### **1. Test Android App**
1. **Registration**: Register a new student/employee
2. **Attendance**: Mark attendance using camera
3. **Admin Panel**: View reports and manage data

### **2. Test Web Panel**
1. **Login**: Use admin credentials
2. **User Management**: Create new users
3. **Student Management**: Add students
4. **Attendance**: Mark attendance (teachers)
5. **Reports**: Generate and view reports

### **3. Test Email Notifications**
1. Configure Gmail credentials in `.env`
2. Mark attendance for a student
3. Check if parent receives email notification

## 🐛 **Troubleshooting**

### **Common Issues**

#### **Android App**
- **Camera not working**: Check camera permissions
- **App crashes**: Check logcat for error details
- **Build errors**: Sync Gradle files

#### **Web Panel**
- **Firebase connection error**: Check firebase-init.js configuration
- **Email not sending**: Verify Gmail credentials and App Password
- **Login issues**: Check Firestore user documents

#### **Flask Server**
- **Port already in use**: Change port in app.py
- **Import errors**: Install missing Python packages
- **Email errors**: Check SMTP settings and credentials

### **Debug Steps**
1. Check browser console for JavaScript errors
2. Check Flask server logs for Python errors
3. Check Android logcat for app errors
4. Verify Firebase configuration
5. Test email credentials separately

## 📱 **User Roles & Access**

### **Admin**
- Full system access
- User management
- Student management
- Class management
- System reports

### **Teacher**
- View assigned classes
- Mark attendance
- Enter marks
- View student lists
- Generate class reports

### **Parent**
- View child's attendance
- View child's marks
- Receive notifications
- Track bus status

### **Driver**
- Mark student pickup/drop
- Update bus status
- Send notifications to parents

## 🔒 **Security Considerations**

1. **Firebase Security Rules**: Configure proper access control
2. **Email Security**: Use App Passwords, not regular passwords
3. **HTTPS**: Use HTTPS in production
4. **Input Validation**: Validate all user inputs
5. **Authentication**: Implement proper role-based access

## 🚀 **Deployment**

### **Android App**
- Build APK or AAB in Android Studio
- Sign with release keystore
- Upload to Google Play Store

### **Web Panel**
- Deploy to Firebase Hosting
- Configure custom domain
- Set up production environment variables

### **Flask Backend**
- Deploy to cloud platform (Heroku, AWS, etc.)
- Set production environment variables
- Configure production email settings

## 📞 **Support**

For issues and questions:
1. Check this setup guide
2. Review error logs
3. Check Firebase Console
4. Verify configuration files
5. Test individual components

## 🎉 **Success Indicators**

The system is working correctly when:
- ✅ Android app can capture photos and mark attendance
- ✅ Web panel loads without errors
- ✅ Users can log in with proper roles
- ✅ Attendance can be marked and viewed
- ✅ Email notifications are sent
- ✅ Reports can be generated
- ✅ All user roles have appropriate access

---

**Note**: This is a comprehensive system. Start with basic functionality and gradually test advanced features. Ensure all components are working before deploying to production.
