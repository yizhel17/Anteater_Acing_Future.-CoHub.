from fastapi import APIRouter

router = APIRouter()

COURSES: list[str] = [
    # ICS
    "ICS 10", "ICS 31", "ICS 32", "ICS 33", "ICS 45C", "ICS 45J",
    "ICS 46", "ICS 51", "ICS 53", "ICS 60",
    # CS / COMPSCI
    "COMPSCI 101", "COMPSCI 121", "COMPSCI 122A", "COMPSCI 122B",
    "COMPSCI 131", "COMPSCI 132", "COMPSCI 141", "COMPSCI 142A",
    "COMPSCI 143A", "COMPSCI 161", "COMPSCI 162", "COMPSCI 171",
    "COMPSCI 178", "COMPSCI 168",
    # MATH
    "MATH 1B", "MATH 2A", "MATH 2B", "MATH 2D", "MATH 3A", "MATH 3D",
    "MATH 13", "MATH 105A", "MATH 112A", "MATH 120A", "MATH 121A",
    "MATH 130A", "MATH 131A",
    # STATS
    "STATS 7", "STATS 67", "STATS 110", "STATS 120A", "STATS 170A",
    # PHYSICS
    "PHYSICS 3A", "PHYSICS 3B", "PHYSICS 3C", "PHYSICS 7C",
    # CHEM
    "CHEM 1A", "CHEM 1B", "CHEM 1C", "CHEM 51A", "CHEM 51B", "CHEM 107",
    # BIO SCI
    "BIO SCI 93", "BIO SCI 94", "BIO SCI 97", "BIO SCI 100", "BIO SCI 102",
    # ECON
    "ECON 13", "ECON 20A", "ECON 20B", "ECON 100A", "ECON 105A",
    # PSYCH
    "PSYCH 7A", "PSYCH 9A", "PSYCH 10A",
    # WRITING
    "WRITING 39A", "WRITING 39B", "WRITING 39C",
    # LINGUIS
    "LINGUIS 1", "LINGUIS 2", "LINGUIS 3", "LINGUIS 20",
    # LAW
    "LAW 102", "LAW 105", "LAW 108", "LAW 110", "LAW 220", "LAW 310",
    # SOCIOL
    "SOCIOL 1", "SOCIOL 2", "SOCIOL 100",
    # POL SCI
    "POL SCI 1", "POL SCI 21A", "POL SCI 51A", "POL SCI 81A",
    # HIST
    "HIST 20A", "HIST 20B", "HIST 21A",
    # PHILOS
    "PHILOS 4", "PHILOS 6", "PHILOS 11",
    # ANTHRO
    "ANTHRO 2A", "ANTHRO 2B",
    # Languages
    "SPANISH 1A", "SPANISH 1B",
    "FRENCH 1A",
    "CHINESE 1A", "CHINESE 1B",
    "JAPANESE 1A", "JAPANESE 1B",
    "KOREAN 1A", "KOREAN 1B",
    # Engineering
    "ENGR 1A",
    "CEE 20",
    "MAE 10", "MAE 30A", "MAE 80",
    "EECS 10", "EECS 12", "EECS 31", "EECS 70A",
    "BME 10",
    "CBE 10",
    "MSE 2",
    # Other
    "NEUROBI 1",
    "FILM 20A",
    "ART 10",
    "MUSIC 15",
    "PUBHLTH 1",
    "EDUC 10",
]


@router.get("")
async def list_courses() -> dict[str, list[str]]:
    return {"courses": COURSES}
