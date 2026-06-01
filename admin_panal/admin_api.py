import json
import os

import firebase_admin
from firebase_admin import auth, credentials, firestore
from flask import jsonify, request

_db = None
_initialized = False


def init_firebase_admin():
    global _db, _initialized
    if _initialized:
        return _db is not None
    _initialized = True

    if firebase_admin._apps:
        _db = firestore.client()
        return True

    json_env = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
    if json_env:
        try:
            cred = credentials.Certificate(json.loads(json_env))
            firebase_admin.initialize_app(cred)
            _db = firestore.client()
            return True
        except Exception as exc:
            print(f'Admin API disabled: invalid FIREBASE_SERVICE_ACCOUNT_JSON: {exc}')
            return False

    gac = os.getenv('GOOGLE_APPLICATION_CREDENTIALS')
    if gac and os.path.isfile(gac):
        cred = credentials.Certificate(gac)
        firebase_admin.initialize_app(cred)
        _db = firestore.client()
        return True

    default_path = os.path.join(
        os.path.dirname(__file__),
        'bioatt-attendance-25d06-firebase-adminsdk-fbsvc-8fded6b85d.json',
    )
    path = os.getenv('FIREBASE_SERVICE_ACCOUNT', default_path)
    if not os.path.isfile(path):
        print(f'Admin API disabled: service account not found at {path}')
        return False

    cred = credentials.Certificate(path)
    firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return True


def _verify_token():
    if _db is None:
        return None, None, ('API not configured on server', 503)

    header = request.headers.get('Authorization', '')
    id_token = header.replace('Bearer ', '').strip()
    if not id_token:
        return None, None, ('Missing auth token', 401)

    try:
        decoded = auth.verify_id_token(id_token)
    except Exception as exc:
        return None, None, (f'Invalid token: {exc}', 401)

    uid = decoded['uid']
    doc = _db.collection('users').document(uid).get()
    if not doc.exists:
        return None, None, ('User profile not found', 403)

    return decoded, doc.to_dict(), None


def _verify_admin():
    _, profile, err = _verify_token()
    if err:
        return None, err
    if profile.get('role') != 'admin':
        return None, ('Admin access required', 403)
    return _, None


def _verify_teacher():
    decoded, profile, err = _verify_token()
    if err:
        return None, None, err
    if profile.get('role') not in ('teacher', 'admin'):
        return None, None, ('Teacher access required', 403)
    return decoded, profile, None


def _verify_parent():
    decoded, profile, err = _verify_token()
    if err:
        return None, None, err
    if profile.get('role') not in ('parent', 'admin'):
        return None, None, ('Parent access required', 403)
    return decoded, profile, None


def _normalize_email(email):
    return (email or '').strip().lower()


def _parent_owns_student(profile, student_id):
    parent_email = _normalize_email(profile.get('email'))
    if not parent_email or not student_id:
        return False
    doc = _db.collection('students').document(student_id).get()
    if not doc.exists:
        return False
    return _normalize_email(doc.to_dict().get('parentEmail')) == parent_email


def _students_for_parent(profile):
    parent_email = _normalize_email(profile.get('email'))
    if not parent_email:
        return []
    students = []
    seen = set()
    for doc in _db.collection('students').stream():
        data = doc.to_dict()
        if _normalize_email(data.get('parentEmail')) != parent_email:
            continue
        if doc.id in seen:
            continue
        seen.add(doc.id)
        row = dict(data)
        row['id'] = doc.id
        students.append(row)
    return students


def _teacher_assigned_to_class(profile, class_name, section):
    section = (section or '').strip().upper()
    class_names = [s.strip() for s in (profile.get('className') or '').split(',') if s.strip()]
    sections = [s.strip().upper() for s in (profile.get('section') or '').split(',') if s.strip()]

    def class_matches(stored):
        stored = (stored or '').strip()
        target = (class_name or '').strip()
        if stored == target:
            return True
        if stored.lower() == target.lower():
            return True
        if stored.lower() == f'class {target}'.lower():
            return True
        if f'class {stored}'.lower() == target.lower():
            return True
        return False

    if class_names and sections:
        if len(class_names) == len(sections):
            for cls, sec in zip(class_names, sections):
                if class_matches(cls) and sec == section:
                    return True
        for cls in class_names:
            for sec in sections:
                if class_matches(cls) and sec == section:
                    return True
    return False


def _class_name_variants(class_name):
    class_name = (class_name or '').strip()
    variants = {class_name}
    if class_name and not class_name.lower().startswith('class '):
        variants.add(f'Class {class_name}')
    elif class_name.lower().startswith('class '):
        variants.add(class_name[6:].strip())
    return variants


def _ensure_teacher_can_access_class(decoded, profile, class_name, section):
    """Return None if allowed, else (message, status_code)."""
    class_name = (class_name or '').strip()
    section = (section or '').strip().upper()
    if not class_name or not section:
        return ('class and section are required', 400)

    if profile.get('role') == 'admin':
        return None

    uid = decoded['uid']
    if _teacher_assigned_to_class(profile, class_name, section):
        return None

    for cls in _class_name_variants(class_name):
        own = (
            _db.collection('timetable')
            .where('teacherId', '==', uid)
            .where('class', '==', cls)
            .where('section', '==', section)
            .limit(1)
            .stream()
        )
        if any(True for _ in own):
            return None

    for c in _db.collection('classes').where('teacherId', '==', uid).stream():
        data = c.to_dict()
        if _teacher_assigned_to_class(
            {'className': data.get('name', ''), 'section': data.get('section', '')},
            class_name,
            section,
        ):
            return None

    return ('Not assigned to this class/section', 403)


def _filter_fields(data, allowed):
    if not isinstance(data, dict):
        return {}
    return {k: v for k, v in data.items() if k in allowed}


def register_admin_routes(app):
    if not init_firebase_admin():
        return

    user_fields = {'name', 'email', 'role', 'className', 'section', 'subjects', 'updatedAt', 'createdAt'}
    student_fields = {'name', 'class', 'section', 'parentEmail', 'bus', 'updatedAt', 'createdAt'}
    class_fields = {'name', 'section', 'teacherId', 'teacherName', 'updatedAt', 'createdAt'}

    @app.route('/api/admin/users/<user_id>', methods=['PUT', 'PATCH'])
    def admin_update_user(user_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, user_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('users').document(user_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/users/<user_id>', methods=['DELETE'])
    def admin_delete_user(user_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('users').document(user_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/admin/students/<student_id>', methods=['PUT', 'PATCH'])
    def admin_update_student(student_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, student_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('students').document(student_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/students/<student_id>', methods=['DELETE'])
    def admin_delete_student(student_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('students').document(student_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/admin/classes/<class_id>', methods=['PUT', 'PATCH'])
    def admin_update_class(class_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        payload = _filter_fields(request.get_json(silent=True) or {}, class_fields)
        if not payload:
            return jsonify({'error': 'No valid fields to update'}), 400
        _db.collection('classes').document(class_id).update(payload)
        return jsonify({'ok': True})

    @app.route('/api/admin/classes/<class_id>', methods=['DELETE'])
    def admin_delete_class(class_id):
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]
        _db.collection('classes').document(class_id).delete()
        return jsonify({'ok': True})

    @app.route('/api/teacher/timetable', methods=['GET'])
    def teacher_timetable():
        decoded, profile, err = _verify_teacher()
        if err:
            return jsonify({'error': err[0]}), err[1]

        class_name = (request.args.get('class') or '').strip()
        section = (request.args.get('section') or '').strip().upper()
        denied = _ensure_teacher_can_access_class(decoded, profile, class_name, section)
        if denied:
            return jsonify({'error': denied[0]}), denied[1]

        entries = []
        seen_ids = set()
        for cls in _class_name_variants(class_name):
            snap = (
                _db.collection('timetable')
                .where('class', '==', cls)
                .where('section', '==', section)
                .stream()
            )
            for doc in snap:
                if doc.id in seen_ids:
                    continue
                seen_ids.add(doc.id)
                row = doc.to_dict()
                row['id'] = doc.id
                entries.append(row)

        return jsonify({'entries': entries})

    @app.route('/api/teacher/students', methods=['GET'])
    def teacher_students():
        decoded, profile, err = _verify_teacher()
        if err:
            return jsonify({'error': err[0]}), err[1]

        class_name = (request.args.get('class') or '').strip()
        section = (request.args.get('section') or '').strip().upper()
        denied = _ensure_teacher_can_access_class(decoded, profile, class_name, section)
        if denied:
            return jsonify({'error': denied[0]}), denied[1]

        students = []
        seen_ids = set()
        for cls in _class_name_variants(class_name):
            snap = (
                _db.collection('students')
                .where('class', '==', cls)
                .where('section', '==', section)
                .stream()
            )
            for doc in snap:
                if doc.id in seen_ids:
                    continue
                seen_ids.add(doc.id)
                row = doc.to_dict()
                row['id'] = doc.id
                students.append(row)

        return jsonify({'students': students})

    @app.route('/api/teacher/attendance', methods=['GET'])
    def teacher_attendance():
        decoded, profile, err = _verify_teacher()
        if err:
            return jsonify({'error': err[0]}), err[1]

        class_name = (request.args.get('class') or '').strip()
        section = (request.args.get('section') or '').strip().upper()
        date_str = (request.args.get('date') or '').strip()
        denied = _ensure_teacher_can_access_class(decoded, profile, class_name, section)
        if denied:
            return jsonify({'error': denied[0]}), denied[1]

        records = []
        seen_ids = set()
        for cls in _class_name_variants(class_name):
            q = (
                _db.collection('attendance')
                .where('class', '==', cls)
                .where('section', '==', section)
            )
            if date_str:
                q = q.where('date', '==', date_str)
            for doc in q.stream():
                if doc.id in seen_ids:
                    continue
                seen_ids.add(doc.id)
                row = doc.to_dict()
                row['id'] = doc.id
                records.append(row)

        return jsonify({'records': records})

    @app.route('/api/parent/students', methods=['GET'])
    def parent_students():
        _, profile, err = _verify_parent()
        if err:
            return jsonify({'error': err[0]}), err[1]
        return jsonify({'students': _students_for_parent(profile)})

    @app.route('/api/parent/attendance', methods=['GET'])
    def parent_attendance():
        _, profile, err = _verify_parent()
        if err:
            return jsonify({'error': err[0]}), err[1]
        student_id = (request.args.get('studentId') or '').strip()
        if not student_id:
            return jsonify({'error': 'studentId is required'}), 400
        if profile.get('role') != 'admin' and not _parent_owns_student(profile, student_id):
            return jsonify({'error': 'Not your child'}), 403
        records = []
        for doc in _db.collection('attendance').where('studentId', '==', student_id).stream():
            row = doc.to_dict()
            row['id'] = doc.id
            records.append(row)
        return jsonify({'records': records})

    @app.route('/api/parent/marks', methods=['GET'])
    def parent_marks():
        _, profile, err = _verify_parent()
        if err:
            return jsonify({'error': err[0]}), err[1]
        student_id = (request.args.get('studentId') or '').strip()
        if not student_id:
            return jsonify({'error': 'studentId is required'}), 400
        if profile.get('role') != 'admin' and not _parent_owns_student(profile, student_id):
            return jsonify({'error': 'Not your child'}), 403
        records = []
        for doc in _db.collection('marks').where('studentId', '==', student_id).stream():
            row = doc.to_dict()
            row['id'] = doc.id
            records.append(row)
        return jsonify({'records': records})

    @app.route('/api/parent/notifications', methods=['GET'])
    def parent_notifications():
        _, profile, err = _verify_parent()
        if err:
            return jsonify({'error': err[0]}), err[1]
        items = []
        seen = set()
        for role in ('parent', 'all'):
            for doc in _db.collection('notifications').where('role', '==', role).stream():
                if doc.id in seen:
                    continue
                seen.add(doc.id)
                row = doc.to_dict()
                row['id'] = doc.id
                items.append(row)
        items.sort(key=lambda x: x.get('time') or '', reverse=True)
        return jsonify({'notifications': items})
