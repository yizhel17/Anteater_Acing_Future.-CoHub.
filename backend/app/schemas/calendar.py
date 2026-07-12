from pydantic import BaseModel


class CalendarUrlResponse(BaseModel):
    ics_url: str
    webcal_url: str
