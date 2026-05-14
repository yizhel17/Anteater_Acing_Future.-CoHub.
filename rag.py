import csv
import chromadb

# ── File paths ───────────────────────────────────────────────
CSV_FILE = "AAF_responses.csv"   # Place the renamed CSV in your project root
DB_PATH  = "./chroma_db"         # ChromaDB will create this folder automatically

# ── Google Form column names (must match exactly) ────────────
COL_COURSE  = "Which course are you dropping knowledge on today?"
COL_DANGER  = "The Danger Zone 💣: What is the specific week, project, or concept where most people fail or drop this class? What methods or strategies did you use to ace it?"
COL_SETUP   = "The Actionable Setup 🛠️: Give us 1-2 concrete, step-by-step actions you wish you had known before Day 1."
COL_CAREER  = "Beyond the Grade 🚀: How can students use this class to make real-world impacts outside the classroom?"
COL_NAME    = "Your Name (Last name & First name)"


def get_collection():
    """Initialize ChromaDB client and return the senior tips collection."""
    client = chromadb.PersistentClient(path=DB_PATH)
    return client.get_or_create_collection(name="aaf_data")


def load_csv():
    """
    Load all contributor responses from the CSV into ChromaDB.
    Each row becomes one searchable document with metadata.
    """
    collection = get_collection()

    # Clear existing data to avoid duplicates on re-import
    existing = collection.count()
    if existing > 0:
        print(f"Warning: {existing} entries already in database. Clearing and re-importing...")
        collection.delete(where={"source": "google_form"})

    added   = 0
    skipped = 0

    with open(CSV_FILE, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            course      = row.get(COL_COURSE, "").strip()
            danger_zone = row.get(COL_DANGER,  "").strip()
            setup       = row.get(COL_SETUP,   "").strip()
            career      = row.get(COL_CAREER,  "").strip()
            name        = row.get(COL_NAME,    "Anonymous").strip() or "Anonymous"

            # Skip rows missing a course name or any meaningful content
            if not course or (not danger_zone and not setup):
                skipped += 1
                print(f"  [SKIP] Row {i+1} — missing course name or content")
                continue

            # Concatenate all three answers into a single semantic document
            full_text = f"Course: {course}\n\n"
            if danger_zone:
                full_text += f"Danger Zone (what trips students up & how to survive it):\n{danger_zone}\n\n"
            if setup:
                full_text += f"Actionable Setup (must-do steps before Day 1):\n{setup}\n\n"
            if career:
                full_text += f"Beyond the Grade (real-world impact & career value):\n{career}"

            tip_id = f"tip_{i:03d}"

            collection.add(
                documents=[full_text],
                metadatas=[{
                    "course":      course,
                    "contributor": name,
                    "source":      "google_form"
                }],
                ids=[tip_id]
            )
            added += 1
            print(f"  [OK] [{tip_id}] {course} — {name}")

    print(f"\n{'='*55}")
    print(f"Import complete: {added} entries added, {skipped} skipped.")
    print(f"Total in database: {collection.count()}")
    print(f"{'='*55}\n")


def retrieve_tips(query: str, course: str = None, n: int = 3) -> list:
    """
    Retrieve the most semantically relevant senior tips for a given query.

    Called by app.py during guide generation to inject real contributor
    data into the Claude prompt.

    Args:
        query:  The user's input text (course name + personal context)
        course: Optional course name to filter results (e.g. 'ICS 32')
        n:      Number of tips to return (default 3)

    Returns:
        List of matching tip strings, or empty list if database is empty.
    """
    collection = get_collection()

    if collection.count() == 0:
        return []

    # First: try filtered search by course name
    if course:
        try:
            results = collection.query(
                query_texts=[query],
                n_results=min(n, collection.count()),
                where={"course": course}
            )
            docs = results.get("documents", [[]])[0]
            if docs:
                return docs
        except Exception:
            pass  # No data for this course — fall through to full search

    # Fallback: semantic search across the full database
    results = collection.query(
        query_texts=[query],
        n_results=min(n, collection.count())
    )
    return results.get("documents", [[]])[0]


if __name__ == "__main__":
    print("AAF RAG Data Pipeline\n")
    load_csv()

    # ── Quick retrieval test ──────────────────────────────────
    print("Running retrieval test...")
    test_tips = retrieve_tips(
        query="ICS 32 environment setup sockets project",
        course="ICS 32"
    )
    if test_tips:
        print(f"Retrieval successful — {len(test_tips)} tip(s) found.")
        print("Preview of first result:")
        print(test_tips[0][:300] + "...\n")
    else:
        test_tips = retrieve_tips("how to survive a UCI CS weed-out course")
        if test_tips:
            print("Full-database retrieval successful.")
            print(test_tips[0][:300] + "...\n")
        else:
            print("No results found. Check that the CSV imported correctly.")