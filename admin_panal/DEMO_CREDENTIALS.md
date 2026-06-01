# BioAtt Client Demo Credentials

Run the seeder:

```powershell
cd admin_panal
python seed_client_demo.py
```

## Passwords

| Role | Password |
|------|----------|
| **Teachers** | `123456` |
| **Parents** | `1234567890` |
| **Admin** (existing) | `admin123` |

## Portals

- Admin: http://127.0.0.1:5001/admin_panal/admin/
- Teacher: http://127.0.0.1:5001/admin_panal/teacher/
- Parent: http://127.0.0.1:5001/admin_panal/parent/
- Login: http://127.0.0.1:5001/admin_panal/common/login.html

## Teachers

| Name | Email | Class |
|------|-------|-------|
| Sarah Johnson | sarah.johnson@demo.com | 6-A |
| Priya Sharma | priya.sharma@demo.com | 6-B |
| Amit Kumar | amit.kumar@demo.com | 6-C |
| Rajesh Singh | rajesh.singh@demo.com | 8-A |
| Michael Chen | michael.chen@demo.com | 9-A |
| Neha Patel | neha.patel@demo.com | 10-A |

## Parents (sample)

| Name | Email |
|------|-------|
| Emily Davis | emily.davis@demo.com |
| Robert Wilson | robert.wilson@demo.com |
| Anita Reddy | anita.reddy@demo.com |
| Suresh Nair | suresh.nair@demo.com |

*(18 parents total, one per student)*

## Students

3 students per class across 6 class/sections (18 total):

- Class **6** - Sections A, B, C
- Class **8** - Section A
- Class **9** - Section A
- Class **10** - Section A

## Timetables

Full Mon-Sat, 6 periods/day for every class section.

## Demo flow

1. **Admin** - dashboard, users, students, timetable, reports
2. **Teacher** - `sarah.johnson@demo.com` / `123456`
3. **Parent** - `emily.davis@demo.com` / `1234567890`
