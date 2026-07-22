package db

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/RinZ5/converge/backend/internal/shared"
	"github.com/RinZ5/converge/backend/internal/teacher"
)

type SQLiteRepo struct {
	DB *sql.DB
}

func NewSQLiteRepo(database *sql.DB) *SQLiteRepo {
	return &SQLiteRepo{DB: database}
}

func (p *SQLiteRepo) GetActiveTeachers(ctx context.Context) ([]teacher.Teacher, error) {
	rows, err := p.DB.QueryContext(ctx, `SELECT id, name, email, status FROM teachers WHERE status = 'active' ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teachers []teacher.Teacher
	for rows.Next() {
		var t teacher.Teacher
		if err := rows.Scan(&t.ID, &t.Name, &t.Email, &t.Status); err != nil {
			return nil, err
		}
		teachers = append(teachers, t)
	}
	return teachers, rows.Err()
}

func (p *SQLiteRepo) GetTeachersBySubject(ctx context.Context, subjectID int) ([]teacher.Teacher, error) {
	rows, err := p.DB.QueryContext(ctx, `
		SELECT t.id, t.name, t.email, t.status
		FROM teachers t
		JOIN teacher_subjects ts ON t.id = ts.teacher_id
		WHERE ts.subject_id = ? AND t.status = 'active'
		ORDER BY t.name`, subjectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var teachers []teacher.Teacher
	for rows.Next() {
		var t teacher.Teacher
		if err := rows.Scan(&t.ID, &t.Name, &t.Email, &t.Status); err != nil {
			return nil, err
		}
		teachers = append(teachers, t)
	}
	return teachers, rows.Err()
}

func (p *SQLiteRepo) GetBranches(ctx context.Context) ([]shared.Branch, error) {
	rows, err := p.DB.QueryContext(ctx, `SELECT id, name FROM branches ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var branches []shared.Branch
	for rows.Next() {
		var b shared.Branch
		if err := rows.Scan(&b.ID, &b.Name); err != nil {
			return nil, err
		}
		branches = append(branches, b)
	}
	return branches, rows.Err()
}

func (p *SQLiteRepo) GetSubjects(ctx context.Context) ([]shared.Subject, error) {
	rows, err := p.DB.QueryContext(ctx, `SELECT id, name FROM subjects ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var subjects []shared.Subject
	for rows.Next() {
		var s shared.Subject
		if err := rows.Scan(&s.ID, &s.Name); err != nil {
			return nil, err
		}
		subjects = append(subjects, s)
	}
	return subjects, rows.Err()
}

func (p *SQLiteRepo) ReplaceWeeklyAvailability(ctx context.Context, teacherID int, slots []shared.WeeklySlot) error {
	tx, err := p.DB.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, `DELETE FROM teacher_availability WHERE teacher_id = ?`, teacherID); err != nil {
		return err
	}

	for _, s := range slots {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO teacher_availability (teacher_id, day_of_week, start_time, end_time)
			VALUES (?, ?, ?, ?)`,
			teacherID, s.DayOfWeek, string(s.Start), string(s.End)); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (p *SQLiteRepo) GetAllAvailability(ctx context.Context) ([]teacher.TeacherAvailability, error) {
	rows, err := p.DB.QueryContext(ctx, `
		SELECT t.id, t.name, t.email, ta.day_of_week, ta.start_time, ta.end_time
		FROM teachers t
		JOIN teacher_availability ta ON t.id = ta.teacher_id
		WHERE t.status = 'active'
		ORDER BY t.name, ta.day_of_week, ta.start_time`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make([]teacher.TeacherAvailability, 0)
	var current *teacher.TeacherAvailability

	for rows.Next() {
		var teacherID int
		var name, email string
		var slot shared.WeeklySlot
		if err := rows.Scan(&teacherID, &name, &email, &slot.DayOfWeek, &slot.Start, &slot.End); err != nil {
			return nil, err
		}
		if current == nil || current.Teacher.ID != teacherID {
			result = append(result, teacher.TeacherAvailability{
				Teacher: teacher.Teacher{ID: teacherID, Name: name},
				Weekly:  []shared.WeeklySlot{slot},
			})
			current = &result[len(result)-1]
		} else {
			current.Weekly = append(current.Weekly, slot)
		}
	}
	return result, rows.Err()
}

func (p *SQLiteRepo) TeacherAvailability(ctx context.Context, teacherID int) ([]shared.WeeklySlot, error) {
	return p.FindTeacherAvailability(ctx, teacherID)
}

func (p *SQLiteRepo) FindTeacherAvailability(ctx context.Context, teacherID int) ([]shared.WeeklySlot, error) {
	rows, err := p.DB.QueryContext(ctx, `
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

func (p *SQLiteRepo) SaveRawSubmission(ctx context.Context, teacherID int, rawPayload []byte) error {
	_, err := p.DB.ExecContext(ctx, `
		INSERT INTO form_submission (teacher_id, raw_payload)
		VALUES (?, ?)`, teacherID, string(rawPayload))
	return err
}

func (p *SQLiteRepo) AddTeacher(ctx context.Context, name, email string) (*teacher.Teacher, error) {
	res, err := p.DB.ExecContext(ctx, `
		INSERT INTO teachers (name, email, status) VALUES (?, ?, 'active')`, name, email)
	if err != nil {
		return nil, fmt.Errorf("add teacher: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return nil, err
	}
	return &teacher.Teacher{ID: int(id), Name: name, Email: email, Status: "active"}, nil
}

func (p *SQLiteRepo) SetStatus(ctx context.Context, teacherID int, status string) error {
	res, err := p.DB.ExecContext(ctx, `UPDATE teachers SET status = ? WHERE id = ?`, status, teacherID)
	if err != nil {
		return fmt.Errorf("set teacher status: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}
