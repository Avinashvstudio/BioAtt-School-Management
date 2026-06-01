#!/usr/bin/env python3
"""Seed a full weekly timetable for Class 6 (sections A, B, C)."""

import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

SERVICE_ACCOUNT = os.path.join(
    os.path.dirname(__file__),
    'bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json',
)

CLASS_NAME = '6'
SECTIONS = ['A', 'B', 'C']
DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

PERIODS = [
    {'period': 1, 'start': '09:00', 'end': '09:45'},
    {'period': 2, 'start': '09:45', 'end': '10:30'},
    {'period': 3, 'start': '10:30', 'end': '11:15'},
    {'period': 4, 'start': '11:15', 'end': '12:00'},
    {'period': 5, 'start': '12:00', 'end': '12:45'},
    {'period': 6, 'start': '12:45', 'end': '13:30'},
]

WEEKLY_SUBJECTS = {
    'Monday':    ['English', 'Hindi', 'Maths', 'Social', 'Telugu', 'Science'],
    'Tuesday':   ['Maths', 'English', 'Science', 'Hindi', 'Social', 'Telugu'],
    'Wednesday': ['Science', 'Maths', 'English', 'Telugu', 'Hindi', 'Social'],
    'Thursday':  ['Social', 'Telugu', 'Hindi', 'Maths', 'English', 'Science'],
    'Friday':    ['Telugu', 'Science', 'Social', 'English', 'Maths', 'Hindi'],
    'Saturday':  ['English', 'Maths', 'Telugu', 'Science', 'Social', 'Hindi'],
}

SUBJECT_TEACHERS = {
    'English': 'Sarah Johnson',
    'Maths': 'Sarah Johnson',
    'Science': 'Michael Chen',
    'Hindi': 'Michael Chen',
    'Social': 'Michael Chen',
    'Telugu': 'Sarah Johnson',
}


def init_db():
    if not firebase_admin._apps:
        cred = credentials.Certificate(SERVICE_ACCOUNT)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def load_teacher_ids(db):
    ids = {}
    for doc in db.collection('users').stream():
        data = doc.to_dict()
        email = (data.get('email') or '').lower()
        if email == 'sarah.johnson@demo.com':
            ids['Sarah Johnson'] = doc.id
        elif email == 'michael.chen@demo.com':
            ids['Michael Chen'] = doc.id
    return ids


def entry_id(class_name, section, day, period):
    return f'{class_name}_{section}_{day}_{period}'.replace(' ', '_')


def main():
    db = init_db()
    now = datetime.now(timezone.utc).isoformat()
    teacher_ids = load_teacher_ids(db)
    print('Teacher IDs:', teacher_ids)

    batch = db.batch()
    count = 0

    for section in SECTIONS:
        for day in DAYS:
            subjects = WEEKLY_SUBJECTS[day]
            for slot, subject in zip(PERIODS, subjects):
                teacher_name = SUBJECT_TEACHERS.get(subject, 'Sarah Johnson')
                teacher_id = teacher_ids.get(teacher_name, teacher_ids.get('Sarah Johnson', ''))

                doc_id = entry_id(CLASS_NAME, section, day, slot['period'])
                ref = db.collection('timetable').document(doc_id)
                batch.set(ref, {
                    'class': CLASS_NAME,
                    'section': section,
                    'day': day,
                    'period': slot['period'],
                    'subject': subject,
                    'teacherId': teacher_id,
                    'teacherName': teacher_name,
                    'start': slot['start'],
                    'end': slot['end'],
                    'updatedAt': now,
                }, merge=True)
                count += 1

                if count % 400 == 0:
                    batch.commit()
                    batch = db.batch()

    batch.commit()
    print(f'Class 6 timetable saved: {count} entries ({len(SECTIONS)} sections x 6 days x 6 periods)')


if __name__ == '__main__':
    main()
