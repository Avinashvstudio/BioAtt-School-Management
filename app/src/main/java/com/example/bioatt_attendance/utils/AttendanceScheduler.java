package com.example.bioatt_attendance.utils;

import android.content.Context;
import android.util.Log;

import androidx.work.Constraints;
import androidx.work.Data;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.example.bioatt_attendance.workers.AttendanceReportWorker;

import java.util.Calendar;
import java.util.concurrent.TimeUnit;

public class AttendanceScheduler {
    private static final String TAG = "AttendanceScheduler";
    private static final String DAILY_EXIT_REPORT_TAG = "daily_exit_report";
    private static final String DAILY_SUMMARY_REPORT_TAG = "daily_summary_report";

    private Context context;

    public AttendanceScheduler(Context context) {
        this.context = context;
    }

    public void scheduleDailyReports() {
        scheduleDailyExitReport();
        scheduleDailySummaryReport();
    }

    private void scheduleDailyExitReport() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 19); // 7 PM
        calendar.set(Calendar.MINUTE, 30);      // 30 minutes
        calendar.set(Calendar.SECOND, 0);

        if (calendar.before(Calendar.getInstance())) {
            calendar.add(Calendar.DAY_OF_YEAR, 1);
        }

        long initialDelay = calendar.getTimeInMillis() - System.currentTimeMillis();

        Data data = new Data.Builder().putString("report_type", "exit").build();
        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(AttendanceReportWorker.class, 1, TimeUnit.DAYS)
                .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(data)
                .addTag(DAILY_EXIT_REPORT_TAG)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                DAILY_EXIT_REPORT_TAG,
                ExistingPeriodicWorkPolicy.REPLACE,
                workRequest
        );

        Log.d(TAG, "Daily exit report scheduled to run at 19:30, with initial delay: " + initialDelay + "ms");
    }

    private void scheduleDailySummaryReport() {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, 0); // Midnight
        calendar.set(Calendar.MINUTE, 1);     // A minute past midnight
        calendar.set(Calendar.SECOND, 0);

        if (calendar.before(Calendar.getInstance())) {
            calendar.add(Calendar.DAY_OF_YEAR, 1);
        }

        long initialDelay = calendar.getTimeInMillis() - System.currentTimeMillis();

        Data data = new Data.Builder().putString("report_type", "daily_summary").build();
        PeriodicWorkRequest workRequest = new PeriodicWorkRequest.Builder(AttendanceReportWorker.class, 1, TimeUnit.DAYS)
                .setInitialDelay(initialDelay, TimeUnit.MILLISECONDS)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setInputData(data)
                .addTag(DAILY_SUMMARY_REPORT_TAG)
                .build();

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                DAILY_SUMMARY_REPORT_TAG,
                ExistingPeriodicWorkPolicy.REPLACE,
                workRequest
        );

        Log.d(TAG, "Daily summary report scheduled to run at 00:01, with initial delay: " + initialDelay + "ms");
    }

    public void scheduleImmediateReport(String reportType) {
        Data data = new Data.Builder().putString("report_type", reportType).build();
        OneTimeWorkRequest workRequest = new OneTimeWorkRequest.Builder(AttendanceReportWorker.class)
                .setInputData(data)
                .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .build();
        
        WorkManager.getInstance(context).enqueue(workRequest);
        Log.d(TAG, "Immediate " + reportType + " report scheduled");
    }
} 