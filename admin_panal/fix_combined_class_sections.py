"""
Split Firestore class documents that store multiple sections in one field (e.g. section: "A,B,C").
Creates one class document per section. Run once from admin_panal:

  python fix_combined_class_sections.py

Does not delete the old combined document (review in Firebase Console after run).
"""

import os
import re

import firebase_admin
from firebase_admin import credentials, firestore

MULTI = re.compile(r'[,;/|&]+')


def init_db():
    if firebase_admin._apps:
        return firestore.client()
    path = os.getenv(
        'FIREBASE_SERVICE_ACCOUNT',
        'bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json',
    )
    cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)
    return firestore.client()


def norm_section(s):
    s = (s or '').strip().upper().replace(' ', '')
    if not s:
        return ''
    return MULTI.split(s)[0][:4]


def doc_id(name, section):
    n = (name or '').strip().replace(' ', '_')
    s = norm_section(section)
    return f'class_{n}_{s}'.replace('/', '_')


def main():
    db = init_db()
    created = 0
    for doc in db.collection('classes').stream():
        data = doc.to_dict()
        raw = (data.get('section') or '').strip()
        if not MULTI.search(raw):
            continue
        parts = [norm_section(p) for p in MULTI.split(raw) if norm_section(p)]
        print(f'Fixing {doc.id}: {data.get("name")} sections {raw} -> {parts}')
        for sec in parts:
            new_id = doc_id(data.get('name'), sec)
            ref = db.collection('classes').document(new_id)
            if ref.get().exists:
                print(f'  skip {new_id} (exists)')
                continue
            payload = dict(data)
            payload['section'] = sec
            ref.set(payload, merge=True)
            created += 1
            print(f'  created {new_id}')
    print(f'Done. Created {created} class document(s). Review/delete old combined rows in Console.')


if __name__ == '__main__':
    main()
