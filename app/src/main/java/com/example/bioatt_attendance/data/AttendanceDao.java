package com.example.bioatt_attendance.data;

import androidx.room.Dao;
import androidx.room.Delete;
import androidx.room.Insert;
import androidx.room.Query;
import androidx.room.Update;

import java.util.List;

@Dao
public interface AttendanceDao {
    @Insert
    long insert(Attendance attendance);

    @Update
    void update(Attendance attendance);

    @Delete
    void delete(Attendance attendance);

    @Query("SELECT * FROM attendance WHERE date = :date")
    List<Attendance> getAttendanceByDate(String date);

    @Query("SELECT * FROM attendance WHERE employeeId = :employeeId AND date = :date")
    Attendance getAttendanceByEmployeeAndDate(int employeeId, String date);

    @Query("SELECT * FROM attendance WHERE employeeId = :employeeId ORDER BY date DESC")
    List<Attendance> getAttendanceByEmployee(int employeeId);

    @Query("SELECT * FROM attendance WHERE date = :date AND entryTime > :lateThreshold")
    List<Attendance> getLateEmployees(String date, long lateThreshold);

    @Query("SELECT * FROM attendance WHERE date = :date AND exitTime < :earlyExitThreshold")
    List<Attendance> getEarlyExitEmployees(String date, long earlyExitThreshold);

    @Query("SELECT COUNT(*) FROM attendance WHERE date = :date")
    int getAttendanceCountByDate(String date);

    @Query("SELECT COUNT(*) FROM attendance WHERE date = :date AND status = 'PRESENT'")
    int getPresentCountByDate(String date);

    @Query("SELECT COUNT(*) FROM attendance WHERE date = :date AND status = 'LATE'")
    int getLateCountByDate(String date);

    @Query("SELECT COUNT(*) FROM attendance WHERE date = :date AND status = 'ABSENT'")
    int getAbsentCountByDate(String date);
} 