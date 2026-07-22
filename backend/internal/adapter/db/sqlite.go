package db

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "modernc.org/sqlite"
)

func InitSQLiteDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("pragmas: %w", err)
		}
	}

	return db, nil
}

func AutoMigrateSQLite(database *sql.DB) error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS teachers (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			email TEXT,
			status TEXT DEFAULT 'active' CHECK (status IN ('active','deactivated')),
			created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
			updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		)`,

		`CREATE TABLE IF NOT EXISTS teacher_availability (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
			day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
			start_time TEXT NOT NULL,
			end_time TEXT NOT NULL,
			created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
			UNIQUE(teacher_id, day_of_week, start_time, end_time),
			CHECK (start_time < end_time)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_teacher_availability_teacher ON teacher_availability(teacher_id)`,

		`CREATE TABLE IF NOT EXISTS form_submission (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			teacher_id INTEGER REFERENCES teachers(id) ON DELETE SET NULL,
			raw_payload TEXT NOT NULL,
			submitted_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
		)`,

		`CREATE TABLE IF NOT EXISTS subjects (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		)`,

		`CREATE TABLE IF NOT EXISTS teacher_subjects (
			teacher_id INTEGER NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
			subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
			PRIMARY KEY (teacher_id, subject_id)
		)`,

		`CREATE TABLE IF NOT EXISTS branches (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL UNIQUE
		)`,

		`CREATE TABLE IF NOT EXISTS bookings (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			teacher_id INTEGER NOT NULL REFERENCES teachers(id),
			branch_id INTEGER NOT NULL REFERENCES branches(id),
			subject_id INTEGER NOT NULL REFERENCES subjects(id),
			start_time TEXT NOT NULL,
			end_time TEXT NOT NULL,
			client_name TEXT NOT NULL DEFAULT '',
			created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
			CHECK (start_time < end_time)
		)`,

		`CREATE INDEX IF NOT EXISTS idx_bookings_teacher ON bookings(teacher_id)`,
		`CREATE INDEX IF NOT EXISTS idx_bookings_times ON bookings(start_time, end_time)`,
	}
	for _, q := range queries {
		if _, err := database.Exec(q); err != nil {
			return fmt.Errorf("migration failed: %w\n%s", err, q)
		}
	}
	log.Println("SQLite schema ready")
	return nil
}

func SeedSQLite(database *sql.DB) error {
	log.Println("Seeding SQLite database...")

	if err := truncateSQLiteSeedTables(database); err != nil {
		return err
	}

	branchIDs, err := seedSQLiteBranches(database)
	if err != nil {
		return err
	}

	subjectIDs, err := seedSQLiteSubjects(database)
	if err != nil {
		return err
	}

	teacherIDs, err := seedSQLiteTeachers(database)
	if err != nil {
		return err
	}

	if err := seedSQLiteTeacherSubjects(database, teacherIDs, subjectIDs); err != nil {
		return err
	}

	if err := seedSQLiteTeacherAvailability(database, teacherIDs); err != nil {
		return err
	}

	if err := seedSQLiteFormSubmissions(database, teacherIDs); err != nil {
		return err
	}

	log.Printf("Seed complete: %d branches, %d subjects, %d teachers",
		len(branchIDs), len(subjectIDs), len(teacherIDs))
	return nil
}

func truncateSQLiteSeedTables(database *sql.DB) error {
	tables := []string{"form_submission", "teacher_availability", "teacher_subjects", "teachers", "subjects", "branches"}
	for _, t := range tables {
		if _, err := database.Exec(fmt.Sprintf("DELETE FROM %s", t)); err != nil {
			return fmt.Errorf("truncate %s: %w", t, err)
		}
	}
	return nil
}

func seedSQLiteBranches(database *sql.DB) ([]int, error) {
	branches := []string{"Main Campus", "Downtown", "Westside", "Online"}
	ids := make([]int, 0, len(branches))
	for _, name := range branches {
		res, err := database.Exec(`INSERT INTO branches (name) VALUES (?)`, name)
		if err != nil {
			return nil, fmt.Errorf("insert branch %q: %w", name, err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			return nil, err
		}
		ids = append(ids, int(id))
	}
	return ids, nil
}

func seedSQLiteSubjects(database *sql.DB) ([]int, error) {
	subjects := []string{"Mathematics", "Physics", "English", "History", "Computer Science", "Art"}
	ids := make([]int, 0, len(subjects))
	for _, name := range subjects {
		res, err := database.Exec(`INSERT INTO subjects (name) VALUES (?)`, name)
		if err != nil {
			return nil, fmt.Errorf("insert subject %q: %w", name, err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			return nil, err
		}
		ids = append(ids, int(id))
	}
	return ids, nil
}

type sqliteTeacherSeed struct {
	name   string
	email  string
	status string
}

func seedSQLiteTeachers(database *sql.DB) ([]int, error) {
	teachers := []sqliteTeacherSeed{
		{name: "Alice Johnson", email: "alice@example.com", status: "active"},
		{name: "Bob Smith", email: "bob@example.com", status: "active"},
		{name: "Carol Williams", email: "carol@example.com", status: "active"},
		{name: "David Brown", email: "david@example.com", status: "deactivated"},
		{name: "Eva Martinez", email: "eva@example.com", status: "active"},
	}
	ids := make([]int, 0, len(teachers))
	for _, t := range teachers {
		res, err := database.Exec(
			`INSERT INTO teachers (name, email, status) VALUES (?, ?, ?)`,
			t.name, t.email, t.status,
		)
		if err != nil {
			return nil, fmt.Errorf("insert teacher %q: %w", t.name, err)
		}
		id, err := res.LastInsertId()
		if err != nil {
			return nil, err
		}
		ids = append(ids, int(id))
	}
	return ids, nil
}

func seedSQLiteTeacherSubjects(database *sql.DB, teacherIDs, subjectIDs []int) error {
	mappings := map[int][]int{
		teacherIDs[0]: {subjectIDs[0], subjectIDs[1]},
		teacherIDs[1]: {subjectIDs[2], subjectIDs[3]},
		teacherIDs[2]: {subjectIDs[4], subjectIDs[5], subjectIDs[0]},
		teacherIDs[3]: {subjectIDs[1]},
		teacherIDs[4]: {subjectIDs[2], subjectIDs[4]},
	}
	for teacherID, subjectIdxs := range mappings {
		for _, subjectID := range subjectIdxs {
			_, err := database.Exec(
				`INSERT OR IGNORE INTO teacher_subjects (teacher_id, subject_id) VALUES (?, ?)`,
				teacherID, subjectID,
			)
			if err != nil {
				return fmt.Errorf("insert teacher_subject (teacher=%d, subject=%d): %w", teacherID, subjectID, err)
			}
		}
	}
	return nil
}

func seedSQLiteTeacherAvailability(database *sql.DB, teacherIDs []int) error {
	type slot struct {
		dayOfWeek int
		start     string
		end       string
	}

	schedules := map[int][]slot{
		teacherIDs[0]: { // Alice: Mon/Wed/Fri 09:00-12:00
			{0, "09:00", "12:00"},
			{2, "09:00", "12:00"},
			{4, "09:00", "12:00"},
		},
		teacherIDs[1]: { // Bob: Tue/Thu 10:00-15:00
			{1, "10:00", "15:00"},
			{3, "10:00", "15:00"},
		},
		teacherIDs[2]: { // Carol: Mon-Thu 13:00-17:00
			{0, "13:00", "17:00"},
			{1, "13:00", "17:00"},
			{2, "13:00", "17:00"},
			{3, "13:00", "17:00"},
		},
		teacherIDs[3]: { // David: Mon 08:00-10:00 (deactivated, but has schedule)
			{0, "08:00", "10:00"},
		},
		teacherIDs[4]: { // Eva: Tue/Thu/Sat 09:00-14:00
			{1, "09:00", "14:00"},
			{3, "09:00", "14:00"},
			{5, "09:00", "14:00"},
		},
	}

	for teacherID, slots := range schedules {
		for _, s := range slots {
			_, err := database.Exec(
				`INSERT OR IGNORE INTO teacher_availability (teacher_id, day_of_week, start_time, end_time)
				 VALUES (?, ?, ?, ?)`,
				teacherID, s.dayOfWeek, s.start, s.end,
			)
			if err != nil {
				return fmt.Errorf("insert availability (teacher=%d, day=%d): %w", teacherID, s.dayOfWeek, err)
			}
		}
	}
	return nil
}

func seedSQLiteFormSubmissions(database *sql.DB, teacherIDs []int) error {
	type formSubmission struct {
		teacherID int
		payload   string
	}

	now := time.Now().UTC().Format(time.RFC3339)

	submissions := []formSubmission{
		{
			teacherID: teacherIDs[0],
			payload: fmt.Sprintf(`{"teacher_id":%d,"weekly":[{"day_of_week":0,"start":"09:00","end":"12:00"},{"day_of_week":2,"start":"09:00","end":"12:00"},{"day_of_week":4,"start":"09:00","end":"12:00"}],"submitted_at":"%s"}`,
				teacherIDs[0], now),
		},
		{
			teacherID: teacherIDs[1],
			payload: fmt.Sprintf(`{"teacher_id":%d,"weekly":[{"day_of_week":1,"start":"10:00","end":"15:00"},{"day_of_week":3,"start":"10:00","end":"15:00"}],"submitted_at":"%s"}`,
				teacherIDs[1], now),
		},
	}

	for _, s := range submissions {
		_, err := database.Exec(
			`INSERT INTO form_submission (teacher_id, raw_payload) VALUES (?, ?)`,
			s.teacherID, s.payload,
		)
		if err != nil {
			return fmt.Errorf("insert form_submission (teacher=%d): %w", s.teacherID, err)
		}
	}
	return nil
}

func CloseSQLiteDB(database *sql.DB) error {
	if database != nil {
		return database.Close()
	}
	return nil
}
