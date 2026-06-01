// Demo Data Setup Script
// This script populates the database with sample data for client demonstrations

import { getFirestore, collection, doc, setDoc, addDoc } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { getAuth, createUserWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { app } from '../common/firebase-init.js';

const db = getFirestore(app);
const auth = getAuth(app);

// Demo Users Data
const demoUsers = [
  {
    name: "Admin User",
    email: "admin@demo.com",
    password: "admin123",
    role: "admin",
    className: "",
    section: "",
    subjects: ""
  },
  {
    name: "Sarah Johnson",
    email: "sarah.johnson@demo.com", 
    password: "teacher123",
    role: "teacher",
    className: "Class 10",
    section: "A",
    subjects: "Mathematics, Physics"
  },
  {
    name: "Michael Chen",
    email: "michael.chen@demo.com",
    password: "teacher123", 
    role: "teacher",
    className: "Class 9",
    section: "B",
    subjects: "English, Literature"
  },
  {
    name: "Emily Davis",
    email: "emily.davis@demo.com",
    password: "parent123",
    role: "parent",
    className: "",
    section: "",
    subjects: ""
  },
  {
    name: "Robert Wilson",
    email: "robert.wilson@demo.com",
    password: "parent123",
    role: "parent", 
    className: "",
    section: "",
    subjects: ""
  },
  {
    name: "David Rodriguez",
    email: "david.rodriguez@demo.com",
    password: "driver123",
    role: "driver",
    className: "",
    section: "",
    subjects: ""
  }
];

// Demo Students Data
const demoStudents = [
  {
    name: "Alex Johnson",
    class: "Class 10",
    section: "A",
    parentEmail: "emily.davis@demo.com",
    bus: "Bus 1",
    rollNumber: "10A001"
  },
  {
    name: "Maya Chen", 
    class: "Class 10",
    section: "A",
    parentEmail: "emily.davis@demo.com",
    bus: "Bus 1",
    rollNumber: "10A002"
  },
  {
    name: "James Wilson",
    class: "Class 9", 
    section: "B",
    parentEmail: "robert.wilson@demo.com",
    bus: "Bus 2",
    rollNumber: "09B001"
  },
  {
    name: "Sophia Rodriguez",
    class: "Class 9",
    section: "B", 
    parentEmail: "robert.wilson@demo.com",
    bus: "Bus 2",
    rollNumber: "09B002"
  },
  {
    name: "Ethan Brown",
    class: "Class 8",
    section: "A",
    parentEmail: "emily.davis@demo.com",
    bus: "Bus 1",
    rollNumber: "08A001"
  }
];

// Demo Classes Data
const demoClasses = [
  {
    name: "Class 10",
    section: "A",
    teacherId: "teacher1",
    teacherName: "Sarah Johnson",
    subjects: ["Mathematics", "Physics", "Chemistry", "Biology", "English"]
  },
  {
    name: "Class 9", 
    section: "B",
    teacherId: "teacher2",
    teacherName: "Michael Chen",
    subjects: ["English", "Literature", "History", "Geography", "Mathematics"]
  },
  {
    name: "Class 8",
    section: "A", 
    teacherId: "teacher1",
    teacherName: "Sarah Johnson",
    subjects: ["Mathematics", "Science", "English", "Social Studies"]
  }
];

// Demo Attendance Data
const demoAttendance = [
  {
    studentId: "student1",
    studentName: "Alex Johnson",
    class: "Class 10",
    section: "A",
    date: new Date().toISOString().slice(0, 10),
    status: "Present",
    time: "08:30",
    teacherId: "teacher1"
  },
  {
    studentId: "student2",
    studentName: "Maya Chen",
    class: "Class 10", 
    section: "A",
    date: new Date().toISOString().slice(0, 10),
    status: "Present",
    time: "08:32",
    teacherId: "teacher1"
  },
  {
    studentId: "student3",
    studentName: "James Wilson",
    class: "Class 9",
    section: "B", 
    date: new Date().toISOString().slice(0, 10),
    status: "Absent",
    time: "08:30",
    teacherId: "teacher2"
  }
];

// Demo Timetable Data
const demoTimetable = [
  {
    class: "Class 10",
    section: "A",
    day: "Monday",
    period: 1,
    subject: "Mathematics",
    teacherId: "teacher1",
    teacherName: "Sarah Johnson",
    time: "08:00-09:00"
  },
  {
    class: "Class 10",
    section: "A", 
    day: "Monday",
    period: 2,
    subject: "Physics",
    teacherId: "teacher1",
    teacherName: "Sarah Johnson",
    time: "09:00-10:00"
  },
  {
    class: "Class 9",
    section: "B",
    day: "Monday", 
    period: 1,
    subject: "English",
    teacherId: "teacher2",
    teacherName: "Michael Chen",
    time: "08:00-09:00"
  }
];

// Demo Marks Data
const demoMarks = [
  {
    studentId: "student1",
    studentName: "Alex Johnson",
    class: "Class 10",
    section: "A",
    subject: "Mathematics",
    exam: "Mid Term",
    marks: 85,
    totalMarks: 100,
    date: new Date().toISOString().slice(0, 10),
    teacherId: "teacher1"
  },
  {
    studentId: "student2",
    studentName: "Maya Chen",
    class: "Class 10",
    section: "A",
    subject: "Physics", 
    exam: "Mid Term",
    marks: 92,
    totalMarks: 100,
    date: new Date().toISOString().slice(0, 10),
    teacherId: "teacher1"
  }
];

// Demo Notifications Data
const demoNotifications = [
  {
    title: "Parent-Teacher Meeting",
    message: "Annual parent-teacher meeting scheduled for next Friday at 3 PM.",
    role: "all",
    category: "general",
    time: Date.now() - 86400000 // 1 day ago
  },
  {
    title: "Sports Day Announcement",
    message: "Annual sports day will be held on 15th December. All students must participate.",
    role: "all",
    category: "event",
    time: Date.now() - 172800000 // 2 days ago
  },
  {
    title: "Class 10 Assignment Due",
    message: "Mathematics assignment due tomorrow. Please submit on time.",
    role: "teacher",
    category: "academic",
    time: Date.now() - 43200000 // 12 hours ago
  }
];

// Demo Buses Data
const demoBuses = [
  {
    number: "Bus 1",
    driverId: "driver1",
    driverName: "David Rodriguez",
    route: "North Route",
    capacity: 45,
    currentLocation: "School Gate",
    status: "Active"
  },
  {
    number: "Bus 2", 
    driverId: "driver2",
    driverName: "John Smith",
    route: "South Route",
    capacity: 40,
    currentLocation: "Route 2",
    status: "Active"
  }
];

// Demo Bus Attendance Data
const demoBusAttendance = [
  {
    busNumber: "Bus 1",
    studentId: "student1",
    studentName: "Alex Johnson",
    date: new Date().toISOString().slice(0, 10),
    pickupTime: "07:30",
    dropTime: "14:30",
    status: "Completed"
  },
  {
    busNumber: "Bus 1",
    studentId: "student2", 
    studentName: "Maya Chen",
    date: new Date().toISOString().slice(0, 10),
    pickupTime: "07:35",
    dropTime: "14:25",
    status: "Completed"
  }
];

// Function to create demo users
async function createDemoUsers() {
  console.log("Creating demo users...");
  
  for (const userData of demoUsers) {
    try {
      // Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        userData.email, 
        userData.password
      );
      
      // Create Firestore user document
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name: userData.name,
        email: userData.email,
        role: userData.role,
        className: userData.className,
        section: userData.section,
        subjects: userData.subjects,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created user: ${userData.name} (${userData.role})`);
      
    } catch (error) {
      console.error(`❌ Error creating user ${userData.name}:`, error.message);
    }
  }
}

// Function to create demo students
async function createDemoStudents() {
  console.log("Creating demo students...");
  
  for (const studentData of demoStudents) {
    try {
      const studentId = `demo_student_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'students', studentId), {
        ...studentData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created student: ${studentData.name}`);
      
    } catch (error) {
      console.error(`❌ Error creating student ${studentData.name}:`, error.message);
    }
  }
}

// Function to create demo classes
async function createDemoClasses() {
  console.log("Creating demo classes...");
  
  for (const classData of demoClasses) {
    try {
      const classId = `demo_class_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'classes', classId), {
        ...classData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created class: ${classData.name} ${classData.section}`);
      
    } catch (error) {
      console.error(`❌ Error creating class ${classData.name}:`, error.message);
    }
  }
}

// Function to create demo attendance
async function createDemoAttendance() {
  console.log("Creating demo attendance records...");
  
  for (const attendanceData of demoAttendance) {
    try {
      const attendanceId = `demo_attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'attendance', attendanceId), {
        ...attendanceData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created attendance record for: ${attendanceData.studentName}`);
      
    } catch (error) {
      console.error(`❌ Error creating attendance for ${attendanceData.studentName}:`, error.message);
    }
  }
}

// Function to create demo timetable
async function createDemoTimetable() {
  console.log("Creating demo timetable...");
  
  for (const timetableData of demoTimetable) {
    try {
      const timetableId = `demo_timetable_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'timetable', timetableId), {
        ...timetableData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created timetable entry: ${timetableData.subject} - ${timetableData.class} ${timetableData.section}`);
      
    } catch (error) {
      console.error(`❌ Error creating timetable entry:`, error.message);
    }
  }
}

// Function to create demo marks
async function createDemoMarks() {
  console.log("Creating demo marks...");
  
  for (const markData of demoMarks) {
    try {
      const markId = `demo_mark_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'marks', markId), {
        ...markData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created mark record for: ${markData.studentName} - ${markData.subject}`);
      
    } catch (error) {
      console.error(`❌ Error creating mark record:`, error.message);
    }
  }
}

// Function to create demo notifications
async function createDemoNotifications() {
  console.log("Creating demo notifications...");
  
  for (const notificationData of demoNotifications) {
    try {
      const notificationId = `demo_notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'notifications', notificationId), {
        ...notificationData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created notification: ${notificationData.title}`);
      
    } catch (error) {
      console.error(`❌ Error creating notification:`, error.message);
    }
  }
}

// Function to create demo buses
async function createDemoBuses() {
  console.log("Creating demo buses...");
  
  for (const busData of demoBuses) {
    try {
      const busId = `demo_bus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'buses', busId), {
        ...busData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created bus: ${busData.number}`);
      
    } catch (error) {
      console.error(`❌ Error creating bus ${busData.number}:`, error.message);
    }
  }
}

// Function to create demo bus attendance
async function createDemoBusAttendance() {
  console.log("Creating demo bus attendance...");
  
  for (const busAttendanceData of demoBusAttendance) {
    try {
      const busAttendanceId = `demo_bus_attendance_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await setDoc(doc(db, 'bus_attendance', busAttendanceId), {
        ...busAttendanceData,
        createdAt: new Date().toISOString(),
        isDemo: true
      });
      
      console.log(`✅ Created bus attendance for: ${busAttendanceData.studentName}`);
      
    } catch (error) {
      console.error(`❌ Error creating bus attendance:`, error.message);
    }
  }
}

// Main function to setup all demo data
async function setupDemoData() {
  console.log("🚀 Starting Demo Data Setup...");
  console.log("This will create sample data for client demonstrations");
  
  try {
    // Create all demo data
    await createDemoUsers();
    await createDemoStudents();
    await createDemoClasses();
    await createDemoAttendance();
    await createDemoTimetable();
    await createDemoMarks();
    await createDemoNotifications();
    await createDemoBuses();
    await createDemoBusAttendance();
    
    console.log("🎉 Demo data setup completed successfully!");
    console.log("📋 Demo Credentials:");
    console.log("Admin: admin@demo.com / admin123");
    console.log("Teacher: sarah.johnson@demo.com / teacher123");
    console.log("Parent: emily.davis@demo.com / parent123");
    console.log("Driver: david.rodriguez@demo.com / driver123");
    
  } catch (error) {
    console.error("❌ Error setting up demo data:", error);
  }
}

// Export the setup function
export { setupDemoData };

// Make it available globally for testing
window.setupDemoData = setupDemoData;
