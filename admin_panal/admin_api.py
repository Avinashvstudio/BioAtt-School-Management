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


def _verify_token_only():
    """Verify Firebase ID token only (no Firestore profile required)."""
    if _db is None:
        return None, ('API not configured on server', 503)

    header = request.headers.get('Authorization', '')
    id_token = header.replace('Bearer ', '').strip()
    if not id_token:
        return None, ('Missing auth token', 401)

    try:
        decoded = auth.verify_id_token(id_token)
    except Exception as exc:
        return None, (f'Invalid token: {exc}', 401)

    return decoded, None


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
    if (profile.get('role') or '').strip().lower() != 'admin':
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


def _verify_driver():
    decoded, profile, err = _verify_token()
    if err:
        return None, None, err
    if (profile.get('role') or '').strip().lower() not in ('driver', 'admin'):
        return None, None, ('Driver access required', 403)
    return decoded, profile, None


def _driver_owns_bus(uid, bus_number):
    target = (bus_number or '').strip()
    if not target:
        return False
    for doc in _db.collection('buses').where('driverId', '==', uid).stream():
        if (doc.to_dict().get('number') or '').strip() == target:
            return True
    return False


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

    user_fields = {'name', 'email', 'role', 'className', 'section', 'subjects', 'assignedBuses', 'updatedAt', 'createdAt'}
    student_fields = {'name', 'class', 'section', 'parentEmail', 'bus', 'updatedAt', 'createdAt'}
    class_fields = {'name', 'section', 'teacherId', 'teacherName', 'updatedAt', 'createdAt'}

    @app.route('/api/admin/users', methods=['POST'])
    def admin_create_user():
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]

        data = request.get_json(silent=True) or {}
        email = _normalize_email(data.get('email'))
        password = data.get('password') or ''
        name = (data.get('name') or '').strip()
        role = (data.get('role') or '').strip().lower()

        if not name or not email or not password or not role:
            return jsonify({'error': 'name, email, password, and role are required'}), 400
        if role not in ('admin', 'teacher', 'parent', 'driver'):
            return jsonify({'error': 'Invalid role'}), 400
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters'}), 400
        if role == 'teacher':
            if not (data.get('className') or '').strip() or not (data.get('section') or '').strip():
                return jsonify({'error': 'Teachers need className and section'}), 400

        try:
            user_record = auth.create_user(
                email=email,
                password=password,
                display_name=name,
            )
        except Exception as exc:
            msg = str(exc)
            if 'EMAIL_EXISTS' in msg or 'already exists' in msg.lower():
                return jsonify({'error': 'This email is already registered. Edit the existing user or use another email.'}), 409
            return jsonify({'error': msg}), 400

        from datetime import datetime, timezone

        profile = _filter_fields(data, user_fields)
        profile.update({
            'name': name,
            'email': email,
            'role': role,
            'createdAt': datetime.now(timezone.utc).isoformat(),
        })
        if role != 'teacher':
            profile.setdefault('className', '')
            profile.setdefault('section', '')
            profile.setdefault('subjects', '')

        _db.collection('users').document(user_record.uid).set(profile, merge=True)
        return jsonify({'ok': True, 'uid': user_record.uid})

    @app.route('/api/admin/users/ensure-profile', methods=['POST'])
    def admin_ensure_user_profile():
        """Create or fix Firestore profile for an existing Firebase Auth email."""
        _, err = _verify_admin()
        if err:
            return jsonify({'error': err[0]}), err[1]

        data = request.get_json(silent=True) or {}
        email = _normalize_email(data.get('email'))
        role = (data.get('role') or '').strip().lower()
        name = (data.get('name') or '').strip()

        if not email or not role:
            return jsonify({'error': 'email and role are required'}), 400
        if role not in ('admin', 'teacher', 'parent', 'driver'):
            return jsonify({'error': 'Invalid role'}), 400

        try:
            auth_user = auth.get_user_by_email(email)
        except Exception:
            return jsonify({
                'error': f'No Firebase Auth account for {email}. Use Add New User to create login first.',
            }), 404

        from datetime import datetime, timezone

        profile = _filter_fields(data, user_fields)
        profile.update({
            'name': name or auth_user.display_name or email,
            'email': email,
            'role': role,
            'updatedAt': datetime.now(timezone.utc).isoformat(),
        })
        profile.setdefault('createdAt', datetime.now(timezone.utc).isoformat())

        _db.collection('users').document(auth_user.uid).set(profile, merge=True)
        return jsonify({
            'ok': True,
            'uid': auth_user.uid,
            'message': 'Profile saved. User can log in with this role now.',
        })

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

    @app.route('/api/user/profile', methods=['GET'])
    def user_profile():
        decoded, err = _verify_token_only()
        if err:
            return jsonify({'error': err[0]}), err[1]

        uid = decoded['uid']
        doc = _db.collection('users').document(uid).get()
        if not doc.exists():
            return jsonify({
                'error': 'User profile not found in Firestore',
                'uid': uid,
                'email': decoded.get('email', ''),
                'hint': 'Ask admin: Users → fill email/name/role → click Repair profile.',
            }), 404

        profile = doc.to_dict()
        profile['uid'] = uid
        return jsonify({'profile': profile})

    @app.route('/api/driver/bus-attendance', methods=['GET', 'POST'])
    def driver_bus_attendance():
        decoded, profile, err = _verify_driver()
        if err:
            return jsonify({'error': err[0]}), err[1]

        uid = decoded['uid']

        if request.method == 'GET':
            bus_number = (request.args.get('busNumber') or '').strip()
            student_id = (request.args.get('studentId') or '').strip()
            date_str = (request.args.get('date') or '').strip()
            if not bus_number or not student_id or not date_str:
                return jsonify({'error': 'busNumber, studentId, and date are required'}), 400
            if profile.get('role') != 'admin' and not _driver_owns_bus(uid, bus_number):
                return jsonify({'error': 'Not your assigned bus'}), 403

            doc_id = f'{bus_number}_{student_id}_{date_str}'
            doc = _db.collection('bus_attendance').document(doc_id).get()
            if not doc.exists:
                return jsonify({'record': None})
            row = doc.to_dict()
            row['id'] = doc.id
            return jsonify({'record': row})

        data = request.get_json(silent=True) or {}
        bus_number = (data.get('busNumber') or '').strip()
        student_id = (data.get('studentId') or '').strip()
        event_type = (data.get('type') or '').strip().lower()
        date_str = (data.get('date') or '').strip()
        parent_email = _normalize_email(data.get('parentEmail'))
        student_name = (data.get('studentName') or '').strip()

        if not bus_number or not student_id or event_type not in ('picked', 'dropped'):
            return jsonify({'error': 'busNumber, studentId, and type (picked|dropped) are required'}), 400
        if profile.get('role') != 'admin' and not _driver_owns_bus(uid, bus_number):
            return jsonify({'error': 'Not your assigned bus'}), 403

        from datetime import datetime, timezone

        if not date_str:
            date_str = datetime.now(timezone.utc).strftime('%Y-%m-%d')

        now_iso = datetime.now(timezone.utc).isoformat()
        doc_id = f'{bus_number}_{student_id}_{date_str}'
        update = {
            'busNumber': bus_number,
            'studentId': student_id,
            'driverId': uid,
            'date': date_str,
        }
        if event_type == 'picked':
            update['pickupTime'] = now_iso
        else:
            update['dropTime'] = now_iso

        _db.collection('bus_attendance').document(doc_id).set(update, merge=True)

        notification_created = False
        if parent_email and student_name:
            if event_type == 'picked':
                title = 'Bus Pickup Notification'
                message = f'{student_name} has been picked up by the bus.'
            else:
                title = 'Bus Drop Notification'
                message = f'{student_name} has been dropped off by the bus.'
            _db.collection('notifications').add({
                'title': title,
                'message': message,
                'recipientEmail': parent_email,
                'recipientRole': 'parent',
                'studentId': student_id,
                'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000),
                'busNumber': bus_number,
            })
            notification_created = True

        return jsonify({
            'ok': True,
            'recordId': doc_id,
            'notificationCreated': notification_created,
        })
