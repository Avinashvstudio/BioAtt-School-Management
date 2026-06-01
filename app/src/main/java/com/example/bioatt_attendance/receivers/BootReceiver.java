package com.example.bioatt_attendance.receivers;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.example.bioatt_attendance.utils.AttendanceScheduler;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Boot completed, restarting attendance scheduler");
            
            try {
                // Restart the attendance scheduler
                AttendanceScheduler scheduler = new AttendanceScheduler(context);
                scheduler.scheduleDailyReports();
                Log.d(TAG, "Attendance scheduler restarted successfully");
            } catch (Exception e) {
                Log.e(TAG, "Error restarting attendance scheduler", e);
                // Don't crash the app, just log the error
            }
        }
    }
} 