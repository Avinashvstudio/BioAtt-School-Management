package com.example.bioatt_attendance.workers;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import com.example.bioatt_attendance.data.AppDatabase;
import com.example.bioatt_attendance.data.Attendance;
import com.example.bioatt_attendance.data.AttendanceDao;
import com.example.bioatt_attendance.utils.EmailHelper;
import com.example.bioatt_attendance.utils.ReportGenerator;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class AttendanceReportWorker extends Worker {
    private static final String TAG = "AttendanceReportWorker";
    private static final String PREFS_NAME = "AdminPrefs";
    private static final String ENCRYPTED_PREFS_NAME = "EncryptedAdminPrefs";

    private final Context context;
    private final AppDatabase database;
    private final ReportGenerator reportGenerator;
    private final EmailHelper emailHelper;
    private SharedPreferences prefs;

    public AttendanceReportWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
        this.context = context;
        this.database = AppDatabase.getInstance(context);
        this.reportGenerator = new ReportGenerator(context);
        this.emailHelper = new EmailHelper();
        
        try {
            MasterKey masterKey = new MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build();

            this.prefs = EncryptedSharedPreferences.create(
                    context,
                    ENCRYPTED_PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception e) {
            Log.e(TAG, "Error creating EncryptedSharedPreferences, falling back to default.", e);
            this.prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        }
    }

    @Override
    public Result doWork() {
        try {
            String reportType = getInputData().getString("report_type");
            String date = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());

            Log.d(TAG, "Generating " + reportType + " report for date: " + date);

            switch (reportType) {
                case "exit":
                    generateAndSendExitReport(date);
                    break;
                case "daily_summary":
                    generateAndSendDailySummary(date);
                    break;
                default:
                    Log.e(TAG, "Unknown report type: " + reportType);
                    return Result.failure();
            }

            return Result.success();

        } catch (Exception e) {
            Log.e(TAG, "Error in AttendanceReportWorker", e);
            return Result.failure();
        }
    }
    
    private void sendReportByEmail(String reportPath, String subject, String body) {
        String senderEmail = prefs.getString("sender_email", "");
        String senderPassword = prefs.getString("sender_password", "");
        String recipientEmail = prefs.getString("recipient_email", "");

        if (senderEmail.isEmpty() || senderPassword.isEmpty() || recipientEmail.isEmpty()) {
            Log.w(TAG, "Email credentials not configured. Skipping scheduled report.");
            return;
        }

        emailHelper.sendEmailWithAttachment(
                "smtp.gmail.com",
                "465",
                senderEmail,
                senderPassword,
                recipientEmail,
                subject,
                body,
                reportPath
        );
    }

    private void generateAndSendExitReport(String date) {
        AttendanceDao attendanceDao = database.attendanceDao();
        List<Attendance> attendanceList = attendanceDao.getAttendanceByDate(date);

        if (attendanceList.isEmpty()) {
            Log.d(TAG, "No attendance records found for date: " + date);
            return;
        }

        String reportPath = reportGenerator.generateExitReport(attendanceList, date);
        if (reportPath != null) {
            String subject = "Daily Exit Report - " + date;
            String body = "Please find the attached exit report for " + date + ".";
            sendReportByEmail(reportPath, subject, body);
        }
    }

    private void generateAndSendDailySummary(String date) {
        AttendanceDao attendanceDao = database.attendanceDao();
        List<Attendance> attendanceList = attendanceDao.getAttendanceByDate(date);

        if (attendanceList.isEmpty()) {
            Log.d(TAG, "No attendance records found for date: " + date);
            return;
        }

        String reportPath = reportGenerator.generateDailySummary(attendanceList, date);
        if (reportPath != null) {
            String subject = "Daily Summary Report - " + date;
            String body = "Please find the attached daily summary report for " + date + ".";
            sendReportByEmail(reportPath, subject, body);
        }
    }
} 