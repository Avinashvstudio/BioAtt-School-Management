#!/usr/bin/env python3
"""
Seed BioAtt client demo data:
- Teachers (password: 123456)
- Parents (password: 1234567890)
- Students (3 per class/section)
- Classes + full weekly timetables

Run: python seed_client_demo.py
"""

import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import auth, credentials, firestore

SERVICE_ACCOUNT = os.path.join(
    os.path.dirname(__file__),
    'bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json',
)

TEACHER_PASSWORD = '123456'
PARENT_PASSWORD = '1234567890'

DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
PERIODS = [
    {'period': 1, 'start': '09:00', 'end': '09:45'},
    {'period': 2, 'start': '09:45', 'end': '10:30'},
    {'period': 3, 'start': '10:30', 'end': '11:15'},
    {'period': 4, 'start': '11:15', 'end': '12:00'},
    {'period': 5, 'start': '12:00', 'end': '12:45'},
    {'period': 6, 'start': '12:45', 'end': '13:30'},
]

# --- Demo teachers ---
TEACHERS = [
    {
        'name': 'Sarah Johnson',
        'email': 'sarah.johnson@demo.com',
        'className': '6',
        'section': 'A',
        'subjects': 'English, Maths, Telugu',
    },
    {
        'name': 'Priya Sharma',
        'email': 'priya.sharma@demo.com',
        'className': '6',
        'section': 'B',
        'subjects': 'English, Hindi, Science',
    },
    {
        'name': 'Amit Kumar',
        'email': 'amit.kumar@demo.com',
        'className': '6',
        'section': 'C',
        'subjects': 'Maths, Social, Telugu',
    },
    {
        'name': 'Rajesh Singh',
        'email': 'rajesh.singh@demo.com',
        'className': '8',
        'section': 'A',
        'subjects': 'Science, Maths, English',
    },
    {
        'name': 'Michael Chen',
        'email': 'michael.chen@demo.com',
        'className': '9',
        'section': 'A',
        'subjects': 'English, History, Geography',
    },
    {
        'name': 'Neha Patel',
        'email': 'neha.patel@demo.com',
        'className': '10',
        'section': 'A',
        'subjects': 'Physics, Chemistry, Maths',
    },
]

# --- Parents (one per student group / family) ---
PARENTS = [
    {'name': 'Emily Davis', 'email': 'emily.davis@demo.com'},
    {'name': 'Robert Wilson', 'email': 'robert.wilson@demo.com'},
    {'name': 'Anita Reddy', 'email': 'anita.reddy@demo.com'},
    {'name': 'Suresh Nair', 'email': 'suresh.nair@demo.com'},
    {'name': 'Kavitha Rao', 'email': 'kavitha.rao@demo.com'},
    {'name': 'James Brown', 'email': 'james.brown@demo.com'},
    {'name': 'Meera Iyer', 'email': 'meera.iyer@demo.com'},
    {'name': 'Vikram Das', 'email': 'vikram.das@demo.com'},
    {'name': 'Lakshmi Menon', 'email': 'lakshmi.menon@demo.com'},
    {'name': 'Arun Pillai', 'email': 'arun.pillai@demo.com'},
    {'name': 'Deepa Krishnan', 'email': 'deepa.krishnan@demo.com'},
    {'name': 'Sanjay Gupta', 'email': 'sanjay.gupta@demo.com'},
    {'name': 'Pooja Verma', 'email': 'pooja.verma@demo.com'},
    {'name': 'Rahul Mehta', 'email': 'rahul.mehta@demo.com'},
    {'name': 'Divya Shah', 'email': 'divya.shah@demo.com'},
    {'name': 'Kiran Joshi', 'email': 'kiran.joshi@demo.com'},
    {'name': 'Nisha Kapoor', 'email': 'nisha.kapoor@demo.com'},
    {'name': 'Harish Malhotra', 'email': 'harish.malhotra@demo.com'},
]

# --- Students: 3 per class/section ---
STUDENT_NAMES = [
    ['Arjun Reddy', 'Sneha Reddy', 'Karthik Reddy'],
    ['Riya Sharma', 'Aarav Sharma', 'Isha Sharma'],
    ['Dev Kumar', 'Ananya Kumar', 'Rohan Kumar'],
    ['Aditi Singh', 'Vihaan Singh', 'Myra Singh'],
    ['Aryan Chen', 'Diya Chen', 'Kabir Chen'],
    ['Ishaan Patel', 'Sara Patel', 'Navya Patel'],
]

CLASSES = [
    {'name': '6', 'section': 'A', 'teacher_email': 'sarah.johnson@demo.com'},
    {'name': '6', 'section': 'B', 'teacher_email': 'priya.sharma@demo.com'},
    {'name': '6', 'section': 'C', 'teacher_email': 'amit.kumar@demo.com'},
    {'name': '8', 'section': 'A', 'teacher_email': 'rajesh.singh@demo.com'},
    {'name': '9', 'section': 'A', 'teacher_email': 'michael.chen@demo.com'},
    {'name': '10', 'section': 'A', 'teacher_email': 'neha.patel@demo.com'},
]

TIMETABLE_ROTATIONS = {
    '6': {
        'Monday':    ['English', 'Hindi', 'Maths', 'Social', 'Telugu', 'Science'],
        'Tuesday':   ['Maths', 'English', 'Science', 'Hindi', 'Social', 'Telugu'],
        'Wednesday': ['Science', 'Maths', 'English', 'Telugu', 'Hindi', 'Social'],
        'Thursday':  ['Social', 'Telugu', 'Hindi', 'Maths', 'English', 'Science'],
        'Friday':    ['Telugu', 'Science', 'Social', 'English', 'Maths', 'Hindi'],
        'Saturday':  ['English', 'Maths', 'Telugu', 'Science', 'Social', 'Hindi'],
    },
    '8': {
        'Monday':    ['Maths', 'Science', 'English', 'Social', 'Hindi', 'Computer'],
        'Tuesday':   ['English', 'Maths', 'Hindi', 'Science', 'Computer', 'Social'],
        'Wednesday': ['Science', 'English', 'Maths', 'Social', 'Hindi', 'Computer'],
        'Thursday':  ['Social', 'Hindi', 'Science', 'Maths', 'English', 'Computer'],
        'Friday':    ['Computer', 'Social', 'English', 'Science', 'Maths', 'Hindi'],
        'Saturday':  ['Maths', 'English', 'Science', 'Hindi', 'Social', 'Computer'],
    },
    '9': {
        'Monday':    ['English', 'History', 'Maths', 'Geography', 'Hindi', 'Science'],
        'Tuesday':   ['Maths', 'English', 'Science', 'History', 'Geography', 'Hindi'],
        'Wednesday': ['Science', 'Geography', 'English', 'Maths', 'History', 'Hindi'],
        'Thursday':  ['History', 'Hindi', 'Geography', 'English', 'Maths', 'Science'],
        'Friday':    ['Geography', 'Science', 'English', 'History', 'Hindi', 'Maths'],
        'Saturday':  ['English', 'Maths', 'History', 'Science', 'Geography', 'Hindi'],
    },
    '10': {
        'Monday':    ['Physics', 'Chemistry', 'Maths', 'English', 'Biology', 'Hindi'],
        'Tuesday':   ['Maths', 'Physics', 'English', 'Chemistry', 'Biology', 'Hindi'],
        'Wednesday': ['Chemistry', 'Maths', 'Biology', 'Physics', 'English', 'Hindi'],
        'Thursday':  ['Biology', 'English', 'Physics', 'Maths', 'Chemistry', 'Hindi'],
        'Friday':    ['English', 'Biology', 'Chemistry', 'Physics', 'Maths', 'Hindi'],
        'Saturday':  ['Maths', 'Physics', 'Chemistry', 'English', 'Biology', 'Hindi'],
    },
}


def init_app():
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def upsert_auth_user(email, password, name):
    email = email.lower().strip()
    try:
        user = auth.get_user_by_email(email)
        auth.update_user(user.uid, password=password, display_name=name)
        return user.uid, 'updated'
    except auth.UserNotFoundError:
        user = auth.create_user(email=email, password=password, display_name=name)
        return user.uid, 'created'


def batch_commit(db, batch, count):
    if count > 0:
        batch.commit()
    return db.batch(), 0


def main():
    db = init_app()
    now = now_iso()
    teacher_uids = {}
    parent_uids = {}

    print('\n=== Creating teachers (password: 123456) ===')
    for t in TEACHERS:
        uid, status = upsert_auth_user(t['email'], TEACHER_PASSWORD, t['name'])
        teacher_uids[t['email']] = uid
        db.collection('users').document(uid).set({
            'name': t['name'],
            'email': t['email'],
            'role': 'teacher',
            'className': t['className'],
            'section': t['section'],
            'subjects': t['subjects'],
            'updatedAt': now,
            'createdAt': now,
        }, merge=True)
        print(f'  [{status}] {t["name"]} - {t["email"]} -> Class {t["className"]}-{t["section"]}')

    print('\n=== Creating parents (password: 1234567890) ===')
    for i, p in enumerate(PARENTS):
        if i >= len(STUDENT_NAMES) * 3:
            break
        uid, status = upsert_auth_user(p['email'], PARENT_PASSWORD, p['name'])
        parent_uids[p['email']] = uid
        db.collection('users').document(uid).set({
            'name': p['name'],
            'email': p['email'],
            'role': 'parent',
            'className': '',
            'section': '',
            'subjects': '',
            'updatedAt': now,
            'createdAt': now,
        }, merge=True)
        print(f'  [{status}] {p["name"]} - {p["email"]}')

    print('\n=== Creating classes ===')
    for cls in CLASSES:
        teacher_email = cls['teacher_email']
        teacher = next(t for t in TEACHERS if t['email'] == teacher_email)
        uid = teacher_uids[teacher_email]
        doc_id = f'class_{cls["name"]}_{cls["section"]}'
        db.collection('classes').document(doc_id).set({
            'name': cls['name'],
            'section': cls['section'],
            'teacherId': uid,
            'teacherName': teacher['name'],
            'updatedAt': now,
            'createdAt': now,
        }, merge=True)
        print(f'  Class {cls["name"]} Section {cls["section"]} -> {teacher["name"]}')

    print('\n=== Creating students (3 per class) ===')
    parent_idx = 0
    batch = db.batch()
    batch_count = 0
    student_count = 0

    for ci, cls in enumerate(CLASSES):
        names = STUDENT_NAMES[ci]
        for si, student_name in enumerate(names):
            parent = PARENTS[parent_idx]
            parent_idx += 1
            doc_id = f'demo_{cls["name"]}{cls["section"]}_{si + 1:02d}'
            ref = db.collection('students').document(doc_id)
            batch.set(ref, {
                'name': student_name,
                'class': cls['name'],
                'section': cls['section'],
                'parentEmail': parent['email'],
                'bus': f'Bus {(ci % 3) + 1}',
                'rollNumber': f'{cls["name"]}{cls["section"]}{si + 1:03d}',
                'updatedAt': now,
                'createdAt': now,
            }, merge=True)
            batch_count += 1
            student_count += 1
            if batch_count >= 400:
                batch, batch_count = batch_commit(db, batch, batch_count)
        print(f'  Class {cls["name"]}-{cls["section"]}: {", ".join(names)}')

    batch, _ = batch_commit(db, batch, batch_count)

    print('\n=== Creating timetables ===')
    batch = db.batch()
    batch_count = 0
    tt_count = 0

    for cls in CLASSES:
        class_name = cls['name']
        section = cls['section']
        teacher_email = cls['teacher_email']
        teacher = next(t for t in TEACHERS if t['email'] == teacher_email)
        teacher_uid = teacher_uids[teacher_email]
        rotation = TIMETABLE_ROTATIONS[class_name]

        for day in DAYS:
            subjects = rotation[day]
            for slot, subject in zip(PERIODS, subjects):
                doc_id = f'{class_name}_{section}_{day}_{slot["period"]}'.replace(' ', '_')
                ref = db.collection('timetable').document(doc_id)
                batch.set(ref, {
                    'class': class_name,
                    'section': section,
                    'day': day,
                    'period': slot['period'],
                    'subject': subject,
                    'teacherId': teacher_uid,
                    'teacherName': teacher['name'],
                    'start': slot['start'],
                    'end': slot['end'],
                    'updatedAt': now,
                }, merge=True)
                batch_count += 1
                tt_count += 1
                if batch_count >= 400:
                    batch, batch_count = batch_commit(db, batch, batch_count)

        print(f'  Class {class_name}-{section}: 36 periods (Mon-Sat)')

    batch, _ = batch_commit(db, batch, batch_count)

    print('\n' + '=' * 60)
    print('CLIENT DEMO READY')
    print('=' * 60)
    print(f'Teachers: {len(TEACHERS)}  |  Password: {TEACHER_PASSWORD}')
    print(f'Parents:  {min(len(PARENTS), len(STUDENT_NAMES) * 3)}  |  Password: {PARENT_PASSWORD}')
    print(f'Students: {student_count}  |  Classes: {len(CLASSES)}')
    print(f'Timetable entries: {tt_count}')
    print('\n--- Login URLs ---')
    print('  Admin:   http://127.0.0.1:5001/admin_panal/admin/')
    print('  Teacher: http://127.0.0.1:5001/admin_panal/teacher/')
    print('  Parent:  http://127.0.0.1:5001/admin_panal/parent/')
    print('  Login:   http://127.0.0.1:5001/admin_panal/common/login.html')
    print('\n--- Sample teacher logins ---')
    for t in TEACHERS[:3]:
        print(f'  {t["email"]} / {TEACHER_PASSWORD}')
    print('\n--- Sample parent logins ---')
    for p in PARENTS[:3]:
        print(f'  {p["email"]} / {PARENT_PASSWORD}')
    print('=' * 60 + '\n')


if __name__ == '__main__':
    main()
