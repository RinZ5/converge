package db

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/RinZ5/converge/backend/internal/scheduling"
	"github.com/RinZ5/converge/backend/internal/shared"
)

type SQLiteBookingRepo struct {
	DB *sql.DB
}

func NewSQLiteBookingRepository(database *sql.DB) *SQLiteBookingRepo {
	return &SQLiteBookingRepo{DB: database}
}

func (r *SQLiteBookingRepo) FindExactMatch(ctx context.Context, subjectID, branchID int, slot shared.WeeklySlot, durationMinutes int, teacherID *int) (*scheduling.BookingMatch, error) {
	loc := shared.LoadLocation()
	duration := time.Duration(durationMinutes) * time.Minute

	windowEnd := slot.End
	if duration > 0 {
		parsedStart, err := time.ParseInLocation("15:04", string(slot.Start), loc)
		if err != nil {
			return nil, fmt.Errorf("invalid slot start time format: %w", err)
		}
		windowEnd = shared.TimeHHMM(parsedStart.Add(duration).Format("15:04"))
	}

	anchorDate := shared.AnchorDateForDay(slot.DayOfWeek, loc)
	parsedStart, err := time.Parse("15:04", string(slot.Start))
	if err != nil {
		return nil, fmt.Errorf("invalid slot start time format: %w", err)
	}
	startTS := time.Date(anchorDate.Year(), anchorDate.Month(), anchorDate.Day(), parsedStart.Hour(), parsedStart.Minute(), 0, 0, loc)
	endTS := startTS
	if duration > 0 {
		endTS = endTS.Add(duration)
	} else {
		parsedEnd, err := time.ParseInLocation("15:04", string(slot.End), loc)
		if err != nil {
			return nil, fmt.Errorf("invalid slot end time format: %w", err)
		}
		endTS = time.Date(anchorDate.Year(), anchorDate.Month(), anchorDate.Day(), parsedEnd.Hour(), parsedEnd.Minute(), 0, 0, loc)
	}

	startTSStr := startTS.Format(time.RFC3339)
	endTSStr := endTS.Format(time.RFC3339)

	row := r.DB.QueryRowContext(ctx, `
		SELECT 0, t.id, ?, ?, ?, ?, t.name
		FROM teachers t
		JOIN teacher_subjects ts ON t.id = ts.teacher_id AND ts.subject_id = ?
		JOIN teacher_availability ta ON t.id = ta.teacher_id
		WHERE t.status = 'active'
		  AND ta.day_of_week = ?
		  AND ta.start_time <= ?
		  AND ta.end_time >= ?
		  AND (? IS NULL OR t.id = ?)
		  AND NOT EXISTS (
		    SELECT 1 FROM bookings b
		    WHERE b.teacher_id = t.id
		      AND b.start_time < ?
		      AND b.end_time > ?
		  )
		ORDER BY t.id
		LIMIT 1`,
		branchID, subjectID, startTSStr, endTSStr,
		subjectID, slot.DayOfWeek, string(slot.Start), string(windowEnd), teacherID, teacherID,
		endTSStr, startTSStr,
	)

	var booking scheduling.Booking
	var startStr, endStr, name string
	var bid int
	if err := row.Scan(&bid, &booking.TeacherID, &booking.BranchID, &booking.SubjectID,
		&startStr, &endStr, &name); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, err
	}

	booking.StartTime, _ = time.Parse(time.RFC3339, startStr)
	booking.EndTime, _ = time.Parse(time.RFC3339, endStr)
	booking.ID = bid
	return &scheduling.BookingMatch{Booking: booking, TeacherName: name}, nil
}

func (r *SQLiteBookingRepo) FindConflictingBookings(ctx context.Context, teacherID int, startTime, endTime time.Time) ([]scheduling.Booking, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, teacher_id, branch_id, subject_id, start_time, end_time
		FROM bookings
		WHERE teacher_id = ?
		  AND start_time < ?
		  AND end_time > ?`,
		teacherID, endTime.Format(time.RFC3339), startTime.Format(time.RFC3339))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bookings []scheduling.Booking
	for rows.Next() {
		var b scheduling.Booking
		var startStr, endStr string
		if err := rows.Scan(&b.ID, &b.TeacherID, &b.BranchID, &b.SubjectID,
			&startStr, &endStr); err != nil {
			return nil, err
		}
		b.StartTime, _ = time.Parse(time.RFC3339, startStr)
		b.EndTime, _ = time.Parse(time.RFC3339, endStr)
		bookings = append(bookings, b)
	}
	return bookings, rows.Err()
}

func (r *SQLiteBookingRepo) FindTeacherAvailability(ctx context.Context, teacherID int) ([]shared.WeeklySlot, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT day_of_week, start_time, end_time
		FROM teacher_availability
		WHERE teacher_id = ?
		ORDER BY day_of_week, start_time`, teacherID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var slots []shared.WeeklySlot
	for rows.Next() {
		var s shared.WeeklySlot
		if err := rows.Scan(&s.DayOfWeek, &s.Start, &s.End); err != nil {
			return nil, err
		}
		slots = append(slots, s)
	}
	return slots, rows.Err()
}

func (r *SQLiteBookingRepo) CreateBooking(ctx context.Context, req scheduling.ConfirmBookingRequest) (*scheduling.Booking, error) {
	var count int
	err := r.DB.QueryRowContext(ctx, `
		SELECT COUNT(*) FROM bookings
		WHERE teacher_id = ?
		  AND start_time < ?
		  AND end_time > ?`,
		req.TeacherID, req.EndTime.Format(time.RFC3339), req.StartTime.Format(time.RFC3339)).Scan(&count)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, scheduling.ErrBookingConflict
	}

	now := time.Now().UTC().Format(time.RFC3339)
	startStr := req.StartTime.Format(time.RFC3339)
	endStr := req.EndTime.Format(time.RFC3339)

	row := r.DB.QueryRowContext(ctx, `
		INSERT INTO bookings (teacher_id, branch_id, subject_id, start_time, end_time, client_name, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		RETURNING id, teacher_id, branch_id, subject_id, start_time, end_time, client_name, created_at`,
		req.TeacherID, req.BranchID, req.SubjectID, startStr, endStr, req.ClientName, now,
	)

	var b scheduling.Booking
	var retStartStr, retEndStr, createdAtStr string
	if err := row.Scan(&b.ID, &b.TeacherID, &b.BranchID, &b.SubjectID,
		&retStartStr, &retEndStr, &b.ClientName, &createdAtStr); err != nil {
		return nil, err
	}

	b.StartTime, _ = time.Parse(time.RFC3339, retStartStr)
	b.EndTime, _ = time.Parse(time.RFC3339, retEndStr)
	b.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)

	return &b, nil
}

func (r *SQLiteBookingRepo) DeleteBooking(ctx context.Context, bookingID int) error {
	res, err := r.DB.ExecContext(ctx, `DELETE FROM bookings WHERE id = ?`, bookingID)
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %w", err)
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func (r *SQLiteBookingRepo) FindAllBookings(ctx context.Context) ([]scheduling.Booking, error) {
	rows, err := r.DB.QueryContext(ctx, `
		SELECT id, teacher_id, branch_id, subject_id, start_time, end_time, client_name, created_at
		FROM bookings
		ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bookings []scheduling.Booking
	for rows.Next() {
		var b scheduling.Booking
		var startStr, endStr, createdAtStr string
		if err := rows.Scan(&b.ID, &b.TeacherID, &b.BranchID, &b.SubjectID,
			&startStr, &endStr, &b.ClientName, &createdAtStr); err != nil {
			return nil, err
		}
		b.StartTime, _ = time.Parse(time.RFC3339, startStr)
		b.EndTime, _ = time.Parse(time.RFC3339, endStr)
		b.CreatedAt, _ = time.Parse(time.RFC3339, createdAtStr)
		bookings = append(bookings, b)
	}
	return bookings, rows.Err()
}
