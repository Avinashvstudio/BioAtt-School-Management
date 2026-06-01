package com.example.bioatt_attendance.data;

import androidx.room.Entity;
import androidx.room.PrimaryKey;

@Entity(tableName = "attendance")
public class Attendance {
    @PrimaryKey(autoGenerate = true)
    private int id;
    
    private int employeeId;
    private String employeeName;
    private long entryTime;
    private long exitTime;
    private String entryImagePath;
    private String exitImagePath;
    private String date;
    private boolean isLate;
    private boolean isEarlyExit;
    private String status; // PRESENT, ABSENT, LATE, HALF_DAY

    public Attendance(int employeeId, String employeeName, long entryTime, String date) {
        this.employeeId = employeeId;
        this.employeeName = employeeName;
        this.entryTime = entryTime;
        this.date = date;
        this.status = "PRESENT";
    }

    // Getters and Setters
    public int getId() { return id; }
    public void setId(int id) { this.id = id; }

    public int getEmployeeId() { return employeeId; }
    public void setEmployeeId(int employeeId) { this.employeeId = employeeId; }

    public String getEmployeeName() { return employeeName; }
    public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }

    public long getEntryTime() { return entryTime; }
    public void setEntryTime(long entryTime) { this.entryTime = entryTime; }

    public long getExitTime() { return exitTime; }
    public void setExitTime(long exitTime) { this.exitTime = exitTime; }

    public String getEntryImagePath() { return entryImagePath; }
    public void setEntryImagePath(String entryImagePath) { this.entryImagePath = entryImagePath; }

    public String getExitImagePath() { return exitImagePath; }
    public void setExitImagePath(String exitImagePath) { this.exitImagePath = exitImagePath; }

    public String getDate() { return date; }
    public void setDate(String date) { this.date = date; }

    public boolean isLate() { return isLate; }
    public void setLate(boolean late) { isLate = late; }

    public boolean isEarlyExit() { return isEarlyExit; }
    public void setEarlyExit(boolean earlyExit) { isEarlyExit = earlyExit; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
} 