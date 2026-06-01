package com.example.bioatt_attendance.utils;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;

import com.example.bioatt_attendance.data.Attendance;
import com.example.bioatt_attendance.data.Employee;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;

public class ReportGenerator {
    private static final String TAG = "ReportGenerator";
    private Context context;

    public ReportGenerator(Context context) {
        this.context = context;
    }

    private String imageToBase64(String imagePath) {
        if (imagePath == null || imagePath.isEmpty()) {
            return "";
        }
        try {
            Bitmap bm = BitmapFactory.decodeFile(imagePath);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bm.compress(Bitmap.CompressFormat.JPEG, 100, baos);
            byte[] b = baos.toByteArray();
            return Base64.encodeToString(b, Base64.DEFAULT);
        } catch (Exception e) {
            Log.e(TAG, "Error converting image to Base64", e);
            return "";
        }
    }

    private String getHtmlHeader() {
        return "<!DOCTYPE html><html><head><title>Attendance Report</title><style>"
                + "body { font-family: sans-serif; }"
                + "table { width: 100%; border-collapse: collapse; }"
                + "th, td { border: 1px solid #dddddd; text-align: left; padding: 8px; }"
                + "th { background-color: #f2f2f2; }"
                + "img { max-width: 100px; max-height: 100px; }"
                + "</style></head><body>";
    }

    private String getHtmlFooter() {
        return "</body></html>";
    }

    private String generateHtmlReport(String title, String headers, StringBuilder rows) {
        String fileName = title.replace(" ", "_") + ".html";
        File file = new File(context.getExternalFilesDir(null), fileName);

        try (FileWriter writer = new FileWriter(file)) {
            writer.write(getHtmlHeader());
            writer.write("<h1>" + title + "</h1>");
            writer.write("<table><thead><tr>" + headers + "</tr></thead><tbody>");
            writer.write(rows.toString());
            writer.write("</tbody></table>");
            writer.write(getHtmlFooter());
            Log.d(TAG, "HTML report generated: " + file.getAbsolutePath());
            return file.getAbsolutePath();
        } catch (IOException e) {
            Log.e(TAG, "Error generating HTML report", e);
            return null;
        }
    }

    public String generateEntryReport(List<Attendance> attendanceList, String date) {
        String title = "Entry Report " + date;
        String headers = "<th>S.No</th><th>Employee Name</th><th>Employee ID</th><th>Entry Time</th><th>Status</th><th>Photo</th>";
        StringBuilder rows = new StringBuilder();
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

        for (int i = 0; i < attendanceList.size(); i++) {
            Attendance att = attendanceList.get(i);
            String entryTime = timeFormat.format(new Date(att.getEntryTime()));
            String image64 = imageToBase64(att.getEntryImagePath());

            rows.append("<tr>")
                    .append("<td>").append(i + 1).append("</td>")
                    .append("<td>").append(att.getEmployeeName()).append("</td>")
                    .append("<td>").append(att.getEmployeeId()).append("</td>")
                    .append("<td>").append(entryTime).append("</td>")
                    .append("<td>").append(att.getStatus()).append("</td>")
                    .append("<td><img src='data:image/jpeg;base64,").append(image64).append("' alt='Photo'></td>")
                    .append("</tr>");
        }
        return generateHtmlReport(title, headers, rows);
    }

    public String generateExitReport(List<Attendance> attendanceList, String date) {
        String title = "Exit Report " + date;
        String headers = "<th>S.No</th><th>Employee Name</th><th>Entry Time</th><th>Exit Time</th><th>Working Hours</th><th>Status</th><th>Photo</th>";
        StringBuilder rows = new StringBuilder();
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

        for (int i = 0; i < attendanceList.size(); i++) {
            Attendance att = attendanceList.get(i);
            String entryTime = timeFormat.format(new Date(att.getEntryTime()));
            String exitTime = "N/A";
            String workingHours = "N/A";
            if (att.getExitTime() > 0) {
                exitTime = timeFormat.format(new Date(att.getExitTime()));
                long duration = att.getExitTime() - att.getEntryTime();
                long hours = duration / (1000 * 60 * 60);
                long minutes = (duration % (1000 * 60 * 60)) / (1000 * 60);
                workingHours = String.format("%02d:%02d", hours, minutes);
            }
            String image64 = imageToBase64(att.getExitImagePath());

            rows.append("<tr>")
                    .append("<td>").append(i + 1).append("</td>")
                    .append("<td>").append(att.getEmployeeName()).append("</td>")
                    .append("<td>").append(entryTime).append("</td>")
                    .append("<td>").append(exitTime).append("</td>")
                    .append("<td>").append(workingHours).append("</td>")
                    .append("<td>").append(att.getStatus()).append("</td>")
                    .append("<td><img src='data:image/jpeg;base64,").append(image64).append("' alt='Photo'></td>")
                    .append("</tr>");
        }
        return generateHtmlReport(title, headers, rows);
    }

    public String generateDailySummary(List<Attendance> attendanceList, String date) {
        String title = "Daily Summary " + date;
        String headers = "<th>S.No</th><th>Photo</th><th>Employee Name</th><th>Entry Time</th><th>Exit Time</th><th>Working Hours</th><th>Status</th><th>Late</th><th>Early Exit</th>";
        StringBuilder rows = new StringBuilder();
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

        for (int i = 0; i < attendanceList.size(); i++) {
            Attendance att = attendanceList.get(i);
            String entryTime = timeFormat.format(new Date(att.getEntryTime()));
            String exitTime = "N/A";
            String workingHours = "N/A";
            if (att.getExitTime() > 0) {
                exitTime = timeFormat.format(new Date(att.getExitTime()));
                long duration = att.getExitTime() - att.getEntryTime();
                long hours = duration / (1000 * 60 * 60);
                long minutes = (duration % (1000 * 60 * 60)) / (1000 * 60);
                workingHours = String.format("%02d:%02d", hours, minutes);
            }
            String image64 = imageToBase64(att.getEntryImagePath());

            rows.append("<tr>")
                    .append("<td>").append(i + 1).append("</td>")
                    .append("<td><img src='data:image/jpeg;base64,").append(image64).append("' alt='Photo'></td>")
                    .append("<td>").append(att.getEmployeeName()).append("</td>")
                    .append("<td>").append(entryTime).append("</td>")
                    .append("<td>").append(exitTime).append("</td>")
                    .append("<td>").append(workingHours).append("</td>")
                    .append("<td>").append(att.getStatus()).append("</td>")
                    .append("<td>").append(att.isLate() ? "Yes" : "No").append("</td>")
                    .append("<td>").append(att.isEarlyExit() ? "Yes" : "No").append("</td>")
                    .append("</tr>");
        }
        return generateHtmlReport(title, headers, rows);
    }

    public String generateSingleEntryReport(Attendance attendance) {
        String date = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date(attendance.getEntryTime()));
        String title = "Instant Entry Report - " + attendance.getEmployeeName() + " - " + date;
        String headers = "<th>Employee Name</th><th>Employee ID</th><th>Entry Time</th><th>Status</th><th>Photo</th>";
        StringBuilder rows = new StringBuilder();
        SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.getDefault());

        String entryTime = timeFormat.format(new Date(attendance.getEntryTime()));
        String image64 = imageToBase64(attendance.getEntryImagePath());

        rows.append("<tr>")
                .append("<td>").append(attendance.getEmployeeName()).append("</td>")
                .append("<td>").append(attendance.getEmployeeId()).append("</td>")
                .append("<td>").append(entryTime).append("</td>")
                .append("<td>").append(attendance.getStatus()).append("</td>")
                .append("<td><img src='data:image/jpeg;base64,").append(image64).append("' alt='Photo'></td>")
                .append("</tr>");

        return generateHtmlReport(title, headers, rows);
    }
} 